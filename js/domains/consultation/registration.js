/* ============================================================
 * consultation/registration.js — 掛號（日期選擇／病人搜尋／
 * confirm/clear/loadToday/subscribe）、應診、開診/接續、
 * loadConsultationForEdit、約診列渲染與 parser（Phase 6 子批 C）。
 * 共享狀態經 G；開方/收費/儲存/套票/列印走 window facade。
 * ============================================================ */
import { G } from '../../lib/legacy.js';

        export function loadConsultationSystem() {
            
            clearOldAppointments()
                .catch(err => {
                    
                    console.error('切換掛號系統時清除過期掛號錯誤:', err);
                })
                .finally(() => {
                    
                    try {
                        if (typeof subscribeToAppointments === 'function') {
                            subscribeToAppointments();
                        }
                    } catch (_err) {
                        console.error('啟動掛號監聽時失敗:', _err);
                    }
                    
                    try {
                        setupAppointmentDatePicker();
                    } catch (_e) {
                        
                    }
                    
                    loadTodayAppointments();
                    
                    clearPatientSearch();
                });
        }

        
        export function setupAppointmentDatePicker() {
            try {
                const picker = document.getElementById('appointmentDatePicker');
                if (!picker) return;
                
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const localToday = new Date(startOfToday.getTime() - startOfToday.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 10);
                // 掛號列表日期限制為當日及未來
                picker.min = localToday;
                // 每次進入診症系統都預設跳回今天
                picker.value = localToday;
                
                if (!picker.dataset.bound) {
                    picker.addEventListener('change', function () {
                        try {
                            
                            if (typeof subscribeToAppointments === 'function') {
                                subscribeToAppointments();
                            }
                            
                            loadTodayAppointments();
                        } catch (_err) {
                            console.error('更新掛號列表或重新啟動監聽失敗：', _err);
                        }
                    });
                    picker.dataset.bound = 'true';
                }

                // setup 在 subscribeToAppointments() 之後被呼叫，這裡再同步一次監聽日期為今天
                if (typeof subscribeToAppointments === 'function') {
                    subscribeToAppointments();
                }
            } catch (err) {
                console.error('初始化日期選擇器失敗：', err);
            }
        }

        export function parseAppointmentPickerDate(value) {
            const raw = String(value || '').trim();
            const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!match) return null;
            const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            return isNaN(parsed.getTime()) ? null : parsed;
        }

        export function formatLocalDateTimeInputValue(date) {
            if (!(date instanceof Date) || isNaN(date.getTime())) return '';
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        }

        export function getDefaultAppointmentDateTimeValue() {
            const now = new Date();
            now.setMinutes(now.getMinutes() + 5);

            try {
                const picker = document.getElementById('appointmentDatePicker');
                const selectedDate = picker ? parseAppointmentPickerDate(picker.value) : null;
                if (selectedDate) {
                    const startOfSelectedDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                    const startOfToday = new Date();
                    startOfToday.setHours(0, 0, 0, 0);

                    if (startOfSelectedDay.getTime() > startOfToday.getTime()) {
                        return formatLocalDateTimeInputValue(new Date(
                            selectedDate.getFullYear(),
                            selectedDate.getMonth(),
                            selectedDate.getDate(),
                            now.getHours(),
                            now.getMinutes(),
                            0,
                            0
                        ));
                    }
                }
            } catch (_e) {
                // 回退到目前時間即可
            }

            return formatLocalDateTimeInputValue(now);
        }
        

