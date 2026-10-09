/* ============================================================
 * billing/items.js — 收費項目資料同步與管理 UI（Phase 5 子批 A）
 * ------------------------------------------------------------
 * billingMeta 單文檔同步（取代兩個 collection onSnapshot，省讀取量）
 * ＋ 收費項目管理頁（load/filter/display/create/edit/save/delete）。
 * 共享狀態所有權仍在 system.js，經 G 讀寫。
 * ============================================================ */
import { G } from '../../lib/legacy.js';

// 模組級 UI 狀態
let currentBillingFilter = 'all';
let editingBillingItemId = null;

// ─────────────────────────────────────────────────────────────
// billingMeta 同步基礎設施（鏡像 patientsMeta 模式）
// ─────────────────────────────────────────────────────────────
const BILLING_SYNC_CLIENT_ID = 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const SELF_BILLING_META_NONCES = []; // FIFO，最多保留 32 個本機 nonce
const BILLING_BOOTSTRAP_KEY = 'billingMetaBootstrapped_v1'; // localStorage 旗標：本機是否已完成首次 getDocs
const BILLING_BOOTSTRAP_TTL_MS = 12 * 60 * 60 * 1000; // bootstrap 旗標 12 小時有效

let billingItemsRealtimeClinicId = null;
let billingItemsGlobalMap = new Map();
let billingItemsClinicMap = new Map();
let billingItemsMetaUnsubscribe = null;
let billingMetaListening = false;

function newBillingMetaNonce() {
    const nonce = BILLING_SYNC_CLIENT_ID + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 8);
    SELF_BILLING_META_NONCES.push(nonce);
    while (SELF_BILLING_META_NONCES.length > 32) SELF_BILLING_META_NONCES.shift();
    return nonce;
}
function isSelfBillingMetaNonce(nonce) {
    return !!nonce && SELF_BILLING_META_NONCES.indexOf(nonce) !== -1;
}
function readBillingBootstrapMeta() {
    try { return JSON.parse(localStorage.getItem(BILLING_BOOTSTRAP_KEY) || 'null'); } catch (_e) { return null; }
}
function writeBillingBootstrapMeta(value) {
    try { localStorage.setItem(BILLING_BOOTSTRAP_KEY, JSON.stringify(value || {})); } catch (_e) {}
}
function isBootstrapFresh(meta) {
    if (!meta || typeof meta.t !== 'number') return false;
    if (Date.now() - meta.t > BILLING_BOOTSTRAP_TTL_MS) return false;
    return !!meta.cid;
}

/** 觸發 billingMeta/lastChange 通知：payload = {scope:'global'|clinicId|'all', operation, itemId, bulk} */
export async function touchBillingMeta(payload = {}) {
    try {
        await G.waitForFirebaseDb();
        const clinicId = localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : 'local-default');
        const scope = payload.scope || (payload.shared ? 'global' : clinicId);
        await window.firebase.setDoc(
            window.firebase.doc(window.firebase.db, 'billingMeta', 'lastChange'),
            {
                timestamp: new Date(),
                scope,
                operation: payload.operation || 'update',
                itemId: payload.itemId ? String(payload.itemId) : null,
                bulk: !!payload.bulk,
                nonce: payload.nonce || newBillingMetaNonce(),
                clientId: BILLING_SYNC_CLIENT_ID
            },
            { merge: true }
        );
    } catch (_e) { /* 本機 meta 寫入失敗不影響主流程 */ }
}

export async function detachBillingMetaListener() {
    if (typeof billingItemsMetaUnsubscribe === 'function') {
        try { billingItemsMetaUnsubscribe(); } catch (_e) {}
    }
    billingItemsMetaUnsubscribe = null;
    billingMetaListening = false;
}
// 傳統腳本（備份導入 systemmanagement.js）調用
window.touchBillingMeta = touchBillingMeta;

