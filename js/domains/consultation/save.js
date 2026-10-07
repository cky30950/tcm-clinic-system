/* ============================================================
 * consultation/save.js — 診症草稿自動保存、表單生命週期
 * （show/clear/close/cancel/audit）、收費結構化與 saveConsultation
 * 中樞（Phase 6 子批 B）。共享狀態所有權留 system.js，經 G 讀寫；
 * 開方/收費操作與套票提交走 window facade。
 * ============================================================ */
import { G } from '../../lib/legacy.js';

export function buildConsultationSymptomsDraftKey(appointment, patient) {
    const pid = patient && (patient.id !== undefined && patient.id !== null) ? String(patient.id) : '';
    const isEditing = appointment && appointment.status === 'completed' && appointment.consultationId;
    if (isEditing) {
        return `tcmDraft:consultation:form:v2:pid:${pid}:cid:${String(appointment.consultationId)}`;
    }
    const apptId = appointment && (appointment.id !== undefined && appointment.id !== null) ? String(appointment.id) : (typeof G.currentConsultingAppointmentId !== 'undefined' && G.currentConsultingAppointmentId !== null ? String(G.currentConsultingAppointmentId) : '');
    return `tcmDraft:consultation:form:v2:pid:${pid}:aid:${String(apptId)}`;
}

export function buildLegacyConsultationSymptomsDraftKey(appointment, patient) {
    const pid = patient && (patient.id !== undefined && patient.id !== null) ? String(patient.id) : '';
    const isEditing = appointment && appointment.status === 'completed' && appointment.consultationId;
    if (isEditing) {
        return `tcmDraft:consultation:symptoms:v1:pid:${pid}:cid:${String(appointment.consultationId)}`;
    }
    const apptId = appointment && (appointment.id !== undefined && appointment.id !== null) ? String(appointment.id) : (typeof G.currentConsultingAppointmentId !== 'undefined' && G.currentConsultingAppointmentId !== null ? String(G.currentConsultingAppointmentId) : '');
    return `tcmDraft:consultation:symptoms:v1:pid:${pid}:aid:${String(apptId)}`;
}

export function readConsultationSymptomsDraft(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return null;
        return obj;
    } catch (_e) {
        return null;
    }
}

export function writeConsultationSymptomsDraft(key, next) {
    try {
        localStorage.setItem(key, JSON.stringify(next));
        return true;
    } catch (_e) {
        return false;
    }
}

export function clearConsultationSymptomsDraft(key) {
    try {
        if (key) {
            localStorage.removeItem(key);
        }
        if (typeof key === 'string' && key.indexOf('tcmDraft:consultation:form:v2:') === 0) {
            const legacyKey = key.replace('tcmDraft:consultation:form:v2:', 'tcmDraft:consultation:symptoms:v1:');
            localStorage.removeItem(legacyKey);
        }
    } catch (_e) {}
}

export function getConsultationDraftHtmlText(html) {
    try {
        const temp = document.createElement('div');
        temp.innerHTML = String(html || '');
        return (temp.textContent || temp.innerText || '').replace(/\u00a0/g, ' ').trim();
    } catch (_e) {
        return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}

export function normalizeConsultationDraftPrescriptionSections() {
    if (!Array.isArray(G.prescriptions)) return [];
    return G.prescriptions.map((section, index) => ({
        name: section && section.name ? String(section.name) : (index === 0 ? '處方' : `處方${index + 1}`),
        items: Array.isArray(section && section.items) ? JSON.parse(JSON.stringify(section.items)) : [],
        days: Math.max(1, parseInt(section && section.days, 10) || 5),
        freq: Math.max(1, parseInt(section && section.freq, 10) || 2),
        mode: section && section.mode === 'slice' ? 'slice' : 'granule'
    }));
}

export function normalizeConsultationDraftBillingItems() {
    return (Array.isArray(G.selectedBillingItems) ? G.selectedBillingItems : []).map(item => ({
        id: item && item.id !== undefined && item.id !== null ? String(item.id) : '',
        name: item && item.name ? String(item.name) : '',
        category: item && item.category ? String(item.category) : 'other',
        price: Number(item && item.price) || 0,
        unit: item && item.unit ? String(item.unit) : '',
        description: item && item.description ? String(item.description) : '',
        quantity: Math.max(1, parseInt(item && item.quantity, 10) || 1),
        includedInDiscount: item && item.includedInDiscount === false ? false : true,
        packageUses: Number(item && item.packageUses) || 0,
        validityDays: Number(item && item.validityDays) || 0,
        patientId: item && item.patientId ? String(item.patientId) : '',
        packageRecordId: item && item.packageRecordId ? String(item.packageRecordId) : '',
        isHistorical: !!(item && item.isHistorical)
    }));
}

export function collectConsultationDraftPayload() {
    const fields = {};
    G.CONSULTATION_DRAFT_TEXT_FIELD_IDS.forEach(id => {
        const el = document.getElementById(id);
        fields[id] = el && 'value' in el ? String(el.value || '') : '';
    });
    const acupunctureNotesEl = document.getElementById('formAcupunctureNotes');
    const prescriptionTextEl = document.getElementById('formPrescription');
    const billingTextEl = document.getElementById('formBillingItems');
    return {
        version: 2,
        fields,
        // 存入 localStorage 前一併白名單淨化，避免草稿成為 XSS 載體
        acupunctureNotesHtml: acupunctureNotesEl ? window.sanitizeAcupunctureNotesHtml(acupunctureNotesEl.innerHTML) : '',
        prescription: prescriptionTextEl && 'value' in prescriptionTextEl ? String(prescriptionTextEl.value || '') : '',
        multiPrescriptions: normalizeConsultationDraftPrescriptionSections(),
        billingItems: billingTextEl && 'value' in billingTextEl ? String(billingTextEl.value || '') : '',
        billingItemsStructured: normalizeConsultationDraftBillingItems(),
        meta: G.consultationSymptomsDraftState.meta || null,
        updatedAt: Date.now()
    };
}

export function hasMeaningfulConsultationDraft(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
    if (Object.values(fields).some(value => String(value || '').trim())) {
        return true;
    }
    if (getConsultationDraftHtmlText(payload.acupunctureNotesHtml || '')) {
        return true;
    }
    if (String(payload.prescription || '').trim()) {
        return true;
    }
    if (Array.isArray(payload.multiPrescriptions) && payload.multiPrescriptions.some(section => Array.isArray(section && section.items) && section.items.length > 0)) {
        return true;
    }
    if (String(payload.billingItems || '').trim()) {
        return true;
    }
    if (Array.isArray(payload.billingItemsStructured) && payload.billingItemsStructured.length > 0) {
        return true;
    }
    return false;
}

export function persistConsultationSymptomsDraft() {
    const key = G.consultationSymptomsDraftState && G.consultationSymptomsDraftState.key ? G.consultationSymptomsDraftState.key : null;
    if (!key) return;
    // 表單正在程式化載入/清空（例如切換病人、修改病歷載入中）時不寫草稿，
    // 否則會把空白或其他病人的內容誤寫入目前 key。
    if (G.consultationSymptomsDraftState.suspended) return;
    const payload = collectConsultationDraftPayload();
    if (!hasMeaningfulConsultationDraft(payload)) {
        clearConsultationSymptomsDraft(key);
        return;
    }
    writeConsultationSymptomsDraft(key, payload);
}

export function restoreConsultationSymptomsDraft(appointment, patient) {
    const key = buildConsultationSymptomsDraftKey(appointment, patient);
    G.consultationSymptomsDraftState.key = key;
    G.consultationSymptomsDraftState.meta = {
        appointmentId: appointment && appointment.id !== undefined && appointment.id !== null ? String(appointment.id) : (typeof G.currentConsultingAppointmentId !== 'undefined' ? String(G.currentConsultingAppointmentId) : ''),
        consultationId: appointment && appointment.consultationId ? String(appointment.consultationId) : '',
        patientId: patient && patient.id !== undefined && patient.id !== null ? String(patient.id) : '',
        patientName: patient && patient.name ? String(patient.name) : '',
        doctor: G.currentUserData && G.currentUserData.username ? String(G.currentUserData.username) : (G.currentUser ? String(G.currentUser) : '')
    };
    let draft = readConsultationSymptomsDraft(key);
    if (!draft) {
        draft = readConsultationSymptomsDraft(buildLegacyConsultationSymptomsDraftKey(appointment, patient));
    }
    if (!draft) return;

    // 編輯病歷模式：本機草稿若不是「晚於」本次載入的已保存病歷，即為遺留的舊草稿
    // （可能是上次異常退出、或切換病人時被誤寫入的空白/他人內容），不得覆蓋剛從
    // 資料庫載入的處方、收費與其他欄位，直接丟棄 v2/v1 兩個暫存鍵。
    // 只有在保存後又繼續編輯而未儲存的真正新草稿（updatedAt 較新）才會恢復。
    // 雙重保障：savedRecordAt === 0（表示載入階段未能正確取得病歷時間戳）時，
    // 一律視為過期，避免任何草稿覆蓋剛載入的內容。
    const isEditModeDraft = !!(appointment && appointment.status === 'completed' && appointment.consultationId);
    if (isEditModeDraft) {
        const draftUpdatedAt = Number(draft && draft.updatedAt) || 0;
        const savedRecordAt = Number(G.consultationSymptomsDraftState.loadedRecordUpdatedAt) || 0;
        const isStaleDraft = !draftUpdatedAt || savedRecordAt === 0 || (savedRecordAt > 0 && draftUpdatedAt <= savedRecordAt);
        // #region debug-point B1:draft-stale-decision
        try { window.__dbgSeq = (window.__dbgSeq || 0) + 1; fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"edit-record-blank-load",runId:"pre",hypothesisId:"B",location:"save.js:draft-stale-decision",msg:"[DEBUG] draft stale check in edit mode",data:{seq:window.__dbgSeq,draftUpdatedAt,savedRecordAt,isStaleDraft,draftSections:Array.isArray(draft.multiPrescriptions)?draft.multiPrescriptions.length:null,draftPresItems:Array.isArray(draft.multiPrescriptions)?draft.multiPrescriptions.reduce((n,s)=>n+((s&&s.items)?s.items.length:0),0):null,draftBilling:Array.isArray(draft.billingItemsStructured)?draft.billingItemsStructured.length:null},ts:Date.now()})}).catch((_e)=>{}); } catch(_e){}
        // #endregion
        if (isStaleDraft) {
            try {
                clearConsultationSymptomsDraft(key);
                clearConsultationSymptomsDraft(buildLegacyConsultationSymptomsDraftKey(appointment, patient));
            } catch (_e) {}
            return;
        }
    }

    let restored = false;
    const isBillingOnlyEdit = !!(
        appointment &&
        appointment.status === 'completed' &&
        appointment.consultationId &&
        G.getMedicalRecordEditAccessScope(null, appointment) === 'billingOnly'
    );
    const isLegacySymptomsDraft = Object.prototype.hasOwnProperty.call(draft, 'value') || Object.prototype.hasOwnProperty.call(draft, 'prevValue');
    if (isLegacySymptomsDraft) {
        if (isBillingOnlyEdit) return;
        const symptomsEl = document.getElementById('formSymptoms');
        if (!symptomsEl) return;
        const rawValue = typeof draft.value === 'string' ? draft.value : '';
        const rawPrevValue = typeof draft.prevValue === 'string' ? draft.prevValue : '';
        const valueToRestore = (rawValue && rawValue.trim()) ? rawValue : ((rawPrevValue && rawPrevValue.trim()) ? rawPrevValue : '');
        if (!valueToRestore) return;
        if ((symptomsEl.value || '') !== valueToRestore) {
            symptomsEl.value = valueToRestore;
            restored = true;
        }
    } else {
        const fields = draft.fields && typeof draft.fields === 'object' ? draft.fields : {};
        if (!isBillingOnlyEdit) {
            G.CONSULTATION_DRAFT_TEXT_FIELD_IDS.forEach(id => {
                if (!Object.prototype.hasOwnProperty.call(fields, id)) return;
                const el = document.getElementById(id);
                if (!el || !('value' in el)) return;
                const nextValue = String(fields[id] || '');
                if (String(el.value || '') !== nextValue) {
                    el.value = nextValue;
                    restored = true;
                }
            });
        }

        if (!isBillingOnlyEdit && Object.prototype.hasOwnProperty.call(draft, 'acupunctureNotesHtml')) {
            const acnEl = document.getElementById('formAcupunctureNotes');
            const nextHtml = window.sanitizeAcupunctureNotesHtml(draft.acupunctureNotesHtml || '');
            if (acnEl && String(acnEl.innerHTML || '') !== nextHtml) {
                acnEl.innerHTML = nextHtml;
                restored = true;
                if (typeof G.initializeAcupointNotesSpans === 'function') {
                    try {
                        G.initializeAcupointNotesSpans();
                    } catch (_e) {}
                }
            }
        }

        if (!isBillingOnlyEdit && Object.prototype.hasOwnProperty.call(draft, 'multiPrescriptions')) {
            // #region debug-point B2:draft-apply-prescriptions
            try { window.__dbgSeq = (window.__dbgSeq || 0) + 1; fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"edit-record-blank-load",runId:"pre",hypothesisId:"B",location:"save.js:draft-apply-prescriptions",msg:"[DEBUG] draft overwrites prescriptions",data:{seq:window.__dbgSeq,draftSections:Array.isArray(draft.multiPrescriptions)?draft.multiPrescriptions.length:null,draftPresItems:Array.isArray(draft.multiPrescriptions)?draft.multiPrescriptions.reduce((n,s)=>n+((s&&s.items)?s.items.length:0),0):null},ts:Date.now()})}).catch((_e)=>{}); } catch(_e){}
            // #endregion
            const draftSections = Array.isArray(draft.multiPrescriptions) ? draft.multiPrescriptions : [];
            if (draftSections.length > 0) {
                G.prescriptions = draftSections.map((section, index) => ({
                    name: section && section.name ? String(section.name) : (index === 0 ? '處方' : `處方${index + 1}`),
                    items: Array.isArray(section && section.items) ? JSON.parse(JSON.stringify(section.items)) : [],
                    days: Math.max(1, parseInt(section && section.days, 10) || 5),
                    freq: Math.max(1, parseInt(section && section.freq, 10) || 2),
                    mode: section && section.mode === 'slice' ? 'slice' : 'granule'
                }));
            } else {
                const diagnosisDefaults = typeof G.getEffectiveDiagnosisSettings === 'function'
                    ? G.getEffectiveDiagnosisSettings()
                    : { defaultPrescriptionDays: 5, defaultPrescriptionFrequency: 2 };
                G.prescriptions = [{
                    name: '處方',
                    items: [],
                    days: diagnosisDefaults.defaultPrescriptionDays || 5,
                    freq: diagnosisDefaults.defaultPrescriptionFrequency || 2,
                    mode: (G.currentInventoryMode === 'slice' ? 'slice' : 'granule')
                }];
            }
            G.activePrescriptionIndex = 0;
            G.selectedPrescriptionItems = G.prescriptions[0] && Array.isArray(G.prescriptions[0].items) ? G.prescriptions[0].items : [];
            try {
                const initialMode = G.prescriptions[0] && G.prescriptions[0].mode === 'slice' ? 'slice' : 'granule';
                G.changeInventoryType(initialMode);
            } catch (_e) {}
            if (typeof updatePrescriptionDisplay === 'function') {
                updatePrescriptionDisplay();
            }
            restored = true;
        } else if (!isBillingOnlyEdit && Object.prototype.hasOwnProperty.call(draft, 'prescription')) {
            const prescriptionEl = document.getElementById('formPrescription');
            if (prescriptionEl && String(prescriptionEl.value || '') !== String(draft.prescription || '')) {
                prescriptionEl.value = String(draft.prescription || '');
                restored = true;
            }
        }

        if (Object.prototype.hasOwnProperty.call(draft, 'billingItemsStructured')) {
            // #region debug-point B3:draft-apply-billing
            try { window.__dbgSeq = (window.__dbgSeq || 0) + 1; fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"edit-record-blank-load",runId:"pre",hypothesisId:"B",location:"save.js:draft-apply-billing",msg:"[DEBUG] draft overwrites billing",data:{seq:window.__dbgSeq,draftBilling:Array.isArray(draft.billingItemsStructured)?draft.billingItemsStructured.length:null},ts:Date.now()})}).catch((_e)=>{}); } catch(_e){}
            // #endregion
            G.selectedBillingItems = Array.isArray(draft.billingItemsStructured)
                ? draft.billingItemsStructured.map(item => ({ ...item }))
                : [];
            if (typeof updateBillingDisplay === 'function') {
                updateBillingDisplay();
            }
            restored = true;
        } else if (Object.prototype.hasOwnProperty.call(draft, 'billingItems')) {
            const billingEl = document.getElementById('formBillingItems');
            if (billingEl && String(billingEl.value || '') !== String(draft.billingItems || '')) {
                billingEl.value = String(draft.billingItems || '');
                restored = true;
            }
        }
    }

    if (restored) {
        G.showToast('已自動復原未儲存的診症暫存內容', 'info');
    }
}

