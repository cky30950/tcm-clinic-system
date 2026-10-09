/* ============================================================
 * patients/store.js — 病人資料層（Phase 4）
 * ------------------------------------------------------------
 * 分頁快取讀取（fetchPatients 系列）＋ 多人同步基礎設施
 * （patientsMeta nonce 監聽、單筆 patch、快取失效）。
 * 狀態所有權仍在 system.js（經 G 讀寫），後續批次再收斂。
 * 由 js/app.js 以同名掛回 window。
 * ============================================================ */
import { G } from '../../lib/legacy.js';


export async function fetchPatients(forceRefresh = false, pageNumber = null) {
    
    if (pageNumber !== null && typeof pageNumber === 'number') {
        return await fetchPatientsPageOptimized(pageNumber, forceRefresh);
    }
    
    
    G.patientCache = await G.fetchDataWithCache(
        G.patientCache,
        () => G.safeGetPatients(forceRefresh),
        forceRefresh
    );
    return G.patientCache;
}


export async function getPatientByIdWithRefresh(id) {
    
    if (id === undefined || id === null) return null;
    const idStr = String(id);
    try {
        const memoryCache = window.firebaseDataManager && Array.isArray(window.firebaseDataManager.patientsCache)
            ? window.firebaseDataManager.patientsCache
            : [];
        if (memoryCache.length > 0) {
            const found = memoryCache.find(p => p && String(p.id) === idStr);
            if (found) return found;
        }
        try {
            const stored = localStorage.getItem('patients');
            if (stored) {
                const arr = JSON.parse(stored);
                if (Array.isArray(arr) && arr.length > 0) {
                    const found2 = arr.find(p => p && String(p.id) === idStr);
                    if (found2) {
                        try {
                            if (window.firebaseDataManager) {
                                window.firebaseDataManager.patientsCache = arr;
                            }
                        } catch (_cacheErr) {}
                        return found2;
                    }
                }
            }
        } catch (_lsReadErr) {}
        try {
            await G.waitForFirebaseDb();
            const docRef = window.firebase.doc(window.firebase.db, 'patients', idStr);
            const docSnap = await window.firebase.getDoc(docRef);
            if (docSnap && docSnap.exists()) {
                const patient = { id: docSnap.id, ...docSnap.data() };
                try {
                    if (window.firebaseDataManager) {
                        const cacheArr = Array.isArray(window.firebaseDataManager.patientsCache) ? window.firebaseDataManager.patientsCache : [];
                        const idx = cacheArr.findIndex(p => p && String(p.id) === idStr);
                        if (idx >= 0) {
                            cacheArr[idx] = patient;
                        } else {
                            cacheArr.push(patient);
                        }
                        window.firebaseDataManager.patientsCache = cacheArr;
                    }
                } catch (_e) {}
                try {
                    const stored = localStorage.getItem('patients');
                    const arr = stored ? JSON.parse(stored) : [];
                    if (Array.isArray(arr)) {
                        const idx2 = arr.findIndex(p => p && String(p.id) === idStr);
                        if (idx2 >= 0) {
                            arr[idx2] = patient;
                        } else {
                            arr.push(patient);
                        }
                        localStorage.setItem('patients', JSON.stringify(arr));
                    }
                } catch (_lsErr) {}
                return patient;
            }
        } catch (_err) {}
    } catch (err) {
        console.error('取得病人資料時發生錯誤:', err);
    }
    return null;
}


