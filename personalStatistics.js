
// 必須與 system.js 的 PERSONAL_STATS_SUMMARY_VERSION 一致；
// 摘要結構改版時提升版號，舊快取會自動作廢。
const PERSONAL_STATS_CACHE_VERSION = 1;
const PERSONAL_STATS_CACHE_KEY = 'personalStatsV3';
// 超過此時效的快取仍可離線展示，但會標示「可能非最新」
const PERSONAL_STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let personalHerbChartInstance = null;
let personalFormulaChartInstance = null;
let personalAcupointChartInstance = null;
let personalStatsCurrentMonth = null;
let personalStatsCurrentClinic = 'ALL';
let personalStatsSelectedClinicName = '';
let personalStatsLoading = false;
let personalStatsBucketsCache = [];
let personalStatsLoadSeq = 0;
// 記住最後顯示的更新時間，供語言切換時重繪
let personalStatsLastUpdated = { iso: '', offline: false };
// 目前登入醫師 uid（偏好儲存的鍵）
let personalStatsCurrentUid = '';

// 圖表只畫前 N 名，其餘彙總為「其他」
const PERSONAL_STATS_TOP_N = 10;
// 記住每位醫師上次的診所／月份篩選
const PERSONAL_STATS_PREF_KEY = 'personalStatsPrefV1';

function psGetLang() {
    try { return (localStorage.getItem('lang') || 'zh').toLowerCase(); } catch (_e) { return 'zh'; }
}

function psReadPref(uid) {
    try {
        const raw = localStorage.getItem(PERSONAL_STATS_PREF_KEY);
        const all = raw ? JSON.parse(raw) : {};
        const v = (all && all[String(uid)]) || {};
        return {
            clinic: v.clinic === undefined || v.clinic === null ? '' : String(v.clinic),
            month: v.month === undefined || v.month === null ? '' : String(v.month)
        };
    } catch (_e) {
        return { clinic: '', month: '' };
    }
}

function psWritePref(uid, patch) {
    try {
        const raw = localStorage.getItem(PERSONAL_STATS_PREF_KEY);
        const all = raw ? JSON.parse(raw) : {};
        const key = String(uid);
        all[key] = Object.assign({ clinic: '', month: '' }, all[key] || {}, patch || {});
        localStorage.setItem(PERSONAL_STATS_PREF_KEY, JSON.stringify(all));
    } catch (_e) {}
}

// 2026-09 → 繁中「2026年9月」／英文「Sep 2026」
function formatMonthLabel(monthKey) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(String(monthKey || ''));
    if (!m) return String(monthKey || '');
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (psGetLang().startsWith('en')) {
        try {
            return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } catch (_e) {}
    }
    return `${y}年${mo}月`;
}

function setPersonalStatisticsLoading(loading) {
    personalStatsLoading = !!loading;
    const listIds = ['personalFormulaList', 'personalHerbList', 'personalAcupointList'];
    if (personalStatsLoading) {
        const loadingText = (typeof window.t === 'function' ? window.t('載入中...') : '載入中...');
        const loadingHtml = `
            <li class="py-6 text-center text-gray-500">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <div class="mt-2">${loadingText}</div>
            </li>
        `;
        listIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = loadingHtml;
        });
    }
    const clinicSel = document.getElementById('personalStatsClinicSelect');
    const monthSel = document.getElementById('personalStatsMonthSelect');
    if (clinicSel) clinicSel.disabled = personalStatsLoading;
    if (monthSel) monthSel.disabled = personalStatsLoading;
}

function psReadCache(doctor) {
    try {
        const s = localStorage.getItem(PERSONAL_STATS_CACHE_KEY);
        if (!s) return null;
        const obj = JSON.parse(s);
        const v = obj && obj[String(doctor)];
        if (!v || v.version !== PERSONAL_STATS_CACHE_VERSION || !Array.isArray(v.buckets)) {
            return null;
        }
        return v;
    } catch (_e) {
        return null;
    }
}
function psWriteCache(doctor, value) {
    try {
        const s = localStorage.getItem(PERSONAL_STATS_CACHE_KEY);
        const obj = s ? JSON.parse(s) : {};
        obj[String(doctor)] = {
            ...value,
            version: PERSONAL_STATS_CACHE_VERSION
        };
        localStorage.setItem(PERSONAL_STATS_CACHE_KEY, JSON.stringify(obj));
    } catch (_e) {}
}

