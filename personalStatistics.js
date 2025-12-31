/**
 * 個人統計分析模組（V2）
 * 僅處理病歷中的「處方」與「針灸備註」欄位，漸進讀取＋本地快取＋增量更新。
 */
let personalHerbChartInstance = null;
let personalFormulaChartInstance = null;
let personalAcupointChartInstance = null;
let personalStatsCurrentMonth = null;

function psReadCache(doctor) {
    try {
        const s = localStorage.getItem('personalStatsV2');
        if (!s) return null;
        const obj = JSON.parse(s);
        const v = obj && obj[String(doctor)];
        return v || null;
    } catch (_e) {
        return null;
    }
}
function psWriteCache(doctor, value) {
    try {
        const s = localStorage.getItem('personalStatsV2');
        const obj = s ? JSON.parse(s) : {};
        obj[String(doctor)] = value;
        localStorage.setItem('personalStatsV2', JSON.stringify(obj));
    } catch (_e) {}
}

function normalizeDateIso(d) {
    if (!d) return null;
    if (typeof d === 'object' && d.seconds) {
        return new Date(d.seconds * 1000).toISOString();
    }
    try {
        const dt = new Date(d);
        if (!isNaN(dt.getTime())) return dt.toISOString();
    } catch (_e) {}
    return null;
}

function getMonthKeyFromIso(iso) {
    if (!iso) return null;
    try {
        const d = new Date(iso);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    } catch (_e) { return null; }
}

function computeStatsFromSummaries(list) {
    const herbCounts = {};
    const formulaCounts = {};
    const acupointCounts = {};
    if (!Array.isArray(list) || list.length === 0) {
        return { herbCounts, formulaCounts, acupointCounts };
    }
    const isFormulaName = (name) => {
        if (!Array.isArray(herbLibrary)) return false;
        const f = herbLibrary.find(i => i && i.name === name);
        return !!(f && f.type === 'formula');
    };
    for (const item of list) {
        try {
            const pres = item && item.prescription ? String(item.prescription) : '';
            const lines = pres.split('\n');
            for (const raw of lines) {
                const line = raw.trim();
                if (!line) continue;
                const m = line.match(/^([^0-9\s\(\)\.]+)/);
                const name = m ? m[1].trim() : line.split(/[\d\s]/)[0];
                if (!name) continue;
                if (isFormulaName(name)) {
                    formulaCounts[name] = (formulaCounts[name] || 0) + 1;
                } else {
                    herbCounts[name] = (herbCounts[name] || 0) + 1;
                }
            }
            const acNotes = item && item.acupunctureNotes ? String(item.acupunctureNotes) : '';
            const re = /data-acupoint-name="(.*?)"/g;
            let mm;
            while ((mm = re.exec(acNotes)) !== null) {
                const acName = mm[1];
                if (acName) {
                    acupointCounts[acName] = (acupointCounts[acName] || 0) + 1;
                }
            }
        } catch (_e) {}
    }
    return { herbCounts, formulaCounts, acupointCounts };
}

function filterByMonth(list, monthKey) {
    if (!monthKey) return list || [];
    return (list || []).filter(it => getMonthKeyFromIso(it.dateIso) === monthKey);
}

function computeAvailableMonths(list) {
    const set = new Set();
    for (const it of (list || [])) {
        const mk = getMonthKeyFromIso(it.dateIso);
        if (mk) set.add(mk);
    }
    const arr = Array.from(set);
    arr.sort((a, b) => {
        const [ay, am] = a.split('-').map(x => parseInt(x, 10));
        const [by, bm] = b.split('-').map(x => parseInt(x, 10));
        if (ay !== by) return by - ay;
        return bm - am;
    });
    return arr;
}

function renderPersonalStatistics(stats) {
    if (!stats) return;
    const { herbCounts, formulaCounts, acupointCounts } = stats;
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
    function renderChart(entries, canvasId, oldInstance) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        if (oldInstance && typeof oldInstance.destroy === 'function') {
            try { oldInstance.destroy(); } catch (_e) {}
        }
        const labels = entries.map(e => e[0]);
        const dataVals = entries.map(e => e[1]);
        const ctx = canvas.getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: '使用次數', data: dataVals }],
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

