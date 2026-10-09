/* ============================================================
 * consultation/postvisit.js — 診後：病歷彈窗與分頁、套票使用記錄、
 * 套票/錢包扣減與餘額、撤回診症、病歷編輯入口、診症摘要載入
 * （Phase 6 子批 D2）。共享狀態經 G；套票/儲存/權限走 window facade。
 ============================================================ */
import { G } from '../../lib/legacy.js';
import { touchPatientsMeta, refreshOpenConsultationHistory } from '../patients/store.js';

        export async function changeConsultationHistoryPage(direction, evt) {
            let loadingButton = null;
            try {
                loadingButton = (evt && evt.currentTarget) ? evt.currentTarget : null;
            } catch (_e) {}
            if (loadingButton) {
                G.setButtonLoading(loadingButton, '讀取中...');
            }
            if (await G.consultationHistoryPager.changePage('consultation', direction)) {
                displayConsultationMedicalHistoryPage();
                return;
            }
            if (loadingButton) {
                G.clearButtonLoading(loadingButton);
            }
        }
        
        // 關閉診症記錄彈窗
        export function closeMedicalHistoryModal() {
            document.getElementById('medicalHistoryModal').classList.add('hidden');
            closeHistoryCalendar('consultation');
            G.consultationHistoryPager.close('consultation');
        }

// ===== 套票使用餘下次數相關共用函數（收據列印與診症記錄檢視共用）=====

// 從診症記錄的結構化收費項目中，依序收集套票使用項目的 packageRecordId 與名稱
export function collectPackageUseRecordsFromConsultation(consultation) {
    const records = [];
    try {
        if (consultation && consultation.billingItemsStructured) {
            const parsedItems = JSON.parse(consultation.billingItemsStructured);
            if (Array.isArray(parsedItems)) {
                parsedItems.forEach(item => {
                    if (item && (item.category === 'packageUse' || (item.name && item.name.includes('使用套票')))) {
                        // 完成病歷時寫入的「使用後餘下次數」快照；0 為合法值
                        let snapshot = null;
                        if (item.remainingUsesAfterUse !== undefined && item.remainingUsesAfterUse !== null
                            && item.remainingUsesAfterUse !== '' && Number.isFinite(Number(item.remainingUsesAfterUse))) {
                            snapshot = Number(item.remainingUsesAfterUse);
                        }
                        records.push({
                            packageRecordId: item.packageRecordId ? String(item.packageRecordId) : '',
                            name: item.name ? String(item.name) : '',
                            snapshot: snapshot
                        });
                    }
                });
            }
        }
    } catch (_e) {
        // 忽略解析錯誤
    }
    return records;
}

// 移除套票使用項目的「使用套票」後綴，取得套票基礎名稱
// 例如「推拿療程 (使用套票)」或「推拿療程（使用套票）」→「推拿療程」
export function getPackageBaseName(name) {
    return String(name || '')
        .replace(/\s*[\(（]\s*使用套票\s*[\)）]\s*/g, '')
        .replace(/\s*使用套票\s*/g, '')
        .trim();
}

// 依診症記錄收費文字中「使用套票」行的出現順序，回傳各套票使用項目的餘下次數。
// 回傳值為數字陣列，與收費文字中「使用套票」行一一對應；無法判斷時該位置為 null。
// 優先使用完成病歷時固定寫入病歷的快照 remainingUsesAfterUse（不需讀取套票）；
// 只有舊記錄缺少快照時，才即時讀取病人套票，並依 packageRecordId、再以套票名稱後備比對。
export async function resolveConsultationPackageUseRemaining(consultation, patientId, forceRefresh = false) {
    const result = [];
    try {
        const text = consultation && consultation.billingItems ? String(consultation.billingItems) : '';
        if (!text || text.indexOf('使用套票') === -1) return result;

        const useRecords = collectPackageUseRecordsFromConsultation(consultation);

        // 先依文字行順序與結構化套票使用項目配對，並判斷是否所有行都已有快照
        const lineRecords = [];
        let recordIndex = 0;
        text.split('\n').forEach(line => {
            if (line.indexOf('使用套票') === -1) return;
            lineRecords.push(useRecords[recordIndex] || null);
            recordIndex++;
        });

        // 全部行都有固定快照時，直接回傳，完全不讀取套票
        if (lineRecords.length > 0 && lineRecords.every(rec => rec && typeof rec.snapshot === 'number')) {
            return lineRecords.map(rec => rec.snapshot);
        }

        // 舊記錄或缺快照的行，才即時讀取套票進行比對
        let packages = [];
        const pid = patientId || (consultation && consultation.patientId) || '';
        if (pid) {
            try {
                packages = await getPatientPackages(pid, forceRefresh) || [];
            } catch (_e) {
                packages = [];
            }
        }

        // 同名套票的挑選規則與 restorePackageUseMeta 一致：
        // 優先選已使用次數較多者，次數相同則選購買時間較早者，最後以 ID 排序保持穩定。
        const findPackageByName = (baseName) => {
            const candidates = packages.filter(p => p && p.name === baseName);
            if (candidates.length === 1) return candidates[0];
            if (candidates.length > 1) {
                candidates.sort((a, b) => {
                    const usedA = (Number(a.totalUses) || 0) - (Number(a.remainingUses) || 0);
                    const usedB = (Number(b.totalUses) || 0) - (Number(b.remainingUses) || 0);
                    if (usedB !== usedA) return usedB - usedA;
                    const pa = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
                    const pb = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
                    if (pa !== pb) return pa - pb;
                    if (a.id && b.id) return String(a.id).localeCompare(String(b.id));
                    return 0;
                });
                return candidates[0];
            }
            return null;
        };

        lineRecords.forEach((rec, idx) => {
            // 該行已有快照者直接使用，與即時讀取結果無關
            if (rec && typeof rec.snapshot === 'number') {
                result.push(rec.snapshot);
                return;
            }
            // 取對應文字行以做為名稱比對的後備來源
            const useLine = text.split('\n').filter(l => l.indexOf('使用套票') !== -1)[idx] || '';
            let pkg = null;
            if (rec && rec.packageRecordId) {
                pkg = packages.find(p => p && String(p.id) === String(rec.packageRecordId)) || null;
            }
            if (!pkg) {
                // 後備方案：以套票名稱比對（套用於初次診症購買套票等缺少 packageRecordId 的舊記錄）
                const baseName = getPackageBaseName(rec && rec.name ? rec.name : useLine);
                if (baseName) pkg = findPackageByName(baseName);
            }
            result.push(pkg && typeof pkg.remainingUses === 'number' ? Number(pkg.remainingUses) : null);
        });
    } catch (_e) {
        // 忽略錯誤，回傳已收集的結果
    }
    return result;
}

