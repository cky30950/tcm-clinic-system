/* ============================================================
 * consultation/access.js — 權限／身分 meta 純函式：綜合掛號判定、
 * 醫生可視／可編輯範圍、病歷編輯限制、症狀摘要（Phase 6 子批 D3）。
 * 唯讀狀態經 G；parseConsultationDate 走 window facade。
 ============================================================ */
import { G } from '../../lib/legacy.js';

export function isGeneralRegistrationDoctorValue(value) {
    return String(value || '').trim() === G.GENERAL_REGISTRATION_DOCTOR_KEY;
}

export function isGeneralRegistrationAppointment(appointment = null) {
    if (!appointment || typeof appointment !== 'object') return false;
    return !!appointment.isGeneralRegistration || isGeneralRegistrationDoctorValue(appointment.appointmentDoctor);
}

export function isGeneralRegistrationConsultation(consultation = null) {
    if (!consultation || typeof consultation !== 'object') return false;
    return !!consultation.generalRegistration || isGeneralRegistrationDoctorValue(consultation.doctor);
}

export function isGeneralRegistrationContext(consultation = null, appointment = null) {
    return isGeneralRegistrationConsultation(consultation) || isGeneralRegistrationAppointment(appointment);
}

export function shouldHideGeneralRegistrationDoctorInfo(consultation = null, appointment = null) {
    return isGeneralRegistrationContext(consultation, appointment);
}

export function getGeneralRegistrationSourceLabel(isEn = false) {
    return isEn ? 'General Registration' : G.GENERAL_REGISTRATION_LABEL;
}

/**
 * 判斷診症完成後是否有開藥（處方內容）。
 * 舊式純文字處方內容非空，或多處方結構中任一區塊含有藥材項目，皆視為有開藥；
 * 僅有服用方法（usage）而無處方內容時，視為沒有開藥。
 * @param {object|null|undefined} consultation 診症記錄
 * @returns {boolean} 有開藥回傳 true；沒有開藥回傳 false
 */
export function consultationHasPrescription(consultation = null) {
    if (!consultation || typeof consultation !== 'object') return false;
    if (String(consultation.prescription || '').trim()) {
        return true;
    }
    const raw = consultation.multiPrescriptions;
    if (raw) {
        try {
            const sections = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(sections) && sections.some(section =>
                Array.isArray(section && section.items) && section.items.length > 0
            )) {
                return true;
            }
        } catch (_e) {
            /* 多處方資料解析失敗時，視為沒有開藥 */
        }
    }
    return false;
}

export function canCurrentUserAccessGeneralRegistration(consultation = null, appointment = null) {
    if (!isGeneralRegistrationContext(consultation, appointment)) {
        return true;
    }
    const position = G.currentUserData && G.currentUserData.position ? String(G.currentUserData.position).trim() : '';
    return position === '診所管理' || position === '護理師';
}

export function canCurrentUserViewGeneralRegistration(consultation = null, appointment = null) {
    if (!isGeneralRegistrationContext(consultation, appointment)) {
        return true;
    }
    const position = G.currentUserData && G.currentUserData.position ? String(G.currentUserData.position).trim() : '';
    return position === '診所管理' || position === '護理師' || position === '醫師';
}

export function canCurrentUserViewConsultationEntry(consultation = null) {
    return canCurrentUserViewGeneralRegistration(consultation, null);
}

export function getAppointmentResponsibleDoctorUsername(appointment = null) {
    if (!appointment || typeof appointment !== 'object') return '';
    if (appointment.consultingDoctor) {
        return String(appointment.consultingDoctor).trim();
    }
    if (isGeneralRegistrationAppointment(appointment)) {
        return '';
    }
    return String(appointment.appointmentDoctor || '').trim();
}

export function canDoctorViewAppointment(appointment = null, doctorUsername = '') {
    const normalizedDoctorUsername = String(doctorUsername || '').trim();
    if (!normalizedDoctorUsername || !appointment) return false;
    if (isGeneralRegistrationAppointment(appointment)) return false;
    return String(appointment.appointmentDoctor || '').trim() === normalizedDoctorUsername;
}

