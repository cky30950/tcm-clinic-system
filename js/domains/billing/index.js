/* ============================================================
 * billing/index.js — billing 領域公開介面（window facade）
 * Phase 5 漸進 ESM 化；差異僅限以 G 存取舊全域。
 * ============================================================ */

export * from './items.js?v=20261014b';
export * from './packages.js?v=20261014b';
export * from './expenses.js?v=20261014b';
export * from './reports.js?v=20261014d';
