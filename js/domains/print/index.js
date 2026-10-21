/* ============================================================
 * index.js — 列印領域公開介面（供 js/app.js 掛載 window facade）
 * 由 system.js 原樣遷移（2026-10，漸進 ESM 化 Phase 1），
 * 差異僅限：以 G 存取尚未遷移的舊全域。
 * ============================================================ */

export * from './receipt.js?v=90d53bd8';
export * from './certificate.js?v=59ba128e';
export * from './prescription.js?v=0c495c9e';
