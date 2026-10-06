/* ============================================================
 * patients/history.js — 病人病歷歷史 UI（Phase 4 第二批・子批 C）
 * ------------------------------------------------------------
 * 病人管理頁與診症頁的病歷檢視：日曆導覽、分頁、action 按鈕群。
 * 原樣遷自 system.js；共享分頁狀態所有權仍在 system.js（G 讀寫）。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { getPatientByIdWithRefresh } from './store.js';
import { printAttendanceCertificate, printConsultationRecord, printPrescriptionInstructions, printSickLeave } from '../print/index.js';

        // 病歷是否「曾被修改」一律以審核日誌（consultationAuditLogs）為準：
        // 新建病歷儲存時 updatedAt 就已存在，錢包收款／財務回寫等無關編輯
        // 也會更新 updatedAt，故不能用 updatedAt 作為「已修改」判據。
        // 病歷分頁每頁只顯示一條記錄，每次僅需一次 limit 1 查詢，並附工作階段快取。
        const medicalRecordAuditStatusCache = new Map();

        export async function fetchMedicalRecordEdited(consultation) {
            const id = consultation && consultation.id != null ? String(consultation.id) : '';
            if (!id) return false;
            if (medicalRecordAuditStatusCache.has(id)) {
                return medicalRecordAuditStatusCache.get(id);
            }
            let edited = false;
            try {
                if (window.firebaseDataManager && typeof window.firebaseDataManager.getConsultationAuditLogs === 'function') {
                    const result = await window.firebaseDataManager.getConsultationAuditLogs(id, 1);
                    edited = !!(result && result.success && Array.isArray(result.data) && result.data.length > 0);
                }
            } catch (_e) {
                edited = false;
            }
            medicalRecordAuditStatusCache.set(id, edited);
            return edited;
        }

        // 病歷編輯成功或開過審核追蹤後預熱／校正快取，避免同工作階段看到過期結果
        export function primeMedicalRecordAuditStatus(consultationId, edited = true) {
            const id = consultationId != null ? String(consultationId) : '';
            if (!id) return;
            medicalRecordAuditStatusCache.set(id, !!edited);
        }

        // 病人資料管理頁面的病歷查看功能
        const historyCalendarState = {
            patient: { open: false, year: null, month: null, selectedDateKey: null },
            consultation: { open: false, year: null, month: null, selectedDateKey: null }
        };
        export function getHistoryCalendarContextPatientId(contextKey) {
            return contextKey === 'patient' ? G.currentPatientHistoryPatientId : G.currentConsultationHistoryPatientId;
        }
        export function getHistoryCalendarContextList(contextKey) {
            return contextKey === 'patient' ? G.currentPatientConsultations : G.currentConsultationConsultations;
        }
        export function getHistoryCalendarContextPage(contextKey) {
            return contextKey === 'patient' ? G.currentPatientHistoryPage : G.currentConsultationHistoryPage;
        }
        export function renderHistoryCalendar(contextKey) {
            if (contextKey === 'patient') {
                displayPatientMedicalHistoryPage();
            } else {
                displayConsultationMedicalHistoryPage();
            }
        }
        export function closeHistoryCalendar(contextKey) {
            const st = historyCalendarState[contextKey];
            if (!st) return;
            st.open = false;
            st.selectedDateKey = null;
        }
        export function openHistoryCalendarAtCurrentMonth(contextKey) {
            const st = historyCalendarState[contextKey];
            if (!st) return;
            const list = getHistoryCalendarContextList(contextKey);
            const page = getHistoryCalendarContextPage(contextKey);
            const current = Array.isArray(list) ? list[page] : null;
            const baseDate = G.parseConsultationDate(current && (current.date || current.createdAt || current.updatedAt)) || new Date();
            st.year = baseDate.getFullYear();
            st.month = baseDate.getMonth();
            st.open = true;
            st.selectedDateKey = null;
        }
        export function buildHistoryDateSelectionHtml(contextKey, dateMap) {
            const st = historyCalendarState[contextKey];
            if (!st || !st.selectedDateKey) return '';
            const indices = Array.isArray(dateMap[st.selectedDateKey]) ? dateMap[st.selectedDateKey].slice() : [];
            if (indices.length <= 1) return '';
            const patientId = getHistoryCalendarContextPatientId(contextKey);
            const state = G.consultationHistoryPager.getCachedPatientState(patientId);
            const records = (state && Array.isArray(state.recordsByIndex)) ? state.recordsByIndex : [];
            const buttons = indices.map((idx, arrIdx) => {
                const rec = records[idx];
                const ts = rec ? G.formatConsultationDateTime(rec.date || rec.createdAt || rec.updatedAt) : `同日病歷 ${arrIdx + 1}`;
                const no = rec && (rec.medicalRecordNumber || rec.id) ? (rec.medicalRecordNumber || rec.id) : '';
                const label = no ? `${ts}（${no}）` : ts;
                return `<button onclick="selectHistoryCalendarRecord('${contextKey}', ${idx}, event)" class="w-full text-left px-3 py-2 text-sm rounded bg-white border border-blue-200 hover:bg-blue-50 transition">${window.escapeHtml(label)}</button>`;
            }).join('');
            return `
                <div class="mt-3 bg-white border border-blue-200 rounded p-2">
                    <div class="text-xs text-gray-600 mb-2">已選日期 ${st.selectedDateKey}，請選擇病歷：</div>
                    <div class="space-y-2">${buttons}</div>
                </div>
            `;
        }
        export function buildHistoryCalendarHtml(contextKey) {
            const st = historyCalendarState[contextKey];
            if (!st || !st.open) return '';
            const patientId = getHistoryCalendarContextPatientId(contextKey);
            if (!patientId) return '';
            const year = Number(st.year);
            const month = Number(st.month);
            if (!Number.isFinite(year) || !Number.isFinite(month)) return '';
            const dateMap = G.consultationHistoryPager.getMonthDateIndexMap(patientId, year, month) || {};
            const firstDay = new Date(year, month, 1);
            const startWeekday = firstDay.getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthLabel = `${year}年${String(month + 1).padStart(2, '0')}月`;
            const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
            const pad = (n) => String(n).padStart(2, '0');
            let cells = '';
            for (let i = 0; i < startWeekday; i++) {
                cells += `<div class="h-10"></div>`;
            }
            for (let day = 1; day <= daysInMonth; day++) {
                const key = `${year}-${pad(month + 1)}-${pad(day)}`;
                const dateIndices = Array.isArray(dateMap[key]) ? dateMap[key] : [];
                const hasRecord = dateIndices.length > 0;
                const count = dateIndices.length;
                if (hasRecord) {
                    cells += `
                        <button onclick="selectHistoryCalendarDate('${contextKey}', '${key}', event)"
                                class="h-10 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition duration-150 relative">
                            ${day}
                            ${count > 1 ? `<span class="absolute -top-1 -right-1 text-[10px] leading-none px-1 py-0.5 rounded-full bg-white text-blue-600 border border-blue-200">${count}</span>` : ''}
                        </button>
                    `;
                } else {
                    cells += `
                        <div class="h-10 rounded-lg text-sm text-gray-400 bg-gray-100 flex items-center justify-center">
                            ${day}
                        </div>
                    `;
                }
            }
            const selectionHtml = buildHistoryDateSelectionHtml(contextKey, dateMap);
            return `
                <div class="mb-6 border border-blue-100 bg-blue-50 rounded-lg p-3">
                    <div class="flex items-center justify-between mb-3">
                        <button onclick="changeHistoryCalendarMonth('${contextKey}', -1)" class="px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-100 text-sm">←</button>
                        <div class="font-semibold text-gray-800">${monthLabel}</div>
                        <button onclick="changeHistoryCalendarMonth('${contextKey}', 1)" class="px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-100 text-sm">→</button>
                    </div>
                    <div class="grid grid-cols-7 gap-1 mb-1">
                        ${weekdayLabels.map(w => `<div class="text-xs text-gray-600 text-center py-1">${w}</div>`).join('')}
                    </div>
                    <div class="grid grid-cols-7 gap-1">
                        ${cells}
                    </div>
                    <div class="text-xs text-gray-500 mt-2">藍色日期代表有病歷，點擊可跳轉</div>
                    ${selectionHtml}
                </div>
            `;
        }
        export async function toggleHistoryCalendar(contextKey, evt) {
            const st = historyCalendarState[contextKey];
            if (!st) return;
            const btn = evt && evt.currentTarget ? evt.currentTarget : null;
            if (btn) G.setButtonLoading(btn, '讀取中...');
            try {
                if (st.open) {
                    st.open = false;
                    st.selectedDateKey = null;
                    renderHistoryCalendar(contextKey);
                    return;
                }
                const patientId = getHistoryCalendarContextPatientId(contextKey);
                if (!patientId) return;
                openHistoryCalendarAtCurrentMonth(contextKey);
                const ok = await G.consultationHistoryPager.ensureMonthDateIndex(patientId, st.year, st.month);
                if (!ok) {
                    st.open = false;
                    G.showToast('無法建立病歷日曆索引', 'error');
                    return;
                }
                renderHistoryCalendar(contextKey);
            } finally {
                if (btn) G.clearButtonLoading(btn);
            }
        }
        export async function changeHistoryCalendarMonth(contextKey, delta) {
            const st = historyCalendarState[contextKey];
            if (!st) return;
            const d = new Date(st.year, st.month + delta, 1);
            st.year = d.getFullYear();
            st.month = d.getMonth();
            st.selectedDateKey = null;
            const patientId = getHistoryCalendarContextPatientId(contextKey);
            if (patientId) {
                await G.consultationHistoryPager.ensureMonthDateIndex(patientId, st.year, st.month);
            }
            renderHistoryCalendar(contextKey);
        }
        export function jumpToHistoryCalendarIndex(contextKey, patientId, targetIndex) {
            const latestState = G.consultationHistoryPager.getCachedPatientState(patientId);
            const ctx = G.consultationHistoryPager.contexts[contextKey];
            if (!ctx) return;
            if (latestState && Array.isArray(latestState.recordsByIndex)) {
                ctx.setConsultations(latestState.recordsByIndex);
            }
            ctx.setCurrentPage(targetIndex);
            closeHistoryCalendar(contextKey);
            renderHistoryCalendar(contextKey);
        }
        // 最終守備：跳轉前確認目標槽位的病歷日期真的是所選日期。
        // 若對不上（分頁索引飄移），自動轉全量模式後以有效日期重新定位，
        // 杜絕「點 24 號卻跳到其他日期病歷」。
        export async function resolveHistoryCalendarJump(contextKey, patientId, dateKey, targetIndex) {
            const key = String(dateKey || '');
            const pager = G.consultationHistoryPager;
            let state = pager.getCachedPatientState(patientId);
            let rec = state && Array.isArray(state.recordsByIndex)
                ? state.recordsByIndex[Number(targetIndex)]
                : null;
            if (!rec || (key && pager.getRecordDateKey(rec) !== key)) {
                const fullState = await pager.forceFullMode(patientId);
                if (!fullState) return;
                const indices = key && Array.isArray(fullState.dateIndexMap[key])
                    ? fullState.dateIndexMap[key].slice()
                    : [];
                if (indices.length > 1) {
                    const st = historyCalendarState[contextKey];
                    if (st) st.selectedDateKey = key;
                    // 全量模式下重建當月索引，保證同日多筆清單與圓點一致
                    await pager.ensureMonthDateIndex(patientId, st ? st.year : Number(key.slice(0, 4)), st ? st.month : Number(key.slice(5, 7)) - 1);
                    renderHistoryCalendar(contextKey);
                    return;
                }
                if (indices.length === 1) {
                    jumpToHistoryCalendarIndex(contextKey, patientId, indices[0]);
                }
                return;
            }
            jumpToHistoryCalendarIndex(contextKey, patientId, Number(targetIndex));
        }
        export async function selectHistoryCalendarDate(contextKey, dateKey, evt) {
            const btn = evt && evt.currentTarget ? evt.currentTarget : null;
            if (btn) G.setButtonLoading(btn, '讀取中...');
            try {
                const patientId = getHistoryCalendarContextPatientId(contextKey);
                if (!patientId) return;
                const st = historyCalendarState[contextKey];
                let dateIndices = G.consultationHistoryPager.getMonthDateIndexMap(patientId, st.year, st.month)[dateKey];
                if (!Array.isArray(dateIndices) || dateIndices.length === 0) {
                    const indexed = await G.consultationHistoryPager.ensureMonthDateIndex(patientId, st.year, st.month);
                    if (!indexed) return;
                    dateIndices = G.consultationHistoryPager.getMonthDateIndexMap(patientId, st.year, st.month)[dateKey];
                }
                if (!Array.isArray(dateIndices) || dateIndices.length === 0) return;
                const dateLoadResult = await G.consultationHistoryPager.loadRecordsForDate(patientId, dateKey);
                if (dateLoadResult && dateLoadResult.success && Array.isArray(dateLoadResult.indices) && dateLoadResult.indices.length > 0) {
                    dateIndices = dateLoadResult.indices.slice();
                }
                if (dateIndices.length > 1) {
                    const st = historyCalendarState[contextKey];
                    if (st) {
                        st.selectedDateKey = dateKey;
                    }
                    renderHistoryCalendar(contextKey);
                    return;
                }
                const targetIndex = dateIndices[0];
                const loaded = await G.consultationHistoryPager.ensureLoadedAtIndex(patientId, targetIndex);
                if (!loaded) return;
                await resolveHistoryCalendarJump(contextKey, patientId, dateKey, targetIndex);
            } finally {
                if (btn) G.clearButtonLoading(btn);
            }
        }
        export async function selectHistoryCalendarRecord(contextKey, targetIndex, evt) {
            const btn = evt && evt.currentTarget ? evt.currentTarget : null;
            if (btn) G.setButtonLoading(btn, '讀取中...');
            try {
                const patientId = getHistoryCalendarContextPatientId(contextKey);
                if (!patientId) return;
                const st = historyCalendarState[contextKey];
                const selectedKey = st && st.selectedDateKey ? st.selectedDateKey : '';
                if (selectedKey) {
                    await G.consultationHistoryPager.loadRecordsForDate(patientId, selectedKey);
                }
                const state = G.consultationHistoryPager.getCachedPatientState(patientId);
                const alreadyLoaded = !!(state && Array.isArray(state.recordsByIndex) && state.recordsByIndex[targetIndex]);
                const loaded = alreadyLoaded ? true : await G.consultationHistoryPager.ensureLoadedAtIndex(patientId, targetIndex);
                if (!loaded) return;
                await resolveHistoryCalendarJump(contextKey, patientId, selectedKey, targetIndex);
            } finally {
                if (btn) G.clearButtonLoading(btn);
            }
        }
        
        export async function showPatientMedicalHistory(patientId) {
    const modal = document.getElementById('patientMedicalHistoryModal');
    const contentDiv = document.getElementById('patientMedicalHistoryContent');
    const titleEl = document.getElementById('patientMedicalHistoryTitle');
    const patientInfoEl = document.getElementById('patientMedicalHistoryPatientInfo');

    // 先顯示 modal 與讀取圈
    if (titleEl) titleEl.textContent = '病歷記錄';
    if (patientInfoEl) patientInfoEl.innerHTML = '';
    if (contentDiv) {
        contentDiv.innerHTML = `
            <div class="text-center py-12">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <div class="mt-2 text-sm text-gray-600">載入病歷中...</div>
            </div>
        `;
    }
    if (modal) modal.classList.remove('hidden');

    try {
        const patient = await getPatientByIdWithRefresh(patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            if (modal) modal.classList.add('hidden');
            return;
        }
            
        // 透過共用 pager 載入並同步狀態
        const consultationResult = await G.consultationHistoryPager.loadForContext('patient', patientId);
        if (!consultationResult.success) {
            G.showToast('無法讀取診症記錄！', 'error');
            if (modal) modal.classList.add('hidden');
            return;
        }
            
        // 設置標題
        if (titleEl) titleEl.textContent = `${patient.name} 的病歷記錄`;
            
        // 顯示病人基本資訊
        if (patientInfoEl) {
            patientInfoEl.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                        <span class="font-medium text-gray-700">病人編號：</span>
                        <span class="text-blue-600 font-semibold">${window.escapeHtml(patient.patientNumber)}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">姓名：</span>
                        <span class="font-semibold">${window.escapeHtml(patient.name)}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">年齡：</span>
                        <span>${window.escapeHtml(G.formatAge(patient.birthDate))}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">性別：</span>
                        <span>${window.escapeHtml(patient.gender)}</span>
                    </div>
                ${patient.history ? `
                    <div class="md:col-span-1 lg:col-span-2">
                        <span class="font-medium text-gray-700">病史及備註：</span>
                        <span class="medical-field text-gray-700">${window.escapeHtml(patient.history)}</span>
                    </div>
                    ` : ''}
                ${patient.allergies ? `
                    <div class="md:col-span-1 lg:col-span-2">
                        <span class="medical-field text-red-700 bg-red-50 px-2 py-1 rounded">${window.escapeHtml(patient.allergies)}</span>
                    </div>
                    ` : ''}
                </div>
            `;
        }
            
        G.currentPatientHistoryPatientId = patientId;
        closeHistoryCalendar('patient');
        // 顯示分頁病歷記錄
        displayPatientMedicalHistoryPage();
    } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        G.showToast('讀取病人資料失敗', 'error');
        if (modal) modal.classList.add('hidden');
    }
        }
        
        export function getMedicalHistoryActionButtonClasses(variant, disabled = false) {
            const baseClasses = 'inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold leading-none whitespace-nowrap transition-all duration-200';
            if (disabled) {
                return `${baseClasses} border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed`;
            }

            const variantClasses = {
                edit: 'border-orange-500 bg-orange-500 text-white shadow-sm hover:-translate-y-0.5 hover:border-orange-600 hover:bg-orange-600 hover:shadow-md',
                audit: 'border-amber-200 bg-amber-50 text-amber-700 shadow-sm hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-100 hover:shadow-md',
                receipt: 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-md',
                prescription: 'border-yellow-200 bg-yellow-50 text-yellow-700 shadow-sm hover:-translate-y-0.5 hover:border-yellow-300 hover:bg-yellow-100 hover:shadow-md',
                attendance: 'border-sky-200 bg-sky-50 text-sky-700 shadow-sm hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-100 hover:shadow-md',
                sickLeave: 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-100 hover:shadow-md',
                load: 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-md',
                delete: 'border-red-200 bg-red-50 text-red-700 shadow-sm hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 hover:shadow-md'
            };

            return `${baseClasses} ${variantClasses[variant] || 'border-gray-200 bg-white text-gray-700 shadow-sm hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md'}`;
        }

        export function renderMedicalHistoryActionButton({ label, onclick, variant, disabled = false, title = '' }) {
            const buttonClasses = getMedicalHistoryActionButtonClasses(variant, disabled);
            if (disabled) {
                return `<span class="${buttonClasses}"${title ? ` title="${title}"` : ''}>${label}</span>`;
            }

            return `<button type="button" onclick="${onclick}" class="${buttonClasses}">${label}</button>`;
        }

        export function renderMedicalHistoryActionButtons(consultation, options = {}) {
            const { includeSickLeave = false, isModified = false } = options;
            if (!G.canCurrentUserViewConsultationEntry(consultation)) {
                return '';
            }
            const buttons = [];
            const isGeneralRegistration = G.isGeneralRegistrationConsultation(consultation);

            // 「載入病歷」只在醫師正在診症、且該病歷屬於當前病人時出現；
            // 按使用順序放在「修改病歷」左邊（按鈕群最前）
            if (G.currentConsultingAppointmentId) {
                const currentAppointment = G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId));
                if (currentAppointment && String(currentAppointment.patientId) === String(consultation.patientId)) {
                    buttons.push(renderMedicalHistoryActionButton({
                        label: '載入病歷',
                        onclick: `loadMedicalRecordToCurrentConsultation('${consultation.id}')`,
                        variant: 'load'
                    }));
                }
            }

            if (G.canCurrentUserEditMedicalRecordEntry(consultation, null)) {
                const editWindowStatus = G.getMedicalRecordEditWindowStatus(consultation, null);
                buttons.push(renderMedicalHistoryActionButton({
                    label: G.getMedicalRecordEditButtonLabel(consultation, null),
                    onclick: `editMedicalRecordByConsultationId('${consultation.id}')`,
                    variant: 'edit',
                    disabled: !editWindowStatus.allowed,
                    title: editWindowStatus.allowed ? '' : editWindowStatus.reason
                }));
            }

            // 「審核追蹤」只在病歷曾被實質修改（有審核日誌）時顯示；
            // 首次完成、從未修改的病歷不顯示。
            if (isModified) {
                buttons.push(renderMedicalHistoryActionButton({
                    label: '審核追蹤',
                    onclick: `openConsultationAuditTrail('${consultation.id}', '${consultation.patientId || ''}')`,
                    variant: 'audit'
                }));
            }

            buttons.push(renderMedicalHistoryActionButton({
                label: '列印收據',
                onclick: `printConsultationRecord('${consultation.id}')`,
                variant: 'receipt'
            }));
            if (!isGeneralRegistration) {
                buttons.push(renderMedicalHistoryActionButton({
                    label: '藥單醫囑',
                    onclick: `printPrescriptionInstructions('${consultation.id}')`,
                    variant: 'prescription'
                }));
                buttons.push(renderMedicalHistoryActionButton({
                    label: '到診證明',
                    onclick: `printAttendanceCertificate('${consultation.id}')`,
                    variant: 'attendance'
                }));
    
                if (includeSickLeave) {
                    buttons.push(renderMedicalHistoryActionButton({
                        label: '病假證明',
                        onclick: `printSickLeave('${consultation.id}')`,
                        variant: 'sickLeave'
                    }));
                }
            }

            return buttons.join('');
        }

        export async function displayPatientMedicalHistoryPage() {
            const contentDiv = document.getElementById('patientMedicalHistoryContent');

            // Determine current language and translation dictionary.  Use
            // localStorage to fetch the persisted language; default to
            // Chinese when not found.  This allows us to construct
            // translated dynamic strings below.  The dictionary is used
            // solely for static labels such as '診症記錄', '較舊', '較新',
            // '醫師：', and '病歷編號：'.
            const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
            const dict = (window.translations && window.translations[lang]) ? window.translations[lang] : {};
            
            if (G.currentPatientConsultations.length === 0) {
                // Use Chinese strings here so the i18n observer can
                // translate them if necessary.  For zero‑records state
                // there are no dynamic numbers to handle.
                contentDiv.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="mb-4 flex justify-center"><i data-lucide="clipboard-list" class="w-10 h-10 text-blue-400"></i></div>
                        <div class="text-lg font-medium mb-2">暫無診症記錄</div>
                        <div class="text-sm">該病人尚未有診症記錄</div>
                    </div>
                `;
                return;
            }
            
            const consultation = G.currentPatientConsultations[G.currentPatientHistoryPage];
            const totalPages = G.currentPatientConsultations.length;
            const currentPageNumber = G.currentPatientHistoryPage + 1;
            const consultationNumber = G.currentPatientHistoryPage + 1;
            if (!consultation) {
                contentDiv.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="text-lg font-medium mb-2">正在載入病歷...</div>
                    </div>
                `;
                return;
            }
            if (!G.canCurrentUserViewConsultationEntry(consultation)) {
                contentDiv.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="text-lg font-medium mb-2">暫無診症記錄</div>
                        <div class="text-sm">您沒有查看此病歷的權限</div>
                    </div>
                `;
                return;
            }

            // 預先建立含餘下套票次數的收費項目 HTML（與收據顯示一致）
            const billingItemsDisplayHtml = await G.buildConsultationBillingDisplayHtml(
                consultation,
                (typeof G.currentPatientHistoryPatientId !== 'undefined' && G.currentPatientHistoryPatientId) || consultation.patientId || ''
            );
            // 病歷是否曾被實質修改（以審核日誌為準）：驅動「已修改」標籤與「審核追蹤」按鈕
            const isMedicalRecordModified = await fetchMedicalRecordEdited(consultation);
            // 判斷本次診症是否有開藥；沒有開藥時隱藏處方內容與服用方法欄位
            const hasPrescription = G.consultationHasPrescription(consultation);

            // 病歷附件（R2）：載入該病人附件並取出本次診次的縮圖；失敗不影響病歷顯示
            const maVisitThumbs = { otherHtml: '', tongueHtml: '', hasOther: false, hasTongue: false };
            try {
                if (window.MedicalAttachments) {
                    const maPatientId = (typeof G.currentPatientHistoryPatientId !== 'undefined' && G.currentPatientHistoryPatientId) || consultation.patientId || '';
                    if (maPatientId) {
                        await window.MedicalAttachments.listForPatient(String(maPatientId));
                        const maGroups = window.MedicalAttachments.visitGroups(String(maPatientId), String(consultation.id));
                        maVisitThumbs.hasOther = maGroups.attachments.length > 0;
                        maVisitThumbs.hasTongue = maGroups.tongues.length > 0;
                        maVisitThumbs.otherHtml = window.MedicalAttachments.inlineThumbsHtml(maGroups.attachments, String(maPatientId), String(consultation.id), 'other', '醫學報告');
                        maVisitThumbs.tongueHtml = window.MedicalAttachments.inlineThumbsHtml(maGroups.tongues, String(maPatientId), String(consultation.id), 'tongue');
                    }
                }
            } catch (_maErr) {
                console.warn('病歷附件載入失敗（不影響病歷顯示）:', _maErr);
            }

            // Prepare dynamic translation segments.  We look up static labels
            // from the dictionary and build English phrases when needed.
            const recordTitle = dict['診症記錄'] || '診症記錄';
            const visitText = lang !== 'en'
                ? `第 ${consultationNumber} 次診症`
                : `Visit ${consultationNumber}`;
            const totalText = lang !== 'en'
                ? `共 ${totalPages} 次診症記錄`
                : `Total ${totalPages} consultation records`;
            const prevLabel = dict['較舊'] || '較舊';
            const nextLabel = dict['較新'] || '較新';
            const doctorLabel = dict['醫師：'] || '醫師：';
            const recordNumberLabel = dict['病歷編號：'] || '病歷編號：';
            const clinicLabel = dict['診所：'] || '診所：';
            const hideDoctorInfo = G.shouldHideGeneralRegistrationDoctorInfo(consultation, null);
            const generalRegistrationBadge = G.isGeneralRegistrationConsultation(consultation)
                ? `<span class="text-sm text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-100 shadow-sm">${window.escapeHtml(G.getGeneralRegistrationSourceLabel(String(lang).toLowerCase().startsWith('en')))}</span>`
                : '';
            const calendarHtml = buildHistoryCalendarHtml('patient');

            contentDiv.innerHTML = `
                <!-- 分頁導航 -->
                <div class="mb-6 flex justify-between items-center bg-gray-50 rounded-lg p-4">
                    <div class="flex items-center space-x-4">
                        <h4 class="text-lg font-semibold text-gray-800">${recordTitle}</h4>
                        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                            ${visitText}
                        </span>
                        <span class="text-sm text-gray-600">
                            ${totalText}
                        </span>
                    </div>
                    
                    <div class="flex items-center space-x-2">
                        <button onclick="toggleHistoryCalendar('patient', event)"
                                class="px-3 py-1 bg-white text-blue-700 border border-blue-200 rounded hover:bg-blue-50 text-sm">
                            日曆
                        </button>
                        <button onclick="changePatientHistoryPage(-1, event)" 
                                ${G.currentPatientHistoryPage === 0 ? 'disabled' : ''}
                                class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">
                            ← ${prevLabel}
                        </button>
                        <span class="text-sm text-gray-600 px-2">
                            ${currentPageNumber} / ${totalPages}
                        </span>
                        <button onclick="changePatientHistoryPage(1, event)" 
                                ${G.currentPatientHistoryPage === totalPages - 1 ? 'disabled' : ''}
                                class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">
                            ${nextLabel} →
                        </button>
                    </div>
                </div>
                ${calendarHtml}
                
                <!-- 當前病歷記錄 -->
                <div class="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <div class="bg-linear-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div class="flex flex-col space-y-2">
                                <span class="font-semibold text-gray-900 text-lg">
                                    ${(() => {
                                        const parsedDate = G.getConsultationEffectiveDate(consultation);
                                        if (!parsedDate || isNaN(parsedDate.getTime())) {
                                            return '日期未知';
                                        }
                                        const locale = lang === 'en' ? 'en-US' : 'zh-TW';
                                        const datePart = parsedDate.toLocaleDateString(locale);
                                        const timePart = parsedDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                                        return datePart + ' ' + timePart;
                                    })()}
                                </span>
                        ${(() => {
                            let clinicName = '';
                            try {
                                if (consultation.clinicName) clinicName = consultation.clinicName;
                                else if (consultation.clinicId) {
                                    const foundClinic = Array.isArray(G.clinicsList) ? G.clinicsList.find(c => String(c.id) === String(consultation.clinicId)) : null;
                                    clinicName = foundClinic ? (foundClinic.chineseName || foundClinic.englishName || '') : '';
                                } else {
                                    clinicName = '';
                                }
                            } catch (_e) {
                                clinicName = '';
                            }
                            return `
                            <div class="flex flex-wrap items-center gap-2">
                                ${generalRegistrationBadge}
                                ${hideDoctorInfo ? '' : `
                                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">
                                    ${doctorLabel}${window.escapeHtml(G.getDoctorDisplayName(consultation.doctor))}
                                </span>
                                `}
                                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">
                                            ${recordNumberLabel}${window.escapeHtml(consultation.medicalRecordNumber || consultation.id)}
                                </span>
                                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">
                                            ${clinicLabel}${window.escapeHtml(clinicName || '未設定')}
                                </span>
                                ${isMedicalRecordModified ? `
                                    <span class="text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-100">
                                        已修改
                                    </span>
                                ` : ''}
                            </div>`;
                                })()}
                            </div>
                            <div class="medical-history-actions">
                                ${renderMedicalHistoryActionButtons(consultation, { includeSickLeave: true, isModified: isMedicalRecordModified })}
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-6">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="space-y-4">
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">主訴</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.symptoms || '無記錄')}</div>
                                    ${maVisitThumbs.otherHtml}
                                </div>

                                ${consultation.currentHistory ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">現病史</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.currentHistory)}</div>
                                </div>
                                ` : ''}

                                ${(consultation.tongue || maVisitThumbs.hasTongue) ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">舌象</span>
                                    ${consultation.tongue ? `<div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.tongue)}</div>` : ''}
                                    ${maVisitThumbs.tongueHtml}
                                </div>
                                ` : ''}
                                
                                ${consultation.pulse ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">脈象</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.pulse)}</div>
                                </div>
                                ` : ''}
                                
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">中醫診斷</span>
                                    <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 medical-field">${window.escapeHtml(consultation.diagnosis || '無記錄')}</div>
                                </div>
                                
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">證型診斷</span>
                                    <div class="bg-blue-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-blue-400 medical-field">${window.escapeHtml(consultation.syndrome || '無記錄')}</div>
                                </div>
                                
                                ${consultation.acupunctureNotes ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">針灸備註</span>
                                    <div class="bg-orange-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-orange-400 medical-field">${window.escapeHtml(window.stripHtmlTags(consultation.acupunctureNotes))}</div>
                                </div>
                                ` : ''}
                            </div>
                            
                            <div class="space-y-4">
                                ${hasPrescription ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">處方內容</span>
                                    ${(() => {
                                        let html = '無記錄';
                                        try {
                                            if (consultation.multiPrescriptions) {
                                                const mp = JSON.parse(consultation.multiPrescriptions);
                                                if (Array.isArray(mp) && mp.length > 0) {
                                                    const showNames = mp.length > 1;
                                                    let block = '';
                                                    mp.forEach((section, sIdx) => {
                                                        const secName = section && section.name ? section.name : `處方${sIdx + 1}`;
                                                        const items = Array.isArray(section && section.items) ? section.items : [];
                                                    const lines = items.map(it => {
                                                        const dose = it.customDosage || (it.type === 'herb' ? '1' : '5');
                                                        const unit = (it && it.dosage && typeof it.dosage === 'string' && it.dosage.endsWith('g')) ? 'g' : 'g';
                                                        return `<div style="margin-bottom: 4px;">${window.escapeHtml(it.name)} ${window.escapeHtml(String(dose))}${unit}</div>`;
                                                    });
                                                    const modeLabel = (section && section.mode === 'granule') ? '顆粒沖劑' : ((section && section.mode === 'slice') ? '飲片' : '');
                                                    const nameWithMode = showNames ? `<div style="font-weight:bold;margin-bottom:2px;">${window.escapeHtml(secName)}${modeLabel ? `<span style="font-size:0.5em;">（${window.escapeHtml(modeLabel)}）</span>` : ''}</div>` : '';
                                                    block += `<div style="margin-bottom:6px;">${nameWithMode}${lines.join('')}</div>`;
                                                    });
                                                    html = block;
                                                }
                                            } else if (consultation.prescription) {
                                                html = window.escapeHtml(consultation.prescription).replace(/\n/g, '<br>');
                                            }
                                        } catch (_e) {
                                            html = consultation.prescription ? window.escapeHtml(consultation.prescription).replace(/\n/g, '<br>') : '無記錄';
                                        }
                                        return `<div class="bg-yellow-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-yellow-400 medical-field">${html}</div>`;
                                    })()}
                                </div>
                                ` : ''}
                                
                                ${(() => {
                                    if (!hasPrescription) return '';
                                    let medInfoHtml = '';
                                    try {
                                        if (consultation.multiPrescriptions) {
                                            const mp = JSON.parse(consultation.multiPrescriptions);
                                            if (Array.isArray(mp) && mp.length > 0) {
                                                const showNames = mp.length > 1;
                                                const lines = mp.map((section, idx) => {
                                                    const secName = section && section.name ? section.name : `處方${idx + 1}`;
                                                    const d = parseInt(section && section.days) || 0;
                                                    const f = parseInt(section && section.freq) || (parseInt(consultation.medicationFrequency) || 0);
                                                    const partDays = d > 0 ? `服藥天數：${d}天` : '';
                                                    const partFreq = f > 0 ? `每日次數：${f}次` : '';
                                                    const combined = [partDays, partFreq].filter(Boolean).join('　');
                                                    return combined ? `${showNames ? (secName + '：') : ''}${combined}` : '';
                                                }).filter(Boolean);
                                                if (lines.length > 0) {
                                                    medInfoHtml += lines.map(l => `<div>${window.escapeHtml(l)}</div>`).join('');
                                                }
                                            }
                                        } else {
                                            const parts = [];
                                            if (consultation.medicationDays && Number(consultation.medicationDays) > 0) {
                                                parts.push('服藥天數：' + consultation.medicationDays + '天');
                                            }
                                            if (consultation.medicationFrequency && Number(consultation.medicationFrequency) > 0) {
                                                parts.push('每日次數：' + consultation.medicationFrequency + '次');
                                            }
                                            if (parts.length > 0) {
                                                medInfoHtml += `<div>${window.escapeHtml(parts.join('　'))}</div>`;
                                            }
                                        }
                                    } catch (_e) {}
                                    if (consultation.usage) {
                                        medInfoHtml += `<div>${window.escapeHtml(consultation.usage)}</div>`;
                                    }
                                    return `
                                        <div>
                                            <span class="text-sm font-semibold text-gray-700 block mb-2">服用方法</span>
                                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${medInfoHtml || '無記錄'}</div>
                                        </div>
                                    `;
                                })()}
                                
                                ${consultation.treatmentCourse ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">療程</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.treatmentCourse)}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.instructions ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">醫囑及注意事項</span>
                                    <div class="bg-red-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-red-400 medical-field">${window.escapeHtml(consultation.instructions)}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.followUpDate ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">複診時間</span>
                                    <div class="bg-purple-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-purple-400 medical-field">${new Date(consultation.followUpDate).toLocaleString('zh-TW')}</div>
                                </div>
                                ` : ''}
                                
                                ${billingItemsDisplayHtml ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">收費項目</span>
                                    <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 whitespace-pre-line medical-field">${billingItemsDisplayHtml}</div>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        export async function changePatientHistoryPage(direction, evt) {
            let loadingButton = null;
            try {
                loadingButton = (evt && evt.currentTarget) ? evt.currentTarget : null;
            } catch (_e) {}
            if (loadingButton) {
                G.setButtonLoading(loadingButton, '讀取中...');
            }
            if (await G.consultationHistoryPager.changePage('patient', direction)) {
                displayPatientMedicalHistoryPage();
                return;
            }
            if (loadingButton) {
                G.clearButtonLoading(loadingButton);
            }
        }

        // 關閉病人病歷查看彈窗
        export function closePatientMedicalHistoryModal() {
            document.getElementById('patientMedicalHistoryModal').classList.add('hidden');
            closeHistoryCalendar('patient');
            G.consultationHistoryPager.close('patient');
        }



        // 診症系統中的病歷查看功能
        
// 5. 修改查看病人診症記錄功能
export async function viewPatientMedicalHistory(patientId) {
    // 取得觸發按鈕：優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector(`button[onclick="viewPatientMedicalHistory('${patientId}')"]`);
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '讀取中...');
    }

    const modal = document.getElementById('medicalHistoryModal');
    const contentDiv = document.getElementById('medicalHistoryContent');
    const titleEl = document.getElementById('medicalHistoryTitle');
    const patientInfoEl = document.getElementById('medicalHistoryPatientInfo');

    // 先顯示 modal 與讀取圈
    if (titleEl) titleEl.textContent = '診症記錄';
    if (patientInfoEl) patientInfoEl.innerHTML = '';
    if (contentDiv) {
        contentDiv.innerHTML = `
            <div class="text-center py-12">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <div class="mt-2 text-sm text-gray-600">載入病歷中...</div>
            </div>
        `;
    }
    if (modal) modal.classList.remove('hidden');

    try {
        const patient = await getPatientByIdWithRefresh(patientId);
        if (!patient) {
            G.showToast('找不到病人資料', 'error');
            if (modal) modal.classList.add('hidden');
            return;
        }
        
        // 透過共用 pager 載入並同步狀態
        const consultationResult = await G.consultationHistoryPager.loadForContext('consultation', patientId);
        if (!consultationResult.success) {
            G.showToast('無法讀取診症記錄', 'error');
            if (modal) modal.classList.add('hidden');
            return;
        }
        
        // 設置標題（轉義使用者輸入，避免 XSS）
        if (titleEl) titleEl.textContent = `${window.escapeHtml(patient.name)} 的診症記錄`;
        
        // 顯示病人基本資訊
        if (patientInfoEl) {
            patientInfoEl.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                        <span class="font-medium text-gray-700">病人編號：</span>
                <span class="text-blue-600 font-semibold">${window.escapeHtml(patient.patientNumber)}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">姓名：</span>
                <span class="font-semibold">${window.escapeHtml(patient.name)}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">年齡：</span>
                <span>${window.escapeHtml(G.formatAge(patient.birthDate))}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">性別：</span>
                <span>${window.escapeHtml(patient.gender)}</span>
                    </div>
                    ${patient.history ? `
                    <div class="md:col-span-1 lg:col-span-2">
                        <span class="font-medium text-gray-700">病史及備註：</span>
                        <span class="medical-field text-gray-700">${window.escapeHtml(patient.history)}</span>
                    </div>
                    ` : ''}
                    ${patient.allergies ? `
                    <div class="md:col-span-1 lg:col-span-2">
                        <span class="medical-field text-red-700 bg-red-50 px-2 py-1 rounded">${window.escapeHtml(patient.allergies)}</span>
                    </div>
                    ` : ''}
                </div>
            `;
        }
        
        G.currentConsultationHistoryPatientId = patientId;
        closeHistoryCalendar('consultation');
        // 顯示分頁病歷記錄
        displayConsultationMedicalHistoryPage();
    } catch (error) {
        console.error('查看病人診症記錄錯誤:', error);
        G.showToast('讀取病人資料失敗', 'error');
        if (modal) modal.classList.add('hidden');
    } finally {
        // 清除按鈕的讀取狀態
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}
        
// 修復病歷記錄顯示中的日期問題
export async function displayConsultationMedicalHistoryPage() {
    const contentDiv = document.getElementById('medicalHistoryContent');

    // Determine the current language and translation dictionary.  We rely on
    // localStorage to persist the selected language (zh or en).  If an
    // unsupported value is found we default to Chinese.  The translation
    // dictionary is used for translating static labels while dynamic
    // segments (such as numbered visits) are constructed below.
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
    const dict = (window.translations && window.translations[lang]) ? window.translations[lang] : {};
    
    if (G.currentConsultationConsultations.length === 0) {
        // When there are no consultation records, we still allow the text
        // content to be translated by the i18n observer.  Therefore
        // Chinese strings are left intact here and will be replaced if the
        // language is set to English via the dictionary.
        contentDiv.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <div class="mb-4 flex justify-center"><i data-lucide="clipboard-list" class="w-10 h-10 text-blue-400"></i></div>
                <div class="text-lg font-medium mb-2">暫無診症記錄</div>
                <div class="text-sm">該病人尚未有診症記錄</div>
            </div>
        `;
        return;
    }
    
    const consultation = G.currentConsultationConsultations[G.currentConsultationHistoryPage];
    const totalPages = G.currentConsultationConsultations.length;
    const currentPageNumber = G.currentConsultationHistoryPage + 1;
    const consultationNumber = G.currentConsultationHistoryPage + 1;
    if (!consultation) {
        contentDiv.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <div class="text-lg font-medium mb-2">正在載入病歷...</div>
            </div>
        `;
        return;
    }
    if (!G.canCurrentUserViewConsultationEntry(consultation)) {
        contentDiv.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <div class="text-lg font-medium mb-2">暫無診症記錄</div>
                <div class="text-sm">您沒有查看此病歷的權限</div>
            </div>
        `;
        return;
    }

    // 預先建立含餘下套票次數的收費項目 HTML（與收據顯示一致）
    const billingItemsDisplayHtml = await G.buildConsultationBillingDisplayHtml(
        consultation,
        (typeof G.currentConsultationHistoryPatientId !== 'undefined' && G.currentConsultationHistoryPatientId) || consultation.patientId || ''
    );
    // 病歷是否曾被實質修改（以審核日誌為準）：驅動「已修改」標籤與「審核追蹤」按鈕
    const isMedicalRecordModified = await fetchMedicalRecordEdited(consultation);
    // 判斷本次診症是否有開藥；沒有開藥時隱藏處方內容與服用方法欄位
    const hasPrescription = G.consultationHasPrescription(consultation);

    // 病歷附件（R2）：載入該病人附件並取出本次診次的縮圖；失敗不影響病歷顯示
    const maVisitThumbs = { otherHtml: '', tongueHtml: '', hasOther: false, hasTongue: false };
    try {
        if (window.MedicalAttachments) {
            const maPatientId = (typeof G.currentConsultationHistoryPatientId !== 'undefined' && G.currentConsultationHistoryPatientId) || consultation.patientId || '';
            if (maPatientId) {
                await window.MedicalAttachments.listForPatient(String(maPatientId));
                const maGroups = window.MedicalAttachments.visitGroups(String(maPatientId), String(consultation.id));
                maVisitThumbs.hasOther = maGroups.attachments.length > 0;
                maVisitThumbs.hasTongue = maGroups.tongues.length > 0;
                maVisitThumbs.otherHtml = window.MedicalAttachments.inlineThumbsHtml(maGroups.attachments, String(maPatientId), String(consultation.id), 'other', '醫學報告');
                maVisitThumbs.tongueHtml = window.MedicalAttachments.inlineThumbsHtml(maGroups.tongues, String(maPatientId), String(consultation.id), 'tongue');
            }
        }
    } catch (_maErr) {
        console.warn('病歷附件載入失敗（不影響病歷顯示）:', _maErr);
    }

    // Build translated dynamic strings.  For Chinese we keep the original
    // formatting; for English we generate equivalent phrases.  The
    // dictionary lookup is used for static terms like '診症記錄',
    // '較舊', '較新', '醫師：', and '病歷編號：'.
    const recordTitle = dict['診症記錄'] || '診症記錄';
    const visitText = lang !== 'en'
        ? `第 ${consultationNumber} 次診症`
        : `Visit ${consultationNumber}`;
    const totalText = lang !== 'en'
        ? `共 ${totalPages} 次診症記錄`
        : `Total ${totalPages} consultation records`;
    const prevLabel = dict['較舊'] || '較舊';
    const nextLabel = dict['較新'] || '較新';
    const doctorLabel = dict['醫師：'] || '醫師：';
    const recordNumberLabel = dict['病歷編號：'] || '病歷編號：';
    const clinicLabel = dict['診所：'] || '診所：';
    const hideDoctorInfo = G.shouldHideGeneralRegistrationDoctorInfo(consultation, null);
    const generalRegistrationBadge = G.isGeneralRegistrationConsultation(consultation)
        ? `<span class="text-sm text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-100 shadow-sm">${window.escapeHtml(G.getGeneralRegistrationSourceLabel(String(lang).toLowerCase().startsWith('en')))}</span>`
        : '';
    const calendarHtml = buildHistoryCalendarHtml('consultation');

    // Compose the HTML content with translated dynamic labels.  Chinese
    // strings remain in the markup for static phrases that the i18n
    // framework can translate after insertion.  Dynamic segments are
    // constructed above.
    contentDiv.innerHTML = `
        <!-- 分頁導航 -->
        <div class="mb-6 flex justify-between items-center bg-gray-50 rounded-lg p-4">
            <div class="flex items-center space-x-4">
                <h4 class="text-lg font-semibold text-gray-800">${recordTitle}</h4>
                <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                    ${visitText}
                </span>
                <span class="text-sm text-gray-600">
                    ${totalText}
                </span>
            </div>
            
            <div class="flex items-center space-x-2">
                <button onclick="toggleHistoryCalendar('consultation', event)"
                        class="px-3 py-1 bg-white text-blue-700 border border-blue-200 rounded hover:bg-blue-50 text-sm">
                    日曆
                </button>
                <button onclick="changeConsultationHistoryPage(-1, event)" 
                        ${G.currentConsultationHistoryPage === 0 ? 'disabled' : ''}
                        class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">
                    ← ${prevLabel}
                </button>
                <span class="text-sm text-gray-600 px-2">
                    ${currentPageNumber} / ${totalPages}
                </span>
                <button onclick="changeConsultationHistoryPage(1, event)" 
                        ${G.currentConsultationHistoryPage === totalPages - 1 ? 'disabled' : ''}
                        class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">
                    ${nextLabel} →
                </button>
            </div>
        </div>
        ${calendarHtml}
        
        <!-- 當前病歷記錄 -->
        <div class="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div class="bg-linear-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div class="flex flex-col space-y-2">
                        <span class="font-semibold text-gray-900 text-lg">
                            ${G.formatConsultationDateTime(consultation.date)}
                        </span>
                        ${(() => {
                            let clinicName = '';
                            try {
                                if (consultation.clinicName) clinicName = consultation.clinicName;
                                else if (consultation.clinicId) {
                                    const foundClinic = Array.isArray(G.clinicsList) ? G.clinicsList.find(c => String(c.id) === String(consultation.clinicId)) : null;
                                    clinicName = foundClinic ? (foundClinic.chineseName || foundClinic.englishName || '') : '';
                                } else {
                                    clinicName = '';
                                }
                            } catch (_e) {
                                clinicName = '';
                            }
                            return `
                            <div class="flex flex-wrap items-center gap-2">
                                ${generalRegistrationBadge}
                                ${hideDoctorInfo ? '' : `
                                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">
                                    ${doctorLabel}${window.escapeHtml(G.getDoctorDisplayName(consultation.doctor))}
                                </span>
                                `}
                                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">
                                    ${recordNumberLabel}${window.escapeHtml(consultation.medicalRecordNumber || consultation.id)}
                                </span>
                                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">
                                    ${clinicLabel}${window.escapeHtml(clinicName || '未設定')}
                                </span>
                                ${isMedicalRecordModified ? `
                                    <span class="text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-100">
                                        已修改
                                    </span>
                                ` : ''}
                            </div>`;
                        })()}
                    </div>
                    <div class="medical-history-actions">
                        ${renderMedicalHistoryActionButtons(consultation, { includeSickLeave: true, isModified: isMedicalRecordModified })}
                    </div>
                </div>
            </div>
            
                    <div class="p-6">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="space-y-4">
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">主訴</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.symptoms || '無記錄')}</div>
                                    ${maVisitThumbs.otherHtml}
                                </div>

                                ${consultation.currentHistory ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">現病史</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.currentHistory)}</div>
                                </div>
                                ` : ''}

                                ${(consultation.tongue || maVisitThumbs.hasTongue) ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">舌象</span>
                                    ${consultation.tongue ? `<div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.tongue)}</div>` : ''}
                                    ${maVisitThumbs.tongueHtml}
                                </div>
                                ` : ''}
                                
                                ${consultation.pulse ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">脈象</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.pulse)}</div>
                                </div>
                                ` : ''}
                                
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">中醫診斷</span>
                                    <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 medical-field">${window.escapeHtml(consultation.diagnosis || '無記錄')}</div>
                                </div>
                                
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">證型診斷</span>
                                    <div class="bg-blue-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-blue-400 medical-field">${window.escapeHtml(consultation.syndrome || '無記錄')}</div>
                                </div>
                                
                                ${consultation.acupunctureNotes ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">針灸備註</span>
                                    <div class="bg-orange-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-orange-400 medical-field">${window.escapeHtml(window.stripHtmlTags(consultation.acupunctureNotes))}</div>
                                </div>
                                ` : ''}
                            </div>
                            
                            <div class="space-y-4">
                                ${hasPrescription ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">處方內容</span>
                                    ${(() => {
                                        let html = '無記錄';
                                        try {
                                            if (consultation.multiPrescriptions) {
                                                const mp = JSON.parse(consultation.multiPrescriptions);
                                                if (Array.isArray(mp) && mp.length > 0) {
                                                    const showNames = mp.length > 1;
                                                    let block = '';
                                                    mp.forEach((section, sIdx) => {
                                                        const secName = section && section.name ? section.name : `處方${sIdx + 1}`;
                                                        const items = Array.isArray(section && section.items) ? section.items : [];
                                                        const lines = items.map(it => {
                                                            const dose = it.customDosage || (it.type === 'herb' ? '1' : '5');
                                                            const unit = (it && it.dosage && typeof it.dosage === 'string' && it.dosage.endsWith('g')) ? 'g' : 'g';
                                                            return `<div style="margin-bottom: 4px;">${window.escapeHtml(it.name)} ${window.escapeHtml(String(dose))}${unit}</div>`;
                                                        });
                                                        const modeLabel = (section && section.mode === 'granule') ? '顆粒沖劑' : ((section && section.mode === 'slice') ? '飲片' : '');
                                                        const nameWithMode = showNames ? `<div style="font-weight:bold;margin-bottom:2px;">${window.escapeHtml(secName)}${modeLabel ? `<span style="font-size:0.5em;">（${window.escapeHtml(modeLabel)}）</span>` : ''}</div>` : '';
                                                        block += `<div style="margin-bottom:6px;">${nameWithMode}${lines.join('')}</div>`;
                                                    });
                                                    html = block;
                                                }
                                            } else if (consultation.prescription) {
                                                html = window.escapeHtml(consultation.prescription).replace(/\n/g, '<br>');
                                            }
                                        } catch (_e) {
                                            html = consultation.prescription ? window.escapeHtml(consultation.prescription).replace(/\n/g, '<br>') : '無記錄';
                                        }
                                        return `<div class="bg-yellow-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-yellow-400 medical-field">${html}</div>`;
                                    })()}
                                </div>
                                ` : ''}
                                
                                ${(() => {
                                    if (!hasPrescription) return '';
                                    let medInfoHtml = '';
                                    try {
                                        if (consultation.multiPrescriptions) {
                                            const mp = JSON.parse(consultation.multiPrescriptions);
                                            if (Array.isArray(mp) && mp.length > 0) {
                                                const showNames = mp.length > 1;
                                                const lines = mp.map((section, idx) => {
                                                    const secName = section && section.name ? section.name : `處方${idx + 1}`;
                                                    const d = parseInt(section && section.days) || 0;
                                                    const f = parseInt(section && section.freq) || (parseInt(consultation.medicationFrequency) || 0);
                                                    const partDays = d > 0 ? `服藥天數：${d}天` : '';
                                                    const partFreq = f > 0 ? `每日次數：${f}次` : '';
                                                    const combined = [partDays, partFreq].filter(Boolean).join('　');
                                                    return combined ? `${showNames ? (secName + '：') : ''}${combined}` : '';
                                                }).filter(Boolean);
                                                if (lines.length > 0) {
                                                    medInfoHtml += lines.map(l => `<div>${window.escapeHtml(l)}</div>`).join('');
                                                }
                                            }
                                        } else {
                                            const parts = [];
                                            if (consultation.medicationDays && Number(consultation.medicationDays) > 0) {
                                                parts.push('服藥天數：' + consultation.medicationDays + '天');
                                            }
                                            if (consultation.medicationFrequency && Number(consultation.medicationFrequency) > 0) {
                                                parts.push('每日次數：' + consultation.medicationFrequency + '次');
                                            }
                                            if (parts.length > 0) {
                                                medInfoHtml += `<div>${window.escapeHtml(parts.join('　'))}</div>`;
                                            }
                                        }
                                    } catch (_e) {}
                                    if (consultation.usage) {
                                        medInfoHtml += `<div>${window.escapeHtml(consultation.usage)}</div>`;
                                    }
                                    return `
                                        <div>
                                            <span class="text-sm font-semibold text-gray-700 block mb-2">服用方法</span>
                                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${medInfoHtml || '無記錄'}</div>
                                        </div>
                                    `;
                                })()}
                        
                        ${consultation.treatmentCourse ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">療程</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(consultation.treatmentCourse)}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.instructions ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">醫囑及注意事項</span>
                            <div class="bg-red-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-red-400 medical-field">${window.escapeHtml(consultation.instructions)}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.followUpDate ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">複診時間</span>
                            <div class="bg-purple-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-purple-400 medical-field">${G.formatConsultationDateTime(consultation.followUpDate)}</div>
                        </div>
                        ` : ''}
                        
                        ${billingItemsDisplayHtml ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">收費項目</span>
                            <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 whitespace-pre-line medical-field">${billingItemsDisplayHtml}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}
