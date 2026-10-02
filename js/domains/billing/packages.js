/* ============================================================
 * billing/packages.js — 病人套票：診所隔離、購買／消耗／撤銷、
 * 歷史記錄、狀態面板與錢包小卡（Phase 5 子批 B）。
 * 共享狀態所有權仍在 system.js，經 G 讀寫；
 * initBillingItems 與收費項目模組同域直接 import。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { initBillingItems } from './items.js';

export function currentPackageClinicId() {
    try {
        const cid = (typeof G.currentClinicId !== 'undefined' && G.currentClinicId)
            ? String(G.currentClinicId)
            : (localStorage.getItem('currentClinicId') || '');
        return (!cid || cid === 'local-default') ? '' : cid;
    } catch (_e) {
        return '';
    }
}

// 病人詳情面板中「套票＋儲值」區的診所選單狀態（同一病人重新渲染時保留選擇）
export function resolvePatientDetailClinic(patientId) {
    const pid = String(patientId || '');
    if (G.patientDetailClinicState.patientId !== pid) {
        G.patientDetailClinicState.patientId = pid;
        G.patientDetailClinicState.clinicId = currentPackageClinicId();
    }
    if (!G.patientDetailClinicState.clinicId) {
        G.patientDetailClinicState.clinicId = currentPackageClinicId();
    }
    return G.patientDetailClinicState.clinicId;
}

/**
 * 依診所過濾套票。
 *  - clinicId === '*'：回傳全部（病人級審計/遷移用途）
 *  - 其餘：只回傳該診所套票；過渡期間「未標注診所」的舊套票
 *    （clinicId 為空）在各診所視圖中仍可見（fail-open，同錢包過渡政策）。
 */
export function filterPackagesByClinic(packages, clinicId) {
    if (!Array.isArray(packages)) return [];
    if (clinicId === '*') return packages;
    const cid = String(clinicId || '');
    return packages.filter(pkg => {
        if (!pkg) return false;
        const pkgClinic = String(pkg.clinicId || '');
        return pkgClinic === cid || pkgClinic === '';
    });
}

/**
 * 套票診所歸屬懶人遷移：為缺少 clinicId 的舊套票補上歸屬診所。
 * 證據優先級：
 *  1. 套票使用記錄（consultations.financialSummaryItems 中 packageUse 列的
 *     packageRecordId 直接對應）
 *  2. 病人只在單一診所就診 → 全部歸該診所
 *  3. 購買同日、含同名套票銷售列的診症單
 * 無法判斷者保留 clinicId=''（過渡期內各診所視圖仍可見）。
 *
 * @param {string} patientId 病人 ID
 */
export async function ensurePatientPackagesClinicScoped(patientId) {
    // 先走快取（本地完整清單；空清單也會被快取）：全部已標注時
    // 完全不產生讀取。僅發現未標注舊套票時，才強制刷新確認最新狀態。
    let allPackages = await getPatientPackages(patientId, false, '*');
    let missing = allPackages.filter(pkg => pkg && !pkg.clinicId);
    if (missing.length > 0) {
        allPackages = await getPatientPackages(patientId, true, '*');
        missing = allPackages.filter(pkg => pkg && !pkg.clinicId);
    }
    if (missing.length === 0) {
        // 套票均已標注：仍確認歷史流水是否需要補標（記憶體標記命中時零成本）
        const pkgClinicMap0 = new Map();
        allPackages.forEach(p => {
            if (p && p.clinicId) pkgClinicMap0.set(String(p.id), String(p.clinicId));
        });
        await ensurePatientPackageHistoryClinicScoped(patientId, pkgClinicMap0, null);
        return;
    }

    // 套票 packageId → 已標注診所（先以快取中已知者預填）
    const pkgClinicById = new Map();
    allPackages.forEach(p => {
        if (p && p.clinicId) pkgClinicById.set(String(p.id), String(p.clinicId));
    });

    // 讀取病人診症記錄作為歸屬證據（單一 where 查詢，限量由系統規模自然收斂）
    let consultations = [];
    try {
        const q = window.firebase.firestoreQuery(
            window.firebase.collection(window.firebase.db, 'consultations'),
            window.firebase.where('patientId', '==', String(patientId))
        );
        const snap = await window.firebase.getDocs(q);
        consultations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.warn('遷移套票診所時讀取診症記錄失敗:', error);
        return;
    }

    // 證據 1：套票使用列（packageRecordId → 診所）
    const useEvidence = new Map();
    consultations.forEach(cons => {
        const cid = cons.clinicId ? String(cons.clinicId) : '';
        if (!cid) return;
        const items = Array.isArray(cons.financialSummaryItems) ? cons.financialSummaryItems : [];
        items.forEach(it => {
            if (it && it.packageRecordId && !useEvidence.has(String(it.packageRecordId))) {
                useEvidence.set(String(it.packageRecordId), cid);
            }
        });
    });

    const clinicIds = Array.from(new Set(
        consultations.map(cons => String(cons.clinicId || '')).filter(Boolean)
    ));

    // 證據 3：購買同日含同名套票銷售列（僅多診所病人才需要）
    const saleEvidence = new Map();
    if (clinicIds.length > 1) {
        missing.forEach(pkg => {
            if (useEvidence.has(String(pkg.id))) return;
            const purchaseMs = Date.parse(pkg.purchasedAt);
            if (!Number.isFinite(purchaseMs)) return;
            const purchaseDay = new Date(purchaseMs).toDateString();
            for (const cons of consultations) {
                if (!cons.clinicId) continue;
                const consDate = G.getConsultationEffectiveDate(cons);
                if (!consDate || consDate.toDateString() !== purchaseDay) continue;
                const items = Array.isArray(cons.financialSummaryItems) ? cons.financialSummaryItems : [];
                const hasSale = items.some(it => it
                    && String(it.category) === 'package'
                    && String(it.name || '') === String(pkg.name || ''));
                if (hasSale) {
                    saleEvidence.set(String(pkg.id), String(cons.clinicId));
                    break;
                }
            }
        });
    }

    const patches = [];
    for (const pkg of missing) {
        let cid = useEvidence.get(String(pkg.id)) || saleEvidence.get(String(pkg.id)) || '';
        // 證據 2：單一診所病人
        if (!cid && clinicIds.length === 1) cid = clinicIds[0];
        if (cid) patches.push({ pkg, clinicId: cid });
    }

    for (const { pkg, clinicId } of patches) {
        try {
            await window.firebaseDataManager.updatePatientPackage(pkg.id, { ...pkg, clinicId });
        } catch (error) {
            console.warn('補標套票診所失敗:', error);
        }
    }

    if (patches.length > 0) {
        try {
            const result = await window.firebaseDataManager.getPatientPackages(patientId);
            const list = result.success ? result.data : [];
            G.patientPackagesCache[patientId] = list;
            localStorage.setItem(`patientPackages_${patientId}`, JSON.stringify(list));
            // 以補標後的套票建立 packageId → clinicId 映射，供歷史流水補標
            list.forEach(p => {
                if (p && p.clinicId) pkgClinicById.set(String(p.id), String(p.clinicId));
            });
        } catch (_e) {}
    }

    // 同步為歷史流水補上診所（失敗不阻擋套票遷移結果）
    await ensurePatientPackageHistoryClinicScoped(patientId, pkgClinicById, useEvidence);
}

/**
 * 歷史流水診所補標：為缺 clinicId 的 patientPackageHistory 文件補上歸屬。
 * 判據：① 所屬套票（packageId → 套票 clinicId）；② 診症使用證據。
 * 以 session 內記憶體標記避免每次開面板都查一次空集合。
 */
const historyClinicBackfillDone = new Set();
export async function ensurePatientPackageHistoryClinicScoped(patientId, pkgClinicMap, useEvidenceMap) {
    const pid = String(patientId || '');
    if (!pid || historyClinicBackfillDone.has(pid)) return;
    historyClinicBackfillDone.add(pid);
    try {
        // 兩個相等過濾可由自動單欄索引服務，無需複合索引
        const q = window.firebase.firestoreQuery(
            window.firebase.collection(window.firebase.db, 'patientPackageHistory'),
            window.firebase.where('patientId', '==', pid),
            window.firebase.where('clinicId', '==', '')
        );
        const snap = await window.firebase.getDocs(q);
        const tasks = [];
        snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            let cid = pkgClinicMap && pkgClinicMap.get(String(d.packageId || ''))
                ? pkgClinicMap.get(String(d.packageId || ''))
                : '';
            if (!cid && useEvidenceMap && useEvidenceMap.has(String(d.packageId || ''))) {
                cid = useEvidenceMap.get(String(d.packageId || ''));
            }
            if (cid) {
                tasks.push(window.firebase.updateDoc(docSnap.ref, { clinicId: String(cid) }));
            }
        });
        await Promise.all(tasks);
    } catch (error) {
        // 補標失敗不影響主流程；移除標記以便日後重試
        historyClinicBackfillDone.delete(pid);
        console.warn('補標套票歷史診所失敗:', error);
    }
}

/**
 * 取得病人套票。快取中保留病人「全部診所」的完整清單，
 * 再依 clinicId 參數過濾，讀取量與舊制完全相同。
 *
 * @param {string} patientId 病人 ID
 * @param {boolean} forceRefresh 是否強制重讀
 * @param {string|null} clinicId 診所 ID；null＝目前診所，'*'＝全部
 */
export async function getPatientPackages(patientId, forceRefresh = false, clinicId = null) {
    const resolveClinic = () => clinicId === null ? currentPackageClinicId() : clinicId;
    // 等待數據管理器準備就緒，避免初始化過程中返回空陣列
    if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
        // 最多等待5秒（100 * 50ms），防止無限等待
        for (let i = 0; i < 100 && (!window.firebaseDataManager || !window.firebaseDataManager.isReady); i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    // 如果仍未就緒，回傳空陣列並警告
    if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
        console.warn('FirebaseDataManager 尚未就緒，無法取得患者套票');
        return [];
    }
    // 如果有本地緩存且不需要強制刷新，優先從 localStorage 讀取
    if (!forceRefresh) {
        try {
            const localKey = `patientPackages_${patientId}`;
            const stored = localStorage.getItem(localKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    // 更新內存快取並依診所過濾後回傳
                    G.patientPackagesCache[patientId] = parsed;
                    return filterPackagesByClinic(parsed, resolveClinic());
                }
            }
        } catch (e) {
            console.warn('從本地讀取患者套票快取失敗:', e);
        }
    }
    // 如果有內部快取且不需要強制刷新，直接回傳內部快取內容
    if (!forceRefresh && G.patientPackagesCache && Array.isArray(G.patientPackagesCache[patientId])) {
        return filterPackagesByClinic(G.patientPackagesCache[patientId], resolveClinic());
    }
    try {
        const result = await window.firebaseDataManager.getPatientPackages(patientId);
        const packages = result.success ? result.data : [];
        // 將結果存入快取供下次使用
        if (packages) {
            G.patientPackagesCache[patientId] = packages;
            try {
                const localKey = `patientPackages_${patientId}`;
                localStorage.setItem(localKey, JSON.stringify(packages));
            } catch (e) {
                console.warn('儲存患者套票至本地失敗:', e);
            }
        }
        return filterPackagesByClinic(packages, resolveClinic());
    } catch (error) {
        console.error('獲取患者套票錯誤:', error);
        return [];
    }
}

