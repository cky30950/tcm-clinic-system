/* ============================================================
 * booking-core.js — 會員線上預約掛號共用核心
 * ------------------------------------------------------------
 * 所有 RTDB 讀寫均以 Service Account access token 進行（繞過 RTDB
 * Rules）；本模組只依賴 fetch。
 *
 * 預約記錄沿用現有 appointments 形狀（見 system.js confirmRegistration），
 * 額外加上 source: 'member_online' 供職員識別渠道。
 *
 * 設定來源（多層）：
 *   1. DEFAULT_BOOKING_CONFIG 常數（本檔）
 *   2. RTDB clinics/{clinicId}/bookingConfig 覆寫（職員日後可加管理 UI）
 * ============================================================ */

import { FirestoreClient } from '../../../backup/lib/firestore.js';

/* ---------------- 預設預約規則 ---------------- */

export const DEFAULT_BOOKING_CONFIG = Object.freeze({
    enabled: true,
    advanceDays: 14,          // 最多預約未來天數
    slotMinutes: 15,          // 每節長度（分）
    perSlotCapacity: 1,       // 每醫師每節線上名額
    dailyCapacity: 40,        // 每醫師每日線上名額上限
    maxActivePerPatient: 1,   // 每病人同時有效預約上限
    maxPerDayPerPatient: 1,   // 每病人每日預約上限
    minLeadMinutes: 60,       // 最遲於應診前 60 分鐘預約
    cancelLeadMinutes: 120,   // 最遲於應診前 120 分鐘自行取消
    closedWeekdays: [0],      // 每週休診日（0=日）
    sessions: [               // 每日應診時段（HKT）
        { start: '09:00', end: '12:00' },
        { start: '14:00', end: '18:00' }
    ]
});

export const ACTIVE_STATUSES = Object.freeze(['registered', 'waiting', 'consulting']);
export const HKT_OFFSET_MIN = 8 * 60;

/* ---------------- 時間（固定 HKT +08:00，香港無夏令時間） ---------------- */