export async function attachBillingMetaListener() {
    if (billingMetaListening) return;
    await G.waitForFirebaseDb();
    let isInitial = true;
    const metaDoc = window.firebase.doc(window.firebase.db, 'billingMeta', 'lastChange');
    billingItemsMetaUnsubscribe = window.firebase.onSnapshot(metaDoc, (snap) => {
        try {
            if (isInitial) { isInitial = false; return; }
            const meta = snap && snap.data ? (snap.data() || {}) : {};
            handleRemoteBillingMetaChange(meta);
        } catch (err) { console.warn('billingMeta 回調處理失敗:', err); }
    }, (err) => { console.error('billingMeta 監聽失敗:', err); });
    billingMetaListening = true;
}

/** 處理非本機觸發的 meta 變更（1 次讀取 / 單筆） */
async function handleRemoteBillingMetaChange(meta) {
    if (!meta || typeof meta !== 'object') return;
    if (isSelfBillingMetaNonce(meta.nonce)) return; // 本機觸發，已樂觀更新 UI
    const clinicId = localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : 'local-default');
    const scope = String(meta.scope || '');
    // 1) 範圍過濾：不影響本診所 → 跳過（全域項目例外）
    const affectsGlobal = scope === 'global' || scope === 'all';
    const affectsClinic = scope === 'all' || scope === String(clinicId);
    if (!affectsGlobal && !affectsClinic) return;
    const fb = window.firebase;
    try {
        if (meta.bulk || !meta.itemId) {
            // 全量刷新指定 scope（備份導入、shared↔clinic 互移等）
            if (scope === 'all' || scope === 'global') {
                const snap = await fb.getDocs(fb.collection(fb.db, 'globalBillingItems'));
                const next = new Map();
                snap.forEach(d => next.set(String(d.id), { id: d.id, ...d.data(), shared: true }));
                billingItemsGlobalMap = next;
            }
            if (scope === 'all' || scope === String(clinicId)) {
                const snap = await fb.getDocs(fb.collection(fb.db, 'clinics', clinicId, 'billingItems'));
                const next = new Map();
                snap.forEach(d => next.set(String(d.id), { id: d.id, ...d.data(), shared: !!d.data().shared }));
                billingItemsClinicMap = next;
            }
        } else {
            // 單筆 patch：1 次 getDoc
            const itemId = String(meta.itemId);
            const op = String(meta.operation || 'update');
            const globalRef = fb.doc(fb.db, 'globalBillingItems', itemId);
            const clinicRef = fb.doc(fb.db, 'clinics', clinicId, 'billingItems', itemId);
            const affectedRefs = [];
            if (scope === 'global' || scope === 'all') affectedRefs.push({ ref: globalRef, map: billingItemsGlobalMap, shared: true });
            if (scope === String(clinicId) || scope === 'all') affectedRefs.push({ ref: clinicRef, map: billingItemsClinicMap, shared: false });
            for (const entry of affectedRefs) {
                const docSnap = await fb.getDoc(entry.ref);
                if (docSnap && docSnap.exists()) {
                    entry.map.set(String(docSnap.id), { id: docSnap.id, ...docSnap.data(), shared: entry.shared });
                } else {
                    entry.map.delete(itemId);
                }
            }
        }
        mergeBillingItemsFromRealtime();
        try { if (typeof G.displayBillingItems === 'function') G.displayBillingItems(); } catch (_e) {}
    } catch (err) {
        console.warn('billingMeta 遠端同步失敗，退回 scope 全量重抓:', err);
        try {
            // 退回：全量抓影響的集合（最多 2 次讀取，比「完全失敗」好）
            if (affectsGlobal) {
                const snap = await fb.getDocs(fb.collection(fb.db, 'globalBillingItems'));
                const next = new Map();
                snap.forEach(d => next.set(String(d.id), { id: d.id, ...d.data(), shared: true }));
                billingItemsGlobalMap = next;
            }
            if (affectsClinic) {
                const snap = await fb.getDocs(fb.collection(fb.db, 'clinics', clinicId, 'billingItems'));
                const next = new Map();
                snap.forEach(d => next.set(String(d.id), { id: d.id, ...d.data(), shared: !!d.data().shared }));
                billingItemsClinicMap = next;
            }
            mergeBillingItemsFromRealtime();
            try { if (typeof G.displayBillingItems === 'function') G.displayBillingItems(); } catch (_e) {}
        } catch (_e2) { /* 徹底失敗，留著舊 UI 即可 */ }
    }
}

