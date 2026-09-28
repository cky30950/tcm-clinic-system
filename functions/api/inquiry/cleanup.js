/* ============================================================
 * POST /api/inquiry/cleanup（需職員登入）
 * ------------------------------------------------------------
 * 清除過期預診（inquiries）。Firestore Security Rules 規定
 * inquiries 客戶端 create/update/delete 一律拒絕（僅 Service Account
 * 可寫），故前端 clearOldInquiries() 改呼叫本端點：驗證職員
 * ID Token 後，以 Service Account 經 Firestore REST 查詢並批次刪除：
 *   - createdAt 早於香港時間今日 00:00，或
 *   - expireAt  早於香港時間今日 00:00
 *
 * 每次調用每個條件最多掃一頁（PAGE_SIZE）；端點於員工登入後及
 * 每日定時由前端觸發，若殘留超過上限會於下次調用繼續清理。
 *
 * 請求：無 body 欄位（需 Bearer Firebase ID Token）
 * 回應：{ ok: true, deletedCount, failedCount, truncated }
 * ============================================================ */

import { authenticateStaff } from '../attachments/lib/auth.js';
import { getAccessToken } from '../backup/lib/google-auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';

const PAGE_SIZE = 300;  // 每個條件單頁掃描上限
const BATCH_SIZE = 400; // Firestore batchWrite 每批上限 500，保留餘裕

// gRPC NOT_FOUND：文件已被其他流程刪除，視為成功
const GRPC_NOT_FOUND = 5;

export const onRequestOptions = () => optionsResponse();

/**
 * 香港時間（UTC+8）今日 00:00 對應的 UTC Date，
 * 與前端「只保留今天及未來」的清理語意一致。
 */
function hkStartOfToday(now = new Date()) {
    const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    shifted.setUTCHours(0, 0, 0, 0);
    return new Date(shifted.getTime() - 8 * 60 * 60 * 1000);
}

function toFirestoreTimestamp(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 以 runQuery 掃出單一過期條件命中的文件完整資源名稱
 * （projects/.../documents/inquiries/{id}），單頁上限 PAGE_SIZE。
 * 缺該欄位的文件不會命中 fieldFilter，與舊客戶端行為一致。
 */
async function queryExpiredIds(auth, field, thresholdIso) {
    const url = `https://firestore.googleapis.com/v1/projects/${auth.projectId}`
        + '/databases/(default)/documents:runQuery';
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${auth.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: 'inquiries' }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: field },
                        op: 'LESS_THAN',
                        value: { timestampValue: thresholdIso }
                    }
                },
                limit: PAGE_SIZE
            }
        })
    });
    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : [];
    } catch (_e) {
        throw new Error(`Firestore 回應無法解析 (HTTP ${response.status}): ${text.slice(0, 300)}`);
    }
    if (!response.ok) {
        const message = data && data.error && data.error.message
            ? data.error.message
            : `HTTP ${response.status}`;
        throw new Error(`查詢過期 ${field} 失敗: ${message}`);
    }
    const rows = Array.isArray(data) ? data : [data];
    const names = [];
    for (const row of rows) {
        if (row.document && row.document.name) names.push(row.document.name);
    }
    return names;
}

/**
 * 以 batchWrite 分批刪除文件（Service Account 繞過 Rules）。
 * 回傳失敗數；NOT_FOUND 不計失敗。
 */
async function batchDelete(auth, names) {
    let failed = 0;
    for (let i = 0; i < names.length; i += BATCH_SIZE) {
        const chunk = names.slice(i, i + BATCH_SIZE);
        const url = `https://firestore.googleapis.com/v1/projects/${auth.projectId}`
            + '/databases/(default)/documents:batchWrite';
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                writes: chunk.map((name) => ({ delete: name }))
            })
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`Firestore batchWrite 失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
        }
        const data = text ? JSON.parse(text) : {};
        for (const status of data.status || []) {
            if (status.error && status.error.code !== GRPC_NOT_FOUND) failed++;
        }
    }
    return failed;
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        // 任何啟用中的員工皆可（與 inquiries read: canAccess() 對等）
        await authenticateStaff(request, env);

        const auth = await getAccessToken(env);
        const thresholdIso = toFirestoreTimestamp(hkStartOfToday());

        // 兩個條件各自掃一頁，用文件資源名稱去重
        const [createdIds, expireIds] = await Promise.all([
            queryExpiredIds(auth, 'createdAt', thresholdIso),
            queryExpiredIds(auth, 'expireAt', thresholdIso)
        ]);
        const names = [...new Set([...createdIds, ...expireIds])];

        const failed = await batchDelete(auth, names);

        return jsonResponse({
            ok: true,
            deletedCount: names.length - failed,
            failedCount: failed,
            truncated: createdIds.length >= PAGE_SIZE || expireIds.length >= PAGE_SIZE
        });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        if (status === 401 || status === 403) {
            return jsonResponse({
                error: 'UNAUTHORIZED',
                message: error.message || '未授權執行此操作'
            }, status);
        }
        console.error('[inquiry-cleanup] 內部錯誤:', error && (error.stack || error.message || error));
        return jsonResponse({
            error: 'CLEANUP_FAILED',
            message: '清除過期問診資料失敗，請稍後再試'
        }, 500);
    }
}
