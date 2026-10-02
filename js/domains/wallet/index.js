/* ============================================================
 * wallet/index.js — 會員儲值 facade 彙整（Phase 2）
 * ------------------------------------------------------------
 * 各子模組於此統一 re-export，由 js/app.js 以同名掛回 window
 *（與舊全域 1:1）。
 * ============================================================ */
export { clearWalletCaches, walletRound2 } from './shared.js';
export { getWalletAccount, getRecentWalletTransactions } from './account.js';
export { loadWalletManagement, selectWalletPatient, walletGoToTxPage, toggleWalletAdminOps } from './panel.js';
export { submitWalletTopup, submitWalletRefund, submitWalletAdjust, submitWalletStatus, showWalletRefundForm, hideWalletAdminForm, showWalletAdjustForm, showWalletStatusForm } from './admin-ops.js';
export { runWalletLegacyMigration, toggleWalletConfigForm, addWalletTierRow, removeWalletTierRow, submitWalletConfig } from './config.js';
export { setupConsultationWallet, syncConsultWalletAvailability, processConsultationWalletPayment, retryConsultationWalletPayment, cancelConsultationWalletPayment, preCheckConsultationWalletPayment } from './consultation-pay.js';

