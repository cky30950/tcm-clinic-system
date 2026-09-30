/* ============================================================
 * 統一 CORS + 安全響應標頭（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 所有 Pages Functions 的 corsHeaders / securityHeaders 單一權威入口。
 *
 * 使用方式（Cloudflare Worker 單線程特性，模組級變數安全）：
 *
 *   import { corsHeaders, securityHeaders, setRequestContext } from '../_lib/cors.js';
 *
 *   // 所有 /api/* 路由自動由 _middleware.js 設好上下文，
 *   // route handler 內直接 corsHeaders() 即可，無需再傳 request/env。
 *
 * corsHeaders() 無參數呼叫時自動讀取當前請求的 request/env。
 *
 * CORS 白名單來源（Cloudflare Pages Environment Variables）：
 *   ALLOWED_ORIGINS  — 逗號分隔，如 "https://clinic.pages.dev,https://www.clinic.com"
 *
 * 安全邊界：未設定白名單時一律回 '*'，絕不回傳 credentials:true。
 * ============================================================ */

// ── 模組級請求上下文（Worker 單線程 isolate 內安全） ──
let _currentRequest = null;
let _currentEnv = null;

/** 設定當前請求的 request/env（由 _middleware.js 自動呼叫） */
export function setRequestContext(request, env) {
    _currentRequest = request;
    _currentEnv = env;
}

/** 清除請求上下文（由 _middleware.js finally 自動呼叫） */
export function clearRequestContext() {
    _currentRequest = null;
    _currentEnv = null;
}

function parseAllowedOrigins(env) {
    if (!env) return [];
    const raw = env.ALLOWED_ORIGINS || '';
    if (!raw || typeof raw !== 'string') return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * 根據請求的 Origin header 與白名單配置決定：
 *   - allowedOrigin：回傳給瀏覽器的 Origin 值
 *   - allowCredentials：是否加上 credentials:true
 *
 * 安全規則：
 *   1. 無 Origin header → allowedOrigin='*', credentials=false
 *   2. 有 Origin + 白名單有設定 + Origin 在名單內 → allowedOrigin=Origin, credentials=true
 *   3. 有 Origin + 白名單有設定 + Origin 不在名單內 → allowedOrigin=*, credentials=false
 *   4. 有 Origin + 白名單未設定 → allowedOrigin='*', credentials=false（fail-safe，
 *      與原始行為一致，等到 ALLOWED_ORIGINS 設定後自動收窄）
 */
function evaluateCors(request, env) {
    const origin = request && request.headers
        ? (request.headers.get('Origin') || request.headers.get('origin') || '')
        : '';
    if (!origin) return { allowedOrigin: '*', allowCredentials: false };

    const allowed = parseAllowedOrigins(env);
    if (allowed.length === 0) {
        // 未設定白名單 → 回 '*'（fail-safe，與部署前行為一致）
        return { allowedOrigin: '*', allowCredentials: false };
    }

    // 精確比對
    if (allowed.includes(origin)) {
        return { allowedOrigin: origin, allowCredentials: true };
    }

    // 子域名萬用字元（https://*.clinic.com → 允 https://sub.clinic.com）
    for (const rule of allowed) {
        if (rule.startsWith('https://*.') && origin.startsWith('https://')) {
            const suffix = rule.slice('https://*'.length); // ".clinic.com"
            try {
                const url = new URL(origin);
                if (url.hostname.endsWith(suffix.slice(1))) {
                    return { allowedOrigin: origin, allowCredentials: true };
                }
            } catch (_e) { /* 不合法 URL，跳過 */ }
        }
    }

    // Origin 不在白名單 → 回 '*'，無效的跨域請求會被瀏覽器拒絕
    return { allowedOrigin: '*', allowCredentials: false };
}

/**
 * 統一 CORS 標頭（含動態 Origin 白名單 + credentials 安全邊界）。
 *
 * @param {object} [options]
 * @param {string} [options.methods]  覆寫允許的 HTTP methods
 * @param {string} [options.headers]  覆寫允許的 request headers
 * @param {string} [options.maxAge]   預檢快取秒數
 */
export function corsHeaders(options = {}) {
    const { allowedOrigin, allowCredentials } = evaluateCors(_currentRequest, _currentEnv);
    const methods = options.methods || 'GET, POST, PUT, DELETE, OPTIONS';
    const headers = options.headers || 'Authorization, Content-Type, X-Room-Session, X-Turnstile-Token, X-Admin-Bootstrap-Secret, X-Backup-Cron-Secret, X-Attachment-Reap-Secret, Idempotency-Key';
    const maxAge = options.maxAge || '86400';

    const result = {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': headers,
        'Access-Control-Max-Age': maxAge,
        'Vary': 'Origin'
    };
    if (allowCredentials) {
        result['Access-Control-Allow-Credentials'] = 'true';
    }
    return result;
}

/**
 * API 回應共用的安全標頭集合。
 * 補充 _headers（靜態資源層）未覆蓋的 Functions API 回應。
 */
export function securityHeaders() {
    return {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Download-Options': 'noopen'
    };
}

/** 合併 CORS + 安全標頭 */
export function apiHeaders(options = {}) {
    return Object.assign({}, corsHeaders(options), securityHeaders());
}
