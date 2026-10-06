/* ============================================================
 * POST /api/member/lookup（公開，無需登入、不發 SMS）
 * ------------------------------------------------------------
 * 病人輸入自己於診所登記的電話號碼（不限位數），由 Service Account
 * 代為查詢並回傳：儲值帳戶、有效套票、最近 20 筆交易。
 * 不回傳病歷、身份證等任何 PHI；病人姓名僅供本人識別記錄。
 *
 * 請求：{ phone: "91234567", turnstileToken: "..." }
 * 回應：{ patients: [{ patientId, name, account, packages, transactions }] }
 *
 * 人機驗證：turnstileToken 經 Cloudflare siteverify 以
 * TURNSTILE_SECRET_KEY（Pages Secret）驗證，必要欄位。
 *
 * 防濫用（多層）：
 *  1. Turnstile 人機驗證（必要）；
 *  2. 同 IP 每 10 分鐘最多 30 次、同電話每 10 分鐘最多 12 次
 *     （isolate 內滑動視窗，best-effort）；
 *  3. 若有綁定 RATE_LIMIT_KV，再以 KV 固定視窗做跨 isolate 把關；
 *  4. 建議同時在 Cloudflare 儀表板加 Rate Limiting 規則（最可靠）。
 * 單次查詢的 Firestore fan-out 已主動收斂（見內文 LIMIT 常數）。
 * ============================================================ */

import { getAccessToken } from '../backup/lib/google-auth.js';
import { FirestoreClient } from '../backup/lib/firestore.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { fetchUpcomingByPatient } from './appointments/lib/booking-core.js';

export const onRequestOptions = () => optionsResponse();

// ── 簡易限速（模組級，單 isolate 生效）──
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_IP = 30;       // 每 IP 每 10 分鐘
const RATE_MAX_PHONE = 12;    // 每電話每 10 分鐘（電話僅 8 位，從嚴）
const rateHitsIp = new Map();
const rateHitsPhone = new Map();

function slidingWindowHit(map, key, max) {
    const now = Date.now();
    let hits = map.get(key);
    if (!hits) {
        hits = [];
        map.set(key, hits);
    }
    while (hits.length && now - hits[0] > RATE_WINDOW_MS) hits.shift();
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
}

// 避免 Map 在單一 isolate 無限增長（機會式清理）
function gcRateMap(map) {
    if (map.size < 2000) return;
    const now = Date.now();
    Array.from(map.keys()).forEach((k) => {
        const hits = map.get(k);
        if (!hits || !hits.length || now - hits[hits.length - 1] > RATE_WINDOW_MS) {
            map.delete(k);
        }
    });
}

/**
 * KV 固定視窗限速（跨 isolate，若有 RATE_LIMIT_KV 綁定）。
 * KV 最終一致，屬寬鬆把關；異常時 fail-open，不阻斷服務。
 * @returns {Promise<boolean>} false＝已超額
 */
async function kvWindowAllow(env, bucketKey, max) {
    const kv = env && env.RATE_LIMIT_KV;
    if (!kv || typeof kv.get !== 'function') return true;
    const periodSec = 600;
    const windowIndex = Math.floor(Date.now() / 1000 / periodSec);
    const key = `mrl:${bucketKey}:${windowIndex}`;
    try {
        const raw = await kv.get(key, { cacheTtl: 0 });
        const count = raw ? (parseInt(raw, 10) || 0) : 0;
        if (count >= max) return false;
        await kv.put(key, String(count + 1), { expirationTtl: periodSec + 60 });
        return true;
    } catch (_e) {
        return true;
    }
}

// 查詢 fan-out 上限（公開匿名端點，從嚴收斂）
const LIMIT_PATIENTS_PER_VARIANT = 10;
const MAX_PATIENTS = 10;
const LIMIT_PACKAGES = 50;
const LIMIT_TRANSACTIONS = 100;   // 舊制帳戶餘額推算可能少算極早期流水；
                                  // 新制帳戶餘額以帳戶文件為準，不受影響
// 套票診所歸屬舉證用：只有透過使用歷史、錢包帳戶與近期關聯都無法判定的
// 舊套票才需要翻病歷。改用 (patientId, sortDate DESC) 既有複合索引由「最近」
// 病歷往回找（有效套票的使用記錄幾乎都在近期），每頁 100 份、單一病人最多
// 掃 200 份即停止（舊寫法由最早一頁開始翻、上限 1000 份）
const CONS_EVIDENCE_PAGE = 100;
const CONS_EVIDENCE_MAX = 200;
// 套票使用歷史（patientPackageHistory）舉證：舊套票可能從未在病歷的
// financialSummaryItems 留下 packageRecordId，但新制寫入的使用歷史帶 clinicId
const PK_HISTORY_LIMIT = 100;
// 近期病歷關聯：只取最近一頁收集病人實際就診過的診所，確保診所選擇器
// 列出全部診所（即使該診所錢包無資料）
const ASSOC_PAGE = 50;
const CLINIC_CACHE_TTL_MS = 30 * 60 * 1000;
let clinicCache = null; // { at, ids, nameMap }

