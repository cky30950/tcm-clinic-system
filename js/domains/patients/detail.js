/* ============================================================
 * patients/detail.js — 病人詳情彈窗（Phase 4 第二批・子批 B）
 * ------------------------------------------------------------
 * viewPatient：載入病人、渲染基本資料／醫療資訊／診症摘要容器。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { getPatientByIdWithRefresh } from './store.js';

export async function viewPatient(id) {
    try {
        
        
        const patient = await getPatientByIdWithRefresh(id);
        if (!patient) {
            
            G.showToast('找不到病人資料', 'error');
            return;
        }

        
        
        
        let content = '';
        const safePatientNumber = window.escapeHtml(patient.patientNumber || '未設定');
        const safeName = window.escapeHtml(patient.name);
        const safeAge = window.escapeHtml(G.formatAge(patient.birthDate));
        const safeGender = window.escapeHtml(patient.gender);
        const safePhone = window.escapeHtml(patient.phone);
        const safeEmergencyContactName = patient.emergencyContactName ? window.escapeHtml(patient.emergencyContactName) : null;
        const safeEmergencyContactPhone = patient.emergencyContactPhone ? window.escapeHtml(patient.emergencyContactPhone) : null;
        const safeIdCard = patient.idCard ? window.escapeHtml(patient.idCard) : null;
        const safeAddress = patient.address ? window.escapeHtml(patient.address) : null;
        const safeHistory = patient.history ? window.escapeHtml(patient.history) : null;
        const safeAllergies = patient.allergies ? window.escapeHtml(patient.allergies) : null;
        const birthDateString = patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('zh-TW') : '';
        
        const createdAtStr = patient.createdAt ? (() => {
            const d = new Date(patient.createdAt.seconds * 1000);
            return d.toLocaleString('zh-TW', { hour12: false });
        })() : '未知';
        const updatedAtStr = patient.updatedAt ? (() => {
            const d = new Date(patient.updatedAt.seconds * 1000);
            return d.toLocaleString('zh-TW', { hour12: false });
        })() : '';
        
        
        let packageStatusHtml = '';

        
        const _t = typeof G.t === 'function' ? G.t : (str) => str;
        
        const lblBasicInfo = _t('基本資料');
        const lblMedicalInfo = _t('醫療資訊');
        const lblPatientNumber = _t('病人編號：');
        const lblName = _t('姓名：');
        const lblAge = _t('年齡：');
        const lblGender = _t('性別：');
        const lblPhone = _t('電話：');
        const lblEmergencyContactName = _t('緊急聯絡人姓名：');
        const lblEmergencyContactPhone = _t('緊急聯絡人電話：');
        const lblIdCard = _t('身分證：');
        const lblBirthDate = _t('出生日期：');
        const lblAddress = _t('地址：');
        const lblHistoryAndNotes = _t('病史及備註：');
        const lblAllergies = _t('過敏史：');
        const lblCreatedAt = _t('建檔日期：');
        const lblUpdatedAt = _t('更新日期：');
        const lblConsultationSummary = _t('診症記錄摘要');
        const lblLoadingConsultations = _t('載入診症記錄中...');

        
        content = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
                <h4 class="text-lg font-semibold text-gray-800 border-b pb-2">${lblBasicInfo}</h4>
                <div class="space-y-2">
                    <div><span class="font-medium">${lblPatientNumber}</span><span class="text-blue-600 font-semibold">${safePatientNumber}</span></div>
                    <div><span class="font-medium">${lblName}</span>${safeName}</div>
                    <div><span class="font-medium">${lblAge}</span>${safeAge}</div>
                    <div><span class="font-medium">${lblGender}</span>${safeGender}</div>
                    <div><span class="font-medium">${lblPhone}</span>${safePhone}</div>
                    ${safeEmergencyContactName ? `<div><span class="font-medium">${lblEmergencyContactName}</span>${safeEmergencyContactName}</div>` : ''}
                    ${safeEmergencyContactPhone ? `<div><span class="font-medium">${lblEmergencyContactPhone}</span>${safeEmergencyContactPhone}</div>` : ''}
                    ${safeIdCard ? `<div><span class="font-medium">${lblIdCard}</span>${safeIdCard}</div>` : ''}
                    ${birthDateString ? `<div><span class="font-medium">${lblBirthDate}</span>${birthDateString}</div>` : ''}
                    ${safeAddress ? `<div><span class="font-medium">${lblAddress}</span>${safeAddress}</div>` : ''}
                </div>
            </div>

            <div class="space-y-4">
                <h4 class="text-lg font-semibold text-gray-800 border-b pb-2">${lblMedicalInfo}</h4>
                <div class="space-y-2">
                    ${safeHistory ? `<div><span class="font-medium">${lblHistoryAndNotes}</span><div class="mt-1 p-2 bg-gray-50 rounded text-sm medical-field">${safeHistory}</div></div>` : ''}
                    ${safeAllergies ? `<div><span class="font-medium">${lblAllergies}</span><div class="mt-1 p-2 bg-red-50 rounded text-sm medical-field">${safeAllergies}</div></div>` : ''}
                    <div><span class="font-medium">${lblCreatedAt}</span>${createdAtStr}</div>
                    ${updatedAtStr ? `<div><span class="font-medium">${lblUpdatedAt}</span>${updatedAtStr}</div>` : ''}
                </div>
            </div>
        </div>
        ${packageStatusHtml}
        <!-- 診症記錄摘要 -->
        <div class="mt-6 pt-6 border-t border-gray-200">
            <div class="flex justify-between items-center mb-4">
                <h4 class="text-lg font-semibold text-gray-800">${lblConsultationSummary}</h4>
                ${G.versionFeatureEnabled('medicalAttachments') ? `
                <button type="button"
                    data-ma-open="1"
                    data-scope="patient"
                    data-category="all"
                    data-patient="${window.escapeHtml(String(id))}"
                    data-patient-name="${safeName}"
                    class="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded transition duration-200">
                    📎 <span>醫學報告及舌象圖片</span>
                </button>` : ''}
            </div>
            <div id="patientConsultationSummary">
                <div class="text-center py-4">
                    <!-- 使用較大的讀取圈以與其他頁面一致 -->
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <div class="mt-2 text-sm">${lblLoadingConsultations}</div>
                </div>
            </div>
        </div>
        `;
        
        const detailContainer = document.getElementById('patientDetailContent');
        if (detailContainer) {
            detailContainer.innerHTML = content;
        }
        const modalEl = document.getElementById('patientDetailModal');
        if (modalEl) {
            modalEl.classList.remove('hidden');
        }

        

        
        G.loadPatientConsultationSummary(id);

    } catch (error) {
        console.error('查看病人資料錯誤:', error);
        G.showToast('讀取病人資料失敗', 'error');
    }
}
