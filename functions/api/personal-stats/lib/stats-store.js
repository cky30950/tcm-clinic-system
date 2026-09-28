/* ============================================================
 * 個人統計摘要：Service Account 端權威寫入
 * ------------------------------------------------------------
 * 摘要集合 personalStatisticsMonthlySummaries／狀態集合
 * personalStatisticsSummaryStates 客戶端一律不可寫（見
 * firestore.rules），所有寫入經本模組以 SA 身份繞過 Rules：
 *
 *  - syncPersonalStats()：診症新增/更新/刪除後的增量 delta，
 *    以「讀取更新時間＋commit 前置條件」做樂觀鎖，重試收斂。
 *  - rebuildPersonalStatsForOwner()：單一 owner（auth uid）的
 *    全量重建。lease（rebuildingAt）＋rebuildDirty 協議保證
 *    重建期間的增量不丟失：重建持鎖期間的 delta 放棄寫入只
 *    標 dirty，每輪重建完見 dirty 即再跑一輪直到乾淨。
 *
 * owner 身份 = Firebase Auth uid（舊版用 username，重建時顺带
 * 清理 ownerId == 舊 username 的遺留文件）。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient, normalizeDocument, jsObjectToFirestoreFields } from '../../backup/lib/firestore.js';
import herbDataRaw from '../../../../data/herbLibrary.json';
import formulaDataRaw from '../../../../data/herbformulaLibrary.json';

export const PERSONAL_STATS_SUMMARY_VERSION = 1;
const SUMMARY_COLLECTION = 'personalStatisticsMonthlySummaries';
const STATE_COLLECTION = 'personalStatisticsSummaryStates';

// 重建租約時長：異常中斷後最久鎖 10 分鐘，之後可被他人接管
const REBUILD_LEASE_MS = 10 * 60 * 1000;
const COMMIT_BATCH_SIZE = 400;
const DELTA_MAX_ATTEMPTS = 5;
const REBUILD_MAX_PASSES = 5;

const herbList = Array.isArray(herbDataRaw && herbDataRaw.herbLibrary) ? herbDataRaw.herbLibrary : [];
const formulaList = Array.isArray(formulaDataRaw && formulaDataRaw.herbLibrary) ? formulaDataRaw.herbLibrary : [];

// 名稱正規化：全形轉半形、統一空白，降低「全形括號／多空白」
// 造成的同名分裂（幻影條目）
function normalizeLookupName(value) {
    const raw = normStr(value);
    if (!raw) return '';
    let s = raw;
    try {
        s = s.normalize('NFKC');
    } catch (_e) {}
    return s.replace(/\s+/g, ' ').trim();
}

const FORMULA_NAMES = new Set(
    [...herbList, ...formulaList]
        .filter((i) => i && i.type === 'formula' && i.name)
        .map((i) => normalizeLookupName(i.name))
);

// users username/docId → auth uid 映射的 isolate 內快取
let userMapCache = { at: 0, byUsername: new Map() };
const USER_MAP_TTL_MS = 60 * 1000;

// clinics 診所名（中／英）→ clinicId 映射，補救舊診症缺 clinicId
let clinicMapCache = { at: 0, byName: new Map() };
const CLINIC_MAP_TTL_MS = 60 * 1000;

async function getDb(env) {
    const auth = await getAccessToken(env);
    return new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || '');
}

function normStr(value) {
    if (value === undefined || value === null) return '';
    try {
        return String(value).trim();
    } catch (_e) {
        return '';
    }
}

// 與前端 parseConsultationDate 等價（只涵蓋統計用到的形態）
function parseDate(value) {
    if (!value) return null;
    try {
        if (typeof value.toDate === 'function') {
            const d = value.toDate();
            return isNaN(d.getTime()) ? null : d;
        }
        if (typeof value === 'object' && value.seconds !== undefined) {
            const ms = Number(value.seconds) * 1000
                + Math.round((Number(value.nanoseconds) || 0) / 1e6);
            const d = new Date(ms);
            return isNaN(d.getTime()) ? null : d;
        }
        if (typeof value === 'string') {
            const s = value.trim();
            const m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
            if (m) {
                const d = new Date(
                    parseInt(m[1], 10),
                    parseInt(m[2], 10) - 1,
                    parseInt(m[3], 10),
                    m[4] ? parseInt(m[4], 10) : 0,
                    m[5] ? parseInt(m[5], 10) : 0,
                    m[6] ? parseInt(m[6], 10) : 0
                );
                if (!isNaN(d.getTime())) return d;
            }
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        if (typeof value === 'number') {
            const d = new Date(value);
            if (!isNaN(d.getTime())) return d;
        }
    } catch (_e) {}
    return null;
}

function getMonthKey(value) {
    const d = parseDate(value);
    if (!d) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
}

// 舊診症可能只有 clinicName 沒有 clinicId：以診所中／英文名反查
// clinics 集合，命中則歸戶到正式且穩定的 clinicId（診所改名不換 id），
// 避免「name:診所名」bucket 在改名後永遠脫離篩選。
async function getClinicNameIdMap(db) {
    const now = Date.now();
    if (clinicMapCache.byName.size && now - clinicMapCache.at < CLINIC_MAP_TTL_MS) {
        return clinicMapCache.byName;
    }
    const byName = new Map();
    let cursor = null;
    do {
        const res = await db.queryCollection({
            collectionId: 'clinics',
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            startAt: cursor,
            limit: 300
        });
        for (const doc of res.docs) {
            const id = normStr(doc.id);
            if (!id || id === 'local-default') continue;
            const chineseName = normStr(doc.data && doc.data.chineseName);
            const englishName = normStr(doc.data && doc.data.englishName);
            if (chineseName) byName.set(chineseName, id);
            if (englishName) byName.set(englishName, id);
        }
        cursor = res.docs.length === 300 ? res.nextCursor : null;
    } while (cursor);
    clinicMapCache = { at: now, byName };
    return byName;
}

async function resolveClinicIdentity(db, source) {
    let clinicId = source && source.clinicId !== undefined && source.clinicId !== null
        ? normStr(source.clinicId)
        : '';
    const clinicName = normStr(source && source.clinicName);
    // local-default 是有意義的偽 id（未選診所），不做反查
    if (!clinicId && clinicName) {
        const byName = await getClinicNameIdMap(db);
        const matched = byName.get(clinicName);
        if (matched) clinicId = matched;
    }
    const clinicKey = clinicId || (clinicName ? `name:${clinicName}` : 'no-clinic');
    return { clinicId: clinicId || null, clinicName, clinicKey };
}

function getDocId(ownerUid, monthKey, clinicKey) {
    return [ownerUid, monthKey, clinicKey]
        .map((v) => encodeURIComponent(normStr(v)))
        .join('__');
}

// ---- 處方解析 -------------------------------------------------
// 新診症帶有結構化欄位（multiPrescriptions／prescriptionStructured），
// 每個 item 自帶 type: 'herb' | 'formula'，分類不再依賴與藥庫的全名
// 比對；只有舊診症才退回純文字行解析（名稱經 NFKC 正規化）。
function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return null;
    const s = value.trim();
    if (!s) return null;
    try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : null;
    } catch (_e) {
        return null;
    }
}

function parsePrescriptionCountsFromText(prescriptionText) {
    const herbCounts = {};
    const formulaCounts = {};
    const raw = normStr(prescriptionText);
    if (!raw) return { herbCounts, formulaCounts };
    for (const originalLine of raw.split('\n')) {
        const line = normStr(originalLine);
        if (!line) continue;
        const matched = line.match(/^([^0-9\s\(\)\.]+)/);
        const rawName = matched ? normStr(matched[1]) : normStr(line.split(/[\d\s]/)[0]);
        const name = normalizeLookupName(rawName);
        if (!name) continue;
        if (FORMULA_NAMES.has(name)) {
            formulaCounts[name] = (formulaCounts[name] || 0) + 1;
        } else {
            herbCounts[name] = (herbCounts[name] || 0) + 1;
        }
    }
    return { herbCounts, formulaCounts };
}

function extractPrescriptionCounts(record) {
    const herbCounts = {};
    const formulaCounts = {};
    const addItem = (item) => {
        const name = normalizeLookupName(item && item.name);
        if (!name) return;
        const type = normStr(item && item.type).toLowerCase();
        const isFormula = type === 'formula'
            || (type !== 'herb' && FORMULA_NAMES.has(name));
        if (isFormula) {
            formulaCounts[name] = (formulaCounts[name] || 0) + 1;
        } else {
            herbCounts[name] = (herbCounts[name] || 0) + 1;
        }
    };

    // 1) 多處方完整結構：[{ name, items: [{ type, name, ... }] }]
    //    注意：空陣列視同「無結構資料」（與病歷編輯器的回退行為一致），
    //    繼續嘗試 prescriptionStructured 與純文字。
    const sections = parseJsonArray(record && record.multiPrescriptions);
    if (sections) {
        let structuredItemCount = 0;
        sections.forEach((section) => {
            const items = section && Array.isArray(section.items) ? section.items : [];
            structuredItemCount += items.length;
            items.forEach(addItem);
        });
        if (structuredItemCount > 0) return { herbCounts, formulaCounts };
    }

    // 2) 單處方結構：[{ type, name, ... }]
    const flatItems = parseJsonArray(record && record.prescriptionStructured);
    if (flatItems && flatItems.length) {
        flatItems.forEach(addItem);
        return { herbCounts, formulaCounts };
    }

    // 3) 舊診症純文字
    return parsePrescriptionCountsFromText((record && record.prescription) || '');
}

// ---- 穴位解析 -------------------------------------------------
// innerHTML 序列化時屬性值內的引號會被寫成 &quot;，比對前需解碼，
// 否則含引號的穴位名永遠對不上圖鑑。
function decodeHtmlAttributeEntities(value) {
    return String(value)
        .replace(/&#x27;/gi, "'")
        .replace(/&#39;/g, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&#x22;/gi, '"')
        .replace(/&#34;/g, '"')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&');
}

function parseAcupointCountsFromHtml(html) {
    const acupointCounts = {};
    const raw = normStr(html);
    if (!raw) return acupointCounts;
    const re = /data-acupoint-name\s*=\s*["']([^"']*)["']/g;
    let match;
    while ((match = re.exec(raw)) !== null) {
        const name = normStr(decodeHtmlAttributeEntities(match[1]));
        if (name) acupointCounts[name] = (acupointCounts[name] || 0) + 1;
    }
    return acupointCounts;
}

function extractAcupointCounts(record) {
    // 結構化陣列（存診症時由穴位方塊彙整）：['合谷', '太衝', ...]
    const structured = parseJsonArray(record && record.acupointsStructured);
    if (structured) {
        const acupointCounts = {};
        structured.forEach((item) => {
            // 容錯：也接受 [{ name }] 形態
            const name = normStr(item && typeof item === 'object' ? item.name : item);
            if (name) acupointCounts[name] = (acupointCounts[name] || 0) + 1;
        });
        return acupointCounts;
    }
    return parseAcupointCountsFromHtml((record && record.acupunctureNotes) || '');
}

function normalizeCountMap(source) {
    const out = {};
    if (!source || typeof source !== 'object') return out;
    for (const [name, count] of Object.entries(source)) {
        const key = normStr(name);
        const num = Number(count) || 0;
        if (key && num > 0) out[key] = Math.round(num);
    }
    return out;
}

function entriesToMap(entries) {
    const out = {};
    if (!Array.isArray(entries)) return out;
    for (const entry of entries) {
        const name = normStr(entry && entry.name);
        const count = Math.round(Number(entry && entry.count) || 0);
        if (name && count > 0) out[name] = count;
    }
    return out;
}

function mapToEntries(map) {
    return Object.entries(normalizeCountMap(map))
        .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0], 'zh-Hant')))
        .map(([name, count]) => ({ name, count }));
}

function applyDelta(target, deltaMap) {
    const base = target && typeof target === 'object' ? target : {};
    for (const [name, delta] of Object.entries(deltaMap || {})) {
        const key = normStr(name);
        if (!key) continue;
        const next = Math.round((Number(base[key]) || 0) + (Number(delta) || 0));
        if (next > 0) base[key] = next;
        else delete base[key];
    }
    return base;
}

function getOwnerUsernames(source) {
    const set = new Set();
    for (const value of [source && source.doctor, source && source.createdBy]) {
        const v = normStr(value);
        if (v) set.add(v);
    }
    return Array.from(set);
}

// 單筆診症對「單一 owner」的貢獻（owners 先在外層過濾）
async function buildContribution(db, source, ownerUid) {
    const record = source && typeof source === 'object' ? source : null;
    if (!record || !ownerUid) return null;
    const status = normStr(record.status || 'completed');
    if (status && status !== 'completed') return null;
    const monthKey = getMonthKey(record.date || record.createdAt || record.updatedAt || null);
    if (!monthKey) return null;
    const usernames = getOwnerUsernames(record);
    if (!usernames.length) return null;
    const { clinicId, clinicName, clinicKey } = await resolveClinicIdentity(db, record);
    // local-default 為未選診所的本機兜底值，個人統計不計入（前端亦不顯示）
    if (normStr(clinicId) === 'local-default') return null;
    const prescription = extractPrescriptionCounts(record);
    return {
        ownerUid,
        monthKey,
        clinicId,
        clinicName,
        clinicKey,
        herbCounts: normalizeCountMap(prescription.herbCounts),
        formulaCounts: normalizeCountMap(prescription.formulaCounts),
        acupointCounts: normalizeCountMap(extractAcupointCounts(record)),
        totalConsultations: 1
    };
}

function appendChange(bucketMap, contribution, sign) {
    if (!bucketMap || !contribution) return;
    const docId = getDocId(contribution.ownerUid, contribution.monthKey, contribution.clinicKey);
    if (!bucketMap.has(docId)) {
        bucketMap.set(docId, {
            docId,
            ownerUid: contribution.ownerUid,
            monthKey: contribution.monthKey,
            clinicId: contribution.clinicId,
            clinicName: contribution.clinicName,
            clinicKey: contribution.clinicKey,
            herbCounts: {},
            formulaCounts: {},
            acupointCounts: {},
            totalConsultations: 0
        });
    }
    const bucket = bucketMap.get(docId);
    for (const key of ['herbCounts', 'formulaCounts', 'acupointCounts']) {
        for (const [name, count] of Object.entries(contribution[key] || {})) {
            bucket[key][name] = (bucket[key][name] || 0) + (Number(count) || 0) * sign;
        }
    }
    bucket.totalConsultations += (Number(contribution.totalConsultations) || 0) * sign;
}

function isRetriableConflict(error) {
    const code = String((error && error.code) || '').toUpperCase();
    return code === 'FAILED_PRECONDITION' || code === 'ABORTED';
}

/* ------------------------------------------------------------
 * Firestore v1 REST 底層：帶更新時間的讀取與 commit
 * ---------------------------------------------------------- */

