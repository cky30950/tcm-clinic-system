/* ============================================================
 * member.js — 病人會員查詢（無需登入、不發 SMS）
 * ------------------------------------------------------------
 * 輸入於診所登記的香港手機號碼 → POST /api/member/lookup
 * 由 Service Account 查詢並回傳：儲值餘額、有效套票、最近交易。
 * 頁面不直接連接 Firestore，不顯示任何病歷。
 * ============================================================ */

/* ---------------- i18n ---------------- */

const I18N = {
    zh: {
        clinicName: '名醫診所系統',
        authTitle: '會員查詢',
        authSub: '輸入於診所登記之手機號碼，即可查閱儲值餘額、套票及交易記錄。',
        phoneLabel: '手機號碼',
        phoneHint: '請輸入於診所登記之手機號碼。',
        lookup: '查詢',
        looking: '查詢中…',
        errCaptcha: '請先完成人機驗證',
        captchaNotSet: '人機驗證尚未設定，請聯絡診所職員',
        captchaFailed: '人機驗證無法完成，請重新整理頁面或稍後再試',
        captchaLoading: '人機驗證載入中…',
        totalBalance: '儲值總餘額 (HKD)',
        principal: '本金餘額',
        bonus: '贈送餘額',
        packages: '有效套票',
        transactions: '最近交易',
        back: '返回',
        prevPage: '上一頁',
        nextPage: '下一頁',
        noPackages: '目前沒有有效套票',
        noTransactions: '暫無交易記錄',
        noAccount: '未找到儲值帳戶',
        uses: '餘次',
        noExpiry: '無有效期',
        txTopup: '儲值充值',
        txPayment: '診症扣款',
        txRefund: '退款',
        txAdjust: '人工調整',
        txStatus: '狀態變更',
        errPhone: '請輸入於診所登記的電話號碼',
        errNoPatient: '系統中沒有以此電話登記的病人記錄。',
        errNotMember: '閣下尚未登記成為會員，未能進入會員端。請親臨診所開通儲值帳戶，或聯絡診所職員協助。',
        errLoad: '查詢失敗，請稍後再試',
        patientLabel: '病人',
        selectClinic: '選擇診所',
        unassigned: '未分組',
        bookingTitle: '線上預約掛號',
        bookingSub: '選擇醫師、應診日期及時段，24 小時均可線上預約。',
        doctorLabel: '醫師',
        selectDoctorPrompt: '請選擇醫師',
        dateLabel: '應診日期',
        selectDatePrompt: '請先選擇醫師',
        datePlaceholder: '請選擇日期',
        slotLabel: '應診時段',
        complaintLabel: '主訴（選填）',
        complaintPlaceholder: '例如：咳嗽、失眠…',
        complaintHint: '可簡單描述不適，方便醫師事前準備。',
        confirmBooking: '確認預約',
        booking: '預約中…',
        myAppointments: '我的預約',
        noMyAppointments: '暫未有待定預約',
        slotFull: '已滿',
        slotClosed: '已截止',
        slotLoading: '載入中…',
        dayClosed: '該日診所休診',
        doctorOff: '該醫師此日休診',
        bookingDisabled: '此診所目前未開放線上預約，請致電診所掛號。',
        errNoClinic: '未能確定診所，請聯絡診所職員。',
        cancelAppointment: '取消',
        rulesNoteTpl: '須於應診前 {a} 分鐘預約；提前 {b} 分鐘可線上取消；每人最多 {c} 個有效預約，每日只可預約 {d} 次。',
        bookingSuccess: '預約成功！請準時到診，如需更改請於「我的預約」處理。',
        cancelSuccess: '預約已取消。',
        statusRegistered: '已預約',
        statusWaiting: '候診中',
        statusConsulting: '診症中',
        errBookingFailed: '預約失敗，請稍後再試',
        errCancelFailed: '取消失敗，請稍後再試',
        errNeedSlot: '請先選擇應診時段',
        humanVerifyTitle: '取消預約',
        humanVerifyPrompt: '請完成人機驗證以確認取消預約。',
        humanVerifyCancel: '放棄',
        today: '今天',
        tomorrow: '明天',
        weekdaysShort: ['日', '一', '二', '三', '四', '五', '六'],
        langToggle: 'English'
    },
    en: {
        clinicName: 'Dr.Great Clinic System',
        authTitle: 'Member Portal',
        authSub: 'Enter your mobile number registered with the clinic to view your stored-value balance, packages and transactions.',
        phoneLabel: 'Mobile number',
        phoneHint: 'Enter the number registered with the clinic.',
        lookup: 'Look up',
        looking: 'Looking up…',
        errCaptcha: 'Please complete the human verification',
        captchaNotSet: 'Human verification is not configured. Please contact the clinic.',
        captchaFailed: 'Human verification could not be completed. Please refresh the page or try again later.',
        captchaLoading: 'Loading human verification…',
        totalBalance: 'Total balance (HKD)',
        principal: 'Principal',
        bonus: 'Bonus',
        packages: 'Active packages',
        transactions: 'Recent transactions',
        back: 'Back',
        prevPage: 'Previous',
        nextPage: 'Next',
        noPackages: 'No active packages',
        noTransactions: 'No transactions yet',
        noAccount: 'No stored-value account found',
        uses: 'uses left',
        noExpiry: 'No expiry',
        txTopup: 'Top-up',
        txPayment: 'Consultation payment',
        txRefund: 'Refund',
        txAdjust: 'Manual adjustment',
        txStatus: 'Status change',
        errPhone: 'Please enter the phone number registered with the clinic',
        errNoPatient: 'No patient record is registered with this phone number.',
        errNotMember: "You are not a registered member yet, so you cannot access the member portal. Please visit the clinic to open a stored-value account, or contact our staff for assistance.",
        errLoad: 'Lookup failed, please try again later',
        patientLabel: 'Patient',
        selectClinic: 'Select clinic',
        unassigned: 'Unassigned',
        bookingTitle: 'Online Appointment Booking',
        bookingSub: 'Choose a doctor, date and time slot — online booking is available 24 hours.',
        doctorLabel: 'Doctor',
        selectDoctorPrompt: 'Please select a doctor',
        dateLabel: 'Consultation date',
        selectDatePrompt: 'Please select a doctor first',
        datePlaceholder: 'Please select a date',
        slotLabel: 'Time slot',
        complaintLabel: 'Chief complaint (optional)',
        complaintPlaceholder: 'e.g. cough, insomnia…',
        complaintHint: 'Briefly describe your symptoms to help the doctor prepare.',
        confirmBooking: 'Confirm booking',
        booking: 'Booking…',
        myAppointments: 'My appointments',
        noMyAppointments: 'No upcoming appointments',
        slotFull: 'Full',
        slotClosed: 'Closed',
        slotLoading: 'Loading…',
        dayClosed: 'Clinic closed on this day',
        doctorOff: 'This doctor is off on this day',
        bookingDisabled: 'Online booking is not available for this clinic. Please call to book.',
        errNoClinic: 'Clinic could not be determined. Please contact the clinic.',
        cancelAppointment: 'Cancel',
        rulesNoteTpl: 'Book at least {a} minutes ahead; cancel at least {b} minutes ahead; max {c} active appointments per member and {d} booking(s) per day.',
        bookingSuccess: 'Booking confirmed! Please arrive on time. Changes can be made under “My appointments”.',
        cancelSuccess: 'Appointment cancelled.',
        statusRegistered: 'Booked',
        statusWaiting: 'Waiting',
        statusConsulting: 'In consultation',
        errBookingFailed: 'Booking failed, please try again later',
        errCancelFailed: 'Cancellation failed, please try again later',
        errNeedSlot: 'Please select a time slot first',
        humanVerifyTitle: 'Cancel appointment',
        humanVerifyPrompt: 'Please complete the verification to confirm cancellation.',
        humanVerifyCancel: 'Dismiss',
        today: 'Today',
        tomorrow: 'Tomorrow',
        weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        langToggle: '中文'
    }
};

