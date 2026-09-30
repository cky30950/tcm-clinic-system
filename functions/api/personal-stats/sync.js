/* ============================================================
 * POST /api/personal-stats/sync
 * ------------------------------------------------------------
 * 診症新增／更新／刪除後，以 Service Account 增量同步個人統計
 * 摘要。客戶端對摘要集合無寫入權限。
 * 請求：{ before?: object|null, after?: object|null }
 * ============================================================ */

import { syncPersonalStats } from './lib/stats-store.js';
import { requireStaff } from '../wallet/lib/http.js';
import {
    resolveStaffUser,
    jsonResponse,
    optionsResponse,
    errorResponse
} from '../admin/lib/http.js';

export const onRequestOptions = () => optionsResponse();

async function resolveCallerUsername(claims, env) {
    const fromClaim = String(claims.username || '').trim();
    if (fromClaim) return fromClaim;
    const resolved = await resolveStaffUser(env, claims);
    return String((resolved.data && resolved.data.username) || '').trim();
}

export async function onRequestPost({ request, env }) {
    try {
        const claims = await requireStaff(request, env);
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
        const username = await resolveCallerUsername(claims, env);
        if (!username) {
            return jsonResponse({ error: 'USERNAME_MISSING', message: '無法解析帳號使用者名稱' }, 409);
        }
        const result = await syncPersonalStats(env, claims.sub, before, after);
        return jsonResponse(result);
    } catch (error) {
        return errorResponse(error);
    }
}
