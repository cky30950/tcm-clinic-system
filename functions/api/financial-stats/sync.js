/* ============================================================
 * POST /api/financial-stats/sync
 * ------------------------------------------------------------
 * 診症新增／更新／刪除後，以 Service Account 增量同步
 * dailyFinancialStats 聚合。
 *
 * 請求：{ before?: object|null, after?: object|null }
 * ============================================================ */

import { syncDailyStats } from './lib/stats-store.js';
import { requireStaff } from '../wallet/lib/http.js';
import {
    jsonResponse,
    optionsResponse,
    errorResponse
} from '../admin/lib/http.js';

export const onRequestOptions = () => optionsResponse();

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
        const before = (body.before && typeof body.before === 'object') ? body.before : null;
        const after = (body.after && typeof body.after === 'object') ? body.after : null;
        if (!before && !after) {
            return jsonResponse({ error: 'EMPTY_SYNC', message: 'before 與 after 不可同時為空' }, 400);
        }
        const result = await syncDailyStats(env, before, after);
        return jsonResponse(result);
    } catch (error) {
        return errorResponse(error);
    }
}