export function hktTodayStr(nowMs = Date.now()) {
    return new Date(nowMs + HKT_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

export function addDaysDateStr(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00+08:00`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function hktWeekday(dateStr) {
    return new Date(`${dateStr}T12:00:00+08:00`).getUTCDay();
}

export function isValidDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T12:00:00+08:00`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// slot ISO → 所屬 HKT 日期
export function isoToHktDateStr(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Date(d.getTime() + HKT_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

// 當日 HKT 00:00–23:59 對應的 UTC ISO（可直接餵 RTDB range 查詢）。
// 必須用 UTC（Z）表示：appointmentTime 存的是 toISOString()（Z 尾碼），
// RTDB range 為字串字典序比對，混雜 +08:00 尾碼會因日期前綴錯位而漏比
// （HKT D 日 = UTC D-1 16:00 起）。
export function hktDayRangeIso(dateStr) {
    const midnightUtc = new Date(`${dateStr}T00:00:00+08:00`).getTime();
    return {
        start: new Date(midnightUtc).toISOString(),
        end: new Date(midnightUtc + 24 * 3600 * 1000 - 1).toISOString()
    };
}

function nowHktMinutes(d = new Date()) {
    const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    return (utcMin + HKT_OFFSET_MIN) % 1440;
}

function isoToHktMin(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return -1;
    return (d.getUTCHours() * 60 + d.getUTCMinutes() + HKT_OFFSET_MIN) % 1440;
}

function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

function toHM(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/* ---------------- 限速（與 lookup.js 同款：isolate 滑窗 + 可選 KV） ---------------- */

const RATE_WINDOW_MS = 10 * 60 * 1000;
const rateHits = new Map();

function slidingWindowHit(key, max) {
    const now = Date.now();
    let hits = rateHits.get(key);
    if (!hits) {
        hits = [];
        rateHits.set(key, hits);
    }
    while (hits.length && now - hits[0] > RATE_WINDOW_MS) hits.shift();
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
}

async function kvWindowAllow(env, bucketKey, max) {
    const kv = env && env.RATE_LIMIT_KV;
    if (!kv || typeof kv.get !== 'function') return true;
    const periodSec = 600;
    const windowIndex = Math.floor(Date.now() / 1000 / periodSec);
    const key = `mba:${bucketKey}:${windowIndex}`;
    try {
        const raw = await kv.get(key, { cacheTtl: 0 });
        const count = raw ? (parseInt(raw, 10) || 0) : 0;
        if (count >= max) return false;
        await kv.put(key, String(count + 1), { expirationTtl: periodSec + 60 });
        return true;
    } catch (_e) {
        return true; // KV 異常 fail-open
    }
}

/**
 * 公開端點 IP 限速。false＝已超額（呼叫端回 429）。
 */
export async function ipRateAllow(env, ip, max) {
    if (rateHits.size >= 2000) rateHits.clear();
    return slidingWindowHit(`ip:${ip}`, max)
        && (await kvWindowAllow(env, `ip:${ip}`, max));
}

/* ---------------- RTDB REST ---------------- */

function rtdbBaseOf(clientOrUrl) {
    const url = typeof clientOrUrl === 'string' ? clientOrUrl : clientOrUrl.rtdbUrl;
    return String(url || '').replace(/\/$/, '');
}

async function rtdbRequest(clientOrUrl, token, path, init = {}) {
    const base = rtdbBaseOf(clientOrUrl);
    let url = `${base}/${path}.json`;
    if (init.query) {
        const qs = Object.entries(init.query)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
        if (qs.length) url += '?' + qs.join('&');
    }
    const headers = { 'Authorization': `Bearer ${token}` };
    let body;
    if (init.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(init.body);
    }
    const response = await fetch(url, { method: init.method || 'GET', headers, body });
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (_e) {
            throw new Error(`RTDB 回應無法解析 (HTTP ${response.status}): ${text.slice(0, 200)}`);
        }
    }
    if (!response.ok) {
        const msg = data && data.error ? data.error : `HTTP ${response.status}`;
        throw new Error(`RTDB ${init.method || 'GET'} ${path} 失敗: ${msg}`);
    }
    return data;
}

export function rtdbGet(clientOrUrl, token, path, query) {
    return rtdbRequest(clientOrUrl, token, path, { query });
}

export function rtdbPatch(clientOrUrl, token, path, fields) {
    return rtdbRequest(clientOrUrl, token, path, { method: 'PATCH', body: fields });
}

export async function rtdbPush(clientOrUrl, token, path, value) {
    const data = await rtdbRequest(clientOrUrl, token, path, { method: 'POST', body: value });
    return data && data.name ? String(data.name) : '';
}

/* ---------------- 預約設定 ---------------- */

const CONFIG_CACHE_TTL_MS = 60 * 1000;
const configCache = new Map(); // clinicId → { at, config }

function sanitizeConfig(over) {
    // 只挑已知型別的覆寫欄位，避免 RTDB 被塞怪值直接注入下游計算
    const out = {};
    if (over && typeof over === 'object') {
        if (typeof over.enabled === 'boolean') out.enabled = over.enabled;
        for (const k of ['advanceDays', 'slotMinutes', 'perSlotCapacity',
            'dailyCapacity', 'maxActivePerPatient', 'maxPerDayPerPatient',
            'minLeadMinutes', 'cancelLeadMinutes']) {
            const n = Number(over[k]);
            if (Number.isInteger(n) && n >= 0 && n <= 10000) out[k] = n;
        }
        if (Array.isArray(over.closedWeekdays)) {
            const days = over.closedWeekdays
                .map((x) => Number(x))
                .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
            if (days.length) out.closedWeekdays = Array.from(new Set(days));
        }
        if (Array.isArray(over.sessions)) {
            const sessions = over.sessions
                .map((s) => s && ({ start: String(s.start || ''), end: String(s.end || '') }))
                .filter((s) => parseHM(s.start) >= 0 && parseHM(s.end) > parseHM(s.start));
            if (sessions.length) out.sessions = sessions;
        }
    }
    return out;
}

/**
 * 以診所文件（clinics/{clinicId}）的結構化營業時間生成應診 sessions：
 * 營業 [open,close]；若設定午飯 [ls,le]，則切成開診两段，午飯時段不給約。
 * 欄位缺失或無效 → []（由呼叫端退回預設 sessions）。
 */
function sessionsFromClinicDoc(clinicDoc) {
    const d = clinicDoc && clinicDoc.data ? clinicDoc.data : clinicDoc;
    const open = parseHM(d && d.businessHoursStart);
    const close = parseHM(d && d.businessHoursEnd);
    if (open < 0 || close <= open) return [];
    const ls = parseHM(d && d.lunchStart);
    const le = parseHM(d && d.lunchEnd);
    const hasLunch = ls >= 0 && le >= 0 && le > ls;
    const windows = [];
    if (hasLunch) {
        if (ls > open) windows.push([open, ls]);
        if (close > le) windows.push([le, close]);
        if (!windows.length) return [];
    } else {
        windows.push([open, close]);
    }
    return windows.map(([a, b]) => ({ start: toHM(a), end: toHM(b) }));
}

export async function loadBookingConfig(clientOrUrl, token, clinicId) {
    const cached = configCache.get(clinicId);
    if (cached && Date.now() - cached.at < CONFIG_CACHE_TTL_MS) return cached.config;
    // 並行：① RTDB bookingConfig 覆寫（規則數值）；② Firestore 診所文件
    // （營業時間＋午飯時間為預約時段的權威來源）
    const [override, clinicDoc] = await Promise.all([
        rtdbGet(clientOrUrl, token,
            `clinics/${encodeURIComponent(clinicId)}/bookingConfig`)
            .then((raw) => sanitizeConfig(raw))
            .catch(() => ({})),
        (clientOrUrl && typeof clientOrUrl.getDocument === 'function')
            ? clientOrUrl.getDocument(`clinics/${encodeURIComponent(clinicId)}`)
                .then((doc) => doc || null)
                .catch(() => null)
            : Promise.resolve(null)
    ]);
    const config = Object.assign({}, DEFAULT_BOOKING_CONFIG, override);
    // 營業時間掛鉤：診所文件設定了營業時間 → 預約 sessions 以其為準
    // （午飯自動扣除）；未設定才使用預設 sessions。
    const clinicSessions = sessionsFromClinicDoc(clinicDoc);
    if (clinicSessions.length) {
        config.sessions = clinicSessions;
        config.hoursSource = 'clinic';
    } else {
        config.hoursSource = 'default';
    }
    configCache.set(clinicId, { at: Date.now(), config });
    return config;
}

/* ---------------- 醫師列表 ---------------- */

const DOCTORS_CACHE_TTL_MS = 5 * 60 * 1000;
let doctorsCache = null; // { at, doctors }

/**
 * 全部啟用中醫師（過渡期不做跨診所過濾，與 firestore.rules 錢包政策一致）。
 * @returns {Promise<Array<{username,name,registrationNumber,docId}>>}
 */
export async function listDoctors(client) {
    if (doctorsCache && Date.now() - doctorsCache.at < DOCTORS_CACHE_TTL_MS) {
        return doctorsCache.doctors;
    }
    const page = await client.queryCollection({
        collectionId: 'users',
        limit: 300
    });
    const doctors = page.docs
        .filter((d) => d.data && d.data.active === true
            && String(d.data.position || '') === '醫師'
            && d.data.username)
        .map((d) => ({
            docId: d.id,
            username: String(d.data.username),
            name: String(d.data.name || d.data.username),
            registrationNumber: d.data.registrationNumber
                ? String(d.data.registrationNumber) : ''
        }));
    doctorsCache = { at: Date.now(), doctors };
    return doctors;
}

/* ---------------- 排班 / 可約時段計算 ---------------- */

async function loadMonthShifts(client, token, clinicId, dateStr) {
    const monthKey = dateStr.slice(0, 7);
    let data;
    try {
        data = await rtdbGet(client, token,
            `clinics/${encodeURIComponent(clinicId)}/scheduleShifts/${monthKey}`);
    } catch (_e) {
        data = null;
    }
    if (!data || typeof data !== 'object') return { hasAny: false, shifts: [] };
    const shifts = [];
    for (const [id, obj] of Object.entries(data)) {
        if (obj && typeof obj === 'object' && obj.date) {
            shifts.push({ id, ...obj });
        }
    }
    return { hasAny: shifts.length > 0, shifts };
}

function findDoctorShift(shifts, doctorDocId, dateStr) {
    return shifts.find((s) => String(s.staffId) === String(doctorDocId)
        && String(s.date) === dateStr
        && s.status !== 'cancelled' && s.status !== 'rejected') || null;
}

// 應診窗口 = 預設 sessions ∩ 當日排班
function availabilityWindows(config, doctorShift) {
    if (!doctorShift) {
        return config.sessions
            .map((s) => ({ start: parseHM(s.start), end: parseHM(s.end) }))
            .filter((w) => w.start >= 0 && w.end > w.start);
    }
    const shStart = parseHM(doctorShift.startTime);
    const shEnd = parseHM(doctorShift.endTime);
    if (shStart < 0 || shEnd <= shStart) return [];
    const windows = [];
    for (const sess of config.sessions) {
        const start = Math.max(parseHM(sess.start), shStart);
        const end = Math.min(parseHM(sess.end), shEnd);
        if (end > start) windows.push({ start, end });
    }
    return windows;
}

function generateSlots(config, windows, dateStr) {
    const slots = [];
    for (const w of windows) {
        for (let m = w.start; m + config.slotMinutes <= w.end; m += config.slotMinutes) {
            slots.push({
                startMin: m,
                label: toHM(m),
                at: new Date(`${dateStr}T${toHM(m)}:00+08:00`).toISOString()
            });
        }
    }
    return slots;
}

/**
 * 讀取某日掛號（RTDB range on appointmentTime）。
 * @returns {Promise<Array>} appointment 物件（含 id）
 */
export async function fetchDayAppointments(client, token, dateStr) {
    const range = hktDayRangeIso(dateStr);
    let data;
    try {
        data = await rtdbGet(client, token, 'appointments', {
            orderBy: '"appointmentTime"',
            startAt: `"${range.start}"`,
            endAt: `"${range.end}"`
        });
    } catch (_e) {
        data = null;
    }
    if (!data || typeof data !== 'object') return [];
    return Object.entries(data).map(([id, v]) => ({ id, ...v }));
}

/**
 * 為 slots 加上 status：open / full / closed 與 remaining。
 * 規則：
 *  - 今日已過 minLead 之 slot → closed
 *  - 該醫師該 slot 已約滿 perSlotCapacity → full
 *  - 該醫師當日已達 dailyCapacity → full
 * 只計指定醫師（appointmentDoctor 相符）之有效掛號；一般掛號不計入。
 */
export function decorateSlots(config, slots, dayAppointments, doctorUsername, dateStr) {
    const active = dayAppointments
        .filter((a) => ACTIVE_STATUSES.includes(a.status))
        .filter((a) => String(a.appointmentDoctor) === doctorUsername);

    const usedBySlot = new Map(); // startMin → count
    active.forEach((a) => {
        const min = isoToHktMin(a.appointmentTime);
        if (min < 0) return;
        const gridStart = Math.floor(min / config.slotMinutes) * config.slotMinutes;
        usedBySlot.set(gridStart, (usedBySlot.get(gridStart) || 0) + 1);
    });
    const dailyCount = active.length;
    const cutoff = nowHktMinutes() + config.minLeadMinutes;
    const isToday = dateStr === hktTodayStr();

    return slots.map((s) => {
        const used = usedBySlot.get(s.startMin) || 0;
        let status = 'open';
        if (isToday && s.startMin < cutoff) {
            status = 'closed';
        } else if (dailyCount >= config.dailyCapacity
            || used >= config.perSlotCapacity) {
            status = 'full';
        }
        return {
            at: s.at,
            label: s.label,
            status,
            remaining: Math.max(0, config.perSlotCapacity - used)
        };
    });
}

/**
 * 一日完整評估：回傳 { closed, reason, slots }。
 * closed＝診所休診／醫師無排班；slots 為已 decorate 結果。
 */
export async function evaluateDay(client, token, clinicId, config, doctor, dateStr) {
    const { hasAny, shifts } = await loadMonthShifts(client, token, clinicId, dateStr);
    const doctorShift = hasAny ? findDoctorShift(shifts, doctor.docId, dateStr) : null;
    if (hasAny && !doctorShift) {
        return { closed: true, reason: 'doctor_off', slots: [] };
    }
    const windows = availabilityWindows(config, doctorShift);
    if (!windows.length) {
        return { closed: true, reason: 'doctor_off', slots: [] };
    }
    const rawSlots = generateSlots(config, windows, dateStr);
    const dayAppointments = await fetchDayAppointments(client, token, dateStr);
    return {
        closed: false,
        reason: '',
        slots: decorateSlots(config, rawSlots, dayAppointments, doctor.username, dateStr)
    };
}

/* ---------------- 病人驗證（與 lookup.js 相同電話比對邏輯） ---------------- */

export function eqFilter(fieldPath, value) {
    return { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value } };
}

// 不限制電話位數，產生各種可能的登記格式（同 lookup.js phoneMatchVariants）
export function phoneMatchVariants(raw) {
    const input = String(raw || '').trim();
    if (!input) return [];
    const variants = new Set();
    variants.add(input);
    const digits = input.replace(/\D/g, '');
    if (digits.length < 4) return [];
    variants.add(digits);
    const locals = [];
    if (digits.length === 11 && digits.indexOf('852') === 0) {
        locals.push(digits.slice(3));
    } else if (digits.length === 8) {
        locals.push(digits);
    }
    locals.forEach((l8) => {
        variants.add(l8);
        variants.add('852' + l8);
        variants.add('+852' + l8);
        variants.add(`${l8.slice(0, 4)} ${l8.slice(4)}`);
        variants.add(`+852 ${l8.slice(0, 4)} ${l8.slice(4)}`);
        variants.add(`(852) ${l8.slice(0, 4)}-${l8.slice(4)}`);
    });
    return Array.from(variants);
}

export async function findPatientsByPhone(client, variants) {
    const pages = await Promise.all(
        variants.map((v) => client.queryCollection({
            collectionId: 'patients',
            where: eqFilter('phone', { stringValue: v }),
            limit: 10
        }))
    );
    const byId = new Map();
    pages.forEach((page) => {
        page.docs.forEach((d) => {
            if (!byId.has(d.id)) byId.set(d.id, d);
        });
    });
    return Array.from(byId.values()).slice(0, 10);
}

/**
 * 查詢病人全部有效掛號（RTDB orderBy patientId）。
 * 若 RTDB Rules 未對 patientId 設索引仍可運作（伺服器全掃），建議日後加上
 * ".indexOn": ["patientId"] 以提升效能。
 */
// 病人全部掛號（不限狀態；RTDB patientId 索引一次取回）
export async function fetchAppointmentsForPatient(client, token, patientId) {
    let data;
    try {
        data = await rtdbGet(client, token, 'appointments', {
            orderBy: '"patientId"',
            equalTo: `"${String(patientId).replace(/"/g, '')}"`
        });
    } catch (_e) {
        data = null;
    }
    if (!data || typeof data !== 'object') return [];
    return Object.entries(data)
        .map(([id, v]) => ({ id, ...v }));
}

export async function fetchActiveAppointmentsForPatient(client, token, patientId) {
    const all = await fetchAppointmentsForPatient(client, token, patientId);
    return all.filter((a) => ACTIVE_STATUSES.includes(a.status));
}

/* ---------------- lookup 用：批次取多病人未來掛號 ---------------- */

/**
 * 以 appointmentTime range 一次取回 HKT 今日～未來 days 天的掛號，
 * 再依 patientId 分組（避免每病人 fan-out）。
 * @returns {Promise<Map<string, Array>>} patientId → 約會（升冪，上限 cap）
 */
export async function fetchUpcomingByPatient(client, token, days, capPerPatient = 20) {
    const todayStr = hktTodayStr();
    const endStr = addDaysDateStr(todayStr, days);
    const startIso = hktDayRangeIso(todayStr).start;
    const endIso = hktDayRangeIso(endStr).end;
    let data;
    try {
        data = await rtdbGet(client, token, 'appointments', {
            orderBy: '"appointmentTime"',
            startAt: `"${startIso}"`,
            endAt: `"${endIso}"`
        });
    } catch (_e) {
        data = null;
    }
    const map = new Map();
    if (!data || typeof data !== 'object') return map;
    Object.entries(data).forEach(([id, v]) => {
        if (!v || !v.patientId) return;
        if (!ACTIVE_STATUSES.includes(v.status)) return;
        const pid = String(v.patientId);
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid).push({ id, ...v });
    });
    map.forEach((list) => {
        list.sort((a, b) => String(a.appointmentTime).localeCompare(String(b.appointmentTime)));
        if (list.length > capPerPatient) list.length = capPerPatient;
    });
    return map;
}

/* ---------------- 常用建構 ---------------- */

export async function buildServiceContext(env) {
    const { getAccessToken } = await import('../../../backup/lib/google-auth.js');
    const auth = await getAccessToken(env);
    const client = new FirestoreClient(
        auth.token,
        auth.projectId,
        env.FIREBASE_RTDB_URL || ''
    );
    return { auth, client };
}
