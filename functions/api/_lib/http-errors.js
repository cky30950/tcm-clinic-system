/* ============================================================
 * API 共用錯誤回應
 * ------------------------------------------------------------
 * 統一收口端點 catch：
 *  - 4xx（可預期的客戶端錯誤，如 StoreError/SessionError/401/403）：
 *    回我們自己撰寫的錯誤訊息；
 *  - 5xx（上游／程式錯誤）：只回通用訊息，完整錯誤（含 Firestore／
 *    Identity Toolkit 原文、堆疊）僅寫進伺服器記錄，不再外洩給客戶端。
 * ============================================================ */

import { jsonResponse } from '../backup/lib/http.js';

export const GENERIC_500_MESSAGE = '伺服器暫時無法處理請求，請稍後再試';

/**
 * @param {Error} error 捕獲到的錯誤（帶 .status／.code 者視為可預期錯誤）
 * @param {object} [opts]
 * @param {string} [opts.code='INTERNAL_ERROR'] 5xx 時回傳的錯誤代碼
 * @param {string} [opts.message] 5xx 時（及無訊息 4xx）的通用訊息
 * @param {number} [opts.fallbackStatus=500] 無 status 欄位時的狀態碼
 */
export function errorJson(error, opts = {}) {
    const fallbackStatus = Number.isInteger(opts.fallbackStatus) ? opts.fallbackStatus : 500;
    const status = Number(error && error.status);
    const genericMessage = opts.message || GENERIC_500_MESSAGE;

    // 可預期的客戶端錯誤：訊息為後端自行撰寫，可直接呈現
    if (Number.isInteger(status) && status >= 400 && status < 500) {
        return jsonResponse({
            error: (error && error.code) || opts.code || 'REQUEST_ERROR',
            message: (error && error.message) || genericMessage
        }, status);
    }

    // 上游或程式錯誤：完整內容只進記錄，不回客戶端
    console.error('[api] 內部錯誤:', error && (error.stack || error.message || error));
    return jsonResponse({
        error: opts.code || 'INTERNAL_ERROR',
        message: genericMessage
    }, fallbackStatus);
}
