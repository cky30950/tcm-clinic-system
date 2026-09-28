/* ============================================================
 * GET /api/push/config
 * ------------------------------------------------------------
 * 回傳 Web Push 公開設定（需 Bearer Firebase ID Token）：
 *   { vapidPublicKey, configured }
 * VAPID_PUBLIC_KEY 未設定時 configured=false，前端顯示設定提示。
 * ============================================================ */

import { authenticateStaff } from '../attachments/lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { errorJson } from '../_lib/http-errors.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        await authenticateStaff(request, env);
        const vapidPublicKey = String(env.VAPID_PUBLIC_KEY || '');
        return jsonResponse({
            vapidPublicKey,
            configured: Boolean(vapidPublicKey)
        });
    } catch (error) {
        if (Number(error.status) === 401) {
            return jsonResponse({ error: 'UNAUTHORIZED', message: '登入憑證無效或已過期' }, 401);
        }
        return errorJson(error, { code: 'CONFIG_FAILED', message: '讀取推播設定失敗，請稍後再試' });
    }
}