// 員工表同樣跨請求快取 30 分鐘：舊流水只有 operatorName/createdBy（使用者名稱）
// 或 userAuthIndex 缺件時，以 users 文件的 clinicId 補足歸屬證據。
// 診所與員工歸屬都屬罕見變更資料，延長 TTL 可把 users 全表（300 份）＋
// clinics（50 份）的固定讀取頻率降為原來的 1/6
const STAFF_CACHE_TTL_MS = 30 * 60 * 1000;
let staffCache = null; // { at, byUid, byUsername }

async function getStaffTable(client) {
    if (staffCache && (Date.now() - staffCache.at) < STAFF_CACHE_TTL_MS) {
        return staffCache;
    }
    const page = await client.queryCollection({
        collectionId: 'users',
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: 300
    });
    const byUid = new Map();                 // 文件 ID（Auth uid）→ clinicId
    const nameVotes = new Map();             // 小寫 username → Map(cid → count)
    page.docs.forEach((d) => {
        const cid = d.data && d.data.clinicId ? String(d.data.clinicId) : '';
        if (cid) byUid.set(d.id, cid);
        const uname = d.data && d.data.username ? String(d.data.username) : '';
        const key = uname.trim().toLowerCase();
        if (!key || !cid) return;
        if (!nameVotes.has(key)) nameVotes.set(key, new Map());
        const m = nameVotes.get(key);
        m.set(cid, (m.get(cid) || 0) + 1);
    });
    // 同名員工分屬不同診所時不採用，避免錯誤歸屬
    const byUsername = new Map();
    nameVotes.forEach((m, key) => {
        if (m.size === 1) byUsername.set(key, Array.from(m.keys())[0]);
    });
    staffCache = { at: Date.now(), byUid, byUsername };
    return staffCache;
}

// 以員工表解析人員所屬診所：先比使用者名稱（唯一性保證），再比 uid
function staffClinic(staff, nameOrUid) {
    const v = String(nameOrUid || '').trim();
    if (!v || !staff) return '';
    const key = v.toLowerCase();
    return staff.byUsername.get(key) || staff.byUid.get(v) || '';
}

// 舊掛號可能無 clinicId：以「登記經手人 createdBy」（職員 username/uid）
// 歸診所；再退而求其次以應診醫師 username 所屬診所判定。
function resolveApptClinic(a, staff) {
    if (!a) return '';
    if (a.clinicId) return String(a.clinicId);
    return staffClinic(staff, a.createdBy) || staffClinic(staff, a.appointmentDoctor) || '';
}

async function getClinicTable(client) {
    if (clinicCache && (Date.now() - clinicCache.at) < CLINIC_CACHE_TTL_MS) {
        return clinicCache;
    }
    const clinicsPage = await client.queryCollection({
        collectionId: 'clinics',
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: 50
    });
    const nameMap = new Map();
    clinicsPage.docs.forEach((d) => {
        nameMap.set(d.id, {
            zh: d.data.chineseName || '',
            en: d.data.englishName || ''
        });
    });
    clinicCache = { at: Date.now(), ids: clinicsPage.docs.map((d) => d.id), nameMap };
    return clinicCache;
}

// 不限制電話位數：依病人輸入產生各種可能的登記格式。
// 職員建檔時電話可能存原值、純數字、8 位本地號或 852 開頭等寫法。
function phoneMatchVariants(raw) {
    const input = String(raw || '').trim();
    if (!input) return [];
    const variants = new Set();
    variants.add(input); // 與存檔原值比對
    const digits = input.replace(/\D/g, '');
    if (digits.length < 4) return [];
    variants.add(digits); // 純數字

    // 香港 8 位本地號與 852 開頭之間互換，並涵蓋常見含分隔的寫法
    const locals = [];
    if (digits.length === 11 && digits.indexOf('852') === 0) {
        locals.push(digits.slice(3));
    } else if (digits.length === 8) {
        locals.push(digits);
    }
    locals.forEach((l8) => {
        variants.add(l8);
        variants.add('852' + l8);
        variants.add('+852' + l8);
        variants.add(`${l8.slice(0, 4)} ${l8.slice(4)}`);
        variants.add(`+852 ${l8.slice(0, 4)} ${l8.slice(4)}`);
        variants.add(`(852) ${l8.slice(0, 4)}-${l8.slice(4)}`);
    });
    return Array.from(variants);
}