export function setupConsultationSymptomsDraftAutosave(appointment, patient) {
    const key = buildConsultationSymptomsDraftKey(appointment, patient);
    // 遞增世代：前一診次（可能是另一個病人）已排程但尚未觸發的防抖寫入，
    // 觸發時會因世代不符而自我作廢，不會把現下的表單內容誤寫進舊 key。
    const setupGeneration = (G.consultationSymptomsDraftState.generation || 0) + 1;
    G.consultationSymptomsDraftState.generation = setupGeneration;
    G.consultationSymptomsDraftState.key = key;
    G.consultationSymptomsDraftState.meta = {
        appointmentId: appointment && appointment.id !== undefined && appointment.id !== null ? String(appointment.id) : (typeof G.currentConsultingAppointmentId !== 'undefined' ? String(G.currentConsultingAppointmentId) : ''),
        consultationId: appointment && appointment.consultationId ? String(appointment.consultationId) : '',
        patientId: patient && patient.id !== undefined && patient.id !== null ? String(patient.id) : '',
        patientName: patient && patient.name ? String(patient.name) : '',
        doctor: G.currentUserData && G.currentUserData.username ? String(G.currentUserData.username) : (G.currentUser ? String(G.currentUser) : '')
    };
    if (Array.isArray(G.consultationSymptomsDraftState.listeners) && G.consultationSymptomsDraftState.listeners.length > 0) {
        G.consultationSymptomsDraftState.listeners.forEach(listener => {
            try {
                if (listener && listener.el && listener.eventName && listener.handler) {
                    listener.el.removeEventListener(listener.eventName, listener.handler);
                }
            } catch (_e) {}
        });
    }
    G.consultationSymptomsDraftState.listeners = [];
    const persistIfCurrent = () => {
        try {
            if (G.consultationSymptomsDraftState.generation !== setupGeneration) return;
            if (G.consultationSymptomsDraftState.suspended) return;
            persistConsultationSymptomsDraft();
        } catch (_e) {}
    };
    const persistDraftDebounced = G.debounce(persistIfCurrent, 400);
    G.consultationSymptomsDraftState.saveSoon = G.debounce(persistIfCurrent, 50);

    G.CONSULTATION_DRAFT_TEXT_FIELD_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', persistDraftDebounced);
        G.consultationSymptomsDraftState.listeners.push({ el, eventName: 'input', handler: persistDraftDebounced });
    });

    const acnEl = document.getElementById('formAcupunctureNotes');
    if (acnEl) {
        acnEl.addEventListener('input', persistDraftDebounced);
        G.consultationSymptomsDraftState.listeners.push({ el: acnEl, eventName: 'input', handler: persistDraftDebounced });
    }
}

export function stopConsultationSymptomsDraftAutosave() {
    try {
        const listeners = G.consultationSymptomsDraftState && Array.isArray(G.consultationSymptomsDraftState.listeners)
            ? G.consultationSymptomsDraftState.listeners
            : [];
        listeners.forEach(listener => {
            if (listener && listener.el && listener.eventName && listener.handler) {
                listener.el.removeEventListener(listener.eventName, listener.handler);
            }
        });
    } catch (_e) {}
    if (G.consultationSymptomsDraftState) {
        G.consultationSymptomsDraftState.listeners = [];
        G.consultationSymptomsDraftState.saveSoon = null;
    }
}

