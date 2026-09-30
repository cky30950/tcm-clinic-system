/* ============================================================
 * POST /api/member/appointments/cancel（須電話 + Turnstile）
 * ------------------------------------------------------------
 * 請求：{ phone, turnstileToken, appointmentId }
 *
 * 把關：
 *   1. IP 限速 + Turnstile
 *   2. 掛號存在，其 patientId 可由該電話尋獲（身份舉證）
 *   3. 僅 status='registered' 可自行取消（已候診/診症中請致電診所）
 *   4. 距應診仍 ≥ cancelLeadMinutes
 * 軟取消：PATCH status='cancelled'，保留記錄並釋放時段名額。
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../../backup/lib/http.js';
import { verifyTurnstile } from '../../_lib/turnstile.js';
import {
    buildServiceContext,
    loadBookingConfig,
    ipRateAllow,
    phoneMatchVariants,
    findPatientsByPhone,
    rtdbGet,
    rtdbPatch
} from './lib/booking-core.js';

export const onRequestOptions = () => optionsResponse();

const RATE_MAX_IP = 20;

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const ip = request.headers.get('CF-Connecting-IP')
            || request.headers.get('X-Forwarded-For') || 'unknown';
        if (!(await ipRateAllow(env, ip, RATE_MAX_IP))) {
            return jsonResponse({
                error: 'RATE_LIMITED',
                message: '操作次數過多，請於 10 分鐘後再試'
            }, 429);
        }

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const appointmentId = body && body.appointmentId
            ? String(body.appointmentId).slice(0, 100) : '';
        if (!appointmentId) {
            return jsonResponse({ error: 'INVALID_APPOINTMENT', message: '缺少預約編號' }, 400);
        }

        const token = body && body.turnstileToken ? String(body.turnstileToken) : '';
        const human = await verifyTurnstile(token, ip, env);
        if (!human) {
            return jsonResponse({
                error: 'TURNSTILE_FAILED',
                message: '人機驗證失敗，請重新勾選驗證方塊後再試'
            }, 400);
        }

        const { auth, client } = await buildServiceContext(env);

        // 讀取掛號
        let appointment;
        try {
            appointment = await rtdbGet(client, auth.token,
                `appointments/${encodeURIComponent(appointmentId)}`);
        } catch (_e) {
            appointment = null;
        }
        if (!appointment || typeof appointment !== 'object') {
            return jsonResponse({ error: 'NOT_FOUND', message: '找不到此預約記錄' }, 404);
        }

        // 電話身份舉證
        const variants = phoneMatchVariants(body && body.phone);
        if (!variants.length) {
            return jsonResponse({ error: 'INVALID_PHONE', message: '請輸入於診所登記的電話號碼' }, 400);
        }
        const patientDocs = await findPatientsByPhone(client, variants);
        const owns = patientDocs.some((d) => d.id === String(appointment.patientId));
        if (!owns) {
            return jsonResponse({
                error: 'FORBIDDEN',
                message: '此預約不屬於該電話登記之會員'
            }, 403);
        }

        if (appointment.status !== 'registered') {
            return jsonResponse({
                error: 'NOT_CANCELLABLE',
                message: '已候診或診症中之預約無法線上取消，請致電診所協助'
            }, 409);
        }

        const clinicId = appointment.clinicId
            ? String(appointment.clinicId) : '';
        let cancelLead = 120;
        if (clinicId) {
            try {
                const config = await loadBookingConfig(client, auth.token, clinicId);
                cancelLead = config.cancelLeadMinutes;
            } catch (_e) {}
        }
        const apptMs = Date.parse(appointment.appointmentTime);
        if (isNaN(apptMs)
            || apptMs < Date.now() + cancelLead * 60000) {
            return jsonResponse({
                error: 'TOO_CLOSE',
                message: `距應診不足 ${cancelLead} 分鐘，請致電診所取消`
            }, 409);
        }

        await rtdbPatch(client, auth.token,
            `appointments/${encodeURIComponent(appointmentId)}`,
            {
                status: 'cancelled',
                cancelledAt: new Date().toISOString(),
                cancelledBy: 'member_online'
            });

        return jsonResponse({ success: true, appointmentId, status: 'cancelled' });
    } catch (error) {
        console.error('appointment cancel failed:', error);
        if (error && error.message === 'TURNSTILE_NOT_CONFIGURED') {
            return jsonResponse({
                error: 'TURNSTILE_NOT_CONFIGURED',
                message: error.clientMessage || '人機驗證未完成設定'
            }, error.status || 500);
        }
        return jsonResponse({
            error: 'CANCEL_FAILED',
            message: '取消服務發生錯誤，請稍後再試'
        }, 500);
    }
}