function renderPersonalStatsUpdatedAt(iso, offline) {
    personalStatsLastUpdated = { iso: iso || '', offline: !!offline };
    const el = document.getElementById('personalStatsUpdatedAt');
    if (!el) return;
    if (!iso) {
        el.textContent = '';
        return;
    }
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
        el.textContent = '';
        return;
    }
    const tr = (text) => (typeof window.t === 'function' ? window.t(text) : text);
    const time = d.toLocaleString();
    el.textContent = offline
        ? `${tr('最後更新')}：${time}（${tr('離線快取，可能非最新')}）`
        : `${tr('最後更新')}：${time}`;
}

function setPersonalStatsMessage(kind, html) {
    const el = document.getElementById('personalStatsMessage');
    if (!el) return;
    if (!html) {
        el.className = 'hidden mb-4 rounded-lg border px-4 py-3 text-sm';
        el.innerHTML = '';
        return;
    }
    const styles = kind === 'error'
        ? 'border-red-300 bg-red-50 text-red-800'
        : 'border-amber-300 bg-amber-50 text-amber-800';
    el.className = `mb-4 rounded-lg border px-4 py-3 text-sm ${styles}`;
    el.innerHTML = html;
}

function normalizeText(s) {
    if (s == null) return '';
    try {
        return String(s).trim().toLowerCase();
    } catch (_e) { return ''; }
}

// local-default 是未選診所的本機兜底值，個人統計一律不顯示
function isHiddenClinicId(clinicId) {
    return normalizeText(clinicId) === 'local-default';
}

function filterByClinic(list, clinicId, clinicName) {
    const visible = (list || []).filter(it => !isHiddenClinicId(it && it.clinicId));
    if (!clinicId || clinicId === 'ALL') return visible;
    const idNorm = normalizeText(clinicId);
    const nameNorm = normalizeText(clinicName);
    return visible.filter(it => {
        const itemId = normalizeText(it.clinicId || '');
        const itemName = normalizeText(it.clinicName || '');
        return (itemId && itemId === idNorm) || (itemName && nameNorm && itemName === nameNorm);
    });
}

function filterByMonth(list, monthKey) {
    if (!monthKey) return list || [];
    return (list || []).filter(it => String(it && it.monthKey || '') === String(monthKey));
}