let lang = (function () {
    try {
        const saved = localStorage.getItem('memberLang');
        if (saved === 'en' || saved === 'zh') return saved;
    } catch (_e) {}
    return 'zh';
})();

function t(key) {
    return I18N[lang][key] || I18N.zh[key] || key;
}

function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-HK';
    document.getElementById('langToggle').textContent = t('langToggle');
}

document.getElementById('langToggle').addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('memberLang', lang); } catch (_e) {}
    applyStaticI18n();
    // 診所選項名稱隨語言更新（資料頁可見時）
    if (!$('dataView').classList.contains('hidden')) {
        renderClinicSelector();
        if (bookingRules) {
            renderRulesNote();
            renderBookingDates();
            renderSlotGrid();
            renderMyAppointments();
        }
    }
});

/* ---------------- UI helpers ---------------- */

const $ = (id) => document.getElementById(id);

// 後端回傳的姓名、套片名、錢包備註等均為員工輸入內容，
// 插入 innerHTML 前一律跳脫，防範「員工 → 病人」跨信任邊界 XSS
function esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showAuthMsg(keyOrText, kind = 'error') {
    const el = $('authMsg');
    const text = I18N[lang][keyOrText] || keyOrText;
    el.textContent = text;
    el.className = 'msg ' + kind;
}

function clearAuthMsg() {
    const el = $('authMsg');
    el.textContent = '';
    el.className = 'msg';
}

function money(n) {
    return 'HK$' + Number(n || 0).toFixed(2);
}

function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
}

function formatDate(ts) {
    const d = toDate(ts);
    if (!d) return '';
    try {
        return d.toLocaleDateString(lang === 'en' ? 'en-HK' : 'zh-HK', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    } catch (_e) {
        return d.toLocaleDateString();
    }
}

function formatDateTime(ts) {
    const d = toDate(ts);
    if (!d) return '';
    try {
        return d.toLocaleString(lang === 'en' ? 'en-HK' : 'zh-HK', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (_e) {
        return d.toLocaleString();
    }
}

/* ---------------- Turnstile 人機驗證 ---------------- */

let widgetId = null;
let turnstileToken = '';
let captchaErrors = 0;
let turnstileSiteKey = '';

function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        // 官方規定：使用 turnstile.ready() 時不可加 async/defer；
        // 這裡以 onload 判斷載入完成，故不需要 ready()。
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('TURNSTILE_SCRIPT_FAILED'));
        document.head.appendChild(s);
    });
}

