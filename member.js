/* ============================================================
 * member.js — 病人會員查詢（獨立頁，不依賴 firebase_init.js）
 * ------------------------------------------------------------
 * Firebase Phone Auth 登入後，唯讀查詢同電話病人的：
 * 錢包餘額、有效套票、最近 20 筆交易。不顯示任何病歷。
 * ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    getFirestore,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    getDoc,
    doc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyCx_BLIWVKZs0vJa5TwL6zoycJexY_5nXU',
    authDomain: 'system-1e90a.firebaseapp.com',
    projectId: 'system-1e90a',
    storageBucket: 'system-1e90a.firebasestorage.app',
    messagingSenderId: '80947900109',
    appId: '1:80947900109:web:b6cd62bb2f1e07971a4384'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'zh-HK';
const db = getFirestore(app);

/* ---------------- i18n ---------------- */

const I18N = {
    zh: {
        clinicName: '名醫中醫診所',
        authTitle: '會員查詢',
        authSub: '請以登記之手機號碼登入，查看儲值餘額、套票及交易記錄。',
        phoneLabel: '手機號碼',
        phoneHint: '未登記之手機號碼將無法查閱任何資料。',
        codeLabel: '驗證碼',
        sendCode: '發送驗證碼',
        verifyCode: '驗證並登入',
        totalBalance: '儲值總餘額 (HKD)',
        principal: '本金餘額',
        bonus: '贈送餘額',
        packages: '有效套票',
        transactions: '最近交易',
        signOut: '登出',
        noPackages: '目前沒有有效套票',
        noTransactions: '暫無交易記錄',
        noAccount: '未找到儲值帳戶',
        loading: '載入中…',
        uses: '餘次',
        noExpiry: '無有效期',
        txTopup: '儲值充值',
        txPayment: '診症扣款',
        txRefund: '退款',
        txAdjust: '人工調整',
        txStatus: '狀態變更',
        errPhone: '請輸入有效香港手機號碼（8 位數）',
        errCode: '請輸入 6 位驗證碼',
        errSms: '驗證碼無法發送，請稍後重試',
        errVerify: '驗證失敗，請檢查驗證碼是否正確',
        errNoPatient: '系統中沒有以此手機登記的病人記錄。',
        errLoad: '資料載入失敗，請重新整理後再試',
        patientLabel: '病人',
        langToggle: 'English'
    },
    en: {
        clinicName: 'MING YI Chinese Medicine Clinic',
        authTitle: 'Member Portal',
        authSub: 'Sign in with your registered mobile number to view your stored-value balance, packages and transactions.',
        phoneLabel: 'Mobile number',
        phoneHint: 'Numbers not registered with the clinic cannot view any data.',
        codeLabel: 'Verification code',
        sendCode: 'Send code',
        verifyCode: 'Verify & sign in',
        totalBalance: 'Total balance (HKD)',
        principal: 'Principal',
        bonus: 'Bonus',
        packages: 'Active packages',
        transactions: 'Recent transactions',
        signOut: 'Sign out',
        noPackages: 'No active packages',
        noTransactions: 'No transactions yet',
        noAccount: 'No stored-value account found',
        loading: 'Loading…',
        uses: 'uses left',
        noExpiry: 'No expiry',
        txTopup: 'Top-up',
        txPayment: 'Consultation payment',
        txRefund: 'Refund',
        txAdjust: 'Manual adjustment',
        txStatus: 'Status change',
        errPhone: 'Please enter a valid Hong Kong mobile number (8 digits)',
        errCode: 'Please enter the 6-digit code',
        errSms: 'Could not send the code, please try again later',
        errVerify: 'Verification failed, please check the code',
        errNoPatient: 'No patient record is registered with this mobile number.',
        errLoad: 'Failed to load data, please refresh and try again',
        patientLabel: 'Patient',
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
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-HK';
    const toggle = document.getElementById('langToggle');
    if (toggle) toggle.textContent = t('langToggle');
}

document.getElementById('langToggle').addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('memberLang', lang); } catch (_e) {}
    applyStaticI18n();
});

/* ---------------- UI helpers ---------------- */

const $ = (id) => document.getElementById(id);

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
    if (typeof ts.toDate === 'function') {
        try { return ts.toDate(); } catch (_e) {}
    }
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    return null;
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

/* ---------------- Phone auth ---------------- */

let recaptchaVerifier = null;
let confirmationResult = null;

function getRecaptcha() {
    if (!recaptchaVerifier) {
        recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha', {
            size: 'normal'
        });
        recaptchaVerifier.render().catch(() => {});
    }
    return recaptchaVerifier;
}

