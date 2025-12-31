/**
 * 個人統計分析模組
 * 包含載入、計算與渲染個人統計資料的邏輯
 */

// 個人統計分析的圖表實例，用於更新時先銷毀舊圖表
let personalHerbChartInstance = null;
let personalFormulaChartInstance = null;
let personalAcupointChartInstance = null;

/**
 * 計算指定醫師的個人用藥與穴位統計。
 * 會比對 consultation.doctor 是否等於 doctor (使用者帳號)。
 * 回傳物件包含 herbCounts、formulaCounts 與 acupointCounts。
 */
function computePersonalStatistics(doctor) {
    const herbCounts = {};
    const formulaCounts = {};
    const acupointCounts = {};
    // consultations and herbLibrary are global variables from system.js
    if (!Array.isArray(consultations) || consultations.length === 0) {
        return { herbCounts, formulaCounts, acupointCounts };
    }
    consultations.forEach(cons => {
        try {
            if (doctor && cons.doctor && String(cons.doctor) !== String(doctor)) {
                return;
            }
            const pres = cons && cons.prescription ? cons.prescription : '';
            const lines = pres.split('\n');
            lines.forEach(rawLine => {
                const line = rawLine.trim();
                if (!line) return;
                const match = line.match(/^([^0-9\s\(\)\.]+)/);
                const name = match ? match[1].trim() : line.split(/[\d\s]/)[0];
                if (!name) return;
                let isFormula = false;
                if (Array.isArray(herbLibrary)) {
                    const found = herbLibrary.find(item => item.name === name);
                    if (found && found.type === 'formula') {
                        isFormula = true;
                    }
                }
                if (isFormula) {
                    formulaCounts[name] = (formulaCounts[name] || 0) + 1;
                } else {
                    herbCounts[name] = (herbCounts[name] || 0) + 1;
                }
            });
            // 解析針灸備註中的穴位名稱
            const acNotes = cons && cons.acupunctureNotes ? cons.acupunctureNotes : '';
            const regex = /data-acupoint-name="(.*?)"/g;
            let matchAc;
            while ((matchAc = regex.exec(acNotes)) !== null) {
                const acName = matchAc[1];
                if (acName) {
                    acupointCounts[acName] = (acupointCounts[acName] || 0) + 1;
                }
            }
        } catch (_e) {
            // 忽略此筆診症的解析錯誤
        }
    });
    return { herbCounts, formulaCounts, acupointCounts };
}

/**
 * 載入個人統計分析頁面並渲染統計結果。
 * 若 consultations 尚未載入，會先載入全部診症記錄。
 */