function setLookupEnabled() {
    $('lookupBtn').disabled = !turnstileToken;
}

function showTurnstileNote(key) {
    const note = $('turnstileNote');
    note.textContent = t(key);
    note.classList.remove('hidden');
}

function resetTurnstile() {
    turnstileToken = '';
    setLookupEnabled();
    if (widgetId !== null && window.turnstile) {
        try {
            window.turnstile.reset(widgetId);
        } catch (_e) {}
    }
}

async function initTurnstile() {
    try {
        const [cfg] = await Promise.all([
            fetch('/api/member/config').then((r) => r.json()),
            loadTurnstileScript()
        ]);
        const siteKey = cfg && cfg.siteKey ? String(cfg.siteKey) : '';
        if (!siteKey) {
            showTurnstileNote('captchaNotSet');
            return;
        }
        turnstileSiteKey = siteKey;
        captchaErrors = 0;
        widgetId = window.turnstile.render('#turnstileWidget', {
            sitekey: siteKey,
            language: lang === 'en' ? 'en' : 'zh-HK',
            callback: (tok) => {
                captchaErrors = 0;
                turnstileToken = String(tok || '');
                setLookupEnabled();
            },
            'expired-callback': () => resetTurnstile(),
            'timeout-callback': () => resetTurnstile(),
            'error-callback': () => {
                // 官方建議：前 2 次回 false 交由 Turnstile 自動重試；
                // 持續失敗才顯示持久訊息並回 true（不再 console 報錯）。
                captchaErrors++;
                if (captchaErrors <= 2) return false;
                showTurnstileNote('captchaFailed');
                return true;
            }
        });
    } catch (err) {
        console.error('turnstile init failed:', err);
        showTurnstileNote('captchaNotSet');
    }
}

/* ---------------- 查詢 ---------------- */

let patientEntries = [];
let activePatientIndex = 0;
let activeClinicIndex = 0;
let txPage = 1;
let lastPhone = '';
const TX_PAGE_SIZE = 10;

function activeEntry() {
    return patientEntries[activePatientIndex] || null;
}

function activeClinic() {
    const e = activeEntry();
    const cs = e && Array.isArray(e.clinics) ? e.clinics : [];
    return cs[activeClinicIndex] || cs[0] || null;
}

function clinicDisplayName(c) {
    if (!c) return '';
    if (!c.clinicId) return t('unassigned');
    const n = c.clinicName
        && (c.clinicName[lang] || c.clinicName.zh || c.clinicName.en);
    return n || c.clinicId;
}

async function lookup() {
    clearAuthMsg();
    if (!turnstileToken) {
        showAuthMsg('errCaptcha');
        return;
    }
    const rawPhone = String($('phoneInput').value || '').trim();
    lastPhone = rawPhone;
    const digits = rawPhone.replace(/\D/g, '');
    // 不限制位數，只要輸入了電話號碼即可，比對由後端依登記電話處理
    if (digits.length < 4) {
        showAuthMsg('errPhone');
        return;
    }

    const btn = $('lookupBtn');
    btn.disabled = true;
    btn.textContent = t('looking');
    try {
        const res = await fetch('/api/member/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: rawPhone, turnstileToken: turnstileToken })
        });
        let data;
        try {
            data = await res.json();
        } catch (_e) {
            data = null;
        }
        if (!res.ok) {
            // 後端會員把關：非會員統一顯示本地化提示
            if (data && data.error === 'NOT_MEMBER') {
                showAuthMsg('errNotMember', 'info');
                return;
            }
            showAuthMsg((data && data.message) || 'errLoad');
            return;
        }
        // 雙重保險：即使回應格式有變，也只放行已確認的會員
        const rawEntries = (data && Array.isArray(data.patients)) ? data.patients : [];
        patientEntries = rawEntries.filter((p) => p.isMember !== false);
        activePatientIndex = 0;
        if (!rawEntries.length) {
            showAuthMsg('errNoPatient', 'info');
            return;
        }
        if (!patientEntries.length) {
            showAuthMsg('errNotMember', 'info');
            return;
        }
        renderAll();
        $('authView').classList.add('hidden');
        $('dataView').classList.remove('hidden');
    } catch (err) {
        console.error('lookup error:', err);
        showAuthMsg('errLoad');
    } finally {
        btn.textContent = t('lookup');
        // Turnstile token 單次有效，每次嘗試後重置並等下一個 token
        resetTurnstile();
    }
}

$('lookupBtn').addEventListener('click', lookup);
$('phoneInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookup();
});

$('clinicSelect').addEventListener('change', (e) => {
    activeClinicIndex = Number(e.target.value) || 0;
    txPage = 1;
    renderBalance();
    renderMyAppointments();
    renderPackages();
    renderTransactions();
    // 預約為診所級：切換診所時關閉彈窗並重新預備醫師與規則
    closeBookingModal();
    prepareBooking();
});

$('backBtn').addEventListener('click', () => {
    closeBookingModal();
    $('dataView').classList.add('hidden');
    $('authView').classList.remove('hidden');
    resetTurnstile();
});

/* ---------------- 渲染 ---------------- */