export function getRegistrationDoctorMeta(doctorValue) {
    if (isGeneralRegistrationDoctorValue(doctorValue)) {
        return {
            isGeneralRegistration: true,
            username: G.GENERAL_REGISTRATION_DOCTOR_KEY,
            displayName: G.GENERAL_REGISTRATION_LABEL,
            registrationNumber: null,
            user: null
        };
    }

    const doctorUser = G.users.find(user =>
        user &&
        user.username === doctorValue &&
        user.active &&
        user.position === '醫師'
    );

    return {
        isGeneralRegistration: false,
        username: doctorUser ? doctorUser.username : String(doctorValue || '').trim(),
        displayName: doctorUser ? doctorUser.name : String(doctorValue || '').trim(),
        registrationNumber: doctorUser ? (doctorUser.registrationNumber || null) : null,
        user: doctorUser || null
    };
}

export function getConsultationDoctorUsername(consultation = null, appointment = null) {
    if (appointment && isGeneralRegistrationAppointment(appointment)) {
        return String(appointment.consultingDoctor || '').trim();
    }
    if (appointment && appointment.appointmentDoctor) {
        return String(appointment.appointmentDoctor).trim();
    }
    const doctorValue = consultation && consultation.doctor ? consultation.doctor : null;
    if (!doctorValue) return '';
    if (isGeneralRegistrationConsultation(consultation)) {
        return String(consultation.consultingDoctor || '').trim();
    }
    if (typeof doctorValue === 'string') {
        return doctorValue.trim();
    }
    if (typeof doctorValue === 'object') {
        return String(
            doctorValue.username ||
            doctorValue.email ||
            doctorValue.name ||
            doctorValue.displayName ||
            doctorValue.fullName ||
            ''
        ).trim();
    }
    return '';
}

export function canCurrentUserEditMedicalRecordEntry(consultation = null, appointment = null) {
    const isAdminUser = G.currentUserData && G.currentUserData.position === '診所管理';
    const isNurseUser = G.currentUserData && G.currentUserData.position === '護理師';
    if (isGeneralRegistrationContext(consultation, appointment)) {
        return !!(isAdminUser || isNurseUser);
    }
    const doctorUsername = getConsultationDoctorUsername(consultation, appointment);
    const isDoctorOwner = G.currentUserData &&
        G.currentUserData.position === '醫師' &&
        doctorUsername &&
        G.currentUserData.username === doctorUsername;
    return !!(isAdminUser || isDoctorOwner || isNurseUser);
}

export function getMedicalRecordEditAccessScope(consultation = null, appointment = null) {
    if (!G.currentUserData || !G.currentUserData.position) return 'none';
    if (isGeneralRegistrationContext(consultation, appointment)) {
        return canCurrentUserAccessGeneralRegistration(consultation, appointment) ? 'full' : 'none';
    }
    if (G.currentUserData.position === '診所管理') return 'full';
    if (G.currentUserData.position === '護理師') return 'billingOnly';

    const doctorUsername = getConsultationDoctorUsername(consultation, appointment);
    const isDoctorOwner = G.currentUserData.position === '醫師' &&
        doctorUsername &&
        G.currentUserData.username === doctorUsername;
    return isDoctorOwner ? 'full' : 'none';
}

export function getMedicalRecordEditButtonLabel(consultation = null, appointment = null) {
    return getMedicalRecordEditAccessScope(consultation, appointment) === 'billingOnly'
        ? '修改收費'
        : '修改病歷';
}

const CONSULTATION_BILLING_ONLY_LOCKED_SECTION_IDS = [
    'consultationLockedClinicalSection',
    'consultationLockedPrescriptionSection',
    'consultationLockedUsageSection',
    'consultationLockedTreatmentCourseSection',
    'consultationLockedInstructionsSection',
    'consultationLockedScheduleSection'
];

