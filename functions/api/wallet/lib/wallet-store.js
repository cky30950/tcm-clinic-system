/* ============================================================
 * 會員儲值錢包：Firestore 交易核心
 * ------------------------------------------------------------
 * 所有餘額變更均以 Service Account 經 Firestore 讀寫交易完成：
 *   beginTransaction → batchGet（冪等鍵 + 帳戶）→ commit
 * 客戶端規則對錢包集合一律拒寫；本模組繞過 Rules。
 *
 * 冪等：每個操作帶 idempotencyKey，SHA-256 後對應
 *   walletIdempotency/{hash}；重複請求直接回傳原結果，
 *   病歷重複提交不會重複扣款。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import {
    FirestoreClient,
    jsObjectToFirestoreFields
} from '../../backup/lib/firestore.js';
import {
    WalletError,
    round2,
    requireMoney2,
    splitPayment,
    computeRefund,
    resolveIdempotentReplay
} from './wallet-core.js';

// 供端點與 http.js 沿用既有引用路徑（實作已移至 wallet-core.js 便於單元測試）
export { WalletError };

const FS_BASE = 'https://firestore.googleapis.com/v1';
const AUTO_ID_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// 每間診所各自獨立的儲值帳戶：
//   patientWalletAccounts/{clinicId}__{patientId}
// 流水文件則統一放在 patientWalletTransactions，以 clinicId 欄位區分。
// 用雙底線相連；程式永不需反向拆解（診所與病人 ID 皆存為文件欄位）。
const ACCOUNT_ID_SEPARATOR = '__';

export function walletAccountDocId(clinicId, patientId) {
    return `${String(clinicId)}${ACCOUNT_ID_SEPARATOR}${String(patientId)}`;
}

// 舊制帳戶文件 ID 即病人 ID（無分隔字串）
export function isLegacyAccountDocId(docId) {
    return typeof docId === 'string'
        && docId.indexOf(ACCOUNT_ID_SEPARATOR) === -1;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 充值收款方式白名單（櫃台實際收現渠道）
const TOPUP_PAYMENT_METHODS = ['cash', 'fps', 'eps', 'card', 'cheque', 'other'];

// 冪等記錄保留天數：寫入 expiresAt（建立時間 +180 天）。
// 專案使用 Spark 免費計劃，Firestore 原生 TTL 刪除需啟用計費，
// 故改由 purgeExpiredIdempotency() 以 Service Account 順手清理
//（只消耗每日免費讀／刪配額，診所用量下成本為 0）。
// 保留期需長於備份保留期（2 個月），確保還原備份後重放防護仍有效。
const WALLET_IDEMPOTENCY_TTL_DAYS = 180;

// ── 過期冪等記錄清理（免費計劃替代 TTL 政策）──
const IDEMPOTENCY_PURGE_BATCH = 100;     // 每次最多刪除筆數
const IDEMPOTENCY_PURGE_INTERVAL_MS = 24 * 3600 * 1000; // 每個 isolate 每日最多跑一次
let lastIdempotencyPurgeAt = 0;
let idempotencyPurgeInFlight = false;

function normalizePaymentMethod(raw) {
    const m = String(raw || '').trim().toLowerCase();
    return TOPUP_PAYMENT_METHODS.includes(m) ? m : 'cash';
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(String(text))
    );
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 生成 Firestore 風格 20 字 ID（機率上碰撞可忽略），
 * 供交易內建立流水文件（交易中無法用自動 ID 建立）。
 */
export function generateAutoId() {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < 20; i++) {
        out += AUTO_ID_ALPHABET[bytes[i] % AUTO_ID_ALPHABET.length];
    }
    return out;
}

// ── Firestore 原始欄位解析 ──
function rawNumber(fields, key) {
    const v = fields && fields[key];
    if (!v) return 0;
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.integerValue !== undefined) return Number(v.integerValue);
    return 0;
}
function rawString(fields, key, fallback = '') {
    const v = fields && fields[key];
    return v && v.stringValue !== undefined ? v.stringValue : fallback;
}

function operatorName(claims) {
    return String(
        (claims && (claims.name || claims.email))
        || (claims && claims.sub)
        || 'staff'
    );
}

// ── 診所會員配置 ──

function normalizeConfig(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const tiers = Array.isArray(cfg.topupBonusTiers)
        ? cfg.topupBonusTiers
            .map((t) => ({
                minAmount: round2(t && t.minAmount),
                bonus: round2(t && t.bonus)
            }))
            .filter((t) => t.minAmount > 0 && t.bonus > 0)
            .sort((a, b) => b.minAmount - a.minAmount)
        : [];
    return {
        enabled: cfg.enabled !== false,
        discountItemId: String(cfg.discountItemId || ''),
        topupBonusTiers: tiers,
        deductBonusFirst: cfg.deductBonusFirst !== false
    };
}

/**
 * 讀取診所的會員配置（clinics/{clinicId}.membershipConfig）。
 * 明確傳入 clinicId（端點已依 claims／請求解析）；
 * 完全未給時（超級管理員容錯）取第一間診所；
 * 完全無配置時回傳安全預設值。
 */
export async function getMembershipConfig(env, clinicId) {
    const auth = await getAccessToken(env);
    const client = new FirestoreClient(
        auth.token,
        auth.projectId,
        env.FIREBASE_RTDB_URL || ''
    );
    let cid = clinicId ? String(clinicId) : '';
    if (!cid) {
        const ids = await client.listClinicIds();
        cid = ids[0] || '';
    }
    let raw = null;
    if (cid) {
        const clinic = await client.getDocument(
            `clinics/${encodeURIComponent(cid)}`
        );
        raw = clinic && clinic.data
            ? clinic.data.membershipConfig
            : null;
    }
    return normalizeConfig(raw);
}

function requireClinicId(value) {
    const cid = String(value || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(cid)) {
        throw new WalletError(400, 'INVALID_CLINIC', '缺少有效的 clinicId');
    }
    return cid;
}

function calcTopupBonus(config, amount) {
    if (!config || !config.enabled) return 0;
    const hit = config.topupBonusTiers.find(
        (tier) => amount >= tier.minAmount
    );
    return hit ? hit.bonus : 0;
}

// ── 冪等交易執行器 ──

/**
 * @param {object} env
 * @param {string} idemKey 冪等鍵（必填）
 * @param {string} scope 冪等鍵前綴（診所 ID），確保同一冪等鍵跨診所互不影響
 * @param {function} resolveExtraDocs
 *   ({docsBase, projectId}) => string[] 需在交易內讀取的文件全名
 * @param {function} build
 *   ({byName: Map<string,object>, docsBase: string, projectId: string})
 *   => {writes: Array, result: object}
 * @returns {Promise<object>} result
 */