export async function fetchPatientsPage(pageNumber = 1, forceRefresh = false) {
    
    if (pageNumber < 1) pageNumber = 1;
    
    if (forceRefresh) {
        G.patientPagesCache = {};
        G.patientPageCursors = {};
        G.patientAscPagesCache = {};
        G.patientAscPageCursors = {};
    }
    
    if (!forceRefresh && G.patientPagesCache[pageNumber]) {
        return G.patientPagesCache[pageNumber];
    }

    
    if (!forceRefresh && pageNumber > 1) {
        const prevPage = pageNumber - 1;
        
        if (!G.patientPageCursors[prevPage] || !G.patientPagesCache[prevPage]) {
            for (let i = 1; i < pageNumber; i++) {
                if (!G.patientPagesCache[i]) {
                    await fetchPatientsPage(i, forceRefresh);
                }
            }
        }
    }

    await G.waitForFirebaseDb();
    try {
        const pageSize = G.paginationSettings && G.paginationSettings.patientList && G.paginationSettings.patientList.itemsPerPage
            ? G.paginationSettings.patientList.itemsPerPage
            : 10;
        
        let q = window.firebase.firestoreQuery(
            window.firebase.collection(window.firebase.db, 'patients'),
            window.firebase.orderBy('patientNumber', 'desc'),
        );
        // 如果 documentId FieldPath 可用，加入穩定次排序；不可用時退回單一排序
        if (window.firebase.documentId) {
            q = window.firebase.firestoreQuery(q, window.firebase.orderBy(window.firebase.documentId, 'desc'));
        }
        q = window.firebase.firestoreQuery(q, window.firebase.limit(pageSize));
        
        if (pageNumber > 1) {
            const prevCursor = G.patientPageCursors[pageNumber - 1];
            if (prevCursor) {
                q = window.firebase.firestoreQuery(q, window.firebase.startAfter(prevCursor));
            }
        }
        const snapshot = await window.firebase.getDocs(q);
        const docs = [];
        snapshot.forEach((doc) => {
            docs.push({ id: doc.id, ...doc.data() });
        });
        
        if (docs.length > 0) {
            const lastDoc = snapshot.docs[snapshot.docs.length - 1];
            G.patientPageCursors[pageNumber] = lastDoc;
        }
        
        G.patientPagesCache[pageNumber] = docs;
        return docs;
    } catch (error) {
        console.error('分頁讀取病人資料失敗:', error);
        return [];
    }
}

export async function fetchPatientsPageAsc(ascPageNumber = 1, forceRefresh = false) {
    if (ascPageNumber < 1) ascPageNumber = 1;
    if (forceRefresh) {
        G.patientPagesCache = {};
        G.patientPageCursors = {};
        G.patientAscPagesCache = {};
        G.patientAscPageCursors = {};
    }
    if (!forceRefresh && G.patientAscPagesCache[ascPageNumber]) {
        return G.patientAscPagesCache[ascPageNumber];
    }
    if (!forceRefresh && ascPageNumber > 1) {
        const prevPage = ascPageNumber - 1;
        if (!G.patientAscPageCursors[prevPage] || !G.patientAscPagesCache[prevPage]) {
            for (let i = 1; i < ascPageNumber; i++) {
                if (!G.patientAscPagesCache[i]) {
                    await fetchPatientsPageAsc(i, forceRefresh);
                }
            }
        }
    }
    await G.waitForFirebaseDb();
    try {
        const pageSize = G.paginationSettings && G.paginationSettings.patientList && G.paginationSettings.patientList.itemsPerPage
            ? G.paginationSettings.patientList.itemsPerPage
            : 10;
        let q = window.firebase.firestoreQuery(
            window.firebase.collection(window.firebase.db, 'patients'),
            window.firebase.orderBy('patientNumber', 'asc'),
        );
        if (window.firebase.documentId) {
            q = window.firebase.firestoreQuery(q, window.firebase.orderBy(window.firebase.documentId, 'asc'));
        }
        q = window.firebase.firestoreQuery(q, window.firebase.limit(pageSize));
        if (ascPageNumber > 1) {
            const prevCursor = G.patientAscPageCursors[ascPageNumber - 1];
            if (prevCursor) {
                q = window.firebase.firestoreQuery(q, window.firebase.startAfter(prevCursor));
            }
        }
        const snapshot = await window.firebase.getDocs(q);
        const docs = [];
        snapshot.forEach((doc) => {
            docs.push({ id: doc.id, ...doc.data() });
        });
        if (docs.length > 0) {
            const lastDoc = snapshot.docs[snapshot.docs.length - 1];
            G.patientAscPageCursors[ascPageNumber] = lastDoc;
        }
        docs.sort(comparePatientsByNumberDesc);
        G.patientAscPagesCache[ascPageNumber] = docs;
        return docs;
    } catch (error) {
        console.error('升序分頁讀取病人資料失敗:', error);
        return [];
    }
}