export function queueConsultationSymptomsDraftSave() {
    try {
        if (!G.consultationSymptomsDraftState || G.consultationSymptomsDraftState.suspended) return;
        if (typeof G.consultationSymptomsDraftState.saveSoon === 'function') {
            G.consultationSymptomsDraftState.saveSoon();
        }
    } catch (_e) {}
}

export function updateConsultationCancelButtonLabel(isEditingMode) {
    const cancelButton = document.getElementById('consultationCancelButton');
    if (!cancelButton) return;
    cancelButton.textContent = isEditingMode ? '取消修改' : '取消診症';
}

// 修復診症表單顯示函數
export async function showConsultationForm(appointment) {
    // 整個表單程式化填充（清空／從病歷載入／恢復草稿）期間暫停草稿自動寫入：
    // updateBillingDisplay 等渲染函式也會 queue 草稿寫入，若不在此懸浮，
    // 切換病人的 await 期間舊診次的防抖計時器可能把空白或他人資料寫進舊草稿 key。
    G.consultationSymptomsDraftState.suspended = true;
    G.consultationSymptomsDraftState.loadedRecordUpdatedAt = 0;
    try {
        const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            G.consultationSymptomsDraftState.suspended = false;
            return;
        }
        
        // 設置病人資訊
        // 顯示病人姓名與編號
        document.getElementById('formPatientName').textContent = `${patient.name} (${patient.patientNumber})`;
        // 顯示掛號時間
        document.getElementById('formAppointmentTime').textContent = new Date(appointment.appointmentTime).toLocaleString('zh-TW');
        // 顯示病人年齡，若沒有出生日期則顯示「未知」
        const ageEl = document.getElementById('formPatientAge');
        if (ageEl) {
            ageEl.textContent = G.formatAge(patient.birthDate);
        }
        // 顯示病人性別，若沒有資料則顯示「未知」
        const genderEl = document.getElementById('formPatientGender');
        if (genderEl) {
            genderEl.textContent = patient.gender || '未知';
        }
        G.renderConsultationPatientMedicalInfo(patient);
        // 渲染病人療程/套餐資訊
        renderPatientPackages(patient.id);
        
        // 檢查是否為編輯模式
        const isEditingMode = appointment.status === 'completed' && appointment.consultationId;
        updateConsultationCancelButtonLabel(!!isEditingMode);
        if (appointment.status === 'completed' && appointment.consultationId) {
            // 編輯模式：先清空任何殘留的收費項目/處方狀態，再從 Firebase 載入現有診症記錄。
            // 這可避免上一個診次殘留的 selectedBillingItems 或 prescriptions 在載入過程中被
            // 某個非同步回調（如 renderPatientPackages）誤觸發 updateBillingDisplay/updatePrescriptionDisplay，
            // 導致新載入的內容在渲染前被舊狀態短暫覆蓋。
            G.selectedBillingItems = [];
            G.prescriptions = [{ name: '處方', items: [], days: 5, freq: 2, mode: (G.currentInventoryMode === 'slice' ? 'slice' : 'granule') }];
            G.activePrescriptionIndex = 0;
            G.selectedPrescriptionItems = G.prescriptions[0].items;
            G.pendingPackageChanges = [];
            await G.loadConsultationForEdit(appointment.consultationId);
        } else {
            // 新診症模式：使用空白表單
            clearConsultationForm();
            const reasonContainer = document.getElementById('auditReasonContainer');
            if (reasonContainer) {
                reasonContainer.classList.add('hidden');
            }
            
            // 設置預設值
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
            document.getElementById('formVisitTime').value = localDateTime;
            
            // 設置預設休息期間
            const startDate = new Date();
            const endDate = new Date();
            // 預設休息期間為一天，結束日期與開始日期相同
            endDate.setDate(startDate.getDate());
            
            const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
            const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
            
            document.getElementById('formRestStartDate').value = startDateStr;
            document.getElementById('formRestEndDate').value = endDateStr;
            updateRestPeriod();

            // 依個人診症設定填入預設複診時間
            try {
                const defaultFollowUpValue = G.buildDefaultFollowUpDate(now);
                if (defaultFollowUpValue) {
                    document.getElementById('formFollowUpDate').value = defaultFollowUpValue;
                }
            } catch (_e) {
                console.warn('無法設定預設複診時間', _e);
            }
            
            // 嘗試從 Firestore 取得問診資料，用於預填主訴與現病史。
            // 這裡不再使用 appointment.inquiryData，本地僅保存 inquiryId 與摘要。
            let inquiryDataForPrefill = null;
            if (appointment && appointment.inquiryId) {
                try {
                    // 對病人姓名進行修剪，避免前後空白導致查詢不到
                    const nameForSearch = patient && patient.name ? String(patient.name).trim() : '';
                    let inquiryResult = await window.firebaseDataManager.getInquiryRecords(nameForSearch);
                    let rec = null;
                    if (inquiryResult && inquiryResult.success && Array.isArray(inquiryResult.data)) {
                        rec = inquiryResult.data.find(r => String(r.id) === String(appointment.inquiryId));
                    }
                    // 如果按姓名查詢找不到，改為查詢所有記錄再搜尋 id
                    if (!rec) {
                        try {
                            const allResult = await window.firebaseDataManager.getInquiryRecords('');
                            if (allResult && allResult.success && Array.isArray(allResult.data)) {
                                rec = allResult.data.find(r => String(r.id) === String(appointment.inquiryId));
                            }
                        } catch (e2) {
                            console.warn('取得全部問診記錄時發生錯誤:', e2);
                        }
                    }
                    if (rec && rec.data) {
                        inquiryDataForPrefill = rec.data;
                    }
                } catch (err) {
                    console.error('取得問診資料時發生錯誤:', err);
                }
            }

            // 如果掛號時有問診摘要且未填寫主訴或主訴為預設，優先使用問診摘要
            const symptomsField = document.getElementById('formSymptoms');
            if (symptomsField) {
                if (appointment && appointment.inquirySummary && (!appointment.chiefComplaint || appointment.chiefComplaint === '無特殊主訴')) {
                    symptomsField.value = appointment.inquirySummary;
                } else if (appointment.chiefComplaint && appointment.chiefComplaint !== '無特殊主訴') {
                    symptomsField.value = appointment.chiefComplaint;
                }
                // 根據問診資料進一步完善主訴摘要
                if (inquiryDataForPrefill) {
                    const newSummary = G.generateSymptomSummaryFromInquiry(inquiryDataForPrefill);
                    if (newSummary) {
                        const currentVal = symptomsField.value ? symptomsField.value.trim() : '';
                        // 如果目前為空或與問診摘要/主訴一致，則直接覆蓋；否則附加在後
                        if (!currentVal || currentVal === appointment.inquirySummary || currentVal === appointment.chiefComplaint || currentVal === '無特殊主訴') {
                            symptomsField.value = newSummary;
                        } else {
                            symptomsField.value = currentVal + '\n' + newSummary;
                        }
                    }
                }
            }
            // 根據問診資料填充現病史內容
            // 診症系統已將「主訴」與「現病史」合併至 formSymptoms 欄位，
            // 因此將現病史摘要直接追加至主訴欄位，而不再寫入過往記錄欄位（formCurrentHistory）。
            if (inquiryDataForPrefill) {
                const historySummary = G.generateHistorySummaryFromInquiry(inquiryDataForPrefill);
                if (historySummary) {
                    // 將現病史內容與主訴內容合併
                    const symptomsEl = document.getElementById('formSymptoms');
                    if (symptomsEl) {
                        const currentVal = symptomsEl.value ? symptomsEl.value.trim() : '';
                        if (!currentVal) {
                            symptomsEl.value = historySummary;
                        } else {
                            symptomsEl.value = currentVal + '\n' + historySummary;
                        }
                    }
                }
            }

            // 自動添加預設診金收費項目
            addDefaultConsultationFee(patient);
            
            // 安全獲取診症儲存按鈕文本元素，避免為 null 時出錯
            const saveButtonTextElNew = document.getElementById('consultationSaveButtonText');
            if (saveButtonTextElNew) {
                saveButtonTextElNew.textContent = '完成診症';
            } else {
                // 若找不到元素，則紀錄警告並跳過，不造成程式崩潰
                console.warn('consultationSaveButtonText element not found when starting consultation. Skipping text update.');
            }
        }

        // 載入過往記錄：顯示患者既往的主訴及現病史，排除當前編輯的記錄
        try {
            await G.loadPastRecords(
                appointment.patientId,
                (appointment.status === 'completed' && appointment.consultationId) ? appointment.consultationId : null
            );
        } catch (err) {
            console.error('載入過往記錄時發生錯誤:', err);
        }

        try {
            restoreConsultationSymptomsDraft(appointment, patient);
            setupConsultationSymptomsDraftAutosave(appointment, patient);
        } catch (_e) {}
        // 表單內容就緒、自動保存已重新綁定後才恢復草稿寫入
        G.consultationSymptomsDraftState.suspended = false;

        // 載入病人錢包狀態：有效會員自動帶入折扣，並顯示儲值支付選項
        await window.setupConsultationWallet(appointment);

        G.setConsultationEditRestrictionState(appointment, null);

        document.getElementById('consultationForm').classList.remove('hidden');
        // #region debug-point A4:form-shown-final
        try { window.__dbgSeq = (window.__dbgSeq || 0) + 1; fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"edit-record-blank-load",runId:"pre",hypothesisId:"A",location:"save.js:form-shown",msg:"[DEBUG] form shown, final state",data:{seq:window.__dbgSeq,sections:G.prescriptions.length,presItems:(G.prescriptions||[]).reduce((n,p)=>n+((p&&p.items)?p.items.length:0),0),billingCount:(G.selectedBillingItems||[]).length},ts:Date.now()})}).catch((_e)=>{}); } catch(_e){}
        // #endregion

        // 滾動到表單位置
        document.getElementById('consultationForm').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        G.consultationSymptomsDraftState.suspended = false;
        console.error('顯示診症表單錯誤:', error);
        G.showToast('載入診症表單時發生錯誤', 'error');
    }
}
        

        
        // 清空診症表單
        export function clearConsultationForm() {
            G.setConsultationEditRestrictionState(null, null);
            ['formSymptoms', 'formTongue', 'formPulse', 'formCurrentHistory', 'formDiagnosis', 'formSyndrome', 'formAcupunctureNotes', 'formPrescription', 'formFollowUpDate', 'formVisitTime', 'formRestStartDate', 'formRestEndDate', 'formAuditReason'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (id === 'formAcupunctureNotes') {
                    // contenteditable 元素使用 innerHTML 清空，以保留樣式定義
                    if (el.hasAttribute('contenteditable')) {
                        el.innerHTML = '';
                    } else {
                        el.value = '';
                    }
                } else {
                    // 一般輸入欄位使用 value 清空
                    if ('value' in el) {
                        el.value = '';
                    } else {
                        el.innerText = '';
                    }
                }
            });
            
            // 重置多處方狀態與每日次數為預設值
            const diagnosisDefaults = G.getEffectiveDiagnosisSettings();
            G.prescriptions = [{
                name: '處方',
                items: [],
                days: diagnosisDefaults.defaultPrescriptionDays,
                freq: diagnosisDefaults.defaultPrescriptionFrequency,
                mode: (G.currentInventoryMode === 'slice' ? 'slice' : 'granule')
            }];
            G.activePrescriptionIndex = 0;
            G.selectedPrescriptionItems = G.prescriptions[0].items;
            const freqEl = document.getElementById('medicationFrequency');
            if (freqEl) freqEl.value = String(diagnosisDefaults.defaultPrescriptionFrequency);
            
            // 重置休息期間顯示
            const restEl = document.getElementById('restPeriodDisplay');
            if (restEl) {
                restEl.textContent = '請選擇開始和結束日期';
                restEl.className = 'text-sm text-gray-500 font-medium';
            }
            
            // 設置預設值
            const usageEl = document.getElementById('formUsage');
            if (usageEl) usageEl.value = diagnosisDefaults.defaultUsage;
            const instrEl = document.getElementById('formInstructions');
            if (instrEl) instrEl.value = diagnosisDefaults.defaultInstructions;
            const courseEl = document.getElementById('formTreatmentCourse');
            if (courseEl) courseEl.value = diagnosisDefaults.defaultTreatmentCourse;
            
            // 清空處方項目
            clearActivePrescriptionItems();
            updatePrescriptionDisplay();
            clearPrescriptionSearch();
            
            // 清空收費項目（但會在 prefillWithPreviousRecord 中自動添加診金）
            G.selectedBillingItems = [];
            updateBillingDisplay();
            clearBillingSearch();
            const reasonContainer = document.getElementById('auditReasonContainer');
            if (reasonContainer) {
                reasonContainer.classList.add('hidden');
            }
        }

        export async function openConsultationAuditTrail(targetConsultationId = '') {
            try {
                const consultationId = String(targetConsultationId || '').trim();
                const consultationIdFromCurrent = (() => {
                    const appointment = Array.isArray(G.appointments)
                        ? G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId))
                        : null;
                    return appointment && appointment.consultationId ? String(appointment.consultationId) : '';
                })();
                const finalConsultationId = consultationId || consultationIdFromCurrent;
                if (!finalConsultationId) {
                    G.showToast('目前沒有可查看的病歷審核追蹤。', 'warning');
                    return;
                }
                const modal = document.getElementById('consultationAuditTrailModal');
                const listEl = document.getElementById('consultationAuditTrailList');
                if (!modal || !listEl) {
                    G.showToast('審核追蹤視窗初始化失敗。', 'error');
                    return;
                }
                listEl.innerHTML = '<div class="text-sm text-gray-500">載入中...</div>';
                modal.classList.remove('hidden');
                modal.classList.add('flex');

                const result = await window.firebaseDataManager.getConsultationAuditLogs(finalConsultationId, 200);
                if (!result || !result.success) {
                    listEl.innerHTML = '<div class="text-sm text-red-500">讀取審核追蹤失敗，請稍後再試。</div>';
                    return;
                }

                const logs = Array.isArray(result.data) ? result.data : [];
                // 以實際查詢結果校正病歷修改狀態快取
                try {
                    if (typeof G.primeMedicalRecordAuditStatus === 'function') {
                        G.primeMedicalRecordAuditStatus(finalConsultationId, logs.length > 0);
                    }
                } catch (_primeErr) {}
                if (logs.length === 0) {
                    listEl.innerHTML = '<div class="text-sm text-gray-500">目前沒有病歷修改紀錄。</div>';
                    return;
                }

                const escape = (value) => String(value == null ? '' : value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');

                const formatTime = (raw) => {
                    let d = null;
                    if (raw && typeof raw.toDate === 'function') {
                        d = raw.toDate();
                    } else if (raw && raw.seconds) {
                        d = new Date(raw.seconds * 1000);
                    } else if (raw) {
                        d = new Date(raw);
                    }
                    if (!d || isNaN(d.getTime())) return '未知時間';
                    return d.toLocaleString('zh-TW', { hour12: false });
                };

                const getDisplayUserName = (editedBy) => {
                    const username = String(editedBy || '').trim();
                    if (!username) return '未知使用者';
                    if (Array.isArray(G.users) && G.users.length > 0) {
                        const matched = G.users.find(u => u && String(u.username || '') === username);
                        if (matched && matched.name) return String(matched.name);
                    }
                    return username;
                };

                const fieldLabelMap = {
                    symptoms: '主訴及現病史',
                    tongue: '舌象',
                    pulse: '脈象',
                    diagnosis: '中醫診斷',
                    syndrome: '證型診斷',
                    acupunctureNotes: '針灸備註',
                    prescription: '處方內容',
                    prescriptionStructured: '處方結構資料',
                    multiPrescriptions: '多處方內容',
                    usage: '中藥服用方法',
                    treatmentCourse: '療程',
                    instructions: '醫囑及注意事項',
                    followUpDate: '複診時間',
                    visitTime: '到診時間',
                    restStartDate: '建議休息開始日',
                    restEndDate: '建議休息結束日',
                    billingItems: '收費項目',
                    billingItemsStructured: '收費結構資料',
                    medicationDays: '服藥天數',
                    medicationFrequency: '每日次數',
                    status: '狀態',
                    clinicId: '診所ID',
                    clinicName: '診所名稱',
                    doctor: '醫師帳號',
                    date: '診症日期',
                    updatedAt: '更新時間',
                    updatedBy: '更新者'
                };
                const hiddenAuditFields = new Set(['billingItemsStructured', 'prescriptionStructured', 'multiPrescriptions', 'updatedAt', 'updatedBy', 'sortDate']);

                const formatValue = (val) => {
                    if (val === null || val === undefined || val === '') return '（空白）';
                    if (Array.isArray(val)) {
                        if (val.length === 0) return '（空白）';
                        return val.map(v => formatValue(v)).join('、');
                    }
                    if (typeof val === 'object') {
                        if (val && typeof val.toDate === 'function') {
                            const d = val.toDate();
                            return isNaN(d.getTime()) ? '（空白）' : d.toLocaleString('zh-TW', { hour12: false });
                        }
                        if (val && typeof val.seconds === 'number') {
                            const d = new Date(val.seconds * 1000);
                            return isNaN(d.getTime()) ? '（空白）' : d.toLocaleString('zh-TW', { hour12: false });
                        }
                        return JSON.stringify(val);
                    }
                    if (typeof val === 'string') {
                        const trimmed = val.trim();
                        if (!trimmed) return '（空白）';
                        const parsedDate = G.parseConsultationDate(trimmed);
                        if (parsedDate && !isNaN(parsedDate.getTime()) && /date|time|at/i.test(trimmed) === false) {
                            return trimmed;
                        }
                        return trimmed;
                    }
                    return String(val);
                };

                const buildDiffRows = (beforeData, afterData, changedFields) => {
                    const fields = (Array.isArray(changedFields) && changedFields.length
                        ? changedFields
                        : Array.from(new Set([
                            ...Object.keys(beforeData || {}),
                            ...Object.keys(afterData || {})
                        ])).filter((key) => JSON.stringify((beforeData || {})[key]) !== JSON.stringify((afterData || {})[key])))
                        .filter((field) => !hiddenAuditFields.has(String(field)));
                    if (!fields.length) {
                        return '<div class="text-xs text-gray-500">無可顯示的變更內容</div>';
                    }
                    return fields.map((field) => {
                        const label = fieldLabelMap[field] || field;
                        const beforeVal = formatValue(beforeData ? beforeData[field] : undefined);
                        const afterVal = formatValue(afterData ? afterData[field] : undefined);
                        return `
                            <div class="border border-gray-200 rounded p-2 bg-white">
                                <div class="text-xs font-semibold text-gray-700 mb-1">${escape(label)}</div>
                                <div class="text-xs text-gray-600">修改前：${escape(beforeVal)}</div>
                                <div class="text-xs text-gray-800 mt-1">修改後：${escape(afterVal)}</div>
                            </div>
                        `;
                    }).join('');
                };

                listEl.innerHTML = logs.map((log, index) => {
                    const beforeData = log && log.beforeData ? log.beforeData : {};
                    const afterData = log && log.afterData ? log.afterData : {};
                    const visibleChangedFields = (Array.isArray(log.changedFields) ? log.changedFields : [])
                        .filter((field) => !hiddenAuditFields.has(String(field)));
                    const changedFields = visibleChangedFields.length
                        ? visibleChangedFields.map(f => {
                            const label = fieldLabelMap[f] || f;
                            return `<span class="inline-block bg-gray-100 text-gray-700 rounded px-2 py-0.5 text-xs mr-1 mb-1">${escape(label)}</span>`;
                        }).join('')
                        : '<span class="text-xs text-gray-500">無可顯示欄位差異</span>';
                    const detailRows = buildDiffRows(beforeData, afterData, visibleChangedFields);
                    const collapseId = `auditCollapse${index}`;
                    const displayUser = getDisplayUserName(log && log.editedBy ? log.editedBy : '');
                    return `
                        <div class="border border-gray-200 rounded-lg p-4 mb-3">
                            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                <div class="text-sm text-gray-700">
                                    <span class="font-semibold">${escape(displayUser)}</span>
                                    <span class="text-gray-500 ml-2">${escape(formatTime(log.editedAt))}</span>
                                </div>
                                <button type="button" onclick="toggleAuditDetail('${collapseId}')" class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded">顯示詳情</button>
                            </div>
                            <div class="mt-2 text-sm">
                                <span class="font-medium text-gray-700">修改原因：</span>
                                <span class="text-gray-800">${escape(log.editReason || '未填寫')}</span>
                            </div>
                            <div class="mt-2">${changedFields}</div>
                            <div id="${collapseId}" class="hidden mt-3 grid grid-cols-1 gap-2">
                                ${detailRows}
                            </div>
                        </div>
                    `;
                }).join('');
            } catch (error) {
                console.error('開啟病歷審核追蹤失敗:', error);
                G.showToast('開啟病歷審核追蹤失敗', 'error');
            }
        }

        export function toggleAuditDetail(elementId) {
            const el = document.getElementById(elementId);
            if (!el) return;
            el.classList.toggle('hidden');
        }

        export function closeConsultationAuditTrail() {
            const modal = document.getElementById('consultationAuditTrailModal');
            if (!modal) return;
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }
        
        // 關閉診症表單
        export async function closeConsultationForm() {
            stopConsultationSymptomsDraftAutosave();
            updateConsultationCancelButtonLabel(false);
            G.setConsultationEditRestrictionState(null, null);
            // 在關閉表單前，如有暫存的套票使用變更且尚未保存，嘗試回復。
            try {
                if (G.pendingPackageChanges && G.pendingPackageChanges.length > 0) {
                    await revertPendingPackageChanges();
                }
            } catch (_e) {
                // 若回復失敗，仍繼續關閉表單
            }
            // 清除暫存的套票購買記錄不需再次調用，已在 revertPendingPackageChanges 處理
            // 隱藏診症表單
            document.getElementById('consultationForm').classList.add('hidden');
            // 如表單關閉時視訊仍在進行中，一併離開診間並還原版面
            try {
                if (typeof window.closeVideoConsultation === 'function') {
                    window.closeVideoConsultation();
                }
            } catch (_e) {
                // 忽略視訊關閉過程的錯誤，避免影響表單關閉流程
            }
            closeConsultationAuditTrail();
            G.closeConsultationMedicalHistoryEditor();
            
            // 清理全域變數
            G.currentConsultingAppointmentId = null;
            G.currentConsultationEditContext = null;
            
            // 清空處方和收費項目選擇
            clearActivePrescriptionItems();
            G.selectedBillingItems = [];

            // 在關閉表單時，確保處方顯示與庫存類型選單狀態同步更新。
            try {
                if (typeof updatePrescriptionDisplay === 'function') {
                    updatePrescriptionDisplay();
                }
            } catch (_e) {
                /* 忽略更新顯示時的錯誤 */
            }
            try {
                if (typeof updatePrescriptionTypeSelectStatus === 'function') {
                    updatePrescriptionTypeSelectStatus();
                }
            } catch (_e) {
                /* 忽略錯誤 */
            }
            
            // 滾動回頂部
            document.getElementById('consultationSystem').scrollIntoView({ behavior: 'smooth' });
        }

        export function prepareConsultationEditView() {
            try {
                const patientHistoryModal = document.getElementById('patientMedicalHistoryModal');
                if (patientHistoryModal) {
                    patientHistoryModal.classList.add('hidden');
                }
                const consultationHistoryModal = document.getElementById('medicalHistoryModal');
                if (consultationHistoryModal) {
                    consultationHistoryModal.classList.add('hidden');
                }
                const medicalRecordDetailModal = document.getElementById('medicalRecordDetailModal');
                if (medicalRecordDetailModal) {
                    medicalRecordDetailModal.classList.add('hidden');
                }
            } catch (_e) {}
            try {
                if (typeof showSection === 'function') {
                    showSection('consultationSystem');
                }
            } catch (_e) {}
        }

        export function scrollConsultationFormIntoView() {
            try {
                const formEl = document.getElementById('consultationForm');
                if (formEl) {
                    formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } catch (_e) {}
        }
        
        // 取消診症
        export async function cancelConsultation() {
            // 顯示讀取圈：嘗試取得觸發按鈕，如果無法從事件取得，則透過查詢尋找具有 cancelConsultation() 的按鈕
            let loadingButton = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    loadingButton = event.currentTarget;
                }
            } catch (_e) {
                // 忽略錯誤
            }
            if (!loadingButton) {
                try {
                    loadingButton = document.querySelector('button[onclick="cancelConsultation()"]');
                } catch (_e) {
                    loadingButton = null;
                }
            }
            if (loadingButton) {
                // 顯示讀取圈，不顯示文字
                G.setButtonLoading(loadingButton, '處理中...');
            }
            try {
                if (!G.currentConsultingAppointmentId) {
                    try {
                        if (G.consultationSymptomsDraftState && G.consultationSymptomsDraftState.key) {
                            clearConsultationSymptomsDraft(G.consultationSymptomsDraftState.key);
                        }
                    } catch (_e) {}
                    closeConsultationForm();
                    return;
                }
                // 使用字串比較 ID，避免數字與字串不一致導致匹配失敗
                const appointment = G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId));
                if (!appointment) {
                    try {
                        if (G.consultationSymptomsDraftState && G.consultationSymptomsDraftState.key) {
                            clearConsultationSymptomsDraft(G.consultationSymptomsDraftState.key);
                        }
                    } catch (_e) {}
                    closeConsultationForm();
                    G.currentConsultingAppointmentId = null;
                    return;
                }
                const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
                if (!patient) {
                    G.showToast('找不到病人資料！', 'error');
                    try {
                        if (G.consultationSymptomsDraftState && G.consultationSymptomsDraftState.key) {
                            clearConsultationSymptomsDraft(G.consultationSymptomsDraftState.key);
                        }
                    } catch (_e) {}
                    closeConsultationForm();
                    G.currentConsultingAppointmentId = null;
                    return;
                }
                // 詳細狀態檢查
                console.log(`取消診症狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}`);
                if (appointment.status === 'consulting') {
                    // 取消診症確認訊息支援中英文
                    const lang5 = localStorage.getItem('lang') || 'zh';
                    const zhMsg5 = `確定要取消 ${patient.name} 的診症嗎？\n\n病人狀態將回到候診中，已填寫的診症內容將會遺失。\n\n注意：此操作無法復原！`;
                    const enMsg5 = `Are you sure you want to cancel the consultation for ${patient.name}?\n\nThe patient's status will return to waiting, and any filled consultation content will be lost.\n\nNote: this action cannot be undone!`;
                    const confirmMsg5 = lang5 === 'en' ? enMsg5 : zhMsg5;
                    const confirmedCancel = await showConfirmation(confirmMsg5, 'warning');
                    if (confirmedCancel) {
                        try {
                            if (G.consultationSymptomsDraftState && G.consultationSymptomsDraftState.key) {
                                clearConsultationSymptomsDraft(G.consultationSymptomsDraftState.key);
                            }
                        } catch (_e) {}
                        // 將狀態改回候診中
                        appointment.status = 'waiting';
                        appointment.arrivedAt = new Date().toISOString();
                        delete appointment.consultationStartTime;
                        delete appointment.consultingDoctor;
                        // 保存狀態變更
                        localStorage.setItem('appointments', JSON.stringify(G.appointments));
                        // 同步更新到 Firebase
                        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
                        // 回復暫存套票變更
                        await revertPendingPackageChanges();
                        {
                            const lang = localStorage.getItem('lang') || 'zh';
                            const msg = lang === 'en'
                                ? `Cancelled ${patient.name}'s consultation and reverted to waiting`
                                : `已取消 ${patient.name} 的診症，病人回到候診狀態`;
                            G.showToast(msg, 'info');
                        }
                        // 關閉表單並清理
                        closeConsultationForm();
                        G.currentConsultingAppointmentId = null;
                        G.loadTodayAppointments();
                    }
                } else if (appointment.status === 'completed') {
                    // 如果是已完成的診症，只是關閉編輯模式
                    await revertPendingPackageChanges();
                    G.showToast('已退出病歷編輯模式', 'info');
                    try {
                        if (G.consultationSymptomsDraftState && G.consultationSymptomsDraftState.key) {
                            clearConsultationSymptomsDraft(G.consultationSymptomsDraftState.key);
                        }
                    } catch (_e) {}
                    closeConsultationForm();
                    G.currentConsultingAppointmentId = null;
                } else {
                    // 其他狀態直接關閉
                    await revertPendingPackageChanges();
                    try {
                        if (G.consultationSymptomsDraftState && G.consultationSymptomsDraftState.key) {
                            clearConsultationSymptomsDraft(G.consultationSymptomsDraftState.key);
                        }
                    } catch (_e) {}
                    closeConsultationForm();
                    G.currentConsultingAppointmentId = null;
                }
            } finally {
                // 移除讀取圈，恢復按鈕
                if (loadingButton) {
                    G.clearButtonLoading(loadingButton);
                }
            }
        }
        
        // 將目前選擇的收費項目正規化並序列化為 billingItemsStructured 字串
