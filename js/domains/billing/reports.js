/* ============================================================
 * billing/reports.js — 財務報表：快取層、診所/醫師選項、統計 API、
 * 報表產生、關鍵指標／趨勢／明細表格、圖表、鑽取、
 * 錢包財務與應收款、Txt/Excel 匯出（Phase 5 子批 D）。
 * 快取與篩選狀態為本模組私有；其餘共享狀態經 G 讀寫。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { getApportionedCost } from './expenses.js';

        let currentFinancialTabType = 'summary';
        const financialReportCache = {};
        const FINANCIAL_REPORT_MIN_REFRESH_MS = 15000;
        // 快取版本：統計口徑／快取結構調整時遞增，避免讀到舊格式快取
        const FINANCIAL_REPORT_CACHE_VERSION = 'v5';
        export function getFinancialReportCacheKey(startDate, endDate, doctorFilter, clinicFilter) {
            return `${FINANCIAL_REPORT_CACHE_VERSION}|${startDate}|${endDate}|${doctorFilter || ''}|${clinicFilter || ''}`;
        }
        let financialReportLastRunAt = 0;
        let financialReportLastKey = '';

        // ------------------------------------------------------------
        // 快取輕量化：持久化只存「投影欄位＋統計結果」，不存病歷全文，
        // 並限制最多 FINANCIAL_CACHE_MAX_ENTRIES 組（LRU 式淘汰）。
        // ------------------------------------------------------------
        const FINANCIAL_CACHE_MAX_ENTRIES = 8;
        const FINANCIAL_CACHE_STORAGE_KEY = 'financialReportCache';

        // 只保留報表統計與鑽取清單需要的欄位；收費明文字段以預解析
        // 結果（financialSummaryItems）取代，避免把整段病歷塞進快取。
        export function projectFinancialRecordForCache(c) {
            if (!c || typeof c !== 'object') return c;
            // 已是投影（帶 __finProjection）則直接回傳
            if (c.__finProjection) return c;
            let finItems = Array.isArray(c.financialSummaryItems)
                ? c.financialSummaryItems : null;
            let finTotal = (c.financialTotalAmount !== undefined && c.financialTotalAmount !== null)
                ? Number(c.financialTotalAmount) : null;
            if (!finItems) {
                const parsed = parseFinancialBillingItems(c);
                finItems = parsed.items || [];
                if (finTotal === null) finTotal = parsed.totalAmount || 0;
            }
            if (finTotal === null) finTotal = 0;
            return {
                __finProjection: true,
                id: c.id,
                date: c.date,
                doctor: c.doctor,
                clinicId: c.clinicId,
                patientName: c.patientName,
                status: c.status,
                paymentStatus: c.paymentStatus,
                pendingAmount: c.pendingAmount,
                walletPaySkipped: c.walletPaySkipped,
                financialSummaryItems: finItems,
                financialTotalAmount: finTotal
            };
        }

        export function buildFinancialCacheEntry(records, stats, lastSyncAt) {
            return {
                records: (Array.isArray(records) ? records : []).map(projectFinancialRecordForCache),
                stats,
                lastSyncAt,
                savedAt: Date.now()
            };
        }

        export function readPersistedFinancialCache(key) {
            try {
                const raw = localStorage.getItem(FINANCIAL_CACHE_STORAGE_KEY);
                if (!raw) return null;
                const map = JSON.parse(raw) || {};
                const entry = map[key];
                // 只接受投影格式（含 records 與 stats），舊格式自然作廢
                if (entry && Array.isArray(entry.records) && entry.stats) return entry;
                return null;
            } catch (_e) {
                return null;
            }
        }

        export function writePersistedFinancialCache(key, entry) {
            try {
                let map = {};
                try {
                    const raw = localStorage.getItem(FINANCIAL_CACHE_STORAGE_KEY);
                    map = raw ? (JSON.parse(raw) || {}) : {};
                } catch (_parseErr) { map = {}; }
                map[key] = entry;
                pruneFinancialCacheMap(map, FINANCIAL_CACHE_MAX_ENTRIES);
                localStorage.setItem(FINANCIAL_CACHE_STORAGE_KEY, JSON.stringify(map));
            } catch (_quotaErr) {
                // 容量不足：大幅裁減後重試一次
                try {
                    const raw = localStorage.getItem(FINANCIAL_CACHE_STORAGE_KEY);
                    const map = raw ? (JSON.parse(raw) || {}) : {};
                    map[key] = entry;
                    pruneFinancialCacheMap(map, 3);
                    localStorage.setItem(FINANCIAL_CACHE_STORAGE_KEY, JSON.stringify(map));
                } catch (_e2) {}
            }
        }

        export function pruneFinancialCacheMap(map, keep) {
            const entries = Object.entries(map);
            if (entries.length <= keep) return;
            // 最舊的 savedAt 先淘汰
            entries.sort((a, b) => (a[1].savedAt || 0) - (b[1].savedAt || 0));
            entries.slice(0, entries.length - keep).forEach(([k]) => { delete map[k]; });
        }

        export function setFinancialReportLoadingState() {
            const loadingRow = (colspan) => `
                <tr>
                    <td colspan="${colspan}" class="px-4 py-8 text-center text-gray-500">
                        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        <div class="mt-2">載入中...</div>
                    </td>
                </tr>
            `;
            const summaryBody = document.getElementById('financialSummaryTableBody');
            const dailyBody = document.getElementById('financialDailyTableBody');
            const doctorBody = document.getElementById('financialDoctorTableBody');
            const serviceBody = document.getElementById('financialServiceTableBody');
            if (summaryBody) summaryBody.innerHTML = loadingRow(4);
            if (dailyBody) dailyBody.innerHTML = loadingRow(5);
            if (doctorBody) doctorBody.innerHTML = loadingRow(5);
            if (serviceBody) serviceBody.innerHTML = loadingRow(5);
        }
        
        // 載入財務報表頁面
        export async function loadFinancialReports() {
            // 設置預設日期範圍（本月）
            const today = new Date();
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            
            document.getElementById('startDate').value = formatFinancialDate(firstDayOfMonth);
            document.getElementById('endDate').value = formatFinancialDate(lastDayOfMonth);
            
            // 從 Firebase 更新用戶與診症資料（如可用）
            if (typeof loadUsersForFinancial === 'function') {
                await loadUsersForFinancial();
            }
            // 載入醫師選項
            loadFinancialDoctorOptions();
            try { if (!Array.isArray(G.clinicsList) || G.clinicsList.length === 0) await G.initClinics(); } catch (_e) {}
            loadFinancialClinicOptions();
            // 生成初始報表
            await generateFinancialReport();
        }

        // 格式化日期為 YYYY-MM-DD
        // 使用本地時區組合字串，避免使用 toISOString() 導致跨日誤差
        export function formatFinancialDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // 香港時間日界：與儲值區 walletFinRangeIso 口徑一致，
        // 不使用 UTC（Z）日界，避免月初月末邊界差一天。
        export function financialDayStart(dateStr) {
            return new Date(`${dateStr}T00:00:00+08:00`);
        }
        export function financialDayEnd(dateStr) {
            return new Date(`${dateStr}T23:59:59.999+08:00`);
        }

        // 以香港日曆日回傳日期 key（YYYY-MM-DD），供每日／儲值分組使用
        export function getFinancialDateKey(value) {
            const parsed = G.parseConsultationDate(value);
            if (!parsed || isNaN(parsed.getTime())) {
                return String(value || '').slice(0, 10);
            }
            try {
                // en-CA 語系輸出即 YYYY-MM-DD
                return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(parsed);
            } catch (_e) {
                return String(value || '').slice(0, 10);
            }
        }

        // 日期字串加減天數（以香港日曆日為準），回傳 YYYY-MM-DD
        export function shiftFinancialDate(dateStr, deltaDays) {
            const d = new Date(`${dateStr}T12:00:00+08:00`);
            d.setUTCDate(d.getUTCDate() + deltaDays);
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(d);
        }

        // 列出期間內所有日曆日（含首尾）
        export function enumerateFinancialDates(startDate, endDate) {
            const list = [];
            let cur = startDate;
            let guard = 0;
            while (cur <= endDate && guard < 4000) {
                list.push(cur);
                cur = shiftFinancialDate(cur, 1);
                guard += 1;
            }
            return list;
        }

        // 篩選條件防抖 + in-flight 去重：快速切換時只在停止操作 300ms
        // 後執行；若報表仍在生成，則於完成後補跑一次最新條件。
        const FINANCIAL_DEBOUNCE_MS = 300;
        let financialDebounceTimer = null;
        let financialRunInFlight = false;
        let financialRunQueued = false;
        export function scheduleFinancialReportRefresh() {
            clearTimeout(financialDebounceTimer);
            financialDebounceTimer = setTimeout(runFinancialReportGuarded, FINANCIAL_DEBOUNCE_MS);
        }
        export async function runFinancialReportGuarded() {
            if (financialRunInFlight) {
                financialRunQueued = true;
                return;
            }
            financialRunInFlight = true;
            try {
                await generateFinancialReport();
            } catch (_e) {
                console.error('財務報表生成失敗:', _e);
            } finally {
                financialRunInFlight = false;
                if (financialRunQueued) {
                    financialRunQueued = false;
                    runFinancialReportGuarded();
                }
            }
        }

        // 載入醫師選項
        export function loadFinancialDoctorOptions() {
            const doctorSelect = document.getElementById('doctorFilter');
            const doctors = G.users.filter(user => 
                user.active && user.position === '醫師'
            );
            
            // 清空現有選項（保留「全部醫師」）
            doctorSelect.innerHTML = '<option value="">全部醫師</option>';
            
            // 添加醫師選項
            doctors.forEach(doctor => {
                const option = document.createElement('option');
                option.value = doctor.username;
                option.textContent = `${doctor.name}`;
                doctorSelect.appendChild(option);
            });
        }
        export function loadFinancialClinicOptions() {
            const sel = document.getElementById('clinicFilterFinancial');
            if (!sel) return;
            sel.innerHTML = '<option value="">全部診所</option>';
            const list = Array.isArray(G.clinicsList) ? G.clinicsList : [];
            list.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.chineseName || c.englishName || c.id;
                sel.appendChild(opt);
            });
            try {
                if (G.currentClinicId) sel.value = G.currentClinicId;
            } catch (_e) {}
        }

        // 從 Firebase 載入用戶資料以供財務報表使用
        export async function loadUsersForFinancial() {
            // 如果 Firebase 數據管理器尚未準備或不存在，跳過
            if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
                return;
            }
            try {
                // 使用 fetchUsers() 以利用快取減少讀取次數
                const data = await G.fetchUsers();
                if (Array.isArray(data) && data.length > 0) {
                    G.users = data.map(user => {
                        const createdAt = user.createdAt
                            ? (user.createdAt.seconds
                                ? new Date(user.createdAt.seconds * 1000).toISOString()
                                : user.createdAt)
                            : new Date().toISOString();
                        const updatedAt = user.updatedAt
                            ? (user.updatedAt.seconds
                                ? new Date(user.updatedAt.seconds * 1000).toISOString()
                                : user.updatedAt)
                            : new Date().toISOString();
                        const lastLogin = user.lastLogin
                            ? (user.lastLogin.seconds
                                ? new Date(user.lastLogin.seconds * 1000).toISOString()
                                : user.lastLogin)
                            : null;
                        return { ...user, createdAt, updatedAt, lastLogin };
                    });
                }
            } catch (error) {
                console.error('載入用戶資料失敗:', error);
            }
        }

        // 從 Firebase 載入診症記錄以供財務報表使用
        export async function loadConsultationsForFinancial() {
            if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
                return;
            }
            try {
                setFinancialReportLoadingState();
                const startEl = document.getElementById('startDate');
                const endEl = document.getElementById('endDate');
                const doctorEl = document.getElementById('doctorFilter');
                const clinicEl = document.getElementById('clinicFilterFinancial');
                if (startEl && endEl) {
                    const startVal = startEl.value;
                    const endVal = endEl.value;
                    const doctorVal = doctorEl ? doctorEl.value : '';
                    const clinicVal = clinicEl ? clinicEl.value : '';
                    // v2：舊旗標可能是在不完整查詢（date 欄位漏舊單）時寫入，
                    // 加版本字串強制作廢一次，讓新版 sortDate 查詢重新回填。
                    const coverageKey = 'v2|' + getFinancialSummaryCoverageKey(startVal, endVal, doctorVal, clinicVal);
                    const summaryCovered = !!G.readCache('financialSummaryCoverage', coverageKey);
                    const canUseSummary = typeof window.firebaseDataManager.getConsultationFinancialSummariesByRangeAndDoctor === 'function';

                    if (canUseSummary && summaryCovered) {
                        const summaryRes = await window.firebaseDataManager.getConsultationFinancialSummariesByRangeAndDoctor(startVal, endVal, doctorVal || null, true, clinicVal || null);
                        if (summaryRes && summaryRes.success) {
                            consultations = summaryRes.data.map(normalizeFinancialRecordForReport).filter(Boolean);
                            return;
                        }
                    }

                    const targeted = await window.firebaseDataManager.getConsultationsByRangeAndDoctor(startVal, endVal, doctorVal || null, true, clinicVal || null);
                    if (targeted && targeted.success) {
                        consultations = targeted.data.map(normalizeFinancialRecordForReport).filter(Boolean);
                        if (canUseSummary) {
                            // 回填改為背景執行：大量舊資料時不再阻塞報表顯示。
                            // 旗標於回填成功後才寫入；此期間重跑只會多做一次查詢，不影響正確性。
                            Promise.resolve()
                                .then(() => window.firebaseDataManager.syncConsultationFinancialSummaries(targeted.data))
                                .then(() => G.writeCache('financialSummaryCoverage', coverageKey, true))
                                .catch((_syncErr) => console.warn('財務摘要回填失敗:', _syncErr));
                        }
                        return;
                    }

                    if (canUseSummary) {
                        const summaryFallback = await window.firebaseDataManager.getConsultationFinancialSummariesByRangeAndDoctor(startVal, endVal, doctorVal || null, true, clinicVal || null);
                        if (summaryFallback && summaryFallback.success) {
                            consultations = summaryFallback.data.map(normalizeFinancialRecordForReport).filter(Boolean);
                            return;
                        }
                    }
                }
                // 取消全量回退載入：避免財務報表在索引問題時掃描整個 consultations 集合。
                consultations = [];
            } catch (error) {
                console.error('載入 Firebase 診症資料失敗:', error);
            }
        }

        // 快速日期選擇
        export function setQuickDate() {
            /**
             * 根據目前日期計算本週或上週的起始日期。
             * 以週一作為每週的第一天，週日為最後一天。
             * 例如，若今天是週三（getDay() 回傳 3），則本週開始為週一。
             * 若今天是週日（getDay() 回傳 0），則本週開始仍為本週週一。
             * @param {Date} date 當前日期
             * @returns {Date} 當週週一的日期
             */
            function getStartOfWeek(date) {
                const result = new Date(date);
                const day = result.getDay();
                // 將 Sunday (0) 視為一週的最後一天，需回溯 6 天至週一
                // 其餘情況回溯 day-1 天至週一
                const diff = day === 0 ? -6 : 1 - day;
                result.setDate(result.getDate() + diff);
                return result;
            }

            const quickDate = document.getElementById('quickDate').value;
            const today = new Date();
            let startDate, endDate;

            switch (quickDate) {
                case 'today':
                    // 今日：開始與結束皆為今天
                    startDate = new Date(today);
                    endDate = new Date(today);
                    break;
                case 'yesterday':
                    // 昨天：開始與結束皆為昨天
                    startDate = new Date(today);
                    startDate.setDate(today.getDate() - 1);
                    endDate = new Date(startDate);
                    break;
                case 'thisWeek': {
                    // 本週：以週一為起點，結束日期為今天
                    startDate = getStartOfWeek(today);
                    endDate = new Date(today);
                    break;
                }
                case 'lastWeek': {
                    // 上週：取得本週週一後，再往前推七天得到上週週一；結束日期為上週週日
                    const startOfThisWeek = getStartOfWeek(today);
                    startDate = new Date(startOfThisWeek);
                    startDate.setDate(startOfThisWeek.getDate() - 7);
                    endDate = new Date(startDate);
                    endDate.setDate(startDate.getDate() + 6);
                    break;
                }
                case 'thisMonth':
                    // 本月：起始為月初 (1 日)，結束為月末
                    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    break;
                case 'lastMonth':
                    // 上月：起始為上個月 1 日，結束為上個月的最後一天
                    startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    endDate = new Date(today.getFullYear(), today.getMonth(), 0);
                    break;
                case 'thisYear':
                    // 今年：起始為本年度 1 月 1 日，結束為本年度的最後一天（12 月 31 日）。
                    // 為確保跨時區日期正確，使用 new Date(下一年, 0, 0) 取得本年度的最後一天。
                    startDate = new Date(today.getFullYear(), 0, 1);
                    endDate = new Date(today.getFullYear() + 1, 0, 0);
                    break;
                case 'lastYear':
                    // 去年：起始為去年 1 月 1 日，結束為去年的最後一天。
                    // 使用 new Date(今年, 0, 0) 取得去年的 12 月 31 日。
                    startDate = new Date(today.getFullYear() - 1, 0, 1);
                    endDate = new Date(today.getFullYear(), 0, 0);
                    break;
                default:
                    return;
            }

            if (startDate && endDate) {
                // 將日期格式化為 YYYY-MM-DD 並更新 UI
                document.getElementById('startDate').value = formatFinancialDate(startDate);
                document.getElementById('endDate').value = formatFinancialDate(endDate);
                // 重新生成報表（走防抖，避免與其他操作並發）
                scheduleFinancialReportRefresh();
            }
        }

        // 標準化財務類別代碼
        export function normalizeFinancialCategory(category) {
            const raw = String(category || '').trim();
            if (!raw) return '';
            const key = raw.toLowerCase();
            const map = {
                consultation: 'consultation',
                medicine: 'medicine',
                treatment: 'treatment',
                other: 'other',
                discount: 'discount',
                package: 'package',
                packageuse: 'packageUse',
                package_use: 'packageUse'
            };
            return map[key] || '';
        }

        // 解析收費項目文本（優先使用結構化 category，金額仍以文字明細為準）
        export function parseFinancialBillingItems(consultationData) {
            const items = [];
            const consultationObj = consultationData && typeof consultationData === 'object' ? consultationData : null;
            const billingText = consultationObj ? (consultationObj.billingItems || '') : (consultationData || '');
            const lines = String(billingText || '').split('\n');
            let totalAmount = 0;
            let totalAmountSum = 0;
            const categoryQueueByName = {};

            // 先從結構化資料建立「同名項目依序取用」的類別映射，避免名稱關鍵字誤判。
            try {
                const structuredRaw = consultationObj ? consultationObj.billingItemsStructured : null;
                const structuredItems = typeof structuredRaw === 'string'
                    ? JSON.parse(structuredRaw || '[]')
                    : (Array.isArray(structuredRaw) ? structuredRaw : []);
                if (Array.isArray(structuredItems)) {
                    structuredItems.forEach(rawItem => {
                        if (!rawItem) return;
                        const itemName = rawItem.name ? String(rawItem.name).trim() : '';
                        if (!itemName) return;
                        const normalizedCategory = normalizeFinancialCategory(rawItem.category) || getFinancialCategoryFromItemName(itemName);
                        if (!categoryQueueByName[itemName]) {
                            categoryQueueByName[itemName] = [];
                        }
                        categoryQueueByName[itemName].push(normalizedCategory);
                    });
                }
            } catch (_e) {
                // 若結構化資料格式異常，沿用名稱推斷作為回退。
            }

            lines.forEach(line => {
                line = line.trim();
                if (!line || line.includes('小計') || line.includes('總費用') || line.includes('折扣適用於') || line.includes('折扣適用於:')) {
                    // 提取總費用（支援千分位逗號與小數）
                    if (line.includes('總費用')) {
                        const match = line.match(/\$([\d,]+(?:\.\d+)?)/);
                        if (match) {
                            totalAmount = Number(match[1].replace(/,/g, ''));
                        }
                    }
                    return;
                }

                // 解析收費項目格式：項目名 x數量 = $金額 或 項目名 x數量 = -$金額
                const itemMatch = line.match(/^(.+?)\s+x(\d+)\s+=\s+(-?\$?[\d,]+(?:\.\d+)?|\$?-?[\d,]+(?:\.\d+)?)$/);
                if (itemMatch) {
                    const itemName = itemMatch[1].trim();
                    const quantity = parseInt(itemMatch[2]);
                    const rawAmount = (itemMatch[3] || '').trim();
                    // 去除逗號與幣別符號，保留小數點；正負號另以 includes('-') 判斷
                    const amountNumber = Number(rawAmount.replace(/[^0-9.]/g, '')) || 0;
                    const signedAmount = rawAmount.includes('-') ? -amountNumber : amountNumber;
                    const mappedQueue = categoryQueueByName[itemName];
                    const mappedCategory = Array.isArray(mappedQueue) && mappedQueue.length > 0
                        ? mappedQueue.shift()
                        : '';

                    items.push({
                        name: itemName,
                        quantity: quantity,
                        unitPrice: quantity ? Math.abs(signedAmount / quantity) : 0,
                        totalAmount: signedAmount,
                        category: mappedCategory || getFinancialCategoryFromItemName(itemName)
                    });
                    totalAmountSum += signedAmount;
                }
            });

            if (!totalAmount) {
                totalAmount = totalAmountSum;
            }
            return { items, totalAmount };
        }

        export function cloneFinancialSummaryItems(items) {
            return (Array.isArray(items) ? items : []).map(item => ({
                name: item && item.name ? String(item.name) : '',
                quantity: Math.max(0, Number(item && item.quantity) || 0),
                unitPrice: Number(item && item.unitPrice) || 0,
                totalAmount: Number(item && item.totalAmount) || 0,
                category: normalizeFinancialCategory(item && item.category ? item.category : '') || 'other'
            })).filter(item => item.name || item.quantity || item.totalAmount);
        }

        export function buildConsultationFinancialSummaryPayload(consultationId, consultationData, options = {}) {
            const source = consultationData && typeof consultationData === 'object' ? consultationData : {};
            const now = options && options.now instanceof Date ? options.now : new Date();
            const effectiveDate = G.getConsultationEffectiveDate(source, now) || now;
            const sortDate = G.parseConsultationDate(source.sortDate || null) || effectiveDate;
            const createdAt = G.parseConsultationDate(source.createdAt || null) || sortDate;
            const updatedAt = G.parseConsultationDate(source.updatedAt || null) || now;
            const status = source.status ? String(source.status) : '';
            const isDeleted = !!(options && options.forceDeleted) || status !== 'completed';
            const parsed = isDeleted ? { items: [], totalAmount: 0 } : parseFinancialBillingItems(source);
            const summaryItems = cloneFinancialSummaryItems(parsed.items);

            return {
                consultationId: String(consultationId || ''),
                doctor: source.doctor ? String(source.doctor) : '',
                status: isDeleted ? (status || 'deleted') : 'completed',
                clinicId: source && source.clinicId !== undefined && source.clinicId !== null ? source.clinicId : null,
                clinicName: source.clinicName ? String(source.clinicName) : '',
                patientId: source.patientId ? String(source.patientId) : '',
                patientName: source.patientName ? String(source.patientName) : '',
                date: effectiveDate,
                dateKey: formatFinancialDate(effectiveDate),
                sortDate,
                totalAmount: Number(parsed.totalAmount) || 0,
                summaryItems,
                summaryItemCount: summaryItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
                createdAt,
                updatedAt,
                syncedAt: now,
                isDeleted
            };
        }

        // 個人統計：客戶端唯讀；所有寫入走 /api/personal-stats/*（SA 端）
        const PERSONAL_STATS_SUMMARY_COLLECTION = 'personalStatisticsMonthlySummaries';

        export function getCurrentAuthUid() {
            try {
                const u = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
                return u && u.uid ? String(u.uid) : '';
            } catch (_e) {
                return '';
            }
        }

        export async function callPersonalStatsApi(path, payload) {
            await G.waitForFirebase();
            const fbUser = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
            if (!fbUser) throw new Error('未登入，無法更新個人統計');
            const token = await fbUser.getIdToken();
            const res = await fetch('/api/personal-stats/' + path, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload || {})
            });
            let data = null;
            try { data = await res.json(); } catch (_e) {}
            if (!res.ok) {
                const err = new Error((data && data.message) || ('HTTP ' + res.status));
                err.status = res.status;
                if (data && data.error) err.code = data.error;
                throw err;
            }
            return data || {};
        }

        export async function callFinancialStatsApi(path, payload) {
            await G.waitForFirebase();
            const fbUser = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
            if (!fbUser) throw new Error('未登入，無法更新財務聚合');
            const token = await fbUser.getIdToken();
            const res = await fetch('/api/financial-stats/' + path, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload || {})
            });
            let data = null;
            try { data = await res.json(); } catch (_e) {}
            if (!res.ok) {
                const err = new Error((data && data.message) || ('HTTP ' + res.status));
                err.status = res.status;
                if (data && data.error) err.code = data.error;
                throw err;
            }
            return data || {};
        }

        export function normalizePersonalStatsString(value) {
            if (value === undefined || value === null) return '';
            try {
                return String(value).trim();
            } catch (_e) {
                return '';
            }
        }

        export function clearPersonalStatisticsLocalCache(ownerIds) {
            const owners = Array.from(new Set((Array.isArray(ownerIds) ? ownerIds : []).map((id) => normalizePersonalStatsString(id)).filter(Boolean)));
            if (!owners.length) return;
            ['personalStatsV2', 'personalStatsV3'].forEach((storageKey) => {
                try {
                    const raw = localStorage.getItem(storageKey);
                    if (!raw) return;
                    const parsed = JSON.parse(raw);
                    let changed = false;
                    owners.forEach((ownerId) => {
                        if (parsed && Object.prototype.hasOwnProperty.call(parsed, ownerId)) {
                            delete parsed[ownerId];
                            changed = true;
                        }
                    });
                    if (changed) {
                        localStorage.setItem(storageKey, JSON.stringify(parsed));
                    }
                } catch (_e) {}
            });
        }

        export function normalizeFinancialRecordForReport(item) {
            if (!item || typeof item !== 'object') return null;
            const hasSummary = Array.isArray(item.summaryItems);
            const effectiveDate = G.getConsultationEffectiveDate(item, new Date());
            const dateStr = effectiveDate ? effectiveDate.toISOString() : null;
            if (hasSummary) {
                return {
                    id: String(item.consultationId || item.id || ''),
                    consultationId: String(item.consultationId || item.id || ''),
                    date: dateStr,
                    doctor: item.doctor || '',
                    status: item.status || '',
                    clinicId: item.clinicId !== undefined ? item.clinicId : null,
                    clinicName: item.clinicName || '',
                    financialSummaryItems: cloneFinancialSummaryItems(item.summaryItems),
                    financialTotalAmount: Number(item.totalAmount) || 0,
                    createdAt: item.createdAt || null,
                    updatedAt: item.updatedAt || null,
                    summarySyncedAt: item.syncedAt || null
                };
            }
            return {
                id: String(item.id || item.consultationId || ''),
                consultationId: String(item.id || item.consultationId || ''),
                date: dateStr,
                doctor: item.doctor || '',
                status: item.status || '',
                billingItems: item.billingItems || '',
                billingItemsStructured: item.billingItemsStructured || '[]',
                clinicId: item.clinicId !== undefined ? item.clinicId : null,
                clinicName: item.clinicName || '',
                createdAt: item.createdAt || null,
                updatedAt: item.updatedAt || null,
                summarySyncedAt: item.syncedAt || null
            };
        }

        export function getFinancialReportSyncTimestamp(record) {
            const candidates = [
                record && record.summarySyncedAt,
                record && record.updatedAt,
                record && record.createdAt
            ];
            for (const candidate of candidates) {
                const parsed = G.parseConsultationDate(candidate);
                const ts = parsed && !isNaN(parsed.getTime()) ? parsed.getTime() : 0;
                if (ts) return ts;
            }
            return 0;
        }

        export function getFinancialSummaryCoverageKey(startDate, endDate, doctorFilter, clinicFilter) {
            return `${startDate || ''}|${endDate || ''}|${doctorFilter || ''}|${clinicFilter || ''}`;
        }

        // 根據項目名稱推斷類別
        export function getFinancialCategoryFromItemName(itemName) {
            if (itemName.includes('診金') || itemName.includes('診療') || itemName.includes('初診') || itemName.includes('複診')) {
                return 'consultation';
            } else if (itemName.includes('藥') || itemName.includes('中藥') || itemName.includes('調劑')) {
                return 'medicine';
            } else if (itemName.includes('針灸') || itemName.includes('推拿') || itemName.includes('拔罐') || itemName.includes('刮痧') || itemName.includes('艾灸')) {
                return 'treatment';
            } else if (itemName.includes('折扣') || itemName.includes('優惠')) {
                return 'discount';
            } else if (itemName.includes('套票') || itemName.includes('套餐') || itemName.includes('療程') || itemName.includes('方案')) {
                return 'package';
            } else {
                return 'other';
            }
        }

        // 生成財務報表
        // 改為 async 以便在更新報表前重新載入最新的診症資料，確保「更新報表」按鈕真正更新內容。
        export async function generateFinancialReport() {
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const doctorFilter = document.getElementById('doctorFilter').value;
            const clinicFilterEl = document.getElementById('clinicFilterFinancial');
            const clinicFilter = clinicFilterEl ? clinicFilterEl.value : '';

            if (!startDate || !endDate) {
                G.showToast('請選擇日期範圍！', 'error');
                return;
            }

            // 記錄目前範圍，供圖表連續日期軸使用
            currentFinancialRange = { startDate, endDate };

            setFinancialReportLoadingState();

            const cacheKey = getFinancialReportCacheKey(startDate, endDate, doctorFilter, clinicFilter);
            const existing = financialReportCache[cacheKey] || readPersistedFinancialCache(cacheKey);
            const nowTs = Date.now();
            if (existing && financialReportLastKey === cacheKey && (nowTs - financialReportLastRunAt) < FINANCIAL_REPORT_MIN_REFRESH_MS) {
                updateFinancialKeyMetrics(existing.stats);
                updateFinancialTables(existing.records, existing.stats);
                document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('zh-TW');
                await refreshWalletFinancialSection(startDate, endDate, clinicFilter);
                G.showToast('財務報表已更新（短時間內使用快取）', 'success');
                return;
            }
            if (existing) {
                try {
                    if (window.firebaseDataManager && typeof window.firebaseDataManager.hasConsultationUpdates === 'function') {
                        const lastSyncAtRef = existing.lastSyncAt ? new Date(existing.lastSyncAt) : null;
                        // 按需鑽取快取：records 為空時，若有更新就跳過 delta merge，
                        // 交給下方的 dailyStats 路徑重新讀取聚合（比合併 delta 更省流量）
                        const isOnDemandCache = Array.isArray(existing.records) && existing.records.length === 0;
                        if (isOnDemandCache) {
                            // 無更新 → 直接用快取；有更新 → 跳出 if (existing)，讓下方重跑
                            const useSummaryDelta = typeof window.firebaseDataManager.hasConsultationFinancialSummaryUpdates === 'function';
                            const hasUpdates = useSummaryDelta
                                ? await window.firebaseDataManager.hasConsultationFinancialSummaryUpdates(startDate, endDate, doctorFilter || null, lastSyncAtRef, clinicFilter || null)
                                : await window.firebaseDataManager.hasConsultationUpdates(startDate, endDate, doctorFilter || null, lastSyncAtRef, clinicFilter || null);
                            if (!hasUpdates) {
                                updateFinancialKeyMetrics(existing.stats);
                                updateFinancialTables(existing.records, existing.stats);
                                document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('zh-TW');
                                financialReportLastKey = cacheKey;
                                financialReportLastRunAt = Date.now();
                                await refreshWalletFinancialSection(startDate, endDate, clinicFilter);
                                G.showToast('財務報表已更新（聚合快取）！', 'success');
                                return;
                            }
                            // 有更新 → fall through 到下方重跑
                        } else {
                            // 傳統快取（有完整 records）→ 正常走 delta merge 邏輯
                            const useSummaryDelta = typeof window.firebaseDataManager.hasConsultationFinancialSummaryUpdates === 'function'
                                && typeof window.firebaseDataManager.getConsultationFinancialSummariesDeltaByRangeAndDoctor === 'function';
                            const hasUpdates = useSummaryDelta
                                ? await window.firebaseDataManager.hasConsultationFinancialSummaryUpdates(startDate, endDate, doctorFilter || null, lastSyncAtRef, clinicFilter || null)
                                : await window.firebaseDataManager.hasConsultationUpdates(startDate, endDate, doctorFilter || null, lastSyncAtRef, clinicFilter || null);
                            if (!hasUpdates) {
                                updateFinancialKeyMetrics(existing.stats);
                                updateFinancialTables(existing.records, existing.stats);
                                document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('zh-TW');
                                financialReportLastKey = cacheKey;
                                financialReportLastRunAt = Date.now();
                                await refreshWalletFinancialSection(startDate, endDate, clinicFilter);
                                G.showToast('財務報表已更新（使用快取）！', 'success');
                                return;
                            }
                            const deltaRes = useSummaryDelta
                                ? await window.firebaseDataManager.getConsultationFinancialSummariesDeltaByRangeAndDoctor(lastSyncAtRef, startDate, endDate, doctorFilter || null, clinicFilter || null)
                                : await window.firebaseDataManager.getConsultationsDeltaByRangeAndDoctor(lastSyncAtRef, doctorFilter || null, true, clinicFilter || null);
                            if (deltaRes && deltaRes.success) {
                                const deltas = deltaRes.data.map(normalizeFinancialRecordForReport).filter(Boolean);
                                const start = financialDayStart(startDate);
                                const end = financialDayEnd(endDate);
                                const mf = (c) => {
                                    const d = new Date(c.date);
                                    const dateInRange = d >= start && d <= end;
                                    const doctorMatch = !doctorFilter || c.doctor === doctorFilter;
                                    const clinicMatch = !clinicFilter || (c.clinicId && String(c.clinicId) === String(clinicFilter));
                                    const isCompleted = c.status === 'completed';
                                    return dateInRange && doctorMatch && clinicMatch && isCompleted;
                                };
                                const index = new Map(existing.records.map(c => [String(c.id), c]));
                                for (const r of deltas) {
                                    const id = String(r.id);
                                    if (mf(r)) {
                                        index.set(id, r);
                                    } else {
                                        index.delete(id);
                                    }
                                }
                                const merged = Array.from(index.values());
                                const stats = calculateFinancialStatistics(merged);
                                loadFinancialPrevPeriodInBackground(cacheKey, stats, startDate, endDate, doctorFilter, clinicFilter);
                                const [costRes] = await Promise.all([
                                    getApportionedCost(startDate, endDate, clinicFilter || null),
                                    refreshWalletFinancialSection(startDate, endDate, clinicFilter)
                                ]);
                                stats.totalCost = costRes.totalCost;
                                stats.netRevenue = stats.totalRevenue - costRes.totalCost;
                                stats.costProrated = costRes.prorated;
                                updateFinancialKeyMetrics(stats);
                                updateFinancialTables(merged, stats);
                                const lastSyncAt = (() => {
                                    let latest = existing.lastSyncAt ? new Date(existing.lastSyncAt).getTime() : 0;
                                    for (const c of deltas) {
                                        const t = getFinancialReportSyncTimestamp(c);
                                        if (t && t > latest) latest = t;
                                    }
                                    return latest ? new Date(latest) : new Date();
                                })();
                                const entry = buildFinancialCacheEntry(merged, stats, lastSyncAt.toISOString());
                                financialReportCache[cacheKey] = entry;
                                writePersistedFinancialCache(cacheKey, entry);
                                financialReportLastKey = cacheKey;
                                financialReportLastRunAt = Date.now();
                                document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('zh-TW');
                                G.showToast('財務報表已更新！', 'success');
                                return;
                            }
                        }
                    }
                } catch (_e) {}
            }
            if (typeof loadConsultationsForFinancial === 'function') {
                try {
                    // 1. 先嘗試 dailyFinancialStats 聚合（N 筆／月，最快）
                    //    後端 bucket 的 doctorStats 欄位本身已按醫師分組，
                    //    aggregateFromDailyStats 也支援 doctorFilter 過濾，
                    //    所以有無醫師過濾都能走這條路徑。
                    let useDailyStats = false;
                    let dailyStats = [];

                    if (window.firebaseDataManager
                        && typeof window.firebaseDataManager.getDailyFinancialStatsByRange === 'function') {
                        try {
                            const dsRes = await window.firebaseDataManager.getDailyFinancialStatsByRange(
                                startDate, endDate, clinicFilter || null
                            );
                            if (dsRes && dsRes.success && Array.isArray(dsRes.data) && dsRes.data.length > 0) {
                                dailyStats = dsRes.data;
                                useDailyStats = true;
                            } else if (dsRes && dsRes.success && Array.isArray(dsRes.data) && dsRes.data.length === 0) {
                                // 集合存在但無資料 → 背景觸發重建（首次使用或資料遺漏）
                                try {
                                    window.firebaseDataManager.ensureDailyFinancialStatsInitialized(
                                        startDate, endDate, clinicFilter || null
                                    ).catch(() => {});
                                } catch (_bgErr) {}
                            }
                        } catch (_dsErr) {
                            // daily stats 尚未建立（索引未建 / 首次使用），
                            // 靜默 fallback 到下方聚合查詢路徑
                        }
                    }

                    if (useDailyStats) {
                        // 聚合模式：只讀 dailyFinancialStats（N 筆／月），
                        // 不並發拉完整 consultations。鑽取時才按需查詢。
                        const fastStats = aggregateFromDailyStats(dailyStats, startDate, endDate, doctorFilter);
                        loadFinancialPrevPeriodInBackground(cacheKey, fastStats, startDate, endDate, doctorFilter, clinicFilter);
                        const [costRes] = await Promise.all([
                            getApportionedCost(startDate, endDate, clinicFilter || null),
                            refreshWalletFinancialSection(startDate, endDate, clinicFilter)
                        ]);
                        fastStats.totalCost = costRes.totalCost;
                        fastStats.netRevenue = fastStats.totalRevenue - costRes.totalCost;
                        fastStats.costProrated = costRes.prorated;

                        updateFinancialKeyMetrics(fastStats);
                        updateFinancialTables([], fastStats);

                        const lastSyncAt = (() => {
                            let latest = 0;
                            for (const b of dailyStats) {
                                const t = G.parseConsultationDate(b.syncedAt);
                                if (t && t.getTime() > latest) latest = t.getTime();
                            }
                            return latest ? new Date(latest) : new Date();
                        })();
                        const entry = buildFinancialCacheEntry([], fastStats, lastSyncAt.toISOString());
                        financialReportCache[cacheKey] = entry;
                        writePersistedFinancialCache(cacheKey, entry);
                        financialReportLastKey = cacheKey;
                        financialReportLastRunAt = Date.now();
                        document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('zh-TW');
                        G.showToast('財務報表已更新（聚合模式，點擊表格可鑽取明細）！', 'success');
                        return;
                    }

                    // 2. dailyStats 不存在：直接拉全量 consultations（最可靠的 fallback）
                    //    伺服器端聚合查詢（getFinancialAggregates）只有在確認
                    //    consultationFinancialSummaries 有完整資料後才會啟用，
                    //    否則查詢成功但回 0 筆會導致畫面全零。
                    await loadConsultationsForFinancial();
                } catch (err) {
                    console.error('載入財務資料失敗:', err);
                }
            }

            // 過濾診症資料 + 計算統計（同步，本地運算）
            const filteredConsultations = filterFinancialConsultations(startDate, endDate, doctorFilter, clinicFilter);
            const stats = calculateFinancialStatistics(filteredConsultations);

            // 環比在背景獨立執行，完成後自行更新 UI
            loadFinancialPrevPeriodInBackground(cacheKey, stats, startDate, endDate, doctorFilter, clinicFilter);
            // 成本查詢 + 儲值查詢並發，縮短總等待時間
            const [costRes] = await Promise.all([
                getApportionedCost(startDate, endDate, clinicFilter || null),
                refreshWalletFinancialSection(startDate, endDate, clinicFilter)
            ]);
            stats.totalCost = costRes.totalCost;
            stats.netRevenue = stats.totalRevenue - costRes.totalCost;
            stats.costProrated = costRes.prorated;

            // 更新關鍵指標
            updateFinancialKeyMetrics(stats);
            updateFinancialTables(filteredConsultations, stats);
            const lastSyncAt = (() => {
                let latest = 0;
                for (const c of filteredConsultations) {
                    const t = getFinancialReportSyncTimestamp(c);
                    if (t && t > latest) latest = t;
                }
                return latest ? new Date(latest) : new Date();
            })();
            const entry = buildFinancialCacheEntry(filteredConsultations, stats, lastSyncAt.toISOString());
            financialReportCache[cacheKey] = entry;
            writePersistedFinancialCache(cacheKey, entry);
            financialReportLastKey = cacheKey;
            financialReportLastRunAt = Date.now();
            document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('zh-TW');
            G.showToast('財務報表已更新！', 'success');
        }

        /**
         * 把 dailyFinancialStats 聚合陣列轉成 calculateFinancialStatistics
         * 相同格式的 stats 物件。支援 doctor 過濾（聚合內只含匹配醫師的桶）。
         * daily stats 不包含單筆診症明細，故不支援鑽取。
         */
        export function aggregateFromDailyStats(dailyStats, startDate, endDate, doctorFilter) {
            let totalRevenue = 0;
            let totalConsultations = 0;
            const doctorStats = {};
            const serviceStats = {};
            const dailyStatsAgg = {};

            for (const bucket of dailyStats) {
                if (!bucket || bucket.totalConsultations <= 0) continue;
                // 日期 key
                const dayKey = bucket.dateKey || '';
                if (dayKey < startDate || dayKey > endDate) continue;

                // 醫師過濾：若指定 doctor，只累加該醫師的貢獻
                let doctorsToCount = bucket.doctorStats || {};
                if (doctorFilter) {
                    if (!doctorsToCount[doctorFilter]) continue; // 這天沒有該醫師
                    doctorsToCount = { [doctorFilter]: doctorsToCount[doctorFilter] };
                }

                let dayRevenue = 0;
                let dayCount = 0;
                for (const [doctor, d] of Object.entries(doctorsToCount)) {
                    const count = Math.round(d.count || 0);
                    const rev = Math.round(d.revenue || 0);
                    if (!doctorStats[doctor]) doctorStats[doctor] = { count: 0, revenue: 0 };
                    doctorStats[doctor].count += count;
                    doctorStats[doctor].revenue += rev;
                    dayCount += count;
                    dayRevenue += rev;
                }

                // 服務項目（服務過濾用 category，不依 doctor 拆分）
                const services = bucket.serviceStats || {};
                let dayServices = {};
                for (const [cat, s] of Object.entries(services)) {
                    const count = Math.round(s.count || 0);
                    const rev = Math.round(s.revenue || 0);
                    if (!serviceStats[cat]) serviceStats[cat] = {
                        name: getFinancialCategoryDisplayName(cat),
                        count: 0, revenue: 0, items: []
                    };
                    serviceStats[cat].count += count;
                    serviceStats[cat].revenue += rev;
                    dayServices[cat] = rev;
                }

                // 日期 key 聚合（供每日明細 / 趨勢圖）
                if (!dailyStatsAgg[dayKey]) {
                    dailyStatsAgg[dayKey] = { count: 0, revenue: 0, services: {} };
                }
                dailyStatsAgg[dayKey].count += dayCount;
                dailyStatsAgg[dayKey].revenue += dayRevenue;
                for (const [cat, rev] of Object.entries(dayServices)) {
                    dailyStatsAgg[dayKey].services[cat] = (dailyStatsAgg[dayKey].services[cat] || 0) + rev;
                }

                totalConsultations += dayCount;
                totalRevenue += dayRevenue;
            }

            const averageRevenue = totalConsultations > 0 ? Math.round(totalRevenue / totalConsultations) : 0;
            const activeDoctors = Object.keys(doctorStats).length;

            return {
                totalRevenue,
                totalConsultations,
                averageRevenue,
                activeDoctors,
                doctorStats,
                serviceStats,
                dailyStats: dailyStatsAgg
            };
        }

        // 過濾診症資料
        export function filterFinancialConsultations(startDate, endDate, doctorFilter, clinicFilter) {
            const start = financialDayStart(startDate);
            const end = financialDayEnd(endDate);

            return consultations.filter(consultation => {
                const consultationDate = new Date(consultation.date);
                const dateInRange = consultationDate >= start && consultationDate <= end;
                const doctorMatch = !doctorFilter || consultation.doctor === doctorFilter;
                const clinicMatch = !clinicFilter || (consultation.clinicId && String(consultation.clinicId) === String(clinicFilter));
                const isCompleted = consultation.status === 'completed';

                return dateInRange && doctorMatch && clinicMatch && isCompleted;
            });
        }

        // 直接抓取指定範圍診症記錄（不動全域 consultations），供環比使用
        export async function fetchFinancialRecordsForRange(startDate, endDate, doctorFilter, clinicFilter) {
            if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) return [];
            try {
                const res = await window.firebaseDataManager.getConsultationsByRangeAndDoctor(
                    startDate, endDate, doctorFilter || null, true, clinicFilter || null);
                if (res && res.success) {
                    return res.data.map(normalizeFinancialRecordForReport).filter(Boolean);
                }
            } catch (_e) {}
            return [];
        }

        // 計算「緊鄰的上一個等長期間」統計並附掛到 stats（prevPeriod）
        export async function attachPreviousPeriod(stats, startDate, endDate, doctorFilter, clinicFilter) {
            try {
                const lengthDays = enumerateFinancialDates(startDate, endDate).length;
                const prevEnd = shiftFinancialDate(startDate, -1);
                const prevStart = shiftFinancialDate(prevEnd, -(lengthDays - 1));
                const prevRecords = await fetchFinancialRecordsForRange(prevStart, prevEnd, doctorFilter, clinicFilter);
                const prevStats = calculateFinancialStatistics(prevRecords);
                stats.prevPeriod = {
                    startDate: prevStart,
                    endDate: prevEnd,
                    totalRevenue: prevStats.totalRevenue,
                    totalConsultations: prevStats.totalConsultations,
                    averageRevenue: prevStats.averageRevenue,
                    activeDoctors: prevStats.activeDoctors
                };
            } catch (_e) {}
            return stats;
        }

        // 背景載入環比：不阻塞主報表渲染。完成後若頁面仍顯示同一組
        // 報表，才更新四張卡片的環比 pill，並把結果寫回快取。
        let financialPrevPeriodToken = 0;
        export function loadFinancialPrevPeriodInBackground(cacheKey, stats, startDate, endDate, doctorFilter, clinicFilter) {
            const token = ++financialPrevPeriodToken;
            attachPreviousPeriod(stats, startDate, endDate, doctorFilter, clinicFilter)
                .then(() => {
                    if (token !== financialPrevPeriodToken || financialReportLastKey !== cacheKey) return;
                    updateFinancialKeyMetrics(stats);
                    const entry = financialReportCache[cacheKey];
                    if (entry && entry.stats === stats) {
                        writePersistedFinancialCache(cacheKey, entry);
                    }
                })
                .catch(() => {});
        }

        // 環比格式化：回傳 pill HTML 片段
        export function financialChangePill(current, previous) {
            const ft = (s) => (typeof t === 'function' ? t(s) : s);
            if (previous === null || previous === undefined) {
                return current > 0
                    ? `<span class="bg-white bg-opacity-25 text-white rounded-full px-2 py-0.5 text-xs">${ft('（新）')}</span>`
                    : '';
            }
            if (previous === 0) {
                return current === 0
                    ? `<span class="bg-white bg-opacity-25 text-white rounded-full px-2 py-0.5 text-xs">0%</span>`
                    : `<span class="bg-white text-green-700 rounded-full px-2 py-0.5 text-xs font-semibold">✦ ${ft('（新）')}</span>`;
            }
            const pct = ((current - previous) / previous) * 100;
            const up = pct >= 0;
            const cls = up ? 'bg-white text-green-700' : 'bg-white text-red-600';
            const arrow = up ? '▲' : '▼';
            return `<span class="${cls} rounded-full px-2 py-0.5 text-xs font-semibold">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
        }

        // 計算財務統計資料
        export function calculateFinancialStatistics(consultations) {
            let totalRevenue = 0;
            let totalConsultations = consultations.length;
            const doctorStats = {};
            const serviceStats = {};
            const dailyStats = {};

            consultations.forEach(consultation => {
                const parsed = Array.isArray(consultation && consultation.financialSummaryItems)
                    ? {
                        items: cloneFinancialSummaryItems(consultation.financialSummaryItems),
                        totalAmount: Number(consultation.financialTotalAmount) || 0
                    }
                    : parseFinancialBillingItems(consultation);
                const consultationRevenue = Number(parsed.totalAmount) || 0;
                totalRevenue += consultationRevenue;

                // 每日統計（先建立，供下方服務項目累加各類別金額）
                const dateKey = getFinancialDateKey(consultation.date);
                if (!dailyStats[dateKey]) {
                    dailyStats[dateKey] = {
                        count: 0,
                        revenue: 0,
                        services: {}
                    };
                }
                const daily = dailyStats[dateKey];
                daily.count += 1;
                daily.revenue += consultationRevenue;

                // 醫師統計
                if (!doctorStats[consultation.doctor]) {
                    doctorStats[consultation.doctor] = {
                        count: 0,
                        revenue: 0
                    };
                }
                doctorStats[consultation.doctor].count += 1;
                doctorStats[consultation.doctor].revenue += consultationRevenue;

                // 服務統計
                parsed.items.forEach(item => {
                    if (!serviceStats[item.category]) {
                        serviceStats[item.category] = {
                            name: getFinancialCategoryDisplayName(item.category),
                            count: 0,
                            revenue: 0,
                            items: []
                        };
                    }
                    serviceStats[item.category].count += item.quantity;
                    serviceStats[item.category].revenue += item.totalAmount;
                    serviceStats[item.category].items.push(item);
                    // 累計當日各類別金額，供每日明細判斷主要服務
                    daily.services[item.category] = (daily.services[item.category] || 0) + item.totalAmount;
                });
            });

            const averageRevenue = totalConsultations > 0 ? totalRevenue / totalConsultations : 0;
            const activeDoctors = Object.keys(doctorStats).length;

            return {
                totalRevenue,
                totalConsultations,
                averageRevenue,
                activeDoctors,
                doctorStats,
                serviceStats,
                dailyStats
            };
        }

        // 獲取類別顯示名稱
        export function getFinancialCategoryDisplayName(category) {
            const ft = (s) => (typeof t === 'function' ? t(s) : s);
            const names = {
                consultation: ft('診療費'),
                medicine: ft('藥費'),
                treatment: ft('治療費'),
                other: ft('其他費用'),
                discount: ft('折扣'),
                package: ft('套票項目'),
                packageUse: ft('套票使用')
            };
            return names[category] || category;
        }

        // 更新關鍵指標
        export function updateFinancialKeyMetrics(stats) {
            const ft = (s) => (typeof t === 'function' ? t(s) : s);
            const total = (typeof stats.totalRevenue === 'number') ? stats.totalRevenue : 0;
            const totalCost = (typeof stats.totalCost === 'number') ? stats.totalCost : 0;
            const net = (typeof stats.netRevenue === 'number') ? stats.netRevenue : (total - totalCost);
            document.getElementById('totalRevenue').textContent = `HK$${Math.round(total).toLocaleString()}`;
            document.getElementById('totalConsultations').textContent = stats.totalConsultations.toLocaleString();
            document.getElementById('averageRevenue').textContent = `HK$${Math.round(stats.averageRevenue).toLocaleString()}`;
            document.getElementById('activeDoctors').textContent = stats.activeDoctors;

            const prev = stats.prevPeriod || {};
            const labelHtml = `<span class="mr-1">${ft('較上期')}</span>`;
            // 總收入卡片：環比 pill + 淨收入與成本補充說明
            const rc = document.getElementById('revenueChange');
            if (rc) {
                const pill = stats.prevPeriod
                    ? financialChangePill(total, prev.totalRevenue)
                    : '';
                rc.innerHTML = `${labelHtml}${pill}`
                    + `<span class="block text-green-100 text-xs mt-1">`
                    + `${ft('淨收入')}：HK$${Math.round(net).toLocaleString()}`
                    + `（${ft('成本')}：HK$${Math.round(totalCost).toLocaleString()}）</span>`;
            }
            const cc = document.getElementById('consultationChange');
            if (cc) {
                cc.innerHTML = `${labelHtml}${stats.prevPeriod
                    ? financialChangePill(stats.totalConsultations, prev.totalConsultations)
                    : ''}`;
            }
            const ac = document.getElementById('averageChange');
            if (ac) {
                ac.innerHTML = `${labelHtml}${stats.prevPeriod
                    ? financialChangePill(stats.averageRevenue, prev.averageRevenue)
                    : ''}`;
            }
            const dc = document.getElementById('doctorChange');
            if (dc) {
                dc.innerHTML = `${labelHtml}${stats.prevPeriod
                    ? financialChangePill(stats.activeDoctors, prev.activeDoctors)
                    : ''}`;
            }
        }

        // 更新財務表格
        let currentFinancialConsultations = [];
        export function updateFinancialTables(consultations, stats) {
            currentFinancialConsultations = Array.isArray(consultations) ? consultations : [];
            updateFinancialSummaryTable(stats);
            updateFinancialDailyTable(stats.dailyStats);
            updateFinancialDoctorTable(stats.doctorStats);
            updateFinancialServiceTable(stats.serviceStats);
            updateFinancialCharts(stats);
        }

        // ============================================================
        // 財務圖表（Chart.js，已於 system.html 載入）
        // ============================================================
        let financialTrendChartInstance = null;
        let financialServiceChartInstance = null;
        // 目前報表範圍（generateFinancialReport 開始時更新），供圖表連續日期使用
        let currentFinancialRange = { startDate: '', endDate: '' };

        const FINANCIAL_CHART_COLORS = [
            '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
            '#ef4444', '#14b8a6', '#ec4899', '#6b7280'
        ];

        export function updateFinancialCharts(stats) {
            if (typeof Chart === 'undefined') return;
            const ft = (s) => (typeof t === 'function' ? t(s) : s);
            const { startDate, endDate} = currentFinancialRange;

            // 每日收入趨勢：連續日曆日，無診症補 0
            const trendCanvas = document.getElementById('financialTrendChart');
            if (trendCanvas) {
                if (financialTrendChartInstance) {
                    try { financialTrendChartInstance.destroy(); } catch (_e) {}
                }
                const dates = startDate && endDate ? enumerateFinancialDates(startDate, endDate) : [];
                const labels = dates.map(d => {
                    try {
                        return new Date(`${d}T00:00:00+08:00`).toLocaleDateString('zh-HK', { month: '2-digit', day: '2-digit' });
                    } catch (_e) { return d; }
                });
                const values = dates.map(d => {
                    const row = stats.dailyStats[d];
                    return row ? Math.round(row.revenue * 100) / 100 : 0;
                });
                financialTrendChartInstance = new Chart(trendCanvas.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: ft('收入金額'),
                            data: values,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16,185,129,0.15)',
                            fill: true,
                            tension: 0.25,
                            pointRadius: dates.length > 60 ? 0 : 2,
                            pointHoverRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => `HK$${Number(ctx.parsed.y || 0).toLocaleString()}`
                                }
                            }
                        },
                        scales: {
                            x: { ticks: { maxTicksLimit: 12, autoSkip: true } },
                            y: {
                                beginAtZero: true,
                                ticks: { callback: (v) => 'HK$' + Number(v).toLocaleString() }
                            }
                        }
                    }
                });
            }

            // 收入結構：服務類別甜甜圈（僅含金額為正的類別，折扣為負不適用）
            const serviceCanvas = document.getElementById('financialServiceChart');
            if (serviceCanvas) {
                if (financialServiceChartInstance) {
                    try { financialServiceChartInstance.destroy(); } catch (_e) {}
                }
                const entries = Object.values(stats.serviceStats || {})
                    .filter(s => Number(s.revenue) > 0)
                    .sort((a, b) => b.revenue - a.revenue);
                financialServiceChartInstance = new Chart(serviceCanvas.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: entries.map(e => e.name),
                        datasets: [{
                            data: entries.map(e => Math.round(e.revenue * 100) / 100),
                            backgroundColor: entries.map((_, i) => FINANCIAL_CHART_COLORS[i % FINANCIAL_CHART_COLORS.length])
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => {
                                        const total = ctx.dataset.data.reduce((s, v) => s + Number(v || 0), 0);
                                        const val = Number(ctx.parsed || 0);
                                        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                                        return `${ctx.label}: HK$${val.toLocaleString()}（${pct}%）`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

        // ============================================================
        // 鑽取：點擊每日明細／醫師列，列出背後診症單
        // 支援「按需鑽取模式」：聚合模式下 currentFinancialConsultations 為空，
        // 此時才從 consultationFinancialSummaries 拉取該日期/醫師的明細。
        // ============================================================
        export function showFinancialDrilldownLoading(modal, titleEl, body, label) {
            const ft = (s) => (typeof t === 'function' ? t(s) : s);
            if (titleEl) {
                titleEl.textContent = `${label}｜${ft('診症單')}`;
            }
            body.innerHTML = `<tr><td colspan="4" class="px-4 py-10 text-center text-gray-500">
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-green-500"></div>
                <div class="mt-2 text-sm">${ft('載入中…')}</div>
            </td></tr>`;
            modal.classList.remove('hidden');
        }

        export async function fetchFinancialDrilldownRecords(type, key) {
            if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) return [];
            const doctorEl = document.getElementById('doctorFilter');
            const clinicEl = document.getElementById('clinicFilterFinancial');
            const baseDoctor = doctorEl ? doctorEl.value || null : null;
            const clinicFilter = clinicEl ? clinicEl.value || null : null;

            try {
                let records = [];

                if (type === 'daily') {
                    // 單日鑽取：用 key（已就是 HK dateKey YYYY-MM-DD）
                    // 只拉這一天的資料（通常幾十筆），比全 range 查詢省得多
                    const res = await window.firebaseDataManager
                        .getConsultationFinancialSummariesByDateKey(key, baseDoctor, clinicFilter);
                    if (res && res.success) records = res.data;
                } else if (type === 'doctor') {
                    // 醫師鑽取：用報表的日期範圍 + doctor 過濾
                    const startEl = document.getElementById('startDate');
                    const endEl = document.getElementById('endDate');
                    const reportStart = startEl ? startEl.value : '';
                    const reportEnd = endEl ? endEl.value : '';
                    const res = await window.firebaseDataManager
                        .getConsultationFinancialSummariesByRangeAndDoctor(
                            reportStart, reportEnd, key, true, clinicFilter
                        );
                    if (res && res.success) records = res.data;
                }

                return records.map(normalizeFinancialRecordForReport).filter(Boolean);
            } catch (_e) {
                console.warn('按需鑽取失敗:', _e);
                return [];
            }
        }

        export async function openFinancialDrilldown(type, key, label) {
            const modal = document.getElementById('financialDrilldownModal');
            const titleEl = document.getElementById('financialDrilldownTitle');
            const body = document.getElementById('financialDrilldownBody');
            if (!modal || !body) return;

            const ft = (s) => (typeof t === 'function' ? t(s) : s);
            const esc = (s) => window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);

            // 決定用本地快取還是按需查詢
            let rows;
            const hasLocalData = Array.isArray(currentFinancialConsultations)
                && currentFinancialConsultations.length > 0;

            if (hasLocalData) {
                // 傳統路徑：本地已載入完整 consultations
                rows = currentFinancialConsultations.filter((c) => {
                    if (type === 'daily') return getFinancialDateKey(c.date) === key;
                    if (type === 'doctor') return String(c.doctor || '') === String(key);
                    return false;
                }).sort((a, b) => new Date(b.date) - new Date(a.date));
            } else {
                // 按需鑽取模式：顯示 loading → 查詢 → 渲染
                showFinancialDrilldownLoading(modal, titleEl, body, label);
                try {
                    rows = await fetchFinancialDrilldownRecords(type, key);
                    rows.sort((a, b) => new Date(b.date) - new Date(a.date));
                } catch (_e) {
                    body.innerHTML = `<tr><td colspan="4" class="px-4 py-6 text-center text-red-500">${ft('載入失敗，請重試')}</td></tr>`;
                    return;
                }
            }

            if (titleEl) {
                titleEl.textContent = `${label}｜${ft('診症單')} ${rows.length} ${ft('筆')}`;
            }

            if (!rows.length) {
                body.innerHTML = `<tr><td colspan="4" class="px-4 py-6 text-center text-gray-500">${ft('無資料')}</td></tr>`;
            } else {
                body.innerHTML = rows.map((c) => {
                    let timeText = String(c.date || '');
                    try {
                        timeText = new Date(c.date).toLocaleString('zh-HK', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    } catch (_e) {}
                    // 單張金額：與報表相同解析口徑
                    const parsed = Array.isArray(c.financialSummaryItems)
                        ? Number(c.financialTotalAmount) || 0
                        : Number(parseFinancialBillingItems(c).totalAmount) || 0;
                    return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">${esc(timeText)}</td>
                        <td class="px-4 py-3 text-sm text-gray-900">${esc(c.patientName || '未知病人')}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">HK$${parsed.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-right">
                            <button type="button" data-drilldown-id="${esc(c.id)}"
                                class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">
                                ${ft('查看病歷')}
                            </button>
                        </td>
                    </tr>`;
                }).join('');
                body.querySelectorAll('button[data-drilldown-id]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        if (typeof G.viewMedicalRecord === 'function') {
                            G.viewMedicalRecord(btn.getAttribute('data-drilldown-id'), btn);
                        }
                    });
                });
            }
            modal.classList.remove('hidden');
        }

        export function closeFinancialDrilldown() {
            const modal = document.getElementById('financialDrilldownModal');
            if (modal) modal.classList.add('hidden');
        }
        window.closeFinancialDrilldown = closeFinancialDrilldown;

        // 更新收入摘要表格
        export function updateFinancialSummaryTable(stats) {
            const tbody = document.getElementById('financialSummaryTableBody');
            const ft = (s) => (typeof t === 'function' ? t(s) : s);
            const summaryData = [
                { item: ft('診療費收入'), amount: 0, category: 'consultation' },
                { item: ft('藥費收入'), amount: 0, category: 'medicine' },
                { item: ft('治療費收入'), amount: 0, category: 'treatment' },
                { item: ft('其他收入'), amount: 0, category: 'other' },
                { item: ft('套票收入'), amount: 0, category: 'package' },
                { item: ft('套票扣減'), amount: 0, category: 'packageUse' },
                { item: ft('折扣/優惠'), amount: 0, category: 'discount' }
            ];

            // 計算各類別收入
            Object.keys(stats.serviceStats).forEach(category => {
                const stat = stats.serviceStats[category];
                const summaryItem = summaryData.find(item => item.category === category);
                if (summaryItem) {
                    summaryItem.amount = stat.revenue;
                }
            });

            const totalRevenue = typeof stats.totalRevenue === 'number' ? stats.totalRevenue : 0;

            const totalCost = typeof stats.totalCost === 'number' ? stats.totalCost : 0;
            const netRevenue = typeof stats.netRevenue === 'number' ? stats.netRevenue : (totalRevenue - totalCost);
            const extendedRows = [
                { item: ft('總收入'), amount: totalRevenue, category: 'total', ratioKind: ft('收入佔比'), note: ft('統計期間') },
                { item: ft('總成本'), amount: totalCost, category: 'expense', ratioKind: ft('成本率'), note: stats.costProrated ? ft('部分月份按天數分攤') : ft('統計期間') },
                { item: ft('淨收入'), amount: netRevenue, category: 'net', ratioKind: ft('利潤率'), note: ft('統計期間') }
            ];

            tbody.innerHTML = summaryData.concat(extendedRows).map(item => {
                const percentage = totalRevenue > 0 ? ((item.amount / totalRevenue) * 100).toFixed(1) : '0';
                const ratioKind = item.ratioKind || ft('收入佔比');
                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 text-sm text-gray-900">${item.item}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">HK$${item.amount.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right whitespace-nowrap">${percentage}%<span class="block text-xs text-gray-400">${ratioKind}</span></td>
                        <td class="px-4 py-3 text-sm text-gray-500 text-right">${item.note || ft('統計期間')}</td>
                    </tr>
                `;
            }).join('');
        }

        // 更新每日明細表格
        export function updateFinancialDailyTable(dailyStats) {
            const tbody = document.getElementById('financialDailyTableBody');
            const sortedDates = Object.keys(dailyStats).sort().reverse();

            if (sortedDates.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                            ${t('選定期間內沒有診症記錄')}
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = sortedDates.map(date => {
                const stat = dailyStats[date];
                const averageDaily = stat.count > 0 ? Math.round(stat.revenue / stat.count) : 0;
                const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('zh-TW');
                // 主要服務：取當日金額最高的類別
                const serviceEntries = Object.entries(stat.services || {});
                const mainService = serviceEntries.length
                    ? getFinancialCategoryDisplayName(serviceEntries.sort((a, b) => b[1] - a[1])[0][0])
                    : '—';

                return `
                    <tr class="hover:bg-gray-50 cursor-pointer" data-drilldown-date="${date}" data-drilldown-label="${formattedDate}">
                        <td class="px-4 py-3 text-sm text-gray-900">${formattedDate}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${stat.count}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">HK$${stat.revenue.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">HK$${averageDaily.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600">${window.escapeHtml(mainService)}</td>
                    </tr>
                `;
            }).join('');
            tbody.querySelectorAll('tr[data-drilldown-date]').forEach((tr) => {
                tr.addEventListener('click', () => openFinancialDrilldown(
                    'daily',
                    tr.getAttribute('data-drilldown-date'),
                    tr.getAttribute('data-drilldown-label')
                ));
            });
        }

        // 更新醫師業績表格
        export function updateFinancialDoctorTable(doctorStats) {
            const tbody = document.getElementById('financialDoctorTableBody');
            const totalRevenue = Object.values(doctorStats).reduce((sum, stat) => sum + stat.revenue, 0);

            if (Object.keys(doctorStats).length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                            ${t('選定期間內沒有醫師診症記錄')}
                        </td>
                    </tr>
                `;
                return;
            }

            const sortedDoctors = Object.entries(doctorStats).sort(([,a], [,b]) => b.revenue - a.revenue);

            tbody.innerHTML = sortedDoctors.map(([doctorUsername, stat]) => {
                const percentage = totalRevenue > 0 ? ((stat.revenue / totalRevenue) * 100).toFixed(1) : '0';
                const average = stat.count > 0 ? Math.round(stat.revenue / stat.count) : 0;
                const doctorName = G.getDoctorDisplayName(doctorUsername);
                const attrEsc = (s) => window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);

                return `
                    <tr class="hover:bg-gray-50 cursor-pointer" data-drilldown-doctor="${attrEsc(doctorUsername)}" data-drilldown-label="${attrEsc(doctorName)}">
                        <td class="px-4 py-3 text-sm text-gray-900">${attrEsc(doctorName)}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${stat.count}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">HK$${stat.revenue.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">HK$${average.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">${percentage}%</td>
                    </tr>
                `;
            }).join('');
            tbody.querySelectorAll('tr[data-drilldown-doctor]').forEach((tr) => {
                tr.addEventListener('click', () => openFinancialDrilldown(
                    'doctor',
                    tr.getAttribute('data-drilldown-doctor'),
                    tr.getAttribute('data-drilldown-label')
                ));
            });
        }

        // 更新服務分析表格
        export function updateFinancialServiceTable(serviceStats) {
            const tbody = document.getElementById('financialServiceTableBody');
            const totalRevenue = Object.values(serviceStats).reduce((sum, stat) => sum + stat.revenue, 0);

            if (Object.keys(serviceStats).length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                            ${t('選定期間內沒有服務記錄')}
                        </td>
                    </tr>
                `;
                return;
            }

            const sortedServices = Object.entries(serviceStats).sort(([,a], [,b]) => b.revenue - a.revenue);

            tbody.innerHTML = sortedServices.map(([category, stat]) => {
                const percentage = totalRevenue > 0 ? ((stat.revenue / totalRevenue) * 100).toFixed(1) : '0';
                const average = stat.count > 0 ? Math.round(stat.revenue / stat.count) : 0;

                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 text-sm text-gray-900">${stat.name}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${stat.count}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">HK$${stat.revenue.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">HK$${average.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">${percentage}%</td>
                    </tr>
                `;
            }).join('');
        }

        // ============================================================
        // 會員儲值（財務報表專區）
        // ------------------------------------------------------------
        // 會計口徑：
        //  - 充值＝現金流入（遞延收入/負債），不計入「總收入」
        //  - 儲值支付＝沖銷負債，消費金額已按全額計入診症收入，不重複計
        //  - 退款＝回補會員帳戶（不直接退現金）
        //  - 期末會員餘額＝目前會員預存（本金＋贈送），屬診所負債
        //  - 新制交易／帳戶自帶 clinicId，直接以欄位歸診所；
        //    舊制無欄位資料才由診症記錄 patientId→clinicId 推得
        // ============================================================
        const WALLET_FIN_CACHE_TTL_MS = 5 * 60 * 1000;
        const walletFinMemCache = new Map(); // 日期範圍 -> { at, raw }

        // 香港時區日界 → ISO（避免 UTC 日界造成跨日誤差）
        export function walletFinRangeIso(startDate, endDate) {
            return {
                startIso: new Date(`${startDate}T00:00:00+08:00`).toISOString(),
                endIso: new Date(`${endDate}T23:59:59.999+08:00`).toISOString()
            };
        }

        // Firestore 游標分頁抓取：寫死 limit(300/500) 在規模變大時會靜默
        // 漏掉超出頁面的資料，這裡用 startAfter 文件游標翻到用盡為止。
        // 約束中可含 orderBy；游標一律以最後一份文件快照定位
        // （未指定 orderBy 時 Firestore 隱含 __name__ 排序，同樣有效）。
        // 回傳 { docs, truncated }；truncated=true 代表觸及 maxDocs 安全上限。
        export async function walletFetchAllDocs(collectionName, constraints, opts = {}) {
            const fb = window.firebase;
            const pageSize = opts.pageSize || 300;
            const maxDocs = opts.maxDocs || 10000;
            const col = fb.collection(fb.db, collectionName);
            const docs = [];
            let lastDoc = null;
            let truncated = false;
            // 防呆：無約束的全表掃描極危險，強制呼叫端明確給條件
            if (!Array.isArray(constraints) || !constraints.length) {
                throw new Error('walletFetchAllDocs 必須帶查詢條件');
            }
            while (docs.length < maxDocs) {
                const remaining = Math.min(pageSize, maxDocs - docs.length);
                const qs = constraints.slice();
                if (lastDoc) qs.push(fb.startAfter(lastDoc));
                qs.push(fb.limit(remaining));
                const snap = await fb.getDocs(fb.firestoreQuery(col, ...qs));
                const batch = snap.docs || [];
                if (!batch.length) break;
                docs.push(...batch);
                lastDoc = batch[batch.length - 1];
                if (batch.length < remaining) break;
                if (docs.length >= maxDocs) {
                    truncated = true;
                    break;
                }
            }
            return { docs, truncated };
        }

        // ── 聚合查詢：一次性取得所有 KPI 指標（交易總額 + outstanding 餘額）
        // 6 個並行 getAggregateFromServer，只回傳數字取代全量文件抓取。
        // 失敗時（索引未部署）回傳 null，由呼叫端回退到 getDocs 路徑。
        export async function loadWalletFinAggregates(startDate, endDate, clinicFilter) {
            const fb = window.firebase;
            if (!fb || typeof fb.getAggregateFromServer !== 'function') {
                return null; // 聚合函式不可用 → 回退
            }
            const cid = clinicFilter ? String(clinicFilter) : '';
            const { startIso, endIso } = walletFinRangeIso(startDate, endDate);

            try {
                const buildTxQ = (type) => {
                    const col = fb.collection(fb.db, 'patientWalletTransactions');
                    const c = [];
                    if (cid) c.push(fb.where('clinicId', '==', cid));
                    c.push(fb.where('at', '>=', startIso));
                    c.push(fb.where('at', '<=', endIso));
                    c.push(fb.where('type', '==', type));
                    return fb.firestoreQuery(col, ...c);
                };

                const buildAccQ = () => {
                    const col = fb.collection(fb.db, 'patientWalletAccounts');
                    if (cid) {
                        return fb.firestoreQuery(col, fb.where('clinicId', '==', cid));
                    }
                    // 全部診所總覽：排除已遷移舊帳戶（同 loadWalletFinRaw 邏輯）
                    return fb.firestoreQuery(col, fb.where('walletMigratedAt', '==', null));
                };

                const [
                    topupSnap, topupBonusSnap, paySnap, refundSnap, adjustSnap, accSnap
                ] = await Promise.all([
                    fb.getAggregateFromServer(buildTxQ('topup'), {
                        total: fb.sum('amount'), count: fb.count()
                    }),
                    fb.getAggregateFromServer(buildTxQ('topupBonus'), {
                        total: fb.sum('amount'), count: fb.count()
                    }),
                    fb.getAggregateFromServer(buildTxQ('payment'), {
                        principal: fb.sum('fromBalance'),
                        bonus: fb.sum('fromBonus'),
                        count: fb.count()
                    }),
                    fb.getAggregateFromServer(buildTxQ('refund'), {
                        principal: fb.sum('fromBalance'),
                        bonus: fb.sum('fromBonus'),
                        count: fb.count()
                    }),
                    fb.getAggregateFromServer(buildTxQ('adjust'), {
                        net: fb.sum('amount'), count: fb.count()
                    }),
                    fb.getAggregateFromServer(buildAccQ(), {
                        principal: fb.sum('balance'),
                        bonus: fb.sum('bonusBalance')
                    })
                ]);

                const rnd = (n) => Math.round((Number(n) || 0) * 100) / 100;
                const n = (v) => Number(v) || 0;
                const d = (s) => s.data();

                return {
                    topupPrincipal: rnd(n(d(topupSnap).total)),
                    topupCount: n(d(topupSnap).count),
                    bonusIssued: rnd(n(d(topupBonusSnap).total)),
                    bonusCount: n(d(topupBonusSnap).count),
                    payPrincipal: rnd(n(d(paySnap).principal)),
                    payBonus: rnd(n(d(paySnap).bonus)),
                    payCount: n(d(paySnap).count),
                    refundPrincipal: rnd(n(d(refundSnap).principal)),
                    refundBonus: rnd(n(d(refundSnap).bonus)),
                    refundCount: n(d(refundSnap).count),
                    adjustNet: rnd(n(d(adjustSnap).net)),
                    adjustCount: n(d(adjustSnap).count),
                    outstandingPrincipal: rnd(n(d(accSnap).principal)),
                    outstandingBonus: rnd(n(d(accSnap).bonus))
                };
            } catch (err) {
                console.warn('錢包聚合查詢失敗，回退全量抓取:', err && err.message);
                return null;
            }
        }

        // 完全依介面篩選（clinicFilter 為空＝全部診所總覽）；日後收回
        // 跨診所權限時，繫結員工須再強制 cid = claim 的 clinicId。
        export async function loadWalletFinRaw(startDate, endDate, clinicFilter) {
            const fb = window.firebase;
            const cid = clinicFilter ? String(clinicFilter) : '';
            const { startIso, endIso } = walletFinRangeIso(startDate, endDate);
            const warnings = [];

            // 先嘗試聚合查詢拿 KPI（成功則 outstanding 帳戶不用全量抓）
            const aggregates = await loadWalletFinAggregates(startDate, endDate, cid);
            if (aggregates) {
                console.info('[WalletFin] 聚合查詢成功，KPI 走 fast path', {
                    topupPrincipal: aggregates.topupPrincipal,
                    payPrincipal: aggregates.payPrincipal,
                    payBonus: aggregates.payBonus,
                    outstandingPrincipal: aggregates.outstandingPrincipal,
                    outstandingBonus: aggregates.outstandingBonus
                });
            } else {
                console.warn('[WalletFin] 聚合查詢失敗，回退 getDocs 全量路徑');
            }

            // 交易文件：每日明細仍需 getDocs（Firestore 無 group by 日期）
            let txResult;
            if (cid) {
                txResult = await walletFetchAllDocs('patientWalletTransactions', [
                    fb.where('clinicId', '==', cid),
                    fb.where('at', '>=', startIso),
                    fb.where('at', '<=', endIso)
                ], { pageSize: 300, maxDocs: 10000 });
            } else {
                txResult = await walletFetchAllDocs('patientWalletTransactions', [
                    fb.where('at', '>=', startIso),
                    fb.where('at', '<=', endIso),
                    fb.orderBy('at', 'desc')
                ], { pageSize: 300, maxDocs: 10000 });
            }
            if (txResult.truncated) {
                warnings.push('儲值流水超過一萬筆，僅統計最近部分，請縮短報表期間');
            }
            const txs = txResult.docs.map((d) =>
                Object.assign({ id: d.id }, d.data()));

            // 帳戶：有 aggregates 就跳過全量抓取（節省 500+ 筆傳輸）
            let accounts = [];
            if (!aggregates) {
                let accResult;
                if (cid) {
                    accResult = await walletFetchAllDocs('patientWalletAccounts', [
                        fb.where('clinicId', '==', cid)
                    ], { pageSize: 300, maxDocs: 10000 });
                } else {
                    accResult = await walletFetchAllDocs('patientWalletAccounts', [
                        fb.orderBy('updatedAt', 'desc')
                    ], { pageSize: 300, maxDocs: 10000 });
                }
                if (accResult.truncated) {
                    warnings.push('儲值帳戶超過一萬個，期末餘額僅含部分帳戶');
                }
                accounts = accResult.docs
                    .map((d) => d.data())
                    .filter((a) => !(cid === '' && a && a.walletMigratedAt));
            }
            return { txs, accounts, aggregates, warnings };
        }

        export async function getWalletFinRaw(startDate, endDate, forceRefresh, clinicFilter) {
            const cid = clinicFilter ? String(clinicFilter) : '';
            const key = `${startDate}|${endDate}|${cid}`;
            const hit = walletFinMemCache.get(key);
            if (!forceRefresh && hit && (Date.now() - hit.at) < WALLET_FIN_CACHE_TTL_MS) {
                return hit.raw;
            }
            const raw = await loadWalletFinRaw(startDate, endDate, cid);
            walletFinMemCache.set(key, { at: Date.now(), raw });
            return raw;
        }

        // patientId → Set(clinicId) 及輔助索引：
        //  - patientClinics：來自診症記錄（含 clinicId 者）
        //  - appointmentClinics：appointmentId → clinicId（充值單可能只掛掛號）
        export function buildWalletPatientClinicMap() {
            const patientClinics = new Map();
            const appointmentClinics = new Map();

            (Array.isArray(consultations) ? consultations : []).forEach((c) => {
                if (c && c.patientId && c.clinicId) {
                    const pid = String(c.patientId);
                    if (!patientClinics.has(pid)) patientClinics.set(pid, new Set());
                    patientClinics.get(pid).add(String(c.clinicId));
                }
            });

            (Array.isArray(G.appointments) ? G.appointments : []).forEach((a) => {
                if (a && a.id && a.clinicId) {
                    appointmentClinics.set(String(a.id), String(a.clinicId));
                }
            });
            return { patientClinics, appointmentClinics };
        }

        export function calculateWalletFinancialStats(raw, clinicFilter) {
            const { aggregates } = raw || {};
            const { patientClinics, appointmentClinics } = buildWalletPatientClinicMap();
            const singleClinicId = (Array.isArray(G.clinicsList) && G.clinicsList.length === 1)
                ? String(G.clinicsList[0].id) : '';
            const txBelongs = (tx) => {
                if (!clinicFilter) return true;
                const f = String(clinicFilter);
                if (tx && tx.clinicId) return String(tx.clinicId) === f;
                if (singleClinicId && f === singleClinicId) return true;
                const set = patientClinics.get(String(tx && tx.patientId));
                if (set) return set.has(f);
                if (tx && tx.appointmentId
                    && appointmentClinics.get(String(tx.appointmentId)) === f) {
                    return true;
                }
                return false;
            };
            const accountBelongs = (acc) => {
                if (!clinicFilter) {
                    return !(acc && acc.walletMigratedAt);
                }
                const f = String(clinicFilter);
                if (acc && acc.clinicId) return String(acc.clinicId) === f;
                if (singleClinicId && f === singleClinicId
                    && acc && !acc.walletMigratedAt) return true;
                return !!(acc && acc.patientId
                    && patientClinics.get(String(acc.patientId))
                    && patientClinics.get(String(acc.patientId)).has(f));
            };

            // 有聚合結果 → KPI 直接用（與 getDocs 查詢條件一致，結果對齊）
            const stats = aggregates ? {
                topupCount: aggregates.topupCount,
                topupPrincipal: aggregates.topupPrincipal,
                bonusCount: aggregates.bonusCount,
                bonusIssued: aggregates.bonusIssued,
                payCount: aggregates.payCount,
                payPrincipal: aggregates.payPrincipal,
                payBonus: aggregates.payBonus,
                refundCount: aggregates.refundCount,
                refundPrincipal: aggregates.refundPrincipal,
                refundBonus: aggregates.refundBonus,
                adjustCount: aggregates.adjustCount,
                adjustNet: aggregates.adjustNet,
                outstandingPrincipal: aggregates.outstandingPrincipal,
                outstandingBonus: aggregates.outstandingBonus,
                daily: {}
            } : {
                topupCount: 0, topupPrincipal: 0,
                bonusCount: 0, bonusIssued: 0,
                payCount: 0, payPrincipal: 0, payBonus: 0,
                refundCount: 0, refundPrincipal: 0, refundBonus: 0,
                adjustCount: 0, adjustNet: 0,
                outstandingPrincipal: 0, outstandingBonus: 0,
                daily: {}
            };
            const ensureDay = (day) => {
                if (!stats.daily[day]) {
                    stats.daily[day] = {
                        topupCount: 0, topupAmount: 0,
                        payCount: 0, payAmount: 0,
                        refundAmount: 0
                    };
                }
                return stats.daily[day];
            };

            // 無 aggregates 時才從交易文件加總 KPI；
            // 有 aggregates 時只算每日明細（Firestore 無 group by 日期）
            (raw.txs || []).forEach((tx) => {
                if (!tx || !txBelongs(tx)) return;
                const amount = Number(tx.amount) || 0;
                const day = getFinancialDateKey(tx.at);
                if (!day) return;
                const row = ensureDay(day);
                switch (tx.type) {
                    case 'topup':
                        if (!aggregates) {
                            stats.topupCount += 1;
                            stats.topupPrincipal += amount;
                        }
                        row.topupCount += 1;
                        row.topupAmount += amount;
                        break;
                    case 'topupBonus':
                        if (!aggregates) {
                            stats.bonusCount += 1;
                            stats.bonusIssued += amount;
                        }
                        break;
                    case 'payment': {
                        if (!aggregates) {
                            stats.payCount += 1;
                        }
                        const fromBalance = Number(tx.fromBalance) || 0;
                        const fromBonus = Number(tx.fromBonus) || 0;
                        if (!aggregates) {
                            stats.payPrincipal += fromBalance;
                            stats.payBonus += fromBonus;
                        }
                        row.payCount += 1;
                        row.payAmount += (fromBalance + fromBonus);
                        break;
                    }
                    case 'refund': {
                        if (!aggregates) {
                            stats.refundCount += 1;
                        }
                        const fromBalance = Number(tx.fromBalance) || 0;
                        const fromBonus = Number(tx.fromBonus) || 0;
                        if (!aggregates) {
                            stats.refundPrincipal += fromBalance;
                            stats.refundBonus += fromBonus;
                        }
                        row.refundAmount += (fromBalance + fromBonus);
                        break;
                    }
                    case 'adjust':
                        if (!aggregates) {
                            stats.adjustCount += 1;
                            stats.adjustNet += amount;
                        }
                        break;
                    default:
                        break;
                }
            });

            // 無 aggregates 時才從帳戶文件加總 outstanding
            if (!aggregates) {
                (raw.accounts || []).forEach((acc) => {
                    if (!acc || !accountBelongs(acc)) return;
                    stats.outstandingPrincipal += Number(acc.balance) || 0;
                    stats.outstandingBonus += Number(acc.bonusBalance) || 0;
                });
            }

            // 統一圓整到 2 位小數（aggregates 已圓整過，但每日明細需要）
            if (!aggregates) {
                ['topupPrincipal', 'bonusIssued', 'payPrincipal', 'payBonus',
                 'refundPrincipal', 'refundBonus', 'adjustNet',
                 'outstandingPrincipal', 'outstandingBonus'].forEach((k) => {
                    stats[k] = Math.round(stats[k] * 100) / 100;
                });
            }
            Object.keys(stats.daily).forEach((d) => {
                const r = stats.daily[d];
                ['topupAmount', 'payAmount', 'refundAmount'].forEach((k) => {
                    r[k] = Math.round(r[k] * 100) / 100;
                });
            });
            return stats;
        }

        export function walletFinFmt(n) {
            return `HK$${Number(n || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2, maximumFractionDigits: 2
            })}`;
        }

        export function updateWalletFinSection(stats) {
            document.getElementById('walletFinTopup').textContent =
                walletFinFmt(stats.topupPrincipal);
            document.getElementById('walletFinPayment').textContent =
                walletFinFmt(stats.payPrincipal + stats.payBonus);
            document.getElementById('walletFinRefund').textContent =
                walletFinFmt(stats.refundPrincipal + stats.refundBonus);
            document.getElementById('walletFinOutstanding').textContent =
                walletFinFmt(stats.outstandingPrincipal + stats.outstandingBonus);

            const rows = [
                { item: t('儲值充值(本金)'), amount: stats.topupPrincipal, count: stats.topupCount, note: t('會員現金預存') },
                { item: t('充值贈送額'), amount: stats.bonusIssued, count: stats.bonusCount, note: t('診所贈送，無現金流入') },
                { item: t('儲值消費－本金'), amount: -stats.payPrincipal, count: stats.payCount, note: t('沖銷本金') },
                { item: t('儲值消費－贈送'), amount: -stats.payBonus, count: '', note: t('沖銷贈送額') },
                { item: t('退款'), amount: -(stats.refundPrincipal + stats.refundBonus), count: stats.refundCount, note: t('退回會員帳戶') },
                { item: t('人工調整（淨額）'), amount: stats.adjustNet, count: stats.adjustCount, note: t('正＝補入／負＝扣減') },
                { item: t('期末餘額－本金'), amount: stats.outstandingPrincipal, count: '', note: t('會員預存本金') },
                { item: t('期末餘額－贈送'), amount: stats.outstandingBonus, count: '', note: t('已贈送未使用') }
            ];
            document.getElementById('financialWalletSummaryBody').innerHTML = rows.map((r) => `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm text-gray-900">${r.item}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">${walletFinFmt(r.amount)}</td>
                    <td class="px-4 py-3 text-sm text-gray-600 text-right">${r.count === '' ? '' : r.count}</td>
                    <td class="px-4 py-3 text-sm text-gray-500">${r.note}</td>
                </tr>`).join('');

            const dates = Object.keys(stats.daily).sort().reverse();
            const dailyBody = document.getElementById('financialWalletDailyBody');
            if (!dates.length) {
                dailyBody.innerHTML = `
                    <tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">
                        ${t('選定期間內沒有儲值交易')}
                    </td></tr>`;
                return;
            }
            dailyBody.innerHTML = dates.map((day) => {
                const r = stats.daily[day];
                const formatted = new Date(`${day}T00:00:00+08:00`).toLocaleDateString('zh-HK');
                return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm text-gray-900">${formatted}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 text-right">${r.topupCount}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 text-right">${walletFinFmt(r.topupAmount)}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 text-right">${r.payCount}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 text-right">${walletFinFmt(r.payAmount)}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 text-right">${walletFinFmt(r.refundAmount)}</td>
                </tr>`;
            }).join('');
        }

        // #13 待收款追蹤：查詢 paymentStatus=='unpaid' 的診症單
        // （單欄位相等查詢，使用自動索引，無需複合索引），再於客戶端
        // 按報表日期範圍與診所篩選。
        let lastWalletFinQuery = null;
        // 待收款查詢狀態：複合索引缺失旗標＋全量 unpaid 文件的短快取
        let walletReceivablesIndexMissing = false;
        let walletUnpaidDocsCache = null;
        let walletUnpaidDocsAt = 0;
        export async function loadWalletReceivables(startDate, endDate, clinicFilter) {
            const fb = window.firebase;
            const start = financialDayStart(startDate);
            const end = financialDayEnd(endDate);

            // 首選：paymentStatus 相等 + date 範圍的複合查詢，由 Firestore
            // 端過濾日期，需 (paymentStatus, date) 複合索引。
            // 首次確認索引缺失後本工作階段直接跳過，不再白等失敗查詢。
            if (!walletReceivablesIndexMissing) try {
                const { docs, truncated } = await walletFetchAllDocs('consultations', [
                    fb.where('paymentStatus', '==', 'unpaid'),
                    fb.where('date', '>=', start),
                    fb.where('date', '<=', end),
                    fb.orderBy('date')
                ], { pageSize: 300, maxDocs: 5000 });
                const rows = [];
                docs.forEach((d) => {
                    const c = Object.assign({ id: d.id }, d.data() || {});
                    if (clinicFilter && String(c.clinicId || '') !== String(clinicFilter)) return;
                    rows.push(c);
                });
                rows.sort((a, b) => new Date(b.date) - new Date(a.date));
                return { rows, truncated, indexed: true };
            } catch (rangeErr) {
                // 缺少複合索引時 Firestore 會回帶建立連結的錯誤；印出連結
                // 並退回單欄位查詢（自動索引）＋客戶端過濾，功能不受影響。
                const msg = String((rangeErr && rangeErr.message) || rangeErr || '');
                if (msg.toLowerCase().includes('index')) {
                    walletReceivablesIndexMissing = true;
                    if (typeof window.indexManager !== 'undefined') {
                        window.indexManager.register(rangeErr, '待收款查詢（paymentStatus + date）');
                    }
                } else {
                    console.warn('待收款範圍查詢失敗，改用全量撈取：', msg);
                }
            }

            // Fallback：單欄位相等查詢（自動索引），客戶端按日期與診所過濾。
            // 全量 unpaid 文件（最多 5000 筆）做 15 秒短快取，快速重跑或
            // 連續改日期時直接複用，不再每次重撈。
            const nowTs = Date.now();
            let docs;
            let truncated = false;
            if (walletUnpaidDocsCache && (nowTs - walletUnpaidDocsAt) < FINANCIAL_REPORT_MIN_REFRESH_MS) {
                docs = walletUnpaidDocsCache.docs;
                truncated = walletUnpaidDocsCache.truncated;
            } else {
                const res = await walletFetchAllDocs('consultations', [
                    fb.where('paymentStatus', '==', 'unpaid')
                ], { pageSize: 300, maxDocs: 5000 });
                docs = res.docs;
                truncated = res.truncated;
                walletUnpaidDocsCache = { docs, truncated };
                walletUnpaidDocsAt = nowTs;
            }
            const rows = [];
            docs.forEach((d) => {
                const c = Object.assign({ id: d.id }, d.data() || {});
                const dt = new Date(c.date);
                if (!Number.isFinite(dt.getTime()) || dt < start || dt > end) return;
                if (clinicFilter && String(c.clinicId || '') !== String(clinicFilter)) return;
                rows.push(c);
            });
            rows.sort((a, b) => new Date(b.date) - new Date(a.date));
            return { rows, truncated, indexed: false };
        }

        export function renderWalletReceivables(rows) {
            const body = document.getElementById('financialReceivablesBody');
            const countEl = document.getElementById('financialReceivablesCount');
            if (!body) return;
            if (countEl) countEl.textContent = String(rows.length);
            if (!rows.length) {
                body.innerHTML = `
                    <tr><td colspan="6" class="px-4 py-6 text-center text-gray-500">
                        ${t('本期沒有待收款診症單')}
                    </td></tr>`;
                return;
            }
            const MAX_ROWS = 100;
            const shown = rows.slice(0, MAX_ROWS);
            const esc = (s) => window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);
            body.innerHTML = shown.map((c) => {
                const amount = Math.round((Number(c.pendingAmount) || 0) * 100) / 100;
                let dateText = String(c.date || '').slice(0, 10);
                try { dateText = new Date(c.date).toLocaleDateString('zh-HK'); } catch (_e) {}
                const clinic = (Array.isArray(G.clinicsList)
                    ? G.clinicsList.find((x) => String(x.id) === String(c.clinicId))
                    : null) || null;
                const clinicText = clinic ? G.getClinicDisplayName(clinic) : (c.clinicId || '—');
                const note = c.walletPaySkipped
                    ? t('已改用其他方式，待核銷')
                    : t('儲值扣款失敗');
                const cidAttr = esc(c.id);
                return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">${dateText}</td>
                    <td class="px-4 py-3 text-sm text-gray-900">${esc(c.patientName || t('未知病人'))}</td>
                    <td class="px-4 py-3 text-sm text-gray-600">${esc(clinicText)}</td>
                    <td class="px-4 py-3 text-sm text-red-600 text-right font-medium">HK$${amount.toFixed(2)}</td>
                    <td class="px-4 py-3 text-sm text-gray-500">${note}</td>
                    <td class="px-4 py-3 text-sm text-center">
                        <button type="button" data-receivable-id="${cidAttr}"
                            class="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded">
                            ${t('標記已收款')}
                        </button>
                    </td>
                </tr>`;
            }).join('') + (rows.length > MAX_ROWS ? `
                <tr><td colspan="6" class="px-4 py-3 text-center text-xs text-gray-500">
                    只顯示最近 ${MAX_ROWS} 筆，尚有 ${rows.length - MAX_ROWS} 筆（可縮短報表期間查看）
                </td></tr>` : '');
            body.querySelectorAll('button[data-receivable-id]').forEach((btn) => {
                btn.addEventListener('click', () => markWalletReceivablePaid(
                    btn.getAttribute('data-receivable-id')));
            });
        }

        export async function refreshWalletFinancialSection(startDate, endDate, clinicFilter, forceRefresh) {
            // 版本限制：會員功能關閉時（如簡單版）不讀取儲值資料，
            // 回報表匯出亦會因此略過會員儲值段落
            if (!G.versionFeatureEnabled('membership')) return null;
            lastWalletFinQuery = { startDate, endDate, clinicFilter };
            try {
                const raw = await getWalletFinRaw(
                    startDate, endDate, !!forceRefresh, clinicFilter);
                const stats = calculateWalletFinancialStats(raw, clinicFilter);
                updateWalletFinSection(stats);
                if (Array.isArray(raw.warnings) && raw.warnings.length) {
                    raw.warnings.forEach((w) => G.showToast(w, 'error'));
                }
                // 待收款獨立查詢失敗不影響儲值主統計
                try {
                    const recvResult = await loadWalletReceivables(startDate, endDate, clinicFilter);
                    renderWalletReceivables(recvResult.rows);
                    if (recvResult.truncated) {
                        G.showToast('待收款記錄超過五千筆，僅顯示部分，請縮短報表期間', 'error');
                    }
                } catch (recvError) {
                    console.error('載入待收款清單失敗:', recvError);
                    const recvBody = document.getElementById('financialReceivablesBody');
                    if (recvBody) {
                        recvBody.innerHTML = `
                            <tr><td colspan="6" class="px-4 py-6 text-center text-red-500">
                                ${t('暫時無法載入待收款清單，請稍後再按「更新報表」')}
                            </td></tr>`;
                    }
                }
                return stats;
            } catch (error) {
                console.error('載入會員儲值財務資料失敗:', error);
                const body = document.getElementById('financialWalletSummaryBody');
                if (body) {
                    body.innerHTML = `
                        <tr><td colspan="4" class="px-4 py-8 text-center text-red-500">
                            ${t('暫時無法載入儲值資料，請稍後再按「更新報表」')}
                        </td></tr>`;
                }
                return null;
            }
        }

        // 待收款核銷：員工確認已以現金／其他方式收到款項
        export async function markWalletReceivablePaid(consultationId) {
            if (!consultationId) return;
            const confirmed = await G.showConfirmation(
                '確認此診症單已全數收款（現金／其他方式）？\n確認後將自待收款清單移除。',
                'question'
            );
            if (!confirmed) return;
            try {
                await window.firebaseDataManager.updateConsultation(
                    String(consultationId),
                    {
                        paymentStatus: 'external_paid',
                        pendingAmount: 0,
                        externalPaidAt: new Date().toISOString()
                    },
                    { skipSideEffects: true }
                );
                G.showToast('已標記為收款完成', 'success');
                if (lastWalletFinQuery) {
                    await refreshWalletFinancialSection(
                        lastWalletFinQuery.startDate,
                        lastWalletFinQuery.endDate,
                        lastWalletFinQuery.clinicFilter,
                        true
                    );
                }
            } catch (error) {
                G.showToast('標記失敗：' + (error && error.message ? error.message : '未知錯誤'), 'error');
            }
        }
        window.markWalletReceivablePaid = markWalletReceivablePaid;

        // 切換財務標籤
        export function switchFinancialTab(tabType) {
            // 版本限制：會員功能關閉時（如簡單版）不可切換至「會員儲值」標籤
            if (tabType === 'wallet' && !G.versionFeatureEnabled('membership')) {
                G.showToast('目前版本未提供會員儲值功能', 'warning');
                return;
            }
            // 更新標籤按鈕樣式
            document.querySelectorAll('[role="tablist"] button').forEach(btn => {
                if (btn.id && btn.id.startsWith('financial')) {
                    btn.className = 'py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 font-medium text-sm transition duration-200';
                }
            });
            
            document.getElementById(`financial${tabType.charAt(0).toUpperCase() + tabType.slice(1)}Tab`).className = 'py-4 px-1 border-b-2 border-green-500 text-green-600 font-medium text-sm transition duration-200';

            // 隱藏所有標籤內容
            document.querySelectorAll('.financial-tab-content').forEach(content => {
                content.classList.add('hidden');
            });

            // 顯示選中的標籤內容
            document.getElementById(`financial${tabType.charAt(0).toUpperCase() + tabType.slice(1)}Content`).classList.remove('hidden');
            
            currentFinancialTabType = tabType;
        }

        // 匯出財務報表
export async function buildFinancialExportPayload() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    let doctorFilter = '';
    const doctorFilterInput = document.getElementById('doctorFilter');
    if (doctorFilterInput) doctorFilter = doctorFilterInput.value;
    let clinicFilter = '';
    const clinicFilterInput = document.getElementById('clinicFilterFinancial');
    if (clinicFilterInput) clinicFilter = clinicFilterInput.value;
    // 優先複用當前報表快取，確保匯出內容與畫面口徑一致
    const cacheKey = getFinancialReportCacheKey(startDate, endDate, doctorFilter, clinicFilter);
    const cachedEntry = financialReportCache[cacheKey] || readPersistedFinancialCache(cacheKey);
    let stats;
    if (cachedEntry && Array.isArray(cachedEntry.records) && cachedEntry.stats) {
        stats = cachedEntry.stats;
    } else {
        const fallbackConsultations = filterFinancialConsultations(startDate, endDate, doctorFilter, clinicFilter);
        stats = calculateFinancialStatistics(fallbackConsultations);
    }
    let totalCost = 0;
    let byType = {};
    let costProrated = false;
    try {
        const costRes = await getApportionedCost(startDate, endDate, clinicFilter || null);
        byType = costRes.byType || {};
        costProrated = !!costRes.prorated;
        // 與畫面同步：快取 stats 已有成本時以其為準
        totalCost = typeof stats.totalCost === 'number' ? stats.totalCost : costRes.totalCost;
    } catch (_e) {
        totalCost = typeof stats.totalCost === 'number' ? stats.totalCost : 0;
    }
    const clinicOpt = clinicFilter ? (Array.isArray(G.clinicsList) ? G.clinicsList.find(c => String(c.id) === String(clinicFilter)) : null) : null;
    const clinicName = clinicOpt ? (clinicOpt.chineseName || clinicOpt.englishName || clinicOpt.id) : clinicFilter;
    let walletStats = null;
    try {
        walletStats = await refreshWalletFinancialSection(startDate, endDate, clinicFilter);
    } catch (_e) {
        walletStats = null;
    }
    return {
        startDate,
        endDate,
        doctorFilter,
        clinicFilter,
        clinicName,
        stats,
        totalCost,
        byType,
        costProrated,
        walletStats,
        generatedAt: new Date().toLocaleString('zh-TW')
    };
}

