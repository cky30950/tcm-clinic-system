/* ============================================================
 * consultation/form.js — 診症表單：開方（多處方／劑量／天數／衝突
 * 檢查）與診症內收費（搜尋／加入／數量／折扣／預設診金／
 * 帶入上次開方與收費）（Phase 6 子批 A）。
 * 表單共享狀態所有權仍在 system.js，經 G 讀寫；
 * 套票撤銷與收費同步直接同域 import billing 模組。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { initBillingItems } from '../billing/items.js';
import { restorePackageUseMeta, undoPackageUse } from '../billing/packages.js';

        export function searchHerbsForPrescription() {
            const searchTerm = document.getElementById('prescriptionSearch').value.trim().toLowerCase();
            const resultsContainer = document.getElementById('prescriptionSearchResults');
            const resultsList = document.getElementById('prescriptionSearchList');
            
            if (searchTerm.length < 1) {
                // 當搜尋字串為空時隱藏結果容器，並同步隱藏任何殘留的提示框
                resultsContainer.classList.add('hidden');
                if (typeof G.hideTooltip === 'function') {
                    G.hideTooltip();
                }
                return;
            }
            
            // 搜索匹配的中藥材和方劑，並根據匹配程度排序
            let matchedItems = (Array.isArray(G.herbLibrary) ? G.herbLibrary : [])
                .filter(item => {
                    // 停用的中藥不出現在處方搜尋結果中
                    try {
                        if (typeof G.getHerbInventory === 'function') {
                            const inv = G.getHerbInventory(item.id);
                            if (inv && inv.disabled) {
                                return false;
                            }
                        }
                    } catch (_e) {
                        /* 若無法取得庫存資訊則忽略停用判斷 */
                    }
                    // 將各屬性轉為小寫以便比對
                    const lowerName = item.name ? item.name.toLowerCase() : '';
                    const lowerAlias = item.alias ? item.alias.toLowerCase() : '';
                    const lowerEnglish = item.englishName ? item.englishName.toLowerCase() : '';
                    const lowerEffects = item.effects ? item.effects.toLowerCase() : '';
                    // 包含名稱、別名、英文名或功效即可視為匹配
                    return (
                        lowerName.includes(searchTerm) ||
                        lowerAlias.includes(searchTerm) ||
                        lowerEnglish.includes(searchTerm) ||
                        lowerEffects.includes(searchTerm)
                    );
                })
                .map(item => {
                    // 計算匹配分數：名稱匹配優先，其次為別名、英文名，再次為功效
                    const lowerName = item.name ? item.name.toLowerCase() : '';
                    const lowerAlias = item.alias ? item.alias.toLowerCase() : '';
                    const lowerEnglish = item.englishName ? item.englishName.toLowerCase() : '';
                    const lowerEffects = item.effects ? item.effects.toLowerCase() : '';
                    let score = Infinity;
                    if (lowerName.includes(searchTerm)) {
                        score = lowerName.indexOf(searchTerm);
                    } else if (lowerAlias.includes(searchTerm)) {
                        score = 100 + lowerAlias.indexOf(searchTerm);
                    } else if (lowerEnglish.includes(searchTerm)) {
                        score = 200 + lowerEnglish.indexOf(searchTerm);
                    } else if (lowerEffects.includes(searchTerm)) {
                        score = 300 + lowerEffects.indexOf(searchTerm);
                    }
                    return { item, score };
                })
                .sort((a, b) => a.score - b.score)
                .map(obj => obj.item);
            // 只取前 10 個結果
            matchedItems = matchedItems.slice(0, 10);
            
            if (!matchedItems || matchedItems.length === 0) {
                resultsList.innerHTML = `
                    <div class="p-3 text-center text-gray-500 text-sm">
                        找不到符合條件的中藥材或方劑
                    </div>
                `;
                resultsContainer.classList.remove('hidden');
                // 若沒有任何匹配結果，也應當隱藏提示框，避免殘留
                if (typeof G.hideTooltip === 'function') {
                    G.hideTooltip();
                }
                return;
            }
            
            const showInventoryBalance = G.isClinicHerbInventoryEnabled();
            // 顯示搜索結果，移除劑量欄，並使用自訂 tooltip
            resultsList.innerHTML = matchedItems.map(item => {
                // 根據當前介面語言決定名稱顯示。若為英文介面且存在英譯名稱，優先使用英譯名稱；否則使用中文名稱。
                let displayName = item.name;
                try {
                    const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                    if (langSel && langSel.toLowerCase().startsWith('en') && item.englishName) {
                        displayName = item.englishName;
                    }
                } catch (_e) {
                    displayName = item.name;
                }
                // 翻譯類型名稱：使用 window.t 函式進行翻譯，預設為中文
                const typeLabelZh = item.type === 'herb' ? '中藥材' : '方劑';
                const typeLabel = (typeof window.t === 'function') ? window.t(typeLabelZh) : typeLabelZh;
                const bgColor = 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200';
                // 組合完整資訊作為 tooltip 內容，並進行編碼
                const details = [];
                details.push('名稱：' + item.name);
                if (item.alias) details.push('別名：' + item.alias);
                if (item.type === 'herb') {
                    if (item.nature) details.push('性味：' + item.nature);
                    if (item.meridian) details.push('歸經：' + item.meridian);
                }
                if (item.effects) details.push('功效：' + item.effects);
                if (item.indications) details.push('主治：' + item.indications);
                if (item.type === 'formula') {
                    if (item.composition) details.push('組成：' + item.composition.replace(/\n/g, '、'));
                    if (item.usage) details.push('用法：' + item.usage);
                }
                if (item.cautions) details.push('注意：' + item.cautions);
                const encoded = encodeURIComponent(details.join('\n'));
                // 取得庫存資料以顯示存量
                let inv = { quantity: 0, threshold: 0 };
                try {
                    if (typeof G.getHerbInventory === 'function') {
                        inv = G.getHerbInventory(item.id);
                    }
                } catch (_e) {
                    inv = { quantity: 0, threshold: 0 };
                }
                const qty = inv && typeof inv.quantity === 'number' ? inv.quantity : 0;
                const thr = inv && typeof inv.threshold === 'number' ? inv.threshold : 0;
                const unit = (inv && inv.unit) ? inv.unit : 'g';
                const factor = G.UNIT_FACTOR_MAP[unit] || 1;
                const qtyDisplay = (() => {
                    const val = qty / factor;
                    return parseFloat(val.toFixed(3)).toString();
                })();
                const rawUnitLabel = G.UNIT_LABEL_MAP[unit] || '克';
                const unitTranslated = (typeof window.t === 'function') ? window.t(rawUnitLabel) : rawUnitLabel;
                const remainLabel = (typeof window.t === 'function') ? window.t('餘量：') : '餘量：';
                const stockClass = qty <= thr ? 'text-red-600' : 'text-gray-600';
                const stockHtml = showInventoryBalance
                    ? `<div class="text-xs mt-1 ${stockClass}">${remainLabel} ${qtyDisplay}${unitTranslated}</div>`
                    : '';
                return `
                    <div class="p-3 ${bgColor} border rounded-lg cursor-pointer transition duration-200" data-tooltip="${encoded}"
                         onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))"
                         onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"
                         onclick="addToPrescription('${item.type}', ${item.id})">
                        <div class="text-center">
                            <div class="font-semibold text-gray-900 text-sm mb-1">${window.escapeHtml(displayName)}</div>
                            <div class="text-xs bg-white text-gray-600 px-2 py-1 rounded mb-2">${typeLabel}</div>
                            ${item.effects ? `<div class="text-xs text-gray-600 mt-1">${window.escapeHtml(item.effects.substring(0, 30))}${item.effects.length > 30 ? '...' : ''}</div>` : ''}
                            ${stockHtml}
                        </div>
                    </div>
                `;
            }).join('');
            resultsContainer.classList.remove('hidden');
        }
        
        // 多處方支援
        export function setActivePrescription(index) {
            if (index < 0 || index >= G.prescriptions.length) return;
            G.activePrescriptionIndex = index;
            G.selectedPrescriptionItems = G.prescriptions[G.activePrescriptionIndex].items;
            try {
                const m = G.prescriptions[G.activePrescriptionIndex] && G.prescriptions[G.activePrescriptionIndex].mode ? G.prescriptions[G.activePrescriptionIndex].mode : 'granule';
                if (m === 'granule' || m === 'slice') {
                    G.changeInventoryType(m);
                }
            } catch (_e) {}
            try {
                const searchEl = document.getElementById('prescriptionSearch');
                const query = searchEl && searchEl.value ? String(searchEl.value).trim() : '';
                if (query && query.length > 0) {
                    setTimeout(function () {
                        try { searchHerbsForPrescription(); } catch (_e2) {}
                    }, 300);
                }
            } catch (_e) {}
            updatePrescriptionDisplay();
            checkPrescriptionConflicts();
        }
        export function addPrescriptionSection() {
            const numerals = ['', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
            const idx = G.prescriptions.length;
            const defaultName = idx === 0 ? '處方' : `處方${numerals[idx] || (idx + 1)}`;
            let defaultFreq = 2;
            try {
                const fEl = document.getElementById('medicationFrequency');
                defaultFreq = fEl ? (parseInt(fEl.value) || 2) : 2;
            } catch (_e) {}
            const defaultMode = (typeof G.currentInventoryMode !== 'undefined' && (G.currentInventoryMode === 'slice' || G.currentInventoryMode === 'granule')) ? G.currentInventoryMode : 'granule';
            G.prescriptions.push({ name: defaultName, items: [], days: 5, freq: defaultFreq, mode: defaultMode });
            setActivePrescription(G.prescriptions.length - 1);
        }
        export function removePrescriptionSection() {
            if (G.prescriptions.length <= 1) {
                G.showToast('至少需要一個處方', 'warning');
                return;
            }
            G.prescriptions.splice(G.activePrescriptionIndex, 1);
            if (G.activePrescriptionIndex >= G.prescriptions.length) {
                G.activePrescriptionIndex = G.prescriptions.length - 1;
            }
            G.selectedPrescriptionItems = G.prescriptions[G.activePrescriptionIndex].items;
            updatePrescriptionDisplay();
            checkPrescriptionConflicts();
            // 若所有處方皆無內容，移除藥費
            try {
                const hasAnyItems = G.prescriptions.some(p => Array.isArray(p.items) && p.items.length > 0);
                if (!hasAnyItems) {
                    const medicineFeeItem = G.billingItems.find(item => 
                        item.active && item.category === 'medicine' &&
                        (item.name.includes('中藥') || item.name.includes('藥費') || item.name.includes('調劑'))
                    );
                    if (medicineFeeItem) {
                        const idx = G.selectedBillingItems.findIndex(b => b.id === medicineFeeItem.id);
                        if (idx !== -1) {
                            G.selectedBillingItems.splice(idx, 1);
                            updateBillingDisplay();
                        }
                    }
                }
            } catch (_e) {}
        }
        export function renamePrescription(index, newName) {
            if (index < 0 || index >= G.prescriptions.length) return;
            G.prescriptions[index].name = (newName || '').trim() || `處方${index + 1}`;
            updatePrescriptionDisplay();
        }
        export function updatePrescriptionModeAt(sectionIdx, newMode) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            if (newMode !== 'granule' && newMode !== 'slice') return;
            G.prescriptions[sectionIdx].mode = newMode;
            if (sectionIdx === G.activePrescriptionIndex) {
                try { G.changeInventoryType(newMode); } catch (_e) {}
                try {
                    const q = document.getElementById('prescriptionSearch');
                    if (q && q.value && q.value.trim().length > 0) {
                        setTimeout(() => { try { searchHerbsForPrescription(); } catch (_e) {} }, 300);
                    }
                } catch (_e) {}
            }
            updatePrescriptionDisplay();
        }
        export function clearActivePrescriptionItems() {
            G.prescriptions[G.activePrescriptionIndex].items = [];
            G.selectedPrescriptionItems = G.prescriptions[G.activePrescriptionIndex].items;
            updatePrescriptionDisplay();
            checkPrescriptionConflicts();
            updatePrescriptionTypeSelectStatus();
        }
        export function setActivePrescriptionItems(itemsArray) {
            G.prescriptions[G.activePrescriptionIndex].items = Array.isArray(itemsArray) ? itemsArray : [];
            G.selectedPrescriptionItems = G.prescriptions[G.activePrescriptionIndex].items;
            updatePrescriptionDisplay();
            checkPrescriptionConflicts();
            updatePrescriptionTypeSelectStatus();
        }
        export function getTotalMedicationDays() {
            let total = 0;
            G.prescriptions.forEach(p => {
                const d = parseInt(p.days) || 0;
                total += d;
            });
            return Math.max(0, total);
        }
        
        // 存儲已選擇的收費項目

        // ----------------------------------------------------------------------------------------
        // 禁忌配伍設定
        //
        // 中醫處方中存在某些藥材彼此相反或相畏的情況，即所謂「十八反」與「十九畏」。
        // 這裡定義一張禁忌配伍對照表，利用藥材名稱的包含關係來檢查是否出現禁忌組合。
        // 為簡便起見，若名稱包含在以下任何鍵或值中，則視為同一類別。例如「附子」屬於烏頭類；
        // 「川烏」「草烏」亦視為烏頭，同樣與貝母、半夏、瓜蔞等藥相斥。
        // 此表採對稱設計，每個藥材鍵的值為一組與之禁忌的藥材名稱陣列。
        const FORBIDDEN_MAP = {
            // 甘草類禁忌：甘草不可與甘遂、大戟、芫花、海藻同用
            '甘草': ['甘遂', '大戟', '芫花', '海藻'],
            '甘遂': ['甘草'],
            '大戟': ['甘草'],
            '芫花': ['甘草'],
            '海藻': ['甘草'],
            // 烏頭類（包括附子、川烏、草烏）禁忌：不可與貝母、瓜蔞、半夏、白蘞、白芨、天花粉等同用
            '烏頭': ['貝母', '川貝母', '浙貝母', '瓜蔞', '瓜蔞皮', '瓜蔞仁', '天花粉', '半夏', '白蘞', '白芨'],
            '附子': ['貝母', '川貝母', '浙貝母', '瓜蔞', '瓜蔞皮', '瓜蔞仁', '天花粉', '半夏', '白蘞', '白芨'],
            '川烏': ['犀角', '貝母', '川貝母', '浙貝母', '瓜蔞', '瓜蔞皮', '瓜蔞仁', '天花粉', '半夏', '白蘞', '白芨'],
            '草烏': ['犀角', '貝母', '川貝母', '浙貝母', '瓜蔞', '瓜蔞皮', '瓜蔞仁', '天花粉', '半夏', '白蘞', '白芨'],
            // 上述禁忌對應對稱關係
            '貝母': ['烏頭', '附子'],
            '川貝母': ['烏頭', '附子'],
            '浙貝母': ['烏頭', '附子'],
            '瓜蔞': ['烏頭', '附子'],
            '瓜蔞皮': ['烏頭', '附子'],
            '瓜蔞仁': ['烏頭', '附子'],
            '天花粉': ['烏頭', '附子'],
            '半夏': ['烏頭', '附子'],
            '白蘞': ['烏頭', '附子'],
            '白芨': ['烏頭', '附子'],
            '犀角': ['川烏', '草烏'],
            // 藜蘆禁忌：藜蘆不可與人參、沙參、丹參、玄參、苦參、細辛、芍藥同用
            '藜蘆': ['人參', '沙參', '丹參', '玄參', '苦參', '細辛', '芍藥'],
            '人參': ['藜蘆', '五靈脂'],
            '沙參': ['藜蘆'],
            '丹參': ['藜蘆'],
            '玄參': ['藜蘆'],
            '苦參': ['藜蘆'],
            '細辛': ['藜蘆'],
            '芍藥': ['藜蘆'],
            // 硫黃與朴硝相畏
            '硫黃': ['朴硝'],
            '朴硝': ['硫黃'],
            // 水銀與砒霜相畏
            '水銀': ['砒霜'],
            '砒霜': ['水銀'],
            // 狼毒與密陀僧相畏
            '狼毒': ['密陀僧'],
            '密陀僧': ['狼毒'],
            // 巴豆與牽牛子相畏
            '巴豆': ['牽牛子'],
            '牽牛子': ['巴豆'],
            // 丁香與鬱金相畏
            '丁香': ['鬱金'],
            '鬱金': ['丁香'],
            // 牙硝與三棱（又稱京三棱、三梭）相畏
            '牙硝': ['三棱', '京三棱', '三梭'],
            '三棱': ['牙硝'],
            '京三棱': ['牙硝'],
            '三梭': ['牙硝'],
            // 官桂與石脂相畏
            '官桂': ['石脂'],
            '石脂': ['官桂'],
            // 五靈脂與人參相畏
            '五靈脂': ['人參']
        };

        /**
         * 判斷兩個藥材名稱是否構成禁忌配伍。
         * 以包含關係進行比對：若名稱包含指定關鍵字即視為匹配。
         * @param {string} nameA
         * @param {string} nameB
         * @returns {boolean} true 表示構成禁忌
         */
        export function isForbiddenCombination(nameA, nameB) {
            if (!nameA || !nameB) return false;
            // 迭代地圖中的每個鍵值對
            for (const key in FORBIDDEN_MAP) {
                if (!Object.prototype.hasOwnProperty.call(FORBIDDEN_MAP, key)) continue;
                const forbiddenList = FORBIDDEN_MAP[key];
                // 若第一個名稱包含鍵，且第二個名稱包含列表中的任何一個項目
                if (nameA.includes(key)) {
                    for (const forb of forbiddenList) {
                        if (nameB.includes(forb)) {
                            return true;
                        }
                    }
                }
                // 互換比對：若第二個名稱包含鍵，且第一個名稱包含列表中的任何一個項目
                if (nameB.includes(key)) {
                    for (const forb of forbiddenList) {
                        if (nameA.includes(forb)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        /**
         * 顯示或清除處方禁忌配伍錯誤訊息。
         * 當 message 為空字串或 null 時，將隱藏錯誤區域。
         * 透過此函式可在頁面固定位置呈現錯誤提醒，不使用彈窗。
         * @param {string} message 錯誤訊息；空值時隱藏提示
         */
        export function displayPrescriptionError(message) {
            try {
                const errorEl = document.getElementById('prescriptionError');
                if (!errorEl) return;
                if (message) {
                    errorEl.textContent = message;
                    errorEl.classList.remove('hidden');
                } else {
                    errorEl.textContent = '';
                    errorEl.classList.add('hidden');
                }
            } catch (_e) {
                // 若元素不存在，忽略錯誤
            }
        }

        /**
         * 檢查目前處方中的藥材是否存在禁忌配伍。
         * 若存在相斥的藥材，會將第一組相斥藥對顯示於錯誤區域；
         * 若無禁忌配伍，則清除錯誤提示。
         */
        export function checkPrescriptionConflicts() {
            try {
                // 如沒有或僅有一個項目，無需檢查
                if (!Array.isArray(G.selectedPrescriptionItems) || G.selectedPrescriptionItems.length < 2) {
                    displayPrescriptionError('');
                    return;
                }
                // 檢查所有兩兩藥材是否有禁忌，收集所有禁忌組合
                const conflictMessages = [];
                for (let i = 0; i < G.selectedPrescriptionItems.length; i++) {
                    const nameA = G.selectedPrescriptionItems[i].name || '';
                    for (let j = i + 1; j < G.selectedPrescriptionItems.length; j++) {
                        const nameB = G.selectedPrescriptionItems[j].name || '';
                        if (isForbiddenCombination(nameA, nameB)) {
                            const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                            const zhMsg = `藥材${nameA}與${nameB}存在禁忌配伍，請注意使用！`;
                            const enMsg = `${nameA} is incompatible with ${nameB} in the prescription; please use with caution.`;
                            const msg = (langSel && langSel.toLowerCase().startsWith('en')) ? enMsg : zhMsg;
                            conflictMessages.push(msg);
                        }
                    }
                }
                if (conflictMessages.length > 0) {
                    // 將所有禁忌訊息使用換行符號串接，避免重複顯示相同訊息
                    const combined = Array.from(new Set(conflictMessages)).join('\n');
                    displayPrescriptionError(combined);
                } else {
                    // 若沒有任何禁忌，清除提示
                    displayPrescriptionError('');
                }
            } catch (_e) {
                // 發生異常時，隱藏錯誤提示
                displayPrescriptionError('');
            }
        }

        /**
         * 根據當前處方是否有內容決定庫存類型下拉選單是否可用。
         * 若處方中已有藥材或方劑，則禁用選擇以防止切換不同類別；
         * 當處方為空時，重新啟用選擇。
         */
        export function updatePrescriptionTypeSelectStatus() {
            try {
                const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                const zhTitle = '清空藥品才能選擇';
                const enTitle = 'Clear all medicines to switch';
                const titleMsg = (langSel && langSel.toLowerCase().startsWith('en')) ? enTitle : zhTitle;
                G.prescriptions.forEach((p, idx) => {
                    const sel = document.getElementById('prescriptionModeSelect-' + idx);
                    if (!sel) return;
                    const hasItems = Array.isArray(p.items) && p.items.length > 0;
                    if (hasItems) {
                        sel.disabled = true;
                        sel.classList.add('opacity-50');
                        sel.classList.add('cursor-not-allowed');
                        sel.style.color = '#9ca3af';
                        sel.setAttribute('title', titleMsg);
                    } else {
                        sel.disabled = false;
                        sel.classList.remove('opacity-50');
                        sel.classList.remove('cursor-not-allowed');
                        sel.style.color = '';
                        sel.removeAttribute('title');
                    }
                });
                if (G.prescriptions.length === 1) {
                    const c = document.getElementById('singlePrescriptionModeContainer');
                    const sel2 = c ? c.querySelector('#singlePrescriptionModeSelect') : null;
                    const hasItems2 = Array.isArray(G.prescriptions[0].items) && G.prescriptions[0].items.length > 0;
                    if (sel2) {
                        if (hasItems2) {
                            sel2.disabled = true;
                            sel2.classList.add('opacity-50');
                            sel2.classList.add('cursor-not-allowed');
                            sel2.style.color = '#9ca3af';
                            sel2.setAttribute('title', titleMsg);
                        } else {
                            sel2.disabled = false;
                            sel2.classList.remove('opacity-50');
                            sel2.classList.remove('cursor-not-allowed');
                            sel2.style.color = '';
                            sel2.removeAttribute('title');
                        }
                    }
                }
            } catch (_e) {}
        }
        
        export function updateSinglePrescriptionModePlacement() {
            try {
                const container = document.getElementById('singlePrescriptionModeContainer');
                if (!container) return;
                if (G.prescriptions.length === 1) {
                    const mode = (G.prescriptions[0] && G.prescriptions[0].mode === 'slice') ? 'slice' : 'granule';
                    container.innerHTML = `
                        <select id="singlePrescriptionModeSelect" class="px-3 py-1 border border-yellow-300 rounded text-sm bg-white"
                                onchange="updatePrescriptionModeAt(0, this.value)">
                            <option value="granule" ${mode === 'granule' ? 'selected' : ''}>${typeof window.t === 'function' ? window.t('顆粒沖劑') : '顆粒沖劑'}</option>
                            <option value="slice" ${mode === 'slice' ? 'selected' : ''}>${typeof window.t === 'function' ? window.t('飲片') : '飲片'}</option>
                        </select>
                    `;
                } else {
                    container.innerHTML = '';
                }
            } catch (_e) {}
        }
        
        // 添加到處方內容
        export function addToPrescription(type, itemId) {
            // 取得目標藥材資料
            const item = G.herbLibrary.find(h => h.id === itemId);
            if (!item) return null;

            // 不阻止禁忌配伍的藥材加入處方，但稍後會在全局檢查中顯示錯誤提示
            
            // 檢查是否已經添加過
            const existingIndex = G.selectedPrescriptionItems.findIndex(p => p.id === itemId);
            if (existingIndex !== -1) {
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const zhMsg = `${item.name} 已經在處方中！`;
                    const enMsg = `${item.name} is already in the prescription!`;
                    const msg = lang === 'en' ? enMsg : zhMsg;
                    G.showToast(msg, 'warning');
                }
                return null;
            }
            
            // 添加到已選擇項目
            const prescriptionItem = {
                id: itemId,
                type: type,
                name: item.name,
                dosage: type === 'herb' ? (item.dosage || '1g') : null,
                customDosage: (() => {
                    const inv = G.getHerbInventory(item.id);
                    const dose = G.resolvePrescriptionDefaultDosage(item, inv);
                    return String(dose);
                })(),
                composition: type === 'formula' ? item.composition : null,
                effects: item.effects
            };
            
            G.selectedPrescriptionItems.push(prescriptionItem);

            // 檢查是否有禁忌配伍並更新錯誤提示
            checkPrescriptionConflicts();

            // 更新顯示
            updatePrescriptionDisplay();

            // 根據是否有處方內容決定是否允許切換庫存類型
            updatePrescriptionTypeSelectStatus();
            
            // 如首次加入任何處方項目，依加總天數自動添加/更新藥費
            try {
                const hasAnyItems = G.prescriptions.some(p => Array.isArray(p.items) && p.items.length > 0);
                if (hasAnyItems) {
                    updateMedicineFeeByDays(getTotalMedicationDays());
                }
            } catch (_e) {}
            
            // 清除搜索
            clearPrescriptionSearch();
            
            {
                const lang = localStorage.getItem('lang') || 'zh';
                // Determine the labels for herb/formula based on language.
                const zhLabel = type === 'herb' ? '中藥材' : '方劑';
                const enLabel = type === 'herb' ? 'herb' : 'formula';
                // Choose the display name for the toast: in English mode use the englishName
                // if provided; otherwise fall back to the Chinese name. In Chinese mode always
                // use the Chinese name.  Do not attempt to translate the herb name via the
                // generic t() function because herbs/formula names are proper nouns and
                // should remain unchanged.
                const displayNameEn = item && item.englishName ? item.englishName : item.name;
                const displayNameZh = item.name;
                const zhMsg = `已添加${zhLabel}：${displayNameZh}`;
                const enMsg = `Added ${enLabel}: ${displayNameEn}`;
                const msg = lang && lang.toLowerCase().startsWith('en') ? enMsg : zhMsg;
                G.showToast(msg, 'success');
            }
            return prescriptionItem;
        }
        

        
        // 更新處方顯示
        export function updatePrescriptionDisplay() {
            // #region debug-point A1:prescription-render
            try { window.__dbgSeq = (window.__dbgSeq || 0) + 1; fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"edit-record-blank-load",runId:"pre",hypothesisId:"A",location:"form.js:updatePrescriptionDisplay",msg:"[DEBUG] updatePrescriptionDisplay called",data:{seq:window.__dbgSeq,sections:G.prescriptions.length,items:(G.prescriptions||[]).reduce((n,p)=>n+((p&&p.items)?p.items.length:0),0),formHidden:(function(){const f=document.getElementById('consultationForm');return f?f.classList.contains('hidden'):null;})()},ts:Date.now()})}).catch((_e)=>{}); } catch(_e){}
            // #endregion
            const containerAll = document.getElementById('prescriptionsContainer');
            const hiddenTextarea = document.getElementById('formPrescription');
            if (!containerAll) return;
            const showInventoryBalance = G.isClinicHerbInventoryEnabled();
            const formatPrescriptionNumber = (num) => {
                const n = Number(num);
                if (!Number.isFinite(n)) return '0';
                return parseFloat(n.toFixed(2)).toString();
            };
            const normalizeCompositionText = (text) => {
                return String(text || '')
                    .replace(/[（(][^）)]*[）)]/g, ' ')
                    .replace(/\d+(?:\.\d+)?\s*(?:g|克|mg|kg|ml|錢|兩|斤|包|丸|片|顆|匙|袋|份)?/gi, ' ')
                    .replace(/[：:]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };
            const parseFormulaIngredientCount = (formulaItem, fullItem) => {
                const raw = (formulaItem && formulaItem.composition) || (fullItem && fullItem.composition) || '';
                if (!raw) return 1;
                const extractedByDose = [];
                const doseRegex = /([^、，,\n;；]+?)\s*\d+(?:\.\d+)?\s*(?:g|克|mg|kg|ml|錢|兩|斤|包|丸|片|顆|匙|袋|份)?/gi;
                let match;
                while ((match = doseRegex.exec(String(raw))) !== null) {
                    const name = normalizeCompositionText(match[1]);
                    if (name) extractedByDose.push(name);
                }
                if (extractedByDose.length > 0) {
                    return extractedByDose.length;
                }
                const parts = String(raw)
                    .split(/[、，,\n;；]/)
                    .map(part => normalizeCompositionText(part))
                    .filter(Boolean);
                return parts.length > 0 ? parts.length : 1;
            };
            const allSectionsHtml = G.prescriptions.map((section, sIdx) => {
                const isSingle = G.prescriptions.length === 1;
                const leftControls = `
                                ${!isSingle ? `<input type="text" value="${window.escapeHtml(section.name)}"
                                       onchange="renamePrescription(${sIdx}, this.value)"
                                       class="border border-gray-300 rounded px-2 py-1 text-sm w-40">` : ``}
                                ${!isSingle ? `<button type="button" onclick="setActivePrescription(${sIdx})"
                                        class="${sIdx === G.activePrescriptionIndex ? 'bg-blue-600' : 'bg-gray-300'} text-white text-xs px-2 py-1 rounded">
                                    ${sIdx === G.activePrescriptionIndex ? '編輯中' : '設為編輯'}
                                </button>` : ``}
                                ${!isSingle ? `<select id="prescriptionModeSelect-${sIdx}" onchange="updatePrescriptionModeAt(${sIdx}, this.value)"
                                        class="px-2 py-1 border border-yellow-300 rounded text-xs bg-white prescription-mode-select">
                                    <option value="granule" ${section.mode === 'slice' ? '' : 'selected'}>${typeof window.t === 'function' ? window.t('顆粒沖劑') : '顆粒沖劑'}</option>
                                    <option value="slice" ${section.mode === 'slice' ? 'selected' : ''}>${typeof window.t === 'function' ? window.t('飲片') : '飲片'}</option>
                                </select>` : ``}
                `;
                const rightControls = isSingle ? `` : `<button onclick="removePrescriptionSectionAt(${sIdx})" class="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm flex items-center justify-center"><i data-lucide="x" class="w-4 h-4 pointer-events-none"></i></button>`;
                const headerHtml = `
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                ${leftControls}
                            </div>
                            <div class="flex items-center">
                                ${rightControls}
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-sm font-medium text-yellow-800">服藥天數</span>
                            <button onclick="updateMedicationDaysAt(${sIdx}, -1)" class="w-7 h-7 bg-yellow-500 text-white rounded-full text-sm hover:bg-yellow-600 transition duration-200">-</button>
                            <input type="number" id="medicationDays-${sIdx}" value="${parseInt(section.days) || 5}" min="1" max="30" 
                                   class="w-14 px-2 py-1 text-center border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                                   onchange="updateMedicationDaysFromInputAt(${sIdx})" onclick="this.select()">
                            <button onclick="updateMedicationDaysAt(${sIdx}, 1)" class="w-7 h-7 bg-yellow-500 text-white rounded-full text-sm hover:bg-yellow-600 transition duration-200">+</button>
                            <span class="text-sm text-yellow-800">天</span>
                            <span class="ml-3 text-sm font-medium text-yellow-800">每日次數</span>
                            <button onclick="updateMedicationFrequencyAt(${sIdx}, -1)" class="w-7 h-7 bg-yellow-500 text-white rounded-full text-sm hover:bg-yellow-600 transition duration-200">-</button>
                            <input type="number" id="medicationFreq-${sIdx}" value="${parseInt(section.freq) || 2}" min="1" max="6" 
                                   class="w-14 px-2 py-1 text-center border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                                   onchange="updateMedicationFrequencyFromInputAt(${sIdx})" onclick="this.select()">
                            <button onclick="updateMedicationFrequencyAt(${sIdx}, 1)" class="w-7 h-7 bg-yellow-500 text-white rounded-full text-sm hover:bg-yellow-600 transition duration-200">+</button>
                            <span class="text-sm text-yellow-800">次/日</span>
                        </div>
                    </div>
                `;
                const itemsArray = Array.isArray(section.items) ? section.items : [];
                const sectionStats = itemsArray.reduce((acc, item) => {
                    const fullItemForStats = (Array.isArray(G.herbLibrary) ? G.herbLibrary : []).find(h => h && h.id === item.id);
                    if (item && item.type === 'formula') {
                        acc.totalSingleHerbCount += parseFormulaIngredientCount(item, fullItemForStats);
                    } else {
                        acc.totalSingleHerbCount += 1;
                    }
                    const dosageRaw = item && (item.customDosage || item.dosage || (item.type === 'formula' ? '5' : '1'));
                    const dosageNum = parseFloat(dosageRaw);
                    if (Number.isFinite(dosageNum) && dosageNum > 0) {
                        acc.totalGrams += dosageNum;
                    }
                    return acc;
                }, { totalSingleHerbCount: 0, totalGrams: 0 });
        const itemsHtml = itemsArray.length === 0
            ? `<div class="text-sm text-gray-500 text-center py-4">此處方尚未添加項目，請使用上方搜索功能</div>`
            : itemsArray.map((item, index) => {
                const bgColor = 'bg-yellow-50 border-yellow-200';
                // 從 herbLibrary 中找到完整的藥材或方劑資料
                const fullItem = (Array.isArray(G.herbLibrary) ? G.herbLibrary : []).find(h => h && h.id === item.id);
                        // 構建詳細資訊內容
                        const details = [];
                        if (fullItem) {
                            details.push('名稱：' + (fullItem.name || ''));
                            if (fullItem.alias) details.push('別名：' + fullItem.alias);
                            if (fullItem.type === 'herb') {
                                if (fullItem.nature) details.push('性味：' + fullItem.nature);
                                if (fullItem.meridian) details.push('歸經：' + fullItem.meridian);
                            }
                            if (fullItem.effects) details.push('功效：' + fullItem.effects);
                            if (fullItem.indications) details.push('主治：' + fullItem.indications);
                            if (fullItem.type === 'formula') {
                                if (fullItem.composition) details.push('組成：' + fullItem.composition.replace(/\n/g, '、'));
                                if (fullItem.usage) details.push('用法：' + fullItem.usage);
                            }
                            if (fullItem.cautions) details.push('注意：' + fullItem.cautions);
                        }
                        const encoded = encodeURIComponent(details.join('\n'));
                        // 決定名稱顯示。英語介面且有英譯名稱時，顯示英譯名稱；否則顯示中文名稱
                        let displayName = item.name;
                        try {
                            const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                            if (langSel && langSel.toLowerCase().startsWith('en') && fullItem && fullItem.englishName) {
                                displayName = fullItem.englishName;
                            }
                        } catch (_e) {
                            displayName = item.name;
                        }
                        // 決定類型標籤：依語言選擇英文或中文
                        let typeLabel;
                        try {
                            const langSel2 = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                            if (langSel2 && langSel2.toLowerCase().startsWith('en')) {
                                typeLabel = item.type === 'formula' ? 'Formula' : 'Herb';
                            } else {
                                typeLabel = item.type === 'formula' ? '方劑' : '中藥材';
                            }
                        } catch (_err) {
                            typeLabel = item.type === 'formula' ? '方劑' : '中藥材';
                        }
                        // 建立 HTML，並綁定 tooltip 事件於整個項目容器
                        return `
                            <div class="${bgColor} border rounded-lg p-3 cursor-pointer"
                                 data-tooltip="${encoded}"
                                 onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))"
                                 onmousemove="moveTooltip(event)"
                                 onmouseleave="hideTooltip()">
                                <div class="flex items-center">
                                    <div class="flex-1">
                                        <div class="font-semibold text-gray-900">${window.escapeHtml(displayName)}</div>
                                        ${item.type === 'formula' ? `<div class="text-xs text-gray-600">${typeLabel}</div>` : ''}
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        ${(() => {
                                            if (!showInventoryBalance) {
                                                return '';
                                            }
                                            try {
                                                // 依處方模式選擇對應庫存快取
                                                const isSlice = section && section.mode === 'slice';
                                                const invObj = isSlice ? G.herbInventorySlice : G.herbInventoryGranule;
                                                const invRaw = invObj && invObj[String(item.id)];
                                                const inv = invRaw ? invRaw : { quantity: 0, unit: 'g' };
                                                const qty = inv && typeof inv.quantity === 'number' ? inv.quantity : 0;
                                                const unit = inv && inv.unit ? inv.unit : 'g';
                                                const factor = G.UNIT_FACTOR_MAP[unit] || 1;
                                                const qtyDisplay = (() => {
                                                    const val = qty / factor;
                                                    return parseFloat(val.toFixed(3)).toString();
                                                })();
                                                const rawUnitLabel = G.UNIT_LABEL_MAP[unit] || '克';
                                                const unitTranslated = (typeof window.t === 'function') ? window.t(rawUnitLabel) : rawUnitLabel;
                                                const remainLabel = (typeof window.t === 'function') ? window.t('餘量：') : '餘量：';
                                                return `<span class="text-xs text-gray-400">${remainLabel} ${qtyDisplay}${unitTranslated}</span>`;
                                            } catch (_e) {
                                                const remainLabel = (typeof window.t === 'function') ? window.t('餘量：') : '餘量：';
                                                const defaultUnit = (typeof window.t === 'function') ? window.t('克') : '克';
                                                return `<span class="text-xs text-gray-400">${remainLabel} 0${defaultUnit}</span>`;
                                            }
                                        })()}
                                        <input type="number"
                                               value="${window.escapeHtml(String(item.customDosage || (item.type === 'herb' ? '1' : '5')))}"
                                               min="0.5"
                                               max="100"
                                               step="0.5"
                                               class="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-center"
                                               oninput="updatePrescriptionDosageLiveAt(${sIdx}, ${index}, this.value)"
                                               onchange="updatePrescriptionDosageAt(${sIdx}, ${index}, this.value)"
                                               onclick="this.select()">
                                        ${(() => {
                                            try {
                                                const isSlice2 = section && section.mode === 'slice';
                                                const invObj2 = isSlice2 ? G.herbInventorySlice : G.herbInventoryGranule;
                                                const invRaw2 = invObj2 && invObj2[String(item.id)];
                                                const unit2 = invRaw2 && invRaw2.unit ? invRaw2.unit : 'g';
                                                // 從映射中取得原始單位標籤（中文），不存在則默認為『克』
                                                const rawUnit2 = (typeof G.UNIT_LABEL_MAP !== 'undefined' && G.UNIT_LABEL_MAP && G.UNIT_LABEL_MAP[unit2]) ? G.UNIT_LABEL_MAP[unit2] : '克';
                                                // 使用翻譯函式將單位標籤轉換為當前語言
                                                const unitTranslated2 = (typeof window.t === 'function') ? window.t(rawUnit2) : rawUnit2;
                                            return `<span class="text-sm text-gray-600 font-medium">${unitTranslated2}</span>`;
                                            } catch (_err2) {
                                                // 若發生錯誤，回傳預設單位『克』
                                                const defaultUnit2 = (typeof window.t === 'function') ? window.t('克') : '克';
                                                return `<span class="text-sm text-gray-600 font-medium">${defaultUnit2}</span>`;
                                            }
                                        })()}
                                    </div>
                                    <button onclick="removePrescriptionItemAt(${sIdx}, ${index})" class="text-red-500 hover:text-red-700 font-bold text-lg px-2">×</button>
                                </div>
                            </div>
                        `;
                    }).join('') 
                const sectionContainer = `
                    <div class="border border-gray-300 rounded-lg p-3 bg-gray-50 space-y-3">
                        ${headerHtml}
                        <div class="space-y-3">
                            ${itemsHtml}
                        </div>
                        ${itemsArray.length > 0 ? `
                        <div class="flex items-center justify-between text-xs text-gray-600 pt-1">
                            <span>總藥數：${sectionStats.totalSingleHerbCount} 味</span>
                            <span>總克數：${formatPrescriptionNumber(sectionStats.totalGrams)} 克</span>
                        </div>` : ''}
                    </div>
                `;
                return sectionContainer;
            }).join('');
            containerAll.innerHTML = allSectionsHtml;
            try { updateSinglePrescriptionModePlacement(); } catch (_e) {}
            // 更新隱藏文本域（合併所有處方）
            let prescriptionText = '';
            G.prescriptions.forEach(section => {
                (section.items || []).forEach(item => {
                // 使用項目的 customDosage（如果有），否則根據類型給予預設值：中藥材 1、方劑 5。
                const dosage = item.customDosage || (item.type === 'herb' ? '1' : '5');
                // 根據中藥庫中的單位設定來顯示正確的基礎單位；若沒有對應單位則默認為 'g'
                let unitLabelForText = '';
                try {
                    if (typeof G.getHerbInventory === 'function') {
                        const inv3 = G.getHerbInventory(item.id);
                        // 直接使用庫存的基礎單位（如 g、jin、liang 等）作為儲存單位，不再翻譯為中文，
                        // 以便後續解析保持一致
                        unitLabelForText = (inv3 && inv3.unit) ? inv3.unit : 'g';
                    } else {
                        // 若無法取得 getHerbInventory 函式，預設顯示為 'g'
                        unitLabelForText = 'g';
                    }
                } catch (_unitErr) {
                    // 發生錯誤時仍使用預設單位 'g'
                    unitLabelForText = 'g';
                }
                // 組合為單行文字，以基礎單位結尾（例如 3g）
                prescriptionText += `${item.name} ${dosage}${unitLabelForText}\n`;
                });
            });
            hiddenTextarea.value = prescriptionText.trim();

            // 更新庫存類型選單狀態（啟用或禁用）。
            // 呼叫此函式以確保在處方內容變化後，顆粒/飲片切換選單能正確更新。
            try {
                if (typeof updatePrescriptionTypeSelectStatus === 'function') {
                    updatePrescriptionTypeSelectStatus();
                }
            } catch (_e) {
                /* 忽略任何錯誤以避免影響其他功能 */
            }
            G.queueConsultationSymptomsDraftSave();
        }
        
        // 依特定處方更新服藥天數
        export function updateMedicationDaysAt(sectionIdx, change) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            const current = parseInt(G.prescriptions[sectionIdx].days) || 5;
            const newDays = Math.max(1, Math.min(30, current + change));
            G.prescriptions[sectionIdx].days = newDays;
            updatePrescriptionDisplay();
            updateMedicineFeeByDays(getTotalMedicationDays());
        }
        // 舊介面包裝：更新目前編輯處方的天數
        export function updateMedicationDays(change) { updateMedicationDaysAt(G.activePrescriptionIndex, change); }
        
        // 依特定處方更新每日次數
        export function updateMedicationFrequencyAt(sectionIdx, change) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            const current = parseInt(G.prescriptions[sectionIdx].freq) || 2;
            const next = Math.max(1, Math.min(6, current + change));
            G.prescriptions[sectionIdx].freq = next;
            updatePrescriptionDisplay();
        }
        // 舊介面包裝：更新目前編輯處方的每日次數
        export function updateMedicationFrequency(change) { updateMedicationFrequencyAt(G.activePrescriptionIndex, change); }
        // 每日次數輸入框直接變更（依處方）
        export function updateMedicationFrequencyFromInputAt(sectionIdx) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            const inputEl = document.getElementById('medicationFreq-' + sectionIdx);
            const v = parseInt(inputEl && inputEl.value) || 2;
            const valid = Math.max(1, Math.min(6, v));
            if (inputEl && valid !== v) inputEl.value = valid;
            G.prescriptions[sectionIdx].freq = valid;
            updatePrescriptionDisplay();
        }
        
        // 根據開藥天數自動更新藥費（傳入加總天數）
        export function updateMedicineFeeByDays(days) {
            // 只有在有處方內容時才自動更新藥費
            const hasAnyItems = G.prescriptions.some(p => Array.isArray(p.items) && p.items.length > 0);
            if (!hasAnyItems) {
                return;
            }
            
            // 尋找中藥調劑費項目
            const medicineFeeItem = G.billingItems.find(item => 
                item.active && 
                item.category === 'medicine' && 
                (item.name.includes('中藥') || item.name.includes('藥費') || item.name.includes('調劑'))
            );
            
            if (!medicineFeeItem) {
                return; // 如果沒有找到藥費項目，不進行自動更新
            }
            
            // 查找現有的藥費項目
            const existingMedicineFeeIndex = G.selectedBillingItems.findIndex(item => 
                item.id === medicineFeeItem.id
            );
            
            if (existingMedicineFeeIndex !== -1) {
                // 如果藥費天數沒有變化，不更新也不顯示通知
                if (G.selectedBillingItems[existingMedicineFeeIndex].quantity === days) {
                    return;
                }
                // 更新現有藥費項目的數量為天數
                G.selectedBillingItems[existingMedicineFeeIndex].quantity = days;
                updateBillingDisplay();
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const zhMsg = `已更新藥費：${medicineFeeItem.name} x${days}天`;
                    const enMsg = `Updated medicine fee: ${medicineFeeItem.name} x${days} days`;
                    const msg = lang === 'en' ? enMsg : zhMsg;
                    G.showToast(msg, 'info');
                }
            } else {
                // 如果沒有藥費項目，自動添加
                const billingItem = {
                    id: medicineFeeItem.id,
                    name: medicineFeeItem.name,
                    category: medicineFeeItem.category,
                    price: medicineFeeItem.price,
                    unit: medicineFeeItem.unit,
                    description: medicineFeeItem.description,
                    quantity: days,
                    // 預設藥費可參與折扣
                    includedInDiscount: true
                };
                G.selectedBillingItems.push(billingItem);
                updateBillingDisplay();
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const zhMsg = `已自動添加藥費：${medicineFeeItem.name} x${days}天`;
                    const enMsg = `Auto-added medicine fee: ${medicineFeeItem.name} x${days} days`;
                    const msg = lang === 'en' ? enMsg : zhMsg;
                    G.showToast(msg, 'info');
                }
            }
        }
        export function getMedicineFeeDaysFromSelected() {
            const item = G.selectedBillingItems.find(it => it && it.category === 'medicine' && (it.name.includes('中藥') || it.name.includes('藥費') || it.name.includes('調劑')));
            return item ? (parseInt(item.quantity) || 0) : 0;
        }
        export function syncMedicationDaysWithMedicineFee() {
            const hasAnyItems = G.prescriptions.some(p => Array.isArray(p.items) && p.items.length > 0);
            if (!hasAnyItems) return;
            const feeDays = getMedicineFeeDaysFromSelected();
            if (!feeDays || feeDays < 1) return;
            const totalDays = getTotalMedicationDays();
            if (totalDays === feeDays) return;
            G.prescriptions = G.prescriptions.map((p, idx) => {
                const d = idx === 0 ? feeDays : 0;
                return { name: p.name, items: p.items, days: d, freq: p.freq, mode: p.mode };
            });
            updatePrescriptionDisplay();
        }
        
        // 天數輸入框直接變更（依處方）
        export function updateMedicationDaysFromInputAt(sectionIdx) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            const inputEl = document.getElementById('medicationDays-' + sectionIdx);
            const days = parseInt(inputEl && inputEl.value) || 5;
            const validDays = Math.max(1, Math.min(30, days));
            if (inputEl && validDays !== days) inputEl.value = validDays;
            G.prescriptions[sectionIdx].days = validDays;
            updatePrescriptionDisplay();
            updateMedicineFeeByDays(getTotalMedicationDays());
        }
        // 舊介面包裝
        export function updateMedicationDaysFromInput() { updateMedicationDaysFromInputAt(G.activePrescriptionIndex); }
        
        // 更新休息期間顯示
        export function updateRestPeriod() {
            const startDateInput = document.getElementById('formRestStartDate');
            const endDateInput = document.getElementById('formRestEndDate');
            const displaySpan = document.getElementById('restPeriodDisplay');

            if (!startDateInput || !endDateInput || !displaySpan) return;

            let startDate = startDateInput.value;
            let endDate = endDateInput.value;

            // 結束日期不得早於開始日期：若開始日被改到結束日之後（或直接選了
            // 過早的結束日），自動把結束日同步為開始日（el.value 指派經
            // vendor-enhance 的 value hook 自動同步 flatpickr 內部狀態）
            if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
                endDateInput.value = startDate;
                endDate = startDate;
            }

            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);

                if (end >= start) {
                    const timeDiff = end.getTime() - start.getTime();
                    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // 包含開始和結束日期
                    displaySpan.textContent = `共 ${daysDiff} 天`;
                    displaySpan.className = 'text-sm text-blue-600 font-medium';
                } else {
                    displaySpan.textContent = '結束日期不能早於開始日期';
                    displaySpan.className = 'text-sm text-red-600 font-medium';
                }
            } else {
                displaySpan.textContent = '請選擇開始和結束日期';
                displaySpan.className = 'text-sm text-gray-500 font-medium';
            }
        }
        

        
        // 更新處方藥量
        export function updatePrescriptionDosage(index, newDosage) {
            // 用於更新處方項目的藥材劑量。當使用者完成輸入（change 事件）時觸發。
            if (index >= 0 && index < G.selectedPrescriptionItems.length) {
                const dosage = parseFloat(newDosage);
                // 允許的範圍：0.5 克至 100 克。因 input 的 step 設為 0.5，使用 > 0 仍包含 0.5。
                if (dosage > 0 && dosage <= 100) {
                    // 將使用者輸入值（字串）存回自訂劑量欄，以便重新渲染時使用相同值
                    G.selectedPrescriptionItems[index].customDosage = newDosage;
                    // 重新生成處方文本與畫面
                    updatePrescriptionDisplay();
                } else {
                    // 若輸入無效，不更新資料，僅重新渲染以回復原值
                    updatePrescriptionDisplay();
                    G.showToast('請輸入有效的藥量（0.5-100克）', 'warning');
                }
            }
        }

        /**
         * 即時更新處方藥量。
         * 在使用者輸入過程中（input 事件）呼叫此函式，只更新自訂劑量而不重新渲染畫面。
         * 這樣即便在輸入期間頁面因其他操作而重新渲染，也會保留輸入中的數值。
         *
         * @param {number} index 選定處方項目的索引
         * @param {string} newDosage 使用者輸入的新劑量字串
         */
        export function updatePrescriptionDosageLive(index, newDosage) {
            if (index >= 0 && index < G.selectedPrescriptionItems.length) {
                // 直接更新 customDosage，不對值做解析或驗證，以便保留使用者輸入
                G.selectedPrescriptionItems[index].customDosage = newDosage;
            }
        }
        

        
        // 移除處方項目
        export function removePrescriptionItem(index) {
            if (index >= 0 && index < G.selectedPrescriptionItems.length) {
                const removedItem = G.selectedPrescriptionItems.splice(index, 1)[0];
                updatePrescriptionDisplay();
                // 移除處方項目後，重新檢查是否仍有禁忌配伍
                checkPrescriptionConflicts();
                // 同時根據處方內容決定是否允許切換庫存類型
                updatePrescriptionTypeSelectStatus();
                // 移除處方項目時，若游標仍在原位置會導致 tooltip 殘留，故手動隱藏
                if (typeof G.hideTooltip === 'function') {
                    G.hideTooltip();
                }
                
                // 如果移除後沒有處方項目了，移除藥費
                const hasAnyItems = G.prescriptions.some(p => Array.isArray(p.items) && p.items.length > 0);
                if (!hasAnyItems) {
                    // 尋找並移除藥費項目
                    const medicineFeeItem = G.billingItems.find(item => 
                        item.active && 
                        item.category === 'medicine' && 
                        (item.name.includes('中藥') || item.name.includes('藥費') || item.name.includes('調劑'))
                    );
                    
                    if (medicineFeeItem) {
                        const medicineFeeIndex = G.selectedBillingItems.findIndex(item => 
                            item.id === medicineFeeItem.id
                        );
                        
                        if (medicineFeeIndex !== -1) {
                            G.selectedBillingItems.splice(medicineFeeIndex, 1);
                            updateBillingDisplay();
                        }
                    }
                }
            }
        }
        // 多處方：更新指定處方的藥量（change）
        export function updatePrescriptionDosageAt(sectionIdx, index, newDosage) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            const items = G.prescriptions[sectionIdx].items || [];
            if (index < 0 || index >= items.length) return;
            const dosage = parseFloat(newDosage);
            if (dosage > 0 && dosage <= 100) {
                items[index].customDosage = newDosage;
                updatePrescriptionDisplay();
            } else {
                updatePrescriptionDisplay();
                G.showToast('請輸入有效的藥量（0.5-100克）', 'warning');
            }
        }
        // 多處方：即時更新指定處方的藥量（input）
        export function updatePrescriptionDosageLiveAt(sectionIdx, index, newDosage) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            const items = G.prescriptions[sectionIdx].items || [];
            if (index < 0 || index >= items.length) return;
            items[index].customDosage = newDosage;
        }
        // 多處方：移除指定處方的項目
        export function removePrescriptionItemAt(sectionIdx, index) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            const items = G.prescriptions[sectionIdx].items || [];
            if (index < 0 || index >= items.length) return;
            items.splice(index, 1);
            updatePrescriptionDisplay();
            checkPrescriptionConflicts();
            updatePrescriptionTypeSelectStatus();
            if (typeof G.hideTooltip === 'function') G.hideTooltip();
            const hasAnyItems = G.prescriptions.some(p => Array.isArray(p.items) && p.items.length > 0);
            if (!hasAnyItems) {
                const medicineFeeItem = G.billingItems.find(item => 
                    item.active && item.category === 'medicine' &&
                    (item.name.includes('中藥') || item.name.includes('藥費') || item.name.includes('調劑'))
                );
                if (medicineFeeItem) {
                    const idx = G.selectedBillingItems.findIndex(b => b.id === medicineFeeItem.id);
                    if (idx !== -1) {
                        G.selectedBillingItems.splice(idx, 1);
                        updateBillingDisplay();
                    }
                }
            }
        }
        export function removePrescriptionSectionAt(sectionIdx) {
            if (sectionIdx < 0 || sectionIdx >= G.prescriptions.length) return;
            if (G.prescriptions.length <= 1) return;
            G.prescriptions.splice(sectionIdx, 1);
            if (G.activePrescriptionIndex >= G.prescriptions.length) {
                G.activePrescriptionIndex = G.prescriptions.length - 1;
            }
            G.selectedPrescriptionItems = G.prescriptions[G.activePrescriptionIndex].items;
            updatePrescriptionDisplay();
            checkPrescriptionConflicts();
            updatePrescriptionTypeSelectStatus();
            try {
                const hasAnyItems = G.prescriptions.some(p => Array.isArray(p.items) && p.items.length > 0);
                if (hasAnyItems) {
                    updateMedicineFeeByDays(getTotalMedicationDays());
                } else {
                    const medicineFeeItem = G.billingItems.find(item => 
                        item.active && item.category === 'medicine' &&
                        (item.name.includes('中藥') || item.name.includes('藥費') || item.name.includes('調劑'))
                    );
                    if (medicineFeeItem) {
                        const idx = G.selectedBillingItems.findIndex(b => b.id === medicineFeeItem.id);
                        if (idx !== -1) {
                            G.selectedBillingItems.splice(idx, 1);
                            updateBillingDisplay();
                        }
                    }
                }
            } catch (_e) {}
        }
        
        // 清除處方搜索
        export function clearPrescriptionSearch() {
            document.getElementById('prescriptionSearch').value = '';
            document.getElementById('prescriptionSearchResults').classList.add('hidden');
            // 清除搜索時同步隱藏任何已顯示的 tooltip，避免游標仍停留在原位導致提示框殘留
            if (typeof G.hideTooltip === 'function') {
                G.hideTooltip();
            }
        }
        
