/* ============================================================
 * print/prescription.js — 處方（方藥醫囑）列印（診症記錄＋掛號入口）
 * 由 system.js 原樣遷移（2026-10，漸進 ESM 化 Phase 1），
 * 差異僅限：以 G 存取尚未遷移的舊全域。
 * ============================================================ */

import { G } from '../../lib/legacy.js';

// 新增：從掛號記錄列印方藥醫囑
export async function printPrescriptionInstructionsFromAppointment(appointmentId) {
    const appointment = G.appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        G.showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 只能列印已完成診症的方藥醫囑
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        G.showToast('只能列印已完成診症的藥單醫囑！', 'error');
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
            loadingButton = document.querySelector('button[onclick="printPrescriptionInstructionsFromAppointment(' + appointmentId + ')"]');
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
        // 調用方藥醫囑列印功能
        await printPrescriptionInstructions(consultation.id, consultation);
    } catch (error) {
        console.error('列印藥單醫囑錯誤:', error);
        G.showToast('列印藥單醫囑時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

/**
 * 列印方藥醫囑收據頁面。
 * 內容包含處方內容、服藥天數、每日次數、服用方法、醫囑及注意事項以及建議複診時間。
 * @param {number|string} consultationId 診症 ID
 * @param {object|null} consultationData 可選，若已提供診症資料則直接使用
 */
export async function printPrescriptionInstructions(consultationId, consultationData = null) {
    let consultation = consultationData;
    const idToFind = String(consultationId);
    // 若未提供診症資料，從 Firebase 讀取
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
        // 解析診療日期
        let consultationDate;
        if (consultation.date && consultation.date.seconds) {
            consultationDate = new Date(consultation.date.seconds * 1000);
        } else if (consultation.date) {
            consultationDate = new Date(consultation.date);
        } else {
            consultationDate = new Date();
        }
        // 組合處方內容（支援多處方）
        let prescriptionHtml = '';
        const hasMulti = !!consultation.multiPrescriptions;
        if (hasMulti) {
            try {
                const mp = JSON.parse(consultation.multiPrescriptions);
                if (Array.isArray(mp) && mp.length > 0) {
                    let html = '';
                    const showNames = mp.length > 1;
                    const formulaCompositions = [];
                    mp.forEach((section, sIdx) => {
                        const secName = section && section.name ? section.name : `處方${sIdx + 1}`;
                        const items = Array.isArray(section && section.items) ? section.items : [];
                        const entries = items.map(it => {
                            const dose = it.customDosage || (it.type === 'herb' ? '1' : '5');
                            const unit = 'g';
                            return `${window.escapeHtml(it.name)} ${window.escapeHtml(String(dose) + unit)}`;
                        });
                        try {
                            items.filter(it => it && it.type === 'formula').forEach(it => {
                                let compositionText = it && it.composition ? String(it.composition) : '';
                                if (!compositionText) {
                                    try {
                                        if (Array.isArray(G.herbLibrary)) {
                                            const fullItem = G.herbLibrary.find(h => h && String(h.id) === String(it.id) && h.type === 'formula');
                                            if (fullItem && fullItem.composition) compositionText = String(fullItem.composition);
                                        }
                                    } catch (_e) {}
                                }
                                let processed = '';
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
                                        processed = parts.join('、');
                                    } catch (_err) {
                                        processed = compositionText.replace(/\n/g, '、');
                                    }
                                }
                                if (processed) {
                                    formulaCompositions.push({ name: it.name, composition: processed });
                                }
                            });
                        } catch (_e) {}
                        const modeLabel = (section && section.mode === 'granule') ? '顆粒沖劑' : ((section && section.mode === 'slice') ? '飲片' : '');
                        const nameWithMode = showNames ? `<div style="font-weight:bold;margin-bottom:2px;">${window.escapeHtml(secName)}${modeLabel ? `<span style="font-size:0.5em;">（${window.escapeHtml(modeLabel)}）</span>` : ''}</div>` : '';
                        let rows = '';
                        for (let i2 = 0; i2 < entries.length; i2 += 4) {
                            const a = entries[i2] || '&nbsp;';
                            const b = entries[i2 + 1] || '&nbsp;';
                            const c = entries[i2 + 2] || '&nbsp;';
                            const d = entries[i2 + 3] || '&nbsp;';
                            rows += `<div style="display:flex;align-items:center;margin-bottom:4px;">
                                        <div style="flex:1;text-align:left;">${a}</div>
                                        <div style="flex:1;text-align:center;">${b}</div>
                                        <div style="flex:1;text-align:center;">${c}</div>
                                        <div style="flex:1;text-align:right;">${d}</div>
                                    </div>`;
                        }
                        html += `<div style="margin-bottom:6px;">${nameWithMode}${rows}</div>`;
                    });
                    let compositionHtml = '';
                    if (formulaCompositions.length > 0) {
                        compositionHtml += '<div style="margin-top: 4px; font-size: calc(0.5em + 2pt);">';
                        compositionHtml += formulaCompositions.map(fc => 
                            `<span style="display:inline-block;margin-right:12px;">${window.escapeHtml(fc.name)}：${window.escapeHtml(fc.composition)}</span>`
                        ).join('');
                        compositionHtml += '</div>';
                    }
                    prescriptionHtml = html + compositionHtml;
                } else {
                    prescriptionHtml = '無記錄';
                }
            } catch (_e) {
                prescriptionHtml = '無記錄';
            }
        } else if (consultation.prescription) {
            try {
                // 解析處方內容行並移除空行
                const lines = consultation.prescription.split('\n').filter(line => line.trim());
                // 解析結構化處方，建立名稱對應的結構化項目映射，用於查找方劑的組成資訊
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
                        /* 忽略 JSON 解析錯誤 */
                    }
                }
                const itemsList = [];
                // 儲存所有方劑及其組成，以便在處方內容左下角列出
                const formulaCompositions = [];
                let i = 0;
                // 將每個條目處理為單獨的 HTML 區塊
                while (i < lines.length) {
                    const raw = lines[i].trim();
                    if (!raw) {
                        i++;
                        continue;
                    }
                    // 判斷是否符合「名稱 劑量g」格式
                    const match = raw.match(/^(.+?)\s+(\d+(?:\.\d+)?)g$/);
                    if (match) {
                        const itemName = match[1].trim();
                        const dosage = match[2];
                        const isFormula = ['湯','散','丸','膏','飲','丹','煎','方','劑'].some(suffix => itemName.includes(suffix));
                        if (isFormula) {
                            // 如果是方劑，嘗試先從結構化處方資料中取得組成資訊；若無則從 G.herbLibrary 或下一行獲取
                            let compositionText = '';
                            // 先從結構化資料取得
                            try {
                                const structuredItem = structuredMap[itemName];
                                if (structuredItem && structuredItem.composition) {
                                    compositionText = String(structuredItem.composition);
                                }
                            } catch (_e) {
                                /* ignore */
                            }
                            // 若結構化資料中無組成，則查找 G.herbLibrary
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
                            // 若仍無組成資訊，則視下一行為組成（若非藥材格式）
                            if (!compositionText) {
                                if (i + 1 < lines.length) {
                                    const nextLine = lines[i + 1].trim();
                                    if (nextLine && !nextLine.match(/^.+?\s+\d+(?:\.\d+)?g$/)) {
                                        compositionText = nextLine;
                                        i++; // 跳過下一行作為組成
                                    }
                                }
                            }
                            // 處理組成文字：將換行與頓號分隔並移除劑量與單位，只保留藥材名稱
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
                                    processedComposition = compositionText.replace(/\n/g, '、');
                                }
                            }
                            // 若有組成資訊，收集起來，稍後在處方內容左下角列出，不再於主列表中顯示
                            if (processedComposition) {
                                try {
                                    formulaCompositions.push({ name: itemName, composition: processedComposition });
                                } catch (_err) {
                                    // ignore
                                }
                            }
                            // 方劑在主列表僅顯示名稱與劑量，不顯示組成（藥名為文字，須跳脫）
                            itemsList.push(`<div style="margin-bottom: 4px;">${window.escapeHtml(itemName)} ${dosage}g</div>`);
                        } else {
                            // 普通藥材區塊
                            itemsList.push(`<div style="margin-bottom: 4px;">${window.escapeHtml(itemName)} ${dosage}g</div>`);
                        }
                    } else {
                        // 其他說明行直接以較小字體顯示
                        itemsList.push(`<div style="margin-bottom: 4px; font-size: 9px; color: #666;">${window.escapeHtml(raw)}</div>`);
                    }
                    i++;
                }
                if (itemsList.length > 0) {
                    const orderedItems = itemsList;
                    let html = '';
                    for (let j = 0; j < orderedItems.length; j += 4) {
                        const a = orderedItems[j] || '<div style="visibility:hidden;">&nbsp;</div>';
                        const b = orderedItems[j + 1] || '<div style="visibility:hidden;">&nbsp;</div>';
                        const c = orderedItems[j + 2] || '<div style="visibility:hidden;">&nbsp;</div>';
                        const d = orderedItems[j + 3] || '<div style="visibility:hidden;">&nbsp;</div>';
                        html += `<div style="display:flex;align-items:center;margin-bottom:0;">
                                    <div style="flex:1;text-align:left;">${a}</div>
                                    <div style="flex:1;text-align:center;">${b}</div>
                                    <div style="flex:1;text-align:center;">${c}</div>
                                    <div style="flex:1;text-align:right;">${d}</div>
                                 </div>`;
                    }
                    // 方劑組成橫向排列（每行四個）
                    let compositionHtml = '';
                    if (formulaCompositions.length > 0) {
                        compositionHtml += '<div style="margin-top: 4px; font-size: calc(0.5em + 2pt);">';
                        compositionHtml += formulaCompositions.map(fc => 
                            `<span style="display:inline-block;margin-right:12px;">${window.escapeHtml(fc.name)}：${window.escapeHtml(fc.composition)}</span>`
                        ).join('');
                        compositionHtml += '</div>';
                    }
                    prescriptionHtml = html + compositionHtml;
                } else {
                    // 若未能解析任何項目，直接以換行顯示原始內容（先跳脫再保留換行）
                    prescriptionHtml = window.escapeHtml(consultation.prescription).replace(/\n/g, '<br>');
                }
            } catch (_e) {
                // 解析出錯時，退回顯示原始處方內容
                prescriptionHtml = window.escapeHtml(consultation.prescription).replace(/\n/g, '<br>');
            }
        } else {
            // 無處方內容
            prescriptionHtml = '無記錄';
        }
        // 判斷本次診症是否有開藥；沒有開藥時隱藏處方內容與服藥資訊欄位
        const hasPrescription = G.consultationHasPrescription(consultation);
        // 語言設定
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        const isEnglish = lang === 'en';
        const htmlLang = isEnglish ? 'en' : 'zh-TW';
        const dateLocale = isEnglish ? 'en-US' : 'zh-TW';
        const colon = isEnglish ? ': ' : '：';
        // 組合服藥資訊（支援多處方）
        let medDays = '';
        let medFreq = '';
        let medLines = [];
        if (hasMulti) {
            try {
                const mp = JSON.parse(consultation.multiPrescriptions);
                if (Array.isArray(mp)) {
                    const showNames = mp.length > 1;
                    medLines = mp.map((section, idx) => {
                        const secName = section && section.name ? section.name : (isEnglish ? `Prescription ${idx + 1}` : `處方${idx + 1}`);
                        const d = parseInt(section && section.days) || 0;
                        const f = parseInt(section && section.freq) || (parseInt(consultation.medicationFrequency) || 0);
                        const labelDays = isEnglish ? 'Number of days' : '服藥天數';
                        const labelFreq = isEnglish ? 'Times per day' : '每日次數';
                        const partDays = d > 0 ? `${labelDays}${colon}${d}${isEnglish ? ' days' : '天'}` : '';
                        const partFreq = f > 0 ? `${labelFreq}${colon}${f}${isEnglish ? '' : '次'}` : '';
                        const combined = [partDays, partFreq].filter(Boolean).join('      ');
                        return combined ? `${showNames ? (window.escapeHtml(secName) + colon) : ''}${combined}` : '';
                    }).filter(x => x);
                }
            } catch (_e) {}
        } else {
            if (consultation && consultation.medicationDays && Number(consultation.medicationDays) > 0) {
                medDays = consultation.medicationDays;
            }
        }
        if (consultation && consultation.medicationFrequency && Number(consultation.medicationFrequency) > 0) {
            medFreq = consultation.medicationFrequency;
        }
        // 組合服藥資訊
        let medInfoHtml = '';
        if (hasMulti) {
            if (medLines.length > 0) {
                const rows = [];
                for (let i = 0; i < medLines.length; i += 2) {
                    const left = medLines[i] || '';
                    const right = medLines[i + 1] || '';
                    rows.push(
                        `<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
                            <div style="flex:1;">${left}</div>
                            ${right ? `<div style="flex:1;text-align:right;">${right}</div>` : `<div style="flex:1;"></div>`}
                        </div>`
                    );
                }
                medInfoHtml += rows.join('');
            }
            if (consultation.usage) {
                medInfoHtml += `<div><strong>${isEnglish ? 'Usage' : '服用方法'}${colon}</strong>${window.escapeHtml(String(consultation.usage))}</div>`;
            }
        } else {
            if (medDays) {
                medInfoHtml += `<strong>${isEnglish ? 'Number of days' : '服藥天數'}${colon}</strong>${medDays}${isEnglish ? ' days' : '天'}&nbsp;`;
            }
            if (medFreq) {
                medInfoHtml += `<strong>${isEnglish ? 'Times per day' : '每日次數'}${colon}</strong>${medFreq}${isEnglish ? '' : '次'}&nbsp;`;
            }
            if (consultation.usage) {
                medInfoHtml += `<strong>${isEnglish ? 'Usage' : '服用方法'}${colon}</strong>${window.escapeHtml(String(consultation.usage))}`;
            }
            if (!consultation.prescription || (typeof consultation.prescription === 'string' && consultation.prescription.trim() === '')) {
                medInfoHtml = '';
            }
        }
        // 醫囑及注意事項（先跳脫再保留換行）
        const instructionsHtml = consultation.instructions ? window.escapeHtml(String(consultation.instructions)).replace(/\n/g, '<br>') : '';
        // 建議複診時間，根據語言格式化
        let followUpHtml = '';
        if (consultation.followUpDate) {
            try {
                if (consultation.followUpDate.seconds) {
                    followUpHtml = new Date(consultation.followUpDate.seconds * 1000).toLocaleString(dateLocale);
                } else {
                    followUpHtml = new Date(consultation.followUpDate).toLocaleString(dateLocale);
                }
            } catch (_err) {
                try {
                    followUpHtml = G.formatConsultationDateTime(consultation.followUpDate);
                } catch (_e2) {
                    followUpHtml = '';
                }
            }
        }
        // 翻譯字典
        const PI = {
            title: isEnglish ? 'Prescription Instructions' : '藥單醫囑',
            patientName: isEnglish ? 'Patient Name' : '病人姓名',
            medicalRecordNo: isEnglish ? 'Medical Record No.' : '病歷編號',
            patientNo: isEnglish ? 'Patient No.' : '病人號碼',
            consultationDate: isEnglish ? 'Consultation Date' : '診療日期',
            consultationTime: isEnglish ? 'Time' : '診療時間',
            doctor: isEnglish ? 'Attending Physician' : '主治醫師',
            registrationNo: isEnglish ? 'Registration No.' : '註冊編號',
            diagnosis: isEnglish ? 'Diagnosis' : '診斷',
            prescriptionContent: isEnglish ? 'Prescription Contents' : '處方內容',
            medicationInfo: isEnglish ? 'Medication Information' : '服藥資訊',
            instructions: isEnglish ? 'Instructions & Precautions' : '醫囑及注意事項',
            followUp: isEnglish ? 'Suggested Follow-up Time' : '建議複診時間',
            thankYou: isEnglish ? 'Thank you for your visit. Wishing you good health!' : '謝謝您的光臨，祝您身體健康！',
            printTime: isEnglish ? 'Print Time' : '列印時間',
            businessHours: isEnglish ? 'Clinic Business Hours' : '診所營業時間',
            saveAdvice: isEnglish ? 'Please keep this advice safe, this prescription cannot be refilled.' : '本醫囑請妥善保存，此藥方不可重配',
            contact: isEnglish ? 'If you have any questions, please contact the front desk.' : '如有疑問請洽櫃檯'
        };
        const clinicPrint = await G.resolveClinicSettingsByConsultation(consultation);
        const prescriptionVisibility = G.mergeReceiptVisibilitySettings(clinicPrint && clinicPrint.receiptFieldVisibility).prescription;
        const layout = G.getReceiptPrintLayoutConfig(G.getClinicReceiptPaperSize(clinicPrint), 'advice');
        const hideDoctorInfo = G.shouldHideGeneralRegistrationDoctorInfo(consultation, null);
        // 構建列印內容
        const printContent = `
            <!DOCTYPE html>
            <html lang="${htmlLang}">
            <head>
                <meta charset="UTF-8">
                <title>${PI.title} - ${window.escapeHtml(patient.name)}</title>
                <style>
                    body {
                        font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif;
                        margin: 0;
                        padding: ${layout.bodyPadding};
                        line-height: 1.3;
                        font-size: ${layout.bodyFontSize};
                    }
                    .advice-container {
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
                    .advice-title {
                        font-size: ${layout.titleFont};
                        font-weight: bold;
                        text-align: center;
                        margin: ${layout.titleMargin} 0;
                        letter-spacing: 2px;
                    }
                    .patient-info {
                        margin-bottom: ${layout.footerPaddingTop};
                        font-size: ${layout.infoFont};
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
                    .section-title {
                        font-weight: bold;
                        margin-top: ${layout.sectionTitleMarginTop};
                        margin-bottom: ${layout.sectionTitleMarginBottom};
                        font-size: ${layout.sectionTitleFont};
                    }
                    .section-content {
                        background: #f9f9f9;
                        padding: ${layout.sectionContentPadding};
                        border: 1px solid #ddd;
                        font-size: ${layout.sectionContentFont};
                        line-height: 1.3;
                        border-radius: 3px;
                    }
                    .thank-you {
                        text-align: center;
                        margin: ${layout.thankYouMargin} 0;
                        font-size: ${layout.thankYouFont};
                        font-weight: bold;
                        color: #333;
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
                        margin-bottom: 2px;
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
                        .advice-container {
                            width: 100%;
                            height: 100%;
                            padding: ${layout.printPadding};
                        }
                    }
                </style>
            </head>
            <body>
                <div class="advice-container">
                    <div class="clinic-header">
                        <div class="clinic-name">${window.escapeHtml(clinicPrint.chineseName || '名醫診所系統')}</div>
                        <div class="clinic-subtitle">${window.escapeHtml(clinicPrint.englishName || 'Dr.Great Clinic')}</div>
                        <div class="clinic-subtitle">${isEnglish ? 'Tel' : '電話'}${colon}${window.escapeHtml(clinicPrint.phone || '(852) 2345-6789')}　${isEnglish ? 'Address' : '地址'}${colon}${window.escapeHtml(clinicPrint.address || '香港中環皇后大道中123號')}</div>
                    </div>
                    <div class="advice-title">${PI.title}</div>
                    <div class="patient-info">
                        <div class="info-row"><span class="info-label">${PI.patientName}${colon}</span><span>${window.escapeHtml(patient.name)}</span></div>
                        ${prescriptionVisibility.medicalRecordNo ? `<div class="info-row"><span class="info-label">${PI.medicalRecordNo}${colon}</span><span>${window.escapeHtml(String(consultation.medicalRecordNumber || consultation.id))}</span></div>` : ''}
                        ${prescriptionVisibility.patientNumber ? `<div class="info-row"><span class="info-label">${PI.patientNo}${colon}</span><span>${window.escapeHtml(patient.patientNumber || '-')}</span></div>` : ''}
                        ${prescriptionVisibility.consultationDate ? `<div class="info-row"><span class="info-label">${PI.consultationDate}${colon}</span><span>${consultationDate.toLocaleDateString(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' })}</span></div>` : ''}
                        ${prescriptionVisibility.consultationTime ? `<div class="info-row"><span class="info-label">${PI.consultationTime}${colon}</span><span>${consultationDate.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}</span></div>` : ''}
                        ${hideDoctorInfo ? '' : `<div class="info-row"><span class="info-label">${PI.doctor}${colon}</span><span>${window.escapeHtml(G.getDoctorDisplayName(consultation.doctor))}</span></div>`}
                        ${hideDoctorInfo ? '' : (() => {
                            const regNumber = G.getDoctorRegistrationNumber(consultation.doctor);
                            return regNumber ? `<div class="info-row"><span class="info-label">${PI.registrationNo}${colon}</span><span>${window.escapeHtml(regNumber)}</span></div>` : '';
                        })()}
                        ${consultation.diagnosis ? `<div class="info-row"><span class="info-label">${PI.diagnosis}${colon}</span><span>${window.escapeHtml(consultation.diagnosis)}</span></div>` : ''}
                    </div>
                    ${hasPrescription ? `<div class="section-title">${PI.prescriptionContent}</div>
                    <div class="section-content">${prescriptionHtml}</div>` : ''}
                    ${(hasPrescription && medInfoHtml) ? `<div class="section-title">${PI.medicationInfo}</div><div class="section-content">${medInfoHtml}</div>` : ''}
                    ${instructionsHtml ? `<div class="section-title">${PI.instructions}</div><div class="section-content">${instructionsHtml}</div>` : ''}
                    ${followUpHtml ? `<div class="section-title">${PI.followUp}</div><div class="section-content">${followUpHtml}</div>` : ''}
                    <div class="footer-info">
                        <div class="footer-row"><span>${PI.printTime}${colon}</span><span>${new Date().toLocaleString(dateLocale)}</span></div>
                        <div class="footer-row"><span>${PI.businessHours}${colon}</span><span>${window.escapeHtml(clinicPrint.businessHours || '週一至週五 09:00-18:00')}</span></div>
                        <div class="footer-row"><span>${PI.saveAdvice}</span><span>${PI.contact}</span></div>
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
        G.showToast(isEnglish ? 'Prescription instructions are ready for printing!' : '藥單醫囑已準備列印！', 'success');
    } catch (error) {
        console.error('列印藥單醫囑錯誤:', error);
        G.showToast('列印藥單醫囑時發生錯誤', 'error');
    }
}