// 取得診症完成時的儲值餘額（與套票餘次快照同一策略）：
// 優先使用固定寫入病歷的快照 walletBalanceAfter（完成病歷當下即固定）；
// 舊記錄缺快照但有 walletPaid 時，才即時讀取帳戶（該值為目前餘額，僅作後備）。
export async function resolveConsultationWalletBalance(consultation, patientId) {
    try {
        const isNum = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
        if (consultation && isNum(consultation.walletBalanceAfter)) {
            return {
                total: Number(consultation.walletBalanceAfter),
                principal: isNum(consultation.walletPrincipalAfter) ? Number(consultation.walletPrincipalAfter) : null,
                bonus: isNum(consultation.walletBonusAfter) ? Number(consultation.walletBonusAfter) : null
            };
        }
        if (consultation && Number(consultation.walletPaid) > 0) {
            const pid = patientId || consultation.patientId || '';
            if (pid && typeof window.getWalletAccount === 'function') {
                // 後備讀取亦須以該病歷所屬診所的獨立帳戶為準
                const cid = consultation.clinicId ? String(consultation.clinicId) : '';
                const acc = await window.getWalletAccount(pid, false, cid);
                if (acc) {
                    const principal = Number(acc.balance) || 0;
                    const bonus = Number(acc.bonusBalance) || 0;
                    const total = typeof window.walletRound2 === 'function'
                        ? window.walletRound2(principal + bonus)
                        : Math.round((principal + bonus) * 100) / 100;
                    return { total, principal, bonus };
                }
            }
        }
    } catch (_e) {
        // 忽略錯誤
    }
    return null;
}