export function comparePatientsByNumberDesc(a, b) {
    const numA = (() => {
        const pn = a && a.patientNumber ? String(a.patientNumber) : '';
        const match = pn.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
    })();
    const numB = (() => {
        const pn = b && b.patientNumber ? String(b.patientNumber) : '';
        const match = pn.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
    })();
    return numB - numA;
}

export async function fetchPatientsPageOptimized(pageNumber = 1, forceRefresh = false, knownTotalItems = null) {
    const pageSize = G.paginationSettings && G.paginationSettings.patientList && G.paginationSettings.patientList.itemsPerPage
        ? G.paginationSettings.patientList.itemsPerPage
        : 10;
    const totalItems = typeof knownTotalItems === 'number'
        ? knownTotalItems
        : await getPatientsCount(forceRefresh);
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 1;
    if (pageNumber < 1) pageNumber = 1;
    if (pageNumber > totalPages) pageNumber = totalPages;
    const distanceFromStart = pageNumber - 1;
    const distanceFromEnd = totalPages - pageNumber;
    if (distanceFromEnd < distanceFromStart) {
        const ascPageNumber = distanceFromEnd + 1;
        return await fetchPatientsPageAsc(ascPageNumber, forceRefresh);
    }
    return await fetchPatientsPage(pageNumber, forceRefresh);
}


export async function getPatientsCount(forceRefresh = false) {
    
    if (!forceRefresh && typeof G.patientsCountCache === 'number') {
        return G.patientsCountCache;
    }
    try {
        await G.waitForFirebaseDb();
        
        const colRef = window.firebase.collection(window.firebase.db, 'patients');
        
        const countSnap = await window.firebase.getCountFromServer(colRef);
        const count = countSnap.data().count;
        G.patientsCountCache = typeof count === 'number' ? count : 0;
        return G.patientsCountCache;
    } catch (error) {
        console.error('取得病人總數失敗:', error);
        return 0;
    }
}

// ============================================================
// 病人快取多人同步基礎設施（原 system.js L3728-L4041）
// ============================================================
/* ============================================================
 * 病人快取多人同步基礎設施
 * ------------------------------------------------------------
 * - 本機 CRUD：樂觀就地更新所有快取層，並在 patientsMeta 文檔
 *   蓋上本頁面專屬 nonce；自己的 snapshot 認得 nonce → 跳過，
 *   不再觸發 849 筆全量重讀。
 * - 他人變更（或無 nonce 的舊客戶端）：監聽器只 getDoc 該筆
 *   病人（1 次讀取）做單筆 patch，再以分頁查詢重載可見列表。
 * - meta 缺少 patientId 或單筆同步失敗 → 退回舊式全量失效保險。
 * ============================================================ */
const PATIENT_SYNC_CLIENT_ID = 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const SELF_META_NONCES = []; // 最近由本頁面寫入的 nonce（FIFO，保留 32 個）
const PATIENTS_CACHE_META_KEY = 'patientsCacheMeta';
export const PATIENTS_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // localStorage 病人快取硬保險：12 小時

/** 產生本機寫入專用 nonce 並記住，供稍後 snapshot 辨識「自己觸發的事件」 */
export function newSelfMetaNonce() {
    const nonce = PATIENT_SYNC_CLIENT_ID + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 8);
    SELF_META_NONCES.push(nonce);
    while (SELF_META_NONCES.length > 32) SELF_META_NONCES.shift();
    return nonce;
}

export function isSelfMetaNonce(nonce) {
    return !!nonce && SELF_META_NONCES.indexOf(nonce) !== -1;
}