export function getPackageHistoryOperatorUsername() {
    if (G.currentUserData && G.currentUserData.username) {
        return String(G.currentUserData.username);
    }
    if (G.currentUser) {
        return String(G.currentUser);
    }
    return 'system';
}

export function getPackageHistoryOperatorDisplayName(username) {
    const normalized = String(username || '').trim();
    if (!normalized) return '未知使用者';
    if (Array.isArray(G.users) && G.users.length > 0) {
        const matched = G.users.find(user => user && String(user.username || '').trim() === normalized);
        if (matched) {
            const displayName = matched.name || matched.fullName || matched.displayName;
            if (displayName) return String(displayName);
        }
    }
    return normalized;
}

const patientPackageHistoryViewState = {
    patientId: '',
    clinicId: '',
    currentPage: 1,
    pageSize: 30,
    totalCount: 0,
    totalPages: 1,
    legacyEntries: null,
    usingLegacy: false
};

export function normalizePackageHistoryLogs(pkg) {
    if (!pkg || !Array.isArray(pkg.historyLogs)) return [];
    return pkg.historyLogs.filter(log => log && typeof log === 'object');
}

export function createPackageHistoryLog(type, data = {}) {
    const operatedAt = data.operatedAt || new Date().toISOString();
    const operatedBy = data.operatedBy || getPackageHistoryOperatorUsername();
    const { operatedAt: _ignoredAt, operatedBy: _ignoredBy, ...rest } = data || {};
    return {
        id: `pkglog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: String(type || 'update'),
        operatedAt,
        operatedBy,
        ...rest
    };
}

export function appendPackageHistoryLog(pkg, type, data = {}) {
    const historyLogs = normalizePackageHistoryLogs(pkg);
    return [...historyLogs, createPackageHistoryLog(type, data)];
}

export function withPackageHistoryLog(pkg, type, data = {}) {
    return {
        ...pkg,
        historyLogs: appendPackageHistoryLog(pkg, type, data)
    };
}

export function getPackageHistoryLogsForDisplay(pkg) {
    const logs = normalizePackageHistoryLogs(pkg);
    if (logs.length > 0) {
        return logs;
    }
    const fallbackLogs = [];
    if (pkg && (pkg.purchasedAt || pkg.createdAt)) {
        fallbackLogs.push({
            id: 'legacy_purchase',
            type: 'purchase',
            operatedAt: pkg.purchasedAt || pkg.createdAt,
            operatedBy: pkg.createdBy || '',
            totalUses: pkg.totalUses,
            toRemainingUses: pkg.remainingUses,
            expiresAt: pkg.expiresAt,
            isFallback: true
        });
    }
    if (pkg && pkg.updatedAt) {
        fallbackLogs.push({
            id: 'legacy_update',
            type: 'legacyUpdate',
            operatedAt: pkg.updatedAt,
            operatedBy: pkg.updatedBy || '',
            isFallback: true
        });
    }
    return fallbackLogs;
}

export function formatPackageHistoryTimestamp(raw, locale = 'zh-TW') {
    const date = getPackageHistoryDateObject(raw);
    if (!date || Number.isNaN(date.getTime())) {
        return '未知時間';
    }
    return date.toLocaleString(locale, { hour12: false });
}

export function formatPackageHistoryDateOnly(raw, locale = 'zh-TW') {
    const date = getPackageHistoryDateObject(raw);
    if (!date || Number.isNaN(date.getTime())) {
        return '未知日期';
    }
    return date.toLocaleDateString(locale);
}

export function getPackageHistoryDateObject(raw) {
    let date = null;
    if (raw && typeof raw.toDate === 'function') {
        date = raw.toDate();
    } else if (raw && typeof raw.seconds === 'number') {
        date = new Date(raw.seconds * 1000);
    } else if (raw) {
        date = new Date(raw);
    }
    return date;
}

export function getPackageHistorySummary(log, isEn = false) {
    const fromRemaining = Number(log && log.fromRemainingUses);
    const toRemaining = Number(log && log.toRemainingUses);
    const totalUses = Number(log && log.totalUses);
    const changeCount = Number(log && log.changeCount);
    const oldExpiry = log && log.fromExpiresAt ? formatPackageHistoryDateOnly(log.fromExpiresAt, isEn ? 'en-US' : 'zh-TW') : '';
    const newExpiry = log && log.toExpiresAt ? formatPackageHistoryDateOnly(log.toExpiresAt, isEn ? 'en-US' : 'zh-TW') : '';
    switch (String(log && log.type || '')) {
        case 'purchase':
            return isEn
                ? `Purchased package, ${Number.isFinite(totalUses) ? totalUses : '-'} total uses, expiry ${newExpiry || formatPackageHistoryDateOnly(log && log.expiresAt, 'en-US')}`
                : `購買套票，總次數 ${Number.isFinite(totalUses) ? totalUses : '-'} 次，有效至 ${newExpiry || formatPackageHistoryDateOnly(log && log.expiresAt, 'zh-TW')}`;
        case 'consume':
            return isEn
                ? `Used ${Number.isFinite(changeCount) ? changeCount : 1} time(s), remaining uses ${fromRemaining} -> ${toRemaining}`
                : `使用 ${Number.isFinite(changeCount) ? changeCount : 1} 次，剩餘次數 ${fromRemaining} -> ${toRemaining}`;
        case 'restoreUse':
            return isEn
                ? `Returned ${Number.isFinite(changeCount) ? changeCount : 1} time(s), remaining uses ${fromRemaining} -> ${toRemaining}`
                : `退回 ${Number.isFinite(changeCount) ? changeCount : 1} 次，剩餘次數 ${fromRemaining} -> ${toRemaining}`;
        case 'adjustRemainingUses':
            return isEn
                ? `Adjusted remaining uses ${fromRemaining} -> ${toRemaining}`
                : `修改剩餘次數 ${fromRemaining} -> ${toRemaining}`;
        case 'adjustExpiry':
            return isEn
                ? `Adjusted expiry ${oldExpiry} -> ${newExpiry}`
                : `修改有限期 ${oldExpiry} -> ${newExpiry}`;
        case 'delete':
            return isEn
                ? `Deleted package record, remaining uses ${fromRemaining}/${Number.isFinite(totalUses) ? totalUses : '-'}, expiry ${oldExpiry || 'Unknown date'}`
                : `刪除套票紀錄，刪除前剩餘次數 ${fromRemaining}/${Number.isFinite(totalUses) ? totalUses : '-'}，有效至 ${oldExpiry || '未知日期'}`;
        case 'legacyUpdate':
            return isEn ? 'Legacy record only saved the latest update time' : '舊資料僅保留最後更新時間，未有詳細內容';
        default:
            return isEn ? 'Package record updated' : '套票紀錄已更新';
    }
}

export function getPackageHistoryTypeLabel(log, isEn = false) {
    switch (String(log && log.type || '')) {
        case 'purchase':
            return isEn ? 'Purchase' : '購買';
        case 'consume':
            return isEn ? 'Use' : '使用';
        case 'restoreUse':
            return isEn ? 'Return' : '退回';
        case 'adjustRemainingUses':
            return isEn ? 'Remaining Uses' : '修改剩餘次數';
        case 'adjustExpiry':
            return isEn ? 'Expiry' : '修改有限期';
        case 'delete':
            return isEn ? 'Delete' : '刪除';
        case 'legacyUpdate':
            return isEn ? 'Legacy Update' : '舊資料更新';
        default:
            return isEn ? 'Update' : '更新';
    }
}

export function getPackageHistorySourceLabel(log, isEn = false) {
    switch (String(log && log.source || '')) {
        case 'consultationBillingPurchase':
            return isEn ? 'Consultation Billing Purchase' : '診症收費購買';
        case 'consultationBillingUse':
            return isEn ? 'Consultation Billing Use' : '診症收費使用';
        case 'consultationBillingReturn':
            return isEn ? 'Consultation Billing Return' : '診症收費退回';
        case 'patientManagementPurchase':
            return isEn ? 'Patient Management Add' : '病人資料管理新增';
        case 'patientManagementAdjustment':
            return isEn ? 'Patient Management Update' : '病人資料管理修改';
        case 'patientManagementDelete':
            return isEn ? 'Patient Management Delete' : '病人資料管理刪除';
        case 'legacy':
            return isEn ? 'Legacy Data' : '舊資料';
        default:
            return isEn ? 'Other Source' : '其他來源';
    }
}

export function buildPatientPackageHistoryRecord({ patientId, packageId, packageName, type, ...data }) {
    return {
        ...createPackageHistoryLog(type, data),
        patientId: String(patientId || ''),
        packageId: String(packageId || ''),
        packageName: String(packageName || '')
    };
}

export function buildLegacyPatientPackageHistoryEntries(pkgs) {
    const packages = Array.isArray(pkgs) ? pkgs : [];
    return packages.flatMap(pkg => {
        const packageName = String((pkg && pkg.name) || '');
        return getPackageHistoryLogsForDisplay(pkg).map(log => ({
            ...log,
            source: log && log.source ? String(log.source) : 'legacy',
            packageId: pkg && pkg.id ? String(pkg.id) : '',
            packageName
        }));
    }).sort((a, b) => {
        const timeA = (getPackageHistoryDateObject(a && a.operatedAt) || new Date(0)).getTime() || 0;
        const timeB = (getPackageHistoryDateObject(b && b.operatedAt) || new Date(0)).getTime() || 0;
        return timeB - timeA;
    });
}

export function invalidatePatientPackageHistoryCaches(patientId = '', clinicId = '') {
    const pid = String(patientId || '');
    const cid = String(clinicId || '');
    if (window.firebaseDataManager && typeof window.firebaseDataManager.resetPatientPackageHistoryPagination === 'function') {
        try {
            window.firebaseDataManager.resetPatientPackageHistoryPagination(pid, cid);
        } catch (error) {
            console.warn('重置套票記錄分頁快取失敗:', error);
        }
    }
    if (!pid || patientPackageHistoryViewState.patientId === pid) {
        patientPackageHistoryViewState.patientId = pid;
        patientPackageHistoryViewState.clinicId = cid;
        patientPackageHistoryViewState.currentPage = 1;
        patientPackageHistoryViewState.totalCount = 0;
        patientPackageHistoryViewState.totalPages = 1;
        patientPackageHistoryViewState.legacyEntries = null;
        patientPackageHistoryViewState.usingLegacy = false;
    }
}

/**
 * 解析套票記錄彈窗要顯示的診所：
 * 顯式傳入 → 病人詳情面板目前選擇的診所 → 目前 UI 診所。
 */
export function resolvePackageHistoryClinicId(patientId, clinicId) {
    const explicit = String(clinicId || '');
    if (explicit) return explicit;
    if (G.patientDetailClinicState.patientId === String(patientId || '')
        && G.patientDetailClinicState.clinicId) {
        return G.patientDetailClinicState.clinicId;
    }
    return currentPackageClinicId();
}

/**
 * 取得診所顯示名稱（供彈窗副標題用）；找不到時回傳空字串。
 */
export function getClinicNameById(clinicId) {
    const cid = String(clinicId || '');
    if (!cid) return '';
    let rows = [];
    try {
        if (typeof G.clinicsList !== 'undefined' && Array.isArray(G.clinicsList)) {
            rows = G.clinicsList;
        } else {
            const stored = JSON.parse(localStorage.getItem('clinics') || 'null');
            if (Array.isArray(stored)) rows = stored;
        }
    } catch (_e) {}
    const c = rows.find(x => x && String(x.id) === cid);
    return c ? G.getClinicDisplayName(c) : '';
}

export async function recordPatientPackageHistory(record) {
    if (!record || !record.patientId) return;
    // 未顯式帶診所者，以目前 UI 診所補上（診症購買/使用/退回均在此語境）
    if (!record.clinicId) record.clinicId = currentPackageClinicId();
    try {
        if (window.firebaseDataManager && typeof window.firebaseDataManager.addPatientPackageHistory === 'function') {
            await window.firebaseDataManager.addPatientPackageHistory(record);
        } else {
            await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'patientPackageHistory'),
                {
                    ...record,
                    createdAt: new Date(),
                    createdBy: G.currentUser || 'system'
                }
            );
        }
        invalidatePatientPackageHistoryCaches(record.patientId);
    } catch (error) {
        console.error('寫入套票記錄失敗:', error);
    }
}

export function getPatientPackageHistoryLocaleState() {
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
    return {
        lang,
        isEn: lang && lang.toLowerCase().startsWith('en')
    };
}

export function renderPatientPackageHistoryEntriesHtml(entries, isEn = false) {
    const escape = (value) => window.escapeHtml ? window.escapeHtml(String(value == null ? '' : value)) : String(value == null ? '' : value);
    if (!Array.isArray(entries) || entries.length === 0) {
        return `<div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">${escape(isEn ? 'No package records yet' : '目前沒有套票記錄')}</div>`;
    }
    return entries.map(log => {
        const operatedBy = getPackageHistoryOperatorDisplayName(log && log.operatedBy ? log.operatedBy : '');
        const timeText = formatPackageHistoryTimestamp(log && log.operatedAt, isEn ? 'en-US' : 'zh-TW');
        const typeText = getPackageHistoryTypeLabel(log, isEn);
        const sourceText = getPackageHistorySourceLabel(log, isEn);
        const summaryText = getPackageHistorySummary(log, isEn);
        const packageName = String(log && log.packageName ? log.packageName : (isEn ? 'Package' : '套票'));
        return `
            <div class="rounded-lg border border-gray-200 bg-white p-3 text-left">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">${escape(typeText)}</span>
                        <span class="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">${escape(packageName)}</span>
                        <span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">${escape(sourceText)}</span>
                    </div>
                    <span class="text-xs text-gray-500">${escape(timeText)}</span>
                </div>
                <div class="mt-2 text-sm text-gray-800">${escape(summaryText)}</div>
                <div class="mt-1 text-xs text-gray-500">${escape(isEn ? `Operator: ${operatedBy}` : `操作用戶：${operatedBy}`)}</div>
            </div>
        `;
    }).join('');
}