// 將用戶輸入統一轉成 E.164：+852 + 8 位數
function normalizeHkPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    let local8 = '';
    if (digits.length === 8) {
        local8 = digits;
    } else if (digits.length === 11 && digits.indexOf('852') === 0) {
        local8 = digits.slice(3);
    } else if (digits.length === 12 && digits.indexOf('8520') === 0) {
        // 用戶誤多加一個 0
        local8 = digits.slice(4);
    }
    if (!/^[5-9]\d{7}$/.test(local8)) return '';
    return '+852' + local8;
}

$('sendCodeBtn').addEventListener('click', async () => {
    clearAuthMsg();
    const e164 = normalizeHkPhone($('phoneInput').value);
    if (!e164) {
        showAuthMsg('errPhone');
        return;
    }
    const btn = $('sendCodeBtn');
    btn.disabled = true;
    try {
        confirmationResult = await signInWithPhoneNumber(auth, e164, getRecaptcha());
        $('phoneStep').classList.add('hidden');
        $('codeStep').classList.remove('hidden');
        $('sendCodeBtn').classList.add('hidden');
        $('verifyBtn').classList.remove('hidden');
        $('codeInput').focus();
    } catch (err) {
        console.error('signInWithPhoneNumber error:', err);
        showAuthMsg('errSms');
        // reCAPTCHA 可能已消耗，重置以便重試
        if (recaptchaVerifier) {
            try { await recaptchaVerifier.clear(); } catch (_e) {}
            recaptchaVerifier = null;
        }
    } finally {
        btn.disabled = false;
    }
});

$('verifyBtn').addEventListener('click', async () => {
    clearAuthMsg();
    const code = String($('codeInput').value || '').replace(/\D/g, '');
    if (code.length !== 6) {
        showAuthMsg('errCode');
        return;
    }
    const btn = $ ('verifyBtn');
    btn.disabled = true;
    try {
        await confirmationResult.confirm(code);
        // onAuthStateChanged 會接手轉換到資料頁
    } catch (err) {
        console.error('confirm code error:', err);
        showAuthMsg('errVerify');
        btn.disabled = false;
    }
});

/* ---------------- 資料載入 ---------------- */

// 病人文件電話可能存成 91234567 / 85291234567 / +85291234567
function phoneVariants(e164) {
    const with852 = e164.slice(1);     // 85291234567
    const local8 = with852.slice(3);      // 91234567
    return [local8, with852, e164, '+' + with852];
}

async function findPatientsByPhone(e164) {
    const variants = phoneVariants(e164);
    const results = await Promise.allSettled(
        variants.map((v) =>
            getDocs(query(collection(db, 'patients'), where('phone', '==', v)))
        )
    );
    const byId = new Map();
    results.forEach((r) => {
        if (r.status !== 'fulfilled') return;
        r.value.forEach((snap) => {
            byId.set(snap.id, { id: snap.id, ...snap.data() });
        });
    });
    return Array.from(byId.values());
}

async function loadPatientBundle(patientId) {
    const bundle = { account: null, packages: [], transactions: [] };

    // 帳戶（文件 ID = patientId）
    try {
        const accSnap = await getDoc(doc(db, 'patientWalletAccounts', patientId));
        if (accSnap.exists()) bundle.account = accSnap.data();
    } catch (err) {
        console.warn('wallet account read failed:', err);
    }

    // 有效套票
    try {
        const pkgSnap = await getDocs(
            query(collection(db, 'patientPackages'), where('patientId', '==', patientId))
        );
        pkgSnap.forEach((s) => {
            const d = s.data();
            const remaining = Number(d.remainingUses);
            const expiresAt = d.expiresAt ? toDate(d.expiresAt) : null;
            const notExpired = !expiresAt || expiresAt.getTime() >= Date.now();
            if (remaining > 0 && notExpired) {
                bundle.packages.push({ id: s.id, ...d });
            }
        });
    } catch (err) {
        console.warn('packages read failed:', err);
    }

    // 最近 20 筆交易
    try {
        const txSnap = await getDocs(
            query(
                collection(db, 'patientWalletTransactions'),
                where('patientId', '==', patientId),
                orderBy('at', 'desc'),
                limit(20)
            )
        );
        txSnap.forEach((s) => {
            bundle.transactions.push(s.data());
        });
    } catch (err) {
        console.warn('transactions read failed:', err);
    }

    return bundle;
}

/* ---------------- 渲染 ---------------- */

let patientBundles = [];   // [{patient, bundle}]
let activePatientIndex = 0;