// 收費項目搜索功能
export async function searchBillingForConsultation() {
    const searchTerm = document.getElementById('billingSearch').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('billingSearchResults');
    const resultsList = document.getElementById('billingSearchList');

    if (searchTerm.length < 1) {
        resultsContainer.classList.add('hidden');
        return;
    }

    // 確保收費項目資料已載入。若尚未載入，呼叫初始化函式載入本地或遠端資料。
    try {
        if (typeof initBillingItems === 'function' && !G.billingItemsLoaded) {
            await initBillingItems();
        }
    } catch (err) {
        console.error('載入收費項目資料時發生錯誤:', err);
    }

    // 檢查是否仍無資料，避免搜尋出現空白
    const itemsForSearch = Array.isArray(G.billingItems) ? G.billingItems : [];

    // 搜索匹配的收費項目，並根據匹配程度排序
    // 邏輯：名稱優先於描述，越接近開頭的匹配結果排序越前
    let matchedItems = itemsForSearch
        .map(item => {
            // 只處理啟用的項目
            if (!item || !item.active) return null;

            const name = (item.name || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            let score = -1;

            if (name === searchTerm) {
                score = 0; // 名稱完全匹配優先級最高
            } else if (name.startsWith(searchTerm)) {
                score = 10; // 名稱以關鍵字開頭次之
            } else if (name.includes(searchTerm)) {
                score = 100 + name.indexOf(searchTerm); // 名稱包含關鍵字，越靠前分數越低
            } else if (desc.includes(searchTerm)) {
                score = 1000 + desc.indexOf(searchTerm); // 描述包含關鍵字，優先級最低
            }

            // 若無匹配則返回 null
            if (score === -1) return null;

            return { item, score };
        })
        .filter(entry => entry !== null) // 過濾掉無匹配項目
        .sort((a, b) => a.score - b.score) // 依分數由小到大排序
        .map(entry => entry.item) // 取回原始項目物件
        .slice(0, 10); // 限制顯示前10個結果

    if (!matchedItems || matchedItems.length === 0) {
        resultsList.innerHTML = `
            <div class="p-3 text-center text-gray-500 text-sm">
                找不到符合條件的收費項目
            </div>
        `;
        resultsContainer.classList.remove('hidden');
        return;
    }

    // 顯示搜索結果
    resultsList.innerHTML = matchedItems.map(item => {
        const categoryNames = {
            consultation: '診療費',
            medicine: '藥費',
            treatment: '治療費',
            other: '其他',
            discount: '折扣項目',
            package: '套票項目',
            packageUse: '套票使用'
        };
        const categoryName = categoryNames[item.category] || '未分類';
        const bgColor = getCategoryBgColor(item.category);

        // 收費項目名稱/單位/描述皆為具管理權帳號可輸入的資料，統一跳脫防 XSS
        const safeBillingName = window.escapeHtml(item.name);
        const safeBillingUnit = item.unit ? window.escapeHtml(item.unit) : '';
        const safeBillingDesc = item.description
            ? window.escapeHtml(item.description.substring(0, 30)) + (item.description.length > 30 ? '...' : '')
            : '';
        return `
            <div class="p-3 ${bgColor} border rounded-lg cursor-pointer transition duration-200" onclick="addToBilling('${item.id}')">
                <div class="text-center">
                    <div class="font-semibold text-gray-900 text-sm mb-1">${safeBillingName}</div>
                    <div class="text-xs bg-white text-gray-600 px-2 py-1 rounded mb-2">${categoryName}</div>
                    ${item.category !== 'discount' ? `
                        <div class="text-sm font-bold text-green-600">
                            $${item.price}
                        </div>
                    ` : ''}
                    ${safeBillingUnit ? `<div class="text-xs text-gray-600">/ ${safeBillingUnit}</div>` : ''}
                    ${safeBillingDesc ? `<div class="text-xs text-gray-600 mt-1">${safeBillingDesc}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    resultsContainer.classList.remove('hidden');
}
        
        // 獲取類別背景顏色
        export function getCategoryBgColor(category) {
            const colors = {
                consultation: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
                medicine: 'bg-green-50 hover:bg-green-100 border-green-200',
                treatment: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
                other: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
                discount: 'bg-red-50 hover:bg-red-100 border-red-200',
                package: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
                packageUse: 'bg-purple-50 hover:bg-purple-100 border-purple-200'
            };
            return colors[category] || colors.other;
        }
        
        // 添加到收費項目
        export function addToBilling(itemId) {
            // 將 ID 轉為字串以確保與資料中的 ID 比對一致
            const idStr = String(itemId);
            const item = G.billingItems.find(b => String(b.id) === idStr);
            if (!item) return;

            // 如為套票項目且目前不允許修改套票，則停止並顯示警告
            if (item.category === 'package' && !G.canModifyPackageItems()) {
                G.showToast('診症完成後無法新增套票', 'warning');
                // 清理搜尋結果避免殘留
                clearBillingSearch();
                return;
            }

            // 檢查折扣使用限制：每個診症僅能有一個折扣項目。
            if (item.category === 'discount') {
                // 如果列表中已經存在任何折扣項目，則禁止再添加其他折扣
                const hasAnyDiscount = G.selectedBillingItems.some(b => b && b.category === 'discount');
                if (hasAnyDiscount) {
                    G.showToast('每個診症僅能使用一項折扣優惠', 'warning');
                    // 清理搜尋結果避免殘留
                    clearBillingSearch();
                    return;
                }
                // 如果已有同名折扣，禁止再添加（名稱重複仍不可）
                const duplicateDiscount = G.selectedBillingItems.some(b => b && b.category === 'discount' && b.name === item.name);
                if (duplicateDiscount) {
                    G.showToast('同名折扣項目僅能使用一項', 'warning');
                    // 清理搜尋結果避免殘留
                    clearBillingSearch();
                    return;
                }
            }

            // 檢查是否已經添加過相同 ID
            const existingIndex = G.selectedBillingItems.findIndex(b => String(b.id) === idStr);
            if (existingIndex !== -1) {
                // 如果已存在
                const existingItem = G.selectedBillingItems[existingIndex];
                // 折扣項目不允許增加數量
                if (existingItem.category === 'discount') {
                    G.showToast('折扣項目已存在，無法重複使用', 'warning');
                } else {
                    // 其他類別項目增加數量
                    existingItem.quantity += 1;
                }
            } else {
                // 添加新項目
                const billingItem = {
                    id: idStr,
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    unit: item.unit,
                    description: item.description,
                    packageUses: item.packageUses,
                    validityDays: item.validityDays,
                    quantity: 1,
                    // 預設除折扣項目外皆可參與折扣
                    includedInDiscount: item.category !== 'discount'
                };
                G.selectedBillingItems.push(billingItem);
            }

            // 更新顯示
            updateBillingDisplay();

            // 清除搜索
            clearBillingSearch();

            {
                const lang = localStorage.getItem('lang') || 'zh';
                // Determine display names for the billing item. Use the englishName when
                // available in English mode; otherwise default to the Chinese name. Proper
                // nouns should not be passed through the translation function.
                const displayNameEn = item && item.englishName ? item.englishName : item.name;
                const displayNameZh = item.name;
                const zhMsg = `已添加收費項目：${displayNameZh}`;
                const enMsg = `Added billing item: ${displayNameEn}`;
                const msg = lang && lang.toLowerCase().startsWith('en') ? enMsg : zhMsg;
                G.showToast(msg, 'success');
            }
        }
        
        // 更新收費項目顯示
        export function updateBillingDisplay() {
            // #region debug-point A2:billing-render
            try { window.__dbgSeq = (window.__dbgSeq || 0) + 1; fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"edit-record-blank-load",runId:"pre",hypothesisId:"A",location:"form.js:updateBillingDisplay",msg:"[DEBUG] updateBillingDisplay called",data:{seq:window.__dbgSeq,billingCount:(G.selectedBillingItems||[]).length,formHidden:(function(){const f=document.getElementById('consultationForm');return f?f.classList.contains('hidden'):null;})()},ts:Date.now()})}).catch((_e)=>{}); } catch(_e){}
            // #endregion
            const container = document.getElementById('selectedBillingItems');
            const hiddenTextarea = document.getElementById('formBillingItems');
            const totalAmountSpan = document.getElementById('totalBillingAmount');
            
            if (G.selectedBillingItems.length === 0) {
                container.innerHTML = `
                    <div class="text-sm text-gray-500 text-center py-4">
                        請使用上方搜索功能添加收費項目
                    </div>
                `;
                hiddenTextarea.value = '';
                totalAmountSpan.textContent = '$0';
                G.queueConsultationSymptomsDraftSave();
                // 總費用歸零：若儲值支付欄位因餘額不足被鎖定，此時應解鎖
                if (typeof window.syncConsultWalletAvailability === 'function') {
                    window.syncConsultWalletAvailability();
                }
                return;
            }
            
            // 計算總費用與折扣相關數值
            // 判斷是否有折扣項目
            const hasDiscount = G.selectedBillingItems.some(it => it.category === 'discount');
            let totalAmount = 0;
            let subtotalForDiscount = 0;
            let subtotalAllItems = 0;
            // 計算兩種小計：所有非折扣項目合計與折扣適用項目合計
            G.selectedBillingItems.forEach(item => {
                if (item.category !== 'discount') {
                    const itemSubtotal = item.price * item.quantity;
                    subtotalAllItems += itemSubtotal;
                    // 若有折扣，且此項目未被排除（undefined 視為 true），則加入折扣小計
                    if (!hasDiscount || item.includedInDiscount !== false) {
                        subtotalForDiscount += itemSubtotal;
                    }
                }
            });
            // 基於所有項目計算初始總金額
            totalAmount = subtotalAllItems;
            if (hasDiscount) {
                G.selectedBillingItems.forEach(item => {
                    if (item.category === 'discount') {
                        if (item.price > 0 && item.price < 1) {
                            // 百分比折扣：對折扣適用小計進行折扣計算
                            const discountAmount = subtotalForDiscount * (1 - item.price) * item.quantity;
                            totalAmount -= discountAmount;
                        } else {
                            // 固定金額折扣
                            totalAmount += item.price * item.quantity;
                        }
                    }
                });
            }
            // 更新顯示的總金額
            totalAmountSpan.textContent = `$${totalAmount}`;
            // 計算所有折扣適用項目的名稱，用於顯示折扣明細
            const includedItemNames = G.selectedBillingItems
                .filter(it => it.category !== 'discount' && (!hasDiscount || it.includedInDiscount !== false))
                .map(it => it.name);
            
            // 分離折扣項目和非折扣項目，但保持各自的添加順序
            const nonDiscountItems = [];
            const discountItems = [];
            
            G.selectedBillingItems.forEach((item, originalIndex) => {
                if (item.category === 'discount') {
                    discountItems.push({ item, originalIndex });
                } else {
                    nonDiscountItems.push({ item, originalIndex });
                }
            });
            
            // 合併顯示：非折扣項目在前，折扣項目在後
            const displayItems = [...nonDiscountItems, ...discountItems];
            
            // 在渲染列表前先嘗試取得當前掛號的病人 ID。這將用於後續處理舊病歷載入的套票使用項目（這些項目缺少 patientId 與 packageRecordId），
            // 使得使用者仍然可以點擊「取消使用」按鈕以嘗試退回套票次數。
            let currentPatientIdForDisplay = null;
            try {
                // 根據全域的 currentConsultingAppointmentId 從 appointments 陣列找到當前掛號資訊
                // 使用字串比較 ID，避免類型不一致導致匹配失敗
                const currentAppt = G.appointments.find(appt => appt && String(appt.id) === String(G.currentConsultingAppointmentId));
                if (currentAppt) {
                    currentPatientIdForDisplay = currentAppt.patientId;
                }
            } catch (e) {
                // 忽略錯誤，保持 currentPatientIdForDisplay 為 null
            }
            // 顯示已選擇的項目（非折扣項目在前，折扣項目在後）
            container.innerHTML = `
                <div class="space-y-2">
                    ${displayItems.map(({ item, originalIndex }) => {
                        const categoryNames = {
                            consultation: '診療費',
                            medicine: '藥費',
                            treatment: '治療費',
                            other: '其他',
                            discount: '折扣項目',
                            package: '套票項目',
                            packageUse: '套票使用'
                        };
                        const categoryName = categoryNames[item.category] || '未分類';
                        const bgColor = getCategoryBgColor(item.category);
                        let subtotal;
                        let subtotalDisplay;
                        // 檢查是否為套票使用
                        const isPackageUse = item.category === 'packageUse';
                        // 檢查是否為折扣項目
                        const isDiscountItem = item.category === 'discount';
                        // 決定是否顯示取消按鈕：對於所有套票使用項目均提供取消功能，
                        // 即便是舊病歷載入（缺少 patientId 或 packageRecordId）。
                        // 取消按鈕生成時優先使用項目自身的 patientId 與 packageRecordId，若缺失則使用當前病人 ID 與空字串。
                        const patientIdForUndo = (item.patientId || currentPatientIdForDisplay || '').toString();
                        const packageRecordIdForUndo = (item.packageRecordId || '').toString();
                        const canUndo = isPackageUse;
                        const undoBtn = canUndo ? `
                                    <button
                                        type="button"
                                        class="ml-2 text-xs px-2 py-0.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
                                        onclick="undoPackageUse('${patientIdForUndo}', '${packageRecordIdForUndo}', '${item.id}')"
                                    >取消使用</button>
                                ` : '';
                        // 判斷是否為套票項目，且當前是否禁止修改套票
                        const isPackageItem = item.category === 'package';
                        const packageLocked = isPackageItem && !G.canModifyPackageItems();
                        // 根據項目是否為套票使用或套票鎖定決定是否顯示刪除按鈕
                        // 套票使用項目 (packageUse) 或鎖定的套票 (package) 不提供刪除功能
                        const removeBtn = (isPackageUse || packageLocked)
                            ? ''
                            : `<button onclick="removeBillingItem(${originalIndex})" class="text-red-500 hover:text-red-700 font-bold text-lg px-2">×</button>`;
                        // 數量控制區：套票使用或鎖定的套票僅顯示次數；折扣項目不顯示數量；其他類型可增減數量
                        let quantityControls;
                        if (isDiscountItem) {
                            // 折扣項目不需顯示數量
                            quantityControls = '';
                        } else if (isPackageUse || packageLocked) {
                            // 套票使用或鎖定的套票僅顯示次數
                            quantityControls = `
                                <div class="flex items-center space-x-2 mr-3">
                                    <span class="w-8 text-center font-semibold">${item.quantity}</span>
                                </div>
                            `;
                        } else {
                            // 其他類別項目可增減數量
                            quantityControls = `
                                <div class="flex items-center space-x-2 mr-3">
                                    <button onclick="updateBillingQuantity(${originalIndex}, -1)" class="w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition duration-200">-</button>
                                    <span class="w-8 text-center font-semibold">${item.quantity}</span>
                                    <button onclick="updateBillingQuantity(${originalIndex}, 1)" class="w-6 h-6 bg-green-500 text-white rounded-full text-xs hover:bg-green-600 transition duration-200">+</button>
                                </div>
                            `;
                        }
                        
                        // 決定是否顯示折扣勾選框：有折扣項目且當前項目不是折扣項亦不是套票使用
                        const showDiscountCheckbox = hasDiscount && item.category !== 'discount' && item.category !== 'packageUse';
                        const checkboxHtml = showDiscountCheckbox ? `<div class="mr-2 flex items-center"><input type="checkbox" ${item.includedInDiscount === false ? '' : 'checked'} onchange="toggleDiscountEligibility(${originalIndex})"></div>` : '';
                        // 計算每一列的金額顯示
                        if (item.category === 'discount' && item.price > 0 && item.price < 1) {
                            // 百分比折扣：顯示折扣金額，以折扣適用小計為基準
                            const discountAmount = subtotalForDiscount * (1 - item.price) * item.quantity;
                            subtotal = -discountAmount;
                            subtotalDisplay = `-$${discountAmount.toFixed(0)}`;
                        } else {
                            // 一般項目或固定金額折扣
                            subtotal = item.price * item.quantity;
                            subtotalDisplay = `$${subtotal}`;
                        }

                        return `
                            <div class="flex items-center ${bgColor} border rounded-lg p-3">
                                ${checkboxHtml}
                                <div class="flex-1">
                                    <div class="font-semibold text-gray-900">${window.escapeHtml(item.name)}</div>
                                    <div class="text-xs text-gray-600">${categoryName}</div>
                                    <div class="text-sm font-medium ${item.category === 'discount' ? 'text-red-600' : 'text-green-600'}">
                                        ${(() => {
                                            if (item.category === 'discount') {
                                                if (item.price > 0 && item.price < 1) {
                                                    return `${(item.price * 10).toFixed(1)}折`;
                                                } else if (item.price < 0) {
                                                    return `-$${Math.abs(item.price)}`;
                                                } else {
                                                    return `$${item.price}`;
                                                }
                                            }
                                            return `$${item.price}`;
                                        })()}${item.unit ? ` / ${window.escapeHtml(item.unit)}` : ''}
                                    </div>
                                </div>
                                ${quantityControls}
                                <div class="mr-3 text-right">
                                    <div class="font-bold ${subtotal < 0 ? 'text-red-600' : 'text-green-600'}">${subtotalDisplay}</div>
                                </div>
                                ${undoBtn}${removeBtn}
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <!-- 小計和總計顯示 -->
                ${subtotalForDiscount > 0 && hasDiscount ? `
                    <div class="mt-4 pt-3 border-t border-gray-200">
                        <div class="text-right space-y-1">
                            <div class="text-sm text-gray-600">
                                小計：<span class="font-medium">$${subtotalForDiscount}</span>
                            </div>
                            ${G.selectedBillingItems.filter(item => item.category === 'discount').map(item => {
                                // 折扣項目名稱與適用項目名稱皆為可輸入資料，逐項跳脫
                                const safeDiscountName = window.escapeHtml(item.name);
                                const safeApplicable = includedItemNames.length > 0
                                    ? ` (適用：${includedItemNames.map(n => window.escapeHtml(n)).join(',')})`
                                    : '';
                                if (item.price > 0 && item.price < 1) {
                                    const discountAmount = subtotalForDiscount * (1 - item.price) * item.quantity;
                                    return `<div class="text-sm text-red-600">
                                        ${safeDiscountName}${safeApplicable}：<span class="font-medium">-$${discountAmount.toFixed(0)}</span>
                                    </div>`;
                                } else {
                                    return `<div class="text-sm text-red-600">
                                        ${safeDiscountName}${safeApplicable}：<span class="font-medium">$${item.price * item.quantity}</span>
                                    </div>`;
                                }
                            }).join('')}
                            <div class="text-base font-bold text-green-600 pt-1 border-t border-gray-300">
                                總計：$${Math.round(totalAmount)}
                            </div>
                        </div>
                    </div>
                ` : ''}
            `;
            
            // 更新隱藏的文本域（非折扣項目在前，折扣項目在後）
            let billingText = '';
            // 如果有折扣項目，先顯示折扣適用小計
            if (hasDiscount) {
                billingText += `小計：$${subtotalForDiscount}\n\n`;
            }
            // 先記錄非折扣項目
            G.selectedBillingItems.forEach(item => {
                if (item.category !== 'discount') {
                    billingText += `${item.name} x${item.quantity} = $${item.price * item.quantity}\n`;
                }
            });
            // 再記錄折扣項目
            G.selectedBillingItems.forEach(item => {
                if (item.category === 'discount') {
                    if (item.price > 0 && item.price < 1) {
                        // 百分比折扣
                        const discountAmount = subtotalForDiscount * (1 - item.price) * item.quantity;
                        billingText += `${item.name} x${item.quantity} = -$${discountAmount.toFixed(0)}\n`;
                    } else {
                        // 固定金額折扣
                        billingText += `${item.name} x${item.quantity} = $${item.price * item.quantity}\n`;
                    }
                }
            });
            // 記錄折扣適用明細
            if (hasDiscount) {
                billingText += `折扣適用於: ${includedItemNames.join(',')}\n`;
            }
            billingText += `\n總費用：$${Math.round(totalAmount)}`;
            hiddenTextarea.value = billingText.trim();
            G.queueConsultationSymptomsDraftSave();
            // 總費用重算完成：若高於儲值餘額則取消並鎖定「使用儲值餘額支付」，
            // 回落至餘額以內時自動解鎖
            if (typeof window.syncConsultWalletAvailability === 'function') {
                window.syncConsultWalletAvailability();
            }
        }
        
        // 更新收費項目數量
        export function updateBillingQuantity(index, change) {
            if (index >= 0 && index < G.selectedBillingItems.length) {
                const item = G.selectedBillingItems[index];
                // 如果是折扣項目，不允許修改數量
                if (item.category === 'discount') {
                    G.showToast('折扣項目不允許修改數量', 'warning');
                    return;
                }
                // 如果是套票使用，且 change < 0，直接取消使用並退回次數
                if (change < 0 && item.category === 'packageUse') {
                    // 調用取消函式，這會自動移除該筆記錄並退回次數
                    undoPackageUse(item.patientId, item.packageRecordId, item.id);
                    return;
                }
                // 若為套票項目且不允許修改套票，則不調整數量
                if (item && item.category === 'package' && !G.canModifyPackageItems()) {
                    G.showToast('診症完成後無法調整套票數量', 'warning');
                    return;
                }
                const newQuantity = item.quantity + change;
                if (newQuantity > 0) {
                    G.selectedBillingItems[index].quantity = newQuantity;
                    updateBillingDisplay();
                } else if (newQuantity === 0) {
                    // 數量為0時移除項目
                    removeBillingItem(index);
                }
            }
        }
        
        // 移除收費項目
        export function removeBillingItem(index) {
            if (index >= 0 && index < G.selectedBillingItems.length) {
                const removedItem = G.selectedBillingItems[index];
                // 如果為套票項目且目前不允許修改套票，則不允許移除
                if (removedItem && removedItem.category === 'package' && !G.canModifyPackageItems()) {
                    G.showToast('診症完成後無法刪除套票', 'warning');
                    return;
                }
                // 如果是套票使用，移除時需要退回剩餘次數
                if (removedItem.category === 'packageUse') {
                    // 直接調用取消函式，它會自動從陣列移除並處理次數
                    undoPackageUse(removedItem.patientId, removedItem.packageRecordId, removedItem.id);
                    return;
                }
                // 否則，單純移除
                G.selectedBillingItems.splice(index, 1);
                updateBillingDisplay();
            }
        }

        // 切換收費項目是否參與折扣
        export function toggleDiscountEligibility(index) {
            if (index >= 0 && index < G.selectedBillingItems.length) {
                const item = G.selectedBillingItems[index];
                // 只針對非折扣項目切換折扣適用狀態
                if (item && item.category !== 'discount') {
                    // 若 undefined 或 true，視為參與折扣，切換為不參與；若為 false 則改為參與
                    item.includedInDiscount = item.includedInDiscount === false ? true : false;
                    updateBillingDisplay();
                }
            }
        }
        
        // 清除收費項目搜索
        export function clearBillingSearch() {
            document.getElementById('billingSearch').value = '';
            document.getElementById('billingSearchResults').classList.add('hidden');
        }
        
        // 清空所有搜尋欄位
        export function clearAllSearchFields() {
            // 清空病人搜尋欄
            const patientSearchInput = document.getElementById('patientSearchInput');
            if (patientSearchInput) {
                patientSearchInput.value = '';
            }
            
            // 清空處方搜尋欄
            clearPrescriptionSearch();
            
            // 清空收費項目搜尋欄
            clearBillingSearch();
        }
        
        // 自動添加預設診金收費
        export function addDefaultConsultationFee(patient) {
            const diagnosisDefaults = G.getEffectiveDiagnosisSettings();
            const defaultBillingItemIds = Array.isArray(diagnosisDefaults.defaultBillingItemIds)
                ? diagnosisDefaults.defaultBillingItemIds.map(id => String(id))
                : [];
            if (defaultBillingItemIds.length > 0 && Array.isArray(G.billingItems) && G.billingItems.length > 0) {
                const configuredBillingItems = defaultBillingItemIds
                    .map(itemId => G.billingItems.find(item => item && item.active && String(item.id) === itemId))
                    .filter(Boolean)
                    .map(item => ({
                        id: item.id,
                        name: item.name,
                        category: item.category,
                        price: item.price,
                        unit: item.unit,
                        description: item.description,
                        quantity: 1,
                        includedInDiscount: item.category !== 'discount' && item.category !== 'packageUse'
                    }));
                if (configuredBillingItems.length > 0) {
                    G.selectedBillingItems = configuredBillingItems;
                    const defaultDaysFromSettings = diagnosisDefaults.defaultPrescriptionDays;
                    updateMedicineFeeByDays(defaultDaysFromSettings);
                    updateBillingDisplay();
                    return;
                }
            }
            // 尋找診金收費項目（優先尋找名稱包含「診金」的項目）
            let consultationFeeItem = G.billingItems.find(item => 
                item.active && 
                item.category === 'consultation' && 
                item.name.includes('診金')
            );
            
            // 如果沒有找到診金項目，使用第一個診療費項目
            if (!consultationFeeItem) {
                consultationFeeItem = G.billingItems.find(item => 
                    item.active && item.category === 'consultation'
                );
            }
            
            // 如果找到診金項目，自動添加
            if (consultationFeeItem) {
                // 清空現有收費項目
                G.selectedBillingItems = [];
                
                // 添加診金項目
                const billingItem = {
                    id: consultationFeeItem.id,
                    name: consultationFeeItem.name,
                    category: consultationFeeItem.category,
                    price: consultationFeeItem.price,
                    unit: consultationFeeItem.unit,
                    description: consultationFeeItem.description,
                    quantity: 1,
                    // 預設診金可參與折扣
                    includedInDiscount: true
                };
                G.selectedBillingItems.push(billingItem);
                
                // 自動添加預設藥費（根據個人設定的預設天數）
                const defaultDays = diagnosisDefaults.defaultPrescriptionDays;
                updateMedicineFeeByDays(defaultDays);
                
                // 更新顯示
                updateBillingDisplay();
            } else {
                // 如果沒有找到任何診療費項目，只清空收費項目並更新顯示
                G.selectedBillingItems = [];
                updateBillingDisplay();
            }
        }
        

        
        // 載入上次處方內容（按鈕觸發）
        export async function loadPreviousPrescription() {
            // 先檢查是否有正在診症的掛號
            if (!G.currentConsultingAppointmentId) {
                G.showToast('請先開始診症！', 'error');
                return;
            }
            // 使用字串比較 ID，避免類型不一致導致匹配失敗
            const appointment = G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId));
            if (!appointment) {
                G.showToast('找不到當前診症記錄！', 'error');
                return;
            }
            // 取得觸發按鈕：優先使用事件目標，若不存在則從 DOM 查找
            let loadingButton = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    loadingButton = event.currentTarget;
                }
            } catch (_e) {
                // 忽略事件取得失敗
            }
            if (!loadingButton) {
                loadingButton = document.querySelector('button[onclick="loadPreviousPrescription()"]');
            }
            if (loadingButton) {
                G.setButtonLoading(loadingButton, '讀取中...');
            }
            try {
                const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
                if (!patient) {
                    G.showToast('找不到病人資料！', 'error');
                    return;
                }
                // 讀取病人的診症記錄（使用快取）：單病人 onSnapshot 已保證即時性，無需強制刷新
                const consultationResult = await window.firebaseDataManager.getPatientConsultations(patient.id, false);
                if (!consultationResult.success) {
                    G.showToast('無法讀取診症記錄！', 'error');
                    return;
                }
                // 排除當前正在編輯的診症記錄（如果有）
                let patientConsultations = consultationResult.data || [];
                if (appointment.consultationId) {
                    patientConsultations = patientConsultations.filter(c => c.id !== appointment.consultationId);
                }
                // 取得最近一次診症記錄
                const lastConsultation = patientConsultations.length > 0 ? patientConsultations[0] : null;
                if (!lastConsultation || (!lastConsultation.multiPrescriptions && !lastConsultation.prescription)) {
                    {
                        const lang = localStorage.getItem('lang') || 'zh';
                        const zhMsg = `${patient.name} 沒有上次處方記錄可載入`;
                        const enMsg = `${patient.name} has no previous prescription record to load`;
                        const msg = lang === 'en' ? enMsg : zhMsg;
                        G.showToast(msg, 'warning');
                    }
                    return;
                }
                // 清空並解析處方
                clearActivePrescriptionItems();
                let usedMulti = false;
                try {
                    if (lastConsultation.multiPrescriptions) {
                        const mp = JSON.parse(lastConsultation.multiPrescriptions);
                        if (Array.isArray(mp) && mp.length > 0) {
                            G.prescriptions = mp.map(sec => {
                                const name = sec && sec.name ? sec.name : '處方';
                                const items = Array.isArray(sec && sec.items) ? sec.items : [];
                                const days = parseInt(sec && sec.days) || 5;
                                const freq = parseInt(sec && sec.freq) || 2;
                                const mode = (sec && sec.mode) === 'slice' ? 'slice' : 'granule';
                                return { name, items, days, freq, mode };
                            });
                            G.activePrescriptionIndex = 0;
                            G.selectedPrescriptionItems = G.prescriptions[G.activePrescriptionIndex].items;
                            try {
                                const m = G.prescriptions[G.activePrescriptionIndex] && G.prescriptions[G.activePrescriptionIndex].mode ? G.prescriptions[G.activePrescriptionIndex].mode : 'granule';
                                if (m === 'granule' || m === 'slice') {
                                    G.changeInventoryType(m);
                                }
                            } catch (_e) {}
                            updatePrescriptionDisplay();
                            try { updateMedicineFeeByDays(getTotalMedicationDays()); } catch (_e) {}
                            usedMulti = true;
                        }
                    }
                } catch (_e) {}
                if (!usedMulti) {
                    parsePrescriptionToItems(lastConsultation.prescription);
                    try {
                        const medDays = parseInt(lastConsultation.medicationDays);
                        if (!isNaN(medDays) && medDays > 0 && Array.isArray(G.prescriptions) && G.prescriptions.length > 0) {
                            G.prescriptions[0].days = medDays;
                        }
                        const medFreq = parseInt(lastConsultation.medicationFrequency);
                        if (!isNaN(medFreq) && medFreq > 0 && Array.isArray(G.prescriptions) && G.prescriptions.length > 0) {
                            G.prescriptions[0].freq = medFreq;
                        }
                    } catch (_e) {}
                    updatePrescriptionDisplay();
                    try { updateMedicineFeeByDays(getTotalMedicationDays()); } catch (_e) {}
                }
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const zhMsg = '已載入上次處方';
                    const enMsg = 'Previous prescription loaded';
                    const msg = lang === 'en' ? enMsg : zhMsg;
                    G.showToast(msg, 'success');
                }
            } catch (error) {
                console.error('讀取病人資料錯誤:', error);
                G.showToast('讀取病人資料失敗', 'error');
            } finally {
                if (loadingButton) {
                    G.clearButtonLoading(loadingButton);
                }
            }
        }
        
        // 解析處方內容並重建處方項目
        export function parsePrescriptionToItems(prescriptionText) {
            if (!prescriptionText) return;
            
            const lines = prescriptionText.split('\n');
            let i = 0;
            
            while (i < lines.length) {
                const line = lines[i].trim();
                if (!line) {
                    i++;
                    continue;
                }
                
                // 檢查是否為藥材/方劑格式（名稱 + 空格 + 劑量 + 單位）。
                // 單位可為中文或英文，或直接省略。舊版僅接受 g 結尾，現改為接受任意單位並忽略單位部份。
                const itemMatch = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)(?:[a-zA-Z\u4e00-\u9fa5]*)$/);
                if (itemMatch) {
                    const itemName = itemMatch[1].trim();
                    const dosage = itemMatch[2];
                    
                    // 先在中藥庫中尋找對應的項目（優先匹配中藥材，再匹配方劑）
                    let foundItem = G.herbLibrary.find(item => 
                        item.type === 'herb' && item.name === itemName
                    );
                    
                    if (foundItem) {
                        // 找到中藥材
                            const prescriptionItem = {
                                id: foundItem.id,
                                type: 'herb',
                                name: foundItem.name,
                                // When reconstructing a prescription from text and the original
                                // entry lacks a dosage, default to 1 g for herbs.
                                dosage: foundItem.dosage || '1g',
                                customDosage: dosage,
                                effects: foundItem.effects
                            };
                        G.selectedPrescriptionItems.push(prescriptionItem);
                    } else {
                        // 沒找到中藥材，尋找方劑
                        foundItem = G.herbLibrary.find(item => 
                            item.type === 'formula' && item.name === itemName
                        );
                        
                        if (foundItem) {
                            // 找到方劑
                            const prescriptionItem = {
                                id: foundItem.id,
                                type: 'formula',
                                name: foundItem.name,
                                customDosage: dosage,
                                composition: foundItem.composition,
                                effects: foundItem.effects
                            };
                            G.selectedPrescriptionItems.push(prescriptionItem);
                        } else {
                            // 都沒找到，根據常見方劑名稱特徵智能判斷類型
                            const isLikelyFormula = isFormulaName(itemName);
                            
                            const prescriptionItem = {
                                id: Date.now() + Math.random(), // 臨時ID
                                type: isLikelyFormula ? 'formula' : 'herb',
                                name: itemName,
                                customDosage: dosage,
                                effects: '（從上次處方載入）'
                            };
                            
                            if (isLikelyFormula) {
                                prescriptionItem.composition = '（從上次處方載入）';
                            } else {
                                prescriptionItem.dosage = `${dosage}g`;
                            }
                            
                            G.selectedPrescriptionItems.push(prescriptionItem);
                        }
                    }
                }
                
                i++;
            }
        }
        
        // 判斷是否為方劑名稱的輔助函數
        export function isFormulaName(name) {
            // 常見方劑名稱特徵
            const formulaKeywords = [
                '湯', '散', '丸', '膏', '飲', '丹', '煎', '方', '劑',
                '四君子', '六君子', '八珍', '十全', '補中益氣', '逍遙',
                '甘麥大棗', '小柴胡', '大柴胡', '半夏瀉心', '黃連解毒',
                '清熱解毒', '銀翹', '桑菊', '麻黃', '桂枝', '葛根',
                '白虎', '承氣', '理中', '真武', '苓桂', '五苓'
            ];
            
            return formulaKeywords.some(keyword => name.includes(keyword));
        }
        

        
        // 載入上次收費項目（按鈕觸發）
        export async function loadPreviousBillingItems() {
            // 先檢查是否有正在診症的掛號
            if (!G.currentConsultingAppointmentId) {
                G.showToast('請先開始診症！', 'error');
                return;
            }
            const appointment = G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId));
            if (!appointment) {
                G.showToast('找不到當前診症記錄！', 'error');
                return;
            }
            // 取得觸發按鈕
            let loadingButton = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    loadingButton = event.currentTarget;
                }
            } catch (_e) {}
            if (!loadingButton) {
                loadingButton = document.querySelector('button[onclick="loadPreviousBillingItems()"]');
            }
            if (loadingButton) {
                G.setButtonLoading(loadingButton, '讀取中...');
            }
            try {
                const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
                if (!patient) {
                    G.showToast('找不到病人資料！', 'error');
                    return;
                }
                // 從 Firebase 取得病人的診症記錄並按日期排序（使用快取）：單病人 onSnapshot 已保證即時性
                const consultationResult = await window.firebaseDataManager.getPatientConsultations(patient.id, false);
                if (!consultationResult.success) {
                    G.showToast('無法讀取診症記錄！', 'error');
                    return;
                }
                let patientConsultations = consultationResult.data || [];
                if (appointment.consultationId) {
                    patientConsultations = patientConsultations.filter(c => c.id !== appointment.consultationId);
                }
                // 最近一次診症記錄
                const lastConsultation = patientConsultations.length > 0 ? patientConsultations[0] : null;
                if (!lastConsultation || !lastConsultation.billingItems) {
                    {
                        const lang = localStorage.getItem('lang') || 'zh';
                        const zhMsg = `${patient.name} 沒有上次收費記錄可載入`;
                        const enMsg = `${patient.name} has no previous billing record to load`;
                        const msg = lang === 'en' ? enMsg : zhMsg;
                        G.showToast(msg, 'warning');
                    }
                    return;
                }
                // 保存當前診症中已使用的套票抵扣項目（category 為 packageUse）
                const existingPackageUses = Array.isArray(G.selectedBillingItems)
                    ? G.selectedBillingItems.filter(item => item.category === 'packageUse')
                    : [];
                // 清空現有收費項目並解析
                G.selectedBillingItems = [];
                parseBillingItemsFromText(lastConsultation.billingItems);
                // 根據要求：載入上次收費時，排除任何「使用套票」的抵扣項目與套票購買項目。
                // 原先僅排除 category 為 'packageUse' 的項目（即使用套票時產生的抵扣），
                // 但後續需求也要排除 category 為 'package' 的項目（即購買套票的收費項目）。
                if (Array.isArray(G.selectedBillingItems) && G.selectedBillingItems.length > 0) {
                    G.selectedBillingItems = G.selectedBillingItems.filter(item => item.category !== 'packageUse' && item.category !== 'package');
                }
                // 合併先前的套票使用項目，使其不會被覆蓋
                if (existingPackageUses && existingPackageUses.length > 0) {
                    G.selectedBillingItems = existingPackageUses.concat(G.selectedBillingItems);
                }
                // 更新顯示
                updateBillingDisplay();
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const zhMsg = '已載入上次收費';
                    const enMsg = 'Previous billing items loaded';
                    const msg = lang === 'en' ? enMsg : zhMsg;
                    G.showToast(msg, 'success');
                }
            } catch (error) {
                console.error('讀取病人資料錯誤:', error);
                G.showToast('讀取病人資料失敗', 'error');
            } finally {
                if (loadingButton) {
                    G.clearButtonLoading(loadingButton);
                }
            }
        }
        
// 解析收費項目文字並載入
export function parseBillingItemsFromText(billingText) {
    if (!billingText) {
        return;
    }
    
    // 解析上次收費項目
    const billingLines = billingText.split('\n');
    // 用於儲存折扣適用的項目名稱列表（從文本中解析）
    let discountApplicableNames = null;
    billingLines.forEach(rawLine => {
        let line = (rawLine || '').trim();
        if (!line) return;
        // 檢查折扣適用於行，格式如：折扣適用於: 項目1,項目2
        // 使用 (.*) 允許捕獲空字串，以支援無項目適用折扣（全部排除）的情況
        const applicabilityMatch = line.match(/^折扣適用於[:：]\s*(.*)$/);
        if (applicabilityMatch) {
            // 解析所有名稱並去除空白
            discountApplicableNames = applicabilityMatch[1]
                .split(',')
                .map(n => n.trim())
                .filter(n => n.length > 0);
            return;
        }
        // 略過小計與總費用行
        if (line.includes('小計') || line.includes('總費用')) return;
        // 解析收費項目格式：項目名 x數量 = 金額
        // 原來的邏輯只匹配前綴為一個負號或貨幣符號的整數，例如 "$30" 或 "-30"，
        // 但對於折扣項目來說，金額可能出現組合符號，例如 "-$30" 或 "$-30"，甚至含有小數部分，例如 "-$30.5"。
        // 如果正則無法匹配這些形式，折扣項目就會被忽略，進而導致無法還原當時的折扣狀態。
        // 因此改用更寬鬆的正則式來截取項目名稱與數量，允許金額部分包含任意的「-」與「$」順序以及小數點。
        // 此處只關心前兩個群組（項目名與數量），第三個群組捕獲金額字串，但後續邏輯不使用這個值。
        const itemMatch = line.match(/^(.+?)\s+x(\d+)\s+=\s+(-?\$?-?\d+(?:\.\d+)?)$/);
        if (itemMatch) {
            const itemName = itemMatch[1].trim();
            const quantity = parseInt(itemMatch[2]);
            // 在收費項目中尋找對應的項目
            const billingItem = G.billingItems.find(it => it.active && it.name === itemName);
            if (billingItem) {
                const selectedItem = {
                    id: billingItem.id,
                    name: billingItem.name,
                    category: billingItem.category,
                    price: billingItem.price,
                    unit: billingItem.unit,
                    description: billingItem.description,
                    quantity: quantity,
                    // 預設除折扣項目外皆可參與折扣
                    includedInDiscount: billingItem.category !== 'discount'
                };
                G.selectedBillingItems.push(selectedItem);
            } else {
                // 處理套票使用項目（從舊病歷載入的情況）
                // 只要名稱包含「使用套票」，即視為套票抵扣
                if (itemName.includes('使用套票')) {
                    G.selectedBillingItems.push({
                        id: `loaded-packageUse-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                        name: itemName,
                        category: 'packageUse',
                        price: 0,
                        unit: '次',
                        description: '套票抵扣一次',
                        quantity: quantity,
                        // 套票使用不參與折扣
                        includedInDiscount: false,
                        // 標記為從舊病歷載入，待恢復 meta 後可取消使用
                        isHistorical: true,
                        patientId: null,
                        packageRecordId: null
                    });
                } else {
                    // 如果在收費項目中找不到，創建一個臨時項目（用於已刪除的收費項目）
                    console.log(`找不到收費項目：${itemName || line}，可能已被刪除`);
                }
            }
        } else {
            // 若行不符合收費項目格式，且不是折扣適用於行，則略過
            // 這確保新的折扣明細不會導致錯誤
            return;
        }
    });
    // 如果解析到了折扣適用於行，根據其中的名稱調整各項目的折扣適用狀態
    // 注意：即使折扣名單為空（表示沒有項目適用折扣），也應該調整 includedInDiscount 屬性；
    // 若 discountApplicableNames 為 null，表示原文本沒有該行，則保留預設狀態。
    if (discountApplicableNames !== null) {
        G.selectedBillingItems.forEach(item => {
            if (item.category !== 'discount') {
                // 若名稱在折扣適用名單中則標記為可參與折扣，否則標記為不可參與折扣
                item.includedInDiscount = discountApplicableNames.includes(item.name);
            }
        });
    }
}
        
        
        // 載入指定病歷記錄到當前診症
        export async function loadMedicalRecordToCurrentConsultation(consultationId) {
            if (!G.currentConsultingAppointmentId) {
                G.showToast('請先開始診症！', 'error');
                return;
            }
            
            // 將傳入的 ID 轉為字串以便比較
            const idToFind = String(consultationId);
            // 載入既往病歷到目前診症時，一律強制單筆刷新，避免覆蓋進舊資料。
            let consultation = null;
            try {
                const singleRes = await window.firebaseDataManager.getConsultationById(idToFind, true);
                if (singleRes && singleRes.success && singleRes.data) {
                    consultation = singleRes.data;
                }
            } catch (_e) {}
            if (!consultation) {
                G.showToast('找不到指定的診症記錄！', 'error');
                return;
            }
            
            // 使用字串比較 ID，避免類型不匹配
            const currentAppointment = G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId));
            if (!currentAppointment) {
                G.showToast('找不到當前診症記錄！', 'error');
                return;
            }
            
            // 確認是否為相同病人
            if (String(currentAppointment.patientId) !== String(consultation.patientId)) {
                G.showToast('只能載入相同病人的病歷記錄！', 'error');
                return;
            }
            
