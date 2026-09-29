/* ============================================================
 * GET /api/member/appointments/options?clinicId=xxx（公開）
 * ------------------------------------------------------------
 * 供會員端建立預約表單：回傳預約規則摘要與啟用中醫師清單。
 * 僅公開非敏感欄位（不含病歷）；IP 限速防列舉。
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../../backup/lib/http.js';
import {
    buildServiceContext,
    loadBookingConfig,
    listDoctors,
    ipRateAllow
} from './lib/booking-core.js';

export const onRequestOptions = () => optionsResponse();

const RATE_MAX_IP = 60; // 每 IP 每 10 分鐘

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        const ip = request.headers.get('CF-Connecting-IP')
            || request.headers.get('X-Forwarded-For') || 'unknown';
        if (!(await ipRateAllow(env, ip, RATE_MAX_IP))) {
            return jsonResponse({
                error: 'RATE_LIMITED',
                message: '查詢次數過多，請於 10 分鐘後再試'
            }, 429);
        }

        const clinicId = String(new URL(request.url).searchParams.get('clinicId') || '').trim();
        if (!clinicId || clinicId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(clinicId)) {
            return jsonResponse({
                error: 'INVALID_CLINIC',
                message: '請先選擇有效的診所'
            }, 400);
        }

        const { auth, client } = await buildServiceContext(env);
        const [config, doctors] = await Promise.all([
            loadBookingConfig(client, auth.token, clinicId),
            listDoctors(client)
        ]);

        return jsonResponse({
            enabled: !!config.enabled,
            rules: {
                advanceDays: config.advanceDays,
                slotMinutes: config.slotMinutes,
                minLeadMinutes: config.minLeadMinutes,
                cancelLeadMinutes: config.cancelLeadMinutes,
                maxActivePerPatient: config.maxActivePerPatient,
                maxPerDayPerPatient: config.maxPerDayPerPatient,
                closedWeekdays: config.closedWeekdays,
                sessions: config.sessions
            },
            doctors: doctors.map((d) => ({
                username: d.username,
                name: d.name,
                registrationNumber: d.registrationNumber
            }))
        });
    } catch (error) {
        console.error('appointment options failed:', error);
        return jsonResponse({
            error: 'OPTIONS_FAILED',
            message: '暫時無法載入預約資料，請稍後再試'
        }, 500);
    }
}