async function loadPersonalStatistics() {
    const cacheKey = String(currentUser || '');
    window.personalStatsCache = window.personalStatsCache || {};
    // readCache is global from system.js
    const existing = window.personalStatsCache[cacheKey] || readCache('personalStatsCache', cacheKey);
    if (!existing) {
        if (!Array.isArray(consultations) || consultations.length === 0) {
            try {
                if (window.firebaseDataManager && window.firebaseDataManager.isReady) {
                    const res = await window.firebaseDataManager.getConsultationsByDoctor(currentUser);
                    if (res && res.success) {
                        consultations = res.data.map(item => {
                            let dateStr = null;
                            if (item.date) {
                                if (typeof item.date === 'object' && item.date.seconds) {
                                    dateStr = new Date(item.date.seconds * 1000).toISOString();
                                } else {
                                    dateStr = item.date;
                                }
                            } else if (item.createdAt) {
                                if (typeof item.createdAt === 'object' && item.createdAt.seconds) {
                                    dateStr = new Date(item.createdAt.seconds * 1000).toISOString();
                                } else {
                                    dateStr = item.createdAt;
                                }
                            }
                            return { id: item.id, date: dateStr, doctor: item.doctor, prescription: item.prescription, acupunctureNotes: item.acupunctureNotes, createdAt: item.createdAt, updatedAt: item.updatedAt };
                        });
                    }
                }
            } catch (_e) {
                console.error('載入診症資料失敗：', _e);
            }
        }
    } else {
        try {
            if (window.firebaseDataManager && typeof window.firebaseDataManager.hasDoctorConsultationUpdates === 'function') {
                const lastSyncAtRef = existing.lastSyncAt ? new Date(existing.lastSyncAt) : null;
                const changed = await window.firebaseDataManager.hasDoctorConsultationUpdates(currentUser, lastSyncAtRef);
                if (!changed) {
                    renderPersonalStatistics(existing.stats);
                    return;
                }
                const deltaRes = await window.firebaseDataManager.getConsultationsDeltaByDoctor(currentUser, existing.lastSyncAt);
                if (deltaRes && deltaRes.success) {
                    const normalize = (item) => {
                        let dateStr = null;
                        if (item.date) {
                            if (typeof item.date === 'object' && item.date.seconds) {
                                dateStr = new Date(item.date.seconds * 1000).toISOString();
                            } else {
                                dateStr = item.date;
                            }
                        } else if (item.createdAt) {
                            if (typeof item.createdAt === 'object' && item.createdAt.seconds) {
                                dateStr = new Date(item.createdAt.seconds * 1000).toISOString();
                            } else {
                                dateStr = item.createdAt;
                            }
                        }
                        return { id: item.id, date: dateStr, doctor: item.doctor, prescription: item.prescription, acupunctureNotes: item.acupunctureNotes, createdAt: item.createdAt, updatedAt: item.updatedAt };
                    };
                    const deltas = deltaRes.data.map(normalize);
                    const index = new Map((existing.list || []).map(c => [String(c.id), c]));
                    for (const r of deltas) {
                        index.set(String(r.id), r);
                    }
                    consultations = Array.from(index.values());
                }
            }
        } catch (_e) {}
    }
    const doctor = currentUser;
    const stats = computePersonalStatistics(doctor);
    const lastSyncAt = (() => {
        let latest = 0;
        for (const c of consultations) {
            const u = c && c.updatedAt ? (c.updatedAt.seconds ? c.updatedAt.seconds*1000 : new Date(c.updatedAt).getTime()) : 0;
            const cr = c && c.createdAt ? (c.createdAt.seconds ? c.createdAt.seconds*1000 : new Date(c.createdAt).getTime()) : 0;
            const t = Math.max(u||0, cr||0);
            if (t && t > latest) latest = t;
        }
        return latest ? new Date(latest) : new Date();
    })();
    const entry = { stats, lastSyncAt: lastSyncAt.toISOString(), list: consultations };
    window.personalStatsCache[cacheKey] = entry;
    writeCache('personalStatsCache', cacheKey, entry);
    renderPersonalStatistics(stats);
}

/**
 * 根據計算的統計資料更新列表與圖表。
 * 只顯示每個類別前 10 名。
 */
function renderPersonalStatistics(stats) {
    if (!stats) return;
    const { herbCounts, formulaCounts, acupointCounts } = stats;
    // 渲染列表
    function renderList(counts, listId) {
        const listEl = document.getElementById(listId);
        if (!listEl) return [];
        listEl.innerHTML = '';
        const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
        entries.forEach(([name, count]) => {
            const li = document.createElement('li');
            li.className = 'py-1 flex justify-between';
            li.innerHTML = `<span>${window.escapeHtml(name)}</span><span class="font-semibold">${count}</span>`;
            listEl.appendChild(li);
        });
        return entries;
    }
    // 渲染圖表
    function renderChart(entries, canvasId, oldInstance) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        if (oldInstance && typeof oldInstance.destroy === 'function') {
            try {
                oldInstance.destroy();
            } catch (_e) {}
        }
        const labels = entries.map(e => e[0]);
        const dataVals = entries.map(e => e[1]);
        const ctx = canvas.getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '使用次數',
                        data: dataVals,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: '名稱' } },
                    y: { title: { display: true, text: '使用次數' }, beginAtZero: true },
                },
            },
        });
    }
    const herbEntries = renderList(herbCounts, 'personalHerbList');
    personalHerbChartInstance = renderChart(herbEntries, 'personalHerbChart', personalHerbChartInstance);
    const formulaEntries = renderList(formulaCounts, 'personalFormulaList');
    personalFormulaChartInstance = renderChart(formulaEntries, 'personalFormulaChart', personalFormulaChartInstance);
    const acEntries = renderList(acupointCounts, 'personalAcupointList');
    personalAcupointChartInstance = renderChart(acEntries, 'personalAcupointChart', personalAcupointChartInstance);
}
