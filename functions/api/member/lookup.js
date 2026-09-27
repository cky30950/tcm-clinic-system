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
const LIMIT_CONSULTATIONS = 50;
const CLINIC_CACHE_TTL_MS = 5 * 60 * 1000;
let clinicCache = null; // { at, ids, nameMap }

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
async function fetchDocMap(client, collectionId, ids, opts = {}) {
    const cap = opts.cap || 50;
    const uniq = Array.from(new Set((ids || []).filter(Boolean))).slice(0, cap);
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

async function buildPatientEntry(client, token, patientDoc, clinicNameMap, clinicIds) {
    const patientId = patientDoc.id;
    const [pkgPage, txPage, consPage, accountDocs] = await Promise.all([
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
        }),
        // 病人的診症記錄：用於把套票按使用診所歸組
        client.queryCollection({
            collectionId: 'consultations',
            where: eqFilter('patientId', { stringValue: patientId }),
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            limit: LIMIT_CONSULTATIONS
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
    const appointmentIds = legacyTxs
        .map((tx) => tx.appointmentId)
        .filter((id) => id);

    const [consMap, apptDataList] = await Promise.all([
        fetchDocMap(client, 'consultations', consultationIds),
        Promise.all(Array.from(new Set(appointmentIds)).slice(0, 50)
            .map((id) => fetchRtdbAppointment(client.rtdbUrl, token, id)))
    ]);
    const apptMap = new Map();
    Array.from(new Set(appointmentIds)).slice(0, 50).forEach((id, i) => {
        if (apptDataList[i]) apptMap.set(id, apptDataList[i]);
    });

    // 先解析舊制 topup 單：其同 idempotencyKey 的 topupBonus 照單歸同一診所
    const idemClinicMap = new Map();
    legacyTxs.forEach((tx) => {
        if (tx.type !== 'topup') return;
        let cid = (tx.consultationId && consMap.has(tx.consultationId)
            && consMap.get(tx.consultationId).clinicId)
            || (tx.appointmentId && apptMap.has(tx.appointmentId)
            && apptMap.get(tx.appointmentId).clinicId)
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
            const a = apptMap.get(tx.appointmentId);
            if (a && a.clinicId) return String(a.clinicId);
        }
        if (tx.type === 'topupBonus' && tx.idempotencyKey
            && idemClinicMap.has(tx.idempotencyKey)) {
            return idemClinicMap.get(tx.idempotencyKey);
        }
        return ''; // 無法歸屬 → 未分組
    }

    // ── 2. 套票 → 診所歸屬（記錄欄位 clinicId 為準；舊套票依使用記錄推斷）──
    const pkgClinicMap = new Map();
    consPage.docs.forEach((d) => {
        const c = d.data || {};
        if (!c.clinicId) return;
        const items = Array.isArray(c.financialSummaryItems)
            ? c.financialSummaryItems : [];
        items.forEach((it) => {
            if (it && it.packageRecordId
                && !pkgClinicMap.has(String(it.packageRecordId))) {
                pkgClinicMap.set(String(it.packageRecordId), String(c.clinicId));
            }
        });
    });

    // ── 3. 僅保留有效套票並歸組 ──
    const nowMs = Date.now();
    const packages = pkgPage.docs
        .map((d) => ({ id: d.id, data: d.data }))
        .filter((p) => Number(p.data.remainingUses) > 0)
        .filter((p) => {
            if (!p.data.expiresAt) return true;
            const expMs = expiryToMs(p.data.expiresAt);
            return expMs === null ? true : expMs >= nowMs;
        })
        .map((p) => ({
            // 新制：套票記錄自帶 clinicId；舊記錄無標注時才退回使用記錄推斷
            clinicId: p.data.clinicId
                ? String(p.data.clinicId)
                : (pkgClinicMap.has(p.id) ? pkgClinicMap.get(p.id) : ''),
            name: p.data.name || p.data.packageName || '',
            totalUses: Number(p.data.totalUses) || 0,
            remainingUses: Number(p.data.remainingUses) || 0,
            expiresAt: p.data.expiresAt || null
        }));

    // 各診所帳戶文件（餘額的權威來源）
    const accountMap = new Map(accountDocs.filter(Boolean));

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
            default:
                break;
        }
        if (g.transactions.length < 30) g.transactions.push(tx);
    });

    // 有獨立帳戶文件的診所都必須出現（即使餘額為 0、無流水）
    accountMap.forEach((acc, cid) => { ensureGroup(cid); });

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

    return {
        patientId,
        name: patientDoc.data.name || '',
        clinics
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

        // 診所名稱表（id → 中英文名），跨請求快取 5 分鐘
        const clinicTable = await getClinicTable(client);

        const patientDocs = await findPatients(client, phoneVariants);
        const patients = await Promise.all(
            patientDocs.map((d) => buildPatientEntry(
                client, auth.token, d, clinicTable.nameMap, clinicTable.ids))
        );

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
        return jsonResponse({
            error: 'LOOKUP_FAILED',
            message: error && error.message ? error.message : '查詢服務發生錯誤'
        }, 500);
    }
}
