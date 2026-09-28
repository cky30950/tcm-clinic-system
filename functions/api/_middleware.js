/* ============================================================
 * /api 全域中間層：統一 CORS
 * ------------------------------------------------------------
 * 舊制所有端點回 Access-Control-Allow-Origin: *（任何網站皆可跨源
 * 呼叫）。改為「來源白名單」：只對核可的 Origin 回 ACAO；
 * 同源請求（系統自身頁面）與外部排程（無 Origin）不需要 CORS 標頭。
 *
 * 額外網域可於環境變數 CORS_ALLOWED_ORIGINS 以逗號分隔加入
 * （例如 Pages preview 網域）。
 *
 * OPTIONS 預檢在此統一處理，端點自帶的 onRequestOptions 不會再被
 * 跨源請求直接使用（同源瀏覽器根本不發預檢）。
 * ============================================================ */

const PROD_ALLOWED_ORIGINS = new Set([
    'https://drgreattcm.com',
    'https://www.drgreattcm.com'
]);

const ALLOW_METHODS = 'GET, POST, OPTIONS';
const ALLOW_HEADERS = [
    'Authorization',
    'Content-Type',
    'X-Admin-Bootstrap-Secret',
    'X-Backup-Cron-Secret',
    'X-Attachment-Reap-Secret',
    'X-Room-Session'
].join(', ');

function resolveAllowedOrigin(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin) return '';
    if (PROD_ALLOWED_ORIGINS.has(origin)) return origin;
    const extra = String((env && env.CORS_ALLOWED_ORIGINS) || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return extra.includes(origin) ? origin : '';
}

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': ALLOW_METHODS,
        'Access-Control-Allow-Headers': ALLOW_HEADERS,
        'Access-Control-Max-Age': '86400'
    };
}

export async function onRequest(context) {
    const { request, env, next } = context;
    const allowedOrigin = resolveAllowedOrigin(request, env);

    // 統一處理預檢
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: allowedOrigin ? corsHeaders(allowedOrigin) : { 'Vary': 'Origin' }
        });
    }

    const response = await next();

    // 端點各自的 corsHeaders() 可能仍帶萬用 ACAO；統一改寫成白名單版
    const headers = new Headers(response.headers);
    headers.delete('Access-Control-Allow-Origin');
    headers.set('Vary', 'Origin');
    if (allowedOrigin) {
        headers.set('Access-Control-Allow-Origin', allowedOrigin);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}