function computeAvailableMonths(list) {
    const set = new Set();
    for (const it of (list || [])) {
        const mk = it && it.monthKey ? String(it.monthKey) : null;
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

function mapPersonalStatsDisplayName(name, type) {
    if (!psGetLang().startsWith('en')) return name;
    try {
        if (type === 'herb' || type === 'formula') {
            if (Array.isArray(herbLibrary)) {
                const item = herbLibrary.find(h => h && h.name === name && (type === 'herb' ? h.type === 'herb' : h.type === 'formula'));
                if (item && item.englishName) return item.englishName;
            }
        } else if (type === 'acupoint') {
            if (Array.isArray(acupointLibrary)) {
                const ac = acupointLibrary.find(a => a && a.name === name);
                if (ac && ac.englishName) return ac.englishName;
            }
        }
    } catch (_e) {}
    return name;
}

function renderPersonalStatistics(stats) {
    if (!stats) return;
    const { herbCounts, formulaCounts, acupointCounts } = stats;
    const tr = (text) => (typeof window.t === 'function' ? window.t(text) : text);

    function sortedEntries(counts) {
        return Object.entries(counts || {}).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
    }

    function renderList(counts, listId) {
        const listEl = document.getElementById(listId);
        if (!listEl) return [];
        listEl.innerHTML = '';
        const type = (listId === 'personalHerbList') ? 'herb' : (listId === 'personalFormulaList') ? 'formula' : 'acupoint';
        const entries = sortedEntries(counts).slice(0, PERSONAL_STATS_TOP_N);
        entries.forEach(([name, count]) => {
            const li = document.createElement('li');
            li.className = 'py-1 flex justify-between';
            const disp = mapPersonalStatsDisplayName(name, type);
            li.innerHTML = `<span>${window.escapeHtml(disp)}</span><span class="font-semibold">${count}</span>`;
            listEl.appendChild(li);
        });
        if (!entries.length) {
            const li = document.createElement('li');
            li.className = 'py-6 text-center text-gray-400';
            li.textContent = tr('尚無資料');
            listEl.appendChild(li);
        }
        return entries;
    }
    function renderKpi(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    }
    // 圖表只取前 N 名。曾把第 N+1 名以後彙總成「其他（K 種）」，
    // 但中藥／穴位為長尾分布，彙總值幾乎必然壓過第 1 名，
    // 視覺上像一個真實且最常用的品項，造成誤導，故移除。
    function buildChartRows(counts, type) {
        return sortedEntries(counts).slice(0, PERSONAL_STATS_TOP_N).map(e => ({
            label: mapPersonalStatsDisplayName(e[0], type),
            value: e[1]
        }));
    }
    function renderChart(rows, canvasId, oldInstance) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        if (oldInstance && typeof oldInstance.destroy === 'function') {
            try { oldInstance.destroy(); } catch (_e) {}
        }
        // 橫向長條圖：中文名稱不重疊；反轉使第 1 名顯示在最上方
        const ordered = rows.slice().reverse();
        const labels = ordered.map(r => r.label);
        const dataVals = ordered.map(r => r.value);
        const ctx = canvas.getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: tr('使用次數'),
                    data: dataVals,
                    backgroundColor: 'rgba(217,119,6,0.75)'
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0 } },
                    y: { ticks: { autoSkip: false } }
                },
            },
        });
    }
    renderList(formulaCounts, 'personalFormulaList');
    personalFormulaChartInstance = renderChart(buildChartRows(formulaCounts, 'formula'), 'personalFormulaChart', personalFormulaChartInstance);
    renderList(herbCounts, 'personalHerbList');
    personalHerbChartInstance = renderChart(buildChartRows(herbCounts, 'herb'), 'personalHerbChart', personalHerbChartInstance);
    renderList(acupointCounts, 'personalAcupointList');
    personalAcupointChartInstance = renderChart(buildChartRows(acupointCounts, 'acupoint'), 'personalAcupointChart', personalAcupointChartInstance);
    renderKpi('personalStatsTotalConsultations', Math.round(Number(stats.totalConsultations) || 0));
    renderKpi('personalStatsFormulaKinds', Object.keys(formulaCounts || {}).length);
    renderKpi('personalStatsHerbKinds', Object.keys(herbCounts || {}).length);
    renderKpi('personalStatsAcupointKinds', Object.keys(acupointCounts || {}).length);
}

function entriesToCountMap(entries) {
    const out = {};
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const name = entry && entry.name ? String(entry.name) : '';
        const count = Math.round(Number(entry && entry.count) || 0);
        if (!name || count <= 0) return;
        out[name] = (out[name] || 0) + count;
    });
    return out;
}

function mergeCountMaps(target, source) {
    const base = target || {};
    Object.entries(source || {}).forEach(([name, count]) => {
        base[name] = (base[name] || 0) + (Number(count) || 0);
    });
    return base;
}

function computeStatsFromBuckets(list) {
    const herbCounts = {};
    const formulaCounts = {};
    const acupointCounts = {};
    let totalConsultations = 0;
    (Array.isArray(list) ? list : []).forEach((bucket) => {
        mergeCountMaps(herbCounts, entriesToCountMap(bucket && bucket.herbEntries));
        mergeCountMaps(formulaCounts, entriesToCountMap(bucket && bucket.formulaEntries));
        mergeCountMaps(acupointCounts, entriesToCountMap(bucket && bucket.acupointEntries));
        totalConsultations += Math.round(Number(bucket && bucket.totalConsultations) || 0);
    });
    return { herbCounts, formulaCounts, acupointCounts, totalConsultations };
}

