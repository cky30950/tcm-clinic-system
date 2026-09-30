/* ============================================================
 * 全域 CSP nonce 注入 middleware（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 對「HTML 文件回應」做逐請求處理：
 *   1. 產生一次性 nonce（每個文件回應不同，不下發給任何 JS）；
 *   2. 為頁面內可執行的 inline <script> 與所有 <style> 標籤注入 nonce；
 *   3. 發出 CSP 標頭（見下方政策說明）。
 * 非 HTML 請求（API、JS/CSS/圖片）一律原樣放行，不干擾串流或快取。
 *
 * ── 雙政策部署（2026-09 起）────────────────────────────────
 * （A）Content-Security-Policy（強制）：
 *     script-src 已移除 'unsafe-inline'，改以 nonce 把關所有 inline
 *     <script> 元素；外部 script 僅允許白名單主機。可立即封鎖注入的
 *     <script> 與 javascript: URL（最常見的 XSS 執行點）。
 *     以下三項歷史包袱暫時保留，待階段二重構後移除：
 *       - 'unsafe-eval'：system.js initInlineEventHandlers 以
 *         new Function() 解析 inline 屬性參數；
 *       - script-src-attr 'unsafe-inline'：約 330 處 onclick/onchange…
 *         屬性（靜態 HTML + innerHTML 模板），部分頁面尚未遷移；
 *       - style-src 'unsafe-inline'：Tailwind Play CDN 與 SweetAlert2
 *         會在執行期自行插入無 nonce 的 <style>，移除 Play CDN
 *         （改用預編譯 Tailwind）前無法關閉。
 *
 * （B）Content-Security-Policy-Report-Only（最終嚴格目標）：
 *     完全不含任何 'unsafe-inline'/'unsafe-eval'。違規只回報不阻擋，
 *     供 /api/csp-report 收集真實流量中的殘留點（含動態插入的屬性、
 *     第三方函式庫注入），作為階段二重構與轉強的依據。
 *
 * 環境變數（Pages → Settings → Variables，均選填）：
 *   CSP_ENFORCE=0    暫時關閉強制標頭（只留 Report-Only，應急退回用）
 *   CSP_REPORT=0     關閉 Report-Only 標頭
 * ============================================================ */

const NONCE_BYTES = 16;

// 外部 script 主機白名單（對照各 HTML 實際引用）：
//  gstatic            Firebase JS SDK（ESM）
//  cloudflareinsights Cloudflare Web Analytics
//  jsdelivr           sweetalert2、chart.js、qrcodejs
//  cdn.tailwindcss.com  Tailwind Play CDN（landing/inquiry/system 等頁）
//  cdnjs.cloudflare.com jQuery、toastr
//  unpkg.com          Leaflet
//  challenges.cloudflare.com  Turnstile（member.js 動態載入）
const SCRIPT_HOSTS = [
    "'self'",
    'https://www.gstatic.com',
    'https://*.cloudflareinsights.com',
    'https://cdn.jsdelivr.net',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com',
    'https://unpkg.com',
    'https://challenges.cloudflare.com'
].join(' ');

const STYLE_HOSTS = [
    "'self'",
    'https://fonts.googleapis.com',
    'https://cdnjs.cloudflare.com',
    'https://unpkg.com'
].join(' ');

const CONNECT_SRC = [
    "'self'",
    'https://*.firebaseio.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
    'https://oauth2.googleapis.com',
    'https://fcm.googleapis.com',
    'https://challenges.cloudflare.com',
    'https://*.agora.io',
    'https://*.agoraio.cn',
    'https://www.googleapis.com'
].join(' ');

const COMMON_DIRECTIVES = (nonce) => [
    `script-src ${SCRIPT_HOSTS} 'nonce-${nonce}'`,
    `style-src ${STYLE_HOSTS} 'nonce-${nonce}'`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com data:",
    `connect-src ${CONNECT_SRC}`,
    "frame-src 'self' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'report-uri /api/csp-report'
];

// （A）現階段可上線強制的政策：元素級 nonce + 三個已知暫存例外
function buildEnforcedPolicy(nonce) {
    return [
        "default-src 'self'",
        `script-src ${SCRIPT_HOSTS} 'nonce-${nonce}' 'unsafe-eval'`,
        "script-src-attr 'unsafe-inline'",
        `style-src ${STYLE_HOSTS} 'unsafe-inline'`,
        ...COMMON_DIRECTIVES(nonce).slice(2)
    ].join('; ');
}

// （B）最終嚴格目標：只用於 Report-Only，違規會送回報不阻擋
function buildTargetPolicy(nonce) {
    return [
        "default-src 'self'",
        `script-src ${SCRIPT_HOSTS} 'nonce-${nonce}'`,
        "script-src-attr 'none'",
        `style-src ${STYLE_HOSTS} 'nonce-${nonce}'`,
        "style-src-attr 'none'",
        ...COMMON_DIRECTIVES(nonce).slice(2)
    ].join('; ');
}

function generateNonce() {
    const bytes = new Uint8Array(NONCE_BYTES);
    crypto.getRandomValues(bytes);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

// inline <script> 可被執行的 type 值；其他（application/ld+json、
// text/removed、importmap data block 等）不需也不應加 nonce。
const EXECUTABLE_SCRIPT_TYPES = new Set([
    '',
    'text/javascript',
    'application/javascript',
    'text/ecmascript',
    'application/ecmascript',
    'module',
    'application/x-javascript' // 舊式非標準寫法
]);

function attrValue(attrs, name) {
    const m = attrs.match(new RegExp('\\b' + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", 'i'));
    return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

function injectNonce(html, nonce) {
    return html.replace(/<(script|style)\b([^>]*)>/gi, (whole, tagName, attrs) => {
        const tag = tagName.toLowerCase();
        if (/\bnonce\s*=/.test(attrs)) return whole;

        if (tag === 'script') {
            // 外部腳本由 script-src 主機白名單管控，不需 nonce
            if (/\bsrc\s*=/.test(attrs)) return whole;
            const type = (attrValue(attrs, 'type') || '').trim().toLowerCase();
            if (!EXECUTABLE_SCRIPT_TYPES.has(type)) return whole;
        }
        return `<${tagName} nonce="${nonce}"${attrs}>`;
    });
}

export async function onRequest({ request, env, next }) {
    // 只處理瀏覽器對文件的 GET；其餘請求（API、資產、POST…）原樣放行
    const accept = request.headers.get('accept') || '';
    const isDocument = request.method === 'GET'
        && (request.headers.get('sec-fetch-dest') === 'document'
            || accept.includes('text/html'));
    if (!isDocument) return next();

    const response = await next();
    if (response.status !== 200) return response;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return response;

    const nonce = generateNonce();
    const body = injectNonce(await response.text(), nonce);

    const headers = new Headers(response.headers);
    headers.delete('content-security-policy');
    headers.delete('content-security-policy-report-only');
    if (env && env.CSP_ENFORCE === '0') {
        // 應急退回：不發強制標頭
    } else {
        headers.set('content-security-policy', buildEnforcedPolicy(nonce));
    }
    if (!env || env.CSP_REPORT !== '0') {
        headers.set('content-security-policy-report-only', buildTargetPolicy(nonce));
    }
    // 內容已改寫，長度不再一致；讓邊緣以 chunked 傳輸
    headers.delete('content-length');

    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}
