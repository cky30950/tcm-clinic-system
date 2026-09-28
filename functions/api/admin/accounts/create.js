/* ============================================================
 * POST /api/admin/accounts/create
 * 伺服器端建立員工 Firebase Auth 帳號（管理員）。
 *
 * 為何不走客戶端 createUserWithEmailAndPassword：
 * 該 API 會把「管理員自己的瀏覽器工作階段」切換成新帳號，
 * 新帳號沒有 admin claims，後續 users 文件寫入會被 Rules 拒絕。
 *
 * Body: { email: string, password: string(符合密碼強度政策), displayName?: string }
 * 回應: { ok, uid, email }
 * ============================================================ */

import { createStaffAuth } from '../lib/claims.js';
import { validatePasswordStrength } from '../lib/password.js';
import { jsonResponse, optionsResponse, requireStaffAdmin, errorResponse } from '../lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

export async function onRequestPost({ request, env }) {
    try {
        const admin = await requireStaffAdmin(request, env);

        let body = {};
        try {
            body = await request.json();
        } catch (_e) {
            body = {};
        }

        const email = String(body.email || '').trim();
        const password = String(body.password || '');
        if (!email || !password) {
            return jsonResponse({ ok: false, message: '缺少電郵或密碼' }, 400);
        }
        const policy = validatePasswordStrength(password);
        if (!policy.ok) {
            return jsonResponse({ ok: false, message: policy.reason }, 400);
        }

        const result = await createStaffAuth(env, {
            email,
            password: policy.password,
            displayName: body.displayName || ''
        });
        result.createdBy = admin.email || admin.uid;
        return jsonResponse({ ok: true, ...result }, 200);
    } catch (error) {
        // Identity Toolkit 的已知帳號類錯誤轉為本地友好訊息（不回上游原文）；
        // 權限不足 403；其餘交 errorResponse 統一處理（5xx 只回通用訊息）
        const msg = String((error && error.message) || '');
        let friendly = '';
        if (/EMAIL_EXISTS/i.test(msg)) {
            friendly = '此電郵已註冊帳號';
        } else if (/INVALID_EMAIL/i.test(msg)) {
            friendly = '電郵格式不正確';
        } else if (/WEAK_PASSWORD/i.test(msg)) {
            friendly = '密碼強度不足，請依密碼規則重新設定';
        } else if (/TOO_MANY/i.test(msg)) {
            friendly = '操作過於頻繁，請稍後再試';
        }
        if (friendly) {
            return jsonResponse({ ok: false, message: friendly }, 400);
        }
        const hasHttpStatus = Number.isInteger(error && error.status)
            && error.status >= 400 && error.status < 600;
        const status = hasHttpStatus
            ? error.status
            : (((error && error.status) === 403) ? 403 : 500);
        return errorResponse(error, status);
    }
}