export function normalizeBillingItemsToStructured(items) {
    try {
        const normalized = (Array.isArray(items) ? items : [])
            .map(item => {
                // 餘下次數快照：0 為合法值，必須以 Number.isFinite 判斷，避免用 || 把 0 誤判為缺失
                let remainingSnapshot = null;
                const rawRemaining = item && item.remainingUsesAfterUse;
                if (rawRemaining !== undefined && rawRemaining !== null && rawRemaining !== '' && Number.isFinite(Number(rawRemaining))) {
                    remainingSnapshot = Number(rawRemaining);
                }
                return {
                    id: item && item.id !== undefined && item.id !== null ? String(item.id) : '',
                    name: item && item.name ? String(item.name) : '',
                    category: item && item.category ? String(item.category) : 'other',
                    price: Number(item && item.price) || 0,
                    unit: item && item.unit ? String(item.unit) : '',
                    description: item && item.description ? String(item.description) : '',
                    quantity: Math.max(1, parseInt(item && item.quantity, 10) || 1),
                    includedInDiscount: item && item.includedInDiscount === false ? false : true,
                    packageUses: Number(item && item.packageUses) || 0,
                    validityDays: Number(item && item.validityDays) || 0,
                    patientId: item && item.patientId ? String(item.patientId) : '',
                    packageRecordId: item && item.packageRecordId ? String(item.packageRecordId) : '',
                    remainingUsesAfterUse: remainingSnapshot,
                    isHistorical: !!(item && item.isHistorical)
                };
            });
        return JSON.stringify(normalized);
    } catch (_e) {
        return '[]';
    }
}

