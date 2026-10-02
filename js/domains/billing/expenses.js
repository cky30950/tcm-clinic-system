/* ============================================================
 * billing/expenses.js — 診所支出：月份分攤成本、支出匯入表單、
 * 新增／列出／編輯／刪除（Phase 5 子批 C）。
 * 共享狀態所有權仍在 system.js，經 G 讀寫。
 * ============================================================ */
import { G } from '../../lib/legacy.js';

export function monthsInDateRange(startDateStr, endDateStr) {
    const s = new Date(startDateStr);
    const e = new Date(endDateStr);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    const end = new Date(e.getFullYear(), e.getMonth(), 1);
    const list = [];
    while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        list.push(`${y}-${m}`);
        cur.setMonth(cur.getMonth() + 1);
    }
    return list;
}

export async function getClinicExpensesByMonths(months, clinicId = null) {
    await G.waitForFirebaseDb();
    const validMonths = Array.from(new Set((Array.isArray(months) ? months : []).filter(Boolean)));
    if (validMonths.length === 0) {
        return { totalCost: 0, byType: {}, byMonth: {} };
    }
    let total = 0;
    const byType = {};
    // 按月保留總額與類別明細，供部分月份按天數分攤
    const byMonth = {};
    const addExpense = (d) => {
        const amt = Number(d.amount) || 0;
        const t = d.type || '其他費用';
        const monthKey = d.month || '';
        total += amt;
        byType[t] = (byType[t] || 0) + amt;
        if (monthKey) {
            if (!byMonth[monthKey]) byMonth[monthKey] = { total: 0, byType: {} };
            byMonth[monthKey].total += amt;
            byMonth[monthKey].byType[t] = (byMonth[monthKey].byType[t] || 0) + amt;
        }
    };
    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < validMonths.length; i += chunkSize) {
        chunks.push(validMonths.slice(i, i + chunkSize));
    }
    for (const chunk of chunks) {
        const colRef = window.firebase.collection(window.firebase.db, 'clinicExpenses');
        const parts = [window.firebase.where('month', 'in', chunk)];
        if (clinicId) {
            parts.push(window.firebase.where('clinicId', '==', clinicId));
        }
        let snapshot = null;
        try {
            snapshot = await window.firebase.getDocs(window.firebase.firestoreQuery(colRef, ...parts));
        } catch (_batchErr) {
            // 若缺少複合索引，退回逐月查詢，仍避免全集合掃描。
            if (typeof window.indexManager !== 'undefined') {
                window.indexManager.register(_batchErr, '成本查詢（month + clinicId）');
            }
            for (const monthKey of chunk) {
                const fallbackParts = [window.firebase.where('month', '==', monthKey)];
                if (clinicId) fallbackParts.push(window.firebase.where('clinicId', '==', clinicId));
                const fallbackSnap = await window.firebase.getDocs(window.firebase.firestoreQuery(colRef, ...fallbackParts));
                fallbackSnap.forEach(docSnap => addExpense(docSnap.data() || {}));
            }
            continue;
        }
        snapshot.forEach(docSnap => addExpense(docSnap.data() || {}));
    }
    return { totalCost: total, byType, byMonth };
}

// 依報表期間計算成本：整月涵蓋時採實際成本；
// 僅涵蓋部分天數的月份按「覆蓋天數／該月天數」比例分攤。
export async function getApportionedCost(startDate, endDate, clinicId = null) {
    const months = monthsInDateRange(startDate, endDate);
    const exp = await getClinicExpensesByMonths(months, clinicId);
    const byMonth = exp.byMonth || {};
    const [sy, sm, sd] = String(startDate).split('-').map(Number);
    const [ey, em, ed] = String(endDate).split('-').map(Number);
    let totalCost = 0;
    let prorated = false;
    const byType = {};
    const round2 = (n) => Math.round(n * 100) / 100;

    months.forEach(monthKey => {
        const [y, m] = monthKey.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const firstDay = (y === sy && m === sm) ? sd : 1;
        const lastDay = (y === ey && m === em) ? ed : daysInMonth;
        const overlapDays = Math.max(0, lastDay - firstDay + 1);
        if (overlapDays < daysInMonth) prorated = true;
        const ratio = overlapDays / daysInMonth;
        const entry = byMonth[monthKey] || { total: 0, byType: {} };
        totalCost += entry.total * ratio;
        Object.entries(entry.byType || {}).forEach(([t, amt]) => {
            byType[t] = (byType[t] || 0) + amt * ratio;
        });
    });

    Object.keys(byType).forEach(t => { byType[t] = round2(byType[t]); });
    return { totalCost: round2(totalCost), byType, byMonth, prorated };
}

export function showExpenseImportModal() {
    const el = document.getElementById('expenseImportModal');
    const monthEl = document.getElementById('expenseMonth');
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (monthEl && !monthEl.value) monthEl.value = m;
    if (el) el.classList.remove('hidden');
}