export function setConsultationEditRestrictionState(appointment = null, consultation = null) {
    const isEditing = !!(
        (appointment && appointment.status === 'completed' && appointment.consultationId) ||
        (consultation && consultation.id)
    );
    const billingOnly = isEditing && getMedicalRecordEditAccessScope(consultation, appointment) === 'billingOnly';
    const noticeEl = document.getElementById('consultationEditRestrictionNotice');
    const restrictionHint = '護理師編輯模式：只可修改收費項目及套票，其他病歷欄位已鎖定並反白顯示。';
    const reasonContainer = document.getElementById('auditReasonContainer');
    const reasonEl = document.getElementById('formAuditReason');

    if (noticeEl) {
        noticeEl.textContent = '';
        noticeEl.classList.add('hidden');
    }

    if (reasonContainer) {
        if (isEditing && !billingOnly) {
            reasonContainer.classList.remove('hidden');
        } else {
            reasonContainer.classList.add('hidden');
        }
    }
    if (reasonEl && billingOnly) {
        reasonEl.value = '';
    }

    CONSULTATION_BILLING_ONLY_LOCKED_SECTION_IDS.forEach((sectionId) => {
        const sectionEl = document.getElementById(sectionId);
        if (!sectionEl) return;

        sectionEl.classList.toggle('rounded-xl', billingOnly);
        sectionEl.classList.toggle('border', billingOnly);
        sectionEl.classList.toggle('border-amber-200', billingOnly);
        sectionEl.classList.toggle('bg-amber-50', billingOnly);
        sectionEl.classList.toggle('p-3', billingOnly);
        if (billingOnly) {
            sectionEl.setAttribute('title', restrictionHint);
        } else {
            sectionEl.removeAttribute('title');
        }

        const interactiveEls = sectionEl.querySelectorAll('input, textarea, button, select, [contenteditable]');
        interactiveEls.forEach((el) => {
            const tagName = (el.tagName || '').toUpperCase();
            const inputType = String(el.getAttribute('type') || '').toLowerCase();

            if (el.dataset.originalDisabled === undefined && 'disabled' in el) {
                el.dataset.originalDisabled = el.disabled ? 'true' : 'false';
            }
            if (el.dataset.originalReadonly === undefined && 'readOnly' in el) {
                el.dataset.originalReadonly = el.readOnly ? 'true' : 'false';
            }
            if (el.hasAttribute('contenteditable') && el.dataset.originalContenteditable === undefined) {
                el.dataset.originalContenteditable = el.getAttribute('contenteditable') || 'true';
            }

            if (billingOnly) {
                if (tagName === 'BUTTON' || tagName === 'SELECT' || ['date', 'datetime-local', 'number', 'checkbox', 'radio'].includes(inputType)) {
                    if ('disabled' in el) el.disabled = true;
                } else if ('readOnly' in el) {
                    el.readOnly = true;
                }
                if (el.hasAttribute('contenteditable')) {
                    el.setAttribute('contenteditable', 'false');
                }
            } else {
                if ('disabled' in el) {
                    el.disabled = el.dataset.originalDisabled === 'true';
                }
                if ('readOnly' in el) {
                    el.readOnly = el.dataset.originalReadonly === 'true';
                }
                if (el.hasAttribute('contenteditable')) {
                    el.setAttribute('contenteditable', el.dataset.originalContenteditable || 'true');
                }
            }

            el.classList.toggle('bg-amber-100', billingOnly && (tagName === 'INPUT' || tagName === 'TEXTAREA' || el.hasAttribute('contenteditable')));
            el.classList.toggle('border-amber-300', billingOnly && (tagName === 'INPUT' || tagName === 'TEXTAREA' || el.hasAttribute('contenteditable')));
            el.classList.toggle('text-amber-900', billingOnly && (tagName === 'INPUT' || tagName === 'TEXTAREA' || el.hasAttribute('contenteditable')));
            el.classList.toggle('cursor-not-allowed', billingOnly);
        });
    });
}

export function isMedicalRecordInCurrentClinic(consultation = null, appointment = null) {
    const activeClinicId = (() => {
        try {
            return localStorage.getItem('currentClinicId') || (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : '');
        } catch (_e) {
            return (typeof G.currentClinicId !== 'undefined' ? G.currentClinicId : '') || '';
        }
    })();

    if (!activeClinicId || activeClinicId === 'local-default') {
        return true;
    }

    const recordClinicId = consultation && consultation.clinicId
        ? String(consultation.clinicId)
        : (appointment && appointment.clinicId ? String(appointment.clinicId) : '');
    if (recordClinicId) {
        return String(recordClinicId) === String(activeClinicId);
    }

    const recordClinicName = (
        (consultation && consultation.clinicName) ||
        (appointment && appointment.clinicName) ||
        ''
    ).trim().toLowerCase();
    if (!recordClinicName) {
        return true;
    }

    const currentClinic = Array.isArray(G.clinicsList)
        ? G.clinicsList.find(c => c && String(c.id) === String(activeClinicId))
        : null;
    const currentClinicNames = [
        currentClinic && currentClinic.chineseName ? String(currentClinic.chineseName).trim().toLowerCase() : '',
        currentClinic && currentClinic.englishName ? String(currentClinic.englishName).trim().toLowerCase() : '',
        G.clinicSettings && G.clinicSettings.chineseName ? String(G.clinicSettings.chineseName).trim().toLowerCase() : '',
        G.clinicSettings && G.clinicSettings.englishName ? String(G.clinicSettings.englishName).trim().toLowerCase() : ''
    ].filter(Boolean);

    return currentClinicNames.includes(recordClinicName);
}