/** 首次 bootstrap：getDocs 兩個集合各一次（之後只靠 billingMeta 增量） */
async function bootstrapBillingItems(forceRefresh = false) {
    await G.waitForFirebaseDb();
    const clinicId = localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : 'local-default');
    const fb = window.firebase;
    const [globalSnap, clinicSnap] = await Promise.all([
        fb.getDocs(fb.collection(fb.db, 'globalBillingItems')),
        fb.getDocs(fb.collection(fb.db, 'clinics', clinicId, 'billingItems'))
    ]);
    const globalMap = new Map();
    globalSnap.forEach(d => globalMap.set(String(d.id), { id: d.id, ...d.data(), shared: true }));
    const clinicMap = new Map();
    clinicSnap.forEach(d => clinicMap.set(String(d.id), { id: d.id, ...d.data(), shared: !!d.data().shared }));
    billingItemsGlobalMap = globalMap;
    billingItemsClinicMap = clinicMap;
    billingItemsRealtimeClinicId = clinicId;
    mergeBillingItemsFromRealtime();
    writeBillingBootstrapMeta({ t: Date.now(), cid: String(clinicId) });
}

export function stopBillingItemsRealtimeSync() {
    try { detachBillingMetaListener(); } catch (_e) {}
    billingItemsRealtimeClinicId = null;
    billingItemsGlobalMap = new Map();
    billingItemsClinicMap = new Map();
}
window.__stopBillingItemsRealtimeSync = stopBillingItemsRealtimeSync;

export function mergeBillingItemsFromRealtime() {
    const byId = new Map();
    billingItemsGlobalMap.forEach((value, key) => byId.set(String(key), value));
    billingItemsClinicMap.forEach((value, key) => byId.set(String(key), value));
    G.billingItems = Array.from(byId.values());
    G.billingItemsLoaded = true;
    try {
        localStorage.setItem(G.getClinicScopedStorageKey('billingItems'), JSON.stringify(G.billingItems));
    } catch (_e) {}
}

/**
 * 確保 billingMeta 監聽器已掛載，並在診所切換時只重抓該診所 subcollection
 * （不動 global map），避免無謂的第二次 getDocs。
 */
export async function ensureBillingItemsRealtimeSync() {
    await G.waitForFirebaseDb();
    const clinicId = localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : 'local-default');

    // 診所切換：若已 bootstrap 過 → 只重抓 clinic subcollection（1 次 getDocs）
    if (billingItemsRealtimeClinicId && String(billingItemsRealtimeClinicId) !== String(clinicId)) {
        try {
            const fb = window.firebase;
            const clinicSnap = await fb.getDocs(fb.collection(fb.db, 'clinics', clinicId, 'billingItems'));
            const next = new Map();
            clinicSnap.forEach(d => next.set(String(d.id), { id: d.id, ...d.data(), shared: !!d.data().shared }));
            billingItemsClinicMap = next;
            billingItemsRealtimeClinicId = clinicId;
            mergeBillingItemsFromRealtime();
            writeBillingBootstrapMeta({ t: Date.now(), cid: String(clinicId) });
        } catch (_reclinicErr) {
            console.warn('切換診所重抓收費項目失敗:', _reclinicErr);
        }
    } else {
        billingItemsRealtimeClinicId = clinicId;
    }

    await attachBillingMetaListener();
}

