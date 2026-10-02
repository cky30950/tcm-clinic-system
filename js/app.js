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
import * as Auth from './domains/auth/index.js';

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
    preCheckConsultationWalletPayment: Wallet.preCheckConsultationWalletPayment,

    // ── auth（登入工作階段／帳號安全／授權索引／員工與權限管理）──
    // session：主登入、登入後同步、登出清理、本機快取清除、改密碼／自我封存
    loadAccountSecurity: Auth.loadAccountSecurity,
    changeCurrentUserPassword: Auth.changeCurrentUserPassword,
    archiveCurrentUserAccount: Auth.archiveCurrentUserAccount,
    attemptMainLogin: Auth.attemptMainLogin,
    syncUserDataFromFirebase: Auth.syncUserDataFromFirebase,
    clearLocalClinicData: Auth.clearLocalClinicData,
    detachAllKnownFirestoreListeners: Auth.detachAllKnownFirestoreListeners,
    shutdownFirestoreAndWipePersistence: Auth.shutdownFirestoreAndWipePersistence,
    reloadPageSoon: Auth.reloadPageSoon,
    wipeDeviceDataAndReload: Auth.wipeDeviceDataAndReload,
    logout: Auth.logout,
    toggleSidebar: Auth.toggleSidebar,
    IDB_PHI_MARKER: Auth.IDB_PHI_MARKER,
    IDB_WIPE_ATTEMPTED: Auth.IDB_WIPE_ATTEMPTED,

    // claims：後端 admin API 封裝、Auth 帳號生命週期、授權索引同步
    getAuthorizedUserFromIndex: Auth.getAuthorizedUserFromIndex,
    upsertAuthorizedUserIndex: Auth.upsertAuthorizedUserIndex,
    removeAuthorizedUserIndex: Auth.removeAuthorizedUserIndex,
    callAdminClaimsApi: Auth.callAdminClaimsApi,
    createStaffAuthAccount: Auth.createStaffAuthAccount,
    syncStaffClaims: Auth.syncStaffClaims,
    deleteStaffAuthAccount: Auth.deleteStaffAuthAccount,
    archiveStaffAuthAccount: Auth.archiveStaffAuthAccount,
    bootstrapAllUserClaims: Auth.bootstrapAllUserClaims,
    fetchLegacyAuthorizedUserByUidOrEmail: Auth.fetchLegacyAuthorizedUserByUidOrEmail,
    fetchAuthorizedUserByUidOrEmail: Auth.fetchAuthorizedUserByUidOrEmail,

    // staff：用戶 CRUD、啟用／封存／復職、職位權限面板、診所名額
    getClinicIdForUser: Auth.getClinicIdForUser,
    getClinicUserLimitGroup: Auth.getClinicUserLimitGroup,
    getClinicUserLimitLabel: Auth.getClinicUserLimitLabel,
    canActivateUserUnderClinicLimit: Auth.canActivateUserUnderClinicLimit,
    getPrimaryClinicNameForUser: Auth.getPrimaryClinicNameForUser,
    loadUserManagement: Auth.loadUserManagement,
    loadPermissionManagementPanel: Auth.loadPermissionManagementPanel,
    onPermissionPositionChanged: Auth.onPermissionPositionChanged,
    saveSelectedPositionPermissions: Auth.saveSelectedPositionPermissions,
    loadUsersFromFirebase: Auth.loadUsersFromFirebase,
    filterUsers: Auth.filterUsers,
    displayUsers: Auth.displayUsers,
    showAddUserForm: Auth.showAddUserForm,
    hideAddUserForm: Auth.hideAddUserForm,
    clearUserForm: Auth.clearUserForm,
    setUserEmailFieldEditable: Auth.setUserEmailFieldEditable,
    toggleRegistrationNumberField: Auth.toggleRegistrationNumberField,
    editUser: Auth.editUser,
    saveUser: Auth.saveUser,
    toggleUserStatus: Auth.toggleUserStatus,
    patchLocalUserRecord: Auth.patchLocalUserRecord,
    archiveUser: Auth.archiveUser,
    restoreUser: Auth.restoreUser
};

Object.assign(window, FACADE);