export function closeExpenseImportModal() {
    const el = document.getElementById('expenseImportModal');
    if (el) el.classList.add('hidden');
}

export async function saveClinicExpense() {
    const month = document.getElementById('expenseMonth').value;
    const type = document.getElementById('expenseType').value;
    const amount = document.getElementById('expenseAmount').value;
    const note = document.getElementById('expenseNote').value;
    if (!month || !type || !amount) {
        G.showToast('請填寫月份、類型與金額', 'error');
        return;
    }
    await G.waitForFirebaseDb();
    const createdBy = G.currentUserData ? G.currentUserData.username : (G.currentUser || 'system');
    await window.firebase.addDoc(
        window.firebase.collection(window.firebase.db, 'clinicExpenses'),
        { month, type, amount: Number(amount), note: note || '', clinicId: G.currentClinicId || null, clinicName: (G.clinicSettings && (G.clinicSettings.chineseName || G.clinicSettings.englishName)) ? (G.clinicSettings.chineseName || G.clinicSettings.englishName) : '', createdAt: new Date(), updatedAt: new Date(), createdBy }
    );
    G.showToast('成本已儲存', 'success');
    closeExpenseImportModal();
    try { await G.generateFinancialReport(); } catch (_e) {}
    try { await loadClinicExpensesForSelectedMonth(); } catch (_e) {}
    try { await loadClinicExpensesForListMonth(); } catch (_e) {}
}

export async function listClinicExpensesForMonth(month) {
    await G.waitForFirebaseDb();
    const colRef = window.firebase.collection(window.firebase.db, 'clinicExpenses');
    const q = window.firebase.firestoreQuery(colRef, window.firebase.where('month', '==', month));
    const snapshot = await window.firebase.getDocs(q);
    const list = [];
    snapshot.forEach(docSnap => {
        const d = docSnap.data() || {};
        list.push({ id: docSnap.id, ...d });
    });
    list.sort((a, b) => {
        const ta = a.updatedAt && a.updatedAt.seconds ? new Date(a.updatedAt.seconds * 1000) : (a.updatedAt ? new Date(a.updatedAt) : new Date(0));
        const tb = b.updatedAt && b.updatedAt.seconds ? new Date(b.updatedAt.seconds * 1000) : (b.updatedAt ? new Date(b.updatedAt) : new Date(0));
        return tb - ta;
    });
    return list;
}

// 支出列表的事件委派只綁定一次，兩個渲染函式共用同一個 tbody
export function bindClinicExpenseRowActions(tbody) {
    if (!tbody || tbody.dataset.expenseActionsBound === '1') return;
    tbody.dataset.expenseActionsBound = '1';
    tbody.addEventListener('click', function(e) {
        const btn = e.target.closest && e.target.closest('button[data-action]');
        if (!btn || !tbody.contains(btn)) return;
        const id = btn.getAttribute('data-id') || '';
        switch (btn.getAttribute('data-action')) {
            case 'edit-expense':
                startEditExpense(id);
                break;
            case 'delete-expense':
                deleteExpense(id);
                break;
            case 'save-expense':
                saveEditExpense(id);
                break;
            case 'cancel-expense':
                cancelEditExpense();
                break;
        }
    });
}

export async function loadClinicExpensesForSelectedMonth() {
    const month = document.getElementById('expenseMonth').value;
    if (!month) return;
    const list = await listClinicExpensesForMonth(month);
    const tbody = document.getElementById('expenseListBody');
    if (!tbody) return;
    bindClinicExpenseRowActions(tbody);
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-4 py-6 text-center text-gray-500">此月份尚無成本資料</td>
            </tr>
        `;
        return;
    }
    tbody.innerHTML = list.map(item => {
        const amt = Number(item.amount) || 0;
        // 類型/備註為管理員可輸入欄位，統一跳脫避免 XSS
        const note = window.escapeHtml(item.note || '');
        const type = window.escapeHtml(item.type || '其他費用');
        const safeId = window.escapeHtml(item.id);
        return `
            <tr data-id="${safeId}" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900">${type}</td>
                <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">HK$${amt.toLocaleString()}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${note}</td>
                <td class="px-4 py-3 text-sm text-right">
                    <button type="button" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded mr-2" data-action="edit-expense" data-id="${safeId}">編輯</button>
                    <button type="button" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded" data-action="delete-expense" data-id="${safeId}">刪除</button>
                </td>
            </tr>
        `;
    }).join('');
}

export async function loadClinicExpensesForListMonth() {
    const month = document.getElementById('expenseListMonth').value;
    if (!month) return;
    const list = await listClinicExpensesForMonth(month);
    const tbody = document.getElementById('expenseListBody');
    if (!tbody) return;
    bindClinicExpenseRowActions(tbody);
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-4 py-6 text-center text-gray-500">此月份尚無成本資料</td>
            </tr>
        `;
        return;
    }
    tbody.innerHTML = list.map(item => {
        const amt = Number(item.amount) || 0;
        // 類型/備註為管理員可輸入欄位，統一跳脫避免 XSS
        const note = window.escapeHtml(item.note || '');
        const type = window.escapeHtml(item.type || '其他費用');
        const safeId = window.escapeHtml(item.id);
        return `
            <tr data-id="${safeId}" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900">${type}</td>
                <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">HK$${amt.toLocaleString()}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${note}</td>
                <td class="px-4 py-3 text-sm text-right">
                    <button type="button" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded mr-2" data-action="edit-expense" data-id="${safeId}">編輯</button>
                    <button type="button" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded" data-action="delete-expense" data-id="${safeId}">刪除</button>
                </td>
            </tr>
        `;
    }).join('');
}

