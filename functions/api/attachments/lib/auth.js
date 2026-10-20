/* ============================================================
 * 病歷附件 API 認證輔助
 * ------------------------------------------------------------
 * - authenticateStaff()：要求有效 Firebase ID Token 且具活躍員工 custom claims
 * - resolveUserData()：以 Service Account 經 Firestore REST 解析
 *   users 集合文件（優先使用 claims.userId，次選 uid → email），供刪除
 *   權限與經手人判斷使用。
 * ============================================================ */

import {
    getAccessToken,
    getServiceAccount,
    verifyIdToken,
    extractBearerToken
} from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';

/**
 * 驗證請求者為有效員工（以 custom claims 判斷 staff=true、active=true）。
 * @returns {Promise<{uid:string, email:string, claims:object, via:string}>}
 */
export async function authenticateStaff(request, env) {
    const token = extractBearerToken(request);
    if (!token) {
        const err = new Error('缺少登入憑證');
        err.status = 401;
        throw err;
    }
    const projectId = getServiceAccount(env).project_id;
    let claims;
    try {
        claims = await verifyIdToken(token, projectId);
    } catch (error) {
        const err = new Error('登入憑證無效或已過期：' + (error.message || ''));
        err.status = 401;
        throw err;
    }

    if (claims.staff === true) {
        if (claims.active === false) {
            const err = new Error('帳號已停用');
            err.status = 403;
            throw err;
        }
        return { uid: claims.sub, email: claims.email || '', claims, via: 'claims' };
    }

    const err = new Error('未授權：此帳號不是啟用中的員工');
    err.status = 403;
    throw err;
}

/**
 * 取得 FirestoreClient。
 * 注意：不可跨請求快取 client 實例——client 持有建構當下的 access token，
 * 而 token 約 1 小時到期；warm isolate 複用快取實例會導致過期後 401。
 * getAccessToken() 內部已有 token 快取與自動刷新，每次新建 client 成本低。
 */
async function getFirestoreClient(env) {
    const auth = await getAccessToken(env);
    return new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || '');
}

/**
 * 依 Auth claims 解析 users 集合文件。
 * 解析順序：
 *   1. claims.userId → users/{userId}（直接命中，免讀 userAuthIndex）
 *   2. users where uid == claims.sub
 *   3. users where email == claims.email
 * @returns {Promise<object|null>} users 文件資料（含 position 等）
 */
export async function resolveUserData(claims, env) {
    const client = await getFirestoreClient(env);
    const uid = claims.sub;
    let userData = null;

    if (claims.userId) {
        try {
            const target = await client.getDocument(
                `users/${encodeURIComponent(String(claims.userId))}`
            );
            if (target) userData = target.data;
        } catch (error) {
            console.warn('依 claims.userId 讀取 users 失敗，嘗試查詢解析:', error.message);
        }
    }

    if (!userData) {
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
        if (byUid.docs[0]) userData = byUid.docs[0].data;
    }

    if (!userData && claims.email) {
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
        if (byEmail.docs[0]) userData = byEmail.docs[0].data;
    }

    return userData;
}
