/* ============================================================
 * app.js — ESM 模組唯一入口（facade 安裝器）
 * ------------------------------------------------------------
 * 由 system.html 以 <script type="module"> 載入。匯入已遷移的
 * 領域模組，並把其公開函式以【與舊全域 1:1 的名字】掛回 window，
 * 使 HTML inline on* 屬性、system.js 與其他 classic 腳本的裸呼叫
 * 完全不受影響。
 *
 * 新增領域遷移時：import 該領域 → 在 FACADE 補上同名對應。
 * ============================================================ */

import * as Print from './domains/print/index.js';
import * as Wallet from './domains/wallet/index.js';

const FACADE = {
    // ── print（收據／應診證明／病假紙／處方指示）──────────────
    printReceiptFromAppointment: Print.printReceiptFromAppointment,
    printAttendanceCertificateFromAppointment: Print.printAttendanceCertificateFromAppointment,
    printSickLeaveFromAppointment: Print.printSickLeaveFromAppointment,
    printConsultationRecord: Print.printConsultationRecord,
    printAttendanceCertificate: Print.printAttendanceCertificate,
    printSickLeave: Print.printSickLeave,
    printPrescriptionInstructionsFromAppointment: Print.printPrescriptionInstructionsFromAppointment,
    printPrescriptionInstructions: Print.printPrescriptionInstructions,

    // ── wallet（會員儲值：帳戶／面板／充值退款調整／配置／診症支付）──
    loadWalletManagement: Wallet.loadWalletManagement,
    clearWalletCaches: Wallet.clearWalletCaches,
    runWalletLegacyMigration: Wallet.runWalletLegacyMigration,
    selectWalletPatient: Wallet.selectWalletPatient,
    getWalletAccount: Wallet.getWalletAccount,
    getRecentWalletTransactions: Wallet.getRecentWalletTransactions,
    walletRound2: Wallet.walletRound2,
    submitWalletTopup: Wallet.submitWalletTopup,
    submitWalletRefund: Wallet.submitWalletRefund,
    submitWalletAdjust: Wallet.submitWalletAdjust,
    submitWalletStatus: Wallet.submitWalletStatus,
    showWalletRefundForm: Wallet.showWalletRefundForm,
    hideWalletAdminForm: Wallet.hideWalletAdminForm,
    showWalletAdjustForm: Wallet.showWalletAdjustForm,
    showWalletStatusForm: Wallet.showWalletStatusForm,
    toggleWalletConfigForm: Wallet.toggleWalletConfigForm,
    addWalletTierRow: Wallet.addWalletTierRow,
    removeWalletTierRow: Wallet.removeWalletTierRow,
    submitWalletConfig: Wallet.submitWalletConfig,
    walletGoToTxPage: Wallet.walletGoToTxPage,
    toggleWalletAdminOps: Wallet.toggleWalletAdminOps,
    setupConsultationWallet: Wallet.setupConsultationWallet,
    syncConsultWalletAvailability: Wallet.syncConsultWalletAvailability,
    processConsultationWalletPayment: Wallet.processConsultationWalletPayment,
    retryConsultationWalletPayment: Wallet.retryConsultationWalletPayment,
    cancelConsultationWalletPayment: Wallet.cancelConsultationWalletPayment,
    preCheckConsultationWalletPayment: Wallet.preCheckConsultationWalletPayment
};

Object.assign(window, FACADE);