// 建立含餘下套票次數的收費項目顯示 HTML（供診症記錄檢視視圖使用）。
// 會對收費文字做 HTML 轉義，並在「使用套票」行末附加餘下次數標註。
export async function buildConsultationBillingDisplayHtml(consultation, patientId) {
    try {
        const text = consultation && consultation.billingItems ? String(consultation.billingItems) : '';
        if (!text) return '';
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        const isEnglish = String(lang).indexOf('en') === 0;
        const escapeHtml = (str) => (window.escapeHtml ? window.escapeHtml(str) : String(str));

        const remainingList = await resolveConsultationPackageUseRemaining(consultation, patientId, false);

        let useIndex = 0;
        const htmlLines = text.split('\n').map(line => {
            let escaped = escapeHtml(line);
            if (line.indexOf('使用套票') !== -1) {
                const remaining = remainingList[useIndex];
                useIndex++;
                if (typeof remaining === 'number') {
                    const label = isEnglish ? ` (Remaining: ${remaining})` : `（餘下 ${remaining} 次）`;
                    escaped += ' ' + escapeHtml(label);
                }
            }
            return escaped;
        });
        let html = htmlLines.join('\n');

        // 以儲值支付者，於收費項目末附加支付後儲值餘額
        const walletBal = await resolveConsultationWalletBalance(consultation, patientId);
        if (walletBal) {
            const label = isEnglish
                ? `Wallet balance (after payment): HK$${walletBal.total.toFixed(2)}`
                : `儲值餘額（支付後）：HK$${walletBal.total.toFixed(2)}`;
            html += '\n' + escapeHtml(label);
        }
        return html;
    } catch (_e) {
        // 例外時仍須跳脫，輸出會以 innerHTML 插入檢視視窗，不可回傳原始內容
        const raw = consultation && consultation.billingItems ? String(consultation.billingItems) : '';
        return window.escapeHtml ? window.escapeHtml(raw) : raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

// ============================================================
// 列印模組已遷移至 js/domains/print/（receipt / certificate / prescription）
// 8 個 print* 函式由 js/app.js 以同名掛回 window，HTML inline handler 不變。
// ============================================================

// 修復撤回診症功能
export async function withdrawConsultation(appointmentId) {
    // 取得觸發按鈕並顯示讀取狀態
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="withdrawConsultation(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 確保全域變數已初始化
        if (!Array.isArray(G.appointments)) {
            try {
                const appointmentResult = await window.firebaseDataManager.getAppointments();
                if (appointmentResult.success) {
                    G.appointments = appointmentResult.data;
                } else {
                    G.appointments = [];
                }
            } catch (error) {
                G.appointments = [];
            }
        }
        if (!Array.isArray(G.consultations)) {
            G.consultations = [];
        }
        const appointment = G.appointments.find(apt => apt && String(apt.id) === String(appointmentId));
        if (!appointment) {
            G.showToast('找不到掛號記錄！', 'error');
            return;
        }
        const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`撤回診症狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}, 診症記錄ID: ${appointment.consultationId}`);
        // 只有已完成的診症才能撤回
        if (appointment.status !== 'completed') {
            const statusNames = {
                'registered': '已掛號',
                'waiting': '候診中',
                'consulting': '診症中'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const statusNamesEnMap = {
                    '已掛號': 'registered',
                    '候診中': 'waiting',
                    '診症中': 'consulting'
                };
                const currentStatusNameEn = statusNamesEnMap[currentStatusName] || currentStatusName;
                const zhMsg = `無法撤回診症！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只能撤回已完成的診症。`;
                const enMsg = `Cannot retract consultation! Patient ${patient.name} is currently "${currentStatusNameEn}". You can only retract completed consultations.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'warning');
            }
            return;
        }
        // 檢查是否有診症記錄
        if (!appointment.consultationId) {
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `無法撤回診症！病人 ${patient.name} 沒有對應的診症記錄。`;
                const enMsg = `Cannot retract consultation! Patient ${patient.name} has no corresponding consultation record.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'error');
            }
            return;
        }
        // 撤回診症前一律強制單筆刷新，避免根據舊 consultation 執行刪除與套票還原。
        let consultation = null;
        try {
            const consResult = await window.firebaseDataManager.getConsultationById(
                String(appointment.consultationId),
                true
            );
            if (consResult && consResult.success && consResult.data) {
                consultation = consResult.data;
            }
        } catch (err) {
            console.error('強制單筆刷新診症記錄失敗:', err);
        }

        // 若最終仍然找不到診症記錄，提示錯誤並返回。
        if (!consultation) {
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `無法撤回診症！找不到病人 ${patient.name} 的診症記錄資料。`;
                const enMsg = `Cannot retract consultation! Consultation record for ${patient.name} not found.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'error');
            }
            return;
        }

        // 確認撤回操作（支援中英文）
        const lang7 = localStorage.getItem('lang') || 'zh';
        const zhMsg7 = `確定要撤回 ${patient.name} 的診症嗎？\n\n此操作將會：\n• 刪除該次病歷記錄\n• 病人狀態回到「已掛號」\n• 退回本次病歷使用的套票\n• 所有診症資料將永久遺失\n\n診斷：${consultation.diagnosis || '無記錄'}\n\n注意：此操作無法復原！`;
        const enMsg7 = `Are you sure you want to retract the consultation for ${patient.name}?\n\nThis action will:\n• Delete this medical record\n• Revert the patient's status to 'Registered'\n• Return the package used for this record\n• Permanently erase all consultation data\n\nDiagnosis: ${consultation.diagnosis || 'No record'}\n\nNote: this action cannot be undone!`;
        const confirmMsg7 = lang7 === 'en' ? enMsg7 : zhMsg7;
        const confirmedRetract = await showConfirmation(confirmMsg7, 'warning');
        if (!confirmedRetract) {
            return;
        }
    // 刪除診症記錄
    // 先從 Firebase 刪除該次診症記錄
    try {
        await window.firebase.deleteDoc(
            window.firebase.doc(
                window.firebase.db,
                'consultations',
                String(appointment.consultationId)
            )
        );
        // 觸發 patientsMeta 通知其他裝置；kind:'consultation' 會額外刷新病歷彈窗
        const retractPid = String(appointment?.patientId || consultation?.patientId || '');
        if (retractPid) {
            try { await touchPatientsMeta('delete', retractPid, { kind: 'consultation', nonce: (typeof G.newSelfMetaNonce === 'function') ? G.newSelfMetaNonce() : undefined }); } catch (_e) {}
            // 本地 CRUD 後主動刷新已開啟的病歷彈窗與病人詳情面板
            try { refreshOpenConsultationHistory(retractPid); } catch (_refreshErr) {}
        }
        // 從本地集合中移除該診症記錄
        const consultationIndex = G.consultations.findIndex(
            (c) => String(c.id) === String(appointment.consultationId)
        );
        if (consultationIndex !== -1) {
            G.consultations.splice(consultationIndex, 1);
            localStorage.setItem(
                'consultations',
                JSON.stringify(G.consultations)
            );
        }
    } catch (error) {
        console.error('刪除診症記錄失敗:', error);
        G.showToast('刪除診症記錄時發生錯誤', 'error');
    }

    // --- 退回本次診症使用的套票 ---
    try {
        if (consultation && Array.isArray(consultation.packageChanges)) {
            for (const change of consultation.packageChanges) {
                if (!change || typeof change.delta !== 'number') continue;
                const patientIdForPkg = change.patientId;
                const packageRecordIdForPkg = change.packageRecordId;
                // 強制刷新，取得最新套票資料
                const pkgs = await getPatientPackages(patientIdForPkg, true);
                const pkg = pkgs.find(p => String(p.id) === String(packageRecordIdForPkg));
                if (!pkg) continue;
                // 在撤回時將用量加回（反向處理 delta）
                let newRemaining = (pkg.remainingUses || 0) - change.delta;
                if (typeof pkg.totalUses === 'number') {
                    newRemaining = Math.max(0, Math.min(pkg.totalUses, newRemaining));
                } else {
                    newRemaining = Math.max(0, newRemaining);
                }
                const updatedPackage = { ...pkg, remainingUses: newRemaining };
                await window.firebaseDataManager.updatePatientPackage(packageRecordIdForPkg, updatedPackage);
                await recordPatientPackageHistory(buildPatientPackageHistoryRecord({
                    patientId: patientIdForPkg,
                    packageId: packageRecordIdForPkg,
                    packageName: pkg.name,
                    source: 'consultationBillingReturn',
                    type: 'restoreUse',
                    fromRemainingUses: Number(pkg.remainingUses) || 0,
                    toRemainingUses: newRemaining,
                    changeCount: Math.abs(Number(change.delta) || 0)
                }));
                // 更新本地快取
                if (G.patientPackagesCache && Array.isArray(G.patientPackagesCache[patientIdForPkg])) {
                    G.patientPackagesCache[patientIdForPkg] = G.patientPackagesCache[patientIdForPkg].map(p => {
                        if (String(p.id) === String(packageRecordIdForPkg)) {
                            return { ...p, ...updatedPackage };
                        }
                        return p;
                    });
                }
            }
        }
    } catch (err) {
        console.error('退回套票使用時發生錯誤:', err);
        G.showToast('退回套票時發生錯誤', 'warning');
    }
    // --- 還原庫存消耗 ---
    try {
        if (typeof G.revertInventoryForConsultation === 'function') {
            // 使用掛號上的 consultationId 以還原庫存
            const consultationIdForInv = appointment && appointment.consultationId;
            if (consultationIdForInv) {
                await G.revertInventoryForConsultation(consultationIdForInv);
            }
        }
    } catch (invErr) {
        console.error('撤回診症庫存回復錯誤:', invErr);
    }
    // 從病人診症快取中移除該紀錄
    try {
        if (G.patientConsultationsCache && Array.isArray(G.patientConsultationsCache[patient.id])) {
            G.patientConsultationsCache[patient.id] = G.patientConsultationsCache[patient.id].filter(c => String(c.id) !== String(consultation.id));
        }
    } catch (_err) {}
    // 同步清除 pager 快取，確保本機稍後開啟病歷時不會吃到已撤回的舊記錄
    try {
        const pager = G.consultationHistoryPager;
        if (pager && typeof pager.clearPatientCache === 'function') {
            pager.clearPatientCache(patient.id);
        }
    } catch (_pagerErr) {}

    // 將掛號狀態改回已掛號
    appointment.status = 'registered';
    delete appointment.completedAt;
    delete appointment.consultationId;
    delete appointment.completedBy;
    delete appointment.consultationStartTime;
    delete appointment.consultingDoctor;

    // 保存狀態變更
    localStorage.setItem('appointments', JSON.stringify(G.appointments));
    // 同步更新到 Firebase
    await window.firebaseDataManager.updateAppointment(
        String(appointment.id),
        appointment
    );

    {
        const lang = localStorage.getItem('lang') || 'zh';
        const zhMsg = `已撤回 ${patient.name} 的診症，病人狀態回到已掛號`;
        const enMsg = `Retracted consultation for ${patient.name} and reverted status to registered`;
        const msg = lang === 'en' ? enMsg : zhMsg;
        G.showToast(msg, 'success');
    }

    // 如果正在編輯該病歷，則關閉表單
    if (
        String(G.currentConsultingAppointmentId) === String(appointmentId)
    ) {
        closeConsultationForm();
        G.currentConsultingAppointmentId = null;
    }
        // 重新載入列表和統計
        loadTodayAppointments();
        G.updateStatistics();
        // 重新載入該病人的診療摘要，確保病歷列表和套票狀態即時更新。
        // 僅在病人詳情面板正開啟、且顯示的就是這位病人時刷新；否則面板不存在
        // 或顯示的是其他病人（殘留在隱藏 DOM 中），不應觸發摘要載入。
        try {
            const detailModal = document.getElementById('patientDetailModal');
            const panelOpen = detailModal && !detailModal.classList.contains('hidden');
            const samePatient = String(G.patientDetailClinicState.patientId || '') === String(patient.id);
            if (panelOpen && samePatient) {
                await loadPatientConsultationSummary(patient.id);
            }
        } catch (_e) {
            // ignore summary loading errors
        }
    } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        G.showToast('讀取病人資料失敗', 'error');
    } finally {
        // 清除按鈕的讀取狀態
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

// 修復修改病歷功能
export async function editMedicalRecord(appointmentId) {
    // 取得觸發按鈕並顯示讀取狀態
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="editMedicalRecord(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 確保全域變數已初始化
        if (!Array.isArray(G.appointments)) {
            try {
                const appointmentResult = await window.firebaseDataManager.getAppointments();
                if (appointmentResult.success) {
                    G.appointments = appointmentResult.data;
                } else {
                    G.appointments = [];
                }
            } catch (error) {
                console.error('初始化掛號數據錯誤:', error);
                G.appointments = [];
            }
        }
        if (!Array.isArray(G.consultations)) {
            G.consultations = [];
        }
        const appointment = G.appointments.find(apt => apt && String(apt.id) === String(appointmentId));
        if (!appointment) {
            G.showToast('找不到掛號記錄！', 'error');
            return;
        }
        const canEditMedicalRecord = canCurrentUserEditMedicalRecordEntry(null, appointment);
        if (!canEditMedicalRecord) {
            G.showToast('您沒有修改病歷的權限！', 'error');
            return;
        }
        const patient = await G.getPatientByIdWithRefresh(appointment.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`修改病歷狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}, 診症記錄ID: ${appointment.consultationId}`);
        // 只有已完成的診症才能修改病歷
        if (appointment.status !== 'completed') {
            const statusNames = {
                'registered': '已掛號',
                'waiting': '候診中',
                'consulting': '診症中'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const statusNamesEnMap = {
                    '已掛號': 'registered',
                    '候診中': 'waiting',
                    '診症中': 'consulting'
                };
                const currentStatusNameEn = statusNamesEnMap[currentStatusName] || currentStatusName;
                const zhMsg = `無法修改病歷！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只能修改已完成診症的病歷。`;
                const enMsg = `Cannot modify medical record! Patient ${patient.name} is currently "${currentStatusNameEn}". You can only modify records of completed consultations.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'warning');
            }
            return;
        }
        // 檢查是否有診症記錄
        if (!appointment.consultationId) {
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `無法修改病歷！病人 ${patient.name} 沒有對應的診症記錄。`;
                const enMsg = `Cannot modify medical record! Patient ${patient.name} has no corresponding consultation record.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'error');
            }
            return;
        }
        // 修改病歷前一律強制單筆刷新，避免編輯到本機舊 consultation 快取。
        let consultation = null;
        if (!consultation) {
            try {
                const singleRes = await window.firebaseDataManager.getConsultationById(String(appointment.consultationId), true);
                if (singleRes && singleRes.success && singleRes.data) {
                    consultation = singleRes.data;
                }
            } catch (err) {
                console.error('單筆讀取診症記錄失敗:', err);
            }
        }
        if (!consultation) {
            // 如果仍然找不到診症記錄，提示錯誤後結束
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `無法修改病歷！找不到病人 ${patient.name} 的診症記錄資料。`;
                const enMsg = `Cannot modify medical record! Consultation record for ${patient.name} not found.`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'error');
            }
            return;
        }
        const editWindowStatus = G.getMedicalRecordEditWindowStatus(consultation, appointment);
        if (!editWindowStatus.allowed) {
            G.showToast(editWindowStatus.reason, 'warning');
            return;
        }
        // 檢查是否有其他病人正在診症中（僅限制同一醫師）
        let consultingAppointment = null;
        const isDoctorUser = G.currentUserData && G.currentUserData.position === '醫師';
        if (isDoctorUser) {
            consultingAppointment = G.appointments.find(apt =>
                apt.status === 'consulting' &&
                G.getAppointmentResponsibleDoctorUsername(apt) === G.currentUserData.username &&
                new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
            );
        }
        if (consultingAppointment) {
            // 從 Firebase 獲取正在診症的病人資料
            const consultingPatient = patientResult.data.find(p => p.id === consultingAppointment.patientId);
            const consultingPatientName = consultingPatient ? consultingPatient.name : '未知病人';
            // 提示當前正在診症其他病人，詢問是否結束並改為修改病歷（支援中英文）
            const lang4 = localStorage.getItem('lang') || 'zh';
            const zhMsg4 = `您目前正在為 ${consultingPatientName} 診症。\n\n是否要結束該病人的診症並開始修改 ${patient.name} 的病歷？\n\n注意：${consultingPatientName} 的狀態將改回候診中。`;
            const enMsg4 = `You are currently consulting ${consultingPatientName}.\n\nDo you want to finish that patient's consultation and start editing ${patient.name}'s medical record?\n\nNote: ${consultingPatientName}'s status will revert to waiting.`;
            const msg4 = lang4 === 'en' ? enMsg4 : zhMsg4;
            const confirmEdit = await showConfirmation(msg4, 'warning');
            if (confirmEdit) {
                // 結束當前診症的病人
                consultingAppointment.status = 'waiting';
                consultingAppointment.arrivedAt = new Date().toISOString();
                delete consultingAppointment.consultationStartTime;
                delete consultingAppointment.consultingDoctor;
                // 關閉可能開啟的診症表單
                // 使用字串比較，避免 ID 類型不一致導致無法匹配
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
                localStorage.setItem('appointments', JSON.stringify(G.appointments));
                // 同步更新到 Firebase
                await window.firebaseDataManager.updateAppointment(String(consultingAppointment.id), consultingAppointment);
            } else {
                return; // 用戶取消操作
            }
        }
        // 切換到診症系統，再進入病歷編輯模式
        prepareConsultationEditView();
        G.currentConsultingAppointmentId = appointmentId;
        await showConsultationForm(appointment);
        scrollConsultationFormIntoView();
        {
            const lang = localStorage.getItem('lang') || 'zh';
            const msg = lang === 'en'
                ? `Entered medical record edit mode for ${patient.name}`
                : `進入 ${patient.name} 的病歷編輯模式`;
            G.showToast(msg, 'info');
        }
    } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        G.showToast('讀取病人資料失敗', 'error');
    } finally {
        // 清除按鈕的讀取狀態
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}

