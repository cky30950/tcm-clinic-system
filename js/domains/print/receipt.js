/* ============================================================
 * print/receipt.js — 收據列印（診症記錄收據／由掛號記錄進入）
 * 由 system.js 原樣遷移（2026-10，漸進 ESM 化 Phase 1），
 * 差異僅限：以 G 存取尚未遷移的舊全域。
 * ============================================================ */

import { G } from '../../lib/legacy.js';

export async function printReceiptFromAppointment(appointmentId) {
    const appointment = G.appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        G.showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 只能列印已完成診症的收據
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        G.showToast('只能列印已完成診症的收據！', 'error');
        return;
    }
    // 取得觸發按鈕，優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="printReceiptFromAppointment(' + appointmentId + ')"]');
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
        // 直接調用現有的列印功能
        await printConsultationRecord(consultation.id, consultation);
    } catch (error) {
        console.error('列印收據錯誤:', error);
        G.showToast('列印收據時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}


// 4. 修改列印診症記錄函數
export async function printConsultationRecord(consultationId, consultationData = null) {
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
        
        // 解析收費項目以計算總金額
        let totalAmount = 0;
        let billingItemsHtml = '';

        // Determine language preference for receipt fields
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        const isEnglish = lang && lang.startsWith('en');

        // 為套票使用項目準備餘下次數資訊：
        // 優先使用完成病歷時固定寫入病歷的餘次快照（不會讀取套票，餘額在完成病歷當下即固定）；
        // 僅舊記錄缺少快照時，才以快取中的套票資料依 packageRecordId／名稱後備比對，不強制刷新。
        const remainingByPackageUseLine = await G.resolveConsultationPackageUseRemaining(
            consultation,
            consultation.patientId || (patient && patient.id) || '',
            false
        );

        // 套票使用項目的比對指標（依順序對應文字行中的套票使用項目）
        let packageUseIndex = 0;

        if (consultation.billingItems) {
            const lines = consultation.billingItems.split('\n');
            lines.forEach(line => {
                // 先依「使用套票」行順序取得餘下次數，確保與文字行對齊（即使該行未進入下方明細分支）
                let lineRemaining = null;
                if (line.includes('使用套票')) {
                    lineRemaining = packageUseIndex < remainingByPackageUseLine.length
                        ? remainingByPackageUseLine[packageUseIndex]
                        : null;
                    packageUseIndex++;
                }
                if (line.includes('=') && line.includes('$')) {
                    const match = line.match(/\$(\d+)/);
                    if (match) {
                        totalAmount += parseInt(match[1]);
                    }
                    // 若為套票使用項目，附加餘下次數
                    let displayLine = line;
                    if (line.includes('使用套票') && typeof lineRemaining === 'number') {
                        const remainingLabel = isEnglish ? ` (Remaining: ${lineRemaining})` : `（餘下 ${lineRemaining} 次）`;
                        displayLine = line + ' ' + remainingLabel;
                    }
                    billingItemsHtml += `<tr><td style="padding: 5px; border-bottom: 1px dotted #ccc;">${window.escapeHtml(displayLine)}</td></tr>`;
                } else if (line.includes('總費用')) {
                    const match = line.match(/\$(\d+)/);
                    if (match) {
                        totalAmount = parseInt(match[1]);
                    }
                } else if (line.startsWith('折扣適用於')) {
                    // 顯示折扣適用項目明細於收據中
                    billingItemsHtml += `<tr><td style="padding: 5px; border-bottom: 1px dotted #ccc;">${window.escapeHtml(line)}</td></tr>`;
                }
            });
        }

        // 以儲值支付者，於收費明細末附加支付後儲值餘額（優先使用病歷快照）
        const walletBalanceInfo = await G.resolveConsultationWalletBalance(
            consultation,
            consultation.patientId || (patient && patient.id) || ''
        );
        if (walletBalanceInfo) {
            const walletLabel = isEnglish
                ? `Wallet balance (after payment): HK$${walletBalanceInfo.total.toFixed(2)}`
                : `儲值餘額（支付後）：HK$${walletBalanceInfo.total.toFixed(2)}`;
            billingItemsHtml += `<tr><td style="padding: 5px; border-bottom: 1px dotted #ccc;">${walletLabel}</td></tr>`;
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

        // 取得服藥天數與每日次數，供收據顯示使用
        // 優先使用診症紀錄中的 medicationDays/medicationFrequency；當無對應值時，以空字串代表未定義
        let medDays = '';
        let medFreq = '';
        if (consultation && consultation.medicationDays && Number(consultation.medicationDays) > 0) {
            medDays = consultation.medicationDays;
        }
        if (consultation && consultation.medicationFrequency && Number(consultation.medicationFrequency) > 0) {
            medFreq = consultation.medicationFrequency;
        }
        // 組合顯示字串：若天數或次數存在，分別加上標籤與單位；若有服用方法則附加。
        let medInfoHtml = '';
        if (medDays) {
            medInfoHtml += '<strong>服藥天數：</strong>' + medDays + '天　';
        }
        if (medFreq) {
            medInfoHtml += '<strong>每日次數：</strong>' + medFreq + '次　';
        }
        if (consultation.usage) {
            medInfoHtml += '<strong>服用方法：</strong>' + window.escapeHtml(String(consultation.usage));
        }
        
        // 將處方內容、醫囑、複診日期、服藥天數、每日次數與服用方法移至方藥醫囑功能
        // 在收據中不顯示這些資料，因此暫時將這些屬性設為空
        const originalPrescription = consultation.prescription;
        const originalInstructions  = consultation.instructions;
        const originalFollowUpDate  = consultation.followUpDate;
        consultation.prescription = null;
        consultation.instructions = null;
        consultation.followUpDate = null;

        // Localise receipt fields (lang and isEnglish defined earlier)
        const htmlLang = isEnglish ? 'en' : 'zh-TW';
        const dateLocale = isEnglish ? 'en-US' : 'zh-TW';
        const colon = isEnglish ? ':' : '：';
        // Rebuild medication information according to language
        let medInfoLocalized = '';
        if (medDays) {
            medInfoLocalized += '<strong>' + (isEnglish ? 'Medication Days' : '服藥天數') + colon + '</strong>' + medDays + (isEnglish ? ' days ' : '天　');
        }
        if (medFreq) {
            medInfoLocalized += '<strong>' + (isEnglish ? 'Daily Frequency' : '每日次數') + colon + '</strong>' + medFreq + (isEnglish ? ' times ' : '次　');
        }
        if (consultation.usage) {
            medInfoLocalized += '<strong>' + (isEnglish ? 'Administration Method' : '服用方法') + colon + '</strong>' + window.escapeHtml(String(consultation.usage));
        }
        // 若本次診症沒有開藥（無純文字處方內容，也無多處方項目），收據不顯示服用方法等服藥資訊
        const hasPrescribedMedication = !!String(originalPrescription || '').trim() || G.consultationHasPrescription(consultation);
        if (!hasPrescribedMedication) {
            medInfoHtml = '';
            medInfoLocalized = '';
        }
        // Translation dictionary for receipt labels
        const TR = {
            title: isEnglish ? 'Receipt' : '收　據',
            receiptNo: isEnglish ? 'Receipt No' : '收據編號',
            patientName: isEnglish ? 'Patient Name' : '病人姓名',
            medicalRecordNo: isEnglish ? 'Medical Record No' : '病歷編號',
            patientNumber: isEnglish ? 'Patient ID' : '病人號碼',
            consultationDate: isEnglish ? 'Date' : '診療日期',
            consultationTime: isEnglish ? 'Time' : '診療時間',
            doctorName: isEnglish ? 'Attending Physician' : '主治醫師',
            registrationNo: isEnglish ? 'Registration No' : '註冊編號',
            diagnosis: isEnglish ? 'Diagnosis' : '診斷',
            syndrome: isEnglish ? 'Pattern' : '證型',
            billingDetails: isEnglish ? 'Billing Details' : '收費明細',
            amountDue: isEnglish ? 'Amount Due' : '應收金額',
            prescription: isEnglish ? 'Prescription' : '處方內容',
            instructions: isEnglish ? '⚠️ Instructions & Precautions' : '⚠️ 醫囑及注意事項',
            followUp: isEnglish ? '📅 Suggested Follow-up Time' : '📅 建議複診時間',
            thankYou: isEnglish ? 'Thank you for your visit. Stay healthy!' : '謝謝您的光臨，祝您身體健康！',
            issuedTime: isEnglish ? 'Receipt Issued At' : '收據開立時間',
            clinicHours: isEnglish ? 'Clinic Hours' : '診所營業時間',
            keepReceipt: isEnglish ? 'Please keep this receipt properly' : '本收據請妥善保存',
            contactCounter: isEnglish ? 'If you have any questions, please contact the counter' : '如有疑問請洽櫃檯'
        };
        const clinicPrint = await G.resolveClinicSettingsByConsultation(consultation);
        const receiptVisibility = G.mergeReceiptVisibilitySettings(clinicPrint && clinicPrint.receiptFieldVisibility).receipt;
        const customThankYouText = (clinicPrint && clinicPrint.receiptThankYouText) ? String(clinicPrint.receiptThankYouText).trim() : '';
        const layout = G.getReceiptPrintLayoutConfig(G.getClinicReceiptPaperSize(clinicPrint), 'receipt');
        const hideDoctorInfo = G.shouldHideGeneralRegistrationDoctorInfo(consultation, null);
        const hideDiagnosisInfo = G.isGeneralRegistrationConsultation(consultation);
        // Construct receipt HTML with localized labels
        const printContent = `
            <!DOCTYPE html>
            <html lang="${htmlLang}">
            <head>
                <meta charset="UTF-8">
                <title>${TR.title} - ${window.escapeHtml(patient.name)}</title>
                <style>
                    body { 
                        font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; 
                        margin: 0; 
                        padding: ${layout.bodyPadding}; 
                        line-height: 1.3;
                        font-size: ${layout.bodyFontSize};
                    }
                    .receipt-container {
                        width: ${layout.containerWidth};
                        height: ${layout.containerHeight};
                        margin: 0 auto;
                        border: 2px solid #000;
                        padding: ${layout.containerPadding};
                        background: white;
                        box-sizing: border-box;
                    }
                    .clinic-header {
                        text-align: center;
                        border-bottom: 2px double #000;
                        padding-bottom: ${layout.clinicHeaderPaddingBottom};
                        margin-bottom: ${layout.clinicHeaderMarginBottom};
                    }
                    .clinic-name {
                        font-size: ${layout.clinicNameFont};
                        font-weight: bold;
                        margin-bottom: 2px;
                        letter-spacing: 1px;
                    }
                    .clinic-subtitle {
                        font-size: ${layout.clinicSubtitleFont};
                        color: #666;
                        margin-bottom: 3px;
                    }
                    .receipt-title {
                        font-size: ${layout.titleFont};
                        font-weight: bold;
                        text-align: center;
                        margin: ${layout.titleMargin} 0;
                        letter-spacing: 2px;
                    }
                    .receipt-info {
                        margin-bottom: ${layout.itemsMarginY};
                    }
                    .info-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: ${layout.infoRowMarginBottom};
                        font-size: ${layout.infoFont};
                    }
                    .info-label {
                        font-weight: bold;
                    }
                    .items-section {
                        border-top: 1px solid #000;
                        border-bottom: 1px solid #000;
                        padding: ${layout.itemsPadding} 0;
                        margin: ${layout.itemsMarginY} 0;
                    }
                    .items-title {
                        font-weight: bold;
                        text-align: center;
                        margin-bottom: 6px;
                        font-size: ${layout.itemsTitleFont};
                    }
                    .items-table {
                        width: 100%;
                        font-size: ${layout.itemsTableFont};
                    }
                    .items-table td {
                        padding: ${layout.itemCellPadding};
                        border-bottom: 1px dotted #999;
                    }
                    .total-section {
                        text-align: right;
                        margin: 4px 0;
                        font-size: ${layout.totalSectionFont};
                        font-weight: bold;
                    }
                    .total-amount {
                        font-size: ${layout.totalAmountFont};
                        color: #000;
                        border: 1px solid #000;
                        padding: ${layout.totalAmountPadding};
                        display: inline-block;
                        min-width: ${layout.totalAmountMinWidth};
                        text-align: center;
                    }
                    .prescription-section {
                        margin: ${layout.itemsMarginY} 0;
                        border-top: 1px dashed #666;
                        padding-top: ${layout.itemsPadding};
                    }
                    .prescription-title {
                        font-weight: bold;
                        margin-bottom: 4px;
                        font-size: ${layout.sectionTitleFont};
                    }
                    .prescription-content {
                        background: #f9f9f9;
                        padding: ${layout.highlightPadding};
                        border: 1px solid #ddd;
                        font-size: ${layout.sectionContentFont};
                        line-height: 1.2;
                    }
                    .footer-info {
                        margin-top: ${layout.footerMarginTop};
                        border-top: 1px dashed #666;
                        padding-top: ${layout.footerPaddingTop};
                        font-size: ${layout.footerFont};
                        color: #666;
                    }
                    .footer-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: ${layout.footerRowMarginBottom};
                    }
                    .thank-you {
                        text-align: center;
                        margin: ${layout.thankYouMargin} 0;
                        font-weight: bold;
                        font-size: ${layout.thankYouFont};
                    }
                    .diagnosis-section {
                        margin: ${layout.diagnosisMarginY} 0;
                        font-size: ${layout.diagnosisFont};
                    }
                    .diagnosis-title {
                        font-weight: bold;
                        margin-bottom: 0;
                        margin-right: 4px;
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
                        .receipt-container { 
                            border: 2px solid #000;
                            width: 100%;
                            height: 100%;
                            padding: ${layout.printPadding};
                        }
                    }
                </style>
            </head>
            <body>
                <div class="receipt-container">
                    <!-- Clinic Header -->
                    <div class="clinic-header">
                        <div class="clinic-name">${window.escapeHtml(clinicPrint.chineseName || '名醫診所系統')}</div>
                        <div class="clinic-subtitle">${window.escapeHtml(clinicPrint.englishName || 'Dr.Great Clinic')}</div>
                        <div class="clinic-subtitle">${isEnglish ? 'Tel:' : '電話：'}${window.escapeHtml(clinicPrint.phone || '(852) 2345-6789')}　${isEnglish ? 'Address:' : '地址：'}${window.escapeHtml(clinicPrint.address || '香港中環皇后大道中123號')}</div>
                    </div>
                    
                    <!-- Receipt Title -->
                    <div class="receipt-title">${TR.title}</div>
                    
                    <!-- Basic Information -->
                    <div class="receipt-info">
                        ${receiptVisibility.receiptNo ? `
                        <div class="info-row">
                            <span class="info-label">${TR.receiptNo}${colon}</span>
                            <span>R${consultation.id.toString().padStart(6, '0')}</span>
                        </div>
                        ` : ''}
                        <div class="info-row">
                            <span class="info-label">${TR.patientName}${colon}</span>
                            <span>${window.escapeHtml(patient.name)}</span>
                        </div>
                        ${receiptVisibility.medicalRecordNo ? `
                        <div class="info-row">
                            <span class="info-label">${TR.medicalRecordNo}${colon}</span>
                            <span>${window.escapeHtml(String(consultation.medicalRecordNumber || consultation.id))}</span>
                        </div>
                        ` : ''}
                        ${receiptVisibility.patientNumber ? `
                        <div class="info-row">
                            <span class="info-label">${TR.patientNumber}${colon}</span>
                            <span>${window.escapeHtml(patient.patientNumber || '-')}</span>
                        </div>
                        ` : ''}
                        ${receiptVisibility.consultationDate ? `
                        <div class="info-row">
                            <span class="info-label">${TR.consultationDate}${colon}</span>
                            <span>${consultationDate.toLocaleDateString(dateLocale, {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit'
                            })}</span>
                        </div>
                        ` : ''}
                        ${receiptVisibility.consultationTime ? `
                        <div class="info-row">
                            <span class="info-label">${TR.consultationTime}${colon}</span>
                            <span>${consultationDate.toLocaleTimeString(dateLocale, {
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</span>
                        </div>
                        ` : ''}
                        ${hideDoctorInfo ? '' : `
                        <div class="info-row">
                            <span class="info-label">${TR.doctorName}${colon}</span>
                            <span>${window.escapeHtml(G.getDoctorDisplayName(consultation.doctor))}</span>
                        </div>
                        `}
                        ${hideDoctorInfo ? '' : (() => {
                            const regNumber = G.getDoctorRegistrationNumber(consultation.doctor);
                            return regNumber ? `
                                <div class="info-row">
                                    <span class="info-label">${TR.registrationNo}${colon}</span>
                                    <span>${window.escapeHtml(regNumber)}</span>
                                </div>
                            ` : '';
                        })()}
                    </div>
                    
                    <!-- Diagnosis Info -->
                    ${!hideDiagnosisInfo && consultation.diagnosis ? `
                    <div class="diagnosis-section">
                        <div>
                            <span class="diagnosis-title">${TR.diagnosis}${colon}</span>
                            <span>${window.escapeHtml(consultation.diagnosis)}</span>
                        </div>
                        ${consultation.syndrome ? `
                        <div>
                            <span class="diagnosis-title">${TR.syndrome}${colon}</span>
                            <span>${window.escapeHtml(consultation.syndrome)}</span>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}
                    
                    <!-- Billing Items -->
                    ${consultation.billingItems ? `
                    <div class="items-section">
                        <div class="items-title">${TR.billingDetails}</div>
                        <table class="items-table">
                            ${billingItemsHtml}
                        </table>
                    </div>
                    ` : ''}
                    
                    <!-- Total Amount -->
                    <div class="total-section">
                        <div style="margin-bottom: 4px; font-size: ${layout.totalLabelFont};">${TR.amountDue}${colon}</div>
                        <div class="total-amount">HK$ ${totalAmount.toLocaleString()}</div>
                    </div>
                    
                    <!-- Prescription Section -->
                    ${consultation.prescription ? `
                    <div class="prescription-section">
                        <div class="prescription-title">📋 ${TR.prescription}</div>
                        <div class="prescription-content">${(() => {
                                const lines = consultation.prescription.split('\n').filter(line => line.trim());
                                // 解析結構化處方資料，建立名稱映射，用於查找方劑組成
                                const structuredMap = {};
                                if (consultation.prescriptionStructured) {
                                    try {
                                        const _arr = JSON.parse(consultation.prescriptionStructured);
                                        if (Array.isArray(_arr)) {
                                            _arr.forEach((itm) => {
                                                if (itm && itm.name) {
                                                    structuredMap[itm.name] = itm;
                                                }
                                            });
                                        }
                                    } catch (_e) {
                                        /* 忽略解析錯誤 */
                                    }
                                }
                                const allItems = [];
                            let i = 0;
                            while (i < lines.length) {
                                const line = lines[i].trim();
                                if (!line) {
                                    i++;
                                    continue;
                                }
                                const itemMatch = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)g$/);
                                if (itemMatch) {
                                    const itemName = itemMatch[1].trim();
                                    const dosage = itemMatch[2];
                                    const isFormula = ['湯','散','丸','膏','飲','丹','煎','方','劑'].some(suffix => itemName.includes(suffix));
                                    if (isFormula) {
                                        // 嘗試從結構化資料取得方劑組成
                                        let compositionText = '';
                                        try {
                                            const structuredItem = structuredMap[itemName];
                                            if (structuredItem && structuredItem.composition) {
                                                compositionText = String(structuredItem.composition);
                                            }
                                        } catch (_e) {
                                            /* 忽略錯誤 */
                                        }
                                        // 如果結構化資料無組成，再從 G.herbLibrary 取得
                                        if (!compositionText) {
                                            try {
                                                if (Array.isArray(G.herbLibrary)) {
                                                    const fullItem = G.herbLibrary.find(h => h && h.name === itemName && h.type === 'formula');
                                                    if (fullItem && fullItem.composition) {
                                                        compositionText = String(fullItem.composition);
                                                    }
                                                }
                                            } catch (_e) {
                                                /* 忽略錯誤 */
                                            }
                                        }
                                        // 若仍未取得組成，檢查下一行是否為組成
                                        if (!compositionText) {
                                            if (i + 1 < lines.length) {
                                                const nextLine = lines[i + 1].trim();
                                                if (nextLine && !nextLine.match(/^.+?\s+\d+(?:\.\d+)?g$/)) {
                                                    compositionText = nextLine;
                                                    i++;
                                                }
                                            }
                                        }
                                        // 對組成做後處理：僅保留藥材名稱
                                        let processedComposition = '';
                                        if (compositionText) {
                                            try {
                                                const parts = String(compositionText)
                                                    .replace(/\r/g, '')
                                                    .split(/[、\n]/)
                                                    .map(p => p
                                                        .replace(/\d+(?:\.\d+)?\s*(?:g|克|錢|兩|丸|包)?/gi, '')
                                                        .replace(/[()（）\[\]]/g, '')
                                                        .trim()
                                                    )
                                                    .filter(p => p);
                                                processedComposition = parts.join('、');
                                            } catch (_err) {
                                                processedComposition = String(compositionText).replace(/\n/g, '、');
                                            }
                                        }
                                        // 將括號及其內容縮小至三分之一大小（藥名與組成皆為文字，須跳脫）
                                        const compWrap = processedComposition ? `<span style="font-size: 0.33em;">（${window.escapeHtml(processedComposition)}）</span>` : '';
                                        allItems.push(`${window.escapeHtml(itemName)} ${dosage}g${compWrap}`);
                                    } else {
                                        allItems.push(`${window.escapeHtml(itemName)}${dosage}g`);
                                    }
                                } else {
                                    allItems.push(`<div style="margin: 2px 0; font-size: 9px; color: #666;">${window.escapeHtml(line)}</div>`);
                                }
                                i++;
                            }
                            const regularItems = allItems.filter(item => typeof item === 'string' && !item.includes('<div'));
                            const specialLines = allItems.filter(item => typeof item === 'string' && item.includes('<div'));
                            let result = '';
                            // 先加入其他說明行
                            specialLines.forEach(line => {
                                result += line;
                            });
                            if (regularItems.length > 0) {
                                // 調整順序：方劑在前、藥材其後
                                const formulasArr = [];
                                const herbsArr = [];
                                regularItems.forEach(it => {
                                    try {
                                        const hasDose = /\d+(?:\.\d+)?g/.test(it);
                                        const isFormulaItem = /[湯散丸膏飲丹煎方劑]/.test(it);
                                        if (hasDose && isFormulaItem) {
                                            formulasArr.push(it);
                                        } else {
                                            herbsArr.push(it);
                                        }
                                    } catch (_err) {
                                        herbsArr.push(it);
                                    }
                                });
                                const joined = formulasArr.concat(herbsArr).join('、');
                                result += `<div style="margin: 2px 0;">${joined}</div>`;
                            }
                            return result || window.escapeHtml(consultation.prescription).replace(/\n/g, '<br>');
                        })()}</div>
                        ${medInfoLocalized ? `
                        <div style="margin-top: 8px; font-size: ${layout.sectionTitleFont};">${medInfoLocalized}</div>
                        ` : ''}
                    </div>
                    ` : ''}
                    
                    <!-- Instructions -->
                    ${consultation.instructions ? `
                    <div style="margin: 6px 0; font-size: ${layout.sectionContentFont}; background: #fff3cd; padding: ${layout.highlightPadding}; border: 1px solid #ffeaa7;">
                        <strong>${TR.instructions}${colon}</strong><br>
                        ${window.escapeHtml(consultation.instructions)}
                    </div>
                    ` : ''}
                    
                    <!-- Follow-up Reminder -->
                    ${consultation.followUpDate ? `
                    <div style="margin: 10px 0; font-size: ${layout.sectionTitleFont}; background: #e3f2fd; padding: ${layout.highlightPadding}; border: 1px solid #90caf9;">
                        <strong>${TR.followUp}${colon}</strong><br>
                        ${new Date(consultation.followUpDate).toLocaleString(dateLocale)}
                    </div>
                    ` : ''}
                    
                    <!-- Thank You -->
                    <div class="thank-you">
                        ${customThankYouText ? window.escapeHtml(customThankYouText) : TR.thankYou}
                    </div>
                    
                    <!-- Footer -->
                    <div class="footer-info">
                        <div class="footer-row">
                            <span>${TR.issuedTime}${colon}</span>
                            <span>${new Date().toLocaleString(dateLocale)}</span>
                        </div>
                        <div class="footer-row">
                            <span>${TR.clinicHours}${colon}</span>
                            <span>${window.escapeHtml(clinicPrint.businessHours || '週一至週五 09:00-18:00')}</span>
                        </div>
                        <div class="footer-row">
                            <span>${TR.keepReceipt}</span>
                            <span>${TR.contactCounter}</span>
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

        // Restore original prescription, instructions and follow-up date after printing
        consultation.prescription = originalPrescription;
        consultation.instructions = originalInstructions;
        consultation.followUpDate = originalFollowUpDate;

        G.showToast(isEnglish ? 'Receipt is ready for printing!' : '中醫診所收據已準備列印！', 'success');
        
    } catch (error) {
        console.error('列印收據錯誤:', error);
        G.showToast('列印收據時發生錯誤', 'error');
    }
}
        