// 完成病歷、套票購買/使用都已提交後呼叫：
// 強制重新讀取一次病人套票，為「本次新增、尚未有快照」的套票使用項目寫入使用後餘下次數，
// 並回傳最新的 billingItemsStructured 字串；若沒有任何套票使用項目則回傳 null。
// 已帶有快照的項目（先前完成病歷時已固定寫入）一律保留原值，
// 避免編輯舊病歷時被套票後續的其他消費紀錄覆蓋成目前餘額。
// 快照固定寫入病歷後，日後檢視或列印收據直接使用快照，不需每次即時讀取套票，
// 也可避免套票日後被刪除或同名套票比對不穩定導致餘次時顯示時不顯示。
export async function buildBillingItemsStructuredWithPackageSnapshot(patientId) {
    if (!Array.isArray(G.selectedBillingItems)) return null;
    const packageUseItems = G.selectedBillingItems.filter(item =>
        item && (item.category === 'packageUse' || (item.name && String(item.name).includes('使用套票')))
    );
    if (packageUseItems.length === 0) return null;

    // 僅當存在缺少快照的項目時，才需要於提交後重新讀取套票
    const needsRefresh = packageUseItems.some(item => !Number.isFinite(Number(item.remainingUsesAfterUse)));

    let remainingMap = {};
    if (needsRefresh) {
        // 提交完成後強制刷新一次，取得最終（本次使用後）的套票餘次
        let packages = [];
        const pid = (patientId !== undefined && patientId !== null) ? String(patientId) : '';
        if (pid) {
            try {
                packages = await getPatientPackages(pid, true) || [];
            } catch (_e) {
                packages = [];
            }
        }
        packages.forEach(pkg => {
            if (pkg && pkg.id !== undefined && pkg.id !== null && typeof pkg.remainingUses === 'number') {
                remainingMap[String(pkg.id)] = Number(pkg.remainingUses);
            }
        });
    }

    packageUseItems.forEach(item => {
        // 已有歷史快照者保留，不被目前餘額覆蓋
        if (Number.isFinite(Number(item.remainingUsesAfterUse))) return;
        const recordId = item.packageRecordId ? String(item.packageRecordId) : '';
        if (recordId && Object.prototype.hasOwnProperty.call(remainingMap, recordId)) {
            item.remainingUsesAfterUse = remainingMap[recordId];
        } else {
            // 本次新增的使用項目但找不到套票（如刪除或 ID 缺失），維持無快照，交由顯示端名稱後備比對
            item.remainingUsesAfterUse = null;
        }
    });

    return normalizeBillingItemsToStructured(G.selectedBillingItems);
}

        // 儲存診症記錄（醫師操作）