export async function editMedicalRecordByConsultationId(consultationId) {
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (loadingButton) {
        G.setButtonLoading(loadingButton, '處理中...');
    }
    try {
        const consultationIdStr = String(consultationId || '').trim();
        if (!consultationIdStr) {
            G.showToast('找不到病歷記錄！', 'error');
            return;
        }
        const linkedAppointment = Array.isArray(G.appointments)
            ? G.appointments.find(apt => apt && String(apt.consultationId || '') === consultationIdStr)
            : null;
        if (linkedAppointment) {
            await editMedicalRecord(linkedAppointment.id);
            return;
        }

        let consultation = null;
        try {
            const singleRes = await window.firebaseDataManager.getConsultationById(consultationIdStr, true);
            if (singleRes && singleRes.success && singleRes.data) {
                consultation = singleRes.data;
            }
        } catch (_err) {}
        if (!consultation) {
            G.showToast('找不到病歷記錄！', 'error');
            return;
        }
        if (!canCurrentUserEditMedicalRecordEntry(consultation, null)) {
            G.showToast('您沒有修改病歷的權限！', 'error');
            return;
        }
        const editWindowStatus = G.getMedicalRecordEditWindowStatus(consultation, null);
        if (!editWindowStatus.allowed) {
            G.showToast(editWindowStatus.reason, 'warning');
            return;
        }

        const patient = await G.getPatientByIdWithRefresh(consultation.patientId);
        if (!patient) {
            G.showToast('找不到病人資料！', 'error');
            return;
        }

        let consultingAppointment = null;
        const isDoctorUser = G.currentUserData && G.currentUserData.position === '醫師';
        if (isDoctorUser && Array.isArray(G.appointments)) {
            consultingAppointment = G.appointments.find(apt =>
                apt.status === 'consulting' &&
                G.getAppointmentResponsibleDoctorUsername(apt) === G.currentUserData.username &&
                new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
            );
        }
        if (consultingAppointment) {
            const consultingPatient = patientResult.data.find(p => p.id === consultingAppointment.patientId);
            const consultingPatientName = consultingPatient ? consultingPatient.name : '未知病人';
            const lang = localStorage.getItem('lang') || 'zh';
            const zhMsg = `您目前正在為 ${consultingPatientName} 診症。\n\n是否要結束該病人的診症並開始修改 ${patient.name} 的病歷？\n\n注意：${consultingPatientName} 的狀態將改回候診中。`;
            const enMsg = `You are currently consulting ${consultingPatientName}.\n\nDo you want to finish that patient's consultation and start editing ${patient.name}'s medical record?\n\nNote: ${consultingPatientName}'s status will revert to waiting.`;
            const confirmEdit = await showConfirmation(lang === 'en' ? enMsg : zhMsg, 'warning');
            if (!confirmEdit) {
                return;
            }
            consultingAppointment.status = 'waiting';
            consultingAppointment.arrivedAt = new Date().toISOString();
            delete consultingAppointment.consultationStartTime;
            delete consultingAppointment.consultingDoctor;
            if (String(G.currentConsultingAppointmentId) === String(consultingAppointment.id)) {
                closeConsultationForm();
            }
            localStorage.setItem('appointments', JSON.stringify(G.appointments));
            await window.firebaseDataManager.updateAppointment(String(consultingAppointment.id), consultingAppointment);
        }

        G.currentConsultationEditContext = buildDirectConsultationEditContext(consultation);
        prepareConsultationEditView();
        G.currentConsultingAppointmentId = G.currentConsultationEditContext.id;
        await showConsultationForm(G.currentConsultationEditContext);
        scrollConsultationFormIntoView();
        {
            const lang = localStorage.getItem('lang') || 'zh';
            const msg = lang === 'en'
                ? `Entered medical record edit mode for ${patient.name}`
                : `進入 ${patient.name} 的病歷編輯模式`;
            G.showToast(msg, 'info');
        }
    } catch (error) {
        console.error('從病歷記錄修改病歷失敗:', error);
        G.showToast('開啟病歷編輯失敗', 'error');
    } finally {
        if (loadingButton) {
            G.clearButtonLoading(loadingButton);
        }
    }
}
/**
 * 建構病人詳情中的「套票＋會員儲值」合併區塊：
 * 頂部為診所選單，下方依次為套票情況與會員儲值餘額兩個子區。
 * 選單預設值由呼叫端在插入 DOM 後設定。
 */
