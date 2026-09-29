/* ============================================================
 * POST /api/member/appointments/book（須電話 + Turnstile）
 * ------------------------------------------------------------
 * 請求：{ phone, turnstileToken, patientId, clinicId,
 *         doctor (username), slot (ISO), chiefComplaint }
 *
 * 把關順序：
 *   1. IP／電話限速
 *   2. Turnstile 人機驗證
 *   3. 電話可尋獲 patientId（身份舉證，防冒掛）
 *   4. 設定開關、日期範圍、休診日、醫師有效
 *   5. slot 仍 open（落單前重算，防競態）
 *   6. 病人有效預約數上限、防同時段重複
 *   7. RTDB push 建立 registered 掛號（source: member_online）
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../../../backup/lib/http.js';
import { verifyTurnstile } from '../../../_lib/turnstile.js';
import {
    buildServiceContext,
    loadBookingConfig,
    listDoctors,
    evaluateDay,
    ipRateAllow,
    phoneMatchVariants,
    findPatientsByPhone,
    fetchActiveAppointmentsForPatient,
    rtdbPush,
    rtdbPatch,
    isoToHktDateStr,
    hktTodayStr,
    addDaysDateStr,
    hktWeekday
} from './lib/booking-core.js';

export const onRequestOptions = () => optionsResponse();

const RATE_MAX_IP = 20;       // 寫入端從嚴
const MAX_COMPLAINT_LEN = 200;

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const ip = request.headers.get('CF-Connecting-IP')
            || request.headers.get('X-Forwarded-For') || 'unknown';
        if (!(await ipRateAllow(env, ip, RATE_MAX_IP))) {
            return jsonResponse({
                error: 'RATE_LIMITED',
                message: '預約次數過多，請於 10 分鐘後再試'
            }, 429);
        }

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const patientId = body && body.patientId ? String(body.patientId) : '';
        const clinicId = body && body.clinicId ? String(body.clinicId) : '';
        const doctorUsername = body && body.doctor ? String(body.doctor) : '';
        const slot = body && body.slot ? String(body.slot) : '';
        let complaint = body && body.chiefComplaint ? String(body.chiefComplaint).trim() : '';
        if (complaint.length > MAX_COMPLAINT_LEN) complaint = complaint.slice(0, MAX_COMPLAINT_LEN);

        if (!patientId || patientId.length > 100) {
            return jsonResponse({ error: 'INVALID_PATIENT', message: '病人資料無效' }, 400);
        }
        if (!clinicId || clinicId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(clinicId)) {
            return jsonResponse({ error: 'INVALID_CLINIC', message: '診所資料無效' }, 400);
        }
        if (!doctorUsername || doctorUsername.length > 64) {
            return jsonResponse({ error: 'INVALID_DOCTOR', message: '請先選擇醫師' }, 400);
        }
        const slotDate = isoToHktDateStr(slot);
        if (!slotDate) {
            return jsonResponse({ error: 'INVALID_SLOT', message: '時段格式無效' }, 400);
        }

        // ── Turnstile ──
        const token = body && body.turnstileToken ? String(body.turnstileToken) : '';
        const human = await verifyTurnstile(token, ip, env);
        if (!human) {
            return jsonResponse({
                error: 'TURNSTILE_FAILED',
                message: '人機驗證失敗，請重新勾選驗證方塊後再試'
            }, 400);
        }

        const { auth, client } = await buildServiceContext(env);

        // ── 電話身份舉證 ──
        const variants = phoneMatchVariants(body && body.phone);
        if (!variants.length) {
            return jsonResponse({ error: 'INVALID_PHONE', message: '請輸入於診所登記的電話號碼' }, 400);
        }
        const patientDocs = await findPatientsByPhone(client, variants);
        const patientDoc = patientDocs.find((d) => d.id === patientId);
        if (!patientDoc) {
            return jsonResponse({
                error: 'PATIENT_MISMATCH',
                message: '此病人並非登記於該電話號碼，請重新查詢'
            }, 403);
        }

        // ── 設定 / 日期 ──
        const config = await loadBookingConfig(client, auth.token, clinicId);
        if (!config.enabled) {
            return jsonResponse({ error: 'BOOKING_DISABLED', message: '此診所目前未開放線上預約' }, 403);
        }
        const todayStr = hktTodayStr();
        const maxStr = addDaysDateStr(todayStr, config.advanceDays);
        if (slotDate < todayStr || slotDate > maxStr) {
            return jsonResponse({ error: 'DATE_OUT_OF_RANGE', message: '不在可預約日期範圍' }, 400);
        }
        if (config.closedWeekdays.includes(hktWeekday(slotDate))) {
            return jsonResponse({ error: 'CLINIC_CLOSED', message: '該日為診所休診日' }, 400);
        }
        const slotMs = new Date(slot).getTime();
        if (isNaN(slotMs)
            || slotMs < Date.now() + config.minLeadMinutes * 60000) {
            return jsonResponse({
                error: 'SLOT_TOO_SOON',
                message: `須於應診前最少 ${config.minLeadMinutes} 分鐘預約`
            }, 400);
        }

        // ── 醫師 / 時段重算 ──
        const doctors = await listDoctors(client);
        const doctor = doctors.find((d) => d.username === doctorUsername);
        if (!doctor) {
            return jsonResponse({ error: 'DOCTOR_NOT_FOUND', message: '找不到該醫師' }, 404);
        }
        const day = await evaluateDay(client, auth.token, clinicId, config, doctor, slotDate);
        if (day.closed) {
            return jsonResponse({ error: 'DOCTOR_OFF', message: '該醫師此日休診' }, 400);
        }
        const chosen = day.slots.find((s) => s.at === slot);
        if (!chosen || chosen.status !== 'open') {
            return jsonResponse({ error: 'SLOT_UNAVAILABLE', message: '此時段已滿或不可預約，請選擇其他時段' }, 409);
        }

        // ── 病人既有有效預約：上限＋防重複 ──
        const ownAppts = await fetchActiveAppointmentsForPatient(client, auth.token, patientId);
        if (ownAppts.length >= config.maxActivePerPatient) {
            return jsonResponse({
                error: 'TOO_MANY_ACTIVE',
                message: `每位會員最多同時保留 ${config.maxActivePerPatient} 個預約，請先取消舊預約`
            }, 409);
        }
        const duplicate = ownAppts.find((a) =>
            String(a.appointmentDoctor) === doctorUsername
            && isoToHktDateStr(a.appointmentTime) === slotDate
            && Math.abs(new Date(a.appointmentTime).getTime() - slotMs) < config.slotMinutes * 60000);
        if (duplicate) {
            return jsonResponse({
                error: 'DUPLICATE_APPOINTMENT',
                message: '您已預約該醫師此時段，請勿重複預約'
            }, 409);
        }

        // ── 建立掛號（push key 取代 Date.now()，避免高並發碰撞）──
        const nowIso = new Date().toISOString();
        const appointment = {
            patientId,
            patientName: patientDoc.data.name || '',
            appointmentTime: slot,
            appointmentDoctor: doctorUsername,
            isGeneralRegistration: false,
            doctorName: doctor.name,
            chiefComplaint: complaint || '無特殊主訴',
            status: 'registered',
            createdAt: nowIso,
            createdBy: 'member_online',
            clinicId,
            source: 'member_online'
        };
        const key = await rtdbPush(client, auth.token, 'appointments', appointment);
        if (!key) {
            return jsonResponse({ error: 'BOOKING_FAILED', message: '預約建立失敗，請稍後再試' }, 502);
        }
        appointment.id = key;
        await rtdbPatch(client, auth.token, `appointments/${key}`, { id: key });

        return jsonResponse({
            success: true,
            appointment: {
                id: key,
                appointmentTime: slot,
                doctor: doctorUsername,
                doctorName: doctor.name,
                status: 'registered',
                clinicId
            }
        });
    } catch (error) {
        console.error('appointment book failed:', error);
        if (error && error.message === 'TURNSTILE_NOT_CONFIGURED') {
            return jsonResponse({
                error: 'TURNSTILE_NOT_CONFIGURED',
                message: error.clientMessage || '人機驗證未完成設定'
            }, error.status || 500);
        }
        return jsonResponse({
            error: 'BOOKING_FAILED',
            message: '預約服務發生錯誤，請稍後再試'
        }, 500);
    }
}
