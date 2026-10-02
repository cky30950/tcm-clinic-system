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
    get getPatientByIdWithRefresh() { return window.getPatientByIdWithRefresh; },
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
    get CLINIC_SECTION_PERMISSION_OPTIONS() { return CLINIC_SECTION_PERMISSION_OPTIONS; },

    /* ── patients 資料層的舊依賴（Phase 4）────────────────────── */
    // 分頁／全量快取狀態所有權仍在 system.js，store.js 經此讀寫
    get patientCache() { return patientCache; },
    set patientCache(v) { patientCache = v; },
    get patientPagesCache() { return patientPagesCache; },
    set patientPagesCache(v) { patientPagesCache = v; },
    get patientPageCursors() { return patientPageCursors; },
    set patientPageCursors(v) { patientPageCursors = v; },
    get patientAscPagesCache() { return patientAscPagesCache; },
    set patientAscPagesCache(v) { patientAscPagesCache = v; },
    get patientAscPageCursors() { return patientAscPageCursors; },
    set patientAscPageCursors(v) { patientAscPageCursors = v; },
    get patientsCountCache() { return patientsCountCache; },
    set patientsCountCache(v) { patientsCountCache = v; },
    get patientListListenerAttached() { return patientListListenerAttached; },
    set patientListListenerAttached(v) { patientListListenerAttached = v; },
    get patientListUnsubscribe() { return patientListUnsubscribe; },
    set patientListUnsubscribe(v) { patientListUnsubscribe = v; },
    // 病歷監聽與歷史分頁（宣告仍在 system.js）
    get patientConsultationsListeners() { return patientConsultationsListeners; },
    get patientConsultationsCache() { return patientConsultationsCache; },
    get currentPatientHistoryPatientId() { return currentPatientHistoryPatientId; },
    set currentPatientHistoryPatientId(v) { currentPatientHistoryPatientId = v; },
    get currentConsultationHistoryPatientId() { return currentConsultationHistoryPatientId; },
    set currentConsultationHistoryPatientId(v) { currentConsultationHistoryPatientId = v; },
    get consultationHistoryPager() { return consultationHistoryPager; },
    // 病歷管理頁監聽（auth session 清除流程用，需一併重設）
    get medicalRecordListUnsubscribe() { return medicalRecordListUnsubscribe; },
    set medicalRecordListUnsubscribe(v) { medicalRecordListUnsubscribe = v; },
    // 分頁設定與資料層舊服務
    get paginationSettings() { return paginationSettings; },
    get fetchDataWithCache() { return fetchDataWithCache; },
    get safeGetPatients() { return safeGetPatients; },
    // loadPatientList 已隨 Phase 4 子批 A 遷入 patients/list.js，改走 window facade
    get loadPatientList() { return window.loadPatientList; },
    // 病人列表模組（list.js）需要的共享狀態與分頁服務
    get patientListFiltered() { return patientListFiltered; },
    set patientListFiltered(v) { patientListFiltered = v; },
    get ensurePaginationContainer() { return ensurePaginationContainer; },
    get renderPagination() { return renderPagination; },
    get getConsultationEffectiveTimestamp() { return getConsultationEffectiveTimestamp; },
    // 病歷歷史 UI 已隨 Phase 4 子批 C 遷入 patients/history.js，改走 window facade
    get displayPatientMedicalHistoryPage() { return window.displayPatientMedicalHistoryPage; },
    get displayConsultationMedicalHistoryPage() { return window.displayConsultationMedicalHistoryPage; },
    // 病人詳情彈窗（detail.js）掛載診症摘要仍用 system.js 內的載入器
    get loadPatientConsultationSummary() { return loadPatientConsultationSummary; },
    // 病歷歷史模組（history.js）讀寫的共享分頁狀態（consultationHistoryPager 方法仍在 system.js 直接持有）
    get currentPatientConsultations() { return currentPatientConsultations; },
    set currentPatientConsultations(v) { currentPatientConsultations = v; },
    get currentPatientHistoryPage() { return currentPatientHistoryPage; },
    set currentPatientHistoryPage(v) { currentPatientHistoryPage = v; },
    get currentConsultationConsultations() { return currentConsultationConsultations; },
    set currentConsultationConsultations(v) { currentConsultationConsultations = v; },
    get currentConsultationHistoryPage() { return currentConsultationHistoryPage; },
    set currentConsultationHistoryPage(v) { currentConsultationHistoryPage = v; },
    get clinicsList() { return clinicsList; },
    get currentConsultingAppointmentId() { return currentConsultingAppointmentId; },
    // 病歷歷史模組調用、仍保留在 system.js 的舊服務
    get buildConsultationBillingDisplayHtml() { return buildConsultationBillingDisplayHtml; },
    get canCurrentUserEditMedicalRecordEntry() { return canCurrentUserEditMedicalRecordEntry; },
    get canCurrentUserViewConsultationEntry() { return canCurrentUserViewConsultationEntry; },
    get getConsultationEffectiveDate() { return getConsultationEffectiveDate; },
    get getGeneralRegistrationSourceLabel() { return getGeneralRegistrationSourceLabel; },
    get getMedicalRecordEditButtonLabel() { return getMedicalRecordEditButtonLabel; },
    get getMedicalRecordEditWindowStatus() { return getMedicalRecordEditWindowStatus; }
};