export function showExpenseListModal() {
    const el = document.getElementById('expenseListModal');
    const monthEl = document.getElementById('expenseListMonth');
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (monthEl && !monthEl.value) monthEl.value = m;
    if (el) el.classList.remove('hidden');
    try { loadClinicExpensesForListMonth(); } catch (_e) {}
}

export function closeExpenseListModal() {
    const el = document.getElementById('expenseListModal');
    if (el) el.classList.add('hidden');
}
export function startEditExpense(id) {
    const row = Array.from(document.querySelectorAll('#expenseListBody tr')).find(tr => tr.getAttribute('data-id') === id);
    if (!row) return;
    const tds = row.querySelectorAll('td');
    const curType = tds[0].textContent.trim();
    const curAmountText = tds[1].textContent.replace(/[^0-9.]/g, '').trim();
    const curAmount = Number(curAmountText) || 0;
    const curNote = tds[2].textContent.trim();
    const safeId = window.escapeHtml(id);
    // 備註回填至 value 屬性必須跳脫，否則含引號的文字會截斷屬性
    const safeNote = window.escapeHtml(curNote);
    row.innerHTML = `
        <td class="px-4 py-3">
            <select id="exp_type_${safeId}" class="w-full border border-gray-300 rounded-lg px-2 py-1">
                <option value="針灸用具"${curType==='針灸用具'?' selected':''}>針灸用具</option>
                <option value="飲片"${curType==='飲片'?' selected':''}>飲片</option>
                <option value="顆粒沖劑"${curType==='顆粒沖劑'?' selected':''}>顆粒沖劑</option>
                <option value="場地租金"${curType==='場地租金'?' selected':''}>場地租金</option>
                <option value="水電費用"${curType==='水電費用'?' selected':''}>水電費用</option>
                <option value="工資費用"${curType==='工資費用'?' selected':''}>工資費用</option>
                <option value="其他費用"${curType==='其他費用'?' selected':''}>其他費用</option>
            </select>
        </td>
        <td class="px-4 py-3">
            <input id="exp_amount_${safeId}" type="number" min="0" step="1" value="${curAmount}" class="w-full border border-gray-300 rounded-lg px-2 py-1 text-right">
        </td>
        <td class="px-4 py-3">
            <input id="exp_note_${safeId}" type="text" value="${safeNote}" class="w-full border border-gray-300 rounded-lg px-2 py-1">
        </td>
        <td class="px-4 py-3 text-right">
            <button type="button" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded mr-2" data-action="save-expense" data-id="${safeId}">儲存</button>
            <button type="button" class="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded" data-action="cancel-expense">取消</button>
        </td>
    `;
}

export async function saveEditExpense(id) {
    const typeEl = document.getElementById(`exp_type_${id}`);
    const amountEl = document.getElementById(`exp_amount_${id}`);
    const noteEl = document.getElementById(`exp_note_${id}`);
    if (!typeEl || !amountEl) return;
    const type = typeEl.value;
    const amount = Number(amountEl.value) || 0;
    const note = noteEl ? noteEl.value : '';
    await G.waitForFirebaseDb();
    await window.firebase.updateDoc(
        window.firebase.doc(window.firebase.db, 'clinicExpenses', id),
        { type, amount, note, updatedAt: new Date(), updatedBy: G.currentUser || 'system' }
    );
    G.showToast('成本已更新', 'success');
    await loadClinicExpensesForSelectedMonth();
}

export function cancelEditExpense() {
    loadClinicExpensesForSelectedMonth();
}

export async function deleteExpense(id) {
    await G.waitForFirebaseDb();
    await window.firebase.deleteDoc(
        window.firebase.doc(window.firebase.db, 'clinicExpenses', id)
    );
    G.showToast('成本已刪除', 'success');
    await loadClinicExpensesForSelectedMonth();
}
