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
    attachPatientListListener,
    detachPatientListListener,
    touchPatientsMeta,
    attachPatientConsultationsListener,
    detachPatientConsultationsListener
} from './store.js';
export {
    loadPatientListFromFirebase,
    loadPatientList,
    renderPatientListTable,
    renderPatientListPage
} from './list.js';
export {
    viewPatient
} from './detail.js';
export * from './history.js?v=20261006j';
