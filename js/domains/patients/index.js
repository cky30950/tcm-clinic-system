/* ============================================================
 * patients/index.js — 病人資料層 facade 彙整（Phase 4）
 * ------------------------------------------------------------
 * 分頁快取讀取＋多人同步基礎設施公開函式統一 re-export，
 * 由 js/app.js 以同名掛回 window（與舊全域 1:1）。
 * ============================================================ */
export {
    PATIENTS_CACHE_TTL_MS,
    fetchPatients,
    getPatientByIdWithRefresh,
    fetchPatientsPage,
    fetchPatientsPageAsc,
    comparePatientsByCreatedAtDesc,
    comparePatientsByNumberDesc,
    fetchPatientsPageOptimized,
    getPatientsCount,
    newSelfMetaNonce,
    isSelfMetaNonce,
    metaTimestampToMillis,
    readPatientsStorageMeta,
    writePatientsStorageMeta,
    stampPatientsStorageMetaTimestamp,
    resetPatientPaginationCaches,
    adjustPatientsCountCache,
    reloadVisiblePatientList,
    invalidateAllPatientCaches,
    isPatientIdInFullCaches,
    handleRemotePatientMetaChange,
    refreshOpenConsultationHistory,
    attachPatientListListener,
    detachPatientListListener,
    touchPatientsMeta,
    attachPatientConsultationsListener,
    detachPatientConsultationsListener
} from './store.js?v=a38461a0';
export {
    loadPatientListFromFirebase,
    loadPatientList,
    renderPatientListTable,
    renderPatientListPage
} from './list.js?v=8dba2a15';
export {
    viewPatient
} from './detail.js?v=46d17163';
export * from './history.js?v=2a0943de';