async function fetchSummariesByDoctor(doctor) {
    const list = [];
    let lastVisible = null;
    const pageSize = 50;
    try {
        await waitForFirebaseDb();
        const colRef = window.firebase.collection(window.firebase.db, 'consultations');
        let parts = [
            window.firebase.where('doctor', '==', doctor),
            window.firebase.orderBy('createdAt', 'asc'),
            window.firebase.limit(pageSize)
        ];
        let q = window.firebase.firestoreQuery(colRef, ...parts);
        let snap = await window.firebase.getDocs(q);
        const collect = (docSnap) => {
            const d = docSnap.data();
            const updatedAt = d.updatedAt || d.createdAt || null;
            const dateIso = normalizeDateIso(d.date) || normalizeDateIso(d.createdAt) || null;
            list.push({
                id: docSnap.id,
                prescription: d.prescription || '',
                acupunctureNotes: d.acupunctureNotes || '',
                updatedAt,
                dateIso
            });
        };
        snap.forEach(collect);
        lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
        while (snap.docs.length === pageSize && lastVisible) {
            parts = [
                window.firebase.where('doctor', '==', doctor),
                window.firebase.orderBy('date', 'asc'),
                window.firebase.startAfter(lastVisible),
                window.firebase.limit(pageSize)
            ];
            q = window.firebase.firestoreQuery(colRef, ...parts);
            snap = await window.firebase.getDocs(q);
            snap.forEach(collect);
            lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            await new Promise(r => setTimeout(r, 50));
        }
    } catch (error) {
        try {
            const fallback = await window.firebaseDataManager.getConsultationsByDoctor(doctor, pageSize);
            if (fallback && fallback.success && Array.isArray(fallback.data)) {
                for (const d of fallback.data) {
                    list.push({
                        id: d.id,
                        prescription: d.prescription || '',
                        acupunctureNotes: d.acupunctureNotes || '',
                        updatedAt: d.updatedAt || d.createdAt || null,
                        dateIso: normalizeDateIso(d.date) || normalizeDateIso(d.createdAt) || null
                    });
                }
            }
        } catch (_e) {}
    }
    return list;
}

async function applyDeltaUpdates(doctor, sinceISO, existingList) {
    const sinceDate = new Date(sinceISO);
    const index = new Map((existingList || []).map(i => [String(i.id), i]));
    try {
        const res = await window.firebaseDataManager.getConsultationsDeltaByDoctor(doctor, sinceDate);
        if (res && res.success && Array.isArray(res.data)) {
            for (const d of res.data) {
                const item = {
                    id: d.id,
                    prescription: d.prescription || '',
                    acupunctureNotes: d.acupunctureNotes || '',
                    updatedAt: d.updatedAt || d.createdAt || null,
                    dateIso: normalizeDateIso(d.date) || normalizeDateIso(d.createdAt) || null
                };
                index.set(String(item.id), item);
            }
        }
    } catch (_e) {}
    return Array.from(index.values());
}