export function buildPackageWalletCombinedSection(patientId) {
    // 診所清單：記憶體全域為主，退回 localStorage 快取
    let clinicRows = [];
    try {
        if (typeof G.clinicsList !== 'undefined' && Array.isArray(G.clinicsList) && G.clinicsList.length) {
            clinicRows = G.clinicsList;
        } else {
            const stored = JSON.parse(localStorage.getItem('clinics') || 'null');
            if (Array.isArray(stored)) clinicRows = stored;
        }
    } catch (_e) {}

    let selectorHtml = '';
    // 僅在有多於一間診所時才顯示診所選單；單一診所直接隱藏
    if (clinicRows.length > 1) {
        const lang = (localStorage.getItem('lang') || 'zh').toLowerCase();
        const options = clinicRows.map(c => {
            const name = lang.startsWith('en')
                ? (c.englishName || c.chineseName || c.name || c.id)
                : (c.chineseName || c.englishName || c.name || c.id);
            return `<option value="${window.escapeHtml(String(c.id))}">${window.escapeHtml(name || '')}</option>`;
        }).join('');
        selectorHtml = `
            <div class="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-gray-200">
                <label for="patientDetailClinicSelector" class="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                    診所
                </label>
                <select id="patientDetailClinicSelector" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 min-w-[200px]">
                    ${options}
                </select>
            </div>`;
    }

    // 會員功能關閉時（如簡單版）不建構「會員儲值餘額」子區
    var walletSubSection = G.versionFeatureEnabled('membership') ? `
            <!-- 會員儲值餘額子區 -->
            <div class="pt-4 border-t border-gray-100">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                        </svg>
                        <h3 class="text-base font-semibold text-teal-800">會員儲值餘額</h3>
                    </div>
                    <div id="patientWalletStatusBadge" class="text-xs text-teal-700 bg-white px-2 py-1 rounded-full">讀取中…</div>
                </div>
                <div id="patientWalletBalanceContent">
                    <div class="text-center py-4">
                        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        <div class="mt-2 text-sm">載入儲值餘額中...</div>
                    </div>
                </div>
            </div>` : '';

    return `
        <div class="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            ${selectorHtml}
            <!-- 套票情況子區 -->
            <div class="mb-5">
                <div class="flex flex-wrap items-center gap-3 mb-3">
                    <!-- 左側：圖標＋標題，徽章緊貼標題右旁 -->
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/>
                        </svg>
                        <h3 class="text-base font-semibold text-purple-800">套票情況</h3>
                        <div class="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                            <span id="patientPackageActiveCountBadge">…</span> 個可用
                        </div>
                    </div>
                    <!-- 右上角：套票記錄＋新增套票（點擊時以當前診所操作） -->
                    <div class="ml-auto flex items-center gap-2">
                        <button id="packageHistoryHeaderBtn" type="button"
                            class="px-3 py-1.5 text-sm rounded bg-violet-600 text-white hover:bg-violet-700">
                            套票記錄
                        </button>
                        <button id="addPackageHeaderBtn" type="button"
                            class="px-3 py-1.5 text-sm rounded bg-purple-600 text-white hover:bg-purple-700">
                            新增套票
                        </button>
                    </div>
                </div>
                <div id="packageStatusContent">
                    <div class="text-center py-4">
                        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        <div class="mt-2 text-sm">載入套票資料中...</div>
                    </div>
                </div>
            </div>
            ${walletSubSection}
        </div>`;
}