async function runIdempotentTransaction(env, idemKey, scope, resolveExtraDocs, build, fingerprint = '') {
    if (!idemKey || typeof idemKey !== 'string') {
        throw new WalletError(400, 'MISSING_IDEMPOTENCY_KEY', '缺少 idempotencyKey');
    }
    const access = await getAccessToken(env);
    const pid = access.projectId;
    // 端點用完整 URL；文件名（batchGet／commit body）必須用相對資源名，
    // 否則 Firestore 報 400「Document name "https://..."」。
    const docsUrl =
        `${FS_BASE}/projects/${pid}/databases/(default)/documents`;
    const docsBase =
        `projects/${pid}/databases/(default)/documents`;
    const headers = {
        'Authorization': `Bearer ${access.token}`,
        'Content-Type': 'application/json'
    };
    const idemName =
        `${docsBase}/walletIdempotency/${await sha256Hex(`wallet:${scope}:${idemKey}`)}`;
    // 請求指紋：同一把冪等鍵若以不同參數（金額／病人／診症單）重放，
    // 視為用戶端錯誤，回 409 而非靜默回傳第一次的結果。
    const fingerprintHash = fingerprint
        ? await sha256Hex(`fp:${scope}:${fingerprint}`)
        : '';
    const extraDocNames = typeof resolveExtraDocs === 'function'
        ? [].concat(resolveExtraDocs({ docsBase, projectId: pid }) || [])
        : [];
    const docNames = [idemName].concat(extraDocNames);

    const rollback = async (transaction) => {
        try {
            await fetch(`${docsUrl}:rollback`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ transaction })
            });
        } catch (_e) { /* 交易逾時後端自動回收 */ }
    };

    for (let attempt = 0; attempt < 3; attempt++) {
        const beginRes = await fetch(`${docsUrl}:beginTransaction`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ options: { readWrite: {} } })
        });
        if (!beginRes.ok) {
            const text = await beginRes.text();
            if (beginRes.status >= 500 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new WalletError(500, 'WALLET_TX_BEGIN_FAILED',
                `開始交易失敗 (HTTP ${beginRes.status}): ${text.slice(0, 150)}`);
        }
        const transaction = (await beginRes.json()).transaction;

        // 注意：端點為 documents:batchGet（冒號）；寫成 /batchGet 會被
        // 當成名為 batchGet 的文件路徑，body 被當 Document 解析而報 400。
        const batchRes = await fetch(`${docsUrl}:batchGet`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ documents: docNames, transaction })
        });
        if (!batchRes.ok) {
            const text = await batchRes.text();
            await rollback(transaction);
            if (batchRes.status >= 500 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new WalletError(500, 'WALLET_TX_READ_FAILED',
                `交易讀取失敗 (HTTP ${batchRes.status}): ${text.slice(0, 150)}`);
        }

        const rows = await batchRes.json();
        const byName = new Map();
        let idemFields = null;
        for (const row of Array.isArray(rows) ? rows : []) {
            const name = row && row.found
                ? row.found.name
                : (row && row.missing);
            if (name) byName.set(name, row.found ? row.found.fields || {} : null);
        }
        idemFields = byName.get(idemName);

        // 冪等命中：比對請求指紋；一致才回傳原結果，不再提交
        if (idemFields && idemFields.result) {
            await rollback(transaction);
            const replay = resolveIdempotentReplay(idemFields, fingerprintHash);
            return replay.result;
        }

        let built;
        try {
            built = await build({ byName, docsBase, projectId: pid });
        } catch (error) {
            await rollback(transaction);
            throw error;
        }

        // 冪等記錄寫在最後，內存處理結果。
        // updatedAt：備份系統增量同步用（與交易流水一致）。
        // expiresAt：Timestamp（建立日 +180 天），供 purgeExpiredIdempotency
        //   查詢並批量刪除（免費計劃不能用 Firestore 原生 TTL，其 TTL 刪除
        //   需啟用計費）；保留 180 天涵蓋重放視窗與備份還原週期（2 個月），
        //   還原備份後進行中的 pay/topup 鍵仍在，避免重複扣款／重複入帳。
        const nowDate = new Date();
        const expiresAt = new Date(nowDate.getTime()
            + WALLET_IDEMPOTENCY_TTL_DAYS * 86400000);
        const result = built.result;
        const idemWriteFields = {
            result: { stringValue: JSON.stringify(result) },
            at: { stringValue: nowDate.toISOString() },
            updatedAt: { stringValue: nowDate.toISOString() },
            expiresAt: { timestampValue: expiresAt.toISOString() }
        };
        if (fingerprintHash) idemWriteFields.fingerprint = { stringValue: fingerprintHash };
        const writes = (built.writes || []).concat([{
            update: {
                name: idemName,
                fields: idemWriteFields
            }
        }]);

        const commitRes = await fetch(`${docsUrl}:commit`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ transaction, writes })
        });
        if (!commitRes.ok) {
            const text = await commitRes.text();
            if (commitRes.status === 409 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new WalletError(500, 'WALLET_TX_COMMIT_FAILED',
                `交易提交失敗 (HTTP ${commitRes.status}): ${text.slice(0, 150)}`);
        }

        // 交易成功後順手觸發過期清理（不 await、不影響回應延遲；
        // 每個 isolate 24 小時內最多執行一次，失敗一律靜默）
        void scheduleIdempotencyPurge(env);

        return result;
    }
    throw new WalletError(500, 'WALLET_TX_BUSY', '系統忙碌中，請重試');
}

/**
 * 節流觸發過期冪等記錄清理。只在間隔到期且無其他清理進行時執行；
 * 任何錯誤都吞掉（清理失敗不應影響錢包操作）。
 */
function scheduleIdempotencyPurge(env) {
    const now = Date.now();
    if (idempotencyPurgeInFlight
        || (now - lastIdempotencyPurgeAt) < IDEMPOTENCY_PURGE_INTERVAL_MS) {
        return null;
    }
    lastIdempotencyPurgeAt = now;
    idempotencyPurgeInFlight = true;
    return purgeExpiredIdempotency(env)
        .catch((error) => {
            console.warn('清理過期冪等記錄失敗（不影響操作）:',
                error && error.message ? error.message : error);
        })
        .finally(() => { idempotencyPurgeInFlight = false; });
}

/**
 * 查詢過期的 walletIdempotency 文件並批量刪除。
 * 涵蓋兩代記錄：
 *  1. 新記錄：expiresAt（Timestamp）<= now
 *  2. 舊記錄（無 expiresAt）：at 為 ISO 字串，按字串字典序即時間序，
 *     查 at <= (now - 180 天)
 * 單欄位範圍查詢＋批次 commit delete：
 *  - 索引：兩欄位皆有 Firestore 預設單欄位索引，免建複合索引
 *  - 配額：每次 2 次查詢（僅回傳到期文件）＋N 次刪除，並由 24 小時節流
 *    限制頻率，遠低於免費計劃 5 萬讀／2 萬刪的每日配額
 * @returns {Promise<number>} 實際刪除筆數
 */