function renderPatientTabs() {
    const tabsEl = $('patientTabs');
    if (patientBundles.length <= 1) {
        tabsEl.innerHTML = '';
        return;
    }
    tabsEl.innerHTML = patientBundles.map((entry, i) => {
        const active = i === activePatientIndex ? ' active' : '';
        const label = `${t('patientLabel')}: ${entry.patient.name || entry.patient.id}`;
        return `<button class="tab${active}" data-patient-idx="${i}" type="button">${label}</button>`;
    }).join('');
    tabsEl.querySelectorAll('[data-patient-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
            activePatientIndex = Number(btn.getAttribute('data-patient-idx')) || 0;
            renderAll();
        });
    });
}

function renderBalance() {
    const entry = patientBundles[activePatientIndex];
    const acc = entry && entry.bundle ? entry.bundle.account : null;
    const balance = acc ? Number(acc.balance) : 0;
    const bonus = acc ? Number(acc.bonusBalance) : 0;
    $('heroTotal').textContent = money(balance + bonus);
    $('heroBalance').textContent = money(balance);
    $('heroBonus').textContent = money(bonus);
}

function renderPackages() {
    const ul = $('packageList');
    const packages = patientBundles[activePatientIndex].bundle.packages;
    if (!packages.length) {
        ul.innerHTML = `<li class="empty">${t('noPackages')}</li>`;
        return;
    }
    ul.innerHTML = packages.map((p) => {
        const name = p.name || p.packageName || '';
        const remaining = Number(p.remainingUses);
        const total = Number(p.totalUses);
        const expiry = p.expiresAt
            ? formatDate(p.expiresAt)
            : t('noExpiry');
        return `
            <li>
                <div class="row">
                    <span class="name">${name}</span>
                    <span class="pill">${remaining}/${total} ${t('uses')}</span>
                </div>
                <div class="meta">${expiry}</div>
            </li>`;
    }).join('');
}

function txTypeLabel(type) {
    const map = {
        topup: 'txTopup',
        payment: 'txPayment',
        refund: 'txRefund',
        adjust: 'txAdjust',
        status: 'txStatus'
    };
    return t(map[type] || 'txAdjust');
}

function renderTransactions() {
    const ul = $('txList');
    const txs = patientBundles[activePatientIndex].bundle.transactions;
    if (!txs.length) {
        ul.innerHTML = `<li class="empty">${t('noTransactions')}</li>`;
        return;
    }
    ul.innerHTML = txs.map((tx) => {
        const amount = Number(tx.amount) || 0;
        const isNeg = amount < 0;
        const cls = isNeg ? 'amt-neg' : 'amt-pos';
        const sign = isNeg ? '-' : '+';
        const at = formatDateTime(tx.at);
        const note = tx.note ? String(tx.note) : '';
        const meta = [at, note].filter(Boolean).join(' · ');
        return `
            <li>
                <div class="row">
                    <span class="name">${txTypeLabel(tx.type)}</span>
                    <span class="${cls}">${sign}${money(Math.abs(amount))}</span>
                </div>
                <div class="meta">${meta}</div>
            </li>`;
    }).join('');
}

function renderAll() {
    renderPatientTabs();
    renderBalance();
    renderPackages();
    renderTransactions();
}

/* ---------------- 視圖切換 ---------------- */

async function showDataView(user) {
    $('authView').classList.add('hidden');
    $('dataView').classList.remove('hidden');

    const phone = user.phoneNumber;
    patientBundles = [];
    activePatientIndex = 0;
    $('heroTotal').textContent = t('loading');

    let patients;
    try {
        patients = await findPatientsByPhone(phone);
    } catch (err) {
        console.error('findPatients error:', err);
        $('heroTotal').textContent = money(0);
        $('packageList').innerHTML = `<li class="empty">${t('errLoad')}</li>`;
        $('txList').innerHTML = '';
        return;
    }

    if (!patients.length) {
        $('heroTotal').textContent = money(0);
        $('packageList').innerHTML = `<li class="empty">${t('errNoPatient')}</li>`;
        $('txList').innerHTML = '';
        return;
    }

    patientBundles = await Promise.all(
        patients.map(async (patient) => ({
            patient: patient,
            bundle: await loadPatientBundle(patient.id)
        }))
    );
    renderAll();
}

function showAuthView() {
    $('dataView').classList.add('hidden');
    $('authView').classList.remove('hidden');
    // 重置登入表單
    confirmationResult = null;
    $('phoneStep').classList.remove('hidden');
    $('codeStep').classList.add('hidden');
    $('sendCodeBtn').classList.remove('hidden');
    $('verifyBtn').classList.add('hidden');
    $('codeInput').value = '';
    clearAuthMsg();
}

$('signOutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (err) {
        console.error('sign out error:', err);
    }
});

onAuthStateChanged(auth, (user) => {
    if (user && user.phoneNumber) {
        showDataView(user);
    } else {
        showAuthView();
    }
});

applyStaticI18n();
