/* ============================================================
 * consultation/profile.js — 病人醫療概況（normalize/merge/同步、
 * 表單 collect/populate/clear、編輯器開合與儲存）（Phase 6 子批 D1）。
 * 共享狀態與 UI helper 經 G；firebase/escapeHtml 走 window。
 ============================================================ */
import { G } from '../../lib/legacy.js';

        export function normalizePatientMedicalProfile(profile) {
            const normalized = {};
            const legacyTraumaSection = profile && typeof profile === 'object' ? profile.traumaHistory : null;
            G.PATIENT_MEDICAL_PROFILE_SECTIONS.forEach(section => {
                const sourceSection = profile && typeof profile === 'object' ? profile[section.key] : null;
                const selected = Array.isArray(sourceSection && sourceSection.selected)
                    ? sourceSection.selected.map(item => String(item))
                    : [];
                let note = sourceSection && typeof sourceSection.note === 'string' ? sourceSection.note.trim() : '';
                if (section.key === 'surgicalHistory' && legacyTraumaSection && typeof legacyTraumaSection === 'object') {
                    const legacyTraumaNote = typeof legacyTraumaSection.note === 'string' ? legacyTraumaSection.note.trim() : '';
                    if (legacyTraumaNote) {
                        note = note ? `${note}；外傷備註：${legacyTraumaNote}` : `外傷備註：${legacyTraumaNote}`;
                    }
                }
                normalized[section.key] = {
                    selected: selected.filter(key => section.options.some(option => option.key === key)),
                    note
                };
            });
            return normalized;
        }

        export function hasPatientMedicalProfileContent(profile) {
            return G.PATIENT_MEDICAL_PROFILE_SECTIONS.some(section => {
                const current = profile && profile[section.key] ? profile[section.key] : {};
                return (Array.isArray(current.selected) && current.selected.length > 0) || !!(current.note && String(current.note).trim());
            });
        }

        export function clearPatientMedicalProfileForm() {
            document.querySelectorAll('.patient-history-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
            G.PATIENT_MEDICAL_PROFILE_SECTIONS.forEach(section => {
                const noteInput = document.getElementById(section.noteId);
                if (noteInput) {
                    noteInput.value = '';
                }
            });
        }

        export function collectPatientMedicalProfileFromForm() {
            const profile = {};
            G.PATIENT_MEDICAL_PROFILE_SECTIONS.forEach(section => {
                const selected = Array.from(
                    document.querySelectorAll(`.patient-history-checkbox[data-section="${section.key}"]:checked`)
                ).map(checkbox => checkbox.value);
                const noteInput = document.getElementById(section.noteId);
                profile[section.key] = {
                    selected,
                    note: noteInput ? noteInput.value.trim() : ''
                };
            });
            return normalizePatientMedicalProfile(profile);
        }

        export function populatePatientMedicalProfileForm(profile, fallbackPatient = {}) {
            clearPatientMedicalProfileForm();
            const normalizedProfile = normalizePatientMedicalProfile(profile);

            G.PATIENT_MEDICAL_PROFILE_SECTIONS.forEach(section => {
                const current = normalizedProfile[section.key];
                const selectedSet = new Set(current.selected);
                document.querySelectorAll(`.patient-history-checkbox[data-section="${section.key}"]`).forEach(checkbox => {
                    checkbox.checked = selectedSet.has(checkbox.value);
                });
                const noteInput = document.getElementById(section.noteId);
                if (noteInput) {
                    noteInput.value = current.note || '';
                }
            });

            if (hasPatientMedicalProfileContent(normalizedProfile)) {
                return;
            }

            const allergyNotesInput = document.getElementById('patientAllergyNotes');
            if (allergyNotesInput && fallbackPatient && fallbackPatient.allergies) {
                allergyNotesInput.value = fallbackPatient.allergies;
            }
            const medicalConditionsNotesInput = document.getElementById('patientMedicalConditionsNotes');
            if (medicalConditionsNotesInput && fallbackPatient && fallbackPatient.history) {
                medicalConditionsNotesInput.value = fallbackPatient.history;
            }
        }

        export function formatPatientMedicalProfileSectionSummary(section, current) {
            if (!current) return '';
            const selectedLabels = section.options
                .filter(option => Array.isArray(current.selected) && current.selected.includes(option.key))
                .map(option => option.label);
            const parts = [];
            if (selectedLabels.length) {
                parts.push(selectedLabels.join('、'));
            }
            if (current.note) {
                parts.push(`備註：${current.note}`);
            }
            if (!parts.length) {
                return '';
            }
            return `${section.title}：${parts.join('；')}`;
        }

        export function buildPatientMedicalProfileLegacySummary(profile) {
            const normalizedProfile = normalizePatientMedicalProfile(profile);
            const allergySection = G.PATIENT_MEDICAL_PROFILE_SECTIONS.find(section => section.key === 'allergies');
            const historySections = G.PATIENT_MEDICAL_PROFILE_SECTIONS.filter(section => section.key !== 'allergies');
            const history = historySections
                .map(section => formatPatientMedicalProfileSectionSummary(section, normalizedProfile[section.key]))
                .filter(Boolean)
                .join('｜');
            const allergies = allergySection
                ? formatPatientMedicalProfileSectionSummary(allergySection, normalizedProfile.allergies)
                : '';
            return { history, allergies };
        }

        export function mergePatientMedicalProfiles(existingProfile, incomingProfile) {
            const baseProfile = normalizePatientMedicalProfile(existingProfile);
            const nextProfile = normalizePatientMedicalProfile(incomingProfile);
            const mergedProfile = {};
            G.PATIENT_MEDICAL_PROFILE_SECTIONS.forEach(section => {
                const mergedSelected = Array.from(new Set([
                    ...(baseProfile[section.key] && Array.isArray(baseProfile[section.key].selected) ? baseProfile[section.key].selected : []),
                    ...(nextProfile[section.key] && Array.isArray(nextProfile[section.key].selected) ? nextProfile[section.key].selected : [])
                ]));
                const mergedNotes = [
                    baseProfile[section.key] ? baseProfile[section.key].note : '',
                    nextProfile[section.key] ? nextProfile[section.key].note : ''
                ]
                    .map(note => String(note || '').trim())
                    .filter(Boolean);
                mergedProfile[section.key] = {
                    selected: mergedSelected,
                    note: Array.from(new Set(mergedNotes)).join('；')
                };
            });
            return normalizePatientMedicalProfile(mergedProfile);
        }

        export async function syncPatientMedicalProfileFromInquiryData(patientId, inquiryData) {
            try {
                const inquiryIsFirstVisit = inquiryData && (inquiryData.firstVisit === true || inquiryData.isFirstVisit === true);
                if (!patientId || !inquiryData || inquiryIsFirstVisit !== true || !inquiryData.medicalProfile) {
                    return { success: true, skipped: true };
                }
                const normalizedIncomingProfile = normalizePatientMedicalProfile(inquiryData.medicalProfile);
                if (!hasPatientMedicalProfileContent(normalizedIncomingProfile)) {
                    return { success: true, skipped: true };
                }
                const patient = await G.getPatientByIdWithRefresh(patientId);
                if (!patient) {
                    return { success: false, error: '找不到病人資料' };
                }
                const mergedProfile = mergePatientMedicalProfiles(patient.medicalProfile, normalizedIncomingProfile);
                const medicalProfileSummary = buildPatientMedicalProfileLegacySummary(mergedProfile);
                const updatePayload = {
                    medicalProfile: mergedProfile,
                    history: medicalProfileSummary.history,
                    allergies: medicalProfileSummary.allergies
                };
                const result = await window.firebaseDataManager.updatePatient(patientId, updatePayload);
                if (!result || !result.success) {
                    return { success: false, error: result && result.error ? result.error : '更新病人資料失敗' };
                }
                invalidatePatientCaches();
                return { success: true };
            } catch (error) {
                console.error('同步預診病史資料失敗:', error);
                return { success: false, error: error.message };
            }
        }

        export function invalidatePatientCaches() {
            G.patientCache = null;
            if (typeof G.patientPagesCache === 'object') {
                G.patientPagesCache = {};
            }
            if (typeof G.patientPageCursors === 'object') {
                G.patientPageCursors = {};
            }
            if (typeof G.patientAscPagesCache === 'object') {
                G.patientAscPagesCache = {};
            }
            if (typeof G.patientAscPageCursors === 'object') {
                G.patientAscPageCursors = {};
            }
            G.patientsCountCache = null;
        }

        export function renderConsultationPatientMedicalInfo(patient) {
            const historyContainer = document.getElementById('historyContainer');
            const historyEl = document.getElementById('formPatientHistory');
            if (historyContainer && historyEl) {
                if (patient && patient.history) {
                    historyEl.textContent = patient.history;
                    historyContainer.style.display = '';
                } else {
                    historyEl.textContent = '';
                    historyContainer.style.display = 'none';
                }
            }

            const allergiesContainer = document.getElementById('allergiesContainer');
            const allergiesEl = document.getElementById('formPatientAllergies');
            if (allergiesContainer && allergiesEl) {
                if (patient && patient.allergies) {
                    allergiesEl.textContent = patient.allergies;
                    allergiesContainer.style.display = '';
                } else {
                    allergiesEl.textContent = '';
                    allergiesContainer.style.display = 'none';
                }
            }
        }

        export function getPatientMedicalProfileEditorTheme(sectionKey) {
            if (sectionKey === 'allergies') {
                return {
                    cardClass: 'border border-red-200 rounded-xl p-4 bg-red-50',
                    titleClass: 'font-medium text-red-700',
                    noteClass: 'text-xs text-red-500',
                    labelClass: 'flex items-center gap-2 text-sm text-red-700',
                    checkboxClass: 'rounded border-red-300 text-red-600 focus:ring-red-500',
                    textareaClass: 'mt-3 w-full border border-red-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-500 focus:border-transparent break-all'
                };
            }
            return {
                cardClass: 'border border-gray-200 rounded-xl p-4 bg-gray-50',
                titleClass: 'font-medium text-gray-800',
                noteClass: 'text-xs text-gray-500',
                labelClass: 'flex items-center gap-2 text-sm text-gray-700',
                checkboxClass: 'rounded border-gray-300 text-green-600 focus:ring-green-500',
                textareaClass: 'mt-3 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent break-all'
            };
        }

        export function getPatientMedicalProfileSectionDescription(sectionKey) {
            switch (sectionKey) {
                case 'medicalConditions':
                    return '請剔選患者既往疾病史；如有其他情況或補充說明，請在下方備註填寫';
                case 'surgicalHistory':
                    return '請剔選曾接受的手術或重大外傷；如需補充年份、部位、後遺症或其他情況，請在下方備註填寫';
                case 'allergies':
                    return '請剔選已知過敏項目；如有反應詳情或其他未列出的過敏原，請在下方備註填寫';
                case 'medications':
                    return '請剔選現時或長期服用藥物類別；劑量、服用頻率或其他補充請在下方備註填寫';
                default:
                    return '';
            }
        }

        export function getPatientMedicalProfileSectionEnglishTitle(sectionKey) {
            switch (sectionKey) {
                case 'medicalConditions':
                    return 'Medical Conditions';
                case 'surgicalHistory':
                    return 'Surgical & Trauma History';
                case 'allergies':
                    return 'Allergies';
                case 'medications':
                    return 'Medications';
                default:
                    return '';
            }
        }

        export function getPatientMedicalProfileSectionNotePlaceholder(sectionKey) {
            switch (sectionKey) {
                case 'medicalConditions':
                    return '其他或備註，例如：確診年份、目前控制情況、其他未列出的疾病';
                case 'surgicalHistory':
                    return '其他或備註，例如：手術或受傷年份、受傷部位、是否有後遺症、其他未列出的手術或外傷';
                case 'allergies':
                    return '其他或備註，例如：過敏反應表現、嚴重程度、其他未列出的過敏原';
                case 'medications':
                    return '備註：劑量與服用頻率或其他補充';
                default:
                    return '其他或備註';
            }
        }

        export function ensureConsultationMedicalHistoryEditorContent() {
            const container = document.getElementById('consultationMedicalHistoryEditorContent');
            if (!container || container.dataset.initialized === 'true') {
                return;
            }

            container.innerHTML = G.PATIENT_MEDICAL_PROFILE_SECTIONS.map((section, index) => {
                const theme = getPatientMedicalProfileEditorTheme(section.key);
                const englishTitle = getPatientMedicalProfileSectionEnglishTitle(section.key);
                const description = getPatientMedicalProfileSectionDescription(section.key);
                const optionsHtml = section.options.map(option => `
                    <label class="${theme.labelClass}">
                        <input
                            type="checkbox"
                            class="${theme.checkboxClass} consultation-history-checkbox"
                            data-section="${window.escapeHtml(section.key)}"
                            value="${window.escapeHtml(option.key)}"
                        >
                        <span>${window.escapeHtml(option.label)}</span>
                    </label>
                `).join('');
                const titleSuffix = englishTitle ? ` (${window.escapeHtml(englishTitle)})` : '';
                return `
                    <div class="${theme.cardClass}">
                        <div class="flex flex-col gap-1 mb-3">
                            <span class="${theme.titleClass}">${index + 1}. ${window.escapeHtml(section.title)}${titleSuffix}</span>
                            <span class="${theme.noteClass}">${window.escapeHtml(description)}</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            ${optionsHtml}
                        </div>
                        <textarea
                            id="consultationHistoryEditor-${window.escapeHtml(section.key)}-note"
                            placeholder="${window.escapeHtml(getPatientMedicalProfileSectionNotePlaceholder(section.key))}"
                            rows="2"
                            class="${theme.textareaClass}"
                        ></textarea>
                    </div>
                `;
            }).join('');
            container.dataset.initialized = 'true';
        }

        export function clearConsultationMedicalHistoryEditorForm() {
            const modal = document.getElementById('consultationMedicalHistoryEditorModal');
            if (!modal) return;
            modal.querySelectorAll('.consultation-history-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
            G.PATIENT_MEDICAL_PROFILE_SECTIONS.forEach(section => {
                const noteInput = document.getElementById(`consultationHistoryEditor-${section.key}-note`);
                if (noteInput) {
                    noteInput.value = '';
                }
            });
        }

        export function populateConsultationMedicalHistoryEditorForm(profile, fallbackPatient = {}) {
            clearConsultationMedicalHistoryEditorForm();
            const normalizedProfile = normalizePatientMedicalProfile(profile);

            G.PATIENT_MEDICAL_PROFILE_SECTIONS.forEach(section => {
                const current = normalizedProfile[section.key];
                const selectedSet = new Set(current.selected);
                document.querySelectorAll(`.consultation-history-checkbox[data-section="${section.key}"]`).forEach(checkbox => {
                    checkbox.checked = selectedSet.has(checkbox.value);
                });
                const noteInput = document.getElementById(`consultationHistoryEditor-${section.key}-note`);
                if (noteInput) {
                    noteInput.value = current.note || '';
                }
            });

            if (hasPatientMedicalProfileContent(normalizedProfile)) {
                return;
            }

            const allergyNotesInput = document.getElementById('consultationHistoryEditor-allergies-note');
            if (allergyNotesInput && fallbackPatient && fallbackPatient.allergies) {
                allergyNotesInput.value = fallbackPatient.allergies;
            }
            const medicalConditionsNotesInput = document.getElementById('consultationHistoryEditor-medicalConditions-note');
            if (medicalConditionsNotesInput && fallbackPatient && fallbackPatient.history) {
                medicalConditionsNotesInput.value = fallbackPatient.history;
            }
        }

        export function collectConsultationMedicalHistoryEditorForm() {
            const profile = {};
            G.PATIENT_MEDICAL_PROFILE_SECTIONS.forEach(section => {
                const selected = Array.from(
                    document.querySelectorAll(`.consultation-history-checkbox[data-section="${section.key}"]:checked`)
                ).map(checkbox => checkbox.value);
                const noteInput = document.getElementById(`consultationHistoryEditor-${section.key}-note`);
                profile[section.key] = {
                    selected,
                    note: noteInput ? noteInput.value.trim() : ''
                };
            });
            return normalizePatientMedicalProfile(profile);
        }

        export function getCurrentConsultationPatientId() {
            if (G.currentConsultationEditContext && G.currentConsultationEditContext.patientId) {
                return G.currentConsultationEditContext.patientId;
            }
            if (!G.currentConsultingAppointmentId || !Array.isArray(G.appointments)) {
                return null;
            }
            const currentAppointment = G.appointments.find(apt => apt && String(apt.id) === String(G.currentConsultingAppointmentId));
            return currentAppointment && currentAppointment.patientId ? currentAppointment.patientId : null;
        }

        export async function openConsultationMedicalHistoryEditor(event) {
            const triggerButton = event && event.currentTarget ? event.currentTarget : document.getElementById('editConsultationMedicalHistoryButton');
            const patientId = getCurrentConsultationPatientId();
            if (!patientId) {
                G.showToast('找不到當前病人資料', 'error');
                return;
            }

            try {
                if (triggerButton) {
                    G.setButtonLoading(triggerButton, '載入中...');
                }
                const patient = await G.getPatientByIdWithRefresh(patientId);
                if (!patient) {
                    G.showToast('找不到病人資料！', 'error');
                    return;
                }

                ensureConsultationMedicalHistoryEditorContent();
                populateConsultationMedicalHistoryEditorForm(patient.medicalProfile, patient);

                const subtitleEl = document.getElementById('consultationMedicalHistoryEditorSubtitle');
                if (subtitleEl) {
                    subtitleEl.textContent = `${patient.name || '病人'} (${patient.patientNumber || '未有編號'})`;
                }

                const modal = document.getElementById('consultationMedicalHistoryEditorModal');
                if (modal) {
                    modal.classList.remove('hidden');
                }
            } catch (error) {
                console.error('開啟診症既住史編輯器失敗:', error);
                G.showToast('開啟既住史編輯器失敗', 'error');
            } finally {
                if (triggerButton) {
                    G.clearButtonLoading(triggerButton);
                }
            }
        }

        export function closeConsultationMedicalHistoryEditor() {
            const modal = document.getElementById('consultationMedicalHistoryEditorModal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }

        export async function saveConsultationMedicalHistory() {
            const patientId = getCurrentConsultationPatientId();
            if (!patientId) {
                G.showToast('找不到當前病人資料', 'error');
                return;
            }

            const saveButton = document.getElementById('saveConsultationMedicalHistoryButton');
            try {
                if (saveButton) {
                    G.setButtonLoading(saveButton, '儲存中...');
                }

                const patient = await G.getPatientByIdWithRefresh(patientId);
                if (!patient) {
                    G.showToast('找不到病人資料！', 'error');
                    return;
                }

                const medicalProfile = collectConsultationMedicalHistoryEditorForm();
                const medicalProfileSummary = buildPatientMedicalProfileLegacySummary(medicalProfile);
                const updatePayload = {
                    medicalProfile,
                    history: medicalProfileSummary.history,
                    allergies: medicalProfileSummary.allergies
                };

                const result = await window.firebaseDataManager.updatePatient(patientId, updatePayload);
                if (!result || !result.success) {
                    G.showToast('儲存既住史失敗，請稍後再試', 'error');
                    return;
                }

                invalidatePatientCaches();
                const refreshedPatient = await G.getPatientByIdWithRefresh(patientId) || {
                    ...patient,
                    ...updatePayload
                };
                renderConsultationPatientMedicalInfo(refreshedPatient);
                closeConsultationMedicalHistoryEditor();
                G.showToast('病人既住史已更新', 'success');
            } catch (error) {
                console.error('儲存診症既住史失敗:', error);
                G.showToast('儲存既住史時發生錯誤', 'error');
            } finally {
                if (saveButton) {
                    G.clearButtonLoading(saveButton);
                }
            }
        }