export function updatePatientPackageHistoryModalPagination() {
    const { isEn } = getPatientPackageHistoryLocaleState();
    const listEl = document.getElementById('patientPackageHistoryList');
    const pageInfoEl = document.getElementById('patientPackageHistoryPageInfo');
    const prevBtn = document.getElementById('patientPackageHistoryPrevBtn');
    const nextBtn = document.getElementById('patientPackageHistoryNextBtn');
    if (!listEl || !pageInfoEl || !prevBtn || !nextBtn) return;
    const currentPage = Math.max(1, Number(patientPackageHistoryViewState.currentPage) || 1);
    const totalCount = Math.max(0, Number(patientPackageHistoryViewState.totalCount) || 0);
    const totalPages = Math.max(1, Number(patientPackageHistoryViewState.totalPages) || 1);
    pageInfoEl.textContent = totalCount > 0
        ? (isEn ? `Page ${currentPage} / ${totalPages} (${totalCount} records)` : `第 ${currentPage} / ${totalPages} 頁（共 ${totalCount} 筆）`)
        : (isEn ? `Page ${currentPage}` : `第 ${currentPage} 頁`);
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = totalCount <= 0 || currentPage >= totalPages;
    prevBtn.classList.toggle('opacity-50', prevBtn.disabled);
    prevBtn.classList.toggle('cursor-not-allowed', prevBtn.disabled);
    nextBtn.classList.toggle('opacity-50', nextBtn.disabled);
    nextBtn.classList.toggle('cursor-not-allowed', nextBtn.disabled);
}

export async function loadPatientPackageHistoryPage(patientId, pageNumber = 1, options = {}) {
    const pid = String(patientId || '');
    if (!pid) return;
    const { isEn } = getPatientPackageHistoryLocaleState();
    const listEl = document.getElementById('patientPackageHistoryList');
    if (!listEl) return;
    // 彈窗固定顯示單一診所；診所維度由 options.clinicId 或既有狀態帶入
    const targetCid = String(options.clinicId || patientPackageHistoryViewState.clinicId || '');
    const shouldReset = !!options.reset
        || patientPackageHistoryViewState.patientId !== pid
        || (targetCid && patientPackageHistoryViewState.clinicId !== targetCid);
    if (shouldReset) {
        invalidatePatientPackageHistoryCaches(pid, targetCid);
        patientPackageHistoryViewState.patientId = pid;
        patientPackageHistoryViewState.clinicId = targetCid;
        patientPackageHistoryViewState.pageSize = 30;
    }
    listEl.innerHTML = `<div class="py-8 text-center text-sm text-gray-500">${isEn ? 'Loading package records...' : '載入套票記錄中...'}</div>`;
    updatePatientPackageHistoryModalPagination();
    try {
        if (shouldReset || patientPackageHistoryViewState.legacyEntries === null) {
            let totalCount = 0;
            if (window.firebaseDataManager && typeof window.firebaseDataManager.getPatientPackageHistoryCount === 'function') {
                const countResult = await window.firebaseDataManager.getPatientPackageHistoryCount(pid, shouldReset, targetCid);
                if (countResult && countResult.success) {
                    totalCount = Math.max(0, Number(countResult.count) || 0);
                }
            }
            patientPackageHistoryViewState.totalCount = totalCount;
            if (totalCount <= 0) {
                // 此診所無審計記錄時，退回該診所套票自帶的舊版記錄
                const packages = await getPatientPackages(pid, false, targetCid);
                const legacyEntries = buildLegacyPatientPackageHistoryEntries(packages);
                patientPackageHistoryViewState.legacyEntries = legacyEntries;
                patientPackageHistoryViewState.usingLegacy = legacyEntries.length > 0;
                if (patientPackageHistoryViewState.usingLegacy) {
                    patientPackageHistoryViewState.totalCount = legacyEntries.length;
                }
            } else {
                patientPackageHistoryViewState.legacyEntries = [];
                patientPackageHistoryViewState.usingLegacy = false;
            }
        }
        let pageEntries = [];
        if (patientPackageHistoryViewState.usingLegacy) {
            const startIndex = (pageNumber - 1) * patientPackageHistoryViewState.pageSize;
            pageEntries = patientPackageHistoryViewState.legacyEntries.slice(startIndex, startIndex + patientPackageHistoryViewState.pageSize);
        } else if (window.firebaseDataManager && typeof window.firebaseDataManager.getPatientPackageHistoryPage === 'function') {
            const pageResult = await window.firebaseDataManager.getPatientPackageHistoryPage(pid, pageNumber, patientPackageHistoryViewState.pageSize, shouldReset && pageNumber === 1, targetCid);
            if (!pageResult || !pageResult.success) {
                throw new Error(pageResult && pageResult.error ? pageResult.error : '讀取套票記錄失敗');
            }
            pageEntries = Array.isArray(pageResult.data) ? pageResult.data : [];
        }
        patientPackageHistoryViewState.currentPage = pageNumber;
        patientPackageHistoryViewState.totalPages = Math.max(
            1,
            Math.ceil((Math.max(0, Number(patientPackageHistoryViewState.totalCount) || 0)) / patientPackageHistoryViewState.pageSize)
        );
        listEl.innerHTML = renderPatientPackageHistoryEntriesHtml(pageEntries, isEn);
        updatePatientPackageHistoryModalPagination();
    } catch (error) {
        console.error('載入套票記錄頁失敗:', error);
        listEl.innerHTML = `<div class="rounded-lg border border-dashed border-red-300 bg-red-50 px-4 py-6 text-sm text-red-600">${isEn ? 'Failed to load package records' : '載入套票記錄失敗'}</div>`;
        updatePatientPackageHistoryModalPagination();
    }
}

export async function purchasePackage(patientId, item) {
    const totalUses = Number(item.packageUses || item.totalUses || 0);
    const validityDays = Number(item.validityDays || 0);
    const historySource = item && item.historySource ? String(item.historySource) : 'patientManagementPurchase';
    // 套票歸購買當下的診所；item 可顯式帶入（病人詳情面板瀏覽其他診所時）
    const clinicId = String((item && item.clinicId) || currentPackageClinicId() || '');
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + validityDays);

    const record = {
        patientId: patientId,
        clinicId: clinicId,
        packageItemId: item.id,
        name: item.name,
        totalUses: totalUses,
        remainingUses: totalUses,
        purchasedAt: purchasedAt.toISOString(),
        expiresAt: expiresAt.toISOString()
    };
    
    try {
        const result = await window.firebaseDataManager.addPatientPackage(record);
        if (result.success) {
            // 建立新套票記錄並更新本地快取
            const newPkg = { ...record, id: result.id };
            if (Array.isArray(G.patientPackagesCache[patientId])) {
                // 若快取存在，附加新套票
                G.patientPackagesCache[patientId] = [...patientPackagesCache[patientId], newPkg];
            } else {
                // 建立新的快取陣列
                G.patientPackagesCache[patientId] = [newPkg];
            }
            // 同步到 localStorage
            try {
                const localKey = `patientPackages_${patientId}`;
                const cached = G.patientPackagesCache[patientId];
                localStorage.setItem(localKey, JSON.stringify(cached));
            } catch (e) {
                console.warn('儲存患者套票至本地失敗:', e);
            }
            await recordPatientPackageHistory(buildPatientPackageHistoryRecord({
                patientId,
                packageId: result.id,
                packageName: item.name,
                source: historySource,
                type: 'purchase',
                operatedAt: purchasedAt.toISOString(),
                totalUses,
                toRemainingUses: totalUses,
                expiresAt: expiresAt.toISOString(),
                toExpiresAt: expiresAt.toISOString(),
                clinicId: clinicId
            }));
            return newPkg;
        }
        return null;
    } catch (error) {
        console.error('購買套票錯誤:', error);
        return null;
    }
}

