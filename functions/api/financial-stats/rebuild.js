/* ============================================================
 * POST /api/financial-stats/rebuild
 * ------------------------------------------------------------
 * 全量重建指定日期範圍的 dailyFinancialStats。
 * 管理員／系統端點，用於首次建立聚合或資料不一致時修正。
 *
 * 請求：
 *   {
 *     startDate: "2026-09-01",   // 必填，YYYY-MM-DD
 *     endDate:   "2026-09-29",   // 必填，YYYY-MM-DD
 *     clinicId:  "hkpacific"     // 可選，null = 全部診所
 *   }
 * ============================================================ */

import { rebuildDailyStatsForDateRange } from './lib/stats-store.js';
import { requireStaff } from '../wallet/lib/http.js';
import {
    jsonResponse,
    optionsResponse,
    errorResponse
} from '../admin/lib/http.js';

export const onRequestOptions = () => optionsResponse();

function isValidDateKey(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function onRequestPost({ request, env }) {
    try {
        await requireStaff(request, env);
        let body = {};
        try {
            body = await request.json();
        } catch (_e) {
            body = {};
        }
        if (!body || typeof body !== 'object') body = {};
        const startDate = body.startDate && isValidDateKey(body.startDate) ? body.startDate : null;
        const endDate = body.endDate && isValidDateKey(body.endDate) ? body.endDate : null;
        if (!startDate || !endDate) {
            return jsonResponse(
                { error: 'INVALID_DATE', message: 'startDate 與 endDate 必須為 YYYY-MM-DD 格式' },
                400
            );
        }
        const clinicId = body.clinicId ? String(body.clinicId) : null;
        const result = await rebuildDailyStatsForDateRange(env, startDate, endDate, clinicId);
        return jsonResponse(result);
    } catch (error) {
        return errorResponse(error);
    }
}