/** 把 Firestore Timestamp／Date／number 統一轉成毫秒數；無法判斷時回 null */
export function metaTimestampToMillis(value) {
    if (!value) return null;
    if (typeof value === 'number') return value;
    if (typeof value.toMillis === 'function') {
        try { return value.toMillis(); } catch (_e) { /* fall through */ }
    }
    if (typeof value.seconds === 'number') {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
    }
    if (value instanceof Date) return value.getTime();
    if (value.getTime) {
        const t = value.getTime();
        return Number.isNaN(t) ? null : t;
    }
    return null;
}

export function readPatientsStorageMeta() {
    try {
        const raw = localStorage.getItem(PATIENTS_CACHE_META_KEY);
        if (!raw) return null;
        const meta = JSON.parse(raw);
        return meta && typeof meta === 'object' ? meta : null;
    } catch (_e) {
        return null;
    }
}

export function writePatientsStorageMeta(meta) {
    try {
        localStorage.setItem(PATIENTS_CACHE_META_KEY, JSON.stringify(meta || {}));
    } catch (_e) {
        // localStorage 不可用時靜默略過
    }
}

/** 記錄「本地病人快取對應到哪個 meta 時間」；本地沒有病人陣列時不寫入無效戳記 */
export function stampPatientsStorageMetaTimestamp(metaTs) {
    if (metaTs == null) return;
    try {
        if (!localStorage.getItem('patients')) return;
        const meta = readPatientsStorageMeta() || {};
        meta.metaTimestamp = metaTs;
        if (!meta.fetchedAt) meta.fetchedAt = Date.now();
        writePatientsStorageMeta(meta);
    } catch (_e) { /* 忽略 */ }
}

/** 清平分頁快取（不含全量病人快取，全量快取改由單筆 patch 維持新鮮度） */
export function resetPatientPaginationCaches() {
    G.patientCache = null;
    G.patientPagesCache = {};
    G.patientPageCursors = {};
    G.patientAscPagesCache = {};
    G.patientAscPageCursors = {};
}

/** 就地微調病人總數快取（create/delete），避免一次 getCountFromServer */
export function adjustPatientsCountCache(delta) {
    if (typeof G.patientsCountCache === 'number') {
        G.patientsCountCache = Math.max(0, G.patientsCountCache + delta);
    }
}

/** 病人管理分頁正在顯示時才重載（分頁查詢，成本低） */
export function reloadVisiblePatientList() {
    try {
        const sectionEl = document.getElementById('patientManagement');
        if (sectionEl && !sectionEl.classList.contains('hidden') && typeof G.loadPatientList === 'function') {
            G.loadPatientList();
        }
    } catch (_e) { /* 忽略 */ }
}

/** 舊式全量失效：meta 缺 patientId、單筆同步失敗等保險路徑 */
export function invalidateAllPatientCaches() {
    G.patientCache = null;
    G.patientPagesCache = {};
    G.patientPageCursors = {};
    G.patientAscPagesCache = {};
    G.patientAscPageCursors = {};
    G.patientsCountCache = null;
    if (window.firebaseDataManager) {
        window.firebaseDataManager.patientsCache = null;
        window.firebaseDataManager.patientsCacheSource = 'none';
        window.firebaseDataManager.patientsCacheFetchedAt = 0;
    }
    try {
        localStorage.removeItem('patients');
        localStorage.removeItem(PATIENTS_CACHE_META_KEY);
    } catch (_lsErr) { /* 忽略 */ }
}

export function isPatientIdInFullCaches(patientId) {
    const pid = String(patientId);
    if (window.firebaseDataManager && Array.isArray(window.firebaseDataManager.patientsCache)) {
        if (window.firebaseDataManager.patientsCache.some((p) => p && String(p.id) === pid)) return true;
    }
    if (typeof G.patientCache !== 'undefined' && Array.isArray(G.patientCache)) {
        if (G.patientCache.some((p) => p && String(p.id) === pid)) return true;
    }
    try {
        const raw = localStorage.getItem('patients');
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.some((p) => p && String(p.id) === pid)) return true;
        }
    } catch (_e) { /* 忽略 */ }
    return false;
}