/**
 * 綁定合併區塊的診所選單：切換後以該診所重新渲染套票與儲值。
 * @param {string} patientId 病人 ID
 */
export function bindPatientDetailClinicSelector(patientId) {
    const selector = document.getElementById('patientDetailClinicSelector');
    if (!selector) return;
    selector.addEventListener('change', async function() {
        const cid = String(this.value || '');
        G.patientDetailClinicState.clinicId = cid;
        await renderPackageStatusSection(patientId, false, cid);
        await renderPatientWalletStatus(patientId, cid);
    });
}

/**
 * 綁定套票情況標題列右上角按鈕；點擊時一律以面板目前選取的診所操作，
 * 故切換診所選單後無需重建按鈕。
 * @param {string} patientId 病人 ID
 */
export function bindPackageHeaderButtons(patientId) {
    const activeClinic = () => String(
        (G.patientDetailClinicState.patientId === String(patientId)
            && G.patientDetailClinicState.clinicId)
        || currentPackageClinicId() || ''
    );
    const historyBtn = document.getElementById('packageHistoryHeaderBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', function() {
            showPatientPackageHistory(patientId, activeClinic());
        });
    }
    const addBtn = document.getElementById('addPackageHeaderBtn');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            createManualPatientPackage(patientId, activeClinic());
        });
    }
}

