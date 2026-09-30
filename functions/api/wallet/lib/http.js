/* ============================================================
 * Wallet API 共用：員工驗證與請求解析
 * ============================================================ */

import {
    jsonResponse,
    optionsResponse
} from '../../backup/lib/http.js';
import { authenticateSignedIn } from '../../admin/lib/http.js';
import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';
import { WalletError } from './wallet-store.js';

export { jsonResponse, optionsResponse };

// 職位名稱與 firestore.rules isAdminByIndex() 字面值一致
const ADMIN_POSITION = '診所管理';

// userAuthIndex 短暫快取（isolate 內）：只有 custom claims 未齊全的
// 過渡期 session 才需要回查，避免每次操作多一次 Firestore 讀取
const staffIndexCache = new Map();
const STAFF_INDEX_TTL_MS = 60 * 1000;

async function getStaffIndex(env, uid) {
    if (!uid) return null;
    const hit = staffIndexCache.get(uid);
    if (hit && (Date.now() - hit.at) < STAFF_INDEX_TTL_MS) return hit.data;
    let data = null;
    try {
        const auth = await getAccessToken(env);
        const client = new FirestoreClient(
            auth.token,
            auth.projectId,
            env.FIREBASE_RTDB_URL || ''
        );
        const doc = await client.getDocument(
            `userAuthIndex/${encodeURIComponent(uid)}`
        );
        if (doc && doc.data) data = doc.data;
    } catch (_e) {
        data = null;
    }
    staffIndexCache.set(uid, { at: Date.now(), data });
    // 機會式回收，避免 Map 無限增長
    if (staffIndexCache.size > 2000) {
        const now = Date.now();
        Array.from(staffIndexCache.keys()).forEach((k) => {
            const v = staffIndexCache.get(k);
            if (!v || (now - v.at) > STAFF_INDEX_TTL_MS) staffIndexCache.delete(k);
        });
    }
    return data;
}

/**
 * 要求活躍員工（claims staff + active）。
 * 與 firestore.rules canAccess() 對齊：claims 未刷新時，過渡
 * fallback 為 userAuthIndex 文件 active==true（手機驗證病人無此文件）。
 * @returns {Promise<object>} claims
 */
export async function requireStaff(request, env) {
    const claims = await authenticateSignedIn(request, env);
    if (claims.staff === true && claims.active === true) {
        return claims;
    }
    const index = await getStaffIndex(env, claims.sub);
    if (index && index.active === true) {
        return claims;
    }
    throw new WalletError(403, 'STAFF_ONLY', '此操作僅限診所員工');
}

/**
 * 要求管理員。與 firestore.rules canAdmin() 對齊，三條途徑任一即可：
 *   1. claims.admin === true（custom claim，主要）
 *   2. claims.position === '診所管理'（已活躍員工）
 *   3. userAuthIndex 文件 active==true 且 position=='診所管理'
 *      （部署後一小時內尚未刷新 ID Token 的診所管理）
 * 否則前端看得到入口卻 403。
 */
export async function requireWalletAdmin(request, env) {
    const claims = await requireStaff(request, env);
    if (claims.admin === true) return claims;
    if (String(claims.position || '').trim() === ADMIN_POSITION) return claims;
    const index = await getStaffIndex(env, claims.sub);
    if (index
        && index.active === true
        && String(index.position || '').trim() === ADMIN_POSITION) {
        return claims;
    }
    throw new WalletError(403, 'ADMIN_ONLY', '此操作需要管理員權限');
}

export async function readJsonBody(request) {
    let body;
    try {
        body = await request.json();
    } catch (_e) {
        throw new WalletError(400, 'INVALID_REQUEST', '請求內容必須為 JSON');
    }
    return body && typeof body === 'object' ? body : {};
}

const PATIENT_ID_RE = /^[A-Za-z0-9_-]{10,40}$/;
const CLINIC_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 解析本次操作所屬診所：
 *  - 正常政策：帶 clinicId claim 的員工一律以 claim 為準，客戶端無法
 *    指定其他診所；無 claim 的超管須顯式帶 clinicId。
 *  - 【暫時政策 2026-09】員工診所對應表尚未整理完成，過渡期內所有
 *    員工均可操作所有診所，故 clinicId 一律由請求顯式帶入（仍做格式
 *    驗證）。日後收回跨診所權限時，恢復「bound 存在即 return bound」
 *    的強制邏輯即可。
 * @param {object} claims 已驗證的 token claims
 * @param {object} source 請求參數（JSON body 或 URLSearchParams）
 * @returns {string}
 */
export function resolveClinicId(claims, source) {
    // 【暫時政策 2026-09】跨診所隔離恢復點：
    // 原本「claims.clinicId 存在即強制回傳該值、忽略客戶端指定」，
    // 過渡期內所有員工可操作所有診所，故暫時一律採用請求帶入的
    // clinicId（仍做格式驗證）。claims 參數保留，日後直接在此恢復：
    //   const bound = claims && claims.clinicId ? String(claims.clinicId).trim() : '';
    //   if (bound) { ...驗證... return bound; }
    void claims;
    const given = source
        ? String(source.clinicId || source.get?.('clinicId') || '').trim()
        : '';
    if (!CLINIC_ID_RE.test(given)) {
        throw new WalletError(400, 'INVALID_CLINIC',
            '缺少有效的 clinicId，請重新整理頁面後再試');
    }
    return given;
}

export function parsePatientId(body) {
    const patientId = String(body && body.patientId || '').trim();
    if (!PATIENT_ID_RE.test(patientId)) {
        throw new WalletError(400, 'INVALID_PATIENT', '病人 ID 格式不正確');
    }
    return patientId;
}

export function parseIdempotencyKey(body) {
    const key = String(body && body.idempotencyKey || '').trim();
    if (!key || key.length > 200) {
        throw new WalletError(400, 'INVALID_IDEMPOTENCY_KEY',
            '必須提供有效的 idempotencyKey');
    }
    return key;
}

export function toErrorResponse(error) {
    if (error instanceof WalletError) {
        return jsonResponse({ error: error.code, message: error.message }, error.status);
    }
    return jsonResponse({
        error: 'WALLET_API_ERROR',
        message: error && error.message ? error.message : '儲值功能發生錯誤'
    }, 500);
}
