/* ============================================================
 * POST /api/attachments/reap
 * ------------------------------------------------------------
 * 手動／外部排程觸發病歷附件孤兒回收。
 * 認證：Header  X-Attachment-Reap-Secret: <env.ATTACHMENT_CRON_SECRET>
 * Body（選填 JSON）：
 *   { "dryRun": true }  只掃描預覽，不刪 R2、不寫 Firestore、
 *                       不動 KV 佇列與安全網游標
 * （Pages Cron Trigger 直接呼叫 runAttachmentReaper，不走 HTTP）
 * ============================================================ */

import { jsonResponse, optionsResponse, isConfiguredSecretStrong, MIN_SHARED_SECRET_LENGTH } from '../backup/lib/http.js';
import { runAttachmentReaper } from './lib/reaper.js';

export const onRequestOptions = () => optionsResponse();

function isAuthorized(request, env) {
    const secret = env && env.ATTACHMENT_CRON_SECRET;
    // 長效排程密鑰須為高熵隨機值（至少 32 字元），不足一律拒絕
    if (!isConfiguredSecretStrong(secret)) {
        console.error('ATTACHMENT_CRON_SECRET 未設定或長度不足（須至少 '
            + MIN_SHARED_SECRET_LENGTH + ' 字元），回收排程呼叫一律拒絕');
        return false;
    }
    const provided = request.headers.get('X-Attachment-Reap-Secret') || '';
    if (provided.length !== secret.length) return false;
    let mismatch = 0;
    for (let i = 0; i < secret.length; i++) {
        mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
    }
    return mismatch === 0;
}

export async function onRequestPost(context) {
    const { request, env } = context;
    if (!isAuthorized(request, env)) {
        return jsonResponse({ error: 'UNAUTHORIZED', message: '缺少或不正確的排程密碼' }, 401);
    }
    try {
        let body = {};
        try {
            body = await request.json();
        } catch (_e) {
            body = {};
        }
        const result = await runAttachmentReaper(env, {
            trigger: 'cron-secret',
            dryRun: body && body.dryRun === true
        });
        return jsonResponse(result, 200);
    } catch (error) {
        if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
            return jsonResponse({
                error: error.code || 'REAP_FAILED',
                message: error.message || '附件回收失敗'
            }, error.status);
        }
        console.error('[reap] 內部錯誤:', error && (error.stack || error.message || error));
        return jsonResponse({
            error: 'REAP_FAILED',
            message: '附件回收失敗，請稍後再試'
        }, 500);
    }
}

export async function onRequestGet() {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED', message: '請使用 POST 觸發回收' }, 405);
}