// 載入病人診療記錄摘要
export async function loadPatientConsultationSummary(patientId) {
    const summaryContainer = document.getElementById('patientConsultationSummary');

    // 如果容器尚未渲染（本次頁面工作階段尚未開過病人詳情面板），安靜跳過。
    // 撤診入口在今日約診列，面板通常未開啟；此為正常 no-op，不印警告。
    if (!summaryContainer) {
        return;
    }

    try {
        let patient = await G.getPatientByIdWithRefresh(patientId);
        let totalConsultations = patient && typeof patient.consultationCount === 'number'
            ? Math.max(0, Number(patient.consultationCount) || 0)
            : 0;
        let latestConsultation = null;
        try {
            const stateResult = await G.consultationHistoryPager.ensurePatientState(patientId, false);
            if (stateResult && stateResult.success && stateResult.state) {
                totalConsultations = Math.max(0, Number(stateResult.state.totalCount) || 0);
                patient = {
                    ...(patient || {}),
                    consultationCount: totalConsultations
                };
                if (totalConsultations > 0) {
                    const latestIndex = totalConsultations - 1;
                    const loaded = await G.consultationHistoryPager.ensureLoadedAtIndex(patientId, latestIndex);
                    if (loaded) {
                        const cachedState = G.consultationHistoryPager.getCachedPatientState(patientId);
                        if (cachedState && Array.isArray(cachedState.recordsByIndex)) {
                            latestConsultation = cachedState.recordsByIndex[latestIndex] || null;
                        }
                    }
                }
            }
        } catch (_summaryCountErr) {}

        let lastConsultationDate = '無';
        const latestConsultationAt = patient && patient.latestConsultationAt
            ? parseConsultationDate(patient.latestConsultationAt)
            : null;
        if (latestConsultationAt && !isNaN(latestConsultationAt.getTime())) {
            lastConsultationDate = latestConsultationAt.toLocaleDateString('zh-TW');
        } else if (latestConsultation) {
            const latestConsultationDate = getConsultationEffectiveDate(latestConsultation);
            if (latestConsultationDate && !isNaN(latestConsultationDate.getTime())) {
                lastConsultationDate = latestConsultationDate.toLocaleDateString('zh-TW');
            }
        }

        // 解析「套票＋儲值」合併區要顯示的診所（預設目前診所，同病人重新渲染時保留選擇）
        const selectedClinicId = resolvePatientDetailClinic(patientId);
        // 懶人遷移：為舊套票補上診所歸屬（內部僅在發現未標注文件時才額外讀診症記錄）
        await ensurePatientPackagesClinicScoped(patientId);

        // 統計列與合併區之間保留明顯間距（下次複診 ↔ 套票/儲值）
        if (totalConsultations === 0) {
            const statsRowHtml = `
                <!-- 第一行：基本統計資訊 -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="bg-blue-50 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-blue-600">0</div>
                        <div class="text-sm text-blue-800">總診療次數</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-4 text-center">
                        <div class="text-lg font-semibold text-green-600">無</div>
                        <div class="text-sm text-green-800">最近診療</div>
                    </div>
                    <div class="bg-orange-50 rounded-lg p-4 text-center">
                        <div class="text-lg font-semibold text-orange-600">無安排</div>
                        <div class="text-sm text-orange-800">下次複診</div>
                    </div>
                </div>
            `;
            summaryContainer.innerHTML = statsRowHtml + buildPackageWalletCombinedSection(patientId);
            const clinicSelector = document.getElementById('patientDetailClinicSelector');
            if (clinicSelector && selectedClinicId) clinicSelector.value = selectedClinicId;
            bindPatientDetailClinicSelector(patientId);
            bindPackageHeaderButtons(patientId);
            // 渲染指定診所的套票分頁與內容
            await renderPackageStatusSection(patientId, false, selectedClinicId);
            // 載入指定診所的會員儲值餘額（會員功能關閉時跳過，如簡單版）
            if (G.versionFeatureEnabled('membership')) {
                await renderPatientWalletStatus(patientId, selectedClinicId);
            }
            return;
        }

        // 格式化下次複診日期
        const nextFollowUpDate = patient && patient.latestFollowUpDate
            ? parseConsultationDate(patient.latestFollowUpDate)
            : (latestConsultation && latestConsultation.followUpDate
                ? parseConsultationDate(latestConsultation.followUpDate)
                : null);
        const nextFollowUp = nextFollowUpDate && !isNaN(nextFollowUpDate.getTime())
            ? nextFollowUpDate.toLocaleDateString('zh-TW')
            : '無安排';

        // 更新診療摘要：統計列（含下次複診）→ 套票＋儲值合併區
        const statsRowHtml = `
            <!-- 第一行：基本統計資訊 -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-blue-50 rounded-lg p-4 text-center">
                    <div class="text-2xl font-bold text-blue-600">${totalConsultations}</div>
                    <div class="text-sm text-blue-800">總診療次數</div>
                </div>
                <div class="bg-green-50 rounded-lg p-4 text-center">
                    <div class="text-lg font-semibold text-green-600">${lastConsultationDate}</div>
                    <div class="text-sm text-green-800">最近診療</div>
                </div>
                <div class="bg-orange-50 rounded-lg p-4 text-center">
                    <div class="text-lg font-semibold text-orange-600">${nextFollowUp}</div>
                    <div class="text-sm text-orange-800">下次複診</div>
                </div>
            </div>
        `;
        summaryContainer.innerHTML = statsRowHtml + buildPackageWalletCombinedSection(patientId);
        const clinicSelector = document.getElementById('patientDetailClinicSelector');
        if (clinicSelector && selectedClinicId) clinicSelector.value = selectedClinicId;
        bindPatientDetailClinicSelector(patientId);
        bindPackageHeaderButtons(patientId);
        // 渲染指定診所的套票分頁與內容
        await renderPackageStatusSection(patientId, false, selectedClinicId);
        // 載入指定診所的會員儲值餘額（失敗時自行降級顯示，不影響套票區塊）
        await renderPatientWalletStatus(patientId, selectedClinicId);

    } catch (error) {
        console.error('載入診療記錄摘要錯誤:', error);
        summaryContainer.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <div class="mb-2 flex justify-center"><i data-lucide="circle-x" class="w-10 h-10 text-red-400"></i></div>
                <div>載入診療記錄失敗</div>
            </div>
        `;
    }
}