function eqFilter(fieldPath, value) {
    return {
        fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value
        }
    };
}

// 統一取出 HKT 日期字串（YYYY-MM-DD）：欄位可能為 ISO 字串或
// Firestore Timestamp（{seconds}）；專案一律以 HKT 為準。
function hktDayKey(v) {
    let ms = null;
    if (typeof v === 'string' && v) ms = Date.parse(v);
    else if (v && typeof v === 'object') {
        if (Number.isFinite(Number(v.seconds))) ms = Number(v.seconds) * 1000;
        else if (Number.isFinite(Number(v._seconds))) ms = Number(v._seconds) * 1000;
    }
    if (ms === null || Number.isNaN(ms)) return '';
    return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 套票到期日可能以 ISO 字串（現行寫法）或 Firestore Timestamp（{seconds}）儲存，
// 統一轉成毫秒；無法解析回 null。
function expiryToMs(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'object') {
        if (Number.isFinite(Number(v.seconds))) return Number(v.seconds) * 1000;
        if (Number.isFinite(Number(v._seconds))) return Number(v._seconds) * 1000;
    }
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
}

async function findPatients(client, variants) {
    // 以各種可能格式查詢再去重（公開端點，每變體從嚴取 10 筆）
    const pages = await Promise.all(
        variants.map((v) => client.queryCollection({
            collectionId: 'patients',
            where: eqFilter('phone', { stringValue: v }),
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            limit: LIMIT_PATIENTS_PER_VARIANT
        }))
    );
    const byId = new Map();
    pages.forEach((page) => {
        page.docs.forEach((d) => {
            if (!byId.has(d.id)) byId.set(d.id, d);
        });
    });
    return Array.from(byId.values()).slice(0, MAX_PATIENTS);
}

async function fetchRtdbAppointment(rtdbUrl, token, appointmentId) {
    try {
        const base = String(rtdbUrl || '').replace(/\/$/, '');
        const res = await fetch(
            `${base}/appointments/${encodeURIComponent(appointmentId)}.json`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!res.ok) return null;
        return await res.json();
    } catch (_e) {
        return null;
    }
}

// 批次（並行）讀取文件，回傳 Map(id → data)；失敗或缺件跳過。
// cap 預設不限：呼叫端掌握 ID 數量（本端點均受其他 LIMIT 約束），
// 避免「ID 有 80 個但靜默只對照 50 個」造成的歸屬錯算。
async function fetchDocMap(client, collectionId, ids, opts = {}) {
    const cap = opts.cap || 0;
    const uniq0 = Array.from(new Set((ids || []).filter(Boolean)));
    const uniq = cap > 0 ? uniq0.slice(0, cap) : uniq0;
    const docs = await Promise.all(uniq.map(async (id) => {
        try {
            const d = await client.getDocument(`${collectionId}/${encodeURIComponent(id)}`);
            return d && d.data ? [id, d.data] : null;
        } catch (_e) {
            return null;
        }
    }));
    return new Map(docs.filter(Boolean));
}