export function getMedicalRecordEditWindowStatus(consultation = null, appointment = null) {
    if (!isMedicalRecordInCurrentClinic(consultation, appointment)) {
        return {
            allowed: false,
            deadline: null,
            reason: '不可在不同診所修改病歷'
        };
    }

    const baseRaw = (consultation && (consultation.date || consultation.createdAt)) ||
        (appointment && (appointment.completedAt || appointment.appointmentTime)) ||
        (consultation && consultation.updatedAt) ||
        null;
    const baseDate = parseConsultationDate(baseRaw);
    if (!baseDate || isNaN(baseDate.getTime())) {
        return {
            allowed: false,
            deadline: null,
            reason: '找不到病歷完成時間，無法修改'
        };
    }
    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + 7);
    deadline.setHours(23, 59, 59, 999);
    if (Date.now() > deadline.getTime()) {
        return {
            allowed: false,
            deadline,
            reason: `病歷只可於完成後一周內修改，已超過期限（截止：${deadline.toLocaleString('zh-TW', { hour12: false })}）`
        };
    }
    return {
        allowed: true,
        deadline,
        reason: ''
    };
}

export function buildDirectConsultationEditContext(consultation) {
    const consultationId = consultation && consultation.id ? String(consultation.id) : '';
    const patientId = consultation && consultation.patientId ? String(consultation.patientId) : '';
    return {
        id: `history-edit:${consultationId}`,
        patientId,
        patientName: consultation && consultation.patientName ? String(consultation.patientName) : '',
        appointmentTime: (() => {
            const parsed = parseConsultationDate(consultation && (consultation.date || consultation.createdAt || consultation.updatedAt));
            return parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
        })(),
        status: 'completed',
        consultationId,
        appointmentDoctor: getConsultationDoctorUsername(consultation, null),
        isDirectConsultationEdit: true
    };
}