const patient = await G.getPatientByIdWithRefresh(consultation.patientId);
if (!patient) {
    G.showToast('找不到病人資料！', 'error');
    return;
}

const consultationDate = (() => {
    const d = G.parseConsultationDate(consultation.date);
    return d ? d.toLocaleDateString('zh-TW') : '未知日期';
})();
            
            // 直接載入病歷，不彈出確認提示視窗
            // 注意：此操作會覆蓋當前已填寫的診症內容（主訴、舌象、脈象、診斷、處方、收費項目、醫囑等），且無法復原。
            // 若需要再次顯示確認提示，可重新加入 confirm 相關程式碼。
            
            // 載入診症資料
            // 載入診症資料
            // 主訴及現病史統一寫入 formSymptoms；若舊紀錄仍使用 currentHistory 儲存現病史，則合併
            const symptomsEl2 = document.getElementById('formSymptoms');
            if (symptomsEl2) {
                const symptomsVal = consultation.symptoms || '';
                const histVal = consultation.currentHistory || '';
                if (symptomsVal && histVal) {
                    symptomsEl2.value = symptomsVal + '\n' + histVal;
                } else if (symptomsVal) {
                    symptomsEl2.value = symptomsVal;
                } else if (histVal) {
                    symptomsEl2.value = histVal;
                } else {
                    symptomsEl2.value = '';
                }
            }
            document.getElementById('formTongue').value = consultation.tongue || '';
            document.getElementById('formPulse').value = consultation.pulse || '';
            // 過往記錄欄位僅顯示既往病歷，不應被覆蓋
            document.getElementById('formDiagnosis').value = consultation.diagnosis || '';
            document.getElementById('formSyndrome').value = consultation.syndrome || '';
                {
                  const acnEl = document.getElementById('formAcupunctureNotes');
                  if (acnEl) {
                    // 使用 innerHTML 載入針灸備註，以保留方塊標記；
                // 必須經過白名單淨化，歷史病歷可能含惡意內容（Stored XSS 防護）
                acnEl.innerHTML = window.sanitizeAcupunctureNotesHtml(consultation.acupunctureNotes || '');
                    // 載入完成後初始化既有穴位方塊的事件，以使其可刪除與顯示提示
                    if (typeof G.initializeAcupointNotesSpans === 'function') {
                      try {
                        G.initializeAcupointNotesSpans();
                      } catch (_e) {}
                    }
                  }
                }
            document.getElementById('formUsage').value = consultation.usage || '';
            document.getElementById('formTreatmentCourse').value = consultation.treatmentCourse || '';
            document.getElementById('formInstructions').value = consultation.instructions || '';
            
            
            
            
            
            // 載入處方內容
            let prescriptionLoaded = false;
            if (consultation.multiPrescriptions) {
                try {
                    const mp = JSON.parse(consultation.multiPrescriptions);
                    if (Array.isArray(mp) && mp.length > 0) {
                        G.prescriptions = mp.map(sec => {
                            const name = sec && sec.name ? sec.name : '處方';
                            const items = Array.isArray(sec && sec.items) ? sec.items : [];
                            const days = parseInt(sec && sec.days) || 5;
                            const freq = parseInt(sec && sec.freq) || 2;
                            const mode = (sec && sec.mode) === 'slice' ? 'slice' : 'granule';
                            return { name, items, days, freq, mode };
                        });
                        G.activePrescriptionIndex = 0;
                        G.selectedPrescriptionItems = G.prescriptions[G.activePrescriptionIndex].items;
                        try {
                            const m = G.prescriptions[G.activePrescriptionIndex] && G.prescriptions[G.activePrescriptionIndex].mode ? G.prescriptions[G.activePrescriptionIndex].mode : 'granule';
                            if (m === 'granule' || m === 'slice') {
                                G.changeInventoryType(m);
                            }
                        } catch (_e) {}
                        updatePrescriptionDisplay();
                        prescriptionLoaded = true;
                    }
                } catch (_e) {
                    prescriptionLoaded = false;
                }
            }
            if (!prescriptionLoaded) {
                clearActivePrescriptionItems();
                if (consultation.prescriptionStructured) {
                    try {
                        const parsedItems = JSON.parse(consultation.prescriptionStructured);
                        if (Array.isArray(parsedItems) && parsedItems.length > 0) {
                            setActivePrescriptionItems(parsedItems);
                            prescriptionLoaded = true;
                        }
                    } catch (_e) {
                        prescriptionLoaded = false;
                    }
                }
            }
            if (prescriptionLoaded) {
                // 使用更新函式渲染處方並同步隱藏文本域
                updatePrescriptionDisplay();
            } else if (consultation.prescription) {
                // fallback：仍然使用舊版文字處方進行解析
                document.getElementById('formPrescription').value = consultation.prescription;
                // 嘗試解析處方內容並生成處方項目列表
                parsePrescriptionToItems(consultation.prescription);
                updatePrescriptionDisplay();
                // 若解析後沒有任何項目，則直接顯示原始文字
                if (G.selectedPrescriptionItems.length === 0) {
                    document.getElementById('formPrescription').value = consultation.prescription;
                    const containerEl = document.getElementById('selectedPrescriptionItems');
                    if (containerEl) {
                        // 使用 whitespace-pre-line 使原始處方換行保持；
                        // 處方為醫師輸入內容，必須跳脫（與 L11443 安全版本一致）
                        containerEl.innerHTML = '<div class="text-sm text-gray-900 whitespace-pre-line">' + window.escapeHtml(consultation.prescription) + '</div>';
                    }
                    const medicationSettingsEl = document.getElementById('medicationSettings');
                    if (medicationSettingsEl) {
                        medicationSettingsEl.style.display = 'none';
                    }
                }
            } else {
                // 無處方資料時清空
                document.getElementById('formPrescription').value = '';
                updatePrescriptionDisplay();
            }
            
            try {
                const totalDays = getTotalMedicationDays();
                const daysElSync = document.getElementById('medicationDays');
                if (daysElSync) {
                    daysElSync.value = totalDays > 0 ? totalDays : '';
                }
            } catch (_syncErr) {}
            
            // 載入收費項目
            // 先保存當前診症中已使用的套票抵扣項目（category 為 packageUse），以避免覆蓋
            const existingPackageUses = Array.isArray(G.selectedBillingItems)
                ? G.selectedBillingItems.filter(item => item.category === 'packageUse')
                : [];
            // 清空現有收費項目
            G.selectedBillingItems = [];
            if (consultation.billingItems) {
                // 直接將收費項目設置到隱藏文本域
                document.getElementById('formBillingItems').value = consultation.billingItems;

                // 解析並載入收費項目
                parseBillingItemsFromText(consultation.billingItems);

                // 根據要求：載入病歷時，排除任何「使用套票」的抵扣項目與套票購買項目。
                // 這些項目在 parseBillingItemsFromText 中會被標記為 category === 'packageUse' 或 category === 'package'。
                if (Array.isArray(G.selectedBillingItems) && G.selectedBillingItems.length > 0) {
                    G.selectedBillingItems = G.selectedBillingItems.filter(item => item.category !== 'packageUse' && item.category !== 'package');
                }

                // 合併保留下來的套票使用項目，使其不會被覆蓋
                if (existingPackageUses && existingPackageUses.length > 0) {
                    G.selectedBillingItems = existingPackageUses.concat(G.selectedBillingItems);
                }

                // 嘗試為舊記錄補全套票使用的 meta 資訊（patientId 與 packageRecordId）。
                // 此步驟在移除套票使用項目後依然呼叫，不會對結果造成影響。
                try {
                    // 以前的程式碼中直接使用未宣告的 appointment 變數，導致 ReferenceError。
                    // 改為使用前面取得的 currentAppointment（當前掛號）來取得病人 ID。
                    const pidForRestore = (currentAppointment && currentAppointment.patientId) ? currentAppointment.patientId : null;
                    if (pidForRestore) {
                        await restorePackageUseMeta(pidForRestore);
                    }
                } catch (e) {
                    console.error('恢復套票使用 meta 錯誤:', e);
                }

                // 更新收費顯示
                updateBillingDisplay();
                try { syncMedicationDaysWithMedicineFee(); } catch (_e) {}
            } else {
                // 沒有新收費項目，但仍保留先前的套票使用項目
                if (existingPackageUses && existingPackageUses.length > 0) {
                    G.selectedBillingItems = existingPackageUses;
                }
                // 清空隱藏文本域
                document.getElementById('formBillingItems').value = '';
                // 更新收費顯示
                updateBillingDisplay();
            }
            
            // 清除搜索框
            clearPrescriptionSearch();
            clearBillingSearch();
            
            // 關閉病歷查看彈窗
            G.closeMedicalHistoryModal();
            
            // 滾動到診症表單
            document.getElementById('consultationForm').scrollIntoView({ behavior: 'smooth' });
            
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const nameStr = patient ? patient.name : '未知病人';
                const nameEn = patient ? patient.name : 'unknown patient';
                const zhMsg = `已載入 ${nameStr} 在 ${consultationDate} 的完整病歷記錄`;
                const enMsg = `Loaded full medical record for ${nameEn} on ${consultationDate}`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'success');
            }
        }