/** 他人變更的低成本同步：只讀該筆病人文件並就地 patch，取代整個集合重讀 */
export async function handleRemotePatientMetaChange(meta, metaTs) {
    const operation = meta && meta.operation;
    const pid = meta && meta.patientId != null ? String(meta.patientId) : '';
    if (!pid) {
        // 舊客戶端或系統寫入未帶 patientId，無法定位單筆，退回全量失效
        invalidateAllPatientCaches();
        reloadVisiblePatientList();
        return;
    }
    try {
        await G.waitForFirebaseDb();
        const docSnap = await window.firebase.getDoc(
            window.firebase.doc(window.firebase.db, 'patients', pid)
        );
        const dm = window.firebaseDataManager;
        if (docSnap && docSnap.exists()) {
            const existedBefore = isPatientIdInFullCaches(pid);
            if (dm && typeof dm.applyPatientUpsertToCaches === 'function') {
                dm.applyPatientUpsertToCaches({ id: docSnap.id, ...docSnap.data() });
            }
            // create 且本機此前沒有此病人 → 總數 +1；其餘視為更新，總數不變
            if (operation === 'create' && !existedBefore) adjustPatientsCountCache(1);
        } else {
            const existedBefore = isPatientIdInFullCaches(pid);
            if (dm && typeof dm.applyPatientRemovalToCaches === 'function') {
                dm.applyPatientRemovalToCaches(pid);
            }
            if (operation === 'delete' && existedBefore) adjustPatientsCountCache(-1);
        }
        // patch 成功後才為本地快取蓋上「對應此 meta」的戳記
        if (metaTs != null) stampPatientsStorageMetaTimestamp(metaTs);
        resetPatientPaginationCaches();
        reloadVisiblePatientList();
    } catch (err) {
        console.error('單筆同步病人快取失敗，退回全量刷新:', err);
        invalidateAllPatientCaches();
        reloadVisiblePatientList();
    }
}

/**
 * 清除指定病人的所有病歷快取層，並在該病人的病歷彈窗／病人詳情面板
 * 已開啟時即時重載與刷新 DOM。供：
 *   - patientsMeta 監聽器收到遠端 consultation CRUD
 *   - 本地 consultation CRUD（add/update/retract）完成後
 * 兩者共用同一套快取失效與彈窗刷新邏輯。
 */
