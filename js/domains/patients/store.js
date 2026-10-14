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
        const dm = window.firebaseDataManager;
        const memoryCache = dm && Array.isArray(dm.patientsCache)
            ? dm.patientsCache
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
                // 僅當全量快取已經載入（remote 或已驗證的 localStorage）時才就地更新，
                // 切勿在 patientsCache === null 時把單筆病人塞進去冒充全量快取！
                try {
                    if (dm && Array.isArray(dm.patientsCache) && dm.patientsCache.length > 0 &&
                        (dm.patientsCacheSource === 'remote' || dm.patientsCacheSource === 'localStorage')) {
                        const idx = dm.patientsCache.findIndex(p => p && String(p.id) === idStr);
                        if (idx >= 0) {
                            dm.patientsCache[idx] = patient;
                        } else {
                            dm.patientsCache.push(patient);
                        }
                    }
                } catch (_e) {}
                try {
                    const stored = localStorage.getItem('patients');
                    const meta = readPatientsStorageMeta();
                    if (stored && meta && meta.metaTimestamp != null) {
                        const arr = JSON.parse(stored);
                        if (Array.isArray(arr) && arr.length > 0) {
                            const idx2 = arr.findIndex(p => p && String(p.id) === idStr);
                            if (idx2 >= 0) {
                                arr[idx2] = patient;
                            } else {
                                arr.push(patient);
                            }
                            localStorage.setItem('patients', JSON.stringify(arr));
                        }
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


const PATIENT_PAGE_ANCHORS_LS_KEY = 'patientPageAnchorsV1';
let _sortedPatientsViewCache = null;
let _sortedPatientsViewCacheLen = -1;
let _coldStartLocalValidationPromise = null;
let _coldStartLocalValidated = false;
let _patientDescAnchors = {};
let _patientAscAnchors = {};
let _patientAnchorsPageSize = 10;

function extractPatientCursorAnchor(docOrObj) {
    if (!docOrObj) return null;
    const isSnap = typeof docOrObj.data === 'function';
    const data = isSnap ? (docOrObj.data() || {}) : docOrObj;
    const id = String(docOrObj.id || data.id || '');
    if (!id) return null;
    const raw = data.createdAt;
    if (!raw) return null;
    let sec = null;
    let nano = 0;
    let ms = 0;
    if (typeof raw.seconds === 'number') {
        sec = raw.seconds;
        nano = typeof raw.nanoseconds === 'number' ? raw.nanoseconds : 0;
        ms = sec * 1000 + Math.floor(nano / 1000000);
    } else {
        ms = parsePatientCreatedAtMillis(data);
        if (ms > 0) {
            sec = Math.floor(ms / 1000);
            nano = (ms % 1000) * 1000000;
        }
    }
    if (!ms && sec === null) return null;
    return { sec, nano, ms, id };
}

function buildStartAfterValueFromAnchor(anchor) {
    if (!anchor) return null;
    if (window.firebase && typeof window.firebase.Timestamp === 'function' && typeof anchor.sec === 'number') {
        try {
            return new window.firebase.Timestamp(anchor.sec, anchor.nano || 0);
        } catch (_e) {}
    }
    if (typeof anchor.ms === 'number' && anchor.ms > 0) {
        return new Date(anchor.ms);
    }
    return null;
}

function loadPersistedPatientAnchors(pageSize) {
    if (_patientAnchorsPageSize !== pageSize) {
        _patientDescAnchors = {};
        _patientAscAnchors = {};
        _patientAnchorsPageSize = pageSize;
    }
    if (Object.keys(_patientDescAnchors).length > 0 || Object.keys(_patientAscAnchors).length > 0) {
        return;
    }
    try {
        const raw = localStorage.getItem(PATIENT_PAGE_ANCHORS_LS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.pageSize !== pageSize) return;
        const meta = readPatientsStorageMeta();
        if (meta && meta.metaTimestamp && parsed.metaTimestamp && parsed.metaTimestamp !== meta.metaTimestamp) {
            return;
        }
        if (typeof G.patientsCountCache === 'number' && parsed.totalCount && parsed.totalCount !== G.patientsCountCache) {
            return;
        }
        if (parsed.desc && typeof parsed.desc === 'object') {
            _patientDescAnchors = { ...parsed.desc };
        }
        if (parsed.asc && typeof parsed.asc === 'object') {
            _patientAscAnchors = { ...parsed.asc };
        }
    } catch (_e) {}
}

function savePersistedPatientAnchors(pageSize) {
    try {
        const meta = readPatientsStorageMeta();
        const payload = {
            pageSize,
            metaTimestamp: (meta && meta.metaTimestamp) || null,
            totalCount: typeof G.patientsCountCache === 'number' ? G.patientsCountCache : null,
            savedAt: Date.now(),
            desc: _patientDescAnchors,
            asc: _patientAscAnchors
        };
        localStorage.setItem(PATIENT_PAGE_ANCHORS_LS_KEY, JSON.stringify(payload));
    } catch (_e) {}
}

function setDescAnchor(page, pageSize, docOrObj) {
    loadPersistedPatientAnchors(pageSize);
    const anchor = extractPatientCursorAnchor(docOrObj);
    if (anchor) {
        _patientDescAnchors[page] = anchor;
        savePersistedPatientAnchors(pageSize);
    }
}

function setAscAnchor(ascPage, pageSize, docOrObj) {
    loadPersistedPatientAnchors(pageSize);
    const anchor = extractPatientCursorAnchor(docOrObj);
    if (anchor) {
        _patientAscAnchors[ascPage] = anchor;
        savePersistedPatientAnchors(pageSize);
    }
}

function getDescAnchor(page, pageSize) {
    loadPersistedPatientAnchors(pageSize);
    return _patientDescAnchors[page] || null;
}

function getAscAnchor(ascPage, pageSize) {
    loadPersistedPatientAnchors(pageSize);
    return _patientAscAnchors[ascPage] || null;
}

function buildAndPersistAnchorsFromSortedList(sortedDescList, pageSize) {
    if (!Array.isArray(sortedDescList) || sortedDescList.length === 0) return;
    _patientAnchorsPageSize = pageSize;
    _patientDescAnchors = {};
    _patientAscAnchors = {};
    const total = sortedDescList.length;
    const totalPages = Math.ceil(total / pageSize);
    for (let p = 1; p <= totalPages; p++) {
        const endIdx = Math.min(p * pageSize, total) - 1;
        const lastItem = sortedDescList[endIdx];
        const anchor = extractPatientCursorAnchor(lastItem);
        if (anchor) _patientDescAnchors[p] = anchor;
    }
    for (let ascP = 1; ascP <= totalPages; ascP++) {
        const ascEndOffset = Math.min(ascP * pageSize, total);
        const descIdx = total - ascEndOffset;
        const lastAscItem = sortedDescList[descIdx];
        const anchor = extractPatientCursorAnchor(lastAscItem);
        if (anchor) _patientAscAnchors[ascP] = anchor;
    }
    savePersistedPatientAnchors(pageSize);
}

/**
 * 方案 1：優先取得本機已同步的全量病人快取（記憶體 patientsCache 或經 patientsMeta 驗證的 localStorage）。
 * 嚴格核對快取來源（remote / localStorage）與總筆數（knownTotal），防止單筆快取或空陣列誤充全量快取。
 */
async function resolveVerifiedFullPatientsCache(forceRefresh = false, expectedTotalCount = null) {
    if (forceRefresh) {
        _sortedPatientsViewCache = null;
        _sortedPatientsViewCacheLen = -1;
        return null;
    }
    const knownCount = typeof expectedTotalCount === 'number' && expectedTotalCount > 0
        ? expectedTotalCount
        : (typeof G.patientsCountCache === 'number' && G.patientsCountCache > 0 ? G.patientsCountCache : null);

    const isCompleteList = (arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return false;
        if (knownCount !== null && arr.length !== knownCount) return false;
        return true;
    };

    const dm = window.firebaseDataManager;
    if (dm && (dm.patientsCacheSource === 'remote' || dm.patientsCacheSource === 'localStorage') && isCompleteList(dm.patientsCache)) {
        return dm.patientsCache;
    }
    if (isCompleteList(G.patientCache)) {
        if (dm) {
            dm.patientsCache = G.patientCache;
            if (!dm.patientsCacheSource || dm.patientsCacheSource === 'none') {
                dm.patientsCacheSource = 'remote';
            }
        }
        return G.patientCache;
    }
    if (_coldStartLocalValidated) {
        if (dm && (dm.patientsCacheSource === 'remote' || dm.patientsCacheSource === 'localStorage') && isCompleteList(dm.patientsCache)) {
            return dm.patientsCache;
        }
        return null;
    }
    if (dm && typeof dm.loadPatientsFromLocalStorageWithValidation === 'function') {
        let hasValidLocalMeta = false;
        try {
            const raw = localStorage.getItem('patients');
            const meta = readPatientsStorageMeta();
            hasValidLocalMeta = !!(raw && meta && meta.metaTimestamp != null);
        } catch (_e) {}
        if (!hasValidLocalMeta) {
            _coldStartLocalValidated = true;
            return null;
        }
        if (!_coldStartLocalValidationPromise) {
            _coldStartLocalValidationPromise = (async () => {
                try {
                    const localData = await dm.loadPatientsFromLocalStorageWithValidation();
                    _coldStartLocalValidated = true;
                    if (isCompleteList(localData)) {
                        dm.patientsCache = localData;
                        dm.patientsCacheSource = 'localStorage';
                        const cacheMeta = readPatientsStorageMeta();
                        dm.patientsCacheFetchedAt = (cacheMeta && cacheMeta.fetchedAt) || Date.now();
                        return localData;
                    }
                    // 若本地陣列筆數與伺服器總數不符（如舊版殘留局部陣列），清除之以退回 Firestore 分頁查詢
                    if (Array.isArray(localData) && knownCount !== null && localData.length !== knownCount) {
                        try {
                            localStorage.removeItem('patients');
                            localStorage.removeItem(PATIENTS_CACHE_META_KEY);
                        } catch (_e) {}
                    }
                    return null;
                } catch (_err) {
                    _coldStartLocalValidated = true;
                    return null;
                } finally {
                    _coldStartLocalValidationPromise = null;
                }
            })();
        }
        return await _coldStartLocalValidationPromise;
    }
    return null;
}

function getSortedPatientsFromFullCache(fullList, pageSize) {
    if (!Array.isArray(fullList)) return null;
    if (!_sortedPatientsViewCache || _sortedPatientsViewCacheLen !== fullList.length) {
        _sortedPatientsViewCache = fullList.slice().sort(comparePatientsByCreatedAtDesc);
        _sortedPatientsViewCacheLen = _sortedPatientsViewCache.length;
        buildAndPersistAnchorsFromSortedList(_sortedPatientsViewCache, pageSize);
    }
    return _sortedPatientsViewCache;
}

export async function fetchPatientsPage(pageNumber = 1, forceRefresh = false) {
    if (pageNumber < 1) pageNumber = 1;
    const pageSize = G.paginationSettings && G.paginationSettings.patientList && G.paginationSettings.patientList.itemsPerPage
        ? G.paginationSettings.patientList.itemsPerPage
        : 10;

    if (forceRefresh) {
        G.patientPagesCache = {};
        G.patientPageCursors = {};
        G.patientAscPagesCache = {};
        G.patientAscPageCursors = {};
        _sortedPatientsViewCache = null;
        _sortedPatientsViewCacheLen = -1;
    }

    if (!forceRefresh && G.patientPagesCache[pageNumber]) {
        return G.patientPagesCache[pageNumber];
    }

    // 方案 1：若已有通過驗證的全量快取，直接切頁返回（0 次讀取）
    const fullList = await resolveVerifiedFullPatientsCache(forceRefresh);
    if (Array.isArray(fullList) && fullList.length > 0) {
        const sorted = getSortedPatientsFromFullCache(fullList, pageSize);
        const startIdx = (pageNumber - 1) * pageSize;
        const pageSlice = sorted.slice(startIdx, startIdx + pageSize);
        G.patientPagesCache[pageNumber] = pageSlice;
        return pageSlice;
    }

    await G.waitForFirebaseDb();
    try {
        const colRef = window.firebase.collection(window.firebase.db, 'patients');

        // 方案 3 + 方案 2：尋找距離目標頁碼最近的已知游標（DocumentSnapshot）或持久化輕量錨點
        let startFromPage = 0; // 0 代表從第 1 頁頭開始抓
        let startAfterCursorSnap = null;
        let startAfterTsVal = null;

        if (pageNumber > 1 && !forceRefresh) {
            for (let p = pageNumber - 1; p >= 1; p--) {
                if (G.patientPageCursors[p]) {
                    startFromPage = p;
                    startAfterCursorSnap = G.patientPageCursors[p];
                    break;
                }
                const anchor = getDescAnchor(p, pageSize);
                const tsVal = buildStartAfterValueFromAnchor(anchor);
                if (tsVal) {
                    startFromPage = p;
                    startAfterTsVal = tsVal;
                    break;
                }
            }
        }

        const pagesToFetch = pageNumber - startFromPage; // 若有上一頁錨點則為 1（只抓目標頁 10 筆）；否則單次批量抓齊
        let q = window.firebase.firestoreQuery(
            colRef,
            window.firebase.orderBy('createdAt', 'desc')
        );
        if (startAfterCursorSnap) {
            q = window.firebase.firestoreQuery(q, window.firebase.startAfter(startAfterCursorSnap));
        } else if (startAfterTsVal) {
            q = window.firebase.firestoreQuery(q, window.firebase.startAfter(startAfterTsVal));
        }
        q = window.firebase.firestoreQuery(q, window.firebase.limit(pagesToFetch * pageSize));

        const snapshot = await window.firebase.getDocs(q);
        const rawDocSnaps = snapshot.docs || [];

        for (let offset = 0; offset < pagesToFetch; offset++) {
            const targetP = startFromPage + offset + 1;
            const chunkSnaps = rawDocSnaps.slice(offset * pageSize, (offset + 1) * pageSize);
            const chunkDocs = chunkSnaps.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            if (chunkSnaps.length > 0) {
                const lastSnap = chunkSnaps[chunkSnaps.length - 1];
                G.patientPageCursors[targetP] = lastSnap;
                setDescAnchor(targetP, pageSize, lastSnap);
            }
            G.patientPagesCache[targetP] = chunkDocs;
        }

        if (typeof window.trimCache === 'function') {
            window.trimCache(G.patientPagesCache, 50);
        }
        return G.patientPagesCache[pageNumber] || [];
    } catch (error) {
        console.error('分頁讀取病人資料失敗:', error);
        return [];
    }
}

export async function fetchPatientsPageAsc(ascPageNumber = 1, forceRefresh = false) {
    if (ascPageNumber < 1) ascPageNumber = 1;
    const pageSize = G.paginationSettings && G.paginationSettings.patientList && G.paginationSettings.patientList.itemsPerPage
        ? G.paginationSettings.patientList.itemsPerPage
        : 10;

    if (forceRefresh) {
        G.patientPagesCache = {};
        G.patientPageCursors = {};
        G.patientAscPagesCache = {};
        G.patientAscPageCursors = {};
        _sortedPatientsViewCache = null;
        _sortedPatientsViewCacheLen = -1;
    }
    if (!forceRefresh && G.patientAscPagesCache[ascPageNumber]) {
        return G.patientAscPagesCache[ascPageNumber];
    }

    await G.waitForFirebaseDb();
    try {
        const colRef = window.firebase.collection(window.firebase.db, 'patients');

        let startFromAscPage = 0;
        let startAfterCursorSnap = null;
        let startAfterTsVal = null;

        if (ascPageNumber > 1 && !forceRefresh) {
            for (let p = ascPageNumber - 1; p >= 1; p--) {
                if (G.patientAscPageCursors[p]) {
                    startFromAscPage = p;
                    startAfterCursorSnap = G.patientAscPageCursors[p];
                    break;
                }
                const anchor = getAscAnchor(p, pageSize);
                const tsVal = buildStartAfterValueFromAnchor(anchor);
                if (tsVal) {
                    startFromAscPage = p;
                    startAfterTsVal = tsVal;
                    break;
                }
            }
        }

        const pagesToFetch = ascPageNumber - startFromAscPage;
        let q = window.firebase.firestoreQuery(
            colRef,
            window.firebase.orderBy('createdAt', 'asc')
        );
        if (startAfterCursorSnap) {
            q = window.firebase.firestoreQuery(q, window.firebase.startAfter(startAfterCursorSnap));
        } else if (startAfterTsVal) {
            q = window.firebase.firestoreQuery(q, window.firebase.startAfter(startAfterTsVal));
        }
        q = window.firebase.firestoreQuery(q, window.firebase.limit(pagesToFetch * pageSize));

        const snapshot = await window.firebase.getDocs(q);
        const rawDocSnaps = snapshot.docs || [];

        for (let offset = 0; offset < pagesToFetch; offset++) {
            const targetAscP = startFromAscPage + offset + 1;
            const chunkSnaps = rawDocSnaps.slice(offset * pageSize, (offset + 1) * pageSize);
            const chunkDocs = chunkSnaps.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            if (chunkSnaps.length > 0) {
                const lastSnap = chunkSnaps[chunkSnaps.length - 1];
                G.patientAscPageCursors[targetAscP] = lastSnap;
                setAscAnchor(targetAscP, pageSize, lastSnap);
            }
            chunkDocs.sort(comparePatientsByCreatedAtDesc);
            G.patientAscPagesCache[targetAscP] = chunkDocs;
        }

        if (typeof window.trimCache === 'function') {
            window.trimCache(G.patientAscPagesCache, 50);
        }
        return G.patientAscPagesCache[ascPageNumber] || [];
    } catch (error) {
        console.error('升序分頁讀取病人資料失敗:', error);
        return [];
    }
}

export function parsePatientCreatedAtMillis(patient) {
    if (!patient || !patient.createdAt) return 0;
    const val = patient.createdAt;
    if (typeof val.toMillis === 'function') {
        try { return val.toMillis(); } catch (_e) {}
    }
    if (typeof val.seconds === 'number') {
        return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1000000);
    }
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? 0 : val.getTime();
    }
    if (typeof val === 'number') {
        return val;
    }
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function comparePatientsByCreatedAtDesc(a, b) {
    const timeA = parsePatientCreatedAtMillis(a);
    const timeB = parsePatientCreatedAtMillis(b);
    if (timeB !== timeA) {
        return timeB - timeA;
    }
    const numA = (() => {
        const pn = a && a.patientNumber ? String(a.patientNumber) : "";
        const match = pn.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
    })();
    const numB = (() => {
        const pn = b && b.patientNumber ? String(b.patientNumber) : "";
        const match = pn.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
    })();
    return numB - numA;
}

export const comparePatientsByNumberDesc = comparePatientsByCreatedAtDesc;

export async function fetchPatientsPageOptimized(pageNumber = 1, forceRefresh = false, knownTotalItems = null) {
    const pageSize = G.paginationSettings && G.paginationSettings.patientList && G.paginationSettings.patientList.itemsPerPage
        ? G.paginationSettings.patientList.itemsPerPage
        : 10;

    const totalItems = typeof knownTotalItems === 'number'
        ? knownTotalItems
        : await getPatientsCount(forceRefresh);

    // 方案 1：優先使用記憶體或已通過 patientsMeta 與總筆數雙重驗證的 localStorage 全量病人快取切頁（0 次 Firestore 讀取）
    const fullList = await resolveVerifiedFullPatientsCache(forceRefresh, totalItems);
    if (Array.isArray(fullList) && fullList.length > 0) {
        const sorted = getSortedPatientsFromFullCache(fullList, pageSize);
        const totalPages = sorted.length > 0 ? Math.ceil(sorted.length / pageSize) : 1;
        let clampedPage = pageNumber < 1 ? 1 : (pageNumber > totalPages ? totalPages : pageNumber);
        const startIdx = (clampedPage - 1) * pageSize;
        const pageSlice = sorted.slice(startIdx, startIdx + pageSize);
        G.patientPagesCache[clampedPage] = pageSlice;
        return pageSlice;
    }

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
    const dm = window.firebaseDataManager;
    if (!forceRefresh && dm && dm.patientsCacheSource === 'remote' && Array.isArray(dm.patientsCache) && dm.patientsCache.length > 0) {
        G.patientsCountCache = dm.patientsCache.length;
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
export function resetPatientPaginationCaches(options = {}) {
    const preserveAnchors = !!(options && options.preserveAnchors);
    G.patientCache = null;
    G.patientPagesCache = {};
    G.patientPageCursors = {};
    G.patientAscPagesCache = {};
    G.patientAscPageCursors = {};
    _sortedPatientsViewCache = null;
    _sortedPatientsViewCacheLen = -1;
    if (!preserveAnchors) {
        _patientDescAnchors = {};
        _patientAscAnchors = {};
        try {
            localStorage.removeItem(PATIENT_PAGE_ANCHORS_LS_KEY);
        } catch (_e) {}
    }
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
    _sortedPatientsViewCache = null;
    _sortedPatientsViewCacheLen = -1;
    _coldStartLocalValidated = false;
    _patientDescAnchors = {};
    _patientAscAnchors = {};
    if (window.firebaseDataManager) {
        window.firebaseDataManager.patientsCache = null;
        window.firebaseDataManager.patientsCacheSource = 'none';
        window.firebaseDataManager.patientsCacheFetchedAt = 0;
    }
    try {
        localStorage.removeItem('patients');
        localStorage.removeItem(PATIENTS_CACHE_META_KEY);
        localStorage.removeItem(PATIENT_PAGE_ANCHORS_LS_KEY);
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
        // 他人裝置可能剛新增／扣減／修改此病人的套票：同步清除本機的該病人套票快取，
        // 並在診症表單或病人詳情視窗正開著此病人時即時重繪，確保多人同時操作套票不讀到舊快取。
        try {
            if (G.patientPackagesCache && Object.prototype.hasOwnProperty.call(G.patientPackagesCache, pid)) {
                delete G.patientPackagesCache[pid];
            }
            try { localStorage.removeItem(`patientPackages_${pid}`); } catch (_lsPkgErr) {}
            if (typeof G.invalidatePatientPackageHistoryCaches === 'function') {
                G.invalidatePatientPackageHistoryCaches(pid);
            }
            const currAppt = (G.currentConsultingAppointmentId && Array.isArray(G.appointments))
                ? G.appointments.find(a => a && String(a.id) === String(G.currentConsultingAppointmentId))
                : null;
            if (currAppt && String(currAppt.patientId) === pid && typeof G.refreshPatientPackagesUI === 'function') {
                G.refreshPatientPackagesUI().catch(() => {});
            }
            const detailModal = document.getElementById('patientDetailModal');
            const detailOpen = detailModal && !detailModal.classList.contains('hidden');
            const sameDetailPid = String(G.patientDetailClinicState && G.patientDetailClinicState.patientId || '') === pid;
            if (detailOpen && sameDetailPid && typeof G.loadPatientConsultationSummary === 'function') {
                G.loadPatientConsultationSummary(pid).catch(() => {});
            }
        } catch (_pkgSyncErr) {}

        // patch 成功後才為本地快取蓋上「對應此 meta」的戳記
        if (metaTs != null) stampPatientsStorageMetaTimestamp(metaTs);
        resetPatientPaginationCaches({ preserveAnchors: operation === 'update' });
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
 *
 * @param {string} patientId 病人 ID
 * @param {'add'|'update'|'delete'|string} [operation] 操作類型：
 *   - 'delete' 時會從全域 G.consultations 陣列移除該病人的記錄
 *   - 'add' / 'update' 時跳過移除（記錄仍存在，只是新增或修改）
 */
export function refreshOpenConsultationHistory(patientId, operation) {
    const pid = String(patientId || '');
    if (!pid) return;

    // 1. 清除單筆病人診症快取與最近 10 筆輕量快取
    try { delete G.patientConsultationsCache[pid]; } catch (_e) {}
    try {
        if (window.firebaseDataManager && window.firebaseDataManager.recentPatientConsultationsCache) {
            delete window.firebaseDataManager.recentPatientConsultationsCache[pid];
        }
    } catch (_eRecent) {}
    // 2. 清除 localStorage 的該病人病歷快取
    try { localStorage.removeItem('patientConsultations:' + pid); } catch (_e) {}
    // 3. 從全域 consultations 陣列中移除屬於該病人的記錄，並同步到 localStorage
    //    僅在 delete 時執行——add/update 時記錄仍存在，不能移除
    if (operation === 'delete') {
        try {
            if (Array.isArray(G.consultations)) {
                G.consultations = G.consultations.filter(c => !(c && String(c.patientId || '') === pid));
                try { localStorage.setItem('consultations', JSON.stringify(G.consultations)); } catch (_lsErr) {}
            }
        } catch (_e) {}
    }

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

                // 自己觸發的事件：本機 CRUD 已同步就地更新快取，蓋戳後跳過。
                // 病歷管理列表的失效由各 CRUD 路徑（add/update/deleteConsultation、
                // 撤回）在寫入成功後直接呼叫 invalidateMedicalRecordListCache，
                // 不依賴這個 snapshot 回聲（且避免回聲造成二次重載）。
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
                    refreshOpenConsultationHistory(metaData.patientId, metaData.operation);
                    // 病歷管理列表持久化/分頁快取失效，頁面開著則 debounce 重載；
                    // 同時丟棄該病人的完整病歷詳情快取（編輯內容或撤回）。
                    if (typeof G.invalidateMedicalRecordListCache === 'function') {
                        G.invalidateMedicalRecordListCache({
                            patientId: metaData.patientId,
                            reloadIfVisible: true
                        });
                    }
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