export async function initBillingItems(forceRefresh = false) {
    if (G.billingItemsLoaded && !forceRefresh) {
        // loaded=true 但陣列為空（可能是之前 localStorage 存了空陣列），強制重跑
        if (Array.isArray(G.billingItems) && G.billingItems.length === 0) {
            G.billingItemsLoaded = false;
        } else {
            try { await ensureBillingItemsRealtimeSync(); } catch (_syncErr) {}
            return;
        }
    }
    // 非強制刷新：先嘗試 localStorage 快取 → 成功則只掛監聽，不再 getDocs
    if (!forceRefresh) {
        try {
            const stored = localStorage.getItem(G.getClinicScopedStorageKey('billingItems'));
            const bsMeta = readBillingBootstrapMeta();
            const clinicId = localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : 'local-default');
            if (stored && isBootstrapFresh(bsMeta) && String(bsMeta.cid || '') === String(clinicId)) {
                const localData = JSON.parse(stored);
                if (Array.isArray(localData) && localData.length > 0) {
                    G.billingItems = localData;
                    G.billingItemsLoaded = true;
                    // 重建兩個 Map（避免 remote patch 時 map 為空）
                    const gMap = new Map(), cMap = new Map();
                    localData.forEach(it => {
                        const idStr = String(it.id);
                        if (it.shared) gMap.set(idStr, { ...it, shared: true });
                        else cMap.set(idStr, { ...it, shared: !!it.shared });
                    });
                    billingItemsGlobalMap = gMap;
                    billingItemsClinicMap = cMap;
                    billingItemsRealtimeClinicId = clinicId;
                    await ensureBillingItemsRealtimeSync();
                    return;
                }
            }
        } catch (lsErr) {
            console.warn('載入本地收費項目失敗:', lsErr);
        }
    }
    // 強制刷新 或 無效快取 → 完整 bootstrap（2 次 getDocs）
    if (forceRefresh) {
        try { localStorage.removeItem(BILLING_BOOTSTRAP_KEY); } catch (_e) {}
    }
    await bootstrapBillingItems(forceRefresh);
    await ensureBillingItemsRealtimeSync();
}


        export async function loadBillingManagement() {
    // 權限檢查：護理師或一般用戶不得訪問收費項目管理
    if (!G.hasAccessToSection('billingManagement')) {
        G.showToast('權限不足，無法存取收費項目管理', 'error');
        return;
    }
            // 每次進入收費項目管理時，強制從 Firestore 取得最新資料，
            // 以避免其他裝置在本地儲存的舊資料未同步更新。
            if (typeof initBillingItems === 'function') {
                await initBillingItems(true);
            }
            displayBillingItems();
            
            // 搜尋功能
            const searchInput = document.getElementById('searchBilling');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    displayBillingItems();
                });
            }
        }
        
        export function filterBillingItems(category) {
            currentBillingFilter = category;
            
            // 更新按鈕樣式
            document.querySelectorAll('[id^="billing-filter-"]').forEach(btn => {
                btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-200';
            });
            document.getElementById(`billing-filter-${category}`).className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 transition duration-200';
            
            displayBillingItems();
        }
        
        export function displayBillingItems() {
            const searchTerm = document.getElementById('searchBilling').value.toLowerCase();
            const listContainer = document.getElementById('billingItemsList');
            
            // 過濾資料
            let filteredItems = G.billingItems.filter(item => {
                const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                                    (item.description && item.description.toLowerCase().includes(searchTerm));
                
                const matchesFilter = currentBillingFilter === 'all' || item.category === currentBillingFilter;
                
                return matchesSearch && matchesFilter;
            });
            
            if (filteredItems.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="mb-4 flex justify-center"><i data-lucide="wallet" class="w-10 h-10 text-[#D9782B]"></i></div>
                        <div class="text-lg font-medium mb-2">沒有找到相關收費項目</div>
                        <div class="text-sm">請嘗試其他搜尋條件或新增收費項目</div>
                    </div>
                `;
                return;
            }
            
            // Determine current language and translation dictionary for category
            // names.  We use localStorage to retrieve the saved language and
            // fallback to Chinese if it isn't set.  The dictionary maps
            // Chinese terms to English equivalents, which allows us to
            // translate category names prior to appending counts.  Without
            // pre‑translation the dynamic strings (e.g. "診療費 (3)") would
            // not match any dictionary key and thus remain untranslated.
            const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
            const dict = (window.translations && window.translations[lang]) ? window.translations[lang] : {};

            // 按類別分組顯示。每個類別包含一個中文名稱以及對應圖示。
            const billingCategories = {
                consultation: { baseName: '診療費', icon: 'stethoscope', items: [] },
                medicine: { baseName: '藥費', icon: 'pill', items: [] },
                treatment: { baseName: '治療費', icon: 'wrench', items: [] },
                other: { baseName: '其他', icon: 'clipboard-list', items: [] },
                discount: { baseName: '折扣項目', icon: 'banknote', items: [] },
                package: { baseName: '套票項目', icon: 'ticket', items: [] }
            };

            // 將過濾後的項目分配到對應的帳單分類中
            filteredItems.forEach(item => {
                if (billingCategories[item.category]) {
                    billingCategories[item.category].items.push(item);
                }
            });

            let html = '';

            // 建立各分類的顯示內容
            Object.keys(billingCategories).forEach(categoryKey => {
                const category = billingCategories[categoryKey];
                // Translate the category name based on the current language.
                // We look up the base Chinese name in the dictionary; if no
                // translation exists we fall back to the original Chinese.
                const translatedName = dict[category.baseName] || category.baseName;
                if (category.items.length > 0 && (currentBillingFilter === 'all' || currentBillingFilter === categoryKey)) {
                    html += `
                        <div class="mb-8">
                            <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <i data-lucide="${category.icon}" class="w-5 h-5 mr-2 text-[#D9782B]"></i>${translatedName} (${category.items.length})
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                ${category.items.map(item => createBillingItemCard(item)).join('')}
                            </div>
                        </div>
                    `;
                }
            });
            
            listContainer.innerHTML = html;
        }
        
        export function createBillingItemCard(item) {
            const statusClass = item.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusText = item.active ? '啟用' : '停用';
            
            // 折扣項目使用不同的顏色顯示
            const priceColor = item.category === 'discount' ? 'text-red-600' : 'text-green-600';
            let pricePrefix = '$';
            let displayPrice = Math.abs(item.price);
            
            // 處理折扣項目的顯示
            if (item.category === 'discount') {
                if (item.price > 0 && item.price < 1) {
                    // 百分比折扣 (例如 0.85 = 8.5 折)。
                    // 將折扣倍率乘以 10 以取得折扣表示，保留 1 位小數以避免將 8.5 四捨五入成 9。
                    // 若結果為整數則不顯示小數點。
                    pricePrefix = '';
                    const discountRate = item.price * 10;
                    displayPrice = Number.isInteger(discountRate) ? discountRate : discountRate.toFixed(1);
                } else if (item.price < 0) {
                    // 固定金額折扣
                    pricePrefix = '-$';
                    displayPrice = Math.abs(item.price);
                }
            }
            
            // 為避免 XSS，對文字內容進行轉義
            const safeName = window.escapeHtml(item.name);
            const safeUnit = item.unit ? window.escapeHtml(item.unit) : null;
            const safeDescription = item.description ? window.escapeHtml(item.description) : null;
            // 讀取英譯名稱並轉義。某些收費項目可能包含英文名稱（englishName）
            // 以便在英文介面顯示時使用。如果沒有提供 englishName，則預設為 null。
            const safeEnglishName = item.englishName ? window.escapeHtml(item.englishName) : null;
            // 根據當前語言選擇顯示名稱。預設為中文名稱，若介面語言為英文且
            // 有提供英文名稱，則優先使用英文名稱。
            let displayName = safeName;
            try {
                const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                if (langSel && langSel.toLowerCase().startsWith('en')) {
                    displayName = safeEnglishName || safeName;
                }
            } catch (_e) {
                // 若讀取 localStorage 失敗或其他錯誤，退回顯示中文名稱
                displayName = safeName;
            }
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200 ${!item.active ? 'opacity-75' : ''}">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex-1">
                            <h4 class="text-lg font-semibold text-gray-900">${displayName}</h4>
                            <div class="flex items-center mt-1">
                                <span class="text-2xl font-bold ${priceColor}">${pricePrefix}${displayPrice}</span>
                                ${safeUnit ? `<span class="text-sm text-gray-500 ml-1">/ ${safeUnit}</span>` : ''}
                            </div>
                        </div>
                        <div class="flex flex-col items-end space-y-2">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                                ${statusText}
                            </span>
                            <div class="flex space-x-1">
                                <!--
                                  將 id 以字串形式傳遞給編輯與刪除函式，避免當文件 ID 為
                                  字串時產生未宣告變數的錯誤。例如 Firestore 生成的文件 ID
                                  多為隨機字串，若直接插入 onclick 中將導致瀏覽器將其當作
                                  變數解析，觸發 ReferenceError。透過將 id 包裹在單引號內
                                  （並轉換為字串）可確保 onclick 中傳遞的參數正確。
                                -->
                                <button onclick="editBillingItem('${item.id}')" class="text-blue-600 hover:text-blue-800 text-sm">編輯</button>
                                <button onclick="deleteBillingItem('${item.id}')" class="text-red-600 hover:text-red-800 text-sm">刪除</button>
                            </div>
                        </div>
                    </div>
                    
                    ${safeDescription ? `
                        <div class="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                            ${safeDescription}
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // 收費項目表單功能
        export function showAddBillingItemForm() {
    // 若沒有管理收費項目的權限，阻止開啟表單
    if (!G.hasAccessToSection('billingManagement')) {
        G.showToast('權限不足，無法新增收費項目', 'error');
        return;
    }
            editingBillingItemId = null;
            document.getElementById('billingItemFormTitle').textContent = '新增收費項目';
            document.getElementById('billingItemSaveButtonText').textContent = '儲存';
            clearBillingItemForm();
            document.getElementById('addBillingItemModal').classList.remove('hidden');
        }
        
        export function hideAddBillingItemForm() {
            document.getElementById('addBillingItemModal').classList.add('hidden');
            clearBillingItemForm();
            editingBillingItemId = null;
        }
        
        export function clearBillingItemForm() {
            document.getElementById('billingItemPackageUses').value = '';
            document.getElementById('billingItemValidityDays').value = '';
            var pf = document.getElementById('packageFields'); if (pf) pf.classList.add('hidden');
            document.getElementById('billingItemName').value = '';
            document.getElementById('billingItemCategory').value = '';
            document.getElementById('billingItemPrice').value = '';
            document.getElementById('billingItemUnit').value = '';
            document.getElementById('billingItemDescription').value = '';
            document.getElementById('billingItemActive').checked = true;
            const sh = document.getElementById('billingItemShared'); if (sh) sh.checked = false;
        }
        
        export function editBillingItem(id) {
    // 權限檢查：無權限者不得編輯
    if (!G.hasAccessToSection('billingManagement')) {
        G.showToast('權限不足，無法編輯收費項目', 'error');
        return;
    }
            // 將 id 轉為字串以避免數字與字串比較不相等
            const idStr = String(id);
            const item = G.billingItems.find(b => String(b.id) === idStr);
            if (!item) return;
            
            // 編輯狀態下儲存字串類型的 ID
            editingBillingItemId = idStr;
            document.getElementById('billingItemFormTitle').textContent = '編輯收費項目';
            document.getElementById('billingItemSaveButtonText').textContent = '更新';
            
            document.getElementById('billingItemName').value = item.name || '';
            document.getElementById('billingItemCategory').value = item.category || '';
            document.getElementById('billingItemPrice').value = item.price || '';
            document.getElementById('billingItemUnit').value = item.unit || '';
            document.getElementById('billingItemDescription').value = item.description || '';
            document.getElementById('billingItemActive').checked = item.active !== false;
            const sh = document.getElementById('billingItemShared'); if (sh) sh.checked = !!item.shared;
            document.getElementById('billingItemPackageUses').value = item.packageUses || '';
            document.getElementById('billingItemValidityDays').value = item.validityDays || '';
            {
                const pf = document.getElementById('packageFields');
                if (pf) pf.classList.toggle('hidden', item.category !== 'package');
            }
            
            document.getElementById('addBillingItemModal').classList.remove('hidden');
        }
        
        export async function saveBillingItem() {
            // 權限檢查：無權限者不得儲存
            if (!G.hasAccessToSection('billingManagement')) {
                G.showToast('權限不足，無法保存收費項目', 'error');
                return;
            }
            const name = document.getElementById('billingItemName').value.trim();
            const category = document.getElementById('billingItemCategory').value;
            let price = parseFloat(document.getElementById('billingItemPrice').value);

            let packageUses = null;
            let validityDays = null;
            if (category === 'package') {
                packageUses = parseInt(document.getElementById('billingItemPackageUses').value);
                validityDays = parseInt(document.getElementById('billingItemValidityDays').value);
                if (!packageUses || packageUses <= 0) {
                    G.showToast('請輸入套票可用次數！', 'error');
                    return;
                }
                if (!validityDays || validityDays <= 0) {
                    G.showToast('請輸入有效天數！', 'error');
                    return;
                }
            }
            
            if (!name) {
                G.showToast('請輸入收費項目名稱！', 'error');
                return;
            }
            
            if (!category) {
                G.showToast('請選擇項目類別！', 'error');
                return;
            }
            
            if (isNaN(price)) {
                G.showToast('請輸入有效的收費金額！', 'error');
                return;
            }
            
            // 折扣項目允許負數或0-1之間的小數（百分比），其他項目不允許負數
            if (category !== 'discount' && price < 0) {
                G.showToast('除折扣項目外，收費金額不能為負數！', 'error');
                return;
            }
            
            // 折扣項目的特殊驗證
            if (category === 'discount') {
                if (price > 0 && price >= 1 && price <= 10) {
                    // 如果輸入1-10之間的數字，自動轉換為折扣比例
                    price = price / 10;
                    document.getElementById('billingItemPrice').value = price;
                    {
                        const lang = localStorage.getItem('lang') || 'zh';
                        const zhMsg = `已自動轉換為${(price * 100).toFixed(0)}折`;
                        const enMsg = `Automatically converted to ${(price * 100).toFixed(0)}% discount`;
                        const msg = lang === 'en' ? enMsg : zhMsg;
                        G.showToast(msg, 'info');
                    }
                }
            }
            
            // 取得當前觸發的按鈕並在開始執行儲存時顯示讀取圈
            const saveBtn = G.getLoadingButtonFromEvent('button[onclick="saveBillingItem()"]');
            G.setButtonLoading(saveBtn);
            try {
                // 始終使用字串作為 ID，以避免字串與數字比較造成的匹配問題
                const newId = editingBillingItemId || String(Date.now());
                const prevItem = editingBillingItemId ? G.billingItems.find(b => String(b.id) === String(editingBillingItemId)) : null;
                const wasShared = prevItem ? !!prevItem.shared : false;
                const item = {
                    id: newId,
                    name: name,
                    category: category,
                    price: price,
                    unit: document.getElementById('billingItemUnit').value.trim(),
                    description: document.getElementById('billingItemDescription').value.trim(),
                    packageUses: packageUses,
                    validityDays: validityDays,
                    active: document.getElementById('billingItemActive').checked,
                    shared: !!(document.getElementById('billingItemShared') && document.getElementById('billingItemShared').checked),
                    createdAt: editingBillingItemId ? (G.billingItems.find(b => String(b.id) === String(editingBillingItemId)) || {}).createdAt : new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                // 更新本地資料及提示訊息
                if (editingBillingItemId) {
                    // 以字串形式比較 ID，以確保能正確找到並覆寫原項目
                    const index = G.billingItems.findIndex(b => String(b.id) === String(editingBillingItemId));
                    if (index !== -1) {
                        G.billingItems[index] = item;
                    }
                    G.showToast('收費項目已更新！', 'success');
                } else {
                    G.billingItems.push(item);
                    G.showToast('收費項目已新增！', 'success');
                }

                // 將最新收費項目存回本地以支援跨裝置同步讀取。
                try {
                    localStorage.setItem(G.getClinicScopedStorageKey('billingItems'), JSON.stringify(G.billingItems));
                } catch (lsErrUpdate) {
                    console.warn('保存收費項目到本地失敗:', lsErrUpdate);
                }

                try {
                    // 將收費項目寫入 Firestore
                    // 不儲存 id 欄位，避免與文件 ID 重複
                    let dataToWrite;
                    try {
                        const { id, ...rest } = item || {};
                        dataToWrite = { ...rest };
                    } catch (_omitErr) {
                        dataToWrite = item;
                    }
                    const clinicId = localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : 'local-default');
                    const isCrossScopeMove = !!editingBillingItemId && !!prevItem && (wasShared !== !!item.shared);
                    if (item.shared) {
                        await window.firebase.setDoc(
                            window.firebase.doc(window.firebase.db, 'globalBillingItems', String(item.id)),
                            dataToWrite
                        );
                        // 若由診所專屬改為共用，刪除診所節點的舊資料以避免重複
                        if (editingBillingItemId && !wasShared) {
                            try {
                                await window.firebase.deleteDoc(
                                    window.firebase.doc(window.firebase.db, 'clinics', clinicId, 'billingItems', String(item.id))
                                );
                            } catch (_delClinic) {}
                        }
                    } else {
                        await window.firebase.setDoc(
                            window.firebase.doc(window.firebase.db, 'clinics', clinicId, 'billingItems', String(item.id)),
                            dataToWrite
                        );
                        // 若由共用改為診所專屬，刪除全域節點舊資料
                        if (editingBillingItemId && wasShared) {
                            try {
                                await window.firebase.deleteDoc(
                                    window.firebase.doc(window.firebase.db, 'globalBillingItems', String(item.id))
                                );
                            } catch (_delGlobal) {}
                        }
                    }
                    // 觸發 billingMeta 通知其他裝置
                    if (isCrossScopeMove) {
                        // 跨 scope 移動：兩個集合都要重抓
                        touchBillingMeta({ operation: editingBillingItemId ? 'update' : 'create', itemId: item.id, scope: 'all', bulk: true }).catch(() => {});
                    } else {
                        touchBillingMeta({ operation: editingBillingItemId ? 'update' : 'create', itemId: item.id, scope: item.shared ? 'global' : clinicId }).catch(() => {});
                    }
                } catch (error) {
                    console.error('儲存收費項目至雲端資料庫失敗:', error);
                }
                hideAddBillingItemForm();
                displayBillingItems();
                // 新增或更新收費項目後，標記已載入，避免診症搜尋時判定為未載入
                G.billingItemsLoaded = true;
            } finally {
                // 恢復按鈕狀態與內容
                G.clearButtonLoading(saveBtn);
            }
        }
        
        export async function deleteBillingItem(id) {
    // 權限檢查：無權限者不得刪除
    if (!G.hasAccessToSection('billingManagement')) {
        G.showToast('權限不足，無法刪除收費項目', 'error');
        return;
    }
            // 將 id 轉為字串以避免數字與字串比較不相等
            const idStr = String(id);
            const item = G.billingItems.find(b => String(b.id) === idStr);
            if (!item) return;
            
            // 刪除收費項目確認訊息支援中英文
            {
                const langDel = localStorage.getItem('lang') || 'zh';
                const zhMsgDel = `確定要刪除收費項目「${item.name}」嗎？\n\n此操作無法復原！`;
                const enMsgDel = `Are you sure you want to delete the billing item "${item.name}"?\n\nThis action cannot be undone!`;
                const confirmDel = await G.showConfirmation(langDel === 'en' ? enMsgDel : zhMsgDel, 'warning');
                if (confirmDel) {
                    G.billingItems = G.billingItems.filter(b => String(b.id) !== idStr);
                    try {
                        const clinicId = localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : 'local-default');
                        if (item.shared) {
                            await window.firebase.deleteDoc(
                                window.firebase.doc(window.firebase.db, 'globalBillingItems', String(id))
                            );
                        } else {
                            await window.firebase.deleteDoc(
                                window.firebase.doc(window.firebase.db, 'clinics', clinicId, 'billingItems', String(id))
                            );
                        }
                        // 觸發 billingMeta 通知其他裝置
                        touchBillingMeta({ operation: 'delete', itemId: String(id), scope: item.shared ? 'global' : clinicId }).catch(() => {});
                    } catch (error) {
                        console.error('刪除收費項目資料至雲端資料庫失敗:', error);
                    }
                    // 刪除後更新本地存儲，以便其他裝置下次載入時取得最新資料
                    try {
                        localStorage.setItem(G.getClinicScopedStorageKey('billingItems'), JSON.stringify(G.billingItems));
                    } catch (lsErrDel) {
                        console.warn('刪除收費項目後保存本地資料失敗:', lsErrDel);
                    }
                    const zhToastDel = `收費項目「${item.name}」已刪除！`;
                    const enToastDel = `Billing item "${item.name}" has been deleted!`;
                    G.showToast(langDel === 'en' ? enToastDel : zhToastDel, 'success');
                    displayBillingItems();
                }
            }
        }

        // 處方搜索功能