export function getMainSymptomFromResult(results) {
    if (!results) return '';
    
    const bodyPartNames = {
        head: '頭部',
        neck: '頸部',
        chest: '胸部',
        abdomen: '腹部',
        back: '背部',
        arms: '手臂',
        legs: '腿部',
        joints: '關節',
        skin: '皮膚',
        internal: '內科症狀',
        gynecology: '婦科',
        andrology: '男科',
        other: '其他'
    };
    
    
    const detailedLocationNames = {
        
        forehead: '前額',
        temples: '太陽穴',
        top_head: '頭頂',
        back_head: '後腦勺',
        eyes: '眼部',
        nose: '鼻部',
        ears: '耳部',
        mouth: '口部',
        jaw: '下顎',
        whole_head: '整個頭部',
        
        front_neck: '前頸',
        back_neck: '後頸',
        side_neck: '側頸',
        throat: '喉嚨',
        whole_neck: '整個頸部',
        
        upper_chest: '上胸部',
        lower_chest: '下胸部',
        left_chest: '左胸',
        right_chest: '右胸',
        heart_area: '心臟部位',
        ribs: '肋骨',
        whole_chest: '整個胸部',
        
        upper_abdomen: '上腹部',
        lower_abdomen: '下腹部',
        left_abdomen: '左腹部',
        right_abdomen: '右腹部',
        navel: '肚臍周圍',
        stomach: '胃部',
        liver_area: '肝區',
        whole_abdomen: '整個腹部',
        
        upper_back: '上背部',
        middle_back: '中背部',
        lower_back: '下背部/腰部',
        left_back: '左背',
        right_back: '右背',
        spine: '脊椎',
        shoulder_blade: '肩胛骨',
        whole_back: '整個背部',
        
        shoulders: '肩膀',
        upper_arms: '上臂',
        elbows: '手肘',
        forearms: '前臂',
        wrists: '手腕',
        hands: '手掌',
        fingers: '手指',
        left_arm: '左手臂',
        right_arm: '右手臂',
        both_arms: '雙手臂',
        
        hips: '臀部',
        thighs: '大腿',
        knees: '膝蓋',
        calves: '小腿',
        ankles: '腳踝',
        feet: '腳掌',
        toes: '腳趾',
        left_leg: '左腿',
        right_leg: '右腿',
        both_legs: '雙腿',
        
        shoulder_joint: '肩關節',
        elbow_joint: '肘關節',
        wrist_joint: '腕關節',
        hip_joint: '髖關節',
        knee_joint: '膝關節',
        ankle_joint: '踝關節',
        spine_joint: '脊椎關節',
        multiple_joints: '多個關節',
        
        face_skin: '面部皮膚',
        body_skin: '身體皮膚',
        hands_skin: '手部皮膚',
        feet_skin: '足部皮膚',
        scalp: '頭皮',
        widespread_skin: '全身皮膚',
        
        breathing: '呼吸系統',
        digestion: '消化系統',
        circulation: '循環系統',
        nervous: '神經系統',
        urinary: '泌尿系統',
        reproductive: '生殖系統',
        general_weakness: '全身無力',
        fever: '發熱',
        
        menstrual_issues: '月經問題',
        vaginal_discharge: '白帶異常',
        pelvic_pain: '骨盆腔疼痛',
        breast_issues: '乳房問題',
        menopause_symptoms: '更年期症狀',
        fertility_issues: '生育相關',
        urinary_gyneco: '泌尿婦科',
        postpartum_issues: '產後問題',
        
        erectile_dysfunction: '勃起功能',
        prostate_issues: '前列腺問題',
        urinary_male: '泌尿問題',
        testicular_pain: '睪丸疼痛',
        fertility_male: '生育能力',
        hormonal_male: '荷爾蒙問題',
        sexual_function: '性功能障礙',
        genital_issues: '生殖器問題',
        
        multiple_areas: '多個部位',
        unclear_location: '位置不明確',
        whole_body: '全身',
        other_specify: '其他（請在補充描述中說明）'
    };
    
    let symptom = bodyPartNames[results.bodyPart] || (results.bodyPart || '未指定部位');
    
    if (results.detailedLocation) {
        const locKey = results.detailedLocation;
        const locName = detailedLocationNames[locKey] || results.detailedLocation;
        symptom += ' - ' + locName;
    }
    
    let related = results.relatedSymptoms;
    if (related) {
        if (!Array.isArray(related)) {
            related = [related];
        }
        
        const uniqueRelated = Array.from(new Set(related));
        if (uniqueRelated.length > 0) {
            symptom += '：' + uniqueRelated.slice(0, 3).join('、');
        }
    }
    return symptom;
}


export function generateSymptomSummaryFromInquiry(data) {
    if (!data) return '';
    
    let summary = getMainSymptomFromResult(data) || '';
    const parts = [];
    
    if (data.additionalSymptoms && typeof data.additionalSymptoms === 'string' && data.additionalSymptoms.trim()) {
        
        parts.push('補充描述：' + data.additionalSymptoms.trim());
    }
    
    if (data.relatedSymptoms) {
        let relatedList = [];
        if (Array.isArray(data.relatedSymptoms)) {
            relatedList = data.relatedSymptoms;
        } else if (typeof data.relatedSymptoms === 'string') {
            relatedList = [data.relatedSymptoms];
        }
        if (relatedList.length > 0) {
            
            const uniqueRelated = Array.from(new Set(relatedList));
            
            const remaining = uniqueRelated.slice(3);
            if (remaining.length > 0) {
                
                parts.push('相關症狀：' + remaining.join('、'));
            }
        }
    }
    if (parts.length > 0) {
        if (summary) {
            summary += '；' + parts.join('；');
        } else {
            summary = parts.join('；');
        }
    }
    return summary;
}


