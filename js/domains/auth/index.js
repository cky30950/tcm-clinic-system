/* ============================================================
 * auth/index.js — 認證與員工管理 facade 彙整（Phase 3）
 * ------------------------------------------------------------
 * claims／session／staff 公開函式統一 re-export，由 js/app.js
 * 以同名掛回 window（與舊全域 1:1）。
 * ============================================================ */
export { getAuthorizedUserFromIndex, upsertAuthorizedUserIndex, removeAuthorizedUserIndex, callAdminClaimsApi, createStaffAuthAccount, syncStaffClaims, deleteStaffAuthAccount, archiveStaffAuthAccount, bootstrapAllUserClaims, fetchLegacyAuthorizedUserByUidOrEmail, fetchAuthorizedUserByUidOrEmail } from './claims.js';
export { loadAccountSecurity, changeCurrentUserPassword, archiveCurrentUserAccount, attemptMainLogin, syncUserDataFromFirebase, clearLocalClinicData, detachAllKnownFirestoreListeners, shutdownFirestoreAndWipePersistence, reloadPageSoon, wipeDeviceDataAndReload, logout, openSidebar, closeSidebar, toggleSidebar, IDB_PHI_MARKER, IDB_WIPE_ATTEMPTED } from './session.js';
export { getClinicIdForUser, getClinicUserLimitGroup, getClinicUserLimitLabel, canActivateUserUnderClinicLimit, getPrimaryClinicNameForUser, loadUserManagement, loadPermissionManagementPanel, onPermissionPositionChanged, saveSelectedPositionPermissions, loadUsersFromFirebase, filterUsers, displayUsers, showAddUserForm, hideAddUserForm, clearUserForm, setUserEmailFieldEditable, toggleRegistrationNumberField, editUser, saveUser, toggleUserStatus, patchLocalUserRecord, archiveUser, restoreUser } from './staff.js';