function updatePersonalStatisticsView(refreshMonthOptions = true) {
    const byClinic = filterByClinic(personalStatsBucketsCache, personalStatsCurrentClinic, personalStatsSelectedClinicName);
    if (refreshMonthOptions) {
        const months = computeAvailableMonths(byClinic);
        populateMonthSelect(months, personalStatsCurrentMonth || 'ALL');
    }
    const filtered = personalStatsCurrentMonth === 'ALL'
        ? byClinic
        : filterByMonth(byClinic, personalStatsCurrentMonth);
    renderPersonalStatistics(computeStatsFromBuckets(filtered));
}

function populateMonthSelect(months, currentKey) {
    const sel = document.getElementById('personalStatsMonthSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'ALL';
    allOpt.textContent = window.t('全部月份');
    sel.appendChild(allOpt);
    const desiredKey = currentKey || 'ALL';
    const seen = new Set();
    if (months && months.length) {
        months.forEach(mk => {
            if (seen.has(mk)) return;
            const opt = document.createElement('option');
            opt.value = mk;
            opt.textContent = formatMonthLabel(mk);
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
    if (personalStatsCurrentUid) psWritePref(personalStatsCurrentUid, { month: personalStatsCurrentMonth });
    sel.onchange = function () {
        personalStatsCurrentMonth = this.value || personalStatsCurrentMonth;
        if (personalStatsCurrentUid) psWritePref(personalStatsCurrentUid, { month: personalStatsCurrentMonth });
        try {
            updatePersonalStatisticsView(false);
        } catch (_e) {}
    };
}

function readClinicsForPersonalStats() {
    try {
        const s = localStorage.getItem('clinics');
        const arr = s ? JSON.parse(s) : [];
        if (!Array.isArray(arr)) return [];
        return arr.filter(c => normalizeText(c && c.id ? c.id : '') !== 'local-default').map(c => ({
            id: c && c.id ? c.id : '',
            name: (c && (c.chineseName || c.englishName)) ? (c.chineseName || c.englishName) : (c && c.id ? c.id : '')
        }));
    } catch (_e) {
        return [];
    }
}

function populateClinicSelect(initialClinicId) {
    const sel = document.getElementById('personalStatsClinicSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const clinics = readClinicsForPersonalStats();
    // 僅一間診所時不需「全部診所」選項，直接鎖定該診所
    const singleClinic = clinics.length === 1;
    if (!singleClinic) {
        const allOpt = document.createElement('option');
        allOpt.value = 'ALL';
        allOpt.textContent = window.t('全部診所');
        sel.appendChild(allOpt);
    }
    clinics.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id || '';
        sel.appendChild(opt);
    });
    let desired = initialClinicId || 'ALL';
    const clinicExists = clinics.some(c => String(c.id) === String(desired));
    if (singleClinic) {
        desired = clinics[0].id;
    } else if (desired !== 'ALL' && !clinicExists) {
        desired = 'ALL';
    }
    sel.value = desired;
    personalStatsCurrentClinic = desired;
    const curObj = clinics.find(c => String(c.id) === String(desired));
    personalStatsSelectedClinicName = curObj ? (curObj.name || '') : '';
    if (personalStatsCurrentUid) psWritePref(personalStatsCurrentUid, { clinic: desired });
    sel.onchange = function () {
        personalStatsCurrentClinic = this.value || personalStatsCurrentClinic;
        try {
            const cList = readClinicsForPersonalStats();
            const found = cList.find(c => String(c.id) === String(personalStatsCurrentClinic));
            personalStatsSelectedClinicName = found ? (found.name || '') : '';
        } catch (_e0) {}
        if (personalStatsCurrentUid) psWritePref(personalStatsCurrentUid, { clinic: personalStatsCurrentClinic });
        try {
            updatePersonalStatisticsView(true);
        } catch (_e) {}
    };
}

// 語言切換時圖表不會自動更新（canvas 非文字節點），需手動重繪；
// 下拉選項的文字也一併重建。
function bindPersonalStatsLanguageHook() {
    const sel = document.getElementById('languageSelector');
    if (!sel || sel.dataset.personalStatsLangBound === '1') return;
    sel.dataset.personalStatsLangBound = '1';
    sel.addEventListener('change', () => {
        const section = document.getElementById('personalStatistics');
        if (!section || section.classList.contains('hidden')) return;
        try {
            populateClinicSelect(personalStatsCurrentClinic);
            updatePersonalStatisticsView(true);
            if (personalStatsLastUpdated.iso) {
                renderPersonalStatsUpdatedAt(personalStatsLastUpdated.iso, personalStatsLastUpdated.offline);
            }
        } catch (_e) {}
    });
}

async function loadPersonalStatistics() {
    const seq = ++personalStatsLoadSeq;
    setPersonalStatisticsLoading(true);
    setPersonalStatsMessage(null);
    bindPersonalStatsLanguageHook();
    const tr = (text) => (typeof window.t === 'function' ? window.t(text) : text);
    try {
        // owner 身份為 Firebase Auth uid（舊版曾用 username，已全面改 uid）
        let doctor = '';
        try {
            const fbUser = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
            doctor = fbUser && fbUser.uid ? String(fbUser.uid) : '';
        } catch (_authErr) {}
        if (!doctor) {
            setPersonalStatsMessage('error', tr('無法辨識登入階段，請重新整理頁面後再試。'));
            return;
        }
        personalStatsCurrentUid = doctor;
        // 還原上次的診所／月份篩選
        const pref = psReadPref(doctor);
        populateClinicSelect(pref.clinic || 'ALL');
        personalStatsCurrentMonth = pref.month || 'ALL';
        const cached = psReadCache(doctor);
        if (cached && Array.isArray(cached.buckets)) {
            personalStatsBucketsCache = cached.buckets.slice();
        } else {
            personalStatsBucketsCache = [];
        }
        // 先渲染快取或空狀態，避免網路失敗時三個清單永遠卡在載入中
        updatePersonalStatisticsView(true);
        if (cached && cached.cachedAt) renderPersonalStatsUpdatedAt(cached.cachedAt, false);

        let res = null;
        let fetchError = null;
        try {
            res = await window.firebaseDataManager.getPersonalStatsMonthlySummaries(doctor);
        } catch (e) {
            fetchError = e;
        }
        // 較新的一次載入已啟動，拋棄這次過期結果
        if (seq !== personalStatsLoadSeq) return;

        if (res && res.success && Array.isArray(res.data)) {
            personalStatsBucketsCache = res.data.slice();
            const nowIso = new Date().toISOString();
            psWriteCache(doctor, {
                buckets: personalStatsBucketsCache,
                cachedAt: nowIso
            });
            updatePersonalStatisticsView(true);
            renderPersonalStatsUpdatedAt(nowIso, false);
            if (res.initError) {
                console.warn('個人統計歷史摘要初始化失敗:', res.initError);
                setPersonalStatsMessage(
                    'warn',
                    `${tr('部分歷史統計仍在準備中，目前僅顯示已同步的資料；若長期未更新，請聯絡管理員檢查索引設定。')}`
                );
            }
        } else {
            const detail = fetchError
                ? (fetchError && fetchError.message ? fetchError.message : String(fetchError))
                : (res && res.error ? String(res.error) : 'unknown-error');
            console.warn('個人統計載入失敗:', detail);
            const hasCache = !!(cached && Array.isArray(cached.buckets) && cached.buckets.length);
            const cacheAge = cached && cached.cachedAt ? Date.now() - new Date(cached.cachedAt).getTime() : Infinity;
            const cacheStale = hasCache && (!isFinite(cacheAge) || cacheAge > PERSONAL_STATS_CACHE_TTL_MS);
            if (hasCache) {
                renderPersonalStatsUpdatedAt(cached.cachedAt, true);
            } else {
                renderPersonalStatsUpdatedAt('', false);
            }
            const offlineText = cacheStale
                ? tr('無法更新統計，目前顯示的快取已超過 24 小時，可能非最新。')
                : tr('無法更新統計，目前顯示快取資料。');
            setPersonalStatsMessage(
                'error',
                `${hasCache ? offlineText : tr('統計資料載入失敗。')}
                 <button type="button" onclick="loadPersonalStatistics()"
                    class="ml-2 underline font-semibold">${tr('重試')}</button>`
            );
        }
    } finally {
        if (seq === personalStatsLoadSeq) {
            setPersonalStatisticsLoading(false);
        }
    }
}
