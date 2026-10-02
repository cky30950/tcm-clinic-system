/* ============================================================
 * billing/items.js — 收費項目資料同步與管理 UI（Phase 5 子批 A）
 * ------------------------------------------------------------
 * realtime sync（stop/merge/ensure/initBillingItems）＋收費項目
 * 管理頁（load/filter/display/create/edit/save/delete）。
 * 共享狀態所有權仍在 system.js，經 G 讀寫。
 * ============================================================ */
import { G } from '../../lib/legacy.js';

        export function stopBillingItemsRealtimeSync() {
            try {
                if (typeof G.billingItemsGlobalUnsubscribe === 'function') {
                    G.billingItemsGlobalUnsubscribe();
                }
            } catch (_e) {}
            try {
                if (typeof G.billingItemsClinicUnsubscribe === 'function') {
                    G.billingItemsClinicUnsubscribe();
                }
            } catch (_e) {}
            G.billingItemsGlobalUnsubscribe = null;
            G.billingItemsClinicUnsubscribe = null;
            billingItemsRealtimeClinicId = null;
            billingItemsGlobalMap = new Map();
            billingItemsClinicMap = new Map();
        }
        // 掛載全域：logout() 位於外層作用域，需經 window 呼叫清理
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
        export async function ensureBillingItemsRealtimeSync() {
            await G.waitForFirebaseDb();
            const clinicId = localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : 'local-default');
            if (
                billingItemsRealtimeClinicId &&
                String(billingItemsRealtimeClinicId) === String(clinicId) &&
                typeof G.billingItemsGlobalUnsubscribe === 'function' &&
                typeof G.billingItemsClinicUnsubscribe === 'function'
            ) {
                return;
            }
            stopBillingItemsRealtimeSync();
            billingItemsRealtimeClinicId = clinicId;

            // 追蹤兩個 onSnapshot 的首次回調
            let globalFirstResolve = null;
            let clinicFirstResolve = null;
            const globalFirstPromise = new Promise(res => { globalFirstResolve = res; });
            const clinicFirstPromise = new Promise(res => { clinicFirstResolve = res; });

            G.billingItemsGlobalUnsubscribe = window.firebase.onSnapshot(
                window.firebase.collection(window.firebase.db, 'globalBillingItems'),
                (snap) => {
                    const next = new Map();
                    snap.forEach((docSnap) => {
                        const data = { id: docSnap.id, ...docSnap.data(), shared: true };
                        next.set(String(data.id), data);
                    });
                    billingItemsGlobalMap = next;
                    mergeBillingItemsFromRealtime();
                    if (globalFirstResolve) { const r = globalFirstResolve; globalFirstResolve = null; r(); }
                },
                (error) => {
                    console.error('監聽全域收費項目失敗:', error);
                    if (globalFirstResolve) { const r = globalFirstResolve; globalFirstResolve = null; r(); }
                }
            );
            G.billingItemsClinicUnsubscribe = window.firebase.onSnapshot(
                window.firebase.collection(window.firebase.db, 'clinics', clinicId, 'billingItems'),
                (snap) => {
                    const next = new Map();
                    snap.forEach((docSnap) => {
                        const data = { id: docSnap.id, ...docSnap.data(), shared: !!docSnap.data().shared };
                        next.set(String(data.id), data);
                    });
                    billingItemsClinicMap = next;
                    mergeBillingItemsFromRealtime();
                    if (clinicFirstResolve) { const r = clinicFirstResolve; clinicFirstResolve = null; r(); }
                },
                (error) => {
                    console.error('監聽診所收費項目失敗:', error);
                    if (clinicFirstResolve) { const r = clinicFirstResolve; clinicFirstResolve = null; r(); }
                }
            );

            // 等待兩個 onSnapshot 都至少回調一次，確保 billingItems 已初始化。
            // 加上超時保護，避免網路問題導致永久掛起。
            await Promise.race([
                Promise.all([globalFirstPromise, clinicFirstPromise]),
                new Promise(res => setTimeout(res, 5000))
            ]);
        }
        export async function initBillingItems(forceRefresh = false) {
            
            if (G.billingItemsLoaded && !forceRefresh) {
                try {
                    await ensureBillingItemsRealtimeSync();
                } catch (_syncErr) {}
                return;
            }
            
            if (!forceRefresh) {
                try {
                    const stored = localStorage.getItem(G.getClinicScopedStorageKey('billingItems'));
                    if (stored) {
                        const localData = JSON.parse(stored);
                        if (Array.isArray(localData)) {
                            G.billingItems = localData;
                            G.billingItemsLoaded = true;
                            try {
                                await ensureBillingItemsRealtimeSync();
                            } catch (_syncErr) {}
                            return;
                        }
                    }
                } catch (lsErr) {
                    console.warn('載入本地收費項目失敗:', lsErr);
                }
            }
            
            await G.waitForFirebaseDb();
            try {
                // ensureBillingItemsRealtimeSync() 會等待兩個 onSnapshot 首次回調，
                // mergeBillingItemsFromRealtime() 在回調中自動設定 billingItems 與 billingItemsLoaded。
                // 不再需要額外的 getDocs——onSnapshot 本身就會返回完整集合。
                await ensureBillingItemsRealtimeSync();
            } catch (error) {
                console.error('讀取/初始化收費項目資料失敗:', error);
            }
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
                        <div class="text-4xl mb-4">💰</div>
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
                consultation: { baseName: '診療費', icon: '🩺', items: [] },
                medicine: { baseName: '藥費', icon: '💊', items: [] },
                treatment: { baseName: '治療費', icon: '🔧', items: [] },
                other: { baseName: '其他', icon: '📋', items: [] },
                discount: { baseName: '折扣項目', icon: '💸', items: [] },
                package: { baseName: '套票項目', icon: '🎫', items: [] }
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
                                <span class="mr-2">${category.icon}</span>${translatedName} (${category.items.length})
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
                } catch (error) {
                    console.error('儲存收費項目至 Firestore 失敗:', error);
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
                const enMsgDel = `Are you sure you want to delete the billing item \"${item.name}\"?\n\nThis action cannot be undone!`;
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
                    } catch (error) {
                        console.error('刪除收費項目資料至 Firestore 失敗:', error);
                    }
                    // 刪除後更新本地存儲，以便其他裝置下次載入時取得最新資料
                    try {
                        localStorage.setItem(G.getClinicScopedStorageKey('billingItems'), JSON.stringify(G.billingItems));
                    } catch (lsErrDel) {
                        console.warn('刪除收費項目後保存本地資料失敗:', lsErrDel);
                    }
                    const zhToastDel = `收費項目「${item.name}」已刪除！`;
                    const enToastDel = `Billing item \"${item.name}\" has been deleted!`;
                    G.showToast(langDel === 'en' ? enToastDel : zhToastDel, 'success');
                    displayBillingItems();
                }
            }
        }

        // 處方搜索功能