function populateMonthSelect(months, currentKey) {
    const sel = document.getElementById('personalStatsMonthSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'ALL';
    allOpt.textContent = '全部月份';
    sel.appendChild(allOpt);
    const desiredKey = currentKey || 'ALL';
    const seen = new Set();
    if (months && months.length) {
        months.forEach(mk => {
            if (seen.has(mk)) return;
            const opt = document.createElement('option');
            opt.value = mk;
            opt.textContent = mk;
            sel.appendChild(opt);
            seen.add(mk);
        });
        const initialKey = desiredKey === 'ALL' ? 'ALL' : (months.includes(desiredKey) ? desiredKey : months[0]);
        sel.value = initialKey;
        personalStatsCurrentMonth = initialKey;
    } else {
        sel.value = desiredKey;
        personalStatsCurrentMonth = desiredKey;
    }
    sel.onchange = function () {
        personalStatsCurrentMonth = this.value || personalStatsCurrentMonth;
        try {
            const cache = psReadCache(currentUser);
            const list = cache && Array.isArray(cache.list) ? cache.list : [];
            const sub = personalStatsCurrentMonth === 'ALL' ? list : filterByMonth(list, personalStatsCurrentMonth);
            const stats = computeStatsFromSummaries(sub);
            renderPersonalStatistics(stats);
        } catch (_e) {}
    };
}

async function loadPersonalStatistics() {
    const doctor = currentUser;
    const cached = psReadCache(doctor);
    if (cached && cached.stats) {
        const months = computeAvailableMonths(cached.list || []);
        populateMonthSelect(months, 'ALL');
        const initialList = cached.list || [];
        renderPersonalStatistics(computeStatsFromSummaries(initialList));
        try {
            if (!cached.fullFetched) {
                const full = await fetchSummariesByDoctor(doctor);
                const monthsFull = computeAvailableMonths(full);
                populateMonthSelect(monthsFull, personalStatsCurrentMonth || 'ALL');
                const useFull = personalStatsCurrentMonth === 'ALL' ? full : filterByMonth(full, personalStatsCurrentMonth);
                const statsFull = computeStatsFromSummaries(useFull);
                const lastFull = (() => {
                    let latest = 0;
                    for (const c of full) {
                        const t = c && c.updatedAt
                            ? (c.updatedAt.seconds ? c.updatedAt.seconds * 1000 : new Date(c.updatedAt).getTime())
                            : 0;
                        if (t && t > latest) latest = t;
                    }
                    return latest ? new Date(latest) : new Date();
                })();
                const entryFull = { stats: statsFull, lastSyncAt: lastFull.toISOString(), list: full, fullFetched: true };
                psWriteCache(doctor, entryFull);
                renderPersonalStatistics(statsFull);
                return;
            }
            const hasUpdates = await window.firebaseDataManager.hasDoctorConsultationUpdates(doctor, new Date(cached.lastSyncAt));
            if (!hasUpdates) return;
            const merged = await applyDeltaUpdates(doctor, cached.lastSyncAt, cached.list || []);
            const months2 = computeAvailableMonths(merged);
            populateMonthSelect(months2, personalStatsCurrentMonth || 'ALL');
            const initialList2 = personalStatsCurrentMonth === 'ALL' ? merged : filterByMonth(merged, personalStatsCurrentMonth);
            const stats = computeStatsFromSummaries(initialList2);
            const lastSyncAt = (() => {
                let latest = 0;
                for (const c of merged) {
                    const t = c && c.updatedAt
                        ? (c.updatedAt.seconds ? c.updatedAt.seconds * 1000 : new Date(c.updatedAt).getTime())
                        : 0;
                    if (t && t > latest) latest = t;
                }
                return latest ? new Date(latest) : new Date();
            })();
            const entry = { stats, lastSyncAt: lastSyncAt.toISOString(), list: merged, fullFetched: true };
            psWriteCache(doctor, entry);
            renderPersonalStatistics(stats);
        } catch (_e) {}
        return;
    }
    const summaries = await fetchSummariesByDoctor(doctor);
    const months = computeAvailableMonths(summaries);
    populateMonthSelect(months, 'ALL');
    const initialList = summaries;
    const stats = computeStatsFromSummaries(initialList);
    const lastSyncAt = (() => {
        let latest = 0;
        for (const c of summaries) {
            const t = c && c.updatedAt
                ? (c.updatedAt.seconds ? c.updatedAt.seconds * 1000 : new Date(c.updatedAt).getTime())
                : 0;
            if (t && t > latest) latest = t;
        }
        return latest ? new Date(latest) : new Date();
    })();
    const entry = { stats, lastSyncAt: lastSyncAt.toISOString(), list: summaries, fullFetched: true };
    psWriteCache(doctor, entry);
    renderPersonalStatistics(stats);
}