export async function exportFinancialReportTxt() {
    const data = await buildFinancialExportPayload();
    const { startDate, endDate, doctorFilter, clinicFilter, clinicName, stats, totalCost, byType } = data;
    const ft = (s) => (typeof window.t === 'function' ? window.t(s) : s);
    const doctorLines = Object.keys(stats.doctorStats).map(key => {
        const d = stats.doctorStats[key];
        const doctorName = key || ft('未知醫師');
        return `${doctorName}: ${ft('次數')} ${d.count.toLocaleString()}，${ft('收入')} HK$${d.revenue.toLocaleString()}`;
    }).join('\n');
    const serviceLines = Object.values(stats.serviceStats).map(item => `${item.name}: ${ft('次數')} ${item.count.toLocaleString()}，${ft('收入')} HK$${item.revenue.toLocaleString()}`).join('\n');
    const dailyLines = Object.keys(stats.dailyStats).map(dateKey => {
        const d = stats.dailyStats[dateKey];
        return `${dateKey}: ${ft('次數')} ${d.count.toLocaleString()}，${ft('收入')} HK$${d.revenue.toLocaleString()}`;
    }).join('\n');
    let textReport = '';
    if (doctorFilter) textReport += `${ft('選擇醫師')}: ${doctorFilter}\n`;
    if (clinicFilter) textReport += `${ft('選擇診所')}: ${clinicName}\n`;
    textReport += `${ft('期間')}: ${startDate} ${ft('至')} ${endDate}\n`;
    textReport += `${ft('生成時間')}: ${data.generatedAt}\n`;
    textReport += `${ft('總收入(未扣成本)')}: HK$${stats.totalRevenue.toLocaleString()}\n`;
    textReport += `${ft('總成本')}: HK$${totalCost.toLocaleString()}\n`;
    textReport += `${ft('成本計算')}: ${data.costProrated ? ft('部分月份按天數分攤') : ft('整月實際成本')}\n`;
    textReport += `${ft('淨收入')}: HK$${(stats.totalRevenue - totalCost).toLocaleString()}\n`;
    textReport += `${ft('總診症數')}: ${stats.totalConsultations.toLocaleString()}\n`;
    textReport += `${ft('平均收入')}: HK$${Math.round(stats.averageRevenue).toLocaleString()}\n`;
    textReport += `${ft('有效醫師數')}: ${stats.activeDoctors.toLocaleString()}\n\n`;
    textReport += `${ft('醫師統計')}:\n${doctorLines || ft('無資料')}\n\n`;
    textReport += `${ft('服務分類統計')}:\n${serviceLines || ft('無資料')}\n\n`;
    textReport += `${ft('每日統計')}:\n${dailyLines || ft('無資料')}\n`;
    const costLines = Object.keys(byType).map(tp => `${tp}: HK$${Number(byType[tp] || 0).toLocaleString()}`).join('\n');
    textReport += `\n${ft('成本統計')}:\n${costLines || ft('無資料')}\n`;

    // 會員儲值統計
    const w = data.walletStats;
    if (w) {
        textReport += `\n${ft('會員儲值統計')}:\n`;
        textReport += `${ft('儲值充值(本金)')}: ${walletFinFmt(w.topupPrincipal)}（${w.topupCount} ${ft('筆')}；${ft('屬預存，非營業收入')}）\n`;
        textReport += `${ft('充值贈送額')}: ${walletFinFmt(w.bonusIssued)}（${w.bonusCount} ${ft('筆')}）\n`;
        textReport += `${ft('儲值消費')}: ${walletFinFmt(w.payPrincipal + w.payBonus)}（${w.payCount} ${ft('筆')}；${ft('已計入診症收入')}）\n`;
        textReport += `　－${ft('本金')} ${walletFinFmt(w.payPrincipal)}，${ft('贈送')} ${walletFinFmt(w.payBonus)}\n`;
        textReport += `${ft('退款')}: ${walletFinFmt(w.refundPrincipal + w.refundBonus)}（${w.refundCount} ${ft('筆')}）\n`;
        textReport += `${ft('人工調整(淨額)')}: ${walletFinFmt(w.adjustNet)}（${w.adjustCount} ${ft('筆')}）\n`;
        textReport += `${ft('期末會員餘額')}: ${walletFinFmt(w.outstandingPrincipal + w.outstandingBonus)}`
            + `（${ft('本金')} ${walletFinFmt(w.outstandingPrincipal)}＋${ft('贈送')} ${walletFinFmt(w.outstandingBonus)}；${ft('診所負債')}）\n`;
        const walletDailyLines = Object.keys(w.daily).sort().reverse().map((day) => {
            const r = w.daily[day];
            return `${day}: ${ft('充值')} ${walletFinFmt(r.topupAmount)}（${r.topupCount} ${ft('筆')}），`
                + `${ft('消費')} ${walletFinFmt(r.payAmount)}（${r.payCount} ${ft('筆')}），${ft('退款')} ${walletFinFmt(r.refundAmount)}`;
        }).join('\n');
        textReport += `${ft('每日儲值明細')}:\n${walletDailyLines || ft('無資料')}\n`;
    }
    const blob = new Blob([textReport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ft('財務報表')}_${startDate}_${endDate}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    G.showToast(ft('財務報表 TXT 已匯出！'), 'success');
}

export async function exportFinancialReportExcel() {
    const data = await buildFinancialExportPayload();
    const { startDate, endDate, doctorFilter, clinicFilter, clinicName, stats, totalCost, byType } = data;
    const esc = (value) => {
        const str = String(value == null ? '' : value);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    const ft = (s) => (typeof window.t === 'function' ? window.t(s) : s);
    const doctorRows = Object.keys(stats.doctorStats).map(key => {
        const d = stats.doctorStats[key];
        return `<tr><td>${esc(key || ft('未知醫師'))}</td><td>${d.count}</td><td>${d.revenue}</td></tr>`;
    }).join('');
    const serviceRows = Object.values(stats.serviceStats).map(item => {
        return `<tr><td>${esc(item.name)}</td><td>${item.count}</td><td>${item.revenue}</td></tr>`;
    }).join('');
    const dailyRows = Object.keys(stats.dailyStats).map(dateKey => {
        const d = stats.dailyStats[dateKey];
        return `<tr><td>${esc(dateKey)}</td><td>${d.count}</td><td>${d.revenue}</td></tr>`;
    }).join('');
    const costRows = Object.keys(byType).map(type => {
        const amount = Number(byType[type] || 0);
        return `<tr><td>${esc(type)}</td><td>${amount}</td></tr>`;
    }).join('');

    // 會員儲值段落
    const w = data.walletStats;
    let walletSummaryRows = '';
    let walletDailyRows = '';
    if (w) {
        const wrow = (label, amount, count, note) =>
            `<tr><td>${esc(label)}</td><td>${Number(amount) || 0}</td>`
            + `<td>${count === '' || count == null ? '' : count}</td><td>${esc(note || '')}</td></tr>`;
        walletSummaryRows =
            wrow(ft('儲值充值(本金)'), w.topupPrincipal, w.topupCount, ft('屬預存，非營業收入'))
            + wrow(ft('充值贈送額'), w.bonusIssued, w.bonusCount, ft('診所贈送'))
            + wrow(ft('儲值消費－本金'), -w.payPrincipal, w.payCount, ft('沖銷本金'))
            + wrow(ft('儲值消費－贈送'), -w.payBonus, '', ft('沖銷贈送額'))
            + wrow(ft('退款'), -(w.refundPrincipal + w.refundBonus), w.refundCount, ft('退回會員帳戶'))
            + wrow(ft('人工調整（淨額）'), w.adjustNet, w.adjustCount, ft('正＝補入／負＝扣減'))
            + wrow(ft('期末餘額－本金'), w.outstandingPrincipal, '', ft('診所負債'))
            + wrow(ft('期末餘額－贈送'), w.outstandingBonus, '', ft('診所負債'));
        walletDailyRows = Object.keys(w.daily).sort().reverse().map((day) => {
            const r = w.daily[day];
            return `<tr><td>${esc(day)}</td><td>${r.topupCount}</td><td>${r.topupAmount}</td>`
                + `<td>${r.payCount}</td><td>${r.payAmount}</td><td>${r.refundAmount}</td></tr>`;
        }).join('');
    }
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
th, td { border: 1px solid #ccc; padding: 6px; font-size: 12px; }
th { background: #f3f4f6; }
h2, h3 { margin: 8px 0; }
</style>
</head>
<body>
<h2>${ft('財務報表')}</h2>
<table>
<tr><th>${ft('欄位')}</th><th>${ft('內容')}</th></tr>
<tr><td>${ft('期間')}</td><td>${esc(startDate)} ${ft('至')} ${esc(endDate)}</td></tr>
<tr><td>${ft('生成時間')}</td><td>${esc(data.generatedAt)}</td></tr>
<tr><td>${ft('選擇醫師')}</td><td>${esc(doctorFilter || ft('全部醫師'))}</td></tr>
<tr><td>${ft('選擇診所')}</td><td>${esc(clinicFilter ? clinicName : ft('全部診所'))}</td></tr>
<tr><td>${ft('總收入(未扣成本)')}</td><td>${stats.totalRevenue}</td></tr>
<tr><td>${ft('總成本')}</td><td>${totalCost}</td></tr>
<tr><td>${ft('成本計算')}</td><td>${data.costProrated ? ft('部分月份按天數分攤') : ft('整月實際成本')}</td></tr>
<tr><td>${ft('淨收入')}</td><td>${stats.totalRevenue - totalCost}</td></tr>
<tr><td>${ft('總診症數')}</td><td>${stats.totalConsultations}</td></tr>
<tr><td>${ft('平均收入')}</td><td>${Math.round(stats.averageRevenue)}</td></tr>
<tr><td>${ft('有效醫師數')}</td><td>${stats.activeDoctors}</td></tr>
</table>
<h3>${ft('醫師統計')}</h3>
<table><tr><th>${ft('醫師')}</th><th>${ft('次數')}</th><th>${ft('收入')}</th></tr>${doctorRows || `<tr><td colspan="3">${ft('無資料')}</td></tr>`}</table>
<h3>${ft('服務分類統計')}</h3>
<table><tr><th>${ft('服務類型')}</th><th>${ft('次數')}</th><th>${ft('收入')}</th></tr>${serviceRows || `<tr><td colspan="3">${ft('無資料')}</td></tr>`}</table>
<h3>${ft('每日統計')}</h3>
<table><tr><th>${ft('日期')}</th><th>${ft('次數')}</th><th>${ft('收入')}</th></tr>${dailyRows || `<tr><td colspan="3">${ft('無資料')}</td></tr>`}</table>
<h3>${ft('成本統計')}</h3>
<table><tr><th>${ft('成本類型')}</th><th>${ft('金額')}</th></tr>${costRows || `<tr><td colspan="2">${ft('無資料')}</td></tr>`}</table>
<h3>${ft('會員儲值統計')}</h3>
<table><tr><th>${ft('項目')}</th><th>${ft('金額')}</th><th>${ft('筆數')}</th><th>${ft('備註')}</th></tr>${walletSummaryRows || `<tr><td colspan="4">${ft('無資料')}</td></tr>`}</table>
<h3>${ft('每日儲值明細')}</h3>
<table><tr><th>${ft('日期')}</th><th>${ft('充值筆數')}</th><th>${ft('充值金額')}</th><th>${ft('消費筆數')}</th><th>${ft('消費金額')}</th><th>${ft('退款金額')}</th></tr>${walletDailyRows || `<tr><td colspan="6">${ft('無資料')}</td></tr>`}</table>
</body>
</html>`;
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ft('財務報表')}_${startDate}_${endDate}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    G.showToast(ft('財務報表 Excel 已匯出！'), 'success');
}

