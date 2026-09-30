/* ============================================================
 * POST /api/personal-stats/rebuild
 * ------------------------------------------------------------
 * 為「呼叫者本人」（auth uid）全量重建個人統計摘要。
 * 以 Service Account 繞過 Rules 執行；重建期間透過 state 文件
 * 的 lease + rebuildDirty 與增量同步協調，不丟更新。
 * 回應：{ success, rebuilt, busy?, passes?, summaryBucketCount? }
 * ============================================================ */

import { rebuildPersonalStatsForOwner } from './lib/stats-store.js';
import { requireStaff } from '../wallet/lib/http.js';
import {
    resolveStaffUser,
    jsonResponse,
    optionsResponse,
    errorResponse
} from '../admin/lib/http.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost({ request, env }) {
    try {
        const claims = await requireStaff(request, env);
        let body = {};
        try {
            body = await request.json();
        } catch (_e) {
            body = {};
        }
        const force = !!(body && body.force === true);
        let username = String(claims.username || '').trim();
        if (!username) {
            const resolved = await resolveStaffUser(env, claims);
            username = String((resolved.data && resolved.data.username) || '').trim();
        }
        if (!username) {
            return jsonResponse({ error: 'USERNAME_MISSING', message: '無法解析帳號使用者名稱' }, 409);
        }
        const result = await rebuildPersonalStatsForOwner(env, claims.sub, username, force);
        return jsonResponse(result);
    } catch (error) {
        return errorResponse(error);
    }
}