export function generateHistorySummaryFromInquiry(data) {
    if (!data) return '';
    function getValue(key) {
        const value = data[key];
        if (value === undefined || value === null) return '';
        if (Array.isArray(value)) {
            const normalized = value.map(item => String(item).trim()).filter(Boolean);
            return normalized.length ? normalized.join('、') : '';
        }
        const normalized = String(value).trim();
        return (!normalized || normalized === '無') ? '' : normalized;
    }

    const parts = [];
    const pushPart = (text) => {
        const normalized = String(text || '').trim();
        if (normalized) {
            parts.push(normalized);
        }
    };

    pushPart(getValue('sweating') ? `汗出${getValue('sweating')}` : '');
    pushPart(getValue('出汗部位') ? `汗位${getValue('出汗部位')}` : '');
    pushPart(getValue('temperature') ? `寒熱${getValue('temperature')}` : '');
    pushPart(getValue('coldHands') ? `四肢${getValue('coldHands')}` : '');
    pushPart(getValue('appetite') ? `納${getValue('appetite')}` : '');
    pushPart(getValue('appetiteSymptoms'));
    pushPart(getValue('foodPreference') ? `嗜${getValue('foodPreference')}` : '');
    pushPart(getValue('drinkingPreference') ? `飲水${getValue('drinkingPreference')}` : '');
    pushPart(getValue('drinkingHabits'));
    pushPart(getValue('urination') ? `小便${getValue('urination')}` : '');
    pushPart(getValue('nightUrination') ? `夜尿${getValue('nightUrination')}` : '');
    pushPart(getValue('dailyUrination') ? `日尿${getValue('dailyUrination')}` : '');
    pushPart(getValue('urineColor') ? `尿色${getValue('urineColor')}` : '');
    pushPart(getValue('stoolForm') ? `大便${getValue('stoolForm')}` : '');
    pushPart(getValue('stoolSymptoms'));
    pushPart(getValue('stoolFrequency') ? `便次${getValue('stoolFrequency')}` : '');
    pushPart(getValue('stoolOdor') ? `便味${getValue('stoolOdor')}` : '');
    pushPart(getValue('stoolColor') ? `便色${getValue('stoolColor')}` : '');
    pushPart(getValue('sleepQuality') ? `眠${getValue('sleepQuality')}` : '');
    pushPart(getValue('sleep') ? `睡眠${getValue('sleep')}` : '');
    pushPart(getValue('energy') ? `精神${getValue('energy')}` : '');
    pushPart(getValue('morningEnergy') ? `晨起${getValue('morningEnergy')}` : '');
    pushPart(getValue('concentration') ? `注意力${getValue('concentration')}` : '');

    if (!parts.length) return '';
    return '預診現病史：' + parts.join('，') + '。';
}


export async function loadInquiryOptions(patient) {
    const select = document.getElementById('inquirySelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">不使用問診資料</option>';
    try {
        
        const userLoggedIn = (window.firebase && window.firebase.auth && window.firebase.auth.currentUser) ||
                             (typeof G.currentUserData !== 'undefined' && G.currentUserData);
        if (userLoggedIn && window.firebaseDataManager && window.firebaseDataManager.clearOldInquiries) {
            await window.firebaseDataManager.clearOldInquiries();
        }
    } catch (err) {
        console.error('清除過期問診資料時發生錯誤:', err);
    }
    try {
        
        let result;
        try {
            result = await window.firebaseDataManager.getInquiryRecords('');
        } catch (e) {
            console.error('讀取全部問診資料失敗，嘗試使用病人名稱查詢:', e);
            const nameForSearch = patient && patient.name ? String(patient.name).trim() : '';
            result = await window.firebaseDataManager.getInquiryRecords(nameForSearch);
        }
        G.inquiryOptionsData = {};
        if (result && result.success && Array.isArray(result.data)) {
            result.data.forEach(rec => {
                
                let createdAt = rec.createdAt;
                let dateStr = '';
                if (createdAt && createdAt.seconds !== undefined) {
                    const ts = new Date(createdAt.seconds * 1000);
                    dateStr = ts.toLocaleString('zh-TW', { hour12: false });
                } else if (createdAt) {
                    try {
                        dateStr = new Date(createdAt).toLocaleString('zh-TW', { hour12: false });
                    } catch (_e) {
                        dateStr = '';
                    }
                }
                const opt = document.createElement('option');
                opt.value = rec.id;
                
                const patientName = rec.patientName || '';
                if (dateStr) {
                    opt.textContent = `${dateStr} ${patientName} 問診資料`;
                } else {
                    opt.textContent = `${patientName} 問診資料 (${rec.id})`;
                }
                select.appendChild(opt);
                G.inquiryOptionsData[rec.id] = rec;
            });
        }
    } catch (error) {
        console.error('讀取問診資料錯誤:', error);
    }
}

        
        export function canModifyPackageItems() {
            try {
                
                if (Array.isArray(G.appointments) && G.currentConsultingAppointmentId !== null && G.currentConsultingAppointmentId !== undefined) {
                    const appt = G.appointments.find(ap => ap && String(ap.id) === String(G.currentConsultingAppointmentId));
                    
                    if (appt && appt.status === 'completed') {
                        return getMedicalRecordEditAccessScope(null, appt) === 'billingOnly';
                    }
                }
            } catch (e) {
                
            }
            return true;
        }