export async function consumePackage(patientId, packageRecordId, options = {}) {
    try {
        const historySource = options && options.historySource ? String(options.historySource) : 'other';
        // 始終從資料庫重新取得套票，避免跨裝置快取不一致
        const packages = await getPatientPackages(patientId, true);
        // 比對 ID 時統一轉為字串，避免類型不一致導致找不到套票
        const pkg = packages.find(p => String(p.id) === String(packageRecordId));
        
        if (!pkg) return { ok: false, msg: '找不到套票' };
        
        const now = new Date();
        const exp = new Date(pkg.expiresAt);
        if (now > exp) return { ok: false, msg: '套票已過期' };
        if (pkg.remainingUses <= 0) return { ok: false, msg: '套票已用完' };
        
        const updatedPackage = {
            ...pkg,
            remainingUses: pkg.remainingUses - 1
        };
        
        const result = await window.firebaseDataManager.updatePatientPackage(packageRecordId, updatedPackage);

        if (result.success) {
            await recordPatientPackageHistory(buildPatientPackageHistoryRecord({
                patientId,
                packageId: packageRecordId,
                packageName: pkg.name,
                source: historySource,
                type: 'consume',
                fromRemainingUses: Number(pkg.remainingUses) || 0,
                toRemainingUses: (Number(pkg.remainingUses) || 0) - 1,
                changeCount: 1
            }));
            // 更新本地快取中的對應套票剩餘次數
            if (Array.isArray(G.patientPackagesCache[patientId])) {
                G.patientPackagesCache[patientId] = G.patientPackagesCache[patientId].map(p => {
                    if (String(p.id) === String(packageRecordId)) {
                        return { ...p, ...updatedPackage };
                    }
                    return p;
                });
                // 更新 localStorage 中的套票資料
                try {
                    const localKey = `patientPackages_${patientId}`;
                    localStorage.setItem(localKey, JSON.stringify(G.patientPackagesCache[patientId]));
                } catch (e) {
                    console.warn('更新本地患者套票資料失敗:', e);
                }
            }
            return { ok: true, record: updatedPackage };
        } else {
            return { ok: false, msg: '更新套票失敗' };
        }
    } catch (error) {
        console.error('使用套票錯誤:', error);
        return { ok: false, msg: '系統錯誤' };
    }
}

/**
 * 在本地消耗套票使用次數，不立即同步到資料庫。
 * 將根據暫存變更計算可用的剩餘次數，並於保存病歷時一次性提交。
 *
 * @param {string} patientId 患者 ID
 * @param {string} packageRecordId 套票記錄 ID
 * @returns {Promise<{ok: boolean, msg?: string, record?: any}>}
 */
export async function consumePackageLocally(patientId, packageRecordId) {
    try {
        // 始終重新載入套票，避免跨裝置快取不一致
        const packages = await getPatientPackages(patientId, true);
        // 比對 ID 時統一轉為字串，避免類型不一致導致找不到套票
        const pkg = packages.find(p => String(p.id) === String(packageRecordId));
        if (!pkg) {
            return { ok: false, msg: '找不到套票' };
        }
        const now = new Date();
        const exp = new Date(pkg.expiresAt);
        if (now > exp) {
            return { ok: false, msg: '套票已過期' };
        }
        // 根據暫存變更計算可用的剩餘次數
        const delta = G.pendingPackageChanges
            .filter(change => {
                if (!change || typeof change.delta !== 'number') return false;
                return String(change.patientId) === String(patientId) && String(change.packageRecordId) === String(packageRecordId);
            })
            .reduce((sum, change) => sum + change.delta, 0);
        const availableUses = (pkg.remainingUses || 0) + delta;
        if (availableUses <= 0) {
            return { ok: false, msg: '套票已用完' };
        }
        // 回傳剩餘次數已減 1 的模擬記錄，用於更新 UI
        const updatedPackage = { ...pkg, remainingUses: availableUses - 1 };
        return { ok: true, record: updatedPackage };
    } catch (error) {
        console.error('本地使用套票錯誤:', error);
        return { ok: false, msg: '系統錯誤' };
    }
}