export async function saveConsultation() {
    if (!G.currentConsultingAppointmentId) {
        G.showToast('系統錯誤：找不到診症記錄！', 'error');
        return;
    }
    
    const appointment = G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId))
        || G.currentConsultationEditContext;
    const isEditing = appointment && appointment.status === 'completed' && appointment.consultationId;
    const editAccessScope = isEditing ? G.getMedicalRecordEditAccessScope(null, appointment) : 'full';
    const isBillingOnlyEdit = isEditing && editAccessScope === 'billingOnly';
    const symptoms = document.getElementById('formSymptoms').value.trim();
    const diagnosis = document.getElementById('formDiagnosis').value.trim();
    
    if ((!symptoms || !diagnosis) && !isBillingOnlyEdit) {
        G.showToast('請填寫必填欄位：主訴、中醫診斷！', 'error');
        return;
    }
    const auditReason = (document.getElementById('formAuditReason') && document.getElementById('formAuditReason').value
        ? String(document.getElementById('formAuditReason').value).trim()
        : '');
    if (isEditing && !isBillingOnlyEdit && !auditReason) {
        G.showToast('請填寫病歷修改原因，以符合審核追蹤要求。', 'warning');
        return;
    }
    // 預處理套票購買（僅在非編輯模式下處理，以免重複購買）
    // 不立即呼叫 purchasePackage，而是將欲購買的套票記錄至 pendingPackagePurchases，
    // 等診症記錄成功保存後再一次性購買，以免未完成診症時已經寫入資料庫。
    if (appointment && !isEditing && Array.isArray(G.selectedBillingItems)) {
        try {
            // 初始化暫存購買清單
            G.pendingPackagePurchases = [];
            // 找出所有套票項目
            const packageItems = G.selectedBillingItems.filter(item => item && item.category === 'package');
            // 按購買數量逐一記錄
            for (const item of packageItems) {
                const qty = Math.max(1, Number(item.quantity) || 1);
                for (let i = 0; i < qty; i++) {
                    // 先詢問使用者是否立即使用第一次，但不立即購買
                    // 套票購買成功後詢問是否立即使用第一次（支援中英文）
                    const lang6 = localStorage.getItem('lang') || 'zh';
                    const zhMsg6 = `套票「${item.name}」購買成功！\n\n是否立即使用第一次？\n\n套票詳情：\n• 總次數：${item.packageUses} 次\n• 有效期：${item.validityDays} 天`;
                    const enMsg6 = `Package \"${item.name}\" purchased successfully!\n\nDo you want to use the first session now?\n\nPackage details:\n• Total uses: ${item.packageUses}\n• Valid for: ${item.validityDays} days`;
                    const confirmUse = await showConfirmation(lang6 === 'en' ? enMsg6 : zhMsg6, 'question');
                    // 如使用者選擇立即使用，先在收費列表中加入一個套票使用項目（尚未取得 packageRecordId）
                    let usageItemId = null;
                    if (confirmUse) {
                        usageItemId = `pending-use-${Date.now()}-${Math.random()}`;
                        G.selectedBillingItems.push({
                            id: usageItemId,
                            name: `${item.name} (使用套票)`,
                            category: 'packageUse',
                            price: 0,
                            unit: '次',
                            description: '套票抵扣一次',
                            quantity: 1,
                            includedInDiscount: false,
                            patientId: (appointment.patientId !== undefined && appointment.patientId !== null) ? String(appointment.patientId) : '',
                            packageRecordId: ''
                        });
                    }
                    // 將擬購買項目與使用選擇存入暫存清單，包括對應的暫存使用項目 ID
                    G.pendingPackagePurchases.push({
                        patientId: appointment.patientId,
                        item: item,
                        confirmUse: confirmUse,
                        usageItemId: usageItemId
                    });
                }
            }
            // 更新收費顯示以反映暫存的套票使用
            if (typeof updateBillingDisplay === 'function') {
                updateBillingDisplay();
            }
        } catch (e) {
            console.error('預處理套票購買時發生錯誤：', e);
        }
    }

    // --- 儲值支付預檢查：保存病歷前先驗證扣款是否可行 ---
    // 避免扣款失敗時病歷已標記為 completed 造成狀態不一致
    if (typeof window.preCheckConsultationWalletPayment === 'function') {
        const walletOk = await window.preCheckConsultationWalletPayment();
        if (!walletOk) {
            // 預檢查不通過，中止保存
            return;
        }
    }

    // 在進入 try 區塊之前禁用保存按鈕並顯示讀取中小圈
    // 由於 saveConsultation 函式可能透過 onclick 直接呼叫，
    // 無法保證 event 物件始終存在，故使用通用輔助函式取得按鈕。
    let saveButton = G.getLoadingButtonFromEvent('button[onclick="saveConsultation()"]');
    if (saveButton) {
        // 傳入的文字僅用於語意描述，實際 setButtonLoading 只顯示讀取圈
        G.setButtonLoading(saveButton, '保存中...');
    }
    try {
        // 預留變數以記錄新診症 ID，供後續更新庫存使用
        let newConsultationIdForInventory = null;
        // 確認預先取得的 appointment 是否存在，若不存在則提示錯誤
        if (!appointment) {
            G.showToast('找不到掛號記錄！', 'error');
            return;
        }

        // Assemble consultation data common to both new and edit operations
        const consultationData = {
            appointmentId: appointment && !appointment.isDirectConsultationEdit ? G.currentConsultingAppointmentId : '',
            patientId: appointment.patientId,
            patientName: appointment.patientName,
            symptoms: symptoms,
            tongue: document.getElementById('formTongue').value.trim(),
            pulse: document.getElementById('formPulse').value.trim(),
            // 現病史欄位已整合至主訴輸入區，僅保存於主訴欄位，不再單獨儲存
            currentHistory: '',
            diagnosis: diagnosis,
            syndrome: document.getElementById('formSyndrome').value.trim(),
            acupunctureNotes: (() => {
                const acnEl = document.getElementById('formAcupunctureNotes');
                // 儲存針灸備註使用 innerHTML 以保留方塊格式；
                // 寫入 Firestore 前必須通過白名單淨化（Stored XSS 防護）
                return acnEl ? window.sanitizeAcupunctureNotesHtml(acnEl.innerHTML).trim() : '';
            })(),
            // 穴位結構化名單（由針灸備註的穴位方塊彙整），
            // 供統計解析使用，避免依賴刮 HTML 屬性
            acupointsStructured: (() => {
                try {
                    const acnEl = document.getElementById('formAcupunctureNotes');
                    if (!acnEl) return '[]';
                    const names = Array.from(acnEl.querySelectorAll('span[data-acupoint-name]'))
                        .map(span => (span && span.dataset ? String(span.dataset.acupointName || '').trim() : ''))
                        .filter(Boolean);
                    return JSON.stringify(names);
                } catch (_e) {
                    return '[]';
                }
            })(),
            prescription: document.getElementById('formPrescription').value.trim(),
            // 新增：將處方項目以結構化資料儲存，方便後續編輯，不再依賴解析文字。
            prescriptionStructured: (() => {
                try {
                    const allItems = Array.isArray(G.prescriptions)
                        ? G.prescriptions.flatMap(p => Array.isArray(p.items) ? p.items : [])
                        : [];
                    return JSON.stringify(allItems);
                } catch (_e) {
                    return '[]';
                }
            })(),
            // 多處方完整結構
            multiPrescriptions: (() => {
                try {
                    return JSON.stringify(Array.isArray(G.prescriptions) ? G.prescriptions : []);
                } catch (_e) {
                    return '[]';
                }
            })(),
            usage: document.getElementById('formUsage').value.trim(),
            treatmentCourse: document.getElementById('formTreatmentCourse').value.trim(),
            instructions: document.getElementById('formInstructions').value.trim(),
            followUpDate: document.getElementById('formFollowUpDate').value,
            visitTime: document.getElementById('formVisitTime').value,
            restStartDate: document.getElementById('formRestStartDate').value,
            restEndDate: document.getElementById('formRestEndDate').value,
            billingItems: document.getElementById('formBillingItems').value.trim(),
            // 結構化收費項目（含套票使用項目的 packageRecordId）；
            // 注意：初次診症購買套票並立即使用時，packageRecordId 在保存後才由 commitPendingPackagePurchases 補上，
            // 故保存成功後會再執行一次回存（見 saveConsultation 後段）。
            billingItemsStructured: normalizeBillingItemsToStructured(G.selectedBillingItems),
            // date and doctor fields are assigned below depending on whether this is a new record or an edit
            status: 'completed'
        };
        // 將服藥天數與每日次數存入診症資料，預設 0 代表未設定
        try {
            const totalDays = getTotalMedicationDays();
            consultationData.medicationDays = isNaN(totalDays) ? 0 : totalDays;
            const avgFreq = (() => {
                if (!Array.isArray(G.prescriptions) || G.prescriptions.length === 0) return 0;
                let sum = 0;
                G.prescriptions.forEach(p => { sum += (parseInt(p.freq) || 0); });
                return Math.round(sum / G.prescriptions.length);
            })();
            consultationData.medicationFrequency = avgFreq;
        } catch (_e) {
            consultationData.medicationDays = 0;
            consultationData.medicationFrequency = 0;
        }

        // --- 記錄本次診症所使用的套票變更，方便之後撤回診症時還原 ---
        try {
            const aggregatedChanges = {};
            for (const change of G.pendingPackageChanges) {
                if (!change || !change.patientId || !change.packageRecordId || typeof change.delta !== 'number') continue;
                const key = String(change.patientId) + '||' + String(change.packageRecordId);
                if (!aggregatedChanges[key]) {
                    aggregatedChanges[key] = {
                        patientId: change.patientId,
                        packageRecordId: change.packageRecordId,
                        delta: 0
                    };
                }
                aggregatedChanges[key].delta += change.delta;
            }
            const aggregatedList = Object.values(aggregatedChanges);
            if (aggregatedList.length > 0) {
                consultationData.packageChanges = aggregatedList;
            }
        } catch (agErr) {
            console.error('計算套票變更聚合時發生錯誤:', agErr);
        }

        // Determine whether this is an edit of an existing consultation or a new one
        // isEditing 已在函式開始時定義，這裡直接使用
        let operationSuccess = false;
        if (isEditing) {
            // For editing we preserve the original date and doctor information if available
            // 編輯儲存時強制讀取最新單筆病歷，避免以舊快取作為 beforeData。
            let existing = null;
            const consResult = await window.firebaseDataManager.getConsultationById(String(appointment.consultationId), true);
            if (consResult && consResult.success && consResult.data) {
                existing = consResult.data;
            }
            if (isBillingOnlyEdit && existing) {
                [
                    'symptoms',
                    'tongue',
                    'pulse',
                    'currentHistory',
                    'diagnosis',
                    'syndrome',
                    'acupunctureNotes',
                    'acupointsStructured',
                    'prescription',
                    'prescriptionStructured',
                    'multiPrescriptions',
                    'usage',
                    'treatmentCourse',
                    'instructions',
                    'followUpDate',
                    'visitTime',
                    'restStartDate',
                    'restEndDate',
                    'medicationDays',
                    'medicationFrequency'
                ].forEach((field) => {
                    if (Object.prototype.hasOwnProperty.call(existing, field)) {
                        consultationData[field] = existing[field];
                    }
                });
            }
            consultationData.date = existing && existing.date ? existing.date : new Date();
            consultationData.doctor = existing && existing.doctor ? existing.doctor : G.currentUser;
            consultationData.generalRegistration = G.isGeneralRegistrationAppointment(appointment);
            consultationData.consultingDoctor = existing && existing.consultingDoctor
                ? existing.consultingDoctor
                : String((appointment && appointment.consultingDoctor) || G.currentUser || '');
            consultationData.appointmentId = existing && existing.appointmentId
                ? existing.appointmentId
                : (appointment && !appointment.isDirectConsultationEdit ? G.currentConsultingAppointmentId : '');
            // 若既有病歷未包含診所，則補上目前診所
            try {
                consultationData.clinicId = (existing && existing.clinicId) ? existing.clinicId : (G.currentClinicId || null);
                consultationData.clinicName = (existing && existing.clinicName) ? existing.clinicName : (G.clinicSettings && G.clinicSettings.chineseName ? G.clinicSettings.chineseName : '');
            } catch (_eClinicEdit) {}
            // Update the existing consultation record
            const updateResult = await window.firebaseDataManager.updateConsultation(String(appointment.consultationId), consultationData);
            if (updateResult && updateResult.success) {
                operationSuccess = true;
                const updatedAt = new Date();
                const updatedSnapshot = {
                    ...(existing || {}),
                    ...consultationData,
                    updatedAt,
                    updatedBy: G.currentUser,
                    sortDate: G.getConsultationEffectiveDate({ ...(existing || {}), ...consultationData, updatedAt }, updatedAt) || updatedAt
                };
                try {
                    const auditWriteResult = await window.firebaseDataManager.addConsultationAuditLog({
                        consultationId: String(appointment.consultationId),
                        appointmentId: String((existing && existing.appointmentId) || (appointment && !appointment.isDirectConsultationEdit ? appointment.id : '') || ''),
                        patientId: String(appointment.patientId || ''),
                        patientName: String(appointment.patientName || ''),
                        editedBy: G.currentUser || 'system',
                        editReason: auditReason,
                        beforeData: existing || {},
                        afterData: updatedSnapshot
                    });
                    // 有實質變更才會寫入審核日誌（skipped 代表無欄位變更）；
                    // 同步預熱病歷修改狀態快取，令「已修改」標籤與「審核追蹤」按鈕即時出現
                    if (auditWriteResult && auditWriteResult.success && !auditWriteResult.skipped) {
                        try {
                            if (typeof G.primeMedicalRecordAuditStatus === 'function') {
                                G.primeMedicalRecordAuditStatus(String(appointment.consultationId), true);
                            }
                        } catch (_primeErr) {}
                    }
                } catch (auditErr) {
                    console.error('寫入病歷審核追蹤失敗:', auditErr);
                }
                // Update local cache if present
                const idx = G.consultations.findIndex(c => String(c.id) === String(appointment.consultationId));
                if (idx >= 0) {
                    // Merge the updated fields back into the local consultations array
                    G.consultations[idx] = { ...consultations[idx], ...consultationData, updatedAt: new Date(), updatedBy: G.currentUser };
                }
                // Persist updated consultations to localStorage so that subsequent reads (e.g. printing) use the latest values
                try {
                    localStorage.setItem('consultations', JSON.stringify(G.consultations));
                } catch (_lsErr) {
                    // ignore localStorage write errors
                }
                // Also update FirebaseDataManager's consultations cache if it exists to keep in-memory cache in sync
                try {
                    if (window.firebaseDataManager && Array.isArray(window.firebaseDataManager.consultationsCache)) {
                        const cacheIdx = window.firebaseDataManager.consultationsCache.findIndex(c => String(c.id) === String(appointment.consultationId));
                        if (cacheIdx >= 0) {
                            window.firebaseDataManager.consultationsCache[cacheIdx] = { ...window.firebaseDataManager.consultationsCache[cacheIdx], ...consultationData, updatedAt: new Date(), updatedBy: G.currentUser };
                        }
                    }
                } catch (_cacheErr) {
                    // ignore cache update errors
                }
                // 更新掛號資料中的主訴內容，確保掛號列表顯示最新的主訴
                const linkedAppointment = appointment && !appointment.isDirectConsultationEdit
                    ? appointment
                    : (Array.isArray(G.appointments)
                        ? G.appointments.find(apt => apt && String(apt.consultationId || '') === String(appointment.consultationId))
                        : null);
                if (linkedAppointment) {
                    linkedAppointment.chiefComplaint = symptoms;
                    // 更新本地儲存的 appointments 陣列
                    localStorage.setItem('appointments', JSON.stringify(G.appointments));
                    // 同步更新到 Firebase
                    await window.firebaseDataManager.updateAppointment(String(linkedAppointment.id), linkedAppointment);
                }
                G.showToast('診症記錄已更新！', 'success');
            } else {
                G.showToast('更新診症記錄失敗，請稍後再試', 'error');
            }
        } else {
            // New consultation: assign the current date and doctor
            // 為新的病歷產生一個唯一的病歷編號
            consultationData.medicalRecordNumber = G.generateMedicalRecordNumber();
            consultationData.date = new Date();
            consultationData.doctor = G.isGeneralRegistrationAppointment(appointment) ? G.GENERAL_REGISTRATION_DOCTOR_KEY : G.currentUser;
            consultationData.generalRegistration = G.isGeneralRegistrationAppointment(appointment);
            consultationData.consultingDoctor = String((appointment && appointment.consultingDoctor) || G.currentUser || '');
            // 記錄診所資訊
            try {
                consultationData.clinicId = G.currentClinicId || null;
                consultationData.clinicName = G.clinicSettings && G.clinicSettings.chineseName ? G.clinicSettings.chineseName : '';
            } catch (_eClinic) {}
            const result = await window.firebaseDataManager.addConsultation(consultationData);
            if (result && result.success) {
                operationSuccess = true;
                // Update appointment status and metadata
                appointment.status = 'completed';
                appointment.completedAt = new Date().toISOString();
                appointment.consultationId = result.id;
                appointment.completedBy = G.currentUser;
                // 將本次症狀保存至掛號資料中的主訴，確保掛號列表顯示最新主訴
                appointment.chiefComplaint = symptoms;
                localStorage.setItem('appointments', JSON.stringify(G.appointments));
                await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
                G.showToast('診症記錄已保存！', 'success');
                // 診症完成：批次作廢本次診間的入房 pass 與病人 session（best-effort，
                // 避免連結外洩後於診後被重用；定義於 video/video-consultation.js）
                try {
                    if (window.VideoRoomPass &&
                        typeof window.VideoRoomPass.revokeForAppointment === 'function') {
                        window.VideoRoomPass.revokeForAppointment(String(appointment.id));
                    }
                } catch (_eRoomRevoke) { /* 不作廢失敗不影響診症完成 */ }
                // 記錄新產生的診症 ID 供後續庫存更新
                newConsultationIdForInventory = result.id;

                // 病歷附件歸戶：把本次診症儲存前以 session 暫存的 R2 附件關聯到新病歷 ID
                try {
                    if (window.MedicalAttachments) {
                        let attachmentDate = '';
                        try {
                            const dAttach = consultationData.date instanceof Date
                                ? consultationData.date
                                : new Date(consultationData.date);
                            if (!isNaN(dAttach.getTime())) {
                                attachmentDate = dAttach.getFullYear() + '-' +
                                    String(dAttach.getMonth() + 1).padStart(2, '0') + '-' +
                                    String(dAttach.getDate()).padStart(2, '0');
                            }
                        } catch (_dAttachErr) {}
                        const linkResult = await window.MedicalAttachments.linkVisitUploads({
                            appointmentId: String(appointment.id || ''),
                            patientId: String(appointment.patientId || consultationData.patientId || ''),
                            consultationId: String(result.id || ''),
                            consultationDate: attachmentDate
                        });
                        if (linkResult && linkResult.count > 0) {
                            G.showToast(linkResult.count + ' 個附件已歸檔至本次病歷', 'success');
                        }
                    }
                } catch (attachErr) {
                    // 歸戶失敗不得阻斷診症儲存
                    console.warn('病歷附件歸戶失敗（不影響診症儲存）:', attachErr);
                }

                // 將新增的診症記錄加入本地 consultations 陣列並更新快取
                try {
                    // 組合新的診症記錄物件（含 ID），並合併 consultationData
                    const createdAt = new Date();
                    const updatedAt = new Date();
                    const newRecord = {
                        id: result.id,
                        ...consultationData,
                        createdAt,
                        updatedAt,
                        updatedBy: G.currentUser,
                        sortDate: G.getConsultationEffectiveDate({ ...consultationData, createdAt, updatedAt }, createdAt) || createdAt
                    };
                    // 若 consultations 為陣列則新增至結尾
                    if (Array.isArray(G.consultations)) {
                        G.consultations.push(newRecord);
                    } else {
                        G.consultations = [newRecord];
                    }
                    // 寫入 localStorage
                    try {
                        localStorage.setItem('consultations', JSON.stringify(G.consultations));
                    } catch (_lsErr2) {
                        // 忽略寫入失敗
                    }
                    // 更新 FirebaseDataManager 的 consultationsCache 以保持緩存同步
                    try {
                        if (window.firebaseDataManager && Array.isArray(window.firebaseDataManager.consultationsCache)) {
                            window.firebaseDataManager.consultationsCache.push(newRecord);
                        }
                    } catch (_cacheErr2) {
                        // 忽略快取更新錯誤
                    }
                } catch (_e2) {
                    // 忽略任何新增本地快取時的錯誤
                }
            } else {
                G.showToast('保存診症記錄失敗，請稍後再試', 'error');
            }
        }

        if (operationSuccess) {
            try {
                if (G.consultationSymptomsDraftState && G.consultationSymptomsDraftState.key) {
                    clearConsultationSymptomsDraft(G.consultationSymptomsDraftState.key);
                }
            } catch (_e) {}
            // 保存成功時，先提交暫存的套票購買與使用。
            // 開啟套票聚合合併作用域：購買＋使用可能連動多張套票，
            // 期間所有病人文件的套票聚合更新合併至沖排時一次寫入。
            window.firebaseDataManager.beginPackageAggregateBatching();
            try {
                await commitPendingPackagePurchases();
                // 提交暫存套票購買後，提交本地暫存的套票使用變更至資料庫
                await commitPendingPackageChanges();
            } finally {
                // 每個受影響病人僅重算一次 packageActiveCount/packageRemainingUses
                // （含一次 patientsMeta 通知），消除舊路徑的重複寫入。
                await window.firebaseDataManager.flushPackageAggregateBatching();
            }
            // 提交後清空暫存變更
            G.pendingPackageChanges = [];
            // 套票購買與使用提交完成後，將每個套票使用項目「使用後的餘下次數」快照固定寫入病歷：
            // 1) 初次診症購買並立即使用時，真實 packageRecordId 是在 commit 過程中才寫回，需在此回存；
            // 2) 餘次快照一經寫入，日後檢視病歷或列印收據直接讀取病歷，不需每次即時讀取套票，
            //    也不會因套票日後刪除或同名比對失敗而有時顯示、有時不顯示。
            try {
                const structuredWithSnapshot = await buildBillingItemsStructuredWithPackageSnapshot(
                    appointment && appointment.patientId
                );
                if (structuredWithSnapshot && structuredWithSnapshot !== '[]') {
                    let backfillConsultationId = '';
                    if (!isEditing) {
                        backfillConsultationId = (typeof newConsultationIdForInventory !== 'undefined' && newConsultationIdForInventory)
                            ? String(newConsultationIdForInventory)
                            : (appointment && appointment.consultationId ? String(appointment.consultationId) : '');
                    } else {
                        backfillConsultationId = appointment && appointment.consultationId ? String(appointment.consultationId) : '';
                    }
                    if (backfillConsultationId && structuredWithSnapshot !== consultationData.billingItemsStructured) {
                        // 僅回填套票 packageRecordId／餘次快照，金額欄位完全相同，
                        // 不需重跑財務摘要、SA 統計、病人聚合與 patientsMeta。
                        await window.firebaseDataManager.updateConsultation(backfillConsultationId, {
                            billingItemsStructured: structuredWithSnapshot
                        }, { skipSideEffects: true });
                        // 同步更新本地診症記錄快取，避免本次工作階段讀到舊資料
                        try {
                            if (Array.isArray(G.consultations)) {
                                const localIdx = G.consultations.findIndex(c => c && String(c.id) === backfillConsultationId);
                                if (localIdx >= 0) {
                                    G.consultations[localIdx] = { ...consultations[localIdx], billingItemsStructured: structuredWithSnapshot };
                                    localStorage.setItem('consultations', JSON.stringify(G.consultations));
                                }
                            }
                        } catch (_localErr) {}
                        try {
                            if (window.firebaseDataManager && Array.isArray(window.firebaseDataManager.consultationsCache)) {
                                const cacheIdx = window.firebaseDataManager.consultationsCache.findIndex(c => c && String(c.id) === backfillConsultationId);
                                if (cacheIdx >= 0) {
                                    window.firebaseDataManager.consultationsCache[cacheIdx] = {
                                        ...window.firebaseDataManager.consultationsCache[cacheIdx],
                                        billingItemsStructured: structuredWithSnapshot
                                    };
                                }
                            }
                        } catch (_cacheErr) {}
                    }
                }
            } catch (pkgBackfillErr) {
                console.error('寫入套票餘次快照失敗:', pkgBackfillErr);
            }

            // 儲值餘額支付：病歷（及套票）均已處理完畢後才扣款。
            // 扣款失敗時病歷保留、表單不關閉，由內聯按鈕重試（冪等鍵防重複扣款）。
            const walletConsultationId = isEditing
                ? String(appointment.consultationId)
                : (newConsultationIdForInventory ? String(newConsultationIdForInventory) : '');
            let walletPaymentOk = true;
            try {
                walletPaymentOk = await window.processConsultationWalletPayment({
                    patientId: String(appointment.patientId || ''),
                    consultationId: walletConsultationId
                });
            } catch (_wpErr) {
                walletPaymentOk = false;
            }
            if (!walletPaymentOk) {
                return;
            }

            // 更新中藥庫存
            if (G.isClinicHerbInventoryEnabled()) {
                try {
                    // 決定要使用的診症 ID
                    let consultationIdForInv = null;
                    if (isEditing) {
                        consultationIdForInv = appointment && appointment.consultationId;
                    } else {
                        consultationIdForInv = typeof newConsultationIdForInventory !== 'undefined' ? newConsultationIdForInventory : null;
                    }
                    // 讀取先前消耗紀錄（僅編輯模式）
                    let prevLog = null;
                    if (isEditing && consultationIdForInv) {
                        try {
                            const logSnap = await window.firebase.get(window.firebase.ref(window.firebase.rtdb, 'inventoryLogs/' + String(consultationIdForInv)));
                            if (logSnap && logSnap.exists()) {
                                prevLog = logSnap.val();
                            }
                        } catch (_err) {
                            prevLog = null;
                        }
                        if (!prevLog) {
                            try {
                                const ls = localStorage.getItem('inventoryLogs');
                                if (ls) {
                                    const obj = JSON.parse(ls);
                                    prevLog = obj[String(consultationIdForInv)] || null;
                                }
                            } catch (_e) {}
                        }
                        if (!prevLog && typeof G.getPreviousInventoryLogFromHistory === 'function') {
                            try { prevLog = await G.getPreviousInventoryLogFromHistory(consultationIdForInv); } catch (_e) {}
                        }
                    }
                    if (consultationIdForInv && typeof G.updateInventoryAfterConsultationMulti === 'function') {
                        await G.updateInventoryAfterConsultationMulti(
                            consultationIdForInv,
                            Array.isArray(G.prescriptions) ? G.prescriptions : [],
                            isEditing,
                            prevLog
                        );
                    }
                } catch (invErr) {
                    console.error('更新中藥庫存資料失敗:', invErr);
                }
            }
            // 完成後關閉診症表單並更新 UI
            closeConsultationForm();
            G.loadTodayAppointments();
            G.updateStatistics();
            clearAllSearchFields();
        }

    } catch (error) {
        console.error('保存診症記錄錯誤:', error);
        G.showToast('保存時發生錯誤', 'error');
    } finally {
        // 恢復按鈕狀態與內容。使用前面取得的 saveButton 以避免重複查找。
        if (saveButton) {
            G.clearButtonLoading(saveButton);
        }
    }
}