// 為「無 clinicId 的舊套票」翻閱診症記錄舉證診所。
// 游標分頁掃描（patientId == + sortDate DESC，已有複合索引），由最近病歷
// 往回找，每掃完一頁：① 從 financialSummaryItems 提取 packageRecordId→clinicId；
// ② 對使用記錄舉證失敗的套票，找「購買同日、同名套票銷售列」舉證
// （saleEvidence）。所有待舉證套票都找到（或掃到上限）即停止。
// 回傳 { pkgClinicMap, saleEvidence, scanned, truncated }。
async function fetchPackageClinicEvidence(client, patientId, missingPkgs) {
    const pkgClinicMap = new Map();
    const saleEvidence = new Map();
    if (!missingPkgs.length) {
        return { pkgClinicMap, saleEvidence, scanned: 0, truncated: false };
    }
    const byPkgId = new Map(missingPkgs.map((p) => [String(p.id), p]));
    const unresolved = new Set(byPkgId.keys());
    const orderBy = [{ field: { fieldPath: 'sortDate' }, direction: 'DESCENDING' }];
    const where = eqFilter('patientId', { stringValue: patientId });
    let cursor = null;
    let scanned = 0;
    let truncated = false;
    while (unresolved.size && scanned < CONS_EVIDENCE_MAX) {
        const pageSize = Math.min(CONS_EVIDENCE_PAGE, CONS_EVIDENCE_MAX - scanned);
        const res = await client.queryCollection({
            collectionId: 'consultations',
            where,
            orderBy,
            startAt: cursor || undefined,
            limit: pageSize,
            maxDocs: pageSize
        });
        const batch = res.docs || [];
        if (!batch.length) break;
        scanned += batch.length;
        batch.forEach((d) => {
            const c = d.data || {};
            const cid = c.clinicId ? String(c.clinicId) : '';
            if (!cid) return;
            // 同一天的日期字串（HKT，以病歷有效日期為準）
            const consDay = hktDayKey(c.date) || hktDayKey(c.sortDate);
            const items = Array.isArray(c.financialSummaryItems)
                ? c.financialSummaryItems : [];
            items.forEach((it) => {
                const pid = it && it.packageRecordId ? String(it.packageRecordId) : '';
                if (pid && unresolved.has(pid) && !pkgClinicMap.has(pid)) {
                    pkgClinicMap.set(pid, cid);
                    unresolved.delete(pid);
                }
            });
            // 購買同日、同名套票銷售列：僅在使用記錄找不到時採用
            if (consDay) {
                unresolved.forEach((pid) => {
                    if (saleEvidence.has(pid)) return;
                    const pkg = byPkgId.get(pid);
                    const purchaseDay = hktDayKey(pkg.purchasedAt);
                    if (purchaseDay !== consDay || !pkg.name) return;
                    const hasSale = items.some((it) => it
                        && String(it.category) === 'package'
                        && String(it.name || '') === String(pkg.name));
                    if (hasSale) saleEvidence.set(pid, cid);
                });
            }
        });
        // 同日銷售也舉證完成的套票不再追尋
        Array.from(unresolved).forEach((pid) => {
            if (saleEvidence.has(pid)) unresolved.delete(pid);
        });
        if (!res.truncated || !res.nextCursor) break;
        cursor = res.nextCursor;
    }
    if (unresolved.size) truncated = scanned >= CONS_EVIDENCE_MAX;
    return { pkgClinicMap, saleEvidence, scanned, truncated };
}

// 以套票使用歷史（patientPackageHistory）舉證：查病人最近 PK_HISTORY_LIMIT
// 筆記錄，從「已標 clinicId」的列提取 packageId→clinicId；同一套票若出現
// 多個不同診所（異常資料）則不採用，避免錯誤歸屬。
async function fetchPackageHistoryEvidence(client, patientId) {
    const result = new Map();
    const votes = new Map(); // packageId → Map(cid → count)
    const res = await client.queryCollection({
        collectionId: 'patientPackageHistory',
        where: eqFilter('patientId', { stringValue: patientId }),
        limit: PK_HISTORY_LIMIT,
        maxDocs: PK_HISTORY_LIMIT
    });
    (res.docs || []).forEach((d) => {
        const c = d.data || {};
        const pid = c.packageId ? String(c.packageId) : '';
        const cid = c.clinicId ? String(c.clinicId) : '';
        if (!pid || !cid) return;
        if (!votes.has(pid)) votes.set(pid, new Map());
        const m = votes.get(pid);
        m.set(cid, (m.get(cid) || 0) + 1);
    });
    votes.forEach((m, pid) => {
        if (m.size === 1) result.set(pid, Array.from(m.keys())[0]);
    });
    return result;
}

// 近期病歷關聯查詢：取病人最近 ASSOC_PAGE 份病歷，收集實際就診過的診所。
// 用 patientId＋sortDate DESC 既有複合索引。
async function fetchPatientAssociatedClinics(client, patientId) {
    const ids = new Set();
    const res = await client.queryCollection({
        collectionId: 'consultations',
        where: eqFilter('patientId', { stringValue: patientId }),
        orderBy: [{ field: { fieldPath: 'sortDate' }, direction: 'DESCENDING' }],
        limit: ASSOC_PAGE,
        maxDocs: ASSOC_PAGE
    });
    (res.docs || []).forEach((d) => {
        if (d.data && d.data.clinicId) ids.add(String(d.data.clinicId));
    });
    return ids;
}