function renderPatientTabs() {
    const tabsEl = $('patientTabs');
    if (patientEntries.length <= 1) {
        tabsEl.innerHTML = '';
        return;
    }
    tabsEl.innerHTML = patientEntries.map((entry, i) => {
        const active = i === activePatientIndex ? ' active' : '';
        const label = `${t('patientLabel')}: ${esc(entry.name || entry.patientId)}`;
        return `<button class="tab${active}" data-patient-idx="${i}" type="button">${label}</button>`;
    }).join('');
    tabsEl.querySelectorAll('[data-patient-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
            activePatientIndex = Number(btn.getAttribute('data-patient-idx')) || 0;
            renderAll();
        });
    });
}

function renderClinicSelector() {
    const card = $('clinicSelectCard');
    const sel = $('clinicSelect');
    const e = activeEntry();
    const cs = e && Array.isArray(e.clinics) ? e.clinics : [];
    if (cs.length <= 1) {
        card.classList.add('hidden');
        return;
    }
    card.classList.remove('hidden');
    if (activeClinicIndex >= cs.length) activeClinicIndex = 0;
    sel.innerHTML = cs.map((c, i) =>
        `<option value="${i}">${esc(clinicDisplayName(c))}</option>`).join('');
    sel.value = String(activeClinicIndex);
}

function renderBalance() {
    const c = activeClinic();
    const balance = c ? Number(c.balance) : 0;
    const bonus = c ? Number(c.bonusBalance) : 0;
    $('heroTotal').textContent = money(balance + bonus);
    $('heroBalance').textContent = money(balance);
    $('heroBonus').textContent = money(bonus);
}

function renderPackages() {
    const ul = $('packageList');
    const c = activeClinic();
    const packages = c && c.packages ? c.packages : [];
    if (!packages.length) {
        ul.innerHTML = `<li class="empty">${t('noPackages')}</li>`;
        return;
    }
    ul.innerHTML = packages.map((p) => {
        const name = p.name || '';
        const remaining = Number(p.remainingUses);
        const total = Number(p.totalUses);
        const expiry = p.expiresAt ? formatDate(p.expiresAt) : t('noExpiry');
        return `
            <li>
                <div class="row">
                    <span class="name">${esc(name)}</span>
                    <span class="pill">${remaining}/${total} ${t('uses')}</span>
                </div>
                <div class="meta">${expiry}</div>
            </li>`;
    }).join('');
}

function txTypeLabel(type) {
    const map = {
        topup: 'txTopup',
        topupBonus: 'txTopup',
        payment: 'txPayment',
        refund: 'txRefund',
        adjust: 'txAdjust',
        statusChange: 'txStatus'
    };
    return t(map[type] || 'txAdjust');
}

function renderTransactions() {
    const ul = $('txList');
    const pager = $('txPager');
    const c = activeClinic();
    const txs = c && c.transactions ? c.transactions : [];
    if (!txs.length) {
        ul.innerHTML = `<li class="empty">${t('noTransactions')}</li>`;
        if (pager) pager.classList.add('hidden');
        return;
    }

    const totalPages = Math.ceil(txs.length / TX_PAGE_SIZE);
    if (txPage > totalPages) txPage = totalPages;
    if (txPage < 1) txPage = 1;
    const start = (txPage - 1) * TX_PAGE_SIZE;
    const pageTxs = txs.slice(start, start + TX_PAGE_SIZE);

    ul.innerHTML = pageTxs.map((tx) => {
        const amount = Number(tx.amount) || 0;
        const isNeg = amount < 0;
        const cls = isNeg ? 'amt-neg' : 'amt-pos';
        const sign = isNeg ? '-' : '+';
        const at = formatDateTime(tx.at);
        const note = tx.note ? esc(String(tx.note)) : '';
        const meta = [at, note].filter(Boolean).join(' · ');
        // 狀態變更不涉金額，顯示「—」而非 +HK$0.00
        const amountHtml = (tx.type === 'statusChange' || amount === 0)
            ? '<span class="amt-zero">—</span>'
            : `<span class="${cls}">${sign}${money(Math.abs(amount))}</span>`;
        return `
            <li>
                <div class="row">
                    <span class="name">${txTypeLabel(tx.type)}</span>
                    ${amountHtml}
                </div>
                <div class="meta">${meta}</div>
            </li>`;
    }).join('');

    if (pager) {
        if (totalPages > 1) {
            const pageInfo = lang === 'en'
                ? `Page ${txPage} / ${totalPages}`
                : `第 ${txPage} / ${totalPages} 頁`;
            pager.innerHTML = `
                <div class="pager-btns">
                    <button type="button" id="txPrevBtn" ${txPage <= 1 ? 'disabled' : ''}>${t('prevPage')}</button>
                    <button type="button" id="txNextBtn" ${txPage >= totalPages ? 'disabled' : ''}>${t('nextPage')}</button>
                </div>
                <span class="page-info">${pageInfo}`;
            $('txPrevBtn').addEventListener('click', () => goToTxPage(txPage - 1));
            $('txNextBtn').addEventListener('click', () => goToTxPage(txPage + 1));
            pager.classList.remove('hidden');
        } else {
            pager.classList.add('hidden');
        }
    }
}

function goToTxPage(p) {
    const c = activeClinic();
    const txs = c && c.transactions ? c.transactions : [];
    const totalPages = Math.ceil(txs.length / TX_PAGE_SIZE);
    const next = Math.max(1, Math.min(totalPages, Number(p)));
    if (next === txPage) return;
    txPage = next;
    renderTransactions();
}