export function refreshOpenConsultationHistory(patientId) {
    const pid = String(patientId || '');
    if (!pid) return;

    // 1. 清除單筆病人診症快取
    try { delete G.patientConsultationsCache[pid]; } catch (_e) {}
    // 2. 清除 localStorage 的該病人病歷快取
    try { localStorage.removeItem('patientConsultations:' + pid); } catch (_e) {}
    // 3. 從全域 consultations 陣列中移除屬於該病人的記錄，並同步到 localStorage
    try {
        if (Array.isArray(G.consultations)) {
            G.consultations = G.consultations.filter(c => !(c && String(c.patientId || '') === pid));
            try { localStorage.setItem('consultations', JSON.stringify(G.consultations)); } catch (_lsErr) {}
        }
    } catch (_e) {}

    const pager = G.consultationHistoryPager;
    // 4. 無條件清除 pager 快取：確保之後打開病歷時 ensurePatientState
    //    不會因 state.countReady=true 而返回過期的總數與索引。
    if (pager && typeof pager.clearPatientCache === 'function') {
        pager.clearPatientCache(pid);
    }

    // 5. 若該病人的病歷彈窗已開啟，清除 pager 快取後重載 state 並刷新 DOM
    if (pager) {
        const tryRefresh = async (ctx, modalId, getPidFn) => {
            try {
                const modal = document.getElementById(modalId);
                if (!modal || modal.classList.contains('hidden')) return;
                if (String(getPidFn() || '') !== pid) return;
                // 先清快取，確保 loadForContext 重建 state 時拿到的是最新數據
                if (typeof pager.clearPatientCache === 'function') {
                    pager.clearPatientCache(pid);
                }
                if (typeof pager.loadForContext === 'function') {
                    await pager.loadForContext(ctx, pid);
                }
                // loadForContext 只更新了 state + context 陣列，DOM 需手動刷新
                if (ctx === 'patient') {
                    if (typeof G.displayPatientMedicalHistoryPage === 'function') {
                        G.displayPatientMedicalHistoryPage();
                    }
                } else {
                    if (typeof G.displayConsultationMedicalHistoryPage === 'function') {
                        G.displayConsultationMedicalHistoryPage();
                    }
                }
            } catch (_e) {}
        };
        tryRefresh('patient', 'patientMedicalHistoryModal', () => G.currentPatientHistoryPatientId);
        tryRefresh('consultation', 'medicalHistoryModal', () => G.currentConsultationHistoryPatientId);
    }

    // 6. 如果病人詳情面板正開啟且顯示的就是這個病人，一併刷新診療摘要
    try {
        const detailModal = document.getElementById('patientDetailModal');
        const panelOpen = detailModal && !detailModal.classList.contains('hidden');
        const samePatient = String(G.patientDetailClinicState && G.patientDetailClinicState.patientId || '') === pid;
        if (panelOpen && samePatient && typeof G.loadPatientConsultationSummary === 'function') {
            G.loadPatientConsultationSummary(pid).catch(() => {});
        }
    } catch (_e) {}
}

export async function attachPatientListListener() {
    try {

        await G.waitForFirebaseDb();

        if (G.patientListListenerAttached) return;

        // 監聽 patientsMeta/lastChange 單一文檔，而非整個 patients 集合。
        // 任何病人 CRUD 操作都會先 touchPatientsMeta 更新此文檔，
        // 因此 onSnapshot 能精準觸發且讀取量恒定（初始 1 次 + 每次變更 1 次）。
        let isInitialSnapshot = true;
        const metaDocRef = window.firebase.doc(window.firebase.db, 'patientsMeta', 'lastChange');

        G.patientListUnsubscribe = window.firebase.onSnapshot(metaDocRef, (snapshot) => {
            try {
                const metaData = snapshot && snapshot.data ? (snapshot.data() || {}) : {};
                const metaTs = metaTimestampToMillis(metaData.timestamp);

                if (isInitialSnapshot) {
                    // 首次回調為監聽器建立時的現有狀態：不替本地快取蓋戳背書
                    // （快取可能早於這個 meta），新鮮度交由 getPatients 冷啟動驗證把關
                    isInitialSnapshot = false;
                    return;
                }

                // 自己觸發的事件：本機 CRUD 已同步就地更新快取，蓋戳後跳過
                if (isSelfMetaNonce(metaData.nonce)) {
                    if (metaTs != null) stampPatientsStorageMetaTimestamp(metaTs);
                    return;
                }

                // 他人（或無 nonce 的聚合更新）：單筆 patch，1 次讀取（戳記於 patch 成功後才蓋）
                handleRemotePatientMetaChange(metaData, metaTs);

                // ── 診症 CRUD：清除所有層級的病歷快取並刷新已開啟的彈窗 ─────────
                // system.js 的 _buildPatientAggregatePlan 會把 consultation CRUD 的 meta 帶 kind:'consultation'，
                // 且同一 batch 已更新 patient aggregate（latestConsultationAt 等），
                // 所以 handleRemotePatientMetaChange 已照顧到病人資料層。
                // 但 consultation 集合本身的快取（patientConsultationsCache、consultations 陣列）
                // 不會自動失效，需在此主動清除，否則稍後開啟病歷彈窗時會吃到已被撤回的舊記錄。
                if (metaData.kind === 'consultation' && metaData.patientId) {
                    refreshOpenConsultationHistory(metaData.patientId);
                }
            } catch (innerErr) {
                console.error('病人資料即時更新處理失敗:', innerErr);
            }
        }, (err) => {
            console.error('監聽病人資料失敗:', err);
        });
        G.patientListListenerAttached = true;
    } catch (outerErr) {
        console.error('附加病人資料監聽失敗:', outerErr);
    }
}


