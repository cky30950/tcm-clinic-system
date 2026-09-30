/* ============================================================
 * CSP 違規報告收集端點
 * ------------------------------------------------------------
 * 接收瀏覽器 report-uri（CSP Report-Only 與強制政策的違規皆送此）。
 * 報告以結構化 JSON 寫入 Worker 日誌（wrangler tail / Pages 日誌），
 * 不落點、不回存，避免把違規樣本中的頁面資料長期留存。
 *
 * 觀察方式：
 *   wrangler pages deployment tail
 *   或 Cloudflare Dashboard → Pages → 專案 → Functions → 即時記錄
 *   以 evt:"csp-report" 篩選
 * ============================================================ */

function pick(...vals) {
    for (const v of vals) {
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return '';
}

export async function onRequestPost({ request }) {
    try {
        const raw = await request.text();
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch (_e) {
            // 非 JSON（部分舊瀏覽器或探測請求）直接忽略
            return new Response(null, { status: 204 });
        }

        // report-uri：{ "csp-report": { ... } }；Reporting API：單一物件或陣列
        const reports = Array.isArray(parsed)
            ? parsed
            : (parsed['csp-report'] ? [parsed['csp-report']] : [parsed]);

        for (const r of reports) {
            if (!r || typeof r !== 'object') continue;
            console.log(JSON.stringify({
                evt: 'csp-report',
                enforced: pick(r['disposition'], r['violated-disposition']) || 'unknown',
                directive: pick(r['violated-directive'], r.effectiveDirective),
                policy: pick(r['policy-uri'], r.originalPolicy),
                blocked: pick(r['blocked-uri'], r.blockedURL),
                doc: pick(r['document-uri'], r.documentURL),
                source: pick(r['source-file'], r.sourceFile),
                line: pick(r['line-number'], r.lineNumber),
                col: pick(r['column-number'], r.columnNumber),
                sample: String(pick(r['script-sample'], r.sample) || '').slice(0, 120)
            }));
        }
    } catch (_e) {
        // 收集端點永遠不影響頁面流程
    }
    return new Response(null, { status: 204 });
}

export function onRequest() {
    // 瀏覽器對報告端點只會 POST；其他方法一律安靜回應
    return new Response(null, { status: 204 });
}