function renderAll() {
    txPage = 1;
    activeClinicIndex = 0;
    renderPatientTabs();
    renderClinicSelector();
    renderBalance();
    renderPackages();
    renderTransactions();
    prepareBooking();
}

/* ============================================================
 * 線上預約掛號（會員端）
 * ------------------------------------------------------------
 * 流程：載入 options（規則＋醫師）→ 醫師/日期 → slots → 點選時段
 * → 完成 Turnstile → POST book；「我的預約」可 POST cancel。
 * 所有資料均來自後端，頁面不直接連 Firebase。
 * ============================================================ */

const optionsCache = new Map(); // clinicId → options 回應
let bookingClinicId = '';
let bookingRules = null;
let bookingDoctors = [];
let bookingState = { doctor: '', date: '', slotsData: null, selected: null };
let bookingWidgetId = null;
let bookingToken = '';
let bookingBusy = false;

const HKT_FIXED_OFFSET_MS = 8 * 60 * 60 * 1000;

function currentBookingClinic() {
    const c = activeClinic();
    return c && c.clinicId ? String(c.clinicId) : '';
}

function clientHktTodayStr() {
    return new Date(Date.now() + HKT_FIXED_OFFSET_MS).toISOString().slice(0, 10);
}

function clientAddDays(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00+08:00`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function showBookingMsg(keyOrText, kind = 'error') {
    const el = $('bookingMsg');
    el.textContent = I18N[lang][keyOrText] || keyOrText;
    el.className = 'msg ' + kind;
}

function clearBookingMsg() {
    const el = $('bookingMsg');
    el.textContent = '';
    el.className = 'msg';
}

async function loadOptions(cid) {
    if (optionsCache.has(cid)) return optionsCache.get(cid);
    const res = await fetch(
        `/api/member/appointments/options?clinicId=${encodeURIComponent(cid)}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
        throw new Error((data && data.message) || 'options failed');
    }
    optionsCache.set(cid, data);
    return data;
}

function setBookingDisabledForm(msgKey) {
    const m = $('bookingDisabledMsg');
    m.textContent = t(msgKey);
    m.classList.remove('hidden');
    $('bookingForm').classList.add('hidden');
}

function setBookingActiveForm() {
    $('bookingDisabledMsg').classList.add('hidden');
    $('bookingForm').classList.remove('hidden');
}

function renderRulesNote() {
    const r = bookingRules;
    if (!r) { $('rulesNote').textContent = ''; return; }
    $('rulesNote').textContent = t('rulesNoteTpl')
        .replace('{a}', r.minLeadMinutes)
        .replace('{b}', r.cancelLeadMinutes)
        .replace('{c}', r.maxActivePerPatient)
        .replace('{d}', r.maxPerDayPerPatient);
}

function renderDoctors() {
    const sel = $('bookingDoctor');
    sel.innerHTML = `<option value="">${t('selectDoctorPrompt')}</option>`
        + bookingDoctors.map((d) => {
            const label = d.registrationNumber
                ? `${d.name} (${d.registrationNumber})`
                : d.name;
            return `<option value="${esc(d.username)}">${esc(label)}</option>`;
        }).join('');
}

function renderBookingDates() {
    const sel = $('bookingDate');
    if (!bookingRules || !bookingState.doctor) {
        sel.disabled = true;
        sel.innerHTML = `<option value="">${t('selectDatePrompt')}</option>`;
        return;
    }
    sel.disabled = false;
    const start = clientHktTodayStr();
    // 今日已過最遲營業時間（收訖）→ 不顯示今天。
    const hmToMin = (hm) => {
        const m = /^(\d{2}):(\d{2})$/.exec(hm || '');
        return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
    };
    const nowHm = new Date(Date.now() + HKT_FIXED_OFFSET_MS).toISOString().slice(11, 16);
    const nowMin = hmToMin(nowHm);
    const sessions = Array.isArray(bookingRules.sessions) ? bookingRules.sessions : [];
    const closeMin = sessions.reduce(
        (mx, s2) => Math.max(mx, hmToMin(s2 && s2.end)), -1);
    let html = `<option value="">${t('datePlaceholder')}</option>`;
    for (let i = 0; i <= bookingRules.advanceDays; i++) {
        const ds = clientAddDays(start, i);
        const wd = new Date(`${ds}T12:00:00+08:00`).getUTCDay();
        if (bookingRules.closedWeekdays.includes(wd)) continue;
        if (i === 0 && closeMin >= 0 && nowMin >= closeMin) continue;
        let label = `${ds.slice(5)} ${t('weekdaysShort')[wd]}`;
        if (i === 0) label += ` · ${t('today')}`;
        if (i === 1) label += ` · ${t('tomorrow')}`;
        html += `<option value="${ds}">${label}</option>`;
    }
    sel.innerHTML = html;
    if (bookingState.date
        && sel.querySelector(`option[value="${bookingState.date}"]`)) {
        sel.value = bookingState.date;
    } else {
        // 不預設日期：維持「請選擇日期」，待病人自行選擇
        bookingState.date = '';
        sel.value = '';
    }
}

