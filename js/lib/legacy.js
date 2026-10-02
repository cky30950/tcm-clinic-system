/* ============================================================
 * legacy.js — ESM 新碼存取「尚未遷移之 system.js 全域」的唯一窗口
 * ------------------------------------------------------------
 * 遷移期間 system.js 仍是 classic script 且持有共享狀態所有權。
 * 所有 ESM 模組只能透過 G 存取這些舊全域（裸識別 / window 均不可
 * 直接出現在 domain 模組中），讓跨層依賴顯式、可搜尋、日後可逐批
 * 移除。每遷移一個領域就從這裡刪除該領域的條目，直到本檔歸零。
 *
 * 注意：getter/setter 內的裸識別由全域環境解析（classic 頂層的
 * let/const 詞法綁定與 window 屬性皆可），僅在呼叫時求值，故模組
 * 載入順序不影響正確性。
 * ============================================================ */

export const G = {
    /* ── 共享狀態（所有權仍在 system.js）────────────────────── */
    get currentUserData() { return currentUserData; },
    set currentUserData(v) { currentUserData = v; },

    get patients() { return patients; },
    get consultations() { return consultations; },
    get appointments() { return appointments; },

    get herbLibrary() { return herbLibrary; },

    /* ── 核心服務 ───────────────────────────────────────────── */
    get showToast() { return showToast; },

    get t() { return window.t; },
    get escapeHtml() { return window.escapeHtml; },
    get sanitizePrintHtml() { return window.sanitizePrintHtml; },

    get firebase() { return window.firebase; },
    get firebaseDataManager() { return window.firebaseDataManager; },

    /* ── wallet 領域的舊依賴（Phase 2）────────────────────────── */
    // currentClinicId 在部分啟動路徑可能尚未詞法綁定，getter 自行吸收 ReferenceError
    get currentClinicId() {
        return (typeof currentClinicId !== 'undefined' && currentClinicId) ? currentClinicId : '';
    },
    get billingItems() { return billingItems; },
    get selectedBillingItems() { return selectedBillingItems; },
    get showConfirmation() { return showConfirmation; },
    get hasActionPermission() { return hasActionPermission; },
    get hasAdminRole() { return hasAdminRole; },
    get waitForFirebase() { return waitForFirebase; },
    get walletFetchAllDocs() { return walletFetchAllDocs; },
    get clearAllSearchFields() { return clearAllSearchFields; },
    get closeConsultationForm() { return closeConsultationForm; },
    get loadTodayAppointments() { return loadTodayAppointments; },
    get updateBillingDisplay() { return updateBillingDisplay; },
    get updateStatistics() { return updateStatistics; },
    get versionFeatureEnabled() { return versionFeatureEnabled; },

    /* ── print 領域的舊依賴（日後各該函式遷移後改為 ESM import）── */
    get parseConsultationDate() { return parseConsultationDate; },
    get getPatientByIdWithRefresh() { return getPatientByIdWithRefresh; },
    get getReceiptPrintLayoutConfig() { return getReceiptPrintLayoutConfig; },
    get getClinicReceiptPaperSize() { return getClinicReceiptPaperSize; },
    get shouldHideGeneralRegistrationDoctorInfo() { return shouldHideGeneralRegistrationDoctorInfo; },
    get getDoctorDisplayName() { return getDoctorDisplayName; },
    get getDoctorRegistrationNumber() { return getDoctorRegistrationNumber; },
    get resolveClinicSettingsByConsultation() { return resolveClinicSettingsByConsultation; },
    get mergeReceiptVisibilitySettings() { return mergeReceiptVisibilitySettings; },
    get consultationHasPrescription() { return consultationHasPrescription; },
    get isGeneralRegistrationConsultation() { return isGeneralRegistrationConsultation; },
    get computeRestPeriod() { return computeRestPeriod; },
    get formatConsultationDateTime() { return formatConsultationDateTime; },
    get formatAge() { return formatAge; },
    get setButtonLoading() { return setButtonLoading; },
    get clearButtonLoading() { return clearButtonLoading; },
    get resolveConsultationWalletBalance() { return resolveConsultationWalletBalance; },
    get resolveConsultationPackageUseRemaining() { return resolveConsultationPackageUseRemaining; },

    /* ── auth 領域的舊依賴（Phase 3）──────────────────────────── */
    // 可寫共享狀態：員工管理 patch/save 會回寫 users／userCache
    get currentUser() { return currentUser; },
    set currentUser(v) { currentUser = v; },
    get users() { return users; },
    set users(v) { users = v; },
    get userCache() { return userCache; },
    set userCache(v) { userCache = v; },

    get $() { return window.$; },
    get waitForFirebaseDb() { return waitForFirebaseDb; },
    get waitForFirebaseDataManager() { return waitForFirebaseDataManager; },
    get hasAccessToSection() { return hasAccessToSection; },
    get getClinicDisplayName() { return getClinicDisplayName; },
    get fetchUsers() { return fetchUsers; },
    get loadUsersFromLocalStorage() { return loadUsersFromLocalStorage; },
    get normalizeUserForClient() { return normalizeUserForClient; },
    get getUserDisplayName() { return getUserDisplayName; },
    get initializeSystemAfterLogin() { return initializeSystemAfterLogin; },
    get showGlobalCopyright() { return showGlobalCopyright; },
    get startInactivityMonitoring() { return startInactivityMonitoring; },
    get initAcupointLibrary() { return initAcupointLibrary; },
    get initAcupointMap() { return initAcupointMap; },
    get initBillingItems() { return initBillingItems; },
    get initCategoryData() { return initCategoryData; },
    get initHerbInventory() { return initHerbInventory; },
    get initHerbLibrary() { return initHerbLibrary; },
    get initTemplateLibrary() { return initTemplateLibrary; },

    get CLINIC_PERMISSION_POSITIONS() { return CLINIC_PERMISSION_POSITIONS; },
    get CLINIC_SECTION_PERMISSION_OPTIONS() { return CLINIC_SECTION_PERMISSION_OPTIONS; }
};
