/* ============================================================
 * POST /api/attachments/capture-session
 * ------------------------------------------------------------
 * 電腦端（已登入員工）為當前病人/診次建立一組限時手機代拍
 * session，回傳 { sid, token, expiresAt, captureUrl }。
 * 手機掃描 captureUrl（內含 sid+token）開啟 mobile-capture.html，
 * 不需登入即可拍照並直傳 R2。
 *
 * 請求：
 *   { patientId, patientName?, appointmentId?, consultationId?,
 *     consultationDate?, mode: 'tongue' | 'nontongue' | 'all' }
 * ============================================================ */

import { authenticateStaff, resolveUserData } from './lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { errorJson } from '../_lib/http-errors.js';
import {
    SAFE_PATIENT_ID,
    SAFE_OPT_ID,
    SAFE_DATE,
    StoreError
} from './lib/attachments-store.js';
import { createCaptureSession, CAPTURE_MODES } from './lib/capture-session.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const auth = await authenticateStaff(request, env);

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const patientId = String(body && body.patientId || '').trim();
        if (!SAFE_PATIENT_ID.test(patientId)) {
            throw new StoreError(400, 'INVALID_PATIENT_ID', '病人 ID 格式不正確');
        }
        const mode = CAPTURE_MODES.has(String(body && body.mode)) ? String(body.mode) : 'all';

        const appointmentId = String(body && body.appointmentId || '').trim();
        const consultationId = String(body && body.consultationId || '').trim();
        if (!SAFE_OPT_ID.test(appointmentId) || !SAFE_OPT_ID.test(consultationId)) {
            throw new StoreError(400, 'INVALID_CONTEXT_ID', '掛號／診症 ID 格式不正確');
        }
        const consultationDateRaw = String(body && body.consultationDate || '').trim();
        const consultationDate = SAFE_DATE.test(consultationDateRaw) ? consultationDateRaw : '';
        const patientName = String(body && body.patientName || '').trim().slice(0, 100);

        let creatorName = auth.email || '';
        try {
            const me = await resolveUserData(auth.claims, env);
            if (me && (me.name || me.username)) {
                creatorName = String(me.name || me.username).slice(0, 100);
            }
        } catch (_e) {}

        const { sid, token, expiresAt } = await createCaptureSession(env, {
            createdByUid: auth.uid,
            createdByName: creatorName,
            patientId,
            patientName,
            appointmentId,
            consultationId,
            consultationDate,
            mode,
            uploadLimit: env.CAPTURE_MAX_UPLOADS
        });

        const origin = new URL(request.url).origin;
        // 使用 Cloudflare Pages 的 clean URL（無 .html）：
        // 帶 .html 的網址會被 308 重新導向，在手機已安裝／曾造訪 PWA
        // （Service Worker 接管）時會導向成 opaqueredirect 而開頁失敗。
        // token 只放 URL fragment（#）：fragment 不會進伺服器／代理存取記錄、
        // 不隨 Referer 外洩，也不會存進瀏覽器歷史的查詢字串；sid 為一次性
        // 會話識別碼（DB 僅存 token 雜湊），放 query 無敏感性問題。
        // 與 video room pass 用 fragment 的做法一致。
        const captureUrl = `${origin}/mobile-capture?sid=${encodeURIComponent(sid)}` +
            `#t=${encodeURIComponent(token)}`;

        return jsonResponse({ sid, token, expiresAt: expiresAt.toISOString(), captureUrl });
    } catch (error) {
        if (error instanceof StoreError) {
            return jsonResponse({ error: error.code, message: error.message }, error.status);
        }
        if (Number(error.status) === 401) {
            return jsonResponse({ error: 'UNAUTHORIZED', message: '登入憑證無效或已過期' }, 401);
        }
        return errorJson(error, {
            code: 'CAPTURE_SESSION_FAILED',
            message: '建立拍照連結失敗，請稍後再試'
        });
    }
}