async function refreshSlots() {
    const { doctor, date } = bookingState;
    if (!doctor || !date) return;
    $('slotField').classList.remove('hidden');
    const grid = $('slotGrid');
    grid.innerHTML =
        `<span class="empty" style="grid-column:1/-1">${t('slotLoading')}</span>`;
    $('slotDayHint').classList.add('hidden');
    let data;
    try {
        const res = await fetch(
            `/api/member/appointments/slots?clinicId=${encodeURIComponent(bookingClinicId)}`
            + `&date=${encodeURIComponent(date)}`
            + `&doctor=${encodeURIComponent(doctor)}`);
        data = await res.json().catch(() => null);
        if (!res.ok || !data) {
            throw new Error((data && data.message) || 'slots failed');
        }
    } catch (e) {
        grid.innerHTML =
            `<span class="empty" style="grid-column:1/-1">${esc(e.message || t('errBookingFailed'))}</span>`;
        bookingState.slotsData = null;
        bookingState.selected = null;
        setBookingEnabled();
        return;
    }
    bookingState.slotsData = data;
    renderSlotGrid();
}

function renderSlotGrid() {
    const data = bookingState.slotsData;
    const grid = $('slotGrid');
    const hint = $('slotDayHint');
    if (!data) {
        grid.innerHTML = '';
        hint.classList.add('hidden');
        setBookingEnabled();
        return;
    }
    if (data.closed) {
        grid.innerHTML = '';
        hint.textContent = data.reason === 'clinic_closed'
            ? t('dayClosed') : t('doctorOff');
        hint.classList.remove('hidden');
        bookingState.selected = null;
        $('complaintField').classList.add('hidden');
        setBookingEnabled();
        return;
    }
    hint.classList.add('hidden');
    const slots = data.slots || [];
    if (!slots.length) {
        grid.innerHTML =
            `<span class="empty" style="grid-column:1/-1">${t('doctorOff')}</span>`;
        bookingState.selected = null;
        $('complaintField').classList.add('hidden');
        setBookingEnabled();
        return;
    }
    grid.innerHTML = slots.map((s) => {
        if (s.status === 'full') {
            return `<button class="slot full" type="button" disabled>`
                + `${s.label}<span class="slot-sub">${t('slotFull')}</span></button>`;
        }
        if (s.status === 'closed') {
            return `<button class="slot closed" type="button" disabled>`
                + `${s.label}<span class="slot-sub">${t('slotClosed')}</span></button>`;
        }
        const sel = bookingState.selected
            && bookingState.selected.at === s.at ? ' selected' : '';
        return `<button class="slot${sel}" data-at="${esc(s.at)}" type="button">${s.label}</button>`;
    }).join('');
    grid.querySelectorAll('button.slot:not(.full):not(.closed)').forEach((btn) => {
        btn.addEventListener('click', () => {
            const s = slots.find((x) => x.at === btn.getAttribute('data-at'));
            bookingState.selected = s || null;
            renderSlotGrid();
            $('complaintField').classList.remove('hidden');
            setBookingEnabled();
        });
    });
    if (bookingState.selected) $('complaintField').classList.remove('hidden');
    setBookingEnabled();
}

function setBookingEnabled() {
    $('confirmBookingBtn').disabled = !(bookingState.doctor
        && bookingState.date && bookingState.selected
        && bookingToken && !bookingBusy);
}

async function submitBooking() {
    if (!bookingState.selected) { showBookingMsg('errNeedSlot'); return; }
    if (!bookingToken) { showBookingMsg('errCaptcha'); return; }
    const entry = activeEntry();
    bookingBusy = true;
    const btn = $('confirmBookingBtn');
    btn.disabled = true;
    btn.textContent = t('booking');
    try {
        const res = await fetch('/api/member/appointments/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: lastPhone,
                turnstileToken: bookingToken,
                patientId: entry.patientId,
                clinicId: bookingClinicId,
                doctor: bookingState.doctor,
                slot: bookingState.selected.at,
                chiefComplaint: $('bookingComplaint').value
            })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            showBookingMsg((data && data.message) || 'errBookingFailed');
            const errCode = data && data.error ? String(data.error) : '';
            if (res.status === 409
                || /SLOT|FULL|DUPLICATE|TOO_MANY|ACTIVE/.test(errCode)) {
                refreshSlots();
            }
            return;
        }
        entry.upcomingAppointments = Array.isArray(entry.upcomingAppointments)
            ? entry.upcomingAppointments : [];
        entry.upcomingAppointments.push({
            id: data.appointment.id,
            appointmentTime: data.appointment.appointmentTime,
            appointmentDoctor: data.appointment.doctor,
            doctorName: data.appointment.doctorName,
            status: 'registered',
            clinicId: bookingClinicId,
            source: 'member_online'
        });
        entry.upcomingAppointments.sort((a, b) =>
            String(a.appointmentTime).localeCompare(String(b.appointmentTime)));
        $('bookingComplaint').value = '';
        showBookingMsg('bookingSuccess', 'info');
        bookingState.selected = null;
        bookingState.slotsData = null;
        renderSlotGrid();
        renderMyAppointments();
        $('complaintField').classList.add('hidden');
    } catch (e) {
        console.error('booking submit error:', e);
        showBookingMsg('errBookingFailed');
    } finally {
        bookingBusy = false;
        btn.textContent = t('confirmBooking');
        resetBookingWidget();
        setBookingEnabled();
    }
}