export function detachPatientListListener() {
    if (G.patientListListenerAttached) {
        try {
            if (typeof G.patientListUnsubscribe === 'function') {
                G.patientListUnsubscribe();
            }
        } catch (err) {
            console.error('取消病人資料監聽失敗:', err);
        }
        G.patientListListenerAttached = false;
        G.patientListUnsubscribe = null;
    }
}

/**
 * 更新 patientsMeta/lastChange 文檔，用於觸發跨裝置即時更新通知。
 * 病人 CRUD 操作都應調用此函數，onSnapshot 只監聽這一個文檔，
 * 確保讀取量恒定（初始 1 次 + 每次變更 1 次），且無論病人是否在
 * 監聽範圍內都能觸發通知。
 *
 * @param {string} operation 操作類型：'create' | 'update' | 'delete'
 * @param {string} patientId 病人文檔 ID（可選）
 * @param {{nonce?: string}} [options] 傳入 nonce 時，表示由本機 CRUD
 *        樂觀更新所觸發；本頁面的監聽器辨識後會跳過失效邏輯。
 */
export async function touchPatientsMeta(operation, patientId, options) {
    try {
        await G.waitForFirebaseDb();
        const payload = {
            timestamp: new Date(),
            operation: operation || 'update',
            patientId: patientId || null
        };
        if (options && options.kind) payload.kind = options.kind;
        if (options && options.nonce) {
            payload.nonce = options.nonce;
            payload.clientId = PATIENT_SYNC_CLIENT_ID;
        }
        await window.firebase.setDoc(
            window.firebase.doc(window.firebase.db, 'patientsMeta', 'lastChange'),
            payload,
            { merge: true }
        );
    } catch (_e) {
        // metadata 寫入失敗不影響主要操作，靜默處理
    }
}

export async function attachPatientConsultationsListener(patientId) {
    try {
        await G.waitForFirebaseDb();
        const pid = String(patientId);
        if (G.patientConsultationsListeners[pid]) return;
        const colRef = window.firebase.collection(window.firebase.db, 'consultations');
        const q = window.firebase.firestoreQuery(colRef, window.firebase.where('patientId', '==', pid));
        const unsub = window.firebase.onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
            list.sort((a, b) => {
                return G.getConsultationEffectiveTimestamp(b) - G.getConsultationEffectiveTimestamp(a);
            });
            G.patientConsultationsCache[pid] = list;
            try {
                const m1 = document.getElementById('patientMedicalHistoryModal');
                if (m1 && !m1.classList.contains('hidden') && G.currentPatientHistoryPatientId && String(G.currentPatientHistoryPatientId) === pid) {
                    G.consultationHistoryPager.applyListenerList(pid, list);
                    G.displayPatientMedicalHistoryPage();
                }
            } catch (_e) {}
            try {
                const m2 = document.getElementById('medicalHistoryModal');
                if (m2 && !m2.classList.contains('hidden') && G.currentConsultationHistoryPatientId && String(G.currentConsultationHistoryPatientId) === pid) {
                    G.consultationHistoryPager.applyListenerList(pid, list);
                    G.displayConsultationMedicalHistoryPage();
                }
            } catch (_e) {}
        }, (_err) => {});
        G.patientConsultationsListeners[pid] = unsub;
    } catch (_outerErr) {}
}

export function detachPatientConsultationsListener(patientId) {
    const pid = String(patientId || '');
    const unsub = G.patientConsultationsListeners[pid];
    if (unsub && typeof unsub === 'function') {
        try { unsub(); } catch (_e) {}
    }
    delete G.patientConsultationsListeners[pid];
}
