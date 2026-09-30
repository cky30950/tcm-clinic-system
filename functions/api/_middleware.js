/* ============================================================
 * 全域 API middleware（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 對 /api/* 底下所有路由生效，自動設定請求上下文（供 corsHeaders 等
 * 共用模組讀取 request/env）。不需逐個 onRequest* handler 手動呼叫。
 *
 * Cloudflare Pages Functions middleware 執行模型：
 *   - middleware 與路由 handler 在同一 isolate 同一次請求中循序執行
 *   - isolate 單線程，每請求一個 isolate（熱 isolate 復用時依然單線程）
 *   - 故以模組級變數傳遞上下文是安全的
 * ============================================================ */

import { setRequestContext, clearRequestContext } from './_lib/cors.js';

export async function onRequest(context) {
    const { request, env, next } = context;
    setRequestContext(request, env);
    try {
        return await next();
    } finally {
        // 確保即使 handler 丟錯也會清除，避免殘留到下一個請求
        clearRequestContext();
    }
}