export async function purgeExpiredIdempotency(env) {
    const access = await getAccessToken(env);
    const pid = access.projectId;
    const docsUrl =
        `${FS_BASE}/projects/${pid}/databases/(default)/documents`;
    const headers = {
        'Authorization': `Bearer ${access.token}`,
        'Content-Type': 'application/json'
    };
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now()
        - WALLET_IDEMPOTENCY_TTL_DAYS * 86400000).toISOString();

    const queries = [
        {
            // 新記錄：Timestamp 欄位
            fieldPath: 'expiresAt',
            op: 'LESS_THAN_OR_EQUAL',
            value: { timestampValue: nowIso }
        },
        {
            // 舊記錄：ISO 字串欄位（字典序＝時間序）
            fieldPath: 'at',
            op: 'LESS_THAN_OR_EQUAL',
            value: { stringValue: cutoffIso }
        }
    ];

    const names = new Set();
    for (const filter of queries) {
        const queryRes = await fetch(`${docsUrl}:runQuery`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: 'walletIdempotency' }],
                    where: { fieldFilter: filter },
                    orderBy: [
                        { field: { fieldPath: filter.fieldPath }, direction: 'ASCENDING' }
                    ],
                    limit: IDEMPOTENCY_PURGE_BATCH
                }
            })
        });
        if (!queryRes.ok) {
            throw new Error(`查詢過期冪等記錄失敗 HTTP ${queryRes.status}`);
        }
        const rows = await queryRes.json();
        (Array.isArray(rows) ? rows : []).forEach((r) => {
            if (r && r.document && r.document.name) names.add(r.document.name);
        });
    }
    if (!names.size) return 0;

    const commitRes = await fetch(`${docsUrl}:commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            writes: Array.from(names).map((name) => ({ delete: name }))
        })
    });
    if (!commitRes.ok) {
        throw new Error(`批量刪除過期冪等記錄失敗 HTTP ${commitRes.status}`);
    }
    return names.size;
}

// ── 流水文件建構 ──

function baseTxRecord(patientId, clinicId, claims, key, at) {
    return {
        patientId,
        clinicId: String(clinicId),
        idempotencyKey: key,
        operatorUid: claims.sub,
        operatorName: operatorName(claims),
        at,
        // 備份系統以 updatedAt 做增量同步；交易不可變，updatedAt 即建立時間
        updatedAt: at,
        consultationId: '',
        appointmentId: '',
        note: ''
    };
}

function accountDocName(docsBase, clinicId, patientId) {
    return `${docsBase}/patientWalletAccounts/${
        encodeURIComponent(walletAccountDocId(clinicId, patientId))}`;
}

// 診症單退款累計文件（文件 ID = consultationId）：
// 於退款交易內讀寫，記錄已退款的本金/贈額，防止重複退款與超額退款。
function refundAggDocName(docsBase, consultationId) {
    return `${docsBase}/walletConsultationRefunds/${
        encodeURIComponent(consultationId)}`;
}

// ── 診所歸屬核對 ──

/**
 * 讀取診症單完整資料。病歷不存在時回傳 null。
 */
async function fetchConsultationDoc(client, consultationId) {
    const doc = await client.getDocument(
        `consultations/${encodeURIComponent(consultationId)}`
    );
    return doc && doc.data ? doc.data : null;
}

/**
 * 讀取診症單所屬診所。病歷不存在（異常場景）時回傳空字串，
 * 由呼叫端決定是否容錯（以端點解析出的 clinicId 為準）。
 */
async function fetchConsultationClinic(client, consultationId) {
    const data = await fetchConsultationDoc(client, consultationId);
    return data && data.clinicId ? String(data.clinicId) : '';
}

/**
 * 以診症單 billingItemsStructured 重算應收總額（公式與前端
 * updateBillingDisplay 完全一致）：非折扣項目 price×quantity 合計；
 * 0<price<1 的折扣項目按「可折扣小計」比例折抵，其餘（含負數）為
 * 定額折扣逐項相加。
 * @returns {number|null} 總額；無結構化資料或無法解析時回傳 null
 */
function consultationBillingTotal(consData) {
    const raw = consData && consData.billingItemsStructured;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    let items;
    try {
        items = JSON.parse(raw);
    } catch (_e) {
        return null;
    }
    if (!Array.isArray(items)) return null;
    if (!items.length) return 0;

    const hasDiscount = items.some((it) => it && it.category === 'discount');
    let subtotalAll = 0;
    let subtotalForDiscount = 0;
    items.forEach((it) => {
        if (!it || it.category === 'discount') return;
        const line = (Number(it.price) || 0) * (Number(it.quantity) || 0);
        subtotalAll += line;
        // undefined 視為可折扣（與前端一致）
        if (!hasDiscount || it.includedInDiscount !== false) {
            subtotalForDiscount += line;
        }
    });
    let total = subtotalAll;
    items.forEach((it) => {
        if (!it || it.category !== 'discount') return;
        const price = Number(it.price) || 0;
        const qty = Number(it.quantity) || 0;
        if (price > 0 && price < 1) {
            total -= subtotalForDiscount * (1 - price) * qty;
        } else {
            total += price * qty;
        }
    });
    return round2(total);
}

function newTxWrite(docsBase, record) {
    const name = `${docsBase}/patientWalletTransactions/${generateAutoId()}`;
    return {
        write: { update: { name, fields: jsObjectToFirestoreFields(record) } },
        txId: name.split('/').pop()
    };
}

// ── 操作：充值 ──

/**
 * 充值。贈送額由伺服器依該診所配置級距計算，客戶端不可指定。
 * @param {object} params {clinicId, patientId, amount, paymentMethod?,
 *   appointmentId?, note?, idempotencyKey}
 */
export async function walletTopup(env, claims, params) {
    const clinicId = requireClinicId(params.clinicId);
    const patientId = String(params.patientId);
    const amount = requireMoney2(params.amount, '充值金額');
    if (amount <= 0) {
        throw new WalletError(400, 'INVALID_AMOUNT', '充值金額必須大於 0');
    }
    const paymentMethod = normalizePaymentMethod(params.paymentMethod);
    const config = await getMembershipConfig(env, clinicId);
    const bonusAmount = config.enabled
        ? round2(calcTopupBonus(config, amount))
        : 0;

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        clinicId,
        ({ docsBase }) => [accountDocName(docsBase, clinicId, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, clinicId, patientId);
            const accFields = byName.get(name);
            const at = new Date().toISOString();
            const existed = !!accFields;
            // 已關閉帳戶拒絕充值（需先由管理員復用）；凍結帳戶可入帳，
            // 但充值不得改變其凍結狀態
            const existingStatus = existed
                ? rawString(accFields, 'status', 'active')
                : 'active';
            if (existingStatus === 'closed') {
                throw new WalletError(400, 'WALLET_CLOSED',
                    '儲值帳戶已關閉，無法充值；請先聯絡管理員復用帳戶');
            }
            const balance = round2(rawNumber(accFields, 'balance') + amount);
            const bonusBalance =
                round2(rawNumber(accFields, 'bonusBalance') + bonusAmount);

            const accountObj = {
                patientId,
                clinicId,
                status: existingStatus,
                balance,
                bonusBalance,
                currency: 'HKD',
                createdAt: existed
                    ? rawString(accFields, 'createdAt') || at
                    : at,
                createdBy: existed
                    ? rawString(accFields, 'createdBy') || operatorName(claims)
                    : operatorName(claims),
                updatedAt: at
            };

            const txRecords = [];
            const topupTx = Object.assign(
                baseTxRecord(patientId, clinicId, claims, params.idempotencyKey, at),
                {
                    type: 'topup',
                    amount,
                    appliesTo: 'balance',
                    paymentMethod,
                    balanceAfter: balance,
                    bonusBalanceAfter: bonusBalance
                }
            );
            if (params.appointmentId) topupTx.appointmentId = String(params.appointmentId);
            if (params.note) topupTx.note = String(params.note).slice(0, 300);
            txRecords.push(topupTx);

            if (bonusAmount > 0) {
                txRecords.push(Object.assign(
                    baseTxRecord(patientId, clinicId, claims, params.idempotencyKey, at),
                    {
                        type: 'topupBonus',
                        amount: bonusAmount,
                        appliesTo: 'bonus',
                        balanceAfter: balance,
                        bonusBalanceAfter: bonusBalance
                    }
                ));
            }

            const txWrites = txRecords.map((record) => newTxWrite(docsBase, record));
            const writes = [{
                update: {
                    name,
                    fields: jsObjectToFirestoreFields(accountObj)
                }
            }].concat(txWrites.map((t) => t.write));

            return {
                writes,
                result: {
                    ok: true,
                    balance,
                    bonusBalance,
                    bonusAmount,
                    paymentMethod,
                    txId: txWrites[0] ? txWrites[0].txId : ''
                }
            };
        },
        // 指紋：同鍵但金額／收款方式不同（贈額為伺服器派生，一併寫入）＝異常重放
        `topup|${patientId}|${amount}|${bonusAmount}|${paymentMethod}`
    );
}

// ── 操作：扣款（看診付款）──

/**
 * 扣款（看診付款）。
 *
 * 伺服器把關（不信任 client 傳入的鍵與金額）：
 *  1. 冪等鍵強制為 pay:{consultationId}，客戶端傳入者一律覆寫，
 *     同一診症單永遠最多只能有一筆成功的 payment；
 *  2. 診症單必須存在，病人與診所均須與扣款帳戶一致；
 *  3. 扣款金額必須與診症單 billingItemsStructured 重算的應收總額一致；
 *  4. 備份還原等導致冪等記錄缺失、但已有 payment 流水時，拒絕重複扣款。
 *
 * @param {object} params {clinicId, patientId, amount, consultationId, appointmentId?, idempotencyKey?}
 */
export async function walletPayment(env, claims, params) {
    const clinicId = requireClinicId(params.clinicId);
    const patientId = String(params.patientId);
    const amount = requireMoney2(params.amount, '付款金額');
    if (amount <= 0) {
        throw new WalletError(400, 'INVALID_AMOUNT', '付款金額必須大於 0');
    }
    const consultationId = String(params.consultationId || '');
    if (!consultationId) {
        throw new WalletError(400, 'MISSING_CONSULTATION', '缺少 consultationId');
    }
    const idemKey = `pay:${consultationId}`;

    const auth0 = await getAccessToken(env);
    const client0 = new FirestoreClient(
        auth0.token,
        auth0.projectId,
        env.FIREBASE_RTDB_URL || ''
    );

    // ── 診症單核對：存在、診所一致、病人一致、金額與帳單一致 ──
    const consData = await fetchConsultationDoc(client0, consultationId);
    if (!consData) {
        throw new WalletError(404, 'CONSULTATION_NOT_FOUND',
            '找不到診症記錄，無法扣款');
    }
    if (consData.clinicId && String(consData.clinicId) !== clinicId) {
        throw new WalletError(400, 'CLINIC_MISMATCH',
            '診症單所屬診所與儲值帳戶診所不一致，無法扣款');
    }
    if (consData.patientId && String(consData.patientId) !== patientId) {
        throw new WalletError(400, 'PATIENT_MISMATCH',
            '診症記錄的病人與儲值帳戶病人不一致，無法扣款');
    }
    const billedTotal = consultationBillingTotal(consData);
    if (billedTotal === null) {
        throw new WalletError(400, 'BILLING_TOTAL_UNAVAILABLE',
            '無法讀取此診症單的收費總額，請重新打開並儲存病歷後再以儲值扣款');
    }
    if (round2(billedTotal) !== amount) {
        throw new WalletError(400, 'AMOUNT_MISMATCH',
            `扣款金額 HK$${amount.toFixed(2)} 與診症單應收`
            + ` HK$${round2(billedTotal).toFixed(2)} 不一致，請重新整理後再試`);
    }

    // ── 防重複扣款：僅在冪等記錄不存在時檢查歷史 payment 流水 ──
    // 正常重送會在下方交易內直接命中冪等記錄回原結果，不會走到這裡。
    // 此檢查主要覆蓋「備份還原不含 walletIdempotency」等異常場景。
    const priorIdem = await client0.getDocument(
        `walletIdempotency/${await sha256Hex(`wallet:${clinicId}:${idemKey}`)}`
    );
    if (!priorIdem || !priorIdem.data || !priorIdem.data.result) {
        const found = await client0.queryCollection({
            collectionId: 'patientWalletTransactions',
            where: {
                fieldFilter: {
                    field: { fieldPath: 'consultationId' },
                    op: 'EQUAL',
                    value: { stringValue: consultationId }
                }
            },
            limit: 50
        });
        const alreadyPaid = (found.docs || []).some((d) => {
            if (!d.data || d.data.type !== 'payment') return false;
            const txClinic = d.data.clinicId ? String(d.data.clinicId) : '';
            if (txClinic) return txClinic === clinicId;
            // 舊制無 clinicId 流水：診症單屬本診所（或診症單缺診所欄位）才採計
            return !consData.clinicId || String(consData.clinicId) === clinicId;
        });
        if (alreadyPaid) {
            throw new WalletError(409, 'WALLET_ALREADY_PAID',
                '此診症單已完成儲值扣款，不可重複扣款；如需退回請使用退款功能');
        }
    }

    // #12 扣款順序依診所會員配置 deductBonusFirst：
    // true（預設）先扣贈送額；false 先扣本金。配置缺失時維持歷史行為。
    const membershipConfig = await getMembershipConfig(env, clinicId);
    const deductBonusFirst = membershipConfig.deductBonusFirst !== false;

    return runIdempotentTransaction(
        env,
        idemKey,
        clinicId,
        ({ docsBase }) => [accountDocName(docsBase, clinicId, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, clinicId, patientId);
            const accFields = byName.get(name);
            if (!accFields) {
                throw new WalletError(402, 'WALLET_NOT_FOUND',
                    '病人尚未開立儲值帳戶');
            }
            const status = rawString(accFields, 'status', 'active');
            if (status !== 'active') {
                throw new WalletError(402, 'WALLET_NOT_ACTIVE',
                    `儲值帳戶已${status === 'frozen' ? '凍結' : '關閉'}，無法付款`);
            }
            // 扣款順序與餘額檢查：依診所配置 deductBonusFirst（#12，
            // UI 開關不再是裝飾品）；純邏輯見 wallet-core.js（有單元測試）
            const split = splitPayment(
                amount,
                rawNumber(accFields, 'balance'),
                rawNumber(accFields, 'bonusBalance'),
                deductBonusFirst
            );
            const {
                fromBalance,
                fromBonus,
                newBalance,
                newBonus
            } = split;
            const at = new Date().toISOString();

            const accountObj = {
                patientId,
                clinicId,
                status,
                balance: newBalance,
                bonusBalance: newBonus,
                currency: rawString(accFields, 'currency', 'HKD'),
                createdAt: rawString(accFields, 'createdAt') || at,
                createdBy: rawString(accFields, 'createdBy') || operatorName(claims),
                updatedAt: at
            };

            const appliesTo = fromBalance > 0 && fromBonus > 0
                ? 'mixed'
                : (fromBalance > 0 ? 'balance' : 'bonus');
            const txRecord = Object.assign(
                baseTxRecord(patientId, clinicId, claims, idemKey, at),
                {
                    type: 'payment',
                    amount: -amount,
                    appliesTo,
                    fromBalance,
                    fromBonus,
                    balanceAfter: newBalance,
                    bonusBalanceAfter: newBonus,
                    consultationId
                }
            );
            if (params.appointmentId) {
                txRecord.appointmentId = String(params.appointmentId);
            }
            const txBuilt = newTxWrite(docsBase, txRecord);

            return {
                writes: [
                    { update: { name, fields: jsObjectToFirestoreFields(accountObj) } },
                    txBuilt.write
                ],
                result: {
                    ok: true,
                    chargedAmount: amount,
                    balance: newBalance,
                    bonusBalance: newBonus,
                    fromBalance,
                    fromBonus,
                    txId: txBuilt.txId
                }
            };
        },
        // 指紋：同鍵（同診症單）但金額／病人不同＝異常重放
        `pay|${patientId}|${consultationId}|${amount}`
    );
}

// ── 操作：退款 ──

/**
 * 全額或部分退還某診症單的儲值付款。
 * 需管理員；按原 payment 流水的本金/贈額比例回補。
 *
 * 防超退：walletConsultationRefunds/{consultationId} 聚合文件於交易內
 * 讀取並遞增，平行退款請求在 409 重試後會重新讀到最新累計值而被正確
 * 拒絕；冪等重送則由 walletIdempotency 直接回原結果，不重複入帳。
 * 聚合文件建立前的歷史退款，首次執行時以流水查詢結果作為初始值。
 *
 * @param {object} params {clinicId, patientId, consultationId, amount?, note?, idempotencyKey}
 */
export async function walletRefund(env, claims, params) {
    const clinicId = requireClinicId(params.clinicId);
    const patientId = String(params.patientId);
    const consultationId = String(params.consultationId || '');
    if (!consultationId) {
        throw new WalletError(400, 'MISSING_CONSULTATION', '缺少 consultationId');
    }

    // 交易外查詢原付款與歷史退款流水（單欄位查詢，不需複合索引）
    const auth = await getAccessToken(env);
    const client = new FirestoreClient(
        auth.token,
        auth.projectId,
        env.FIREBASE_RTDB_URL || ''
    );

    // 診症單診所與目標帳戶診所必須一致
    const consClinic = await fetchConsultationClinic(client, consultationId);
    if (consClinic && consClinic !== clinicId) {
        throw new WalletError(400, 'CLINIC_MISMATCH',
            '診症單所屬診所與儲值帳戶診所不一致，無法退款');
    }

    const found = await client.queryCollection({
        collectionId: 'patientWalletTransactions',
        where: {
            fieldFilter: {
                field: { fieldPath: 'consultationId' },
                op: 'EQUAL',
                value: { stringValue: consultationId }
            }
        },
        limit: 50
    });
    // 只採計本診所的付款/退款流水；舊制流水（無 clinicId）僅在診症單明確
    // 屬於本診所（或診症單缺診所欄位）時採計，避免跨診所誤退。
    const sameClinicRows = found.docs.filter((d) => {
        if (!d.data) return false;
        if (d.data.type !== 'payment' && d.data.type !== 'refund') return false;
        const txClinic = d.data.clinicId ? String(d.data.clinicId) : '';
        if (txClinic) return txClinic === clinicId;
        return !consClinic || consClinic === clinicId;
    });
    const payments = sameClinicRows.filter((d) => d.data.type === 'payment');
    if (!payments.length) {
        throw new WalletError(404, 'PAYMENT_NOT_FOUND',
            '找不到此診症單於本診所的儲值付款記錄');
    }
    // 退款病人必須與原付款病人一致，防止退錯帳戶
    const mismatchedPayment = payments.find((d) =>
        d.data.patientId && String(d.data.patientId) !== patientId);
    if (mismatchedPayment) {
        throw new WalletError(400, 'PATIENT_MISMATCH',
            '退款病人與原儲值付款病人不一致，無法退款');
    }
    let paidBalance = 0;
    let paidBonus = 0;
    payments.forEach((d) => {
        paidBalance += Number(d.data.fromBalance) || 0;
        paidBonus += Number(d.data.fromBonus) || 0;
    });
    paidBalance = round2(paidBalance);
    paidBonus = round2(paidBonus);

    // 聚合文件建立前的歷史退款：作為首次建立時的初始累計值
    let seedRefundedBalance = 0;
    let seedRefundedBonus = 0;
    let seedRefundCount = 0;
    sameClinicRows.filter((d) => d.data.type === 'refund').forEach((d) => {
        seedRefundedBalance += Number(d.data.fromBalance) || 0;
        seedRefundedBonus += Number(d.data.fromBonus) || 0;
        seedRefundCount += 1;
    });
    seedRefundedBalance = round2(seedRefundedBalance);
    seedRefundedBonus = round2(seedRefundedBonus);

    // amount 未指定＝交易內按剩餘可退金額全額退
    const want = params.amount !== undefined && params.amount !== null
        ? requireMoney2(params.amount, '退款金額')
        : 0;
    if (want < 0) throw new WalletError(400, 'INVALID_AMOUNT', '退款金額必須大於 0');

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        clinicId,
        ({ docsBase }) => [
            accountDocName(docsBase, clinicId, patientId),
            refundAggDocName(docsBase, consultationId)
        ],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, clinicId, patientId);
            const accFields = byName.get(name);
            if (!accFields) {
                throw new WalletError(404, 'WALLET_NOT_FOUND', '找不到儲值帳戶');
            }
            // #17 退款會把金額回補進帳戶：凍結帳戶暫停一切收支；
            // 關閉帳戶再退款入帳會造成「已關閉卻有餘額」的矛盾狀態。
            // 管理員需先復用帳戶，退款後再重新凍結／關閉。
            const accStatus = rawString(accFields, 'status', 'active');
            if (accStatus !== 'active') {
                throw new WalletError(409, 'WALLET_NOT_ACTIVE',
                    `儲值帳戶已${accStatus === 'frozen' ? '凍結' : '關閉'}，`
                    + '無法退款入帳；請先復用帳戶後再辦理退款');
            }

            // ── 已退款累計（聚合文件為權威來源；缺件時以歷史流水種子）──
            const aggName = refundAggDocName(docsBase, consultationId);
            const aggFields = byName.get(aggName);
            let alreadyBalance;
            let alreadyBonus;
            let refundCount;
            if (aggFields) {
                // 防護：聚合文件必須屬於同一病人與診所
                const aggPatient = rawString(aggFields, 'patientId');
                const aggClinic = rawString(aggFields, 'clinicId');
                if ((aggPatient && aggPatient !== patientId)
                    || (aggClinic && aggClinic !== clinicId)) {
                    throw new WalletError(400, 'REFUND_STATE_MISMATCH',
                        '退款記錄與原付款的病人或診所不一致，無法退款');
                }
                alreadyBalance = round2(rawNumber(aggFields, 'refundedBalance'));
                alreadyBonus = round2(rawNumber(aggFields, 'refundedBonus'));
                refundCount = Number(rawNumber(aggFields, 'refundCount')) || 0;
            } else {
                alreadyBalance = seedRefundedBalance;
                alreadyBonus = seedRefundedBonus;
                refundCount = seedRefundCount;
            }
            // 累計上限把關＋按原付款比例拆分（純邏輯見 wallet-core.js，
            // 有多次部分退款捨入夾緊的單元測試）
            const refundPlan = computeRefund({
                paidBalance,
                paidBonus,
                alreadyBalance,
                alreadyBonus,
                want: want > 0 ? want : undefined
            });
            const {
                refundWant,
                refundBalance,
                refundBonus,
                newRefundedBalance,
                newRefundedBonus,
                totalRefunded
            } = refundPlan;

            const newBalance = round2(rawNumber(accFields, 'balance') + refundBalance);
            const newBonus = round2(rawNumber(accFields, 'bonusBalance') + refundBonus);
            const at = new Date().toISOString();

            const accountObj = {
                patientId,
                clinicId,
                status: accStatus,
                balance: newBalance,
                bonusBalance: newBonus,
                currency: rawString(accFields, 'currency', 'HKD'),
                createdAt: rawString(accFields, 'createdAt') || at,
                createdBy: rawString(accFields, 'createdBy') || operatorName(claims),
                updatedAt: at
            };

            const txRecord = Object.assign(
                baseTxRecord(patientId, clinicId, claims, params.idempotencyKey, at),
                {
                    type: 'refund',
                    amount: refundWant,
                    appliesTo: refundBalance > 0 && refundBonus > 0
                        ? 'mixed'
                        : (refundBalance > 0 ? 'balance' : 'bonus'),
                    fromBalance: refundBalance,
                    fromBonus: refundBonus,
                    balanceAfter: newBalance,
                    bonusBalanceAfter: newBonus,
                    consultationId
                }
            );
            if (params.note) txRecord.note = String(params.note).slice(0, 300);
            const txBuilt = newTxWrite(docsBase, txRecord);

            // 退款累計聚合文件（REST commit 的 update 寫入具 upsert 語意，
            // 文件不存在時會自動建立），與帳戶/流水同交易提交
            const aggObj = {
                consultationId,
                clinicId,
                patientId,
                refundedBalance: newRefundedBalance,
                refundedBonus: newRefundedBonus,
                refundCount: refundCount + 1,
                updatedAt: at
            };

            return {
                writes: [
                    { update: { name, fields: jsObjectToFirestoreFields(accountObj) } },
                    txBuilt.write,
                    { update: { name: aggName, fields: jsObjectToFirestoreFields(aggObj) } }
                ],
                result: {
                    ok: true,
                    balance: newBalance,
                    bonusBalance: newBonus,
                    refundedBalance: refundBalance,
                    refundedBonus: refundBonus,
                    totalRefunded,
                    txId: txBuilt.txId
                }
            };
        },
        // 指紋：want=0 代表全額退（交易內按剩餘可退額決定）
        `refund|${patientId}|${consultationId}|${want}`
    );
}

// ── 操作：人工調整 ──

/**
 * 需管理員；強制填原因。新餘額不得為負。
 * @param {object} params {clinicId, patientId, deltaBalance?, deltaBonus?, reason, idempotencyKey}
 */
export async function walletAdjust(env, claims, params) {
    const clinicId = requireClinicId(params.clinicId);
    const patientId = String(params.patientId);
    const deltaBalance = params.deltaBalance !== undefined && params.deltaBalance !== null
        ? requireMoney2(params.deltaBalance, '本金調整金額')
        : 0;
    const deltaBonus = params.deltaBonus !== undefined && params.deltaBonus !== null
        ? requireMoney2(params.deltaBonus, '贈送額調整金額')
        : 0;
    if (deltaBalance === 0 && deltaBonus === 0) {
        throw new WalletError(400, 'NO_CHANGE', '調整金額不得全部為 0');
    }
    if (Math.abs(deltaBalance) > 100000 || Math.abs(deltaBonus) > 100000) {
        throw new WalletError(400, 'AMOUNT_TOO_LARGE', '單次調整金額過大');
    }
    const reason = String(params.reason || '').trim();
    if (!reason) {
        throw new WalletError(400, 'REASON_REQUIRED', '必須填寫調整原因');
    }

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        clinicId,
        ({ docsBase }) => [accountDocName(docsBase, clinicId, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, clinicId, patientId);
            const accFields = byName.get(name);
            if (!accFields) {
                throw new WalletError(404, 'WALLET_NOT_FOUND', '找不到儲值帳戶');
            }
            const newBalance = round2(rawNumber(accFields, 'balance') + deltaBalance);
            const newBonus = round2(rawNumber(accFields, 'bonusBalance') + deltaBonus);
            if (newBalance < 0 || newBonus < 0) {
                throw new WalletError(400, 'NEGATIVE_BALANCE',
                    '調整後餘額不可為負數');
            }
            const at = new Date().toISOString();
            const status = rawString(accFields, 'status', 'active');

            const accountObj = {
                patientId,
                clinicId,
                status,
                balance: newBalance,
                bonusBalance: newBonus,
                currency: rawString(accFields, 'currency', 'HKD'),
                createdAt: rawString(accFields, 'createdAt') || at,
                createdBy: rawString(accFields, 'createdBy') || operatorName(claims),
                updatedAt: at
            };

            const appliesTo = deltaBalance !== 0 && deltaBonus !== 0
                ? 'mixed'
                : (deltaBalance !== 0 ? 'balance' : 'bonus');
            const txRecord = Object.assign(
                baseTxRecord(patientId, clinicId, claims, params.idempotencyKey, at),
                {
                    type: 'adjust',
                    amount: round2(deltaBalance + deltaBonus),
                    appliesTo,
                    deltaBalance,
                    deltaBonus,
                    balanceAfter: newBalance,
                    bonusBalanceAfter: newBonus,
                    note: reason.slice(0, 300)
                }
            );
            const txBuilt = newTxWrite(docsBase, txRecord);

            return {
                writes: [
                    { update: { name, fields: jsObjectToFirestoreFields(accountObj) } },
                    txBuilt.write
                ],
                result: {
                    ok: true,
                    balance: newBalance,
                    bonusBalance: newBonus,
                    txId: txBuilt.txId
                }
            };
        },
        `adjust|${patientId}|${deltaBalance}|${deltaBonus}`
    );
}

// ── 操作：帳戶狀態（凍結/關閉/復用）──

/**
 * 需管理員。非 active 狀態須附說明。
 * @param {object} params {clinicId, patientId, status, note?, idempotencyKey}
 */
export async function walletSetStatus(env, claims, params) {
    const clinicId = requireClinicId(params.clinicId);
    const patientId = String(params.patientId);
    const status = String(params.status || '');
    if (!['active', 'frozen', 'closed'].includes(status)) {
        throw new WalletError(400, 'INVALID_STATUS', '狀態必須為 active/frozen/closed');
    }
    if (status !== 'active' && !String(params.note || '').trim()) {
        throw new WalletError(400, 'NOTE_REQUIRED', '凍結或關閉帳戶必須填寫說明');
    }

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        clinicId,
        ({ docsBase }) => [accountDocName(docsBase, clinicId, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, clinicId, patientId);
            const accFields = byName.get(name);
            if (!accFields) {
                throw new WalletError(404, 'WALLET_NOT_FOUND', '找不到儲值帳戶');
            }
            const balance = round2(rawNumber(accFields, 'balance'));
            const bonusBalance = round2(rawNumber(accFields, 'bonusBalance'));
            if (status === 'closed' && round2(balance + bonusBalance) > 0) {
                throw new WalletError(400, 'BALANCE_REMAINING',
                    '帳戶仍有餘額，請先退款或調整後再關閉');
            }
            // 審計用：記錄狀態轉換的來源狀態（無欄位的舊帳戶視為 active）
            const fromStatus = rawString(accFields, 'status', 'active');
            const at = new Date().toISOString();

            const accountObj = {
                patientId,
                clinicId,
                status,
                balance,
                bonusBalance,
                currency: rawString(accFields, 'currency', 'HKD'),
                createdAt: rawString(accFields, 'createdAt') || at,
                createdBy: rawString(accFields, 'createdBy') || operatorName(claims),
                updatedAt: at
            };

            // 獨立 statusChange 類型（不再借用 adjust/amount:0），
            // 審計時可與金額調整明確區分；金額欄位固定 0、不涉金額變動
            const txRecord = Object.assign(
                baseTxRecord(patientId, clinicId, claims, params.idempotencyKey, at),
                {
                    type: 'statusChange',
                    amount: 0,
                    appliesTo: 'none',
                    fromStatus,
                    toStatus: status,
                    deltaBalance: 0,
                    deltaBonus: 0,
                    balanceAfter: balance,
                    bonusBalanceAfter: bonusBalance,
                    note: (`帳戶狀態由 ${fromStatus} 變更為 ${status}` +
                        (params.note ? `：${String(params.note).trim()}` : '')).slice(0, 300)
                }
            );
            const txBuilt = newTxWrite(docsBase, txRecord);

            return {
                writes: [
                    { update: { name, fields: jsObjectToFirestoreFields(accountObj) } },
                    txBuilt.write
                ],
                result: { ok: true, status, fromStatus, balance, bonusBalance }
            };
        },
        `status|${patientId}|${status}`
    );
}

// ── 舊制單一錢包遷移至每診所獨立帳戶 ──

const LEGACY_PATIENT_ID_RE = /^[A-Za-z0-9_-]{10,40}$/;
const MIGRATE_MAX_ACCOUNTS = 1000;

function migrationEqFilter(fieldPath, value) {
    return {
        fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value
        }
    };
}

async function migrationRtdbAppointment(rtdbUrl, token, appointmentId) {
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

async function migrationDocMap(client, collectionId, ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean))).slice(0, 300);
    const docs = await Promise.all(uniq.map(async (id) => {
        try {
            const d = await client.getDocument(
                `${collectionId}/${encodeURIComponent(id)}`
            );
            return d && d.data ? [id, d.data] : null;
        } catch (_e) {
            return null;
        }
    }));
    return new Map(docs.filter(Boolean));
}

/**
 * 把一筆流水的金額變動計入分組（正確正負號：付款為扣減）。
 */
function migrationApplyTx(group, tx) {
    switch (tx.type) {
        case 'topup':
            group.balance += Number(tx.amount) || 0;
            break;
        case 'topupBonus':
            group.bonus += Number(tx.amount) || 0;
            break;
        case 'payment':
            group.balance -= Number(tx.fromBalance) || 0;
            group.bonus -= Number(tx.fromBonus) || 0;
            break;
        case 'refund':
            group.balance += Number(tx.fromBalance) || 0;
            group.bonus += Number(tx.fromBonus) || 0;
            break;
        case 'adjust':
            if (Number.isFinite(Number(tx.deltaBalance))) {
                group.balance += Number(tx.deltaBalance);
                group.bonus += Number(tx.deltaBonus) || 0;
            } else {
                group.balance += Number(tx.amount) || 0;
            }
            break;
        default:
            break;
    }
}

/**
 * 一次性遷移（可重複執行）：
 * 舊制 patientWalletAccounts/{patientId}（全域單一帳戶）
 *   → patientWalletAccounts/{clinicId}__{patientId}（每診所獨立）
 *
 * 每個病人的全部流水依以下證據歸診所：
 *   tx.clinicId（新制）> 診症單 clinicId > 掛號單 clinicId
 *   > topupBonus 跟隨同 idempotencyKey 的 topup。
 * 無法歸屬者記為未分組餘額回報，需人工以「調整」處置；
 * 已標記 walletMigratedAt 的舊文件跳過。即使上次執行在標記舊文件前
 * 中斷，複合帳戶上的 legacyMigratedFrom 戳記也會阻止結存重複加總。
 *
 * @param {object} opts {dryRun?: boolean}
 * @returns {Promise<object>} 遷移報告
 */
export async function walletMigrateLegacy(env, claims, opts = {}) {
    const dryRun = opts.dryRun === true;
    const auth = await getAccessToken(env);
    const client = new FirestoreClient(
        auth.token,
        auth.projectId,
        env.FIREBASE_RTDB_URL || ''
    );
    const knownClinicIds = new Set(await client.listClinicIds());

    const allAccounts = await client.queryCollection({
        collectionId: 'patientWalletAccounts',
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]
    });
    const legacyDocs = allAccounts.docs.filter((d) =>
        isLegacyAccountDocId(d.id) && LEGACY_PATIENT_ID_RE.test(d.id));

    const report = {
        dryRun,
        scanned: legacyDocs.length,
        migrated: [],
        unassigned: [],
        skipped: [],
        // 已計入過遷移結存、本次未重複入帳的複合帳戶（防重複入帳）
        creditSkipped: [],
        unknownClinic: [],
        capped: false
    };
    let processed = 0;

    for (const doc of legacyDocs) {
        if (processed >= MIGRATE_MAX_ACCOUNTS) {
            report.capped = true;
            break;
        }
        const patientId = doc.id;
        const legacy = doc.data || {};
        if (legacy.walletMigratedAt) {
            report.skipped.push({ patientId, reason: 'already-migrated' });
            continue;
        }
        processed += 1;

        // 該病人全部流水（自動分頁）
        const txRes = await client.queryCollection({
            collectionId: 'patientWalletTransactions',
            where: migrationEqFilter('patientId', { stringValue: patientId }),
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]
        });
        const txs = txRes.docs.map((d) => d.data).filter(Boolean);

        // 診所證據：診症單與掛號單
        const consIds = txs.map((tx) => tx.consultationId).filter(Boolean);
        const apptIds = txs.map((tx) => tx.appointmentId).filter(Boolean);
        const [consMap, apptList] = await Promise.all([
            migrationDocMap(client, 'consultations', consIds),
            Promise.all(Array.from(new Set(apptIds)).slice(0, 100)
                .map((id) => migrationRtdbAppointment(
                    env.FIREBASE_RTDB_URL || '', auth.token, id
                )))
        ]);
        const apptMap = new Map();
        Array.from(new Set(apptIds)).slice(0, 100).forEach((id, i) => {
            if (apptList[i]) apptMap.set(id, apptList[i]);
        });

        // topup 單先解析診所，topupBonus 以同 idempotencyKey 跟隨
        const idemClinicMap = new Map();
        txs.forEach((tx) => {
            if (tx.type !== 'topup' || !tx.idempotencyKey) return;
            let cid = (tx.consultationId
                && consMap.has(tx.consultationId)
                && consMap.get(tx.consultationId).clinicId)
                || (tx.appointmentId
                && apptMap.has(tx.appointmentId)
                && apptMap.get(tx.appointmentId).clinicId)
                || '';
            idemClinicMap.set(String(tx.idempotencyKey), String(cid || ''));
        });

        function txClinicId(tx) {
            if (tx.clinicId) return String(tx.clinicId);
            if (tx.consultationId) {
                const c = consMap.get(tx.consultationId);
                if (c && c.clinicId) return String(c.clinicId);
            }
            if (tx.appointmentId) {
                const a = apptMap.get(tx.appointmentId);
                if (a && a.clinicId) return String(a.clinicId);
            }
            if (tx.type === 'topupBonus'
                && idemClinicMap.has(String(tx.idempotencyKey))) {
                return idemClinicMap.get(String(tx.idempotencyKey));
            }
            return '';
        }

        const groups = new Map();
        const ensure = (cid) => {
            if (!groups.has(cid)) {
                groups.set(cid, {
                    balance: 0,
                    bonus: 0,
                    earliestAt: '',
                    count: 0
                });
            }
            return groups.get(cid);
        };
        txs.forEach((tx) => {
            const g = ensure(txClinicId(tx));
            migrationApplyTx(g, tx);
            if (tx.at && (!g.earliestAt || String(tx.at) < g.earliestAt)) {
                g.earliestAt = String(tx.at);
            }
            g.count += 1;
        });

        const legacyBalance = round2(Number(legacy.balance) || 0);
        const legacyBonus = round2(Number(legacy.bonus) || 0);
        const assignedCids = [];
        const unknownCids = [];
        let assignedBalance = 0;
        let assignedBonus = 0;

        for (const [cid, g] of groups) {
            if (!cid) continue;
            g.balance = round2(g.balance);
            g.bonus = round2(g.bonus);
            if (!knownClinicIds.has(cid)) unknownCids.push(cid);

            const compositeId = walletAccountDocId(cid, patientId);
            const existing = await client.getDocument(
                `patientWalletAccounts/${encodeURIComponent(compositeId)}`
            );
            const existingData = existing && existing.data ? existing.data : null;
            // 防重複入帳：複合帳戶若已帶有本病人的遷移戳記，代表先前
            // 執行（可能中途失敗、舊文件尚未標記 walletMigratedAt）已把
            // 舊制結存計入，本次不得再加一次。
            const alreadyCredited = existingData
                && String(existingData.legacyMigratedFrom || '') === patientId;
            if (alreadyCredited) {
                report.creditSkipped.push({ patientId, clinicId: cid });
                assignedCids.push(cid);
                assignedBalance = round2(assignedBalance + g.balance);
                assignedBonus = round2(assignedBonus + g.bonus);
                continue;
            }
            // 新制帳戶可能已於部署後、遷移前啟用：把舊制結存「加回」一次。
            // 寫入遷移戳記，確保即使舊文件標記前中斷，重跑也不會重複加總。
            const finalBalance = round2(
                (existingData ? Number(existingData.balance) || 0 : 0)
                + g.balance
            );
            const finalBonus = round2(
                (existingData ? Number(existingData.bonusBalance) || 0 : 0)
                + g.bonus
            );
            const at = new Date().toISOString();
            const fields = {
                patientId,
                clinicId: cid,
                status: String(legacy.status || 'active'),
                balance: finalBalance,
                bonusBalance: finalBonus,
                currency: String(legacy.currency || 'HKD'),
                createdAt: String(legacy.createdAt || g.earliestAt || at),
                createdBy: String(legacy.createdBy || operatorName(claims)),
                updatedAt: at,
                // 遷移來源證據：本帳戶已吸收舊制 {patientId} 帳戶中
                // 歸屬此診所的結存（金額快照一併保存供核對）
                legacyMigratedFrom: patientId,
                legacyMigratedAt: at,
                legacyMigratedBalance: g.balance,
                legacyMigratedBonus: g.bonus
            };
            if (!dryRun) {
                await client.patchDocument(
                    `patientWalletAccounts/${encodeURIComponent(compositeId)}`,
                    fields
                );
            }
            assignedCids.push(cid);
            assignedBalance = round2(assignedBalance + g.balance);
            assignedBonus = round2(assignedBonus + g.bonus);
        }

        const unassigned = groups.get('');
        const unassignedBalance = unassigned ? round2(unassigned.balance) : 0;
        const unassignedBonus = unassigned ? round2(unassigned.bonus) : 0;

        // 核對：分組結存總和應與舊帳戶餘額一致，差額記錄供人工追蹤
        const diffBalance = round2(
            legacyBalance - assignedBalance - unassignedBalance);
        const diffBonus = round2(
            legacyBonus - assignedBonus - unassignedBonus);

        if (!dryRun) {
            await client.patchDocument(
                `patientWalletAccounts/${encodeURIComponent(patientId)}`,
                {
                    walletMigratedAt: new Date().toISOString(),
                    walletMigratedClinicIds: assignedCids,
                    walletMigratedUnassignedBalance: unassignedBalance,
                    walletMigratedUnassignedBonus: unassignedBonus,
                    walletMigratedDiffBalance: diffBalance,
                    walletMigratedDiffBonus: diffBonus
                }
            );
        }

        report.migrated.push({
            patientId,
            clinics: assignedCids,
            assignedBalance,
            assignedBonus
        });
        if (unassignedBalance !== 0 || unassignedBonus !== 0) {
            report.unassigned.push({
                patientId,
                balance: unassignedBalance,
                bonus: unassignedBonus
            });
        }
        if (unknownCids.length) {
            report.unknownClinic.push({ patientId, clinicIds: unknownCids });
        }
    }

    report.totalMigrated = report.migrated.length;
    report.totalCreditSkipped = report.creditSkipped.length;
    return report;
}