function aptStatusText(s) {
    const map = {
        registered: 'statusRegistered',
        waiting: 'statusWaiting',
        consulting: 'statusConsulting'
    };
    return t(map[s] || 'statusRegistered');
}

function renderMyAppointments() {
    const ul = $('myApptList');
    const entry = activeEntry();
    // 只顯示「當前選中診所」的預約；舊制無 clinicId 的預約置於第一間診所
    const cid = activeClinic() ? activeClinic().clinicId : '';
    const isFirst = activeClinicIndex === 0;
    const list = entry && Array.isArray(entry.upcomingAppointments)
        ? entry.upcomingAppointments.filter((a) => {
            const ac = a.clinicId || '';
            return ac === cid || (!ac && isFirst);
        })
        : [];
    if (!list.length) {
        ul.innerHTML = `<li class="empty">${t('noMyAppointments')}</li>`;
        return;
    }
    const cancelLead = bookingRules ? bookingRules.cancelLeadMinutes : 120;
    const nowMs = Date.now();
    ul.innerHTML = list.map((a) => {
        const canCancel = a.status === 'registered'
            && Date.parse(a.appointmentTime) - nowMs >= cancelLead * 60000;
        const drName = a.doctorName || a.appointmentDoctor || '';
        return `
            <li>
                <div class="row">
                    <span class="name">${formatDateTime(a.appointmentTime)}</span>
                    <span class="pill ${esc(a.status)}">${esc(aptStatusText(a.status))}</span>
                </div>
                <div class="row" style="margin-top:6px">
                    <span class="meta">${esc(drName)}</span>
                    <button class="cancel-btn" data-id="${esc(a.id)}"
                            type="button" ${canCancel ? '' : 'disabled'}>
                        ${t('cancelAppointment')}
                    </button>
                </div>
            </li>`;
    }).join('');
    ul.querySelectorAll('.cancel-btn').forEach((b) => {
        b.addEventListener('click', async () => {
            if (b.disabled) return;
            const id = b.getAttribute('data-id');
            // 取消操作獨立以小彈窗完成人機驗證（無需打開預約表單）
            const humanToken = await promptTurnstile();
            if (!humanToken) return;
            b.disabled = true;
            try {
                const res = await fetch('/api/member/appointments/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: lastPhone,
                        turnstileToken: humanToken,
                        appointmentId: id
                    })
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    showMyApptMsg((data && data.message) || 'errCancelFailed');
                    b.disabled = false;
                    return;
                }
                entry.upcomingAppointments = entry.upcomingAppointments
                    .filter((x) => x.id !== id);
                renderMyAppointments();
                if (bookingState.slotsData) refreshSlots();
                showMyApptMsg('cancelSuccess', 'info');
            } catch (e) {
                console.error('cancel error:', e);
                showMyApptMsg('errCancelFailed');
                b.disabled = false;
            }
        });
    });
}

/* ---------------- 預約卡 Turnstile ---------------- */

function initBookingWidget() {
    if (bookingWidgetId !== null && window.turnstile) {
        try { window.turnstile.remove(bookingWidgetId); } catch (_e) {}
    }
    bookingWidgetId = null;
    bookingToken = '';
    if (!turnstileSiteKey || !window.turnstile) { setBookingEnabled(); return; }
    bookingWidgetId = window.turnstile.render('#bookingTurnstile', {
        sitekey: turnstileSiteKey,
        language: lang === 'en' ? 'en' : 'zh-HK',
        callback: (tok) => {
            bookingToken = String(tok || '');
            setBookingEnabled();
        },
        'expired-callback': () => resetBookingWidget(),
        'timeout-callback': () => resetBookingWidget(),
        'error-callback': () => true
    });
    setBookingEnabled();
}

function resetBookingWidget() {
    bookingToken = '';
    if (bookingWidgetId !== null && window.turnstile) {
        try { window.turnstile.reset(bookingWidgetId); } catch (_e) {}
    }
    setBookingEnabled();
}

function removeBookingWidget() {
    bookingToken = '';
    if (bookingWidgetId !== null && window.turnstile) {
        try { window.turnstile.remove(bookingWidgetId); } catch (_e) {}
    }
    bookingWidgetId = null;
}

/* ---------------- 「我的預約」卡訊息 ---------------- */

function showMyApptMsg(keyOrText, kind = 'error') {
    const el = $('myApptMsg');
    el.textContent = I18N[lang][keyOrText] || keyOrText;
    el.className = 'msg ' + kind;
}

/* ---------------- 背景預備（查詢成功/切換診所後） ---------------- */

let bookingPrepPromise = null;
let bookingReady = false;       // options 已成功載入
let bookingAvailable = false;   // 診所目前有開放線上預約
let bookingPrepError = '';      // 預備失敗之訊息 key

function resetBookingFormState() {
    bookingState = { doctor: '', date: '', slotsData: null, selected: null };
    $('slotField').classList.add('hidden');
    $('complaintField').classList.add('hidden');
    $('bookingComplaint').value = '';
}

