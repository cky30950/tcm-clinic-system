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
    set consultations(v) { consultations = v; },
    get appointments() { return appointments; },
    set appointments(v) { appointments = v; },

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
    set billingItems(v) { billingItems = v; },
    // 收費項目 realtime sync（billing/items.js，Phase 5 子批 A）
    get billingItemsLoaded() { return billingItemsLoaded; },
    set billingItemsLoaded(v) { billingItemsLoaded = v; },
    get billingItemsClinicUnsubscribe() { return billingItemsClinicUnsubscribe; },
    set billingItemsClinicUnsubscribe(v) { billingItemsClinicUnsubscribe = v; },
    get billingItemsGlobalUnsubscribe() { return billingItemsGlobalUnsubscribe; },
    set billingItemsGlobalUnsubscribe(v) { billingItemsGlobalUnsubscribe = v; },
    get getClinicScopedStorageKey() { return getClinicScopedStorageKey; },
    get getLoadingButtonFromEvent() { return getLoadingButtonFromEvent; },
    get selectedBillingItems() { return selectedBillingItems; },
    set selectedBillingItems(v) { selectedBillingItems = v; },
    // 套票（billing/packages.js，Phase 5 子批 B）：模組會回寫所選收費列
    get patientPackagesCache() { return patientPackagesCache; },
    set patientPackagesCache(v) { patientPackagesCache = v; },
    get pendingPackageChanges() { return pendingPackageChanges; },
    set pendingPackageChanges(v) { pendingPackageChanges = v; },
    get patientDetailClinicState() { return patientDetailClinicState; },
    set patientDetailClinicState(v) { patientDetailClinicState = v; },
    get showConfirmation() { return showConfirmation; },
    get hasActionPermission() { return hasActionPermission; },
    get hasAdminRole() { return hasAdminRole; },
    get waitForFirebase() { return waitForFirebase; },
    get walletFetchAllDocs() { return window.walletFetchAllDocs; },
    get clearAllSearchFields() { return window.clearAllSearchFields; },
    get closeConsultationForm() { return window.closeConsultationForm; },
    get loadTodayAppointments() { return window.loadTodayAppointments; },
    get updateBillingDisplay() { return window.updateBillingDisplay; },
    get updateStatistics() { return updateStatistics; },
    get versionFeatureEnabled() { return versionFeatureEnabled; },

    /* ── print 領域的舊依賴（日後各該函式遷移後改為 ESM import）── */
    get parseConsultationDate() { return window.parseConsultationDate; },
    get getPatientByIdWithRefresh() { return window.getPatientByIdWithRefresh; },
    get getReceiptPrintLayoutConfig() { return getReceiptPrintLayoutConfig; },
    get getClinicReceiptPaperSize() { return getClinicReceiptPaperSize; },
    get shouldHideGeneralRegistrationDoctorInfo() { return window.shouldHideGeneralRegistrationDoctorInfo; },
    get getDoctorDisplayName() { return getDoctorDisplayName; },
    get getDoctorRegistrationNumber() { return getDoctorRegistrationNumber; },
    get resolveClinicSettingsByConsultation() { return resolveClinicSettingsByConsultation; },
    get mergeReceiptVisibilitySettings() { return mergeReceiptVisibilitySettings; },
    get consultationHasPrescription() { return window.consultationHasPrescription; },
    get isGeneralRegistrationConsultation() { return window.isGeneralRegistrationConsultation; },
    get computeRestPeriod() { return window.computeRestPeriod; },
    get formatConsultationDateTime() { return window.formatConsultationDateTime; },
    get formatAge() { return formatAge; },
    get setButtonLoading() { return setButtonLoading; },
    get clearButtonLoading() { return clearButtonLoading; },
    get resolveConsultationWalletBalance() { return window.resolveConsultationWalletBalance; },
    get resolveConsultationPackageUseRemaining() { return window.resolveConsultationPackageUseRemaining; },

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
    get initBillingItems() { return window.initBillingItems; },
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
    get getConsultationEffectiveTimestamp() { return window.getConsultationEffectiveTimestamp; },
    // 病歷歷史 UI 已隨 Phase 4 子批 C 遷入 patients/history.js，改走 window facade
    get displayPatientMedicalHistoryPage() { return window.displayPatientMedicalHistoryPage; },
    get displayConsultationMedicalHistoryPage() { return window.displayConsultationMedicalHistoryPage; },
    // 病人詳情彈窗（detail.js）掛載診症摘要仍用 system.js 內的載入器
    get loadPatientConsultationSummary() { return window.loadPatientConsultationSummary; },
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
    set currentConsultingAppointmentId(v) { currentConsultingAppointmentId = v; },
    // 病歷歷史模組調用、仍保留在 system.js 的舊服務
    get buildConsultationBillingDisplayHtml() { return window.buildConsultationBillingDisplayHtml; },
    get canCurrentUserEditMedicalRecordEntry() { return window.canCurrentUserEditMedicalRecordEntry; },
    get canCurrentUserViewConsultationEntry() { return window.canCurrentUserViewConsultationEntry; },
    get getConsultationEffectiveDate() { return window.getConsultationEffectiveDate; },
    get getGeneralRegistrationSourceLabel() { return window.getGeneralRegistrationSourceLabel; },
    get getMedicalRecordEditButtonLabel() { return window.getMedicalRecordEditButtonLabel; },
    get getMedicalRecordEditWindowStatus() { return window.getMedicalRecordEditWindowStatus; },

    /* ── billing 支出（expenses.js，Phase 5 子批 C）────────────── */
    get clinicSettings() { return clinicSettings; },
    // 財務報表產生器仍在 system.js，子批 D 遷移後改走 window facade
    get generateFinancialReport() { return window.generateFinancialReport; },

    /* ── 財務報表（reports.js，Phase 5 子批 D）────────────────── */
    get initClinics() { return initClinics; },
    get viewMedicalRecord() { return viewMedicalRecord; },
    get readCache() { return readCache; },
    get writeCache() { return writeCache; },

    /* ── consultation 診症表單（consultation/form.js，Phase 6）── */
    // 表單共享狀態（所有權留 system.js）：多方開方與所選收費列
    get prescriptions() { return prescriptions; },
    set prescriptions(v) { prescriptions = v; },
    get activePrescriptionIndex() { return activePrescriptionIndex; },
    set activePrescriptionIndex(v) { activePrescriptionIndex = v; },
    get selectedPrescriptionItems() { return selectedPrescriptionItems; },
    set selectedPrescriptionItems(v) { selectedPrescriptionItems = v; },
    get currentInventoryMode() { return currentInventoryMode; },
    get herbInventoryGranule() { return herbInventoryGranule; },
    get herbInventorySlice() { return herbInventorySlice; },
    get UNIT_FACTOR_MAP() { return UNIT_FACTOR_MAP; },
    get UNIT_LABEL_MAP() { return UNIT_LABEL_MAP; },
    get GENERAL_REGISTRATION_LABEL() { return GENERAL_REGISTRATION_LABEL; },
    // 仍在 system.js 的 lexical 服務
    get canModifyPackageItems() { return window.canModifyPackageItems; },
    get getEffectiveDiagnosisSettings() { return getEffectiveDiagnosisSettings; },
    get getHerbInventory() { return getHerbInventory; },
    get isClinicHerbInventoryEnabled() { return isClinicHerbInventoryEnabled; },
    get isGeneralRegistrationDoctorValue() { return window.isGeneralRegistrationDoctorValue; },
    get queueConsultationSymptomsDraftSave() { return window.queueConsultationSymptomsDraftSave; },
    get resolvePrescriptionDefaultDosage() { return resolvePrescriptionDefaultDosage; },
    get getUserDisplayName() { return getUserDisplayName; },
    // window 掛載的服務
    get changeInventoryType() { return window.changeInventoryType; },
    get closeMedicalHistoryModal() { return window.closeMedicalHistoryModal; },
    get hideTooltip() { return window.hideTooltip; },
    get showTooltip() { return window.showTooltip; },
    get moveTooltip() { return window.moveTooltip; },
    get initializeAcupointNotesSpans() { return window.initializeAcupointNotesSpans; },

    /* ── consultation 儲存與表單生命週期（consultation/save.js，Phase 6B） */
    // 草稿私有狀態與常數（所有權留 system.js）
    get consultationSymptomsDraftState() { return consultationSymptomsDraftState; },
    get CONSULTATION_DRAFT_TEXT_FIELD_IDS() { return CONSULTATION_DRAFT_TEXT_FIELD_IDS; },
    // 表單編輯脈絡與套票待提交購買（共享，所有權留 system.js）
    get currentConsultationEditContext() { return currentConsultationEditContext; },
    set currentConsultationEditContext(v) { currentConsultationEditContext = v; },
    get pendingPackagePurchases() { return pendingPackagePurchases; },
    set pendingPackagePurchases(v) { pendingPackagePurchases = v; },
    get GENERAL_REGISTRATION_DOCTOR_KEY() { return GENERAL_REGISTRATION_DOCTOR_KEY; },
    // 仍在 system.js 的 lexical 服務
    get buildDefaultFollowUpDate() { return buildDefaultFollowUpDate; },
    get debounce() { return debounce; },
    get formatAge() { return formatAge; },
    get generateHistorySummaryFromInquiry() { return window.generateHistorySummaryFromInquiry; },
    get generateMedicalRecordNumber() { return generateMedicalRecordNumber; },
    get generateSymptomSummaryFromInquiry() { return window.generateSymptomSummaryFromInquiry; },
    get getMedicalRecordEditAccessScope() { return window.getMedicalRecordEditAccessScope; },
    get loadPastRecords() { return loadPastRecords; },
    get updateStatistics() { return updateStatistics; },
    get closeConsultationMedicalHistoryEditor() { return window.closeConsultationMedicalHistoryEditor; },
    get renderConsultationPatientMedicalInfo() { return window.renderConsultationPatientMedicalInfo; },
    get setConsultationEditRestrictionState() { return window.setConsultationEditRestrictionState; },
    get isGeneralRegistrationAppointment() { return window.isGeneralRegistrationAppointment; },
    get loadConsultationForEdit() { return window.loadConsultationForEdit; },
    get updateInventoryAfterConsultationMulti() { return updateInventoryAfterConsultationMulti; },
    get getPreviousInventoryLogFromHistory() { return getPreviousInventoryLogFromHistory; },

    /* ── consultation 掛號／應診／開診（consultation/registration.js，Phase 6C） */
    get selectedPatientForRegistration() { return selectedPatientForRegistration; },
    set selectedPatientForRegistration(v) { selectedPatientForRegistration = v; },
    get patientSearchSelectionIndex() { return patientSearchSelectionIndex; },
    set patientSearchSelectionIndex(v) { patientSearchSelectionIndex = v; },
    get herbIngredientSearchSelectionIndex() { return herbIngredientSearchSelectionIndex; },
    set herbIngredientSearchSelectionIndex(v) { herbIngredientSearchSelectionIndex = v; },
    get acupointComboSearchSelectionIndex() { return acupointComboSearchSelectionIndex; },
    set acupointComboSearchSelectionIndex(v) { acupointComboSearchSelectionIndex = v; },
    get inquiryOptionsData() { return inquiryOptionsData; },
    set inquiryOptionsData(v) { inquiryOptionsData = v; },
    get canDoctorViewAppointment() { return window.canDoctorViewAppointment; },
    get getAppointmentResponsibleDoctorUsername() { return window.getAppointmentResponsibleDoctorUsername; },
    get getLatestAppointmentById() { return getLatestAppointmentById; },
    get getMainSymptomFromResult() { return window.getMainSymptomFromResult; },
    get getMedicalRecordEditButtonLabel() { return window.getMedicalRecordEditButtonLabel; },
    get getMedicalRecordEditWindowStatus() { return window.getMedicalRecordEditWindowStatus; },
    get getRegistrationDoctorMeta() { return window.getRegistrationDoctorMeta; },
    get loadInquiryOptions() { return window.loadInquiryOptions; },
    get playNotificationSound() { return playNotificationSound; },
    get syncPatientMedicalProfileFromInquiryData() { return window.syncPatientMedicalProfileFromInquiryData; },

    /* ── Phase 6 子批 D（profile/access/postvisit）────────────── */
    get PATIENT_MEDICAL_PROFILE_SECTIONS() { return PATIENT_MEDICAL_PROFILE_SECTIONS; },
    get revertInventoryForConsultation() { return revertInventoryForConsultation; }
};