async function rawGetDocument(db, docPath) {
    const url = `${db.documentsPath()}/${docPath}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${db.token}` } });
    if (res.status === 404) return { exists: false, updateTime: null, data: {}, name: url };
    const text = await res.text();
    if (!res.ok) {
        const error = new Error(`讀取 ${docPath} 失敗 (HTTP ${res.status}): ${text.slice(0, 200)}`);
        error.status = res.status;
        throw error;
    }
    const doc = text ? JSON.parse(text) : {};
    const normalized = normalizeDocument(doc);
    const rebuildingRaw = doc.fields && doc.fields.rebuildingAt && doc.fields.rebuildingAt.timestampValue;
    normalized.data.rebuildingAtMs = rebuildingRaw ? Date.parse(rebuildingRaw) : 0;
    return {
        exists: true,
        updateTime: doc.updateTime || null,
        data: normalized.data,
        name: doc.name || url
    };
}

async function commitWrites(db, writes) {
    if (!writes.length) return;
    const res = await fetch(`${db.documentsPath()}:commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${db.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes })
    });
    if (!res.ok) {
        const text = await res.text();
        let code = 'COMMIT_FAILED';
        let message = text.slice(0, 300);
        try {
            const payload = JSON.parse(text);
            if (payload && payload.error) {
                if (payload.error.status) code = payload.error.status;
                if (payload.error.message) message = payload.error.message;
            }
        } catch (_e) {}
        const error = new Error(`統計寫入失敗 (HTTP ${res.status}): ${message}`);
        error.status = res.status;
        error.code = String(code).toUpperCase();
        throw error;
    }
}

function fullReplaceWrite(db, docPath, fields, precondition) {
    const write = {
        update: { name: `${db.documentsPath()}/${docPath}`, fields: jsObjectToFirestoreFields(fields) }
    };
    if (precondition) write.currentDocument = precondition;
    return write;
}

function mergeWrite(db, docPath, fields, precondition) {
    const write = {
        update: {
            name: `${db.documentsPath()}/${docPath}`,
            fields: jsObjectToFirestoreFields(fields),
            updateMask: { fieldPaths: Object.keys(fields) }
        }
    };
    if (precondition) write.currentDocument = precondition;
    return write;
}

function preconditionOf(raw) {
    return raw.exists && raw.updateTime
        ? { updateTime: raw.updateTime }
        : { exists: false };
}

async function commitInBatches(db, writes) {
    for (let i = 0; i < writes.length; i += COMMIT_BATCH_SIZE) {
        await commitWrites(db, writes.slice(i, i + COMMIT_BATCH_SIZE));
    }
}

/* ------------------------------------------------------------
 * username → auth uid 映射
 * ---------------------------------------------------------- */

async function getUsernameUidMap(db) {
    const now = Date.now();
    if (userMapCache.byUsername.size && now - userMapCache.at < USER_MAP_TTL_MS) {
        return userMapCache.byUsername;
    }
    const byUsername = new Map();
    let cursor = null;
    do {
        const res = await db.queryCollection({
            collectionId: 'users',
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            startAt: cursor,
            limit: 300
        });
        for (const doc of res.docs) {
            const uid = normStr(doc.data && doc.data.uid);
            if (!uid) continue;
            const username = normStr(doc.data && doc.data.username);
            if (username) byUsername.set(username, uid);
            if (doc.id) byUsername.set(String(doc.id), uid);
        }
        cursor = res.docs.length === 300 ? res.nextCursor : null;
    } while (cursor);
    userMapCache = { at: now, byUsername };
    return byUsername;
}

/* ------------------------------------------------------------
 * 增量同步
 * ---------------------------------------------------------- */

async function applyOwnerDelta(db, ownerUid, changes) {
    const statePath = `${STATE_COLLECTION}/${encodeURIComponent(ownerUid)}`;
    const docIds = Array.from(changes.keys());

    for (let attempt = 0; attempt < DELTA_MAX_ATTEMPTS; attempt++) {
        const state = await rawGetDocument(db, statePath);
        const leaseActive = state.data.rebuildingAtMs
            && state.data.rebuildingBy
            && (Date.now() - state.data.rebuildingAtMs) < REBUILD_LEASE_MS;
        if (leaseActive) {
            // 重建持鎖：放棄本次寫入，只標 dirty，重建跑完見 dirty 會再補一輪
            await commitWrites(db, [
                mergeWrite(db, statePath, { rebuildDirty: true }, null)
            ]).catch(() => {});
            return { deferred: true };
        }

        const writes = [];
        for (const docId of docIds) {
            const change = changes.get(docId);
            // docId 內部已由 getDocId 做過 encodeURIComponent，不可再編碼
            const docPath = `${SUMMARY_COLLECTION}/${docId}`;
            const raw = await rawGetDocument(db, docPath);
            const herbMap = entriesToMap(raw.data.herbEntries);
            const formulaMap = entriesToMap(raw.data.formulaEntries);
            const acupointMap = entriesToMap(raw.data.acupointEntries);
            applyDelta(herbMap, change.herbCounts);
            applyDelta(formulaMap, change.formulaCounts);
            applyDelta(acupointMap, change.acupointCounts);
            const totalConsultations = Math.max(
                0,
                Math.round((Number(raw.data.totalConsultations) || 0) + (Number(change.totalConsultations) || 0))
            );
            const hasEntries = Object.keys(herbMap).length
                + Object.keys(formulaMap).length
                + Object.keys(acupointMap).length > 0;

            if (!hasEntries && totalConsultations <= 0) {
                if (raw.exists) {
                    writes.push({ delete: `${db.documentsPath()}/${docPath}` });
                }
                continue;
            }
            const now = new Date();
            writes.push(fullReplaceWrite(db, docPath, {
                ownerId: ownerUid,
                monthKey: change.monthKey,
                clinicId: change.clinicId,
                clinicName: change.clinicName || '',
                clinicKey: change.clinicKey,
                totalConsultations,
                herbEntries: mapToEntries(herbMap),
                formulaEntries: mapToEntries(formulaMap),
                acupointEntries: mapToEntries(acupointMap),
                summaryVersion: PERSONAL_STATS_SUMMARY_VERSION,
                syncedAt: now,
                updatedAt: now
            }, preconditionOf(raw)));
        }

        // 狀態文件觸點：作為重建租約的衝突哨——重建一旦在我們讀取後
        // 取鎖，此寫入的前置條件必失敗，重試時就會看到租約改走 dirty。
        writes.push(mergeWrite(db, statePath, { lastDeltaAt: new Date() }, preconditionOf(state)));

        try {
            await commitWrites(db, writes);
            return { deferred: false, attempts: attempt + 1 };
        } catch (error) {
            if (!isRetriableConflict(error) || attempt === DELTA_MAX_ATTEMPTS - 1) throw error;
        }
    }
    return { deferred: false };
}

/**
 * 診症新增/更新/刪除後的增量同步。
 * beforeRecord／afterRecord 由客戶端提供（僅影響統計，SA 不直接
 * 對診症內容做其他寫入）。
 */
export async function syncPersonalStats(env, callerUid, beforeRecord, afterRecord) {
    if (!callerUid) throw Object.assign(new Error('缺少 caller uid'), { status: 400 });
    const db = await getDb(env);
    const uidByUsername = await getUsernameUidMap(db);

    // ownerUid → bucket changes
    const byOwner = new Map();
    const addRecord = async (record, sign) => {
        if (!record || typeof record !== 'object') return;
        const usernames = getOwnerUsernames(record);
        for (const username of usernames) {
            const ownerUid = uidByUsername.get(username);
            if (!ownerUid) continue;
            const contribution = await buildContribution(db, record, ownerUid);
            if (!contribution) continue;
            if (!byOwner.has(ownerUid)) byOwner.set(ownerUid, new Map());
            appendChange(byOwner.get(ownerUid), contribution, sign);
        }
    };
    await addRecord(beforeRecord, -1);
    await addRecord(afterRecord, 1);

    const results = [];
    for (const [ownerUid, changes] of byOwner.entries()) {
        if (!changes.size) continue;
        results.push({ ownerUid, ...(await applyOwnerDelta(db, ownerUid, changes)) });
    }
    return { success: true, changedOwnerCount: byOwner.size, results };
}

/* ------------------------------------------------------------
 * 全量重建（含租約／dirty／舊身份清理）
 * ---------------------------------------------------------- */

async function acquireRebuildLease(db, ownerUid, instanceId) {
    const statePath = `${STATE_COLLECTION}/${encodeURIComponent(ownerUid)}`;
    for (let attempt = 0; attempt < 4; attempt++) {
        const state = await rawGetDocument(db, statePath);
        const fresh = state.data.rebuildingAtMs
            && state.data.rebuildingBy !== instanceId
            && (Date.now() - state.data.rebuildingAtMs) < REBUILD_LEASE_MS;
        if (fresh) return { busy: true, state };
        try {
            await commitWrites(db, [
                mergeWrite(db, statePath, {
                    rebuildingAt: new Date(),
                    rebuildingBy: instanceId,
                    rebuildDirty: false
                }, preconditionOf(state))
            ]);
            return { busy: false, statePath };
        } catch (error) {
            if (!isRetriableConflict(error)) throw error;
        }
    }
    const error = new Error('無法取得重建鎖，請稍後重試');
    error.status = 409;
    throw error;
}

async function fetchOwnerConsultations(db, username) {
    const queries = [
        db.queryCollection({
            collectionId: 'consultations',
            where: {
                fieldFilter: {
                    field: { fieldPath: 'doctor' },
                    op: 'EQUAL',
                    value: { stringValue: username }
                }
            },
            orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }]
        }),
        db.queryCollection({
            collectionId: 'consultations',
            where: {
                fieldFilter: {
                    field: { fieldPath: 'createdBy' },
                    op: 'EQUAL',
                    value: { stringValue: username }
                }
            },
            orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }]
        })
    ];
    const all = [];
    const seen = new Set();
    for (const res of await Promise.all(queries)) {
        for (const doc of res.docs) {
            if (seen.has(doc.id)) continue;
            seen.add(doc.id);
            all.push({ id: doc.id, ...doc.data });
        }
    }
    return all;
}

async function listOwnerSummaryDocs(db, ownerKey) {
    const res = await db.queryCollection({
        collectionId: SUMMARY_COLLECTION,
        where: {
            fieldFilter: {
                field: { fieldPath: 'ownerId' },
                op: 'EQUAL',
                value: { stringValue: ownerKey }
            }
        },
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]
    });
    return res.docs;
}

async function cleanupLegacyOwnerDocs(db, ownerUid, legacyUsername, alreadyDone) {
    if (alreadyDone || !legacyUsername || legacyUsername === ownerUid) {
        return { cleaned: false };
    }
    const writes = [];
    for (const doc of await listOwnerSummaryDocs(db, legacyUsername)) {
        writes.push({ delete: doc.name });
    }
    // 舊版狀態文件 id 也是 username
    const legacyStatePath = `${STATE_COLLECTION}/${encodeURIComponent(legacyUsername)}`;
    const legacyState = await rawGetDocument(db, legacyStatePath);
    if (legacyState.exists) writes.push({ delete: legacyState.name });
    await commitInBatches(db, writes);
    return { cleaned: true, count: writes.length };
}

/**
 * 重建單一 owner（auth uid）的全部月份／診所摘要。
 * 冪等：重複呼叫只會再收斂一次。
 */
export async function rebuildPersonalStatsForOwner(env, ownerUid, username, force = false) {
    if (!ownerUid || !username) {
        throw Object.assign(new Error('缺少 owner uid 或 username'), { status: 400 });
    }
    const db = await getDb(env);
    const statePath = `${STATE_COLLECTION}/${encodeURIComponent(ownerUid)}`;

    // 已於目前版本初始化且未要求強制重建：直接短路，避免每次開頁都全量掃描
    if (!force) {
        const existing = await rawGetDocument(db, statePath);
        const version = Math.round(Number(existing.data.summaryVersion) || 0);
        const inProgress = existing.data.rebuildingAtMs
            && (Date.now() - existing.data.rebuildingAtMs) < REBUILD_LEASE_MS;
        if (existing.exists && version >= PERSONAL_STATS_SUMMARY_VERSION && !inProgress) {
            return {
                success: true,
                rebuilt: false,
                skipped: true,
                busy: false,
                sourceConsultationCount: Math.round(Number(existing.data.sourceConsultationCount) || 0),
                summaryBucketCount: Math.round(Number(existing.data.summaryBucketCount) || 0)
            };
        }
        if (inProgress) {
            return { success: true, busy: true, rebuilt: false };
        }
    }

    const instanceId = `rebuild:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

    const lease = await acquireRebuildLease(db, ownerUid, instanceId);
    if (lease.busy) {
        return { success: true, busy: true, rebuilt: false };
    }

    // 舊身份文件只清一次（成功與否都記錄，避免失敗時反覆大量刪除查詢）
    const preState = await rawGetDocument(db, statePath);
    let legacyCleaned = false;
    try {
        const cleanup = await cleanupLegacyOwnerDocs(
            db, ownerUid, username,
            preState.data.legacyCleanedUsername === username
        );
        legacyCleaned = !!cleanup.cleaned;
    } catch (error) {
        console.warn('清理舊版個人統計文件失敗:', error && error.message);
    }

    let payloads = [];
    let recordCount = 0;
    try {
        for (let pass = 0; pass < REBUILD_MAX_PASSES; pass++) {
            const records = await fetchOwnerConsultations(db, username);
            recordCount = records.length;
            const bucketMap = new Map();
            for (const record of records) {
                // 只歸入呼叫者本人的 owner；其他醫師份由各自重建處理
                if (!getOwnerUsernames(record).includes(username)) continue;
                const contribution = await buildContribution(db, record, ownerUid);
                if (contribution) appendChange(bucketMap, contribution, 1);
            }
            const now = new Date();
            payloads = Array.from(bucketMap.values()).map((b) => ({
                docId: b.docId,
                fields: {
                    ownerId: b.ownerUid,
                    monthKey: b.monthKey,
                    clinicId: b.clinicId,
                    clinicName: b.clinicName || '',
                    clinicKey: b.clinicKey,
                    totalConsultations: Math.max(0, Math.round(Number(b.totalConsultations) || 0)),
                    herbEntries: mapToEntries(b.herbCounts),
                    formulaEntries: mapToEntries(b.formulaCounts),
                    acupointEntries: mapToEntries(b.acupointCounts),
                    summaryVersion: PERSONAL_STATS_SUMMARY_VERSION,
                    syncedAt: now,
                    updatedAt: now
                }
            }));

            // 先列舊文件，再整批取代
            const existing = await listOwnerSummaryDocs(db, ownerUid);
            const keepIds = new Set(payloads.map((p) => p.docId));
            const writes = [];
            for (const doc of existing) {
                if (!keepIds.has(doc.id)) writes.push({ delete: doc.name });
            }
            for (const p of payloads) {
                // docId 已編碼，直接拼接
                writes.push(fullReplaceWrite(
                    db,
                    `${SUMMARY_COLLECTION}/${p.docId}`,
                    p.fields,
                    null
                ));
            }
            await commitInBatches(db, writes);

            // 見 dirty：重建期間有增量闖入，清除旗號後再跑一輪
            const afterState = await rawGetDocument(db, statePath);
            if (afterState.data.rebuildDirty) {
                await commitWrites(db, [
                    mergeWrite(db, statePath, { rebuildDirty: false }, null)
                ]).catch(() => {});
                continue;
            }

            // 釋放租約；若釋放瞬間又有 delta 標了 dirty（前置條件衝突），
            // 重新取鎖再補一輪
            const stateFields = {
                ownerId: ownerUid,
                summaryVersion: PERSONAL_STATS_SUMMARY_VERSION,
                initializedAt: new Date(),
                updatedAt: new Date(),
                sourceConsultationCount: recordCount,
                summaryBucketCount: payloads.length,
                rebuildingAt: null,
                rebuildingBy: '',
                rebuildDirty: false,
                legacyCleanedUsername: username
            };
            try {
                await commitWrites(db, [
                    mergeWrite(db, statePath, stateFields, preconditionOf(afterState))
                ]);
                return {
                    success: true,
                    rebuilt: true,
                    busy: false,
                    passes: pass + 1,
                    sourceConsultationCount: recordCount,
                    summaryBucketCount: payloads.length,
                    legacyCleaned
                };
            } catch (error) {
                if (!isRetriableConflict(error)) throw error;
                const check = await rawGetDocument(db, statePath);
                if (check.data.rebuildDirty) {
                    await commitWrites(db, [
                        mergeWrite(db, statePath, { rebuildDirty: false }, null)
                    ]).catch(() => {});
                    continue;
                }
                // 單純釋放衝突：直接重試釋放（外層重跑下輪 for）
                await commitWrites(db, [
                    mergeWrite(db, statePath, stateFields, preconditionOf(check))
                ]);
                return {
                    success: true,
                    rebuilt: true,
                    busy: false,
                    passes: pass + 1,
                    sourceConsultationCount: recordCount,
                    summaryBucketCount: payloads.length,
                    legacyCleaned
                };
            }
        }
        throw Object.assign(new Error('重建重試次數過多，請稍後再試'), { status: 409 });
    } catch (error) {
        // 異常時主動釋放租約（清掉 rebuildingBy，保留時間戳逾時兜底）
        try {
            const cur = await rawGetDocument(db, statePath);
            if (cur.data.rebuildingBy === instanceId) {
                await commitWrites(db, [
                    mergeWrite(db, statePath, { rebuildingAt: null, rebuildingBy: '' }, null)
                ]);
            }
        } catch (_releaseErr) {}
        throw error;
    }
}