export async function searchPatientsForRegistration() {
    const searchTerm = document.getElementById('patientSearchInput').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('patientSearchResults');
    const resultsList = document.getElementById('searchResultsList');
    
    if (searchTerm.length < 1) {
        resultsContainer.classList.add('hidden');
        return;
    }
    
    
    resultsList.innerHTML = `
        <div class="p-4 text-center text-gray-500">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <div class="mt-2">搜尋中...</div>
        </div>
    `;
    resultsContainer.classList.remove('hidden');
    
    try {
        
        let searchResult;
        try {
            searchResult = await window.firebaseDataManager.searchPatients(searchTerm, 20);
        } catch (_err) {
            console.error('搜尋病人時發生錯誤:', _err);
        }
        const matchedPatients = (searchResult && searchResult.success && Array.isArray(searchResult.data)) ? searchResult.data : [];
        
        if (matchedPatients.length === 0) {
            resultsList.innerHTML = `
                <div class="p-4 text-center text-gray-500">
                    找不到符合條件的病人
                </div>
            `;
            resultsContainer.classList.remove('hidden');
            return;
        }
        
        
        resultsList.innerHTML = matchedPatients.map(patient => {
            const safeId = String(patient.id).replace(/"/g, '&quot;');
            const safeName = window.escapeHtml(patient.name);
            const safeNumber = window.escapeHtml(patient.patientNumber || '');
            const safeAge = window.escapeHtml(G.formatAge(patient.birthDate));
            // 使用國際化函式翻譯性別及標籤
            const genderTranslated = window.t ? window.t(patient.gender) : patient.gender;
            const safeGender = window.escapeHtml(genderTranslated);
            const safePhone = window.escapeHtml(patient.phone);
            // 翻譯標籤：編號、年齡、性別、電話
            const lblNumber = window.t ? window.t('編號：') : '編號：';
            const lblAge = window.t ? window.t('年齡：') : '年齡：';
            const lblGender = window.t ? window.t('性別：') : '性別：';
            const lblPhone = window.t ? window.t('電話：') : '電話：';
            return `
            <div class="p-4 hover:bg-gray-50 cursor-pointer transition duration-200" data-patient-id="${safeId}" onclick="selectPatientForRegistration('${safeId}')">
                <div>
                    <div class="font-semibold text-gray-900">${safeName}</div>
                    <div class="text-sm text-gray-600">${lblNumber}${safeNumber} | ${lblAge}${safeAge} | ${lblGender}${safeGender}</div>
                    <div class="text-sm text-gray-500">${lblPhone}${safePhone}</div>
                </div>
            </div>
            `;
        }).join('');

        // 每次載入搜尋結果時重置鍵盤選擇索引
        G.patientSearchSelectionIndex = -1;
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        console.error('搜尋病人資料錯誤:', error);
        resultsList.innerHTML = `
            <div class="p-4 text-center text-red-500">
                搜尋失敗，請檢查網路連接
            </div>
        `;
    }
}

/**
 * 處理掛號搜尋輸入框的鍵盤事件，支援上下鍵選擇搜尋結果項目，並按 Enter 執行掛號。
 * 當搜尋結果列表顯示時：
 *  - ArrowDown 會移動到下一個結果；
 *  - ArrowUp 會移動到上一個結果；
 *  - Enter 會選中當前高亮的病人並執行 selectPatientForRegistration。
 * 若沒有搜尋結果或列表未顯示，則不做任何處理。
 * @param {KeyboardEvent} ev 鍵盤事件
 */
export function handlePatientSearchKeyDown(ev) {
    const key = ev && ev.key;
    if (!key || !(['ArrowUp', 'ArrowDown', 'Enter'].includes(key))) {
        return;
    }
    try {
        const resultsContainer = document.getElementById('patientSearchResults');
        const resultsList = document.getElementById('searchResultsList');
        // 僅當結果容器存在且為顯示狀態時處理
        if (!resultsContainer || resultsContainer.classList.contains('hidden')) {
            return;
        }
        const items = Array.from(resultsList.querySelectorAll('[data-patient-id]'));
        if (!items || items.length === 0) {
            return;
        }
        if (key === 'ArrowDown') {
            ev.preventDefault();
            // 選擇下一項目，超出範圍則回到第一項
            G.patientSearchSelectionIndex = (G.patientSearchSelectionIndex + 1) % items.length;
            // 更新高亮
            items.forEach((el, idx) => {
                if (idx === G.patientSearchSelectionIndex) {
                    el.classList.add('bg-blue-100');
                } else {
                    el.classList.remove('bg-blue-100');
                }
            });
            // 確保目前選中項目可見
            const currentEl = items[G.patientSearchSelectionIndex];
            if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                currentEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (key === 'ArrowUp') {
            ev.preventDefault();
            // 選擇上一項目，超出範圍則回到最後一項
            G.patientSearchSelectionIndex = (G.patientSearchSelectionIndex - 1 + items.length) % items.length;
            // 更新高亮
            items.forEach((el, idx) => {
                if (idx === G.patientSearchSelectionIndex) {
                    el.classList.add('bg-blue-100');
                } else {
                    el.classList.remove('bg-blue-100');
                }
            });
            // 確保目前選中項目可見
            const currentEl = items[G.patientSearchSelectionIndex];
            if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                currentEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (key === 'Enter') {
            // 僅在已選中某項時處理 Enter
            if (G.patientSearchSelectionIndex >= 0 && G.patientSearchSelectionIndex < items.length) {
                ev.preventDefault();
                const selectedEl = items[G.patientSearchSelectionIndex];
                const pid = selectedEl && selectedEl.dataset ? selectedEl.dataset.patientId : null;
                if (pid) {
                    try {
                        // 直接呼叫選擇病人函式
                        selectPatientForRegistration(pid);
                    } catch (_err) {
                        console.error('鍵盤選擇掛號病人失敗:', _err);
                    }
                }
            }
        }
    } catch (err) {
        console.error('處理掛號搜尋鍵盤事件錯誤:', err);
    }
}

/**
 * 處理個人慣用中藥組合搜尋欄的鍵盤事件。
 * 允許使用者透過方向鍵在搜尋結果中移動選擇，並用 Enter 鍵選取。
 * @param {KeyboardEvent} ev 鍵盤事件
 */
export function handleHerbIngredientSearchKeyDown(ev) {
    const key = ev && ev.key;
    // 只處理上下方向鍵與 Enter 鍵
    if (!key || !(['ArrowUp', 'ArrowDown', 'Enter'].includes(key))) {
        return;
    }
    try {
        const resultsContainer = document.getElementById('herbIngredientSearchResults');
        const resultsList = document.getElementById('herbIngredientSearchList');
        // 必須存在且為顯示狀態
        if (!resultsContainer || resultsContainer.classList.contains('hidden')) {
            return;
        }
        // 找出可選項目：僅挑選帶有 cursor-pointer 的 div
        const items = Array.from(resultsList.querySelectorAll('div.cursor-pointer'));
        if (!items || items.length === 0) {
            return;
        }
        if (key === 'ArrowDown') {
            ev.preventDefault();
            G.herbIngredientSearchSelectionIndex = (G.herbIngredientSearchSelectionIndex + 1) % items.length;
            items.forEach((el, idx) => {
                if (idx === G.herbIngredientSearchSelectionIndex) {
                    el.classList.add('bg-green-200');
                } else {
                    el.classList.remove('bg-green-200');
                }
            });
            const currentEl = items[G.herbIngredientSearchSelectionIndex];
            if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                currentEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (key === 'ArrowUp') {
            ev.preventDefault();
            G.herbIngredientSearchSelectionIndex = (G.herbIngredientSearchSelectionIndex - 1 + items.length) % items.length;
            items.forEach((el, idx) => {
                if (idx === G.herbIngredientSearchSelectionIndex) {
                    el.classList.add('bg-green-200');
                } else {
                    el.classList.remove('bg-green-200');
                }
            });
            const currentEl = items[G.herbIngredientSearchSelectionIndex];
            if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                currentEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (key === 'Enter') {
            if (G.herbIngredientSearchSelectionIndex >= 0 && G.herbIngredientSearchSelectionIndex < items.length) {
                ev.preventDefault();
                const selectedEl = items[G.herbIngredientSearchSelectionIndex];
                if (selectedEl && typeof selectedEl.click === 'function') {
                    selectedEl.click();
                }
            }
        }
    } catch (err) {
        console.error('處理中藥組合搜尋鍵盤事件錯誤:', err);
    }
}

/**
 * 處理個人慣用穴位組合搜尋欄的鍵盤事件。
 * 允許使用者透過方向鍵在搜尋結果中移動選擇，並用 Enter 鍵選取。
 * @param {KeyboardEvent} ev 鍵盤事件
 */
export function handleAcupointComboSearchKeyDown(ev) {
    const key = ev && ev.key;
    if (!key || !(['ArrowUp', 'ArrowDown', 'Enter'].includes(key))) {
        return;
    }
    try {
        const resultsContainer = document.getElementById('acupointPointSearchResults');
        const resultsList = document.getElementById('acupointPointSearchList');
        if (!resultsContainer || resultsContainer.classList.contains('hidden')) {
            return;
        }
        const items = Array.from(resultsList.querySelectorAll('div.cursor-pointer'));
        if (!items || items.length === 0) {
            return;
        }
        if (key === 'ArrowDown') {
            ev.preventDefault();
            G.acupointComboSearchSelectionIndex = (G.acupointComboSearchSelectionIndex + 1) % items.length;
            items.forEach((el, idx) => {
                if (idx === G.acupointComboSearchSelectionIndex) {
                    el.classList.add('bg-blue-200');
                } else {
                    el.classList.remove('bg-blue-200');
                }
            });
            const currentEl = items[G.acupointComboSearchSelectionIndex];
            if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                currentEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (key === 'ArrowUp') {
            ev.preventDefault();
            G.acupointComboSearchSelectionIndex = (G.acupointComboSearchSelectionIndex - 1 + items.length) % items.length;
            items.forEach((el, idx) => {
                if (idx === G.acupointComboSearchSelectionIndex) {
                    el.classList.add('bg-blue-200');
                } else {
                    el.classList.remove('bg-blue-200');
                }
            });
            const currentEl = items[G.acupointComboSearchSelectionIndex];
            if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                currentEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (key === 'Enter') {
            if (G.acupointComboSearchSelectionIndex >= 0 && G.acupointComboSearchSelectionIndex < items.length) {
                ev.preventDefault();
                const selectedEl = items[G.acupointComboSearchSelectionIndex];
                if (selectedEl && typeof selectedEl.click === 'function') {
                    selectedEl.click();
                }
            }
        }
    } catch (err) {
        console.error('處理穴位組合搜尋鍵盤事件錯誤:', err);
    }
}
        
// 2. 修改選擇病人進行掛號函數
export async function selectPatientForRegistration(patientId) {
    // 檢查是否需要限制醫師掛號操作：只有醫師在診症時才限制
    let consultingAppointment = null;
    const isDoctorUser = G.currentUserData && G.currentUserData.position === '醫師';
    if (isDoctorUser) {
        // 檢查當天是否有同一醫師正在診症
        consultingAppointment = G.appointments.find(apt =>
            apt.status === 'consulting' &&
            G.getAppointmentResponsibleDoctorUsername(apt) === G.currentUserData.username &&
            new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
        );
    }
    
    if (consultingAppointment) {
        try {
            // 若醫師正在診症其他病人，取得該病人資料（使用新函式以防快取過期）
            const consultingPatient = await G.getPatientByIdWithRefresh(consultingAppointment.patientId);
            const consultingPatientName = consultingPatient ? consultingPatient.name : '某位病人';
            // If the doctor is currently consulting another patient, inform the user in their chosen language
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `無法進行掛號！您目前正在為 ${consultingPatientName} 診症中，請完成後再進行掛號操作。`;
                const enMsg = `Cannot register! You are currently consulting ${consultingPatientName}. Please finish before registering another patient.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'warning');
            }
            return;
        } catch (error) {
            console.error('檢查診症狀態錯誤:', error);
        }
    }
    
    try {
        // 使用新的函式取得選擇的病人資料
        const patient = await G.getPatientByIdWithRefresh(patientId);
        if (!patient) {
            G.showToast('找不到病人資料', 'error');
            return;
        }
        G.selectedPatientForRegistration = patient;
        showRegistrationModal(patient);
    } catch (error) {
        console.error('選擇病人資料錯誤:', error);
        G.showToast('讀取病人資料失敗', 'error');
    }
}
        
        // 清除病人搜索
        export function clearPatientSearch() {
            document.getElementById('patientSearchInput').value = '';
            document.getElementById('patientSearchResults').classList.add('hidden');
            G.selectedPatientForRegistration = null;
        }
        

        
        // 顯示掛號彈窗
        export function showRegistrationModal(patient) {
            if (!patient) return;
            
            // 顯示選中的病人資訊，對文字進行轉義避免 XSS
            const safeName = window.escapeHtml(patient.name);
            const safeNumber = window.escapeHtml(patient.patientNumber || '');
            const safeAge = window.escapeHtml(G.formatAge(patient.birthDate));
            const safeGender = window.escapeHtml(patient.gender);
            const safePhone = window.escapeHtml(patient.phone);
            document.getElementById('selectedPatientInfo').innerHTML = `
                <div class="space-y-1">
                    <div><span class="font-medium">姓名：</span>${safeName}</div>
                    <div><span class="font-medium">編號：</span>${safeNumber}</div>
                    <div><span class="font-medium">年齡：</span>${safeAge} | <span class="font-medium">性別：</span>${safeGender}</div>
                    <div><span class="font-medium">電話：</span>${safePhone}</div>
                </div>
            `;
            
            // 載入醫師選項
            loadDoctorOptions();
            
            // 設置掛號時間輸入欄的預設值
            const appointmentInput = document.getElementById('appointmentDateTime');
            appointmentInput.value = getDefaultAppointmentDateTimeValue();

            // 設置允許選擇的最小日期時間為今日 00:00
            // 依需求，掛號時間只能選擇「今日」或之後的日期
            const today = new Date();
            const tYear = today.getFullYear();
            const tMonth = String(today.getMonth() + 1).padStart(2, '0');
            const tDay = String(today.getDate()).padStart(2, '0');
            const minDateTime = `${tYear}-${tMonth}-${tDay}T00:00`;
            appointmentInput.min = minDateTime;
            
            clearRegistrationForm();
            // 根據病人載入問診資料選項
            try {
                G.loadInquiryOptions(patient);
            } catch (_e) {
                console.warn('載入問診資料選項失敗:', _e);
            }
            document.getElementById('registrationModal').classList.remove('hidden');
        }
        
        // 載入醫師選項
        export function loadDoctorOptions() {
            const doctorSelect = document.getElementById('appointmentDoctor');
            
            // 獲取所有啟用的醫師用戶
            const doctors = G.users.filter(user => 
                user.active && user.position === '醫師'
            );
            
            // 清空現有選項（保留預設選項）
            doctorSelect.innerHTML = '<option value="">請選擇醫師</option>';
            doctorSelect.innerHTML += `<option value="${G.GENERAL_REGISTRATION_DOCTOR_KEY}">${G.GENERAL_REGISTRATION_LABEL}</option>`;
    // 取得翻譯函式
    const translate = typeof window.t === 'function' ? window.t : (s) => s;

    // 添加醫師選項，動態翻譯職位名稱。
    doctors.forEach(doctor => {
        const option = document.createElement('option');
        option.value = doctor.username;
        // 取得翻譯後的職位名稱
        const translatedRole = translate('醫師');
        // 根據翻譯結果決定是否在姓名與職位之間插入空格。
        const joiner = translatedRole !== '醫師' ? ' ' : '';
        option.textContent = `${doctor.name}${joiner}${translatedRole}`;
        // 若有註冊編號則加入括號顯示
        if (doctor.registrationNumber) {
            option.textContent += ` (${doctor.registrationNumber})`;
        }
        doctorSelect.appendChild(option);
    });

    // 如果當前用戶是醫師，預設選擇自己
    if (G.currentUserData && G.currentUserData.position === '醫師') {
        doctorSelect.value = G.currentUserData.username;
    }
        }
        
        // 關閉掛號彈窗
        export function closeRegistrationModal() {
            document.getElementById('registrationModal').classList.add('hidden');
            clearRegistrationForm();
            G.selectedPatientForRegistration = null;
        }
        
        // 清空掛號表單
        export function clearRegistrationForm() {
            document.getElementById('appointmentDoctor').value = '';
            document.getElementById('quickChiefComplaint').value = '';
            // 重置問診資料下拉選單
            const inquirySelect = document.getElementById('inquirySelect');
            if (inquirySelect) {
                inquirySelect.value = '';
            }

            // 重設主訴欄位顯示狀態（若已有問診資料則隱藏，反之顯示）
            try {
                const toggler = window.toggleChiefComplaintVisibility;
                if (typeof toggler === 'function') {
                    toggler();
                }
            } catch (_e) {
                // 若未定義切換函式，忽略錯誤
            }
        }
        
        // 確認掛號
        export async function confirmRegistration() {
            if (!G.selectedPatientForRegistration) {
                G.showToast('系統錯誤：未選擇病人！', 'error');
                return;
            }
            
            const appointmentDateTime = document.getElementById('appointmentDateTime').value;
            const appointmentDoctor = document.getElementById('appointmentDoctor').value;
            const chiefComplaint = document.getElementById('quickChiefComplaint').value.trim();

            // 取得選擇的問診資料 ID 並準備對應的資料
            let selectedInquiryId = '';
            let inquiryDataForAppointment = null;
            let inquirySummaryForAppointment = '';
            try {
                const inquirySelectEl = document.getElementById('inquirySelect');
                if (inquirySelectEl) {
                    selectedInquiryId = inquirySelectEl.value;
                }
                if (selectedInquiryId) {
                    const rec = G.inquiryOptionsData ? G.inquiryOptionsData[selectedInquiryId] : null;
                    if (rec && rec.data) {
                        inquiryDataForAppointment = rec.data;
                        // 產生摘要供預填主訴或展示
                        inquirySummaryForAppointment = G.getMainSymptomFromResult(rec.data);
                    }
                }
            } catch (err) {
                console.warn('處理問診資料時發生錯誤:', err);
            }
            
            if (!appointmentDateTime) {
                G.showToast('請選擇掛號時間！', 'error');
                return;
            }
            
            if (!appointmentDoctor) {
                G.showToast('請選擇掛號醫師！', 'error');
                return;
            }
            
            const selectedDoctorMeta = G.getRegistrationDoctorMeta(appointmentDoctor);

            if (!selectedDoctorMeta.isGeneralRegistration && !selectedDoctorMeta.user) {
                G.showToast('選擇的醫師無效，請重新選擇！', 'error');
                return;
            }
            
            // 驗證掛號時間不能是過去時間（允許1分鐘的誤差）
            const selectedTime = new Date(appointmentDateTime);
            const now = new Date();
            now.setMinutes(now.getMinutes() - 1); // 允許1分鐘誤差
            if (selectedTime < now) {
                G.showToast('掛號時間不能早於現在時間！', 'error');
                return;
            }

            // 在進入非同步處理前，為掛號按鈕顯示讀取圈。
            // 使用通用輔助函式以兼容事件與非事件觸發的情況。
            let loadingButton = G.getLoadingButtonFromEvent('button[onclick="confirmRegistration()"]');
            if (loadingButton) {
                // 傳入的文字僅用於語意描述，實際 setButtonLoading 只顯示讀取圈
                G.setButtonLoading(loadingButton, '掛號中...');
            }
            
            // 建立掛號物件，除了傳入 ID 與帳號之外，同時儲存病人姓名與醫師姓名。
            // 這可避免日後在監聽掛號狀態時為了取得姓名而再次查詢病人集合。
            const appointment = {
                id: Date.now(),
                patientId: G.selectedPatientForRegistration.id,
                // 新增：直接保存病人姓名，供後續監聽或顯示使用
                patientName: G.selectedPatientForRegistration.name,
                appointmentTime: selectedTime.toISOString(),
                appointmentDoctor: appointmentDoctor,
                isGeneralRegistration: selectedDoctorMeta.isGeneralRegistration,
                // 新增：直接保存醫師姓名，供後續監聽或顯示使用
                doctorName: selectedDoctorMeta.displayName,
                chiefComplaint: chiefComplaint || '無特殊主訴',
                status: 'registered', // registered, waiting, consulting, completed
                createdAt: new Date().toISOString(),
                createdBy: G.currentUserData ? G.currentUserData.username : G.currentUser,
                clinicId: G.currentClinicId || null
            };

            // 若有選擇問診資料，僅保存問診 ID 與摘要。避免將完整問診內容存入掛號資料，
            // 以便在不同裝置上都能從 Firestore 取得問診詳情。保存摘要方便快速展示。
            if (inquiryDataForAppointment) {
                appointment.inquiryId = selectedInquiryId;
                appointment.inquirySummary = inquirySummaryForAppointment || '';
                // 若未輸入主訴或主訴為預設值，使用問診摘要作為主訴
                if (!chiefComplaint || chiefComplaint === '無特殊主訴') {
                    appointment.chiefComplaint = inquirySummaryForAppointment || '無特殊主訴';
                }
            }

            try {
                // 加入本地陣列
                G.appointments.push(appointment);
                // 將掛號資訊存入 Firebase Realtime Database
                const result = await window.firebaseDataManager.addAppointment(appointment);
                // 更新本地儲存作為備份
                localStorage.setItem('appointments', JSON.stringify(G.appointments));
                if (result.success) {
                    if (inquiryDataForAppointment) {
                        try {
                            const syncResult = await G.syncPatientMedicalProfileFromInquiryData(G.selectedPatientForRegistration.id, inquiryDataForAppointment);
                            if (syncResult && syncResult.success) {
                                try {
                                    const refreshedPatient = await G.getPatientByIdWithRefresh(G.selectedPatientForRegistration.id);
                                    if (refreshedPatient) {
                                        G.selectedPatientForRegistration = refreshedPatient;
                                    }
                                } catch (_refreshErr) {}
                            } else if (syncResult && !syncResult.skipped) {
                                console.error('掛號後同步病史資料失敗:', syncResult.error || syncResult);
                            }
                        } catch (syncError) {
                            console.error('掛號後同步病史資料時發生錯誤:', syncError);
                        }
                    }
                    {
                        // Show registration success message based on language
                        const lang = localStorage.getItem('lang') || 'zh';
                        const zhDoctorText = selectedDoctorMeta.isGeneralRegistration
                            ? G.GENERAL_REGISTRATION_LABEL
                            : `${selectedDoctorMeta.displayName}醫師`;
                        const zhMsg = `${G.selectedPatientForRegistration.name} 已掛號給 ${zhDoctorText}！`;
                        const enMsg = selectedDoctorMeta.isGeneralRegistration
                            ? `${G.selectedPatientForRegistration.name} has been registered as general registration`
                            : `${G.selectedPatientForRegistration.name} has been registered to Dr. ${selectedDoctorMeta.displayName}`;
                        const msg = lang === 'en' ? enMsg : zhMsg;
                        G.showToast(msg, 'success');
                    }
                    closeRegistrationModal();
                    clearPatientSearch();
                    loadTodayAppointments();
                } else {
                    G.showToast('掛號失敗，請稍後再試', 'error');
                }
            } catch (error) {
                console.error('掛號失敗:', error);
                G.showToast('掛號失敗，請稍後再試', 'error');
            } finally {
                // 無論成功或失敗，皆還原按鈕狀態
                if (loadingButton) {
                    G.clearButtonLoading(loadingButton);
                }
            }
        }
        
            // 每日自動清空過期掛號列表（同步到 Firebase）
            export async function clearOldAppointments() {
                /**
                 * 從 Firebase Realtime Database 讀取所有掛號記錄，
                 * 將掛號時間早於「今日 00:00:00」的記錄刪除。
                 *
                 * 判斷邏輯：
                 *  - 取得今天的開始時間（本地時間）
                 *  - 對每筆掛號紀錄解析其 appointmentTime
                 *  - 若該時間早於昨天，則將這筆資料從 Realtime Database 刪除
                 *
                 * 此函式會同步更新本地的 appointments 陣列與 localStorage。
                 */
                try {
                    // 計算今天凌晨時間（本地時區）
                    const now = new Date();
                    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                    // 使用查詢僅讀取過期掛號資料，以 appointmentTime 排序並設定結束條件為今天凌晨
                    // 轉換為 ISO 字串，方便與 Firebase 資料庫中的 ISO 格式日期比較
                    const startIso = startOfToday.toISOString();
                    const expiredQuery = window.firebase.query(
                        window.firebase.ref(window.firebase.rtdb, 'appointments'),
                        window.firebase.orderByChild('appointmentTime'),
                        window.firebase.endAt(startIso)
                    );
                    const snapshot = await window.firebase.get(expiredQuery);
                    const data = (snapshot && typeof snapshot.val === 'function'
                        ? snapshot.val()
                        : snapshot && snapshot.val) || {};

                    const idsToRemove = [];
                    for (const id in data) {
                        if (!Object.prototype.hasOwnProperty.call(data, id)) continue;
                        const apt = data[id] || {};
                        const timeValue = apt.appointmentTime;
                        // 如果沒有 appointmentTime，視為過期資料
                        if (!timeValue) {
                            idsToRemove.push(id);
                            continue;
                        }
                        const aptDate = new Date(timeValue);
                        if (isNaN(aptDate.getTime())) {
                            // 無法解析日期，視為過期
                            idsToRemove.push(id);
                            continue;
                        }
                        // 如果掛號時間在今天凌晨之前（昨天或更早），則刪除
                        if (aptDate < startOfToday) {
                            idsToRemove.push(id);
                        }
                    }

                    // 若沒有需要刪除的掛號，直接返回
                    if (idsToRemove.length === 0) {
                        console.log('沒有過期掛號需要清除。');
                        return;
                    }

                    // 刪除每筆過期的掛號
                    for (const id of idsToRemove) {
                        try {
                            await window.firebase.remove(
                                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id)
                            );
                        } catch (removeError) {
                            console.error('刪除過期掛號失敗:', id, removeError);
                        }
                    }

                    // 更新本地 appointments 陣列
                    if (typeof G.appointments !== 'undefined' && Array.isArray(G.appointments)) {
                        G.appointments = G.appointments.filter(apt => !idsToRemove.includes(String(apt.id)));
                        localStorage.setItem('appointments', JSON.stringify(G.appointments));
                    }

                    console.log(`清除 ${idsToRemove.length} 筆過期掛號完成。`);
                } catch (error) {
                    console.error('清除過期掛號時發生錯誤:', error);
                }
            }



// 3. 修改今日掛號列表載入功能，確保能正確顯示病人資訊
export async function loadTodayAppointments() {
    // 已在切換到掛號系統時清除過期掛號，這裡不再重複執行。
    // 如果需要手動清除，請在調用 loadConsultationSystem 前呼叫 clearOldAppointments。
    // await clearOldAppointments();

    // 如果全域 appointments 尚未有資料，則從 Firebase 讀取掛號資料。若已有資料則直接使用，避免重複讀取。
    if (!Array.isArray(G.appointments) || G.appointments.length === 0) {
        try {
            const result = await window.firebaseDataManager.getAppointments();
            if (result.success) {
                G.appointments = result.data.map(apt => {
                    return { ...apt };
                });
                // 更新本地存儲作為備份
                localStorage.setItem('appointments', JSON.stringify(G.appointments));
            } else {
                console.warn('無法從雲端讀取掛號資料，使用本地資料');
            }
        } catch (error) {
            console.error('讀取掛號資料錯誤:', error);
        }
    }

    // 取得掛號列表容器並先顯示大讀取圈。
    try {
        const tbodyLoading = document.getElementById('todayAppointmentsList');
        if (tbodyLoading) {
            tbodyLoading.innerHTML = `
                <tr>
                    <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        <div class="mt-2">載入中...</div>
                    </td>
                </tr>
            `;
        }
    } catch (_err) {
        // 如果渲染讀取圈失敗，不影響後續流程
    }

    // 根據日期選擇器決定要顯示的日期；若未選擇則使用今日
    let targetDate = new Date();
    try {
        const datePicker = document.getElementById('appointmentDatePicker');
        if (datePicker && datePicker.value) {
            const selected = new Date(datePicker.value);
            if (!isNaN(selected.getTime())) {
                targetDate = selected;
            }
        }
    } catch (_e) {
        // 若取得日期失敗則維持今日
    }
    const targetDateStr = targetDate.toDateString();
    let todayAppointments = G.appointments.filter(apt => 
        new Date(apt.appointmentTime).toDateString() === targetDateStr
    );
    if (G.currentClinicId) {
        todayAppointments = todayAppointments.filter(apt => String(apt.clinicId || '') === String(G.currentClinicId));
    }
    
    // 如果當前用戶是醫師，只顯示掛給自己的病人
    if (G.currentUserData && G.currentUserData.position === '醫師') {
        todayAppointments = todayAppointments.filter(apt => 
            G.canDoctorViewAppointment(apt, G.currentUserData.username)
        );
    }
    
    // 按時間排序
    todayAppointments.sort((a, b) => new Date(a.appointmentTime) - new Date(b.appointmentTime));
    
    const tbody = document.getElementById('todayAppointmentsList');
    document.getElementById('todayTotal').textContent = todayAppointments.length;
    
    if (todayAppointments.length === 0) {
        const isToday = targetDate.toDateString() === new Date().toDateString();
        const dateText = isToday ? '今日' : '所選日期';
        const message = G.currentUserData && G.currentUserData.position === '醫師' 
            ? `${dateText}暫無掛給您的病人` 
            : `${dateText}暫無掛號記錄`;
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                    ${message}
                </td>
            </tr>
        `;
        return;
    }
    
    try {
        // 掛號列表只補當前列表涉及的病人，避免切診所時全量讀取 patients 集合。
        const patientLookup = new Map();
        const uniquePatientIds = Array.from(new Set(
            todayAppointments
                .map(appointment => appointment && appointment.patientId)
                .filter(patientId => patientId !== undefined && patientId !== null && String(patientId).trim() !== '')
                .map(patientId => String(patientId))
        ));

        await Promise.all(uniquePatientIds.map(async (patientId) => {
            let patient = null;
            try {
                if (Array.isArray(G.patients)) {
                    patient = G.patients.find(p => p && String(p.id) === patientId) || null;
                }
                if (!patient) {
                    patient = await G.getPatientByIdWithRefresh(patientId);
                }
            } catch (_e) {
                patient = null;
            }
            if (patient) {
                patientLookup.set(patientId, patient);
            }
        }));

        // 對於每一筆掛號資料，直接使用該次掛號的主訴，不再從病歷回填主訴。
        const rows = await Promise.all(todayAppointments.map(async (appointment, index) => {
            const patientId = String(appointment.patientId || '');
            const patient = patientLookup.get(patientId);
            if (patient) {
                return createAppointmentRow(appointment, patient, index);
            }
            // 最終仍無病人資料時，使用掛號物件中的病人姓名作為後備顯示，避免顯示錯誤行。
            // 由於此情況通常發生於其他使用者剛新增病人後立即掛號，本地快取尚未更新。
            // 此處以 appointment.patientName 作為名稱，病歷號碼暫留空。
            const fallbackPatient = {
                id: appointment.patientId,
                name: appointment.patientName || (window.t ? window.t('未知病人') : '未知病人'),
                patientNumber: ''
            };
            return createAppointmentRow(appointment, fallbackPatient, index);
        }));

        tbody.innerHTML = rows.join('');

    } catch (error) {
        console.error('載入掛號列表錯誤:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-8 text-center text-red-500">
                    載入掛號列表失敗，請重新整理頁面
                </td>
            </tr>
        `;
    }
}

// 新增：訂閱 Firebase Realtime Database 的掛號變動，實時更新今日掛號列表
export function subscribeToAppointments(forceToday) {
    // 根據日期選擇器決定要監聽的日期範圍；若未選擇或 forceToday 則監聽今日
    let targetDate = new Date();
    try {
        if (!forceToday) {
            const datePicker = document.getElementById('appointmentDatePicker');
            if (datePicker && datePicker.value) {
                const selected = new Date(datePicker.value);
                if (!isNaN(selected.getTime())) {
                    targetDate = selected;
                }
            }
        }
    } catch (_e) {
        // ignore; fallback to today
    }
    // 計算該日期的開始與結束時間（UTC ISO 格式）
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
    const startIso = startOfDay.toISOString();
    const endIso = endOfDay.toISOString();

    // 構建基本參考路徑
    const appointmentsRef = window.firebase.ref(window.firebase.rtdb, 'appointments');
    // 使用 Realtime Database 查詢以篩選當天的掛號資料，減少監聽範圍
    const appointmentsQuery = window.firebase.query(
        appointmentsRef,
        window.firebase.orderByChild('appointmentTime'),
        window.firebase.startAt(startIso),
        window.firebase.endAt(endIso)
    );
    // 如果先前已經有監聽器，先取消以避免重複觸發
    if (window.appointmentsListener && window.appointmentsQuery) {
        try {
            window.firebase.off(window.appointmentsQuery, 'value', window.appointmentsListener);
        } catch (e) {
            console.error('取消掛號監聽器時發生錯誤:', e);
        }
    }
    // 存儲本次查詢，以便後續取消監聽
    window.appointmentsQuery = appointmentsQuery;
    // 初始化前一次狀態記錄
    if (!window.previousAppointmentStatuses) {
        window.previousAppointmentStatuses = {};
    }
    // 建立新的監聽回調，使用 async 以便在偵測到狀態變更時讀取病人資料
    window.appointmentsListener = async (snapshot) => {
        const data = snapshot.val() || {};
        // 取得新的掛號資料陣列
        const newAppointments = Object.keys(data).map(key => {
            return { id: key, ...data[key] };
        });
        try {
            // 判斷是否有病人狀態變更為候診中需要通知
            const toNotify = [];
            // 判斷是否有病人狀態變更為完成診症需要通知診所助理
            const completedNotify = [];
            for (const apt of newAppointments) {
                const prevStatus = window.previousAppointmentStatuses[apt.id];
                // 當前狀態為候診中且與先前狀態不同，視為新的候診事件
                if (prevStatus !== undefined && prevStatus !== apt.status && apt.status === 'waiting') {
                    toNotify.push(apt);
                }
                // 若狀態由其它狀態變更為 completed，視為完成診症事件
                if (prevStatus !== undefined && prevStatus !== apt.status && apt.status === 'completed') {
                    completedNotify.push(apt);
                }
                // 更新狀態紀錄
                window.previousAppointmentStatuses[apt.id] = apt.status;
            }

            // ---- 推播通知：不論觀看者角色皆觸發，由後端依訂閱事件篩選收件人；失敗僅警告 ----
            if (toNotify.length > 0 && window.TCMPwa && typeof window.TCMPwa.notify === 'function') {
                for (const apt of toNotify) {
                    // general registration（無指定醫師）不推，後端亦會擋
                    if (!apt.appointmentDoctor) continue;
                    let patientName = apt.patientName || '';
                    if (!patientName) {
                        try {
                            const patient = await G.getPatientByIdWithRefresh(apt.patientId);
                            patientName = patient ? patient.name : '';
                        } catch (_e) {
                            patientName = '';
                        }
                    }
                    try {
                        await window.TCMPwa.notify({
                            kind: 'appointment',
                            event: 'appointment_waiting',
                            appointmentId: apt.id,
                            patientName: patientName,
                            appointmentDoctor: apt.appointmentDoctor,
                            statusAt: apt.arrivedAt || ''
                        });
                    } catch (pushErr) {
                        console.warn('候診推播失敗:', pushErr);
                    }
                }
            }
            if (completedNotify.length > 0 && window.TCMPwa && typeof window.TCMPwa.notify === 'function') {
                for (const apt of completedNotify) {
                    let patientName = apt.patientName || '';
                    if (!patientName) {
                        try {
                            const patient = await G.getPatientByIdWithRefresh(apt.patientId);
                            patientName = patient ? patient.name : '';
                        } catch (_e) {
                            patientName = '';
                        }
                    }
                    try {
                        await window.TCMPwa.notify({
                            kind: 'appointment',
                            event: 'appointment_completed',
                            appointmentId: apt.id,
                            patientName: patientName,
                            statusAt: apt.completedAt || ''
                        });
                    } catch (pushErr) {
                        console.warn('診症完成推播失敗:', pushErr);
                    }
                }
            }

            // 如果有需要通知的掛號並且目前使用者是醫師
            if (toNotify.length > 0 && G.currentUserData && G.currentUserData.position === '醫師') {
                for (const apt of toNotify) {
                    // 僅通知該醫師所屬的掛號
                    if (G.canDoctorViewAppointment(apt, G.currentUserData.username)) {
                        // 優先使用掛號物件中的病人姓名；缺失時用單筆查詢替代載入整個病人列表
                        let patientName = '';
                        if (apt.patientName) {
                            patientName = apt.patientName;
                        } else {
                            try {
                                const patient = await G.getPatientByIdWithRefresh(apt.patientId);
                                patientName = patient ? patient.name : '';
                            } catch (_e) {
                                patientName = '';
                            }
                        }
                        if (patientName) {
                            // 顯示提示並播放音效
                            {
                                // Notify that the patient has entered the waiting state, with translation
                                const lang = localStorage.getItem('lang') || 'zh';
                                const zhMsg = `病人 ${patientName} 已進入候診中，請準備診症。`;
                                const enMsg = `Patient ${patientName} has entered the waiting state, please prepare for consultation.`;
                                const msg = lang === 'en' ? enMsg : zhMsg;
                                G.showToast(msg, 'info');
                                G.playNotificationSound();
                            }
                        }
                    }
                }
            }

            // 如果有診症完成通知，且目前使用者為護理師、診所管理或診所助理，則提示並播放音效
            if (completedNotify.length > 0 && G.currentUserData && G.currentUserData.position && ['護理師', '診所管理', '診所助理'].includes(G.currentUserData.position)) {
                for (const apt of completedNotify) {
                    // 優先使用掛號物件中的病人姓名；缺失時用單筆查詢替代載入整個病人列表
                    let patientName = '';
                    if (apt.patientName) {
                        patientName = apt.patientName;
                    } else {
                        try {
                            const patient = await G.getPatientByIdWithRefresh(apt.patientId);
                            patientName = patient ? patient.name : '';
                        } catch (_e) {
                            patientName = '';
                        }
                    }
                    if (patientName) {
                        const lang = localStorage.getItem('lang') || 'zh';
                        const zhMsg = `病人 ${patientName} 已完成診症，可進行後續處理。`;
                        const enMsg = `Patient ${patientName}'s consultation has been completed. Please proceed with follow-up.`;
                        const msg = lang === 'en' ? enMsg : zhMsg;
                        G.showToast(msg, 'info');
                        G.playNotificationSound();
                    }
                }
            }
        } catch (err) {
            console.error('處理候診通知時發生錯誤:', err);
        }
        // 更新全域掛號資料
        G.appointments = newAppointments;
        // 儲存到本地作為備份
        localStorage.setItem('appointments', JSON.stringify(G.appointments));
        // 重新載入今日掛號列表
        loadTodayAppointments();
        // 更新統計資訊
        G.updateStatistics();
    };
    // 預先定義掛號監聽器狀態，用於動態掛載/取消監聽
    if (typeof window.appointmentsListenerAttached === 'undefined') {
        window.appointmentsListenerAttached = false;
    }
    // 設置監聽器
    window.firebase.onValue(appointmentsQuery, window.appointmentsListener);
    // 標記掛號監聽器已掛載，用於後續動態取消/重新掛載
    window.appointmentsListenerAttached = true;
    // 在頁面卸載時自動取消監聽，以避免離開頁面後仍持續監聽造成資源浪費
    window.addEventListener('beforeunload', () => {
        if (window.appointmentsListener && window.appointmentsQuery) {
            try {
                window.firebase.off(window.appointmentsQuery, 'value', window.appointmentsListener);
            } catch (e) {
                console.error('取消掛號監聽器時發生錯誤:', e);
            }
        }
    });

    /**
     * 確保掛號監聽器在需要時掛載。
     * 若監聽器尚未掛載，且已存在查詢及回調，則重新掛載以獲取即時掛號更新。
     * 這個函式可在進入掛號相關頁面時調用，以減少不必要的持續監聽。
     */
    function ensureAppointmentsListener() {
        try {
            if (window.appointmentsListenerAttached) return;
            if (window.appointmentsQuery && window.appointmentsListener) {
                window.firebase.onValue(window.appointmentsQuery, window.appointmentsListener);
                window.appointmentsListenerAttached = true;
            }
        } catch (err) {
            console.error('重新掛載掛號監聽器失敗:', err);
        }
    }

    // 將函式暴露到全域，以便在其他地方（例如載入掛號頁面時）調用
    try {
        window.ensureAppointmentsListener = ensureAppointmentsListener;
    } catch (_e) {
        // 若無法設定全域函式則略過
    }
}



// 新增：從 Firebase 載入診症記錄進行編輯
export async function loadConsultationForEdit(consultationId) {
    // 清除上一個診症操作遺留的套票變更記錄。
    G.pendingPackageChanges = [];
    try {
        // 編輯病歷時一律強制單筆刷新，避免吃到其他裝置留下的舊 consultation 快取。
        let consultation = null;
        try {
            const consultationResult = await window.firebaseDataManager.getConsultationById(String(consultationId), true);
            if (consultationResult && consultationResult.success && consultationResult.data) {
                consultation = consultationResult.data;
            }
        } catch (error) {
            console.error('讀取診療記錄錯誤:', error);
        }
        if (consultation) {
            // 記錄已保存病歷的時間戳，供恢復草稿時判斷本機草稿是否已過期
            try {
                const savedDate = parseConsultationDate(consultation.updatedAt)
                    || parseConsultationDate(consultation.date)
                    || getConsultationEffectiveDate(consultation);
                G.consultationSymptomsDraftState.loadedRecordUpdatedAt = savedDate ? savedDate.getTime() : 0;
            } catch (_tsErr) {
                G.consultationSymptomsDraftState.loadedRecordUpdatedAt = 0;
            }
            // 載入診症記錄內容
            document.getElementById('formSymptoms').value = consultation.symptoms || '';
            document.getElementById('formTongue').value = consultation.tongue || '';
            document.getElementById('formPulse').value = consultation.pulse || '';
            // formCurrentHistory 用於顯示過往診症摘要，不應在編輯模式中被覆蓋。舊資料的現病史已與主訴合併，故不載入至此欄位。
            document.getElementById('formDiagnosis').value = consultation.diagnosis || '';
            document.getElementById('formSyndrome').value = consultation.syndrome || '';
            {
              const acnEl = document.getElementById('formAcupunctureNotes');
              if (acnEl) {
                // 使用 innerText 載入針灸備註內容，以支援 contenteditable
                // 載入針灸備註時直接使用 innerHTML，以保留方塊標記；
                // 必須經過白名單淨化，歷史病歷可能含惡意內容（Stored XSS 防護）
                acnEl.innerHTML = window.sanitizeAcupunctureNotesHtml(consultation.acupunctureNotes || '');
                // 載入完畢後初始化既有穴位方塊的事件處理
                if (typeof G.initializeAcupointNotesSpans === 'function') {
                  G.initializeAcupointNotesSpans();
                }
                // 載入完畢後初始化既有穴位方塊的事件處理
                if (typeof G.initializeAcupointNotesSpans === 'function') {
                  G.initializeAcupointNotesSpans();
                }
              }
            }
            document.getElementById('formUsage').value = consultation.usage || '';
            document.getElementById('formTreatmentCourse').value = consultation.treatmentCourse || '';
            document.getElementById('formInstructions').value = consultation.instructions || '';
            document.getElementById('formFollowUpDate').value = consultation.followUpDate || '';

            // 載入已保存的服藥天數與每日服藥次數，以避免預設值覆蓋原始資料
            try {
                const daysInputEl = document.getElementById('medicationDays');
                if (daysInputEl) {
                    if (consultation.medicationDays !== undefined && consultation.medicationDays !== null) {
                        daysInputEl.value = consultation.medicationDays;
                    } else {
                        // 若未設定，使用空字串表示未定義
                        daysInputEl.value = '';
                    }
                }
                const freqInputEl = document.getElementById('medicationFrequency');
                if (freqInputEl) {
                    if (consultation.medicationFrequency !== undefined && consultation.medicationFrequency !== null) {
                        freqInputEl.value = consultation.medicationFrequency;
                    } else {
                        freqInputEl.value = '';
                    }
                }
            } catch (_e) {
                console.warn('載入診症記錄時設定服藥天數與每日次數失敗:', _e);
            }
            
            // 處理到診時間 - 支援多種日期格式
            if (consultation.visitTime) {
                const visitTime = parseConsultationDate(consultation.visitTime);
                if (visitTime) {
                    const year = visitTime.getFullYear();
                    const month = String(visitTime.getMonth() + 1).padStart(2, '0');
                    const day = String(visitTime.getDate()).padStart(2, '0');
                    const hours = String(visitTime.getHours()).padStart(2, '0');
                    const minutes = String(visitTime.getMinutes()).padStart(2, '0');
                    document.getElementById('formVisitTime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
                }
            }
            
            // 載入休息期間設定
            if (consultation.restStartDate && consultation.restEndDate) {
                document.getElementById('formRestStartDate').value = consultation.restStartDate;
                document.getElementById('formRestEndDate').value = consultation.restEndDate;
                updateRestPeriod();
            } else {
                // 使用預設值
                const startDate = new Date();
                const endDate = new Date();
                // 將結束日期設為與開始日期相同，預設休息 1 天
                endDate.setDate(startDate.getDate());
                
                const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
                const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
                
                document.getElementById('formRestStartDate').value = startDateStr;
                document.getElementById('formRestEndDate').value = endDateStr;
                updateRestPeriod();
            }
            
            // 載入處方內容
            try {
                if (consultation.multiPrescriptions) {
                    const mp = JSON.parse(consultation.multiPrescriptions);
                    if (Array.isArray(mp) && mp.length > 0) {
                    G.prescriptions = mp.map((p, idx) => ({
                        name: (p && p.name) ? p.name : (idx === 0 ? '處方' : `處方${idx + 1}`),
                        items: Array.isArray(p && p.items) ? p.items : [],
                        days: parseInt(p && p.days) || 5,
                        freq: parseInt(p && p.freq) || (parseInt(consultation.medicationFrequency) || 2),
                        mode: (p && (p.mode === 'slice' || p.mode === 'granule')) ? p.mode : 'granule'
                    }));
                        G.activePrescriptionIndex = 0;
                        G.selectedPrescriptionItems = G.prescriptions[0].items;
                        try {
                            const initMode = (G.prescriptions[0] && G.prescriptions[0].mode === 'slice') ? 'slice' : 'granule';
                            G.changeInventoryType(initMode);
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
                    } else {
                        throw new Error('multiPrescriptions not array');
                    }
                } else {
                    // fallback: 單處方資料
                    G.prescriptions = [{ name: '處方', items: [], days: (consultation.medicationDays || 5), freq: (parseInt(consultation.medicationFrequency) || 2), mode: (G.currentInventoryMode === 'slice' ? 'slice' : 'granule') }];
                    G.activePrescriptionIndex = 0;
                    G.selectedPrescriptionItems = G.prescriptions[0].items;
                    try {
                        const initModeX = (G.prescriptions[0] && G.prescriptions[0].mode === 'slice') ? 'slice' : 'granule';
                        G.changeInventoryType(initModeX);
                    } catch (_e) {}
                    let loadedStructured = false;
                    if (consultation.prescriptionStructured) {
                        try {
                            const parsedItems = JSON.parse(consultation.prescriptionStructured);
                            if (Array.isArray(parsedItems) && parsedItems.length > 0) {
                                G.prescriptions[0].items = parsedItems;
                                G.selectedPrescriptionItems = G.prescriptions[0].items;
                                loadedStructured = true;
                            }
                        } catch (_e) {
                            loadedStructured = false;
                        }
                    }
                    if (loadedStructured) {
                        updatePrescriptionDisplay();
                    } else if (consultation.prescription) {
                        document.getElementById('formPrescription').value = consultation.prescription;
                        parsePrescriptionToItems(consultation.prescription);
                        // 將解析結果設回第一處方
                        G.prescriptions[0].items = G.selectedPrescriptionItems;
                        try {
                            const initMode2 = (G.prescriptions[0] && G.prescriptions[0].mode === 'slice') ? 'slice' : 'granule';
                            G.changeInventoryType(initMode2);
                        } catch (_e) {}
                        updatePrescriptionDisplay();
                        const hasItems = Array.isArray(G.selectedPrescriptionItems) && G.selectedPrescriptionItems.length > 0;
                        if (!hasItems) {
                            document.getElementById('formPrescription').value = consultation.prescription;
                            const containerEl = document.getElementById('prescriptionsContainer');
                            if (containerEl) {
                                containerEl.innerHTML = `<div class="border border-gray-300 rounded-lg p-3 bg-gray-50"><div class="text-sm text-gray-900 whitespace-pre-line">${window.escapeHtml(consultation.prescription)}</div></div>`;
                            }
                        }
                    } else {
                        updatePrescriptionDisplay();
                    }
                }
            } catch (_err) {
                // 無法解析時，維持單處方空白狀態
                G.prescriptions = [{ name: '處方', items: [], days: 5, freq: 2, mode: (G.currentInventoryMode === 'slice' ? 'slice' : 'granule') }];
                G.activePrescriptionIndex = 0;
                G.selectedPrescriptionItems = G.prescriptions[0].items;
                try {
                    const initMode3 = (G.prescriptions[0] && G.prescriptions[0].mode === 'slice') ? 'slice' : 'granule';
                    G.changeInventoryType(initMode3);
                } catch (_e) {}
                updatePrescriptionDisplay();
            }
            
            // 載入收費項目
            G.selectedBillingItems = [];
            if (consultation.billingItemsStructured) {
                let loadedFromStructured = false;
                try {
                    const parsedStructured = JSON.parse(consultation.billingItemsStructured);
                    if (Array.isArray(parsedStructured) && parsedStructured.length > 0) {
                        const mapped = parsedStructured.map(raw => {
                            const idStr = raw && raw.id !== undefined && raw.id !== null ? String(raw.id) : '';
                            const matched = Array.isArray(G.billingItems)
                                ? G.billingItems.find(it => it && String(it.id) === idStr)
                                : null;
                            const category = (raw && raw.category) ? String(raw.category) : (matched && matched.category ? matched.category : 'other');
                            return {
                                id: idStr || (matched && matched.id ? String(matched.id) : ''),
                                name: matched && matched.name ? matched.name : (raw && raw.name ? String(raw.name) : ''),
                                category: matched && matched.category ? matched.category : category,
                                price: matched ? (Number(matched.price) || 0) : (Number(raw && raw.price) || 0),
                                unit: matched && matched.unit ? matched.unit : (raw && raw.unit ? String(raw.unit) : ''),
                                description: matched && matched.description ? matched.description : (raw && raw.description ? String(raw.description) : ''),
                                packageUses: matched ? (Number(matched.packageUses) || 0) : (Number(raw && raw.packageUses) || 0),
                                validityDays: matched ? (Number(matched.validityDays) || 0) : (Number(raw && raw.validityDays) || 0),
                                quantity: Math.max(1, parseInt(raw && raw.quantity, 10) || 1),
                                includedInDiscount: raw && raw.includedInDiscount === false ? false : (category !== 'discount'),
                                patientId: raw && raw.patientId ? String(raw.patientId) : '',
                                packageRecordId: raw && raw.packageRecordId ? String(raw.packageRecordId) : '',
                                // 保留完成病歷時寫入的餘下次數快照；編輯保存時若套票使用有異動會重新計算
                                remainingUsesAfterUse: (raw && raw.remainingUsesAfterUse !== undefined && raw.remainingUsesAfterUse !== null && Number.isFinite(Number(raw.remainingUsesAfterUse)))
                                    ? Number(raw.remainingUsesAfterUse)
                                    : null,
                                isHistorical: !!(raw && raw.isHistorical)
                            };
                        }).filter(item => item && item.name);
                        G.selectedBillingItems = mapped;
                        loadedFromStructured = G.selectedBillingItems.length > 0;
                    }
                } catch (_e) {
                    loadedFromStructured = false;
                }
                if (!loadedFromStructured && consultation.billingItems) {
                    document.getElementById('formBillingItems').value = consultation.billingItems;
                    parseBillingItemsFromText(consultation.billingItems);
                }
            } else if (consultation.billingItems) {
                document.getElementById('formBillingItems').value = consultation.billingItems;
                // 解析舊病歷中的收費項目
                parseBillingItemsFromText(consultation.billingItems);
            }
            if (consultation.billingItems || consultation.billingItemsStructured) {
                // 嘗試為舊病歷載入的套票使用項目補全 meta（patientId 和 packageRecordId），
                // 優先使用診症記錄中的 patientId，若不存在再嘗試使用當前掛號（currentConsultingAppointmentId）推斷。
                try {
                    // 優先使用 consultation.patientId，如果資料庫中有存儲病人 ID
                    let pid = consultation && consultation.patientId ? consultation.patientId : null;
                    // 如果 consultation.patientId 不存在，退而使用當前掛號的病人 ID
                    if (!pid && typeof G.currentConsultingAppointmentId !== 'undefined' && Array.isArray(G.appointments)) {
                        // 使用字串比較 ID，避免數字與字串不一致導致匹配失敗
                        const appt = G.appointments.find(ap => ap && String(ap.id) === String(G.currentConsultingAppointmentId));
                        if (appt) pid = appt.patientId;
                    }
                    if (pid) {
                        await restorePackageUseMeta(pid);
                    }
                } catch (e) {
                    console.error('載入舊病歷時恢復套票 meta 失敗:', e);
                }
                // 更新顯示
                updateBillingDisplay();
                try { syncMedicationDaysWithMedicineFee(); } catch (_e) {}
            }
            
            // 安全獲取診症儲存按鈕文本元素，避免為 null 時出錯
            const saveButtonTextEl = document.getElementById('consultationSaveButtonText');
            if (saveButtonTextEl) {
                saveButtonTextEl.textContent = '保存病歷';
            } else {
                // 如果找不到元素，不抛出錯誤，而是紀錄警告，這樣使用者可繼續操作
                console.warn('consultationSaveButtonText element not found when loading consultation for edit. Skipping text update.');
            }
            const reasonEl = document.getElementById('formAuditReason');
            if (reasonEl) {
                reasonEl.value = '';
            }
            const reasonContainer = document.getElementById('auditReasonContainer');
            if (reasonContainer) {
                reasonContainer.classList.remove('hidden');
            }
        } else {
            G.showToast('找不到診症記錄，將使用空白表單', 'warning');
            clearConsultationForm();
        }
    } catch (error) {
        console.error('載入診症記錄錯誤:', error);
        G.showToast('載入診症記錄失敗，將使用空白表單', 'warning');
        clearConsultationForm();
    }
}

// 新增：解析診症日期的通用函數
export function parseConsultationDate(dateInput) {
    if (!dateInput) return null;
    
    try {
        if (dateInput && typeof dateInput.toDate === 'function') {
            const d = dateInput.toDate();
            return isNaN(d.getTime()) ? null : d;
        }
        // 如果是 Firebase Timestamp 格式
        if (dateInput.seconds) {
            return new Date(dateInput.seconds * 1000);
        }
        
        // 如果是字符串格式
        if (typeof dateInput === 'string') {
            const s = dateInput.trim();
            const m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
            if (m) {
                const y = parseInt(m[1], 10);
                const mo = parseInt(m[2], 10) - 1;
                const d = parseInt(m[3], 10);
                const hh = m[4] ? parseInt(m[4], 10) : 0;
                const mm = m[5] ? parseInt(m[5], 10) : 0;
                const ss = m[6] ? parseInt(m[6], 10) : 0;
                const dt = new Date(y, mo, d, hh, mm, ss);
                if (!isNaN(dt.getTime())) return dt;
            }
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        
        // 如果是 Date 對象
        if (dateInput instanceof Date) {
            return dateInput;
        }
        
        // 如果是數字格式（timestamp）
        if (typeof dateInput === 'number') {
            return new Date(dateInput);
        }
        
        return null;
    } catch (error) {
        console.error('日期解析錯誤:', error, dateInput);
        return null;
    }
}

export function getConsultationEffectiveDate(record, fallbackDate = null) {
    const raw = record && typeof record === 'object'
        ? (record.date || record.createdAt || record.updatedAt || record.sortDate || fallbackDate || null)
        : (fallbackDate || null);
    const parsed = parseConsultationDate(raw);
    if (parsed && !isNaN(parsed.getTime())) {
        return parsed;
    }
    return null;
}

export function getConsultationEffectiveTimestamp(record, fallbackDate = null) {
    const parsed = getConsultationEffectiveDate(record, fallbackDate);
    return parsed && !isNaN(parsed.getTime()) ? parsed.getTime() : 0;
}
// 修復格式化診症日期顯示

export function formatConsultationDateTime(dateInput) {
    const date = parseConsultationDate(dateInput);
    if (!date || isNaN(date.getTime())) {
        // Return a language‑aware fallback when the date cannot be parsed.
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        const dict = (window.translations && window.translations[lang]) ? window.translations[lang] : {};
        // Use a fallback message if a translation is available; otherwise default to the Chinese phrase.
        return dict['時間未知'] || '時間未知';
    }
    // Format the date/time according to the current language.  English uses
    // en-US locale while Chinese uses zh-TW.  We intentionally keep the
    // format consistent with two‑digit month/day and hour/minute fields.
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
    const locale = lang === 'en' ? 'en-US' : 'zh-TW';
    return date.toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}


        
// 1. 修改 createAppointmentRow 函數，確保診症記錄按鈕正確傳遞 patientId
export function createAppointmentRow(appointment, patient, index) {
    // 獲取掛號醫師資訊，並根據語言翻譯醫師稱謂
    const appointmentDoctor = G.users.find(u => u.username === appointment.appointmentDoctor);
    let doctorName;
    if (G.isGeneralRegistrationAppointment(appointment)) {
        doctorName = G.GENERAL_REGISTRATION_LABEL;
    } else if (appointmentDoctor) {
        // 翻譯「醫師」後綴；非中文時在前面加空格
        const suffix = window.t ? window.t('醫師') : '醫師';
        const needsSpace = suffix && suffix !== '醫師';
        doctorName = needsSpace ? `${appointmentDoctor.name} ${suffix}` : `${appointmentDoctor.name}${suffix}`;
    } else {
        // 沒有指定醫師時，仍顯示相應翻譯或原文
        doctorName = window.t ? window.t('未指定醫師') : '未指定醫師';
    }
    
    // --------- 顯示病人姓名時加上性別 ---------
    // 取得病人性別並根據語言顯示適當文字
    let genderRaw = patient && patient.gender ? patient.gender : '';
    let genderDisplay = genderRaw;
    // 使用 window.t 進行翻譯；若未提供翻譯函式則回退為原始值
    if (genderDisplay) {
        try {
            if (typeof window !== 'undefined' && typeof window.t === 'function') {
                const translated = window.t(genderDisplay);
                // window.t 可能返回與輸入不同的值
                if (translated) {
                    genderDisplay = translated;
                }
            }
        } catch (e) {
            // ignore translation error
        }
    }
    // 若當前語言為英文，將不同表示方式統一為 Male 或 Female
    try {
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        const isEnglish = lang && lang.toLowerCase().startsWith('en');
        if (isEnglish && genderDisplay) {
            const gLower = genderDisplay.toLowerCase();
            // In English, display abbreviated gender with single letter rather than full word.
            // Treat various representations of male and female uniformly.
            if (gLower === '男' || gLower === 'male' || gLower === 'm') {
                genderDisplay = 'M';
            } else if (gLower === '女' || gLower === 'female' || gLower === 'f') {
                genderDisplay = 'F';
            }
        }
    } catch (e) {
        // ignore language detection errors
    }
    // 計算年齡數字（若有生日），僅顯示整數歲數
    let ageNum = '';
    try {
        if (patient && patient.birthDate) {
            const birth = new Date(patient.birthDate);
            const today = new Date();
            let years = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                years--;
            }
            ageNum = String(Math.max(0, years));
        }
    } catch (_e) {
        ageNum = '';
    }
    // 根據是否存在性別資訊構造姓名字串，形如「姓名 (男26)」
    const nameWithGender = genderDisplay
        ? `${patient.name} (${genderDisplay}${ageNum})`
        : patient.name;
    // 為避免 XSS，使用 escapeHtml 轉義姓名及括號內容（若可用）
    const safeNameWithGender = (typeof window !== 'undefined' && window.escapeHtml) ? window.escapeHtml(nameWithGender) : nameWithGender;

    const statusInfo = getStatusInfo(appointment.status);
    const operationButtons = getOperationButtons(appointment, patient); // 傳遞 patient 參數

    return `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 text-sm text-gray-900 font-medium">${index + 1}</td>
            <td class="px-4 py-3 text-sm font-medium text-gray-900">
                ${safeNameWithGender}
                <div class="text-xs text-gray-500">${window.escapeHtml(patient.patientNumber)}</div>
            </td>
            <td class="px-4 py-3 text-sm text-gray-900">
                <div class="font-medium text-blue-600">${window.escapeHtml(doctorName)}</div>
            </td>
            <td class="px-4 py-3 text-sm text-gray-900">
                ${new Date(appointment.appointmentTime).toLocaleString('zh-TW', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })}
            </td>
            <td class="px-4 py-3 text-sm text-gray-900">
                ${(() => {
                    // 掛號列表的主訴文字僅顯示前八個字，超過部分以「⋯」取代，避免過長內容影響版面。
                    const fullComplaint = appointment.chiefComplaint || '';
                    // 如果沒有主訴或主訴為空字串，顯示「無」
                    if (!fullComplaint) {
                        return '<div class="max-w-xs truncate" title="無">無</div>';
                    }
                    let truncated = '';
                    if (fullComplaint.length > 8) {
                        // 若超過限制，截取前八個字並加上省略符號
                        truncated = fullComplaint.substring(0, 8) + '⋯';
                    } else {
                        truncated = fullComplaint;
                    }
                    // 使用 title 屬性顯示完整內容（所有動態值皆先跳脫，避免 XSS）
                    return '<div class="max-w-xs truncate" title="' + window.escapeHtml(fullComplaint) + '">' + window.escapeHtml(truncated) + '</div>';
                })()}
            </td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.class}">
                    ${statusInfo.text}
                </span>
            </td>
            <!--
              將操作按鈕欄保持內容寬度，不再撐滿整列。
              為了讓表頭「操作」與診症記錄按鈕左對齊，移除 w-full 以及 justify-end，
              使按鈕自然靠左排列。
            -->
            <td class="px-4 py-3 text-sm whitespace-nowrap">
                <!--
                  將操作按鈕容器改為單行顯示並禁止內容換行。
                  使用 flex 搭配 items-center 使按鈕垂直置中，space-x-1 控制按鈕之間的間距。
                  這可以避免在按鈕進入讀取狀態或因寬度變化時將下一個按鈕推到下一行，保持排版穩定。
                -->
                <div class="flex items-center space-x-1">
                    ${operationButtons}
                </div>
            </td>
        </tr>
    `;
}
        
        // 獲取狀態資訊
        export function getStatusInfo(status) {
            const statusMap = {
                'registered': { text: '已掛號', class: 'bg-blue-100 text-blue-800' },
                'waiting': { text: '候診中', class: 'bg-yellow-100 text-yellow-800' },
                'consulting': { text: '診症中', class: 'bg-green-100 text-green-800' },
                'completed': { text: '已完成', class: 'bg-gray-100 text-gray-800' },
                'cancelled': { text: '已取消', class: 'bg-gray-100 text-gray-500 line-through' }
            };
            return statusMap[status] || { text: '未知', class: 'bg-gray-100 text-gray-800' };
        }
        
// 2. 修改 getOperationButtons 函數，確保使用正確的 patientId
export function getOperationButtons(appointment, patient = null) {
    const buttons = [];
    // 掛號 ID 可能為 RTDB push key（以 '-' 開頭，如 -P2xxx），inline 事件
    // 必須以引號字串傳參，否則會被解析成「減去變數」而報 ReferenceError。
    const qid = String(appointment.id == null ? '' : appointment.id).replace(/'/g, "\\'");
    const medicalRecordEditLabel = G.getMedicalRecordEditButtonLabel(null, appointment);
    
    // 檢查目前用戶是否為醫師
    const isDoctorUser = G.currentUserData && G.currentUserData.position === '醫師';
    // 檢查同一醫師是否有病人在今日診症中
    const isDoctorConsulting = isDoctorUser && G.appointments.some(apt =>
        apt.status === 'consulting' &&
        G.getAppointmentResponsibleDoctorUsername(apt) === G.currentUserData.username &&
        new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
    );
    
    const isCurrentConsulting = appointment.status === 'consulting';
    const isGeneralRegistration = G.isGeneralRegistrationAppointment(appointment);

    // 檢查當前用戶是否為管理員
    const isAdminUser = G.currentUserData && G.currentUserData.position === '診所管理';
    // 檢查當前用戶是否為管理員或護理師（可以進行管理操作）
    const canManage = G.currentUserData &&
        (isAdminUser || G.currentUserData.position === '護理師');
    
    // 檢查當前用戶是否可以開始或繼續該掛號的診症
    const canStartConsultationForAppointment = G.currentUserData &&
        (
            (isGeneralRegistration && canManage) ||
            (G.currentUserData.position === '醫師' &&
                !isGeneralRegistration &&
                appointment.appointmentDoctor === G.currentUserData.username)
        );
    const canContinueConsultationForAppointment = G.currentUserData &&
        (
            (isGeneralRegistration && canManage) ||
            (G.currentUserData.position === '醫師' &&
                !isGeneralRegistration &&
                G.getAppointmentResponsibleDoctorUsername(appointment) === G.currentUserData.username)
        );
    // 管理員或該掛號醫師可修改病歷
    const canEditMedicalRecord = G.canCurrentUserEditMedicalRecordEntry(null, appointment);
    
    // 檢查當前用戶是否可以確認到達（管理員、護理師或該掛號的醫師）
    const canConfirmArrival = canManage || canStartConsultationForAppointment;
    
    // 使用正確的 patientId（優先使用 Firebase ID）
    const patientId = patient ? patient.id : appointment.patientId;
    
    // 所有狀態都可以查看診症記錄
    buttons.push(`<button onclick="viewPatientMedicalHistory('${patientId}')" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">診症記錄</button>`);
    
    // 僅當醫師正在為其他病人診症時禁用其對其他掛號的操作
    const isDisabled = isDoctorConsulting && !isCurrentConsulting;
    let disabledTooltip = '';
    if (isDisabled) {
        // 提示醫師目前正在診症中
        disabledTooltip = `title="您正在診症中，操作暫時禁用"`;
    }
    
    switch (appointment.status) {
        case 'registered':
            if (isDisabled) {
                if (canConfirmArrival) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs whitespace-nowrap cursor-not-allowed" ${disabledTooltip}>確認到達</span>`);
                }
                if (canManage) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs whitespace-nowrap cursor-not-allowed" ${disabledTooltip}>移除掛號</span>`);
                }
            } else {
                if (canConfirmArrival) {
                    buttons.push(`<button onclick="confirmPatientArrival('${qid}')" class="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">確認到達</button>`);
                }
                if (canManage) {
                    buttons.push(`<button onclick="removeAppointment('${qid}')" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">移除掛號</button>`);
                }
            }
            break;
            
        case 'waiting':
            if (isDisabled) {
                if (canStartConsultationForAppointment) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs whitespace-nowrap cursor-not-allowed" ${disabledTooltip}>開始診症</span>`);
                }
                // 如果為管理員或護理師，則禁用取消候診按鈕
                if (canManage) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs whitespace-nowrap cursor-not-allowed" ${disabledTooltip}>取消候診</span>`);
                }
            } else {
                if (canStartConsultationForAppointment) {
                    buttons.push(`<button onclick="startConsultation('${qid}')" class="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">開始診症</button>`);
                }
                // 管理員或護理師可以取消候診，將狀態回復為已掛號
                if (canManage) {
                    buttons.push(`<button onclick="cancelWaiting('${qid}')" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">取消候診</button>`);
                }
            }
            break;
            
        case 'consulting':
            if (canContinueConsultationForAppointment) {
                buttons.push(`<button onclick="continueConsultation('${qid}')" class="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">繼續診症</button>`);
            }
            break;
            
        case 'completed':
            // 列印收據功能不受診症狀態限制
            buttons.push(`<button onclick="printReceiptFromAppointment('${qid}')" class="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">列印收據</button>`);
            if (!isGeneralRegistration) {
                // 新增方藥醫囑列印功能，位於列印收據旁
                buttons.push(`<button onclick="printPrescriptionInstructionsFromAppointment('${qid}')" class="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">藥單醫囑</button>`);
                buttons.push(`<button onclick="printAttendanceCertificateFromAppointment('${qid}')" class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">到診證明</button>`);
                buttons.push(`<button onclick="printSickLeaveFromAppointment('${qid}')" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">病假證明</button>`);
            }
            const editWindowStatus = G.getMedicalRecordEditWindowStatus(null, appointment);
            
            if (isDisabled) {
                if (canEditMedicalRecord) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs whitespace-nowrap cursor-not-allowed" ${disabledTooltip}>${medicalRecordEditLabel}</span>`);
                }
                if (canManage) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs whitespace-nowrap cursor-not-allowed" ${disabledTooltip}>撤回診症</span>`);
                }
            } else {
                if (canEditMedicalRecord) {
                    if (editWindowStatus.allowed) {
                        buttons.push(`<button onclick="editMedicalRecord('${qid}')" class="bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">${medicalRecordEditLabel}</button>`);
                    } else {
                        buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs whitespace-nowrap cursor-not-allowed" title="${editWindowStatus.reason}">${medicalRecordEditLabel}</span>`);
                    }
                }
                if (canManage) {
                    buttons.push(`<button onclick="withdrawConsultation('${qid}')" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">撤回診症</button>`);
                }
            }
            break;
            
        case 'cancelled':
            // 病人線上取消之軟取消記錄：管理員／護理師可永久移除
            if (!isDisabled && canManage) {
                buttons.push(`<button onclick="removeAppointment('${qid}')" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap transition duration-200">移除掛號</button>`);
            }
            break;

        default:
            buttons.push('<span class="text-gray-400 text-xs">狀態異常</span>');
            break;
    }
    
    return buttons.join('');
}

        
// 3. 修改確認病人到達函數，支援 Firebase
export async function confirmPatientArrival(appointmentId) {
    // 取得最新的掛號資料，避免長時間待機後本地資料過期
    const appointment = await G.getLatestAppointmentById(appointmentId);
    if (!appointment) {
        G.showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 取得觸發按鈕：優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        loadingButton = document.querySelector('button[onclick="confirmPatientArrival(' + appointmentId + ')"]');
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`確認到達狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}`);
        // 只有已掛號狀態才能確認到達
        if (appointment.status !== 'registered') {
            const statusNames = {
                'waiting': '候診中',
                'consulting': '診症中',
                'completed': '已完成'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            {
                // Build a status name mapping for English
                const lang = localStorage.getItem('lang') || 'zh';
                const statusNamesEnMap = {
                    '候診中': 'waiting',
                    '診症中': 'consulting',
                    '已完成': 'completed'
                };
                const currentStatusNameEn = statusNamesEnMap[currentStatusName] || currentStatusName;
                const zhMsg = `無法確認到達！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只能對「已掛號」的病人確認到達。`;
                const enMsg = `Unable to confirm arrival! Patient ${patient.name} is currently "${currentStatusNameEn}". You can only confirm arrival for patients who are "registered".`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'warning');
            }
            return;
        }
        // 更新狀態為候診中
        appointment.status = 'waiting';
        appointment.arrivedAt = new Date().toISOString();
        appointment.confirmedBy = G.currentUserData ? G.currentUserData.username : G.currentUser;
        // 保存狀態變更
        localStorage.setItem('appointments', JSON.stringify(G.appointments));
        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
        {
            // Announce arrival confirmation in appropriate language
            const lang = localStorage.getItem('lang') || 'zh';
            const msg = lang === 'en'
                ? `${patient.name} has been confirmed and is now waiting!`
                : `${patient.name} 已確認到達，進入候診狀態！`;
            G.showToast(msg, 'success');
        }
        loadTodayAppointments();
    } catch (error) {
        console.error('確認到達錯誤:', error);
        G.showToast('處理確認到達時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

        
 // 5. 修改移除掛號函數，支援 Firebase
export async function removeAppointment(appointmentId) {
    // 取得最新的掛號資料，避免長時間待機後本地資料過期
    const appointment = await G.getLatestAppointmentById(appointmentId);
    if (!appointment) {
        G.showToast('找不到掛號記錄！', 'error');
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
        loadingButton = document.querySelector('button[onclick="removeAppointment(' + appointmentId + ')"]');
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`移除掛號狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}`);
        // 檢查是否可以移除
        if (appointment.status === 'waiting') {
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `無法移除掛號！病人 ${patient.name} 已確認到達候診中，請聯繫醫師處理。`;
                const enMsg = `Cannot remove registration! Patient ${patient.name} has already arrived and is waiting. Please contact the doctor to proceed.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'warning');
            }
            return;
        }
        if (appointment.status === 'consulting') {
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `無法移除掛號！病人 ${patient.name} 目前正在診症中，請先結束診症後再移除。`;
                const enMsg = `Cannot remove registration! Patient ${patient.name} is currently being consulted. Please finish the consultation before removing.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'warning');
            }
            return;
        }
        if (appointment.status === 'completed') {
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `無法移除掛號！病人 ${patient.name} 已完成診症，已完成的記錄無法移除。`;
                const enMsg = `Cannot remove registration! Patient ${patient.name} has completed consultation, completed records cannot be removed.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'warning');
            }
            return;
        }
        // 確認移除
        // 移除掛號確認訊息支援中英文
        const statusNamesZh = {
            'registered': '已掛號',
            'waiting': '候診中',
            'consulting': '診症中',
            'completed': '已完成',
            'cancelled': '已取消'
        };
        const statusNamesEn = {
            'registered': 'Registered',
            'waiting': 'Waiting',
            'consulting': 'Consulting',
            'completed': 'Completed',
            'cancelled': 'Cancelled'
        };
        const lang2 = localStorage.getItem('lang') || 'zh';
        const statusTextZh = statusNamesZh[appointment.status] || appointment.status;
        const statusTextEn = statusNamesEn[appointment.status] || appointment.status;
        const timeStr = new Date(appointment.appointmentTime).toLocaleString(lang2 === 'en' ? 'en-US' : 'zh-TW');
        const zhMsg = `確定要移除 ${patient.name} 的掛號嗎？\n\n狀態：${statusTextZh}\n掛號時間：${timeStr}\n\n注意：此操作無法復原！`;
        const enMsg = `Are you sure you want to remove the registration for ${patient.name}?\n\nStatus: ${statusTextEn}\nRegistration time: ${timeStr}\n\nNote: this action cannot be undone!`;
        const confirmMsg = lang2 === 'en' ? enMsg : zhMsg;
        const confirmedRemove = await showConfirmation(confirmMsg, 'warning');
        if (confirmedRemove) {
            // 從掛號列表中移除
            G.appointments = G.appointments.filter(apt => apt.id !== appointmentId);
            localStorage.setItem('appointments', JSON.stringify(G.appointments));
            // 從遠端刪除掛號
            await window.firebaseDataManager.deleteAppointment(String(appointmentId));
            // 根據語言顯示刪除掛號記錄提示
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const msg = lang === 'en'
                    ? `Removed registration record for ${patient.name}`
                    : `已移除 ${patient.name} 的掛號記錄`;
                G.showToast(msg, 'success');
            }
            loadTodayAppointments();
            // 如果正在診症表單中顯示該病人，則關閉表單
            if (String(G.currentConsultingAppointmentId) === String(appointmentId)) {
                closeConsultationForm();
                G.currentConsultingAppointmentId = null;
            }
        }
    } catch (error) {
        console.error('移除掛號錯誤:', error);
        G.showToast('移除掛號時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

/**
 * 取消候診：將病人狀態從候診中改回已掛號。
 * 僅限管理員或護理師可操作。
 * @param {number|string} appointmentId - 掛號 ID
 */
export async function cancelWaiting(appointmentId) {
    // 取得最新的掛號資料，避免長時間待機後本地資料過期
    const appointment = await G.getLatestAppointmentById(appointmentId);
    if (!appointment) {
        G.showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 取得觸發按鈕：優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="cancelWaiting(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }
        // 只能對候診中狀態的掛號取消候診
        if (appointment.status !== 'waiting') {
            const statusNames = {
                'registered': '已掛號',
                'consulting': '診症中',
                'completed': '已完成'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            const lang = localStorage.getItem('lang') || 'zh';
            const statusNamesEnMap = {
                '已掛號': 'registered',
                '診症中': 'consulting',
                '已完成': 'completed'
            };
            const currentStatusNameEn = statusNamesEnMap[currentStatusName] || currentStatusName;
            const zhMsg = `無法取消候診！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只有候診中的病人可以取消候診。`;
            const enMsg = `Cannot cancel waiting! Patient ${patient.name} is currently "${currentStatusNameEn}". Only patients who are "waiting" can cancel waiting.`;
            const msg = lang === 'en' ? enMsg : zhMsg;
            G.showToast(msg, 'warning');
            return;
        }
        /*
         * 取消候診不再需要顯示確認視窗。
         * 按下「取消候診」按鈕後，將直接將病人狀態從候診中改回已掛號。
         * 以下留存雙語訊息字串以供未來擴充需求，但此版本已不再呼叫 showConfirmation。
         */
        // const langConfirm = localStorage.getItem('lang') || 'zh';
        // const zhMsg2 = `確定要取消 ${patient.name} 的候診嗎？\n\n病人狀態將回到已掛號，是否繼續？`;
        // const enMsg2 = `Are you sure you want to cancel waiting for ${patient.name}?\n\nThe patient's status will revert to registered. Do you want to proceed?`;
        // const confirmMsg = langConfirm === 'en' ? enMsg2 : zhMsg2;
        // 不需要確認，直接繼續處理取消候診。
        // 更新狀態為已掛號，移除到達資訊
        appointment.status = 'registered';
        delete appointment.arrivedAt;
        delete appointment.confirmedBy;
        // 更新全域陣列中的對應掛號，以避免參照不同步
        try {
            if (Array.isArray(G.appointments)) {
                const idx = G.appointments.findIndex(apt => apt && String(apt.id) === String(appointment.id));
                if (idx >= 0) {
                    G.appointments[idx] = { ...appointment };
                }
            }
        } catch (_e) {}
        // 保存狀態變更
        try {
            localStorage.setItem('appointments', JSON.stringify(G.appointments));
        } catch (_err) {}
        // 同步更新到 Firebase
        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
        // 通知使用者已取消候診
        {
            const lang = localStorage.getItem('lang') || 'zh';
            const zhMsg3 = `已取消 ${patient.name} 的候診，病人狀態回到已掛號`;
            const enMsg3 = `Cancelled waiting for ${patient.name} and reverted status to registered`;
            const msg = lang === 'en' ? enMsg3 : zhMsg3;
            G.showToast(msg, 'success');
        }
        // 重新載入掛號列表
        loadTodayAppointments();
    } catch (error) {
        console.error('取消候診時發生錯誤:', error);
        G.showToast('取消候診時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

        

        
 // 4. 修改開始診症函數，支援 Firebase
export async function startConsultation(appointmentId) {
    // 在開始新的診症前，清除先前留存的套票變更記錄，
    // 以免不同病人的操作互相影響。
    G.pendingPackageChanges = [];
    // 取得最新的掛號資料，避免長時間待機後本地資料過期
    const appointment = await G.getLatestAppointmentById(appointmentId);
    if (!appointment) {
        G.showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 取得觸發按鈕。使用通用輔助函式以簡化後續程式碼。
    // 使用模板字串產生動態選擇器，以正確包含 appointmentId
    let loadingButton = G.getLoadingButtonFromEvent(`button[onclick="startConsultation(${appointmentId})"]`);
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }
        const isGeneralRegistration = G.isGeneralRegistrationAppointment(appointment);
        const canManageGeneralRegistration = G.currentUserData &&
            (G.currentUserData.position === '診所管理' || G.currentUserData.position === '護理師');
        // 檢查當前用戶是否有權開始診症
        if (!G.currentUserData || (
            isGeneralRegistration
                ? !canManageGeneralRegistration
                : (G.currentUserData.position !== '醫師' || appointment.appointmentDoctor !== G.currentUserData.username)
        )) {
            G.showToast(
                isGeneralRegistration
                    ? '只有管理員或護理師才能為一般掛號開始診症！'
                    : '只有該掛號的醫師才能開始診症！',
                'error'
            );
            return;
        }
        // 詳細狀態檢查
        console.log(`開始診症狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}`);
        // 檢查病人狀態是否允許開始診症
        if (!['waiting', 'registered'].includes(appointment.status)) {
            // 狀態名稱映射，用於中英文提示
            const statusNames = {
                'consulting': '診症中',
                'completed': '已完成'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            const lang = localStorage.getItem('lang') || 'zh';
            const statusNamesEnMap = {
                '診症中': 'consulting',
                '已完成': 'completed',
                '候診中': 'waiting',
                '已掛號': 'registered'
            };
            const currentStatusNameEn = statusNamesEnMap[currentStatusName] || currentStatusName;
            const zhMsg = `無法開始診症！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只能對「已掛號」或「候診中」的病人開始診症。`;
            const enMsg = `Cannot start consultation! Patient ${patient.name} is currently "${currentStatusNameEn}". You can only start a consultation for patients who are "registered" or "waiting".`;
            const msg = lang === 'en' ? enMsg : zhMsg;
            G.showToast(msg, 'error');
            return;
        }
        // 如果是已掛號狀態，自動確認到達
        if (appointment.status === 'registered') {
            appointment.arrivedAt = new Date().toISOString();
            appointment.confirmedBy = G.currentUserData ? G.currentUserData.username : G.currentUser;
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const msg = lang === 'en'
                    ? `${patient.name} has been automatically confirmed as arrived`
                    : `${patient.name} 已自動確認到達`;
                G.showToast(msg, 'info');
            }
        }
        // 檢查是否已有其他病人在診症中（只檢查同一醫師的病人）
        const consultingAppointment = G.appointments.find(apt =>
            apt &&
            apt.status === 'consulting' &&
            String(apt.id) !== String(appointmentId) &&
            G.getAppointmentResponsibleDoctorUsername(apt) === G.currentUserData.username &&
            new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
        );
        if (consultingAppointment) {
            const consultingPatient = result.data.find(p => p.id === consultingAppointment.patientId);
            const consultingPatientName = consultingPatient ? consultingPatient.name : '未知病人';
            // 提示當前正在診症其他病人，詢問是否結束並開始新診症（支援中英文）
            const lang3 = localStorage.getItem('lang') || 'zh';
            const zhMsg2 = `您目前正在為 ${consultingPatientName} 診症。\n\n是否要結束該病人的診症並開始為 ${patient.name} 診症？\n\n注意：${consultingPatientName} 的狀態將改回候診中。`;
            const enMsg2 = `You are currently consulting ${consultingPatientName}.\n\nDo you want to finish that patient's consultation and start consulting ${patient.name}?\n\nNote: ${consultingPatientName}'s status will revert to waiting.`;
            const confirmMsg2 = lang3 === 'en' ? enMsg2 : zhMsg2;
            const confirmedSwitch = await showConfirmation(confirmMsg2, 'warning');
            if (confirmedSwitch) {
                consultingAppointment.status = 'waiting';
                consultingAppointment.arrivedAt = new Date().toISOString();
                delete consultingAppointment.consultationStartTime;
                delete consultingAppointment.consultingDoctor;
                if (String(G.currentConsultingAppointmentId) === String(consultingAppointment.id)) {
                    closeConsultationForm();
                }
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const msg = lang === 'en'
                        ? `Finished ${consultingPatientName}'s consultation`
                        : `已結束 ${consultingPatientName} 的診症`;
                    G.showToast(msg, 'info');
                }
            } else {
                return;
            }
        }
        // 開始新的診症
        appointment.status = 'consulting';
        appointment.consultationStartTime = new Date().toISOString();
        appointment.consultingDoctor = G.currentUserData ? G.currentUserData.username : G.currentUser;
        localStorage.setItem('appointments', JSON.stringify(G.appointments));
        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
        G.currentConsultingAppointmentId = appointmentId;
        showConsultationForm(appointment);
        loadTodayAppointments();
        {
            const lang = localStorage.getItem('lang') || 'zh';
            const msg = lang === 'en'
                ? `Started consultation for ${patient.name}`
                : `開始為 ${patient.name} 診症`;
            G.showToast(msg, 'success');
        }
    } catch (error) {
        console.error('開始診症錯誤:', error);
        G.showToast('開始診症時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}
        
        // 繼續診症
        export async function continueConsultation(appointmentId) {
            // 取得按鈕並顯示讀取狀態
            let loadingButton = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    loadingButton = event.currentTarget;
                }
            } catch (_e) {}
            if (!loadingButton) {
                try {
                    loadingButton = document.querySelector('button[onclick="continueConsultation(' + appointmentId + ')"]');
                } catch (_e) {
                    loadingButton = null;
                }
            }
            if (loadingButton) {
                G.setButtonLoading(loadingButton, '處理中...');
            }
            try {
                // 取得最新的掛號資料，避免長時間待機後本地資料過期
                const appointment = await G.getLatestAppointmentById(appointmentId);
                if (!appointment) {
                    G.showToast('找不到掛號記錄！', 'error');
                    return;
                }
                const isGeneralRegistration = G.isGeneralRegistrationAppointment(appointment);
                const canManageGeneralRegistration = G.currentUserData &&
                    (G.currentUserData.position === '診所管理' || G.currentUserData.position === '護理師');
                if (!G.currentUserData || (
                    isGeneralRegistration
                        ? !canManageGeneralRegistration
                        : (G.currentUserData.position !== '醫師' || G.getAppointmentResponsibleDoctorUsername(appointment) !== G.currentUserData.username)
                )) {
                    G.showToast(
                        isGeneralRegistration
                            ? '只有管理員或護理師才能繼續一般掛號的診症！'
                            : '只有該掛號的醫師才能繼續診症！',
                        'error'
                    );
                    return;
                }
                G.currentConsultingAppointmentId = appointmentId;
                // 等待顯示表單完成，因其可能涉及異步操作
                await showConsultationForm(appointment);
            } catch (error) {
                console.error('繼續診症錯誤:', error);
                G.showToast('繼續診症時發生錯誤', 'error');
            } finally {
                if (loadingButton) {
                    G.clearButtonLoading(loadingButton);
                }
            }
        }
