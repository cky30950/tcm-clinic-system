/* ============================================================
 * print/certificate.js — 應診證明／病假紙列印（診症記錄＋掛號入口）
 * 由 system.js 原樣遷移（2026-10，漸進 ESM 化 Phase 1），
 * 差異僅限：以 G 存取尚未遷移的舊全域。
 * ============================================================ */

import { G } from '../../lib/legacy.js';

// 2. 修改從掛號記錄列印到診證明函數
export async function printAttendanceCertificateFromAppointment(appointmentId) {
    const appointment = G.appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        G.showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 只能列印已完成診症的到診證明
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        G.showToast('只能列印已完成診症的到診證明！', 'error');
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
        try {
            loadingButton = document.querySelector('button[onclick="printAttendanceCertificateFromAppointment(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '列印中...');
    }
    try {
        let consultation = null;
        const singleRes = await window.firebaseDataManager.getConsultationById(String(appointment.consultationId), true);
        if (singleRes && singleRes.success && singleRes.data) {
            consultation = singleRes.data;
        }
        if (!consultation) {
            G.showToast('找不到對應的診症記錄！', 'error');
            return;
        }
        // 直接調用到診證明列印功能
        await printAttendanceCertificate(consultation.id, consultation);
    } catch (error) {
        console.error('列印到診證明錯誤:', error);
        G.showToast('列印到診證明時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}
        
// 3. 修改從掛號記錄列印病假證明函數
export async function printSickLeaveFromAppointment(appointmentId) {
    const appointment = G.appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        G.showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 只能列印已完成診症的病假證明
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        G.showToast('只能列印已完成診症的病假證明！', 'error');
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
        try {
            loadingButton = document.querySelector('button[onclick="printSickLeaveFromAppointment(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '列印中...');
    }
    try {
        let consultation = null;
        const singleRes = await window.firebaseDataManager.getConsultationById(String(appointment.consultationId), true);
        if (singleRes && singleRes.success && singleRes.data) {
            consultation = singleRes.data;
        }
        if (!consultation) {
            G.showToast('找不到對應的診症記錄！', 'error');
            return;
        }
        // 直接調用病假證明列印功能
        await printSickLeave(consultation.id, consultation);
    } catch (error) {
        console.error('列印病假證明錯誤:', error);
        G.showToast('列印病假證明時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}
        

// 5. 修改列印到診證明函數
export async function printAttendanceCertificate(consultationId, consultationData = null) {
    let consultation = consultationData;
    // 將傳入的 ID 轉為字串以便比較（兼容數字與字串）
    const idToFind = String(consultationId);
    
    // 如果沒有提供診症資料，從 Firebase 獲取
    if (!consultation) {
        try {
            const singleRes = await window.firebaseDataManager.getConsultationById(idToFind, true);
            if (singleRes && singleRes.success && singleRes.data) {
                consultation = singleRes.data;
            }
            if (!consultation) {
                G.showToast('找不到診症記錄！', 'error');
                return;
            }
        } catch (error) {
            console.error('讀取診症記錄錯誤:', error);
            G.showToast('讀取診症記錄失敗', 'error');
            return;
        }
    }
    
    try {
        const patient = await G.getPatientByIdWithRefresh(consultation.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }
        
        // 獲取診症日期（處理 Firebase Timestamp）
        let consultationDate;
        if (consultation.date && consultation.date.seconds) {
            consultationDate = new Date(consultation.date.seconds * 1000);
        } else if (consultation.date) {
            consultationDate = new Date(consultation.date);
        } else {
            consultationDate = new Date();
        }
        
        // Determine language preference and build localized arrival certificate
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        const isEnglish = lang && lang.startsWith('en');
        const htmlLang = isEnglish ? 'en' : 'zh-TW';
        const dateLocale = isEnglish ? 'en-US' : 'zh-TW';
        const colon = isEnglish ? ':' : '：';
        // Compute gender display
        let genderDisplay = patient.gender;
        if (isEnglish) {
            if (genderDisplay === '男') genderDisplay = 'Male';
            else if (genderDisplay === '女') genderDisplay = 'Female';
        }
        // Compute age display
        const rawAge = G.formatAge(patient.birthDate);
        let ageDisplay = rawAge;
        if (isEnglish) {
            ageDisplay = rawAge.replace(/歲$/, ' years').replace(/個月$/, ' months').replace(/天$/, ' days');
        }
        // ID card display
        const idDisplay = patient.idCard || (isEnglish ? 'Not provided' : '未提供');
        // Determine visit date/time
        const visitDate = consultation.visitTime ? new Date(consultation.visitTime) : consultationDate;
        // Translation dictionary for certificate fields
        const TC = {
            certificateTitle: isEnglish ? 'Arrival Certificate' : '到診證明書',
            certificateNo: isEnglish ? 'Certificate No' : '證明書編號',
            name: isEnglish ? 'Name' : '姓　　名',
            medicalRecordNo: isEnglish ? 'Medical Record No' : '病歷編號',
            gender: isEnglish ? 'Gender' : '性　　別',
            age: isEnglish ? 'Age' : '年　　齡',
            idCard: isEnglish ? 'ID No' : '身分證號',
            attendanceInfo: isEnglish ? 'Arrival Information' : '到診資訊',
            arrivalDate: isEnglish ? 'Arrival Date' : '到診日期',
            arrivalTime: isEnglish ? 'Arrival Time' : '到診時間',
            diagnosisResult: isEnglish ? 'Diagnosis Result' : '診斷結果',
            confirmSentence: isEnglish ? 'It is hereby certified that the above patient was examined at the clinic on the specified date and time.' : '茲證明上述病人確實於上述日期時間到本診所接受中醫診療。',
            hereby: isEnglish ? 'Therefore, this certificate is issued.' : '特此證明。',
            doctorSignature: isEnglish ? 'Physician Signature' : '主治醫師簽名',
            registrationNo: isEnglish ? 'Registration No' : '註冊編號',
            issueDate: isEnglish ? 'Date of Issue' : '開立日期',
            clinicSeal: isEnglish ? 'Clinic Seal' : '診所印章',
            sealNote: isEnglish ? '(Clinic stamp here)' : '(此處應蓋診所印章)',
            footerNote1: isEnglish ? 'This certificate only certifies attendance. For inquiries, please contact the clinic.' : '本證明書僅證明到診事實，如有疑問請洽本診所',
            footerTel: isEnglish ? 'Clinic Tel' : '診所電話',
            footerHours: isEnglish ? 'Business Hours' : '營業時間',
            certificateIssuedAt: isEnglish ? 'Certificate Issued At' : '證明書開立時間',
            watermark: isEnglish ? 'Arrival Certificate' : '到診證明'
        };
        const clinicPrint = await G.resolveClinicSettingsByConsultation(consultation);
        const layout = G.getReceiptPrintLayoutConfig(G.getClinicReceiptPaperSize(clinicPrint), 'certificate');
        const hideDoctorInfo = G.shouldHideGeneralRegistrationDoctorInfo(consultation, null);
        // Build certificate HTML
        const printContent = `
            <!DOCTYPE html>
            <html lang="${htmlLang}">
            <head>
                <meta charset="UTF-8">
                <title>${TC.certificateTitle} - ${window.escapeHtml(patient.name)}</title>
                <style>
                    body { 
                        font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; 
                        margin: 0; 
                        padding: ${layout.bodyPadding}; 
                        line-height: 1.3;
                        font-size: ${layout.bodyFontSize};
                        background: white;
                    }
                    .certificate-container {
                        width: ${layout.containerWidth};
                        height: ${layout.containerHeight};
                        margin: 0 auto;
                        border: 3px solid #000;
                        padding: ${layout.containerPadding};
                        background: white;
                        position: relative;
                        box-sizing: border-box;
                    }
                    .clinic-header {
                        text-align: center;
                        border-bottom: 2px solid #000;
                        padding-bottom: ${layout.clinicHeaderPaddingBottom};
                        margin-bottom: ${layout.clinicHeaderMarginBottom};
                    }
                    .clinic-name {
                        font-size: ${layout.clinicNameFont};
                        font-weight: bold;
                        margin-bottom: 3px;
                        letter-spacing: 1px;
                    }
                    .clinic-subtitle {
                        font-size: ${layout.clinicSubtitleFont};
                        color: #666;
                        margin-bottom: 4px;
                    }
                    .certificate-title {
                        font-size: ${layout.titleFont};
                        font-weight: bold;
                        text-align: center;
                        margin: ${layout.titleMargin} 0;
                        letter-spacing: 3px;
                        color: #000;
                    }
                    .certificate-number {
                        text-align: right;
                        font-size: ${layout.numberFont};
                        color: #666;
                        margin-bottom: 10px;
                    }
                    .content-section {
                        margin: 8px 0;
                        font-size: ${layout.sectionFont};
                        line-height: 1.4;
                    }
                    .patient-info {
                        margin: 8px 0;
                    }
                    .info-row {
                        margin: 4px 0;
                        display: flex;
                        align-items: center;
                    }
                    .info-label {
                        font-weight: bold;
                        min-width: ${layout.infoLabelMinWidth};
                        display: inline-block;
                        font-size: ${layout.sectionFont};
                    }
                    .info-value {
                        border-bottom: 1px solid #000;
                        min-width: ${layout.infoValueMinWidth};
                        padding: ${layout.infoValuePadding};
                        margin-left: 6px;
                        font-size: ${layout.sectionFont};
                    }
                    .attendance-section {
                        margin: 8px 0;
                        background: #e3f2fd;
                        padding: ${layout.highlightPadding};
                        border: 2px solid #2196f3;
                        border-radius: 4px;
                        text-align: center;
                    }
                    .attendance-title {
                        font-size: ${layout.sectionFont};
                        font-weight: bold;
                        color: #1976d2;
                        margin-bottom: 4px;
                    }
                    .attendance-details {
                        font-size: ${layout.sectionFont};
                        line-height: 1.3;
                    }
                    .doctor-signature {
                        margin-top: 10px;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                    }
                    .signature-section {
                        text-align: center;
                    }
                    .signature-line {
                        border-bottom: 2px solid #000;
                        width: ${layout.signatureWidth};
                        height: ${layout.signatureHeight};
                        margin: 6px auto;
                        position: relative;
                    }
                    .signature-label {
                        font-size: ${layout.signatureLabelFont};
                        color: #666;
                        margin-top: 3px;
                    }
                    .date-section {
                        text-align: right;
                        font-size: ${layout.dateFont};
                    }
                    .footer-note {
                        margin-top: 15px;
                        padding-top: 8px;
                        border-top: 1px dashed #666;
                        font-size: ${layout.footerFont};
                        color: #666;
                        text-align: center;
                    }
                    .watermark {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-45deg);
                        font-size: ${layout.watermarkFont};
                        color: rgba(0, 0, 0, 0.05);
                        font-weight: bold;
                        z-index: 0;
                        pointer-events: none;
                    }
                    .content {
                        position: relative;
                        z-index: 1;
                    }
                    @media print {
                        @page {
                            size: ${layout.paperSize};
                            margin: ${layout.pageMargin};
                        }
                        body { 
                            margin: 0; 
                            padding: 0; 
                            font-size: ${layout.printBodyFontSize};
                        }
                        .certificate-container { 
                            border: 3px solid #000;
                            width: 100%;
                            height: 100%;
                            padding: ${layout.printPadding};
                        }
                    }
                </style>
            </head>
            <body>
                <div class="certificate-container">
                    <!-- Watermark -->
                    <div class="watermark">${TC.watermark}</div>
                    
                    <div class="content">
                        <!-- Clinic Header -->
                        <div class="clinic-header">
                            <div class="clinic-name">${window.escapeHtml(clinicPrint.chineseName || '名醫診所系統')}</div>
                            <div class="clinic-subtitle">${window.escapeHtml(clinicPrint.englishName || 'Dr.Great Clinic')}</div>
                            <div class="clinic-subtitle">${isEnglish ? 'Tel:' : '電話：'}${window.escapeHtml(clinicPrint.phone || '(852) 2345-6789')}　${isEnglish ? 'Address:' : '地址：'}${window.escapeHtml(clinicPrint.address || '香港中環皇后大道中123號')}</div>
                        </div>
                        
                        <!-- Certificate Number -->
                        <div class="certificate-number">
                            ${TC.certificateNo}${colon} AC${consultation.id.toString().padStart(6, '0')}
                        </div>
                        
                        <!-- Certificate Title -->
                        <div class="certificate-title">${TC.certificateTitle}</div>
                        
                        <!-- Patient Info -->
                        <div class="patient-info">
                            <div class="info-row">
                                <span class="info-label">${TC.name}${colon}</span>
                                <span class="info-value">${window.escapeHtml(patient.name)}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">${TC.medicalRecordNo}${colon}</span>
                                <span class="info-value">${window.escapeHtml(String(consultation.medicalRecordNumber || consultation.id))}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">${TC.gender}${colon}</span>
                                <span class="info-value">${window.escapeHtml(genderDisplay || '')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">${TC.age}${colon}</span>
                                <span class="info-value">${window.escapeHtml(ageDisplay || '')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">${TC.idCard}${colon}</span>
                                <span class="info-value">${window.escapeHtml(idDisplay)}</span>
                            </div>
                        </div>
                        
                        <!-- Attendance Info -->
                        <div class="attendance-section">
                            <div class="attendance-title">${TC.attendanceInfo}</div>
                            <div class="attendance-details">
                                <div><strong>${TC.arrivalDate}${colon}</strong>${visitDate.toLocaleDateString(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                                <div><strong>${TC.arrivalTime}${colon}</strong>${visitDate.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                        
                        <!-- Diagnosis Info -->
                        ${consultation.diagnosis ? `
                        <div class="content-section">
                            <div style="margin-bottom: 15px;">
                                <strong>${TC.diagnosisResult}${colon}</strong>${window.escapeHtml(consultation.diagnosis)}
                            </div>
                        </div>
                        ` : ''}
                        
                        <div class="content-section">
                            <strong>${TC.confirmSentence}</strong>
                        </div>
                        
                        <div class="content-section">
                            <strong>${TC.hereby}</strong>
                        </div>
                        
                        <!-- Doctor Signature -->
                        ${hideDoctorInfo ? '' : `
                        <div class="doctor-signature">
                            <div class="signature-section">
                                <div class="signature-line"></div>
                                <div class="signature-label">${TC.doctorSignature}</div>
                                <div style="margin-top: 10px; font-weight: bold;">
                                    ${window.escapeHtml(G.getDoctorDisplayName(consultation.doctor))}
                                </div>
                                ${(() => {
                                    const regNumber = G.getDoctorRegistrationNumber(consultation.doctor);
                                    return regNumber ? `
                                        <div style="margin-top: 5px; font-size: ${layout.sectionFont}; color: #666;">
                                            ${TC.registrationNo}${colon}${window.escapeHtml(regNumber)}
                                        </div>
                                    ` : '';
                                })()}
                            </div>
                            
                            <div class="date-section">
                                <div style="margin-bottom: 20px;">
                                    <strong>${TC.issueDate}${colon}</strong><br>
                                    ${new Date().toLocaleDateString(dateLocale, {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit'
                                    })}
                                </div>
                                <div style="border: 2px solid #000; padding: ${layout.sealPadding}; text-align: center; background: #f8f9fa;">
                                    <div style="font-weight: bold; margin-bottom: 5px;">${TC.clinicSeal}</div>
                                    <div style="font-size: ${layout.sealNoteFont}; color: #666;">${TC.sealNote}</div>
                                </div>
                            </div>
                        </div>
                        `}
                        
                        <!-- Footer Note -->
                        <div class="footer-note">
                            <div>${TC.footerNote1}</div>
                            <div>${TC.footerTel}${colon}${window.escapeHtml(clinicPrint.phone || '(852) 2345-6789')} | ${TC.footerHours}${colon}${window.escapeHtml(clinicPrint.businessHours || '週一至週五 09:00-18:00')}</div>
                            <div style="margin-top: 10px; font-size: 10px;">
                                ${TC.certificateIssuedAt}${colon}${new Date().toLocaleString(dateLocale)}
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
        // Open a new window and print
        const printWindow = window.open('', '_blank', layout.windowFeatures);
        printWindow.document.write(window.sanitizePrintHtml(printContent));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        
        G.showToast(isEnglish ? 'Arrival certificate is ready for printing!' : '到診證明書已準備列印！', 'success');
        
    } catch (error) {
        console.error('列印到診證明錯誤:', error);
        G.showToast('列印到診證明時發生錯誤', 'error');
    }
}
        
// 修復病假證明函數
export async function printSickLeave(consultationId, consultationData = null) {
    let consultation = consultationData;
    
    if (!consultation) {
        try {
            const idToFind = String(consultationId);
            const singleRes = await window.firebaseDataManager.getConsultationById(idToFind, true);
            if (singleRes && singleRes.success && singleRes.data) {
                consultation = singleRes.data;
            }
            if (!consultation) {
                G.showToast('找不到診症記錄！', 'error');
                return;
            }
        } catch (error) {
            console.error('讀取診症記錄錯誤:', error);
            G.showToast('讀取診症記錄失敗', 'error');
            return;
        }
    }
    
    try {            
        const patient = await G.getPatientByIdWithRefresh(consultation.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }
        
        // 動態生成病假證明內容，根據語言切換中英文
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        const isEnglish = lang === 'en';
        const htmlLang = isEnglish ? 'en' : 'zh-TW';
        const dateLocale = isEnglish ? 'en-US' : 'zh-TW';
        const colon = isEnglish ? ': ' : '：';
        // 性別翻譯
        const genderVal = patient.gender || '';
        let genderDisplay;
        if (isEnglish) {
            if (genderVal === '男' || genderVal === 'male' || genderVal === 'Male') {
                genderDisplay = 'Male';
            } else if (genderVal === '女' || genderVal === 'female' || genderVal === 'Female') {
                genderDisplay = 'Female';
            } else {
                genderDisplay = genderVal;
            }
        } else {
            genderDisplay = genderVal;
        }
        // 年齡翻譯
        let ageDisplay = G.formatAge(patient.birthDate);
        if (isEnglish && ageDisplay) {
            ageDisplay = ageDisplay.replace('歲', '').trim();
            if (ageDisplay) ageDisplay += ' years';
        }
        // 身分證號顯示
        const idNumberDisplay = patient.idCard || (isEnglish ? 'Not provided' : '未提供');
        // 診療日期
        const visitDate = consultation.visitTime ? G.parseConsultationDate(consultation.visitTime) : G.parseConsultationDate(consultation.date);
        const visitDateStr = visitDate && !isNaN(visitDate.getTime()) ? visitDate.toLocaleDateString(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' }) : (isEnglish ? 'Unknown' : '未知日期');
        // 診斷結果
        const diagnosisResult = consultation.diagnosis || (isEnglish ? 'Rest and recuperation recommended' : '需要休息調養');
        // 計算建議休息期間的顯示文字
        const computeRestPeriod = () => {
            // 優先使用診症記錄中的休息期間設定
            if (consultation.restStartDate && consultation.restEndDate) {
                const startDate = G.parseConsultationDate(consultation.restStartDate);
                const endDate = G.parseConsultationDate(consultation.restEndDate);
                if (!startDate || isNaN(startDate.getTime()) || !endDate || isNaN(endDate.getTime())) {
                    return isEnglish ? 'Unknown' : '未知日期';
                }
                const timeDiff = endDate.getTime() - startDate.getTime();
                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
                return startDate.toLocaleDateString(dateLocale) + (isEnglish ? ' to ' : ' 至 ') + endDate.toLocaleDateString(dateLocale) + (isEnglish ? ' (Total ' + daysDiff + ' days)' : ' (共 ' + daysDiff + ' 天)');
            }
            // 否則使用舊邏輯估算
            let restDays = consultation.restDays ? parseInt(consultation.restDays) : 1;
            if (!consultation.restDays) {
                const treatmentCourse = consultation.treatmentCourse || (isEnglish ? '1 week' : '一周');
                if (treatmentCourse.includes('天')) {
                    const match = treatmentCourse.match(/(\d+)天/);
                    if (match) {
                        restDays = Math.min(parseInt(match[1]), 7);
                    }
                } else if (treatmentCourse.includes('週') || treatmentCourse.includes('周') || treatmentCourse.toLowerCase().includes('week')) {
                    const match = treatmentCourse.match(/(\d+)[週周]/) || treatmentCourse.match(/(\d+)\s*week/);
                    if (match) {
                        restDays = Math.min(parseInt(match[1]) * 7, 7);
                    }
                }
            }
            const startDate = consultation.visitTime ? G.parseConsultationDate(consultation.visitTime) : G.parseConsultationDate(consultation.date);
            if (!startDate || isNaN(startDate.getTime())) {
                return isEnglish ? 'Unknown' : '未知日期';
            }
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + restDays - 1);
            return startDate.toLocaleDateString(dateLocale) + (isEnglish ? ' to ' : ' 至 ') + endDate.toLocaleDateString(dateLocale) + (isEnglish ? ' (Total ' + restDays + ' days)' : ' (共 ' + restDays + ' 天)');
        };
        const restPeriodStr = computeRestPeriod();
        // 医师建议内容
        const instructionsHtml = consultation.instructions ? window.escapeHtml(String(consultation.instructions)).replace(/\n/g, '<br>') : '';
        // 翻譯字典
        const SL = {
            title: isEnglish ? 'Sick Leave Certificate' : '病假證明書',
            certificateNumber: isEnglish ? 'Certificate No.' : '證明書編號',
            name: isEnglish ? 'Name' : '姓　　名',
            medicalRecordNo: isEnglish ? 'Medical Record No.' : '病歷編號',
            genderLabel: isEnglish ? 'Gender' : '性　　別',
            ageLabel: isEnglish ? 'Age' : '年　　齡',
            idNumber: isEnglish ? 'ID No.' : '身分證號',
            consultationDate: isEnglish ? 'Consultation Date' : '診療日期',
            diagnosisResult: isEnglish ? 'Diagnosis Result' : '診斷結果',
            restPeriod: isEnglish ? 'Recommended Rest Period' : '建議休息期間',
            doctorAdvice: isEnglish ? "Doctor's advice" : '醫師建議',
            certify: isEnglish ? 'Hereby certified.' : '特此證明。',
            signature: isEnglish ? 'Physician Signature' : '主治醫師簽名',
            registrationNo: isEnglish ? 'Registration No.' : '註冊編號',
            issueDate: isEnglish ? 'Date of Issue' : '開立日期',
            clinicSeal: isEnglish ? 'Clinic Seal' : '診所印章',
            sealNote: isEnglish ? '(Clinic stamp here)' : '(此處應蓋診所印章)',
            footerNote: isEnglish ? 'This certificate is for sick leave purposes only. If you have any questions, please contact the clinic.' : '本證明書僅供請假使用，如有疑問請洽本診所',
            footerTel: isEnglish ? 'Clinic Tel.' : '診所電話',
            footerHours: isEnglish ? 'Business Hours' : '營業時間',
            issuedAt: isEnglish ? 'Certificate Issued At' : '證明書開立時間',
            watermark: isEnglish ? 'Sick Leave' : '病假證明'
        };
        const clinicPrint = await G.resolveClinicSettingsByConsultation(consultation);
        const layout = G.getReceiptPrintLayoutConfig(G.getClinicReceiptPaperSize(clinicPrint), 'certificate');
        const hideDoctorInfo = G.shouldHideGeneralRegistrationDoctorInfo(consultation, null);
        // 構建 HTML 內容
        const printContent = `
            <!DOCTYPE html>
            <html lang="${htmlLang}">
            <head>
                <meta charset="UTF-8">
                <title>${SL.title} - ${window.escapeHtml(patient.name)}</title>
                <style>
                    body {
                        font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif;
                        margin: 0;
                        padding: ${layout.bodyPadding};
                        line-height: 1.3;
                        font-size: ${layout.bodyFontSize};
                        background: white;
                    }
                    .certificate-container {
                        width: ${layout.containerWidth};
                        height: ${layout.containerHeight};
                        margin: 0 auto;
                        border: 3px solid #000;
                        padding: ${layout.containerPadding};
                        background: white;
                        position: relative;
                        box-sizing: border-box;
                    }
                    .clinic-header {
                        text-align: center;
                        border-bottom: 2px solid #000;
                        padding-bottom: ${layout.clinicHeaderPaddingBottom};
                        margin-bottom: ${layout.clinicHeaderMarginBottom};
                    }
                    .clinic-name {
                        font-size: ${layout.clinicNameFont};
                        font-weight: bold;
                        margin-bottom: 3px;
                        letter-spacing: 1px;
                    }
                    .clinic-subtitle {
                        font-size: ${layout.clinicSubtitleFont};
                        color: #666;
                        margin-bottom: 4px;
                    }
                    .certificate-title {
                        font-size: ${layout.titleFont};
                        font-weight: bold;
                        text-align: center;
                        margin: ${layout.titleMargin} 0;
                        letter-spacing: 3px;
                        color: #000;
                    }
                    .certificate-number {
                        text-align: right;
                        font-size: ${layout.numberFont};
                        color: #666;
                        margin-bottom: 10px;
                    }
                    .content-section {
                        margin: 8px 0;
                        font-size: ${layout.sectionFont};
                        line-height: 1.4;
                    }
                    .patient-info {
                        margin: 8px 0;
                    }
                    .info-row {
                        margin: 4px 0;
                        display: flex;
                        align-items: center;
                    }
                    .info-label {
                        font-weight: bold;
                        min-width: ${layout.infoLabelMinWidth};
                        display: inline-block;
                        font-size: ${layout.sectionFont};
                    }
                    .info-value {
                        border-bottom: 1px solid #000;
                        min-width: ${layout.infoValueMinWidth};
                        padding: ${layout.infoValuePadding};
                        margin-left: 6px;
                        font-size: ${layout.sectionFont};
                    }
                    .diagnosis-section {
                        margin: 8px 0;
                        background: #f9f9f9;
                        padding: ${layout.highlightPadding};
                        border: 1px solid #ddd;
                        border-radius: 3px;
                    }
                    .rest-period {
                        margin: 8px 0;
                        font-size: ${layout.sectionFont};
                        font-weight: bold;
                        text-align: center;
                        background: #fff3cd;
                        padding: ${layout.highlightPadding};
                        border: 2px solid #ffc107;
                        border-radius: 4px;
                    }
                    .doctor-signature {
                        margin-top: 10px;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                    }
                    .signature-section {
                        text-align: center;
                    }
                    .signature-line {
                        border-bottom: 2px solid #000;
                        width: ${layout.signatureWidth};
                        height: ${layout.signatureHeight};
                        margin: 6px auto;
                        position: relative;
                    }
                    .signature-label {
                        font-size: ${layout.signatureLabelFont};
                        color: #666;
                        margin-top: 3px;
                    }
                    .date-section {
                        text-align: right;
                        font-size: ${layout.dateFont};
                    }
                    .footer-note {
                        margin-top: 15px;
                        padding-top: 8px;
                        border-top: 1px dashed #666;
                        font-size: ${layout.footerFont};
                        color: #666;
                        text-align: center;
                    }
                    .watermark {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-45deg);
                        font-size: ${layout.watermarkFont};
                        color: rgba(0, 0, 0, 0.05);
                        font-weight: bold;
                        z-index: 0;
                        pointer-events: none;
                    }
                    .content {
                        position: relative;
                        z-index: 1;
                    }
                    @media print {
                        @page {
                            size: ${layout.paperSize};
                            margin: ${layout.pageMargin};
                        }
                        body {
                            margin: 0;
                            padding: 0;
                            font-size: ${layout.printBodyFontSize};
                        }
                        .certificate-container {
                            border: 3px solid #000;
                            width: 100%;
                            height: 100%;
                            padding: ${layout.printPadding};
                        }
                    }
                </style>
            </head>
            <body>
                <div class="certificate-container">
                    <div class="watermark">${SL.watermark}</div>
                    <div class="content">
                        <div class="clinic-header">
                            <div class="clinic-name">${window.escapeHtml(clinicPrint.chineseName || '名醫診所系統')}</div>
                            <div class="clinic-subtitle">${window.escapeHtml(clinicPrint.englishName || 'Dr.Great Clinic')}</div>
                            <div class="clinic-subtitle">${isEnglish ? 'Tel' : '電話'}${colon}${window.escapeHtml(clinicPrint.phone || '(852) 2345-6789')}　${isEnglish ? 'Address' : '地址'}${colon}${window.escapeHtml(clinicPrint.address || '香港中環皇后大道中123號')}</div>
                        </div>
                        <div class="certificate-number">${SL.certificateNumber}${colon}SL${consultation.id.toString().padStart(6, '0')}</div>
                        <div class="certificate-title">${SL.title}</div>
                        <div class="patient-info">
                            <div class="info-row"><span class="info-label">${SL.name}${colon}</span><span class="info-value">${window.escapeHtml(patient.name)}</span></div>
                            <div class="info-row"><span class="info-label">${SL.medicalRecordNo}${colon}</span><span class="info-value">${window.escapeHtml(String(consultation.medicalRecordNumber || consultation.id))}</span></div>
                            <div class="info-row"><span class="info-label">${SL.genderLabel}${colon}</span><span class="info-value">${window.escapeHtml(genderDisplay || '')}</span></div>
                            <div class="info-row"><span class="info-label">${SL.ageLabel}${colon}</span><span class="info-value">${window.escapeHtml(ageDisplay || '')}</span></div>
                            <div class="info-row"><span class="info-label">${SL.idNumber}${colon}</span><span class="info-value">${window.escapeHtml(idNumberDisplay)}</span></div>
                        </div>
                        <div class="diagnosis-section">
                            <div style="margin-bottom: 15px;"><strong>${SL.consultationDate}${colon}</strong>${visitDateStr}</div>
                            <div style="margin-bottom: 15px;"><strong>${SL.diagnosisResult}${colon}</strong>${window.escapeHtml(diagnosisResult)}</div>
                        </div>
                        <div class="rest-period">${SL.restPeriod}${colon}${restPeriodStr}</div>
                        ${instructionsHtml ? `<div class="content-section"><strong>${SL.doctorAdvice}${colon}</strong><br>${instructionsHtml}</div>` : ''}
                        <div class="content-section"><strong>${SL.certify}</strong></div>
                        ${hideDoctorInfo ? '' : `
                        <div class="doctor-signature">
                            <div class="signature-section">
                                <div class="signature-line"></div>
                                <div class="signature-label">${SL.signature}</div>
                                <div style="margin-top: 10px; font-weight: bold;">${window.escapeHtml(G.getDoctorDisplayName(consultation.doctor))}</div>
                                ${(() => {
                                    const regNumber = G.getDoctorRegistrationNumber(consultation.doctor);
                                    return regNumber ? `<div style="margin-top: 5px; font-size: ${layout.sectionFont}; color: #666;">${SL.registrationNo}${colon}${window.escapeHtml(regNumber)}</div>` : '';
                                })()}
                            </div>
                            <div class="date-section">
                                <div style="margin-bottom: 20px;"><strong>${SL.issueDate}${colon}</strong><br>${new Date().toLocaleDateString(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                                <div style="border: 2px solid #000; padding: ${layout.sealPadding}; text-align: center; background: #f8f9fa;"><div style="font-weight: bold; margin-bottom: 5px;">${SL.clinicSeal}</div><div style="font-size: ${layout.sealNoteFont}; color: #666;">${SL.sealNote}</div></div>
                            </div>
                        </div>
                        `}
                        <div class="footer-note">
                            <div>${SL.footerNote}</div>
                            <div>${SL.footerTel}${colon}${window.escapeHtml(clinicPrint.phone || '(852) 2345-6789')} | ${SL.footerHours}${colon}${window.escapeHtml(clinicPrint.businessHours || '週一至週五 09:00-18:00')}</div>
                            <div style="margin-top: 10px; font-size: ${layout.sectionFont};">${SL.issuedAt}${colon}${new Date().toLocaleString(dateLocale)}</div>
                        </div>
                    </div>
                </div>
            </body>
            </html>`;
        // 開啟新視窗並列印
        const printWindow = window.open('', '_blank', layout.windowFeatures);
        printWindow.document.write(window.sanitizePrintHtml(printContent));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        G.showToast(isEnglish ? 'Sick leave certificate is ready for printing!' : '病假證明書已準備列印！', 'success');
        
    } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        G.showToast('讀取病人資料失敗', 'error');
    }
}