/* ============================================================
 * GET /api/member/appointments/slots?clinicId=&date=&doctor=（公開）
 * ------------------------------------------------------------
 * 回傳指定醫師指定日期（HKT）的可約時段與剩餘名額：
 *   { enabled, closed, reason, doctor, name, date, slots:
 *       [{ at, label, status: open|full|closed, remaining }] }
 * 只讀 RTDB（設定/排班/掛號），IP 限速防掃描。
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../../backup/lib/http.js';
import {
    buildServiceContext,
    loadBookingConfig,
    listDoctors,
    evaluateDay,
    ipRateAllow,
    isValidDateStr,
    hktTodayStr,
    addDaysDateStr,
    hktWeekday
} from './lib/booking-core.js';

export const onRequestOptions = () => optionsResponse();

const RATE_MAX_IP = 60;

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

        const sp = new URL(request.url).searchParams;
        const clinicId = String(sp.get('clinicId') || '').trim();
        const date = String(sp.get('date') || '').trim();
        const doctorUsername = String(sp.get('doctor') || '').trim();

        if (!clinicId || clinicId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(clinicId)) {
            return jsonResponse({ error: 'INVALID_CLINIC', message: '診所資料無效' }, 400);
        }
        if (!doctorUsername || doctorUsername.length > 64) {
            return jsonResponse({ error: 'INVALID_DOCTOR', message: '請先選擇醫師' }, 400);
        }
        if (!isValidDateStr(date)) {
            return jsonResponse({ error: 'INVALID_DATE', message: '日期格式無效' }, 400);
        }

        const { auth, client } = await buildServiceContext(env);
        const config = await loadBookingConfig(client, auth.token, clinicId);
        if (!config.enabled) {
            return jsonResponse({ enabled: false, closed: true, reason: 'disabled', slots: [] });
        }

        // 日期範圍與休診日把關
        const todayStr = hktTodayStr();
        const maxStr = addDaysDateStr(todayStr, config.advanceDays);
        if (date < todayStr || date > maxStr) {
            return jsonResponse({ error: 'DATE_OUT_OF_RANGE', message: '不在可預約日期範圍' }, 400);
        }
        if (config.closedWeekdays.includes(hktWeekday(date))) {
            return jsonResponse({
                enabled: true, closed: true, reason: 'clinic_closed',
                date, doctor: doctorUsername, slots: []
            });
        }

        const doctors = await listDoctors(client);
        const doctor = doctors.find((d) => d.username === doctorUsername);
        if (!doctor) {
            return jsonResponse({ error: 'DOCTOR_NOT_FOUND', message: '找不到該醫師' }, 404);
        }

        const result = await evaluateDay(client, auth.token, clinicId, config, doctor, date);
        return jsonResponse(Object.assign(
            { enabled: true, date, doctor: doctor.username, name: doctor.name },
            result
        ));
    } catch (error) {
        console.error('appointment slots failed:', error);
        return jsonResponse({
            error: 'SLOTS_FAILED',
            message: '暫時無法載入時段，請稍後再試'
        }, 500);
    }
}