async function doPrepareBooking() {
    renderMyAppointments();
    bookingReady = false;
    bookingAvailable = false;
    bookingPrepError = '';

    const cid = currentBookingClinic();
    bookingClinicId = cid;
    if (!cid) {
        bookingPrepError = 'errNoClinic';
        return;
    }
    let opt;
    try {
        opt = await loadOptions(cid);
    } catch (e) {
        console.error('load booking options failed:', e);
        bookingPrepError = 'errBookingFailed';
        return;
    }
    bookingRules = opt.rules;
    bookingDoctors = Array.isArray(opt.doctors) ? opt.doctors : [];
    bookingAvailable = !!opt.enabled;
    bookingReady = true;
}

function prepareBooking() {
    bookingPrepPromise = doPrepareBooking();
    return bookingPrepPromise;
}

/* ---------------- 預約彈窗開關 ---------------- */

async function openBookingModal() {
    // 等待背景預備完成（避免與診所切換時的預備競態）
    await (bookingPrepPromise || prepareBooking());

    clearBookingMsg();
    resetBookingFormState();
    $('bookingModal').classList.remove('hidden');

    if (bookingPrepError) {
        setBookingDisabledForm(bookingPrepError);
        return;
    }
    if (!bookingAvailable) {
        setBookingDisabledForm('bookingDisabled');
        return;
    }
    setBookingActiveForm();
    renderDoctors();
    renderBookingDates();
    renderRulesNote();
    // 彈窗可見後才渲染 Turnstile，避免 hidden 容器影響 widget 初始化
    initBookingWidget();
}

function closeBookingModal() {
    const modal = $('bookingModal');
    if (!modal) return;
    modal.classList.add('hidden');
    removeBookingWidget();
    clearBookingMsg();
    resetBookingFormState();
}

$('openBookingBtn').addEventListener('click', openBookingModal);
$('closeBookingBtn').addEventListener('click', closeBookingModal);

// 點擊遮罩（彈窗外圍）關閉；點擊彈窗本體不關
$('bookingModal').addEventListener('click', (e) => {
    if (e.target === $('bookingModal')) closeBookingModal();
});

/* ---------------- 取消驗證小彈窗（動態建立，單一實例重用） ---------------- */

let humanVerifyEl = null;
let humanVerifyWidgetId = null;
let humanVerifyResolver = null;

function ensureHumanVerifyEl() {
    if (humanVerifyEl) return humanVerifyEl;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" style="max-width:380px">
            <div class="modal-head">
                <h2 id="humanVerifyTitleText"></h2>
                <button class="modal-close" type="button">✕</button>
            </div>
            <p class="modal-sub" id="humanVerifyPromptText"></p>
            <div id="humanVerifyTurnstile"></div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeHumanVerify(null);
    });
    overlay.querySelector('.modal-close').addEventListener('click',
        () => closeHumanVerify(null));
    humanVerifyEl = overlay;
    return overlay;
}

function closeHumanVerify(token) {
    if (humanVerifyWidgetId !== null && window.turnstile) {
        try { window.turnstile.remove(humanVerifyWidgetId); } catch (_e) {}
    }
    humanVerifyWidgetId = null;
    if (humanVerifyEl) humanVerifyEl.classList.add('hidden');
    const resolve = humanVerifyResolver;
    humanVerifyResolver = null;
    if (resolve) resolve(token);
}

/**
 * 彈出人機驗證小彈窗。
 * @returns {Promise<string|null>} 成功回傳 token；放棄/關閉/未設定回 null
 */
function promptTurnstile() {
    return new Promise((resolve) => {
        const overlay = ensureHumanVerifyEl();
        overlay.querySelector('#humanVerifyTitleText').textContent =
            t('humanVerifyTitle');
        overlay.querySelector('#humanVerifyPromptText').textContent =
            t('humanVerifyPrompt');
        humanVerifyResolver = resolve;
        humanVerifyWidgetId = null;
        overlay.classList.remove('hidden');

        if (!turnstileSiteKey || !window.turnstile) {
            // 驗證未完成設定：無法核對，直接結束
            closeHumanVerify(null);
            return;
        }
        humanVerifyWidgetId = window.turnstile.render(
            overlay.querySelector('#humanVerifyTurnstile'), {
                sitekey: turnstileSiteKey,
                language: lang === 'en' ? 'en' : 'zh-HK',
                callback: (tok) => closeHumanVerify(String(tok || '')),
                'timeout-callback': () => closeHumanVerify(null),
                'error-callback': () => true
            });
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (humanVerifyEl && !humanVerifyEl.classList.contains('hidden')) {
        closeHumanVerify(null);
    }
    if (!$('bookingModal').classList.contains('hidden')) {
        closeBookingModal();
    }
});

$('bookingDoctor').addEventListener('change', (e) => {
    bookingState.doctor = e.target.value;
    bookingState.date = '';
    bookingState.slotsData = null;
    bookingState.selected = null;
    $('slotField').classList.add('hidden');
    $('complaintField').classList.add('hidden');
    renderBookingDates();
    renderSlotGrid();
    setBookingEnabled();
});

$('bookingDate').addEventListener('change', (e) => {
    bookingState.date = e.target.value;
    bookingState.slotsData = null;
    bookingState.selected = null;
    $('complaintField').classList.add('hidden');
    refreshSlots();
    setBookingEnabled();
});

$('confirmBookingBtn').addEventListener('click', submitBooking);

applyStaticI18n();
initTurnstile();