async function buildPatientEntry(client, token, patientDoc, clinicNameMap, clinicIds, upcomingMap, staff) {
    const patientId = patientDoc.id;
    const [accountDocs, pkgPage, txPage] = await Promise.all([
        // 每診所獨立帳戶：平行讀取各診所的複合 ID 帳戶文件
        Promise.all((clinicIds || []).map(async (cid) => {
            try {
                const d = await client.getDocument(
                    `patientWalletAccounts/${
                        encodeURIComponent(`${cid}__${patientId}`)}`
                );
                return d && d.data ? [cid, d.data] : null;
            } catch (_e) {
                return null;
            }
        })),
        client.queryCollection({
            collectionId: 'patientPackages',
            where: eqFilter('patientId', { stringValue: patientId }),
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            limit: LIMIT_PACKAGES
        }),
        client.queryCollection({
            collectionId: 'patientWalletTransactions',
            where: eqFilter('patientId', { stringValue: patientId }),
            orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }],
            limit: LIMIT_TRANSACTIONS
        })
    ]);

    // ── 1. 交易 → 診所歸屬 ──
    const allTxs = txPage.docs.map((d) => d.data);
    // 新制流水自帶 clinicId，只有「舊制無 clinicId」的流水才需要額外
    // 讀診症單／RTDB 掛號來推斷診所，大幅降低公開端點的讀取放大。
    const legacyTxs = allTxs.filter((tx) => !tx.clinicId);
    const consultationIds = legacyTxs
        .map((tx) => tx.consultationId)
        .filter((id) => id);
    const appointmentIds = Array.from(new Set(legacyTxs
        .map((tx) => tx.appointmentId)
        .filter((id) => id)));

    // 舊制流水數量受 LIMIT_TRANSACTIONS 約束（≤100），ID 全數對照、
    // 不做 50 筆靜默截斷，否則交易診所歸屬會被算錯。
    // 經手人證據：operatorUid（Auth uid）→ userAuthIndex.clinicId，
    // 櫃台充值單沒有病歷／掛號連結時仍可歸診所。
    const operatorUids = Array.from(new Set(legacyTxs
        .map((tx) => tx.operatorUid)
        .filter((id) => id)));
    const rtdbUrl = await client.getRtdbUrl();
    const [consMap, apptDataList, operatorDocMap] = await Promise.all([
        fetchDocMap(client, 'consultations', consultationIds),
        Promise.all(appointmentIds.map((id) =>
            fetchRtdbAppointment(rtdbUrl, token, id))),
        fetchDocMap(client, 'userAuthIndex', operatorUids)
    ]);
    const apptMap = new Map();
    appointmentIds.forEach((id, i) => {
        if (apptDataList[i]) apptMap.set(id, apptDataList[i]);
    });
    const operatorClinicMap = new Map();
    operatorDocMap.forEach((d, uid) => {
        if (d && d.clinicId) operatorClinicMap.set(uid, String(d.clinicId));
    });
    // userAuthIndex 缺件時，退回 users 文件本身的 clinicId（doc id＝uid）
    operatorUids.forEach((uid) => {
        if (!operatorClinicMap.has(uid)) {
            const cid = staff && staff.byUid.get(uid);
            if (cid) operatorClinicMap.set(uid, cid);
        }
    });

    // 先解析舊制 topup 單：其同 idempotencyKey 的 topupBonus 照單歸同一診所
    const idemClinicMap = new Map();
    legacyTxs.forEach((tx) => {
        if (tx.type !== 'topup') return;
        let cid = (tx.consultationId && consMap.has(tx.consultationId)
            && consMap.get(tx.consultationId).clinicId)
            || (tx.appointmentId && apptMap.has(tx.appointmentId)
            && resolveApptClinic(apptMap.get(tx.appointmentId), staff))
            || (tx.operatorUid && operatorClinicMap.get(tx.operatorUid))
            || '';
        if (tx.idempotencyKey) idemClinicMap.set(tx.idempotencyKey, String(cid || ''));
    });

    function txClinicId(tx) {
        // 新制流水直接帶 clinicId，最優先
        if (tx.clinicId) return String(tx.clinicId);
        if (tx.consultationId) {
            const c = consMap.get(tx.consultationId);
            if (c && c.clinicId) return String(c.clinicId);
        }
        if (tx.appointmentId) {
            const cid = resolveApptClinic(apptMap.get(tx.appointmentId), staff);
            if (cid) return cid;
        }
        if (tx.type === 'topupBonus' && tx.idempotencyKey
            && idemClinicMap.has(tx.idempotencyKey)) {
            return idemClinicMap.get(tx.idempotencyKey);
        }
        if (tx.operatorUid && operatorClinicMap.has(tx.operatorUid)) {
            return operatorClinicMap.get(tx.operatorUid);
        }
        // 舊流水僅有 operatorName（無 uid）或 createdBy 時，以員工表補證
        const byName = staffClinic(staff, tx.operatorName)
            || staffClinic(staff, tx.createdBy);
        if (byName) return byName;
        return ''; // 無法歸屬 → 未分組
    }

    // ── 2. 套票 → 診所歸屬（記錄欄位 clinicId 為準；舊套票依多種證據推斷）──
    // 先做有效期過濾：已用罄／過期套票不會回傳，無須為它們舉證，
    // 可避免對大量歷史套票發生病歷掃描。
    const nowMs = Date.now();
    const validPkgDocs = pkgPage.docs
        .map((d) => ({ id: d.id, data: d.data }))
        .filter((p) => Number(p.data.remainingUses) > 0)
        .filter((p) => {
            if (!p.data.expiresAt) return true;
            const expMs = expiryToMs(p.data.expiresAt);
            return expMs === null ? true : expMs >= nowMs;
        });
    // 待舉證的舊套票（有效但本身無 clinicId），連同名稱與購買日期一併傳入舉證
    const missingPkgs = validPkgDocs
        .filter((p) => !p.data.clinicId)
        .map((p) => ({
            id: p.id,
            name: p.data.name || p.data.packageName || '',
            purchasedAt: p.data.purchasedAt || p.data.createdAt || ''
        }));

    // 各診所帳戶文件（餘額的權威來源）先解出，同時作為單一診所便宜舉證依據
    const accountMap = new Map(accountDocs.filter(Boolean));

    // 近期病歷關聯只在有舊資料需查證時執行，避免全為新制資料時的額外讀取。
    // 使用歷史（新制寫入帶 clinicId）與近期關聯是最便宜的舉證來源，兩者平行查；
    // 沒有舊套票時連使用歷史查詢都一併省略。
    const needAssociation = legacyTxs.length > 0 || missingPkgs.length > 0;
    const [historyEvidence, assocClinicIds] = await Promise.all([
        missingPkgs.length
            ? fetchPackageHistoryEvidence(client, patientId)
            : Promise.resolve(new Map()),
        needAssociation
            ? fetchPatientAssociatedClinics(client, patientId)
            : Promise.resolve(new Set())
    ]);

    // 便宜證據先收斂：使用歷史無法判定，且病人「有錢包帳戶或近期就診記錄」
    // 的診所恰好只有一間時，未決舊套票必屬該診所（與後續分組階段既有的
    // 單一診所兜底同語意，只是提前適用以免去病歷掃描）。
    const inferredPkgClinic = new Map();
    let scanPkgs = missingPkgs.filter((p) => !historyEvidence.has(p.id));
    if (scanPkgs.length) {
        const knownClinicIds = new Set([
            ...Array.from(accountMap.keys()).filter(Boolean),
            ...assocClinicIds
        ]);
        if (knownClinicIds.size === 1) {
            const onlyCid = Array.from(knownClinicIds)[0];
            scanPkgs.forEach((p) => inferredPkgClinic.set(p.id, onlyCid));
            scanPkgs = [];
        }
    }

    // 最後手段：以上皆無法判定者，才掃近期病歷（由最近往回、上限 200 份）
    const pkgUseMap = new Map();
    const pkgSaleMap = new Map();
    if (scanPkgs.length) {
        const evidence = await fetchPackageClinicEvidence(client, patientId, scanPkgs);
        evidence.pkgClinicMap.forEach((cid, pid) => pkgUseMap.set(pid, cid));
        evidence.saleEvidence.forEach((cid, pid) => pkgSaleMap.set(pid, cid));
    }

    // ── 3. 依證據決定有效套票的診所 ──
    const packages = validPkgDocs.map((p) => {
        // 證據優先序：記錄 clinicId > 病歷使用列 > 套票使用歷史
        // > 購買同日同名銷售列 > 單一診所推論
        const cid = p.data.clinicId
            ? String(p.data.clinicId)
            : (pkgUseMap.get(p.id)
                || historyEvidence.get(p.id)
                || pkgSaleMap.get(p.id)
                || inferredPkgClinic.get(p.id)
                || '');
        return {
            clinicId: cid || '',
            name: p.data.name || p.data.packageName || '',
            totalUses: Number(p.data.totalUses) || 0,
            remainingUses: Number(p.data.remainingUses) || 0,
            expiresAt: p.data.expiresAt || null
        };
    });

    // 會員判定（唯一權威點）：任一診所帳戶為 active 且
    // 本金＋贈送額 > 0 即為會員；frozen/closed 或零結餘均非有效會員。
    // 定義見 .trae/documents/membership_wallet_plan.md。
    let isMember = false;
    accountMap.forEach((acc) => {
        if (isMember) return;
        const st = acc && acc.status ? String(acc.status) : 'active';
        const total = (Number(acc && acc.balance) || 0)
            + (Number(acc && acc.bonusBalance) || 0);
        if (st === 'active' && total > 0) isMember = true;
    });

    // ── 4. 流水暫分組：餘額（依完整流水推算，舊制容錯）＋近期交易 ──
    const groups = new Map();
    const ensureGroup = (cid) => {
        if (!groups.has(cid)) {
            const names = clinicNameMap.get(cid);
            groups.set(cid, {
                clinicId: cid,
                clinicName: names || { zh: '', en: '' },
                derivedBalance: 0,
                derivedBonus: 0,
                packages: [],
                transactions: []
            });
        }
        return groups.get(cid);
    };

    allTxs.forEach((tx) => {
        const cid = txClinicId(tx);
        const g = ensureGroup(cid);
        switch (tx.type) {
            case 'topup':
                g.derivedBalance += Number(tx.amount) || 0;
                break;
            case 'topupBonus':
                g.derivedBonus += Number(tx.amount) || 0;
                break;
            case 'payment':
                // 付款為扣減（舊版實作誤為加項，一併導致餘額高估）
                g.derivedBalance -= Number(tx.fromBalance) || 0;
                g.derivedBonus -= Number(tx.fromBonus) || 0;
                break;
            case 'refund':
                g.derivedBalance += Number(tx.fromBalance) || 0;
                g.derivedBonus += Number(tx.fromBonus) || 0;
                break;
            case 'adjust':
                // 優先採本金/贈送拆分欄位
                if (Number.isFinite(Number(tx.deltaBalance))) {
                    g.derivedBalance += Number(tx.deltaBalance);
                    g.derivedBonus += Number(tx.deltaBonus) || 0;
                } else {
                    g.derivedBalance += Number(tx.amount) || 0;
                }
                break;
            case 'statusChange':
                // 凍結／關閉／復用不涉金額變動，餘額不變
                break;
            default:
                break;
        }
        if (g.transactions.length < 30) g.transactions.push(tx);
    });

    // 有獨立帳戶文件的診所都必須出現（即使餘額為 0、無流水）
    accountMap.forEach((acc, cid) => { ensureGroup(cid); });

    // 近期病歷證實就診過的診所也必須出現在選擇器（即使該診所無帳戶無流水）
    assocClinicIds.forEach((cid) => { ensureGroup(cid); });

    packages.forEach((p) => {
        // 從未使用而病人只有單一診所時，歸入該診所；多診所且無證據→未分組
        let cid = p.clinicId;
        if (!cid) {
            const realCids = Array.from(groups.keys()).filter((x) => x);
            if (realCids.length === 1) cid = realCids[0];
        }
        ensureGroup(cid).packages.push({
            name: p.name,
            totalUses: p.totalUses,
            remainingUses: p.remainingUses,
            expiresAt: p.expiresAt
        });
    });

    // 單一診所兜底：舊制（多診所功能上線前）流水及其掛號皆無 clinicId，
    // 直接推斷會落入「未分組」。若此病人的全部帳戶與已歸屬流水只涉及
    // 一間明確診所，這些舊資料必屬於該診所，予以併入，避免診所選擇器
    // 出現無法操作的「未分組」。
    const definiteCids = Array.from(groups.keys()).filter((x) => x);
    if (definiteCids.length === 1 && groups.has('')) {
        const target = ensureGroup(definiteCids[0]);
        const orphan = groups.get('');
        target.derivedBalance += orphan.derivedBalance;
        target.derivedBonus += orphan.derivedBonus;
        target.packages.push(...orphan.packages);
        target.transactions.push(...orphan.transactions);
        target.transactions.sort(
            (a, b) => String(b.at || '').localeCompare(String(a.at || '')));
        if (target.transactions.length > 30) {
            target.transactions.length = 30;
        }
        groups.delete('');
    }

    const round2 = (n) => Math.round(n * 100) / 100;
    const clinics = Array.from(groups.values())
        // 未分組（''）若完全無交易則不顯示；有帳戶的明確診所一律顯示
        .filter((g) => g.clinicId || g.transactions.length)
        .map((g) => {
            const acc = g.clinicId ? accountMap.get(g.clinicId) : null;
            // 有獨立帳戶→以帳戶結存為準；否則（舊制未遷移）用流水推算
            const balance = acc
                ? round2(Number(acc.balance) || 0)
                : round2(g.derivedBalance);
            const bonusBalance = acc
                ? round2(Number(acc.bonusBalance) || 0)
                : round2(g.derivedBonus);
            return {
                clinicId: g.clinicId,
                clinicName: g.clinicName,
                balance,
                bonusBalance,
                status: acc ? String(acc.status || 'active') : 'active',
                packages: g.packages,
                transactions: g.transactions
            };
        });

    // 有明確診所的排在前，未分組墊後
    clinics.sort((a, b) => (a.clinicId ? 0 : 1) - (b.clinicId ? 0 : 1));

    // 未來有效預約（lookup 時一次 range 查詢後依 patientId 分組）。
    // 只回傳非 PHI 欄位供會員端展示與取消，主訴不回傳。
    const upcoming = upcomingMap && upcomingMap.get(patientId)
        ? upcomingMap.get(patientId).map((a) => ({
            id: a.id,
            appointmentTime: a.appointmentTime,
            appointmentDoctor: a.appointmentDoctor,
            doctorName: a.doctorName || '',
            status: a.status,
            clinicId: resolveApptClinic(a, staff),
            source: a.source || ''
        }))
        : [];

    return {
        patientId,
        name: patientDoc.data.name || '',
        isMember,
        clinics,
        upcomingAppointments: upcoming
    };
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const ip = request.headers.get('CF-Connecting-IP')
            || request.headers.get('X-Forwarded-For')
            || 'unknown';
        gcRateMap(rateHitsIp);
        if (!slidingWindowHit(rateHitsIp, ip, RATE_MAX_IP)
            || !(await kvWindowAllow(env, `ip:${ip}`, RATE_MAX_IP))) {
            return jsonResponse({
                error: 'RATE_LIMITED',
                message: '查詢次數過多，請於 10 分鐘後再試'
            }, 429);
        }

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const phoneVariants = phoneMatchVariants(body && body.phone);
        if (!phoneVariants.length) {
            return jsonResponse({
                error: 'INVALID_PHONE',
                message: '請輸入於診所登記的電話號碼'
            }, 400);
        }
        // 每電話維度限速（純數字歸一）：擋「知道電話即可列舉」的掃號行為
        const phoneKey = String(body.phone || '').replace(/\D/g, '').slice(-15) || 'invalid';
        gcRateMap(rateHitsPhone);
        if (!slidingWindowHit(rateHitsPhone, phoneKey, RATE_MAX_PHONE)
            || !(await kvWindowAllow(env, `phone:${phoneKey}`, RATE_MAX_PHONE))) {
            return jsonResponse({
                error: 'RATE_LIMITED',
                message: '此電話查詢次數過多，請於 10 分鐘後再試'
            }, 429);
        }

        const token = body && body.turnstileToken ? String(body.turnstileToken) : '';
        const human = await verifyTurnstile(token, ip, env);
        if (!human) {
            return jsonResponse({
                error: 'TURNSTILE_FAILED',
                message: '人機驗證失敗，請重新勾選驗證方塊後再試'
            }, 400);
        }

        const auth = await getAccessToken(env);
        const client = new FirestoreClient(
            auth.token,
            auth.projectId,
            env.FIREBASE_RTDB_URL || ''
        );

        // 診所名稱表（id → 中英文名），跨請求快取 30 分鐘；
        // 員工表（uid/username → clinicId）同快取，供舊資料歸屬補證；
        // 同時以一次 range 查詢取回未來 30 天掛號供會員端展示
        const [clinicTable, staffTable, upcomingMap] = await Promise.all([
            getClinicTable(client),
            getStaffTable(client),
            fetchUpcomingByPatient(client, auth.token, 30)
        ]);

        const patientDocs = await findPatients(client, phoneVariants);
        const allEntries = await Promise.all(
            patientDocs.map((d) => buildPatientEntry(
                client, auth.token, d, clinicTable.nameMap, clinicTable.ids, upcomingMap, staffTable))
        );

        // 完全沒有病人記錄 → 維持原「查無病人」流程（前端顯示 errNoPatient）
        if (!allEntries.length) return jsonResponse({ patients: [] });

        // 會員端把關：病人存在但非會員（無有效儲值帳戶或零結餘）不得進入。
        // 同一電話下僅保留會員記錄；全部非會員 → 403 由前端顯示提示。
        const patients = allEntries.filter((p) => p.isMember);
        if (!patients.length) {
            return jsonResponse({
                error: 'NOT_MEMBER',
                message: '閣下尚未登記成為會員，請親臨診所開通儲值帳戶，或聯絡診所職員協助。'
            }, 403);
        }

        return jsonResponse({ patients });
    } catch (error) {
        console.error('member lookup failed:', error);
        // 明確設定錯誤（如 TURNSTILE_NOT_CONFIGURED）保留其狀態碼與使用者訊息
        if (error && error.message === 'TURNSTILE_NOT_CONFIGURED') {
            return jsonResponse({
                error: 'TURNSTILE_NOT_CONFIGURED',
                message: error.clientMessage || '人機驗證未完成設定'
            }, error.status || 500);
        }
        // 不把原始錯誤細節（可能含內部路徑/資料）回傳給客戶端，
        // 完整內容只進伺服器 log
        return jsonResponse({
            error: 'LOOKUP_FAILED',
            message: '查詢服務發生錯誤，請稍後再試'
        }, 500);
    }
}
