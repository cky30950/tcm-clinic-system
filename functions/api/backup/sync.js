/* ============================================================
 * POST /api/backup/sync
 * 手動觸發 Firestore → R2 備份同步（管理員）。
 * 亦接受 X-Backup-Cron-Secret（供外部排程服務呼叫）。
 * Body（選填）：{ "forceBaseline": false }
 * ============================================================ */

import { runBackupSync } from './lib/sync.js';
import { jsonResponse, optionsResponse, corsHeaders, authenticateAdmin, isAuthorizedCronCall } from './lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

export async function onRequestPost(context) {
    const { request, env } = context;
    let actor = null;

    try {
        if (isAuthorizedCronCall(request, env)) {
            actor = 'cron-secret';
        } else {
            const admin = await authenticateAdmin(request, env);
            actor = admin.email || admin.uid;
        }

        let body = {};
        try {
            body = await request.json();
        } catch (_e) {
            body = {};
        }
        const forceBaseline = !!(body && body.forceBaseline);

        const result = await runBackupSync(env, {
            trigger: actor === 'cron-secret' ? 'cron-secret' : 'manual',
            forceBaseline,
            actor
        });
        return jsonResponse(result, 200);
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        if (status >= 400 && status < 500) {
            return jsonResponse({
                error: 'BACKUP_SYNC_FAILED',
                message: error.message || '備份同步要求被拒絕'
            }, status);
        }
        console.error('[backup-sync] 內部錯誤:', error && (error.stack || error.message || error));
        return jsonResponse({
            error: 'BACKUP_SYNC_FAILED',
            message: '備份同步失敗，請稍後再試'
        }, 500);
    }
}

export async function onRequestGet() {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED', message: '請使用 POST 觸發同步' }, 405);
}
