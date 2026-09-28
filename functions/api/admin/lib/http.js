/* ============================================================
 * Admin API 共用 HTTP 輔助
 * ============================================================ */

import { authenticateAdmin, isConfiguredSecretStrong, MIN_SHARED_SECRET_LENGTH } from '../../backup/lib/http.js';
import { getAccessToken, verifyIdToken, extractBearerToken, getServiceAccount } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';

export function corsHeaders() {
    // ACAO 由 functions/api/_middleware.js 依來源白名單統一核發
    return {
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Bootstrap-Secret',
        'Access-Control-Max-Age': '86400'
    };
}

/**
 * 驗證請求者的 Firebase ID Token（任何已登入用戶，不要求管理員）。
 * @returns {Promise<object>} token claims
 */
export async function authenticateSignedIn(request, env) {
    const token = extractBearerToken(request);
    const sa = getServiceAccount(env);
    return verifyIdToken(token, sa.project_id);
}

/**
 * 以 Auth uid 解析對應的 users 文件（後端自我服務用，不信客户端傳入的 userId）。
 * 解析順序同 authenticateAdmin：userAuthIndex → uid 欄位 → email。
 * @returns {Promise<{userId:string, data:object}>}
 */
export async function resolveStaffUser(env, claims) {
    const auth = await getAccessToken(env);
    const client = new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || '');
    const uid = claims.sub;
    let userId = '';
    let data = null;

    // 1. 授權索引：userAuthIndex/{uid} -> users/{userId}
    try {
        const indexDoc = await client.getDocument(
            `userAuthIndex/${encodeURIComponent(uid)}`
        );
        const mappedUserId = indexDoc && indexDoc.data && indexDoc.data.userId;
        if (mappedUserId) {
            userId = String(mappedUserId);
            const target = await client.getDocument(
                `users/${encodeURIComponent(userId)}`
            );
            if (target) data = target.data;
        }
    } catch (error) {
        console.warn('讀取 userAuthIndex 失敗，嘗試舊式解析:', error.message);
    }

    // 2. users where uid == Auth uid
    if (!data) {
        const byUid = await client.queryCollection({
            collectionId: 'users',
            where: {
                fieldFilter: {
                    field: { fieldPath: 'uid' },
                    op: 'EQUAL',
                    value: { stringValue: uid }
                }
            },
            limit: 1
        });
        if (byUid.docs[0]) {
            userId = String(byUid.docs[0].id);
            data = byUid.docs[0].data;
        }
    }

    // 3. users where email == token email
    if (!data && claims.email) {
        const byEmail = await client.queryCollection({
            collectionId: 'users',
            where: {
                fieldFilter: {
                    field: { fieldPath: 'email' },
                    op: 'EQUAL',
                    value: { stringValue: String(claims.email).trim() }
                }
            },
            limit: 1
        });
        if (byEmail.docs[0]) {
            userId = String(byEmail.docs[0].id);
            data = byEmail.docs[0].data;
        }
    }

    if (!data) {
        const err = new Error('找不到對應的診所用戶資料');
        err.status = 404;
        throw err;
    }
    return { userId, data };
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
    });
}

export function optionsResponse() {
    return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * 管理員驗證：同 backup authenticateAdmin
 * （claims.admin === true，或 users 文件 position === '診所管理'）。
 */
export async function requireStaffAdmin(request, env) {
    return authenticateAdmin(request, env);
}

/**
 * Bootstrap 專用：允許以共享密鑰呼叫（首次部署、任何用戶都未有 claims 時使用）。
 * 密鑰須為高熵隨機值（至少 32 字元）；長效密鑰不會過期，短密碼等同無防護。
 */
export function isAuthorizedBootstrapCall(request, env) {
    const secret = env && env.ADMIN_BOOTSTRAP_SECRET;
    if (!isConfiguredSecretStrong(secret)) {
        console.error('ADMIN_BOOTSTRAP_SECRET 未設定或長度不足（須至少 '
            + MIN_SHARED_SECRET_LENGTH + ' 字元），bootstrap 密鑰呼叫一律拒絕');
        return false;
    }
    const provided = request.headers.get('X-Admin-Bootstrap-Secret') || '';
    if (provided.length !== secret.length) return false;
    let mismatch = 0;
    for (let i = 0; i < secret.length; i++) {
        mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
    }
    return mismatch === 0;
}

export function errorResponse(error, fallbackStatus = 500) {
    const status = (error && error.status) || fallbackStatus;

    // 5xx：上游（Identity Toolkit／Firestore）原文與堆疊只進伺服器記錄，
    // 不回客戶端，避免外泄內部端點、憑證範圍與基礎設施細節。
    if (!Number.isInteger(status) || status >= 500) {
        console.error('[admin-api] 內部錯誤:', error && (error.stack || error.message || error));
        return jsonResponse({
            error: 'ADMIN_API_ERROR',
            message: '伺服器暫時無法處理請求，請稍後再試'
        }, 500);
    }

    // 4xx：只回後端自行撰寫的訊息；同樣剔除上游原始錯誤本體
    let message = error && error.message;
    if (message && typeof message === 'object') {
        try { message = JSON.stringify(message); } catch (_e) { message = String(message); }
    }
    message = message ? String(message) : '';
    if (!message) {
        message = 'ADMIN_API_ERROR';
    }

    return jsonResponse({
        error: String((error && error.code) || 'ADMIN_API_ERROR'),
        message
    }, status);
}