export function formatPackageStatus(pkg) {
    const exp = new Date(pkg.expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    const expired = daysLeft < 0;
    // 根據當前語言輸出不同的文字。en 表示英文，其餘以中文為預設。
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
    if (lang && lang.toLowerCase().startsWith('en')) {
        // Build English string
        return expired
            ? `Expired (${exp.toLocaleDateString('en-US')})`
            : `Remaining ${pkg.remainingUses}/${pkg.totalUses} uses · ${exp.toLocaleDateString('en-US')} expires (about ${daysLeft} days)`;
    }
    // Default: Chinese
    return expired
        ? `已到期（${exp.toLocaleDateString('zh-TW')}）`
        : `剩餘 ${pkg.remainingUses}/${pkg.totalUses} 次 · ${exp.toLocaleDateString('zh-TW')} 到期（約 ${daysLeft} 天）`;
}

export async function createManualPatientPackage(patientId, clinicId = null) {
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
    const isEn = lang && lang.toLowerCase().startsWith('en');
    // 歸屬診所：預設目前診所，或由套票區的診所選單顯式帶入
    const targetClinicId = clinicId ? String(clinicId) : currentPackageClinicId();
    const loadingButton = G.getLoadingButtonFromEvent(`button[onclick="createManualPatientPackage('${patientId}', '${targetClinicId}')"]`);
    if (loadingButton) {
        G.setButtonLoading(loadingButton, isEn ? 'Loading...' : '讀取中...');
    }
    // 取得套票目錄：預設診所用既有 billingItems；瀏覽其他診所時
    // 直接讀 globalBillingItems + 該診所 subcollection（唯此情況才額外讀取）
    let catalogItems = [];
    try {
        if (!targetClinicId || targetClinicId === currentPackageClinicId()) {
            if (!Array.isArray(G.billingItems) || G.billingItems.length === 0) {
                await initBillingItems();
            }
            catalogItems = Array.isArray(G.billingItems) ? G.billingItems : [];
        } else {
            const [globalSnap, clinicSnap] = await Promise.all([
                window.firebase.getDocs(window.firebase.collection(window.firebase.db, 'globalBillingItems')),
                window.firebase.getDocs(window.firebase.collection(
                    window.firebase.db, 'clinics', targetClinicId, 'billingItems'
                ))
            ]);
            const rows = [];
            globalSnap.forEach(d => rows.push({ id: d.id, ...d.data(), shared: true }));
            clinicSnap.forEach(d => rows.push({ id: d.id, ...d.data() }));
            catalogItems = rows;
        }
    } catch (_e) {}
    try {
        const packageItems = catalogItems
            .filter(item => item && item.active !== false && item.category === 'package' && Number(item.packageUses) > 0 && Number(item.validityDays) > 0);
        if (packageItems.length === 0) {
            G.showToast(isEn ? 'No package items in billing settings' : '收費項目中沒有可用的套票項目', 'warning');
            return;
        }
        const options = {};
        packageItems.forEach(item => {
            const label = `${item.name || ''} (${Number(item.packageUses) || 0}次 / ${Number(item.validityDays) || 0}天)`;
            options[String(item.id)] = window.escapeHtml(label);
        });
        const pickResult = await Swal.fire({
            title: isEn ? 'Select package item' : '選擇套票項目',
            input: 'select',
            inputOptions: options,
            inputPlaceholder: isEn ? 'Please select' : '請選擇',
            showCancelButton: true,
            confirmButtonText: isEn ? 'Confirm' : '確定',
            cancelButtonText: isEn ? 'Cancel' : '取消'
        });
        if (!pickResult || !pickResult.isConfirmed) {
            return;
        }
        const selectedId = String(pickResult.value || '');
        const selectedItem = packageItems.find(item => String(item.id) === selectedId);
        if (!selectedItem) {
            G.showToast(isEn ? 'Invalid package item' : '套票項目無效', 'warning');
            return;
        }
        const created = await purchasePackage(patientId, {
            id: selectedItem.id,
            name: selectedItem.name,
            packageUses: Number(selectedItem.packageUses) || 0,
            validityDays: Number(selectedItem.validityDays) || 0,
            historySource: 'patientManagementPurchase',
            clinicId: targetClinicId
        });
        if (!created) {
            G.showToast(isEn ? 'Failed to create package' : '新增套票失敗', 'error');
            return;
        }
        G.showToast(isEn ? 'Package created' : '已新增套票', 'success');
        await G.loadPatientConsultationSummary(patientId);
        await refreshPatientPackagesUI();
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

export async function updatePatientPackageExpiry(patientId, packageRecordId, clinicId = null) {
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
    const isEn = lang && lang.toLowerCase().startsWith('en');
    const targetClinicId = clinicId ? String(clinicId) : currentPackageClinicId();
    const loadingButton = G.getLoadingButtonFromEvent(`button[onclick="updatePatientPackageExpiry('${patientId}', '${packageRecordId}', '${targetClinicId}')"]`);
    if (loadingButton) {
        G.setButtonLoading(loadingButton, isEn ? 'Loading...' : '讀取中...');
    }
    try {
        const packages = await getPatientPackages(patientId, true, targetClinicId);
        const pkg = Array.isArray(packages) ? packages.find(p => String(p.id) === String(packageRecordId)) : null;
        if (!pkg) {
            G.showToast(isEn ? 'Package not found' : '找不到套票', 'warning');
            return;
        }
        const exp = new Date(pkg.expiresAt);
        const defaultDate = Number.isNaN(exp.getTime()) ? '' : exp.toISOString().slice(0, 10);
        const dateResult = await Swal.fire({
            title: isEn ? 'Update expiry date' : '修改套票有效期',
            input: 'date',
            inputValue: defaultDate,
            showCancelButton: true,
            confirmButtonText: isEn ? 'Update' : '更新',
            cancelButtonText: isEn ? 'Cancel' : '取消'
        });
        if (!dateResult || !dateResult.isConfirmed) return;
        const dateText = String(dateResult.value || '').trim();
        const newExp = new Date(`${dateText}T23:59:59`);
        if (Number.isNaN(newExp.getTime())) {
            G.showToast(isEn ? 'Invalid date' : '日期無效', 'warning');
            return;
        }
        const updatedPackage = {
            ...pkg,
            expiresAt: newExp.toISOString()
        };
        const result = await window.firebaseDataManager.updatePatientPackage(packageRecordId, updatedPackage);
        if (!result || !result.success) {
            G.showToast(isEn ? 'Failed to update expiry date' : '更新套票有效期失敗', 'error');
            return;
        }
        await recordPatientPackageHistory(buildPatientPackageHistoryRecord({
            patientId,
            packageId: packageRecordId,
            packageName: pkg.name,
            source: 'patientManagementAdjustment',
            type: 'adjustExpiry',
            fromExpiresAt: pkg.expiresAt,
            toExpiresAt: newExp.toISOString(),
            clinicId: targetClinicId
        }));
        G.showToast(isEn ? 'Expiry date updated' : '已更新套票有效期', 'success');
        await G.loadPatientConsultationSummary(patientId);
        await refreshPatientPackagesUI();
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

export async function deletePatientPackageRecord(patientId, packageRecordId, clinicId = null) {
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
    const isEn = lang && lang.toLowerCase().startsWith('en');
    const targetClinicId = clinicId ? String(clinicId) : currentPackageClinicId();
    const loadingButton = G.getLoadingButtonFromEvent(`button[onclick="deletePatientPackageRecord('${patientId}', '${packageRecordId}', '${targetClinicId}')"]`);
    if (loadingButton) {
        G.setButtonLoading(loadingButton, isEn ? 'Deleting...' : '刪除中...');
    }
    try {
        const packages = await getPatientPackages(patientId, true, targetClinicId);
        const pkg = Array.isArray(packages) ? packages.find(p => String(p.id) === String(packageRecordId)) : null;
        if (!pkg) {
            G.showToast(isEn ? 'Package not found' : '找不到套票', 'warning');
            return;
        }
        const ok = await G.showConfirmation(
            isEn
                ? `Delete package "${pkg.name || ''}"?\nThis action cannot be undone.`
                : `確定要刪除套票「${pkg.name || ''}」嗎？\n此操作無法復原。`,
            'warning'
        );
        if (!ok) return;
        const result = await window.firebaseDataManager.deletePatientPackage(packageRecordId, patientId);
        if (!result || !result.success) {
            G.showToast(isEn ? 'Failed to delete package' : '刪除套票失敗', 'error');
            return;
        }
        await recordPatientPackageHistory(buildPatientPackageHistoryRecord({
            patientId,
            packageId: packageRecordId,
            packageName: pkg.name,
            source: 'patientManagementDelete',
            type: 'delete',
            totalUses: Number(pkg.totalUses) || 0,
            fromRemainingUses: Number(pkg.remainingUses) || 0,
            toRemainingUses: 0,
            fromExpiresAt: pkg.expiresAt,
            clinicId: targetClinicId
        }));
        G.showToast(isEn ? 'Package deleted' : '已刪除套票', 'success');
        await G.loadPatientConsultationSummary(patientId);
        await refreshPatientPackagesUI();
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

export async function updatePatientPackageRemainingUses(patientId, packageRecordId, clinicId = null) {
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
    const isEn = lang && lang.toLowerCase().startsWith('en');
    const targetClinicId = clinicId ? String(clinicId) : currentPackageClinicId();
    const loadingButton = G.getLoadingButtonFromEvent(`button[onclick="updatePatientPackageRemainingUses('${patientId}', '${packageRecordId}', '${targetClinicId}')"]`);
    if (loadingButton) {
        G.setButtonLoading(loadingButton, isEn ? 'Loading...' : '讀取中...');
    }
    try {
        const packages = await getPatientPackages(patientId, true, targetClinicId);
        const pkg = Array.isArray(packages) ? packages.find(p => String(p.id) === String(packageRecordId)) : null;
        if (!pkg) {
            G.showToast(isEn ? 'Package not found' : '找不到套票', 'warning');
            return;
        }
        const totalUses = Number(pkg.totalUses);
        const currentRemaining = Number(pkg.remainingUses);
        const inputResult = await Swal.fire({
            title: isEn ? 'Update remaining uses' : '修改剩餘次數',
            input: 'number',
            inputValue: Number.isFinite(currentRemaining) ? String(currentRemaining) : '0',
            inputAttributes: {
                min: '0',
                step: '1'
            },
            showCancelButton: true,
            confirmButtonText: isEn ? 'Update' : '更新',
            cancelButtonText: isEn ? 'Cancel' : '取消'
        });
        if (!inputResult || !inputResult.isConfirmed) return;
        const nextRemaining = parseInt(String(inputResult.value || '').trim(), 10);
        if (!Number.isInteger(nextRemaining) || nextRemaining < 0) {
            G.showToast(isEn ? 'Remaining uses must be a non-negative integer' : '剩餘次數必須為 0 或以上的整數', 'warning');
            return;
        }
        if (Number.isFinite(totalUses) && nextRemaining > totalUses) {
            G.showToast(
                isEn ? `Remaining uses cannot exceed total uses (${totalUses})` : `剩餘次數不可大於總次數（${totalUses}）`,
                'warning'
            );
            return;
        }
        const updatedPackage = {
            ...pkg,
            remainingUses: nextRemaining
        };
        const result = await window.firebaseDataManager.updatePatientPackage(packageRecordId, updatedPackage);
        if (!result || !result.success) {
            G.showToast(isEn ? 'Failed to update remaining uses' : '更新剩餘次數失敗', 'error');
            return;
        }
        await recordPatientPackageHistory(buildPatientPackageHistoryRecord({
            patientId,
            packageId: packageRecordId,
            packageName: pkg.name,
            source: 'patientManagementAdjustment',
            type: 'adjustRemainingUses',
            fromRemainingUses: currentRemaining,
            toRemainingUses: nextRemaining,
            clinicId: targetClinicId
        }));
        G.showToast(isEn ? 'Remaining uses updated' : '已更新剩餘次數', 'success');
        await G.loadPatientConsultationSummary(patientId);
        await refreshPatientPackagesUI();
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

export async function renderPatientPackages(patientId) {
    const container = document.getElementById('patientPackagesList');
    if (!container) return;
    
    try {
        // 始終重新載入套票資料，避免跨裝置快取不一致
        const pkgs = await getPatientPackages(patientId, true);
        // 應用暫存變更，調整每個套票的剩餘次數
        const modifiedPkgs = pkgs.map(pkg => {
            const delta = G.pendingPackageChanges
                .filter(change => {
                    if (!change || typeof change.delta !== 'number') return false;
                    return String(change.patientId) === String(patientId) && String(change.packageRecordId) === String(pkg.id);
                })
                .reduce((sum, change) => sum + change.delta, 0);
            let newRemaining = (pkg.remainingUses || 0) + delta;
            // 約束 remainingUses 不小於 0，也不超過 totalUses（若 totalUses 定義）
            if (typeof pkg.totalUses === 'number') {
                newRemaining = Math.max(0, Math.min(pkg.totalUses, newRemaining));
            } else {
                newRemaining = Math.max(0, newRemaining);
            }
            return { ...pkg, remainingUses: newRemaining };
        });
        const activePkgs = modifiedPkgs.filter(p => p.remainingUses > 0).sort((a,b) => new Date(a.expiresAt) - new Date(b.expiresAt));
        if (activePkgs.length === 0) {
            container.innerHTML = '<div class="text-gray-500">無已購買的套票</div>';
            return;
        }
        container.innerHTML = activePkgs.map(pkg => {
            const exp = new Date(pkg.expiresAt);
            const now = new Date();
            const expired = now > exp;
            const disabled = expired || pkg.remainingUses <= 0;
            const badge =
              expired ? '<span class="ml-2 text-xs text-white px-2 py-0.5 rounded bg-red-500">已到期</span>' :
              (pkg.remainingUses <= 0 ? '<span class="ml-2 text-xs text-white px-2 py-0.5 rounded bg-gray-500">已用完</span>' : '');
            return `
      <div class="flex items-center justify-between bg-white border border-purple-200 rounded p-2">
        <div>
          <div class="font-medium text-purple-900">${pkg.name}${badge}</div>
          <div class="text-xs text-gray-600">${formatPackageStatus(pkg)}</div>
        </div>
        <button type="button" ${disabled ? 'disabled' : ''} 
          onclick="useOnePackage('${pkg.patientId}', '${pkg.id}')"
          class="px-3 py-1 rounded ${disabled ? 'bg-gray-300 text-gray-600' : 'bg-purple-600 text-white hover:bg-purple-700'}">
          使用一次
        </button>
      </div>
    `;
        }).join('');
    } catch (error) {
        console.error('渲染患者套票錯誤:', error);
        container.innerHTML = '<div class="text-red-500">載入套票資料失敗</div>';
    }
}

export async function showPatientPackageHistory(patientId, clinicId = '') {
    const { isEn } = getPatientPackageHistoryLocaleState();
    // 彈窗只顯示該診所的套票記錄
    const targetCid = resolvePackageHistoryClinicId(patientId, clinicId);
    const clinicName = getClinicNameById(targetCid);
    const loadingButton = G.getLoadingButtonFromEvent(`button[onclick^="showPatientPackageHistory('${patientId}'"]`);
    let loadingReleased = false;
    const releaseLoadingButton = () => {
        if (!loadingReleased && loadingButton) {
            G.clearButtonLoading(loadingButton);
            loadingReleased = true;
        }
    };
    if (loadingButton) {
        G.setButtonLoading(loadingButton, isEn ? 'Loading...' : '讀取中...');
    }
    const subtitleHtml = clinicName
        ? `${isEn ? 'Package Records' : '套票記錄'} · ${window.escapeHtml(clinicName)}`
        : (isEn ? 'Package Records' : '套票記錄');
    await Swal.fire({
        titleText: String(isEn ? 'Package Records' : '套票記錄'),
        html: `
            <div class="text-left">
                <div class="mb-3 text-sm text-gray-600">${subtitleHtml}</div>
                <div id="patientPackageHistoryList" class="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                    <div class="py-8 text-center text-sm text-gray-500">${isEn ? 'Loading package records...' : '載入套票記錄中...'}</div>
                </div>
                <div class="mt-4 flex items-center justify-between gap-2">
                    <button id="patientPackageHistoryPrevBtn" type="button" class="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                        ${isEn ? 'Previous' : '上一頁'}
                    </button>
                    <div id="patientPackageHistoryPageInfo" class="text-sm text-gray-600">${isEn ? 'Loading...' : '載入中...'}</div>
                    <button id="patientPackageHistoryNextBtn" type="button" class="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                        ${isEn ? 'Next' : '下一頁'}
                    </button>
                </div>
            </div>
        `,
        width: 760,
        confirmButtonText: isEn ? 'Close' : '關閉',
        didOpen: () => {
            const prevBtn = document.getElementById('patientPackageHistoryPrevBtn');
            const nextBtn = document.getElementById('patientPackageHistoryNextBtn');
            if (prevBtn) {
                prevBtn.addEventListener('click', function() {
                    if (patientPackageHistoryViewState.currentPage > 1) {
                        loadPatientPackageHistoryPage(patientId, patientPackageHistoryViewState.currentPage - 1, { clinicId: targetCid });
                    }
                });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', function() {
                    if (patientPackageHistoryViewState.currentPage < patientPackageHistoryViewState.totalPages) {
                        loadPatientPackageHistoryPage(patientId, patientPackageHistoryViewState.currentPage + 1, { clinicId: targetCid });
                    }
                });
            }
            loadPatientPackageHistoryPage(patientId, 1, { reset: true, clinicId: targetCid }).finally(releaseLoadingButton);
        }
    });
    releaseLoadingButton();
}

/**
 * 以分頁方式渲染病人詳細資料中的套票情況。
 *
 * 此函式在查看病人詳細資料時使用，僅顯示「指定診所」的套票，
 * 支援分頁瀏覽。首次呼叫（非分頁跳轉）時會重置頁碼至第一頁。
 * 分頁控制將使用全域 paginationSettings.patientPackageStatus 設定。
 *
 * @param {string} patientId 病人 ID
 * @param {boolean} pageChange 是否由分頁控制觸發
 * @param {string|null} clinicId 診所 ID；null＝目前診所
 */
export async function renderPackageStatusSection(patientId, pageChange = false, clinicId = null) {
    const contentEl = document.getElementById('packageStatusContent');
    if (!contentEl) return;
    const targetClinicId = clinicId ? String(clinicId) : currentPackageClinicId();
    try {
        // 若非分頁跳轉，則重置頁碼為第一頁
        if (!pageChange) {
            G.paginationSettings.patientPackageStatus.currentPage = 1;
        }
        // 查看詳細資料時優先使用快取，避免每次開啟視窗都重新抓取套票。
        const pkgs = await getPatientPackages(patientId, false, targetClinicId);
        // 若無套票資料，顯示提示文字並隱藏分頁控制
        if (!Array.isArray(pkgs) || pkgs.length === 0) {
            contentEl.innerHTML = `
                <div class="bg-blue-50 border-blue-200 border rounded-lg p-3 text-center">
                    <div class="text-blue-400 mb-1">
                        <svg class="w-6 h-6 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="text-sm font-medium text-blue-700">尚未購買套票</div>
                    <div class="text-xs text-blue-600 mt-1">可於診療時購買套票享優惠</div>
                </div>
            `;
            // 移除分頁容器
            const paginEl = G.ensurePaginationContainer('packageStatusContent', 'patientPackageStatusPagination');
            if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
            }
            return;
        }
        // 將套票依有效與失效分類
        const now = new Date();
        const soonThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const validPkgs = [];
        const invalidPkgs = [];
        pkgs.forEach(pkg => {
            const expDate = new Date(pkg.expiresAt);
            const expired = expDate < now || (typeof pkg.remainingUses === 'number' && pkg.remainingUses <= 0);
            if (expired) {
                invalidPkgs.push(pkg);
            } else {
                validPkgs.push(pkg);
            }
        });
        const packageCountBadge = document.getElementById('patientPackageActiveCountBadge');
        if (packageCountBadge) {
            packageCountBadge.textContent = String(validPkgs.length);
        }
        // 按到期日排序
        validPkgs.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
        invalidPkgs.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
        // 組合為單一陣列，標示是否有效
        const combined = [
            ...validPkgs.map(pkg => ({ pkg, valid: true })),
            ...invalidPkgs.map(pkg => ({ pkg, valid: false }))
        ];
        const totalItems = combined.length;
        const itemsPerPage = G.paginationSettings.patientPackageStatus.itemsPerPage;
        // 計算當前頁碼
        let currentPage = G.paginationSettings.patientPackageStatus.currentPage || 1;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (currentPage < 1) currentPage = 1;
        if (currentPage > totalPages) currentPage = totalPages;
        G.paginationSettings.patientPackageStatus.currentPage = currentPage;
        const startIdx = (currentPage - 1) * itemsPerPage;
        const endIdx = startIdx + itemsPerPage;
        const pageItems = combined.slice(startIdx, endIdx);
        // 依有效性將本頁項目分類
        const pageValid = pageItems.filter(item => item.valid).map(item => item.pkg);
        const pageInvalid = pageItems.filter(item => !item.valid).map(item => item.pkg);
        // 產生 HTML
        // 重新排列套票：將失效套票接續在有效套票之後，避免右側空白
        let htmlParts = [];
        // 使用一個垂直容器，依序渲染有效與失效套票
        htmlParts.push('<div class="space-y-4">');
        // 有效套票列表
        if (pageValid.length > 0) {
            htmlParts.push('<div class="font-medium text-gray-700 mb-2">有效套票</div>');
            htmlParts.push('<div class="space-y-2">');
            pageValid.forEach(pkg => {
                const safePkgName = window.escapeHtml(pkg.name || '');
                const statusText = formatPackageStatus(pkg);
                const safeStatusText = window.escapeHtml(statusText || '');
                const remainingUses = typeof pkg.remainingUses === 'number' ? pkg.remainingUses : '';
                const totalUses = typeof pkg.totalUses === 'number' ? pkg.totalUses : '';
                const expDate = new Date(pkg.expiresAt);
                const lowUses = typeof pkg.remainingUses === 'number' && pkg.remainingUses <= 2;
                // 判斷是否即將到期或剩餘次數少於等於 2
                const highlight = (expDate <= soonThreshold) || lowUses;
                const containerClasses = highlight ? 'bg-red-50 border border-red-200' : 'bg-purple-50 border border-purple-200';
                const nameClass = highlight ? 'text-red-700' : 'text-purple-900';
                const statusClass = highlight ? 'text-red-600' : 'text-gray-600';
                const usesClass = highlight ? 'text-red-700' : 'text-gray-800';
                htmlParts.push(`
                    <div class="flex items-center justify-between ${containerClasses} rounded p-2">
                        <div>
                            <div class="font-medium ${nameClass}">${safePkgName}</div>
                            <div class="text-xs ${statusClass}">${safeStatusText}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm ${usesClass} mb-1">${remainingUses}${totalUses !== '' ? '/' + totalUses : ''}</div>
                            <div class="flex flex-wrap items-center justify-end gap-1">
                                <button
                                    type="button"
                                    onclick="updatePatientPackageRemainingUses('${patientId}', '${pkg.id}', '${targetClinicId}')"
                                    class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                                >
                                    修改剩餘次數
                                </button>
                                <button
                                    type="button"
                                    onclick="updatePatientPackageExpiry('${patientId}', '${pkg.id}', '${targetClinicId}')"
                                    class="px-2 py-1 text-xs rounded bg-amber-500 text-white hover:bg-amber-600"
                                >
                                    修改有限期
                                </button>
                                <button
                                    type="button"
                                    onclick="deletePatientPackageRecord('${patientId}', '${pkg.id}', '${targetClinicId}')"
                                    class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                                >
                                    刪除
                                </button>
                            </div>
                        </div>
                    </div>
                `);
            });
            htmlParts.push('</div>');
        }
        // 失效套票列表
        if (pageInvalid.length > 0) {
            htmlParts.push('<div class="font-medium text-gray-700 mb-2' + (pageValid.length > 0 ? ' mt-4' : '') + '">失效套票</div>');
            htmlParts.push('<div class="space-y-2">');
            pageInvalid.forEach(pkg => {
                const safePkgName = window.escapeHtml(pkg.name || '');
                const statusText = formatPackageStatus(pkg);
                const safeStatusText = window.escapeHtml(statusText || '');
                const remainingUses = typeof pkg.remainingUses === 'number' ? pkg.remainingUses : '';
                const totalUses = typeof pkg.totalUses === 'number' ? pkg.totalUses : '';
                htmlParts.push(`
                    <div class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded p-2">
                        <div>
                            <div class="font-medium text-gray-500">${safePkgName}</div>
                            <div class="text-xs text-gray-400">${safeStatusText}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-gray-500 mb-1">${remainingUses}${totalUses !== '' ? '/' + totalUses : ''}</div>
                            <div class="flex flex-wrap items-center justify-end gap-1">
                                <button
                                    type="button"
                                    onclick="updatePatientPackageRemainingUses('${patientId}', '${pkg.id}', '${targetClinicId}')"
                                    class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                                >
                                    修改剩餘次數
                                </button>
                                <button
                                    type="button"
                                    onclick="updatePatientPackageExpiry('${patientId}', '${pkg.id}', '${targetClinicId}')"
                                    class="px-2 py-1 text-xs rounded bg-amber-500 text-white hover:bg-amber-600"
                                >
                                    修改有限期
                                </button>
                                <button
                                    type="button"
                                    onclick="deletePatientPackageRecord('${patientId}', '${pkg.id}', '${targetClinicId}')"
                                    class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                                >
                                    刪除
                                </button>
                            </div>
                        </div>
                    </div>
                `);
            });
            htmlParts.push('</div>');
        }
        htmlParts.push('</div>');
        contentEl.innerHTML = htmlParts.join('');
        // 渲染分頁控制
        const paginEl = G.ensurePaginationContainer('packageStatusContent', 'patientPackageStatusPagination');
        G.renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
            G.paginationSettings.patientPackageStatus.currentPage = newPage;
            renderPackageStatusSection(patientId, true, targetClinicId);
        }, paginEl);
    } catch (error) {
        console.error('載入病人套票資料失敗:', error);
        contentEl.innerHTML = '<div class="text-sm text-red-600">載入套票資料失敗</div>';
        // 移除分頁容器
        const paginEl = G.ensurePaginationContainer('packageStatusContent', 'patientPackageStatusPagination');
        if (paginEl) {
            paginEl.innerHTML = '';
            paginEl.classList.add('hidden');
        }
    }
}

/**
 * 渲染病人詳細資料中的「會員儲值餘額」區塊。
 *
 * 與 renderPackageStatusSection 對應：經 SDK 讀取病人於「指定診所」
 * 的儲值帳戶（patientWalletAccounts/{clinicId}__{patientId}），
 * 優先使用 session 快取（錢包操作後快取會主動失效）。
 * 帳戶不存在時顯示「未開戶」；讀取失敗（例如尚未選取診所）則靜默降級，
 * 不影響同頁套票區塊的運作。
 *
 * @param {string} patientId 病人 ID
 * @param {string} [clinicId] 診所 ID，預設為目前診所
 */
export async function renderPatientWalletStatus(patientId, clinicId = '') {
    const contentEl = document.getElementById('patientWalletBalanceContent');
    if (!contentEl) return;
    const badgeEl = document.getElementById('patientWalletStatusBadge');
    const setBadge = (text, extraClass) => {
        if (!badgeEl) return;
        badgeEl.textContent = text;
        badgeEl.className = 'text-xs px-2 py-1 rounded-full '
            + (extraClass || 'text-teal-700 bg-white');
    };
    // 與錢包管理頁一致的帳戶狀態標籤
    const statusLabels = { active: '運作中', frozen: '已凍結', closed: '已關閉' };

    let account = null;
    try {
        if (typeof window.getWalletAccount !== 'function') {
            setBadge('—', 'text-gray-500 bg-white');
            contentEl.innerHTML = '<div class="text-sm text-gray-500 text-center py-2">—</div>';
            return;
        }
        account = await window.getWalletAccount(patientId, false, clinicId || '');
    } catch (error) {
        console.warn('載入病人儲值帳戶失敗:', error);
        setBadge('—', 'text-gray-500 bg-white');
        contentEl.innerHTML = '<div class="text-sm text-gray-500 text-center py-2">無法載入儲值餘額</div>';
        return;
    }

    // 尚未開立儲值帳戶（一般會員從未充值）
    if (!account) {
        setBadge('未開戶', 'text-gray-500 bg-white');
        contentEl.innerHTML = `
            <div class="bg-white/60 border border-teal-100 rounded-lg p-3 text-center">
                <div class="text-sm font-medium text-teal-700">尚未開立儲值帳戶</div>
                <div class="text-xs text-gray-500 mt-1">可於會員儲值管理中為病人充值開戶</div>
            </div>
        `;
        return;
    }

    const round2 = typeof window.walletRound2 === 'function'
        ? window.walletRound2
        : (v) => Math.round((Number(v) || 0) * 100) / 100;
    const principal = round2(account.balance);
    const bonus = round2(account.bonusBalance);
    const total = round2(principal + bonus);
    const status = String(account.status || 'active');
    setBadge(
        statusLabels[status] || status,
        status === 'active'
            ? 'text-teal-700 bg-white'
            : (status === 'frozen'
                ? 'text-orange-700 bg-orange-100'
                : 'text-gray-600 bg-gray-200')
    );
    const totalClass = status === 'active' ? 'text-teal-700' : 'text-gray-500';

    // 近期交易（最近 10 筆）；失敗時只顯示餘額，不影響主資訊
    let recentTxs = [];
    let recentTxsFailed = false;
    try {
        if (typeof window.getRecentWalletTransactions === 'function') {
            recentTxs = await window.getRecentWalletTransactions(patientId, clinicId, 5);
        }
    } catch (txError) {
        console.warn('載入近期儲值交易失敗:', txError);
        recentTxsFailed = true;
    }

    contentEl.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="bg-white/70 border border-teal-100 rounded-lg p-3 text-center">
                <div class="text-xl font-bold ${totalClass}">HK$${total.toFixed(2)}</div>
                <div class="text-xs text-gray-500 mt-0.5">可用餘額</div>
            </div>
            <div class="bg-white/70 border border-teal-100 rounded-lg p-3 text-center">
                <div class="text-lg font-semibold text-gray-800">HK$${principal.toFixed(2)}</div>
                <div class="text-xs text-gray-500 mt-0.5">本金</div>
            </div>
            <div class="bg-white/70 border border-teal-100 rounded-lg p-3 text-center">
                <div class="text-lg font-semibold text-gray-800">HK$${bonus.toFixed(2)}</div>
                <div class="text-xs text-gray-500 mt-0.5">贈送額</div>
            </div>
        </div>
        ${renderPatientRecentWalletTxsHtml(recentTxs, recentTxsFailed, patientId)}
    `;
}

// 近期交易類型標籤（與錢包管理頁一致；此處為面板專用精簡對照）
const patientWalletTxTypeLabels = {
    topup: '充值',
    topupBonus: '充值贈送',
    payment: '看診付款',
    refund: '退款',
    adjust: '調整'
};

/**
 * 建構病人詳情中「近10次交易」子區塊 HTML。
 * @param {Array} txs 交易流水（已按時間倒序）
 * @param {boolean} failed 讀取是否失敗
 * @param {string} patientId 病人 ID（用於跳轉按鈕）
 */
export function renderPatientRecentWalletTxsHtml(txs, failed, patientId) {
    const pidAttr = window.escapeHtml(String(patientId || ''));
    const rows = Array.isArray(txs) ? txs.slice(0, 5) : [];
    let bodyHtml = '';
    if (failed) {
        bodyHtml = '<div class="text-center text-xs text-gray-400 py-3">無法載入近期交易</div>';
    } else if (rows.length === 0) {
        bodyHtml = '<div class="text-center text-xs text-gray-400 py-3">尚無交易記錄</div>';
    } else {
        bodyHtml = rows.map(tx => {
            const amount = typeof window.walletRound2 === 'function'
                ? window.walletRound2(tx.amount)
                : Math.round((Number(tx.amount) || 0) * 100) / 100;
            const isPayment = tx.type === 'payment' || amount < 0;
            let atText = '';
            try {
                atText = new Date(tx.at).toLocaleString('zh-HK', { hour12: false });
            } catch (_e) { atText = tx.at || ''; }
            const typeText = patientWalletTxTypeLabels[tx.type] || tx.type;
            return `
                <div class="flex items-center justify-between gap-3 py-1.5 border-t border-gray-100 first:border-t-0">
                    <div class="min-w-0">
                        <div class="text-xs text-gray-700 truncate">${window.escapeHtml(typeText)}</div>
                        <div class="text-[11px] text-gray-400 whitespace-nowrap">${window.escapeHtml(atText)}</div>
                    </div>
                    <div class="text-xs font-medium whitespace-nowrap ${isPayment ? 'text-red-600' : 'text-green-600'}">
                        ${isPayment ? '-' : ''}HK$${Math.abs(amount).toFixed(2)}
                    </div>
                </div>`;
        }).join('');
    }
    return `
        <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <div class="mb-1 text-xs font-medium text-gray-600">近期交易（最近 5 次）</div>
            ${bodyHtml}
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-2">
                <span class="text-[11px] text-gray-400">僅顯示最近 5 次，其他交易紀錄請至會員儲值查看</span>
                <button type="button"
                    onclick="openWalletManagementForPatient('${pidAttr}')"
                    class="px-2.5 py-1 text-[11px] rounded bg-teal-600 text-white hover:bg-teal-700 whitespace-nowrap">
                    前往會員儲值
                </button>
            </div>
        </div>`;
}

/**
 * 跳轉至「會員儲值」並自動選取該病人（供病人詳情面板查看完整交易）。
 * @param {string} patientId 病人 ID
 */
export function openWalletManagementForPatient(patientId) {
    const pid = String(patientId || '');
    if (!pid) return;
    try {
        // 先關閉病人詳情彈窗，再切換至會員儲值區
        if (typeof window.closePatientDetail === 'function') {
            window.closePatientDetail();
        } else {
            const modal = document.getElementById('patientDetailModal');
            if (modal) modal.classList.add('hidden');
        }
        if (typeof window.showSection === 'function') {
            window.showSection('walletManagement');
        }
        if (typeof window.selectWalletPatient === 'function') {
            window.selectWalletPatient(pid);
        }
    } catch (error) {
        console.error('開啟會員儲值失敗:', error);
    }
}

export async function refreshPatientPackagesUI() {
    // 使用字串比較 ID，避免類型不一致導致匹配失敗
    const appointment = G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId));
    if (!appointment) return;
    await renderPatientPackages(appointment.patientId);
}

export async function useOnePackage(patientId, packageRecordId) {
    // 在按鈕上顯示讀取狀態：嘗試從事件對象取得當前按鈕，若無則從 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            // 透過 onclick 屬性匹配對應按鈕（使用模板字串避免引號問題）
            const selector = `button[onclick="useOnePackage('${patientId}', '${packageRecordId}')"]`;
            loadingButton = document.querySelector(selector);
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 僅在本地消耗套票次數，不立即同步到資料庫
        const res = await consumePackageLocally(patientId, packageRecordId);
        if (!res.ok) {
            G.showToast(res.msg || '套票不可用', 'warning');
            return;
        }
        const usedName = `${res.record.name} (使用套票)`;
        G.selectedBillingItems.push({
            id: `use-${res.record.id}-${Date.now()}`,
            name: usedName,
            category: 'packageUse',
            price: 0,
            unit: '次',
            description: '套票抵扣一次',
            quantity: 1,
            // 套票使用不參與折扣
            includedInDiscount: false,
            // 以字串保存 patientId 及 packageRecordId，避免類型不一致導致匹配錯誤
            patientId: patientId !== undefined && patientId !== null ? String(patientId) : '',
            packageRecordId: res.record && res.record.id ? String(res.record.id) : ''
        });
        // 記錄本次套票消耗，以便取消診症時回復。此處 delta 設為 -1 表示減少一次。
        try {
            // 使用 res.record.id 來記錄套票變更，避免因外部傳入的 packageRecordId 與實際套票 ID 不一致
            // 導致之後退回套票時發生錯誤或套票錯亂的情況。
            G.pendingPackageChanges.push({
                patientId: patientId !== undefined && patientId !== null ? String(patientId) : '',
                packageRecordId: res.record && res.record.id ? String(res.record.id) : String(packageRecordId),
                delta: -1
            });
        } catch (_e) {}
        G.updateBillingDisplay();
        await refreshPatientPackagesUI();
        {
            const lang = localStorage.getItem('lang') || 'zh';
            const zhMsg = `已使用套票：${res.record.name}，剩餘 ${res.record.remainingUses} 次`;
            const enMsg = `Used package: ${res.record.name}, remaining ${res.record.remainingUses} uses`;
            const msg = lang === 'en' ? enMsg : zhMsg;
            G.showToast(msg, 'success');
        }
    } catch (error) {
        console.error('使用套票時發生錯誤:', error);
        {
            const lang = localStorage.getItem('lang') || 'zh';
            const zhMsg = '使用套票時發生錯誤';
            const enMsg = 'An error occurred while using the package';
            const msg = lang === 'en' ? enMsg : zhMsg;
            G.showToast(msg, 'error');
        }
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

export async function undoPackageUse(patientId, packageRecordId, usageItemId) {
    // 先取得觸發按鈕：優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            // 使用部分匹配，以 usageItemId 為關鍵字查找對應的取消按鈕
            loadingButton = document.querySelector(`button[onclick*="undoPackageUse("][onclick*="'${usageItemId}'"]`);
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 等待 Firebase 數據管理器準備好，避免在初始化過程中無法更新套票
        if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
            for (let i = 0; i < 100 && (!window.firebaseDataManager || !window.firebaseDataManager.isReady); i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        // 先取得對應的項目
        const item = G.selectedBillingItems.find(it => it.id === usageItemId);
        if (!item) {
            // 找不到項目，可能已被刪除
            G.showToast('找不到套票使用項目', 'warning');
            return;
        }
        // 推斷病人 ID：優先使用項目中的 patientId，其次使用傳入的參數，再退而從當前掛號推斷
        let resolvedPatientId = item.patientId || patientId;
        if (!resolvedPatientId) {
            try {
                if (typeof G.currentConsultingAppointmentId !== 'undefined' && Array.isArray(G.appointments)) {
                    // 使用字串比較 ID，避免類型不一致導致匹配失敗
                    const currAppt = G.appointments.find(appt => appt && String(appt.id) === String(G.currentConsultingAppointmentId));
                    if (currAppt) {
                        resolvedPatientId = currAppt.patientId;
                    }
                }
            } catch (e) {
                // 忽略錯誤，保持 resolvedPatientId 為 undefined
            }
        }
        // 嘗試恢復缺失的套票 meta，以便舊病歷也能取消使用
        try {
            // restorePackageUseMeta 會根據 resolvedPatientId 嘗試為所有缺失的套票使用項目補全 patientId 和 packageRecordId
            if (typeof restorePackageUseMeta === 'function' && resolvedPatientId) {
                await restorePackageUseMeta(resolvedPatientId);
            }
        } catch (e) {
            console.error('恢復套票使用 meta 錯誤:', e);
        }
        // 若 patientId 或 packageRecordId 缺失，嘗試使用傳入的參數填充
        if (!item.patientId && resolvedPatientId) {
            item.patientId = resolvedPatientId;
        }
        if (!item.packageRecordId && packageRecordId) {
            item.packageRecordId = packageRecordId;
        }
        // 如果成功補齊 meta，取消歷史標記
        if (item.isHistorical && item.patientId && item.packageRecordId) {
            item.isHistorical = false;
        }
        // 如果仍然缺少 meta，嘗試根據名稱匹配患者的套票以恢復 packageRecordId
        // 先使用傳入的 patientId 參數填補 item.patientId（若缺失）
        if (!item.patientId && resolvedPatientId) {
            item.patientId = resolvedPatientId;
        }
        // 若缺少 packageRecordId，嘗試透過名稱匹配
        if (!item.packageRecordId && item.patientId) {
            try {
                // 使用強制刷新取得最新套票資料，避免跨裝置快取不一致
                const pkgsForUndo = await getPatientPackages(item.patientId, true);
                // 從品項名稱中移除「(使用套票)」或「（使用套票）」，並處理可能出現的全形或半形括號與額外空格
                let baseName = item.name || '';
                baseName = baseName
                    // 移除括號包裹的使用套票字串，例如「推拿療程 (使用套票)」或「推拿療程（使用套票）」
                    .replace(/\s*[\(（]\s*使用套票\s*[\)）]\s*/g, '')
                    // 移除未被括號包裹的「使用套票」字串
                    .replace(/\s*使用套票\s*/g, '')
                    .trim();
                // 依名稱完全匹配當前病人的套票
                const candidatesForUndo = pkgsForUndo.filter(p => p.name === baseName);
                if (candidatesForUndo.length === 1) {
                    item.packageRecordId = candidatesForUndo[0].id;
                    item.isHistorical = false;
                } else if (candidatesForUndo.length > 1) {
                    // 如果有多張同名套票，選擇使用次數較多的那一張；若使用次數相同，則選擇購買時間較早的
                    candidatesForUndo.sort((a, b) => {
                        const usedA = (a.totalUses || 0) - (a.remainingUses || 0);
                        const usedB = (b.totalUses || 0) - (b.remainingUses || 0);
                        if (usedA !== usedB) {
                            // 使用次數多的排前面
                            return usedB - usedA;
                        }
                        // 使用次數相同，按購買日期早的排前面
                        const pa = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
                        const pb = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
                        if (pa !== pb) {
                            return pa - pb;
                        }
                        // 若購買日期也相同，使用 ID 的字典序進行最後排序，確保 deterministic
                        if (a.id && b.id) {
                            return String(a.id).localeCompare(String(b.id));
                        }
                        return 0;
                    });
                    const chosenPkg = candidatesForUndo[0];
                    item.packageRecordId = chosenPkg.id;
                    item.isHistorical = false;
                }
            } catch (e) {
                console.error('套票名稱匹配錯誤:', e);
            }
        }
        // 如果嘗試補全後仍缺少 meta，則移除項目但不嘗試退回次數
        if (!item.patientId || !item.packageRecordId) {
            G.selectedBillingItems = G.selectedBillingItems.filter(it => it.id !== usageItemId);
            G.updateBillingDisplay();
            G.showToast('已移除套票使用項目，未退回次數', 'info');
            return;
        }
        // 以項目中的 packageRecordId 為準
        const pkgId = item.packageRecordId;
        try {
            // 取得病人的套票，如果沒有取得則重試一次
            // 強制重新取得病人的套票，避免跨裝置快取不一致
            const packages = await getPatientPackages(item.patientId, true);
            // 比較套票 ID 時統一轉為字串，以避免類型不一致導致匹配失敗
            const pkg = packages.find(p => String(p.id) === String(pkgId));
            if (!pkg) {
                // 找不到對應的套票，直接移除項目
                G.selectedBillingItems = G.selectedBillingItems.filter(it => it.id !== usageItemId);
                G.updateBillingDisplay();
                G.showToast('找不到對應的套票，已移除項目', 'warning');
                return;
            }
            /*
             * 不立即更新資料庫，僅在本地回復套票使用。
             * 將剩餘次數增加 1 並更新暫存變更，保存病歷時再同步到資料庫。
             */
            {
                // 如果套票使用項目的數量大於 1，代表當次診症已抵扣多次。
                // 此時取消使用只應減少數量並退回一次，並保留項目；
                // 若數量為 1，則從列表中移除該項目。
                const currentItem = G.selectedBillingItems.find(it => it.id === usageItemId);
                if (currentItem && typeof currentItem.quantity === 'number' && currentItem.quantity > 1) {
                    currentItem.quantity -= 1;
                } else {
                    G.selectedBillingItems = G.selectedBillingItems.filter(it => it.id !== usageItemId);
                }
                // 在 UI 更新前先記錄本次套票退回，以便 renderPatientPackages 能正確反映新的剩餘次數
                try {
                    const undoPatientIdRaw = (item && item.patientId) ? item.patientId : resolvedPatientId;
                    // 在暫存變更中統一使用字串表示 ID
                    const undoPatientIdStr = (undoPatientIdRaw !== undefined && undoPatientIdRaw !== null) ? String(undoPatientIdRaw) : '';
                    const pkgIdStr = (pkgId !== undefined && pkgId !== null) ? String(pkgId) : '';
                    G.pendingPackageChanges.push({
                        patientId: undoPatientIdStr,
                        packageRecordId: pkgIdStr,
                        delta: +1
                    });
                } catch (_e) {}
                // 更新收費項目與套票列表顯示
                G.updateBillingDisplay();
                await refreshPatientPackagesUI();
                G.showToast('已取消本次套票使用，次數已退回', 'success');
            }
        } catch (error) {
            console.error('取消套票使用錯誤:', error);
            G.showToast('取消套票使用時發生錯誤', 'error');
        }
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

// 嘗試為缺失 meta 的套票使用項目補全 patientId 與 packageRecordId
// 當舊病歷無法取消套票時，會嘗試透過病人當前的套票記錄推斷對應的套票ID
export async function restorePackageUseMeta(patientId) {
    try {
        // 取得病人的所有套票
        // 強制重新載入套票，避免跨裝置快取不一致
        const packages = await getPatientPackages(patientId, true);
        // 遍歷已選擇的收費項目，尋找缺乏 meta 的套票使用項目
        G.selectedBillingItems.forEach(item => {
            // 判斷是否為套票抵扣項目：品項類別為 packageUse 或名稱含有「使用套票」
            const isPackageUse = item && (item.category === 'packageUse' || (item.name && item.name.includes('使用套票')));
                if (isPackageUse && (item.isHistorical || !item.patientId || !item.packageRecordId)) {
                // 即便標記為歷史記錄，也嘗試恢復 meta 以便可以取消使用
                
                // 補充病人ID，統一轉為字串
                item.patientId = (patientId !== undefined && patientId !== null) ? String(patientId) : '';
                // 從名稱中移除後綴以找出套票名稱，例如「推拿療程 (使用套票)」或「推拿療程（使用套票）」→「推拿療程」
                // 使用正則處理全形、半形括號及可能的空格，並移除未被括號包裹的「使用套票」字樣
                let baseName = item.name || '';
                baseName = baseName
                    .replace(/\s*[\(（]\s*使用套票\s*[\)）]\s*/g, '')
                    .replace(/\s*使用套票\s*/g, '')
                    .trim();
                // 在病人的套票中尋找名稱完全匹配的項目
                const candidates = packages.filter(p => p.name === baseName);
                if (candidates.length === 1) {
                    // 將匹配到的套票 ID 轉為字串
                    item.packageRecordId = (candidates[0] && candidates[0].id) ? String(candidates[0].id) : '';
                    // 找到對應的套票，取消歷史標記
                    item.isHistorical = false;
                } else if (candidates.length > 1) {
                    // 如果有多個同名套票，選擇使用次數較多的那一個；若使用次數相同，則選擇購買時間較早的
                    candidates.sort((a, b) => {
                        const usedA = (a.totalUses || 0) - (a.remainingUses || 0);
                        const usedB = (b.totalUses || 0) - (b.remainingUses || 0);
                        if (usedA !== usedB) {
                            // 使用次數多的排前面
                            return usedB - usedA;
                        }
                        // 使用次數相同，按購買日期早的排前面
                        const pa = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
                        const pb = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
                        if (pa !== pb) {
                            return pa - pb;
                        }
                        // 若購買日期也相同，使用 ID 的字典序進行最後排序，確保 deterministic
                        if (a.id && b.id) {
                            return String(a.id).localeCompare(String(b.id));
                        }
                        return 0;
                    });
                    const chosen = candidates[0];
                    // 將匹配到的套票 ID 轉為字串
                    item.packageRecordId = (chosen && chosen.id) ? String(chosen.id) : '';
                    // 找到對應的套票，取消歷史標記
                    item.isHistorical = false;
                } else {
                    // 找不到匹配的套票，保持歷史記錄狀態
                    item.isHistorical = true;
                }
            }
        });
    } catch (error) {
        console.error('restorePackageUseMeta 錯誤:', error);
    }
}
// 將函式暴露到全域以便其他部分調用
window.restorePackageUseMeta = restorePackageUseMeta;

// 以香港時區（+08:00）回傳指定 Date 所屬本地日的起訖邊界，
// 讓 Firestore 查詢視窗與報表的香港日界口徑一致（瀏覽器非 HK 時區也適用）。
