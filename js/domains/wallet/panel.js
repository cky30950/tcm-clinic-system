/* ============================================================
 * wallet/panel.js — 會員儲值面板：列表／搜尋／詳情／交易分頁／管理區展開
 * ------------------------------------------------------------
 * Phase 2 自 system.js IIFE 原樣拆分，邏輯零改動；跨檔共享
 * 符號經 ESM import，舊全域存取一律經 G（js/lib/legacy.js）。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { getWalletMembershipConfig, walletBonusFor } from './account.js';
import { WALLET_METHOD_LABELS, WALLET_STATUS_LABELS, WALLET_TYPE_LABELS, currentWalletClinicId, walletAccountDocId, walletRound2 } from './shared.js';

  export let walletSelectedPatientId = '';

  /**
   * 目前操作的診所 ID（員工帳號僅隸屬單一診所；超管可切換）。
   * 【暫時政策 2026-09】過渡期內所有員工可操作所有診所，故一律使用
   * UI 頂部選取的診所；日後員工診所對應表整理好後，再恢復「繫結員工
   * 強制以 currentUserClaims.clinicId 為準」的版本。
   */
  /* ============================================================
   * 左欄會員列表
   * 預設：列出總餘額（本金＋贈送額）> 0 的會員
   * 搜尋：複用 firebaseDataManager.searchPatients（姓名／編號／電話）
   * ============================================================ */
  export let walletCurrentEntries = [];
  export let walletCurrentIsSearch = false;
  export let walletResizeBound = false;
  export const walletPatientInfoCache = new Map();

  export function walletListLoadingHtml() {
    return `<div class="px-4 py-10 text-center text-sm text-gray-400">
      <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-700"></div>
      <div class="mt-2">載入中…</div></div>`;
  }

  // 解析病人姓名／編號／電話：優先用病人快取，缺者才按需讀取（session 快取）
  // 解析病人姓名／編號／電話：優先用病人快取，缺者才按需讀取（session 快取）
  export async function resolveWalletPatientInfo(ids) {
    const map = new Map();
    const collect = (p) => {
      if (!p || !p.id) return;
      const id = String(p.id);
      if (ids.indexOf(id) === -1 || map.has(id)) return;
      map.set(id, {
        name: p.name || '',
        patientNumber: p.patientNumber || '',
        phone: p.phone || ''
      });
    };
    try {
      const dmCache = (window.firebaseDataManager && Array.isArray(window.firebaseDataManager.patientsCache))
        ? window.firebaseDataManager.patientsCache : [];
      dmCache.forEach(collect);
      (Array.isArray(G.patients) ? patients : []).forEach(collect);
    } catch (_e) {}

    const missing = [];
    ids.forEach((id) => {
      const cached = walletPatientInfoCache.get(id);
      if (cached) map.set(id, cached);
      else if (!map.has(id)) missing.push(id);
    });
    if (missing.length) {
      const snaps = await Promise.all(missing.map((id) =>
        window.firebase.getDoc(window.firebase.doc(window.firebase.db, 'patients', id))
          .catch(() => null)
      ));
      snaps.forEach((snap, i) => {
        if (snap && snap.exists()) {
          const d = snap.data() || {};
          const info = {
            name: d.name || '',
            patientNumber: d.patientNumber || '',
            phone: d.phone || ''
          };
          walletPatientInfoCache.set(missing[i], info);
          map.set(missing[i], info);
        }
      });
    }
    return map;
  }

  export async function loadWalletMemberList() {
    const listEl = document.getElementById('walletMemberList');
    if (!listEl) return;
    walletCurrentIsSearch = false;
    listEl.innerHTML = walletListLoadingHtml();
    try {
      const cid = currentWalletClinicId();
      // 單欄位 where（clinicId 相等）走自動索引；游標分頁抓全部，
      // 排序於客戶端處理，避免規模擴大後 limit 靜默截斷會員
      const { docs, truncated } = await G.walletFetchAllDocs(
        'patientWalletAccounts',
        [window.firebase.where('clinicId', '==', cid)],
        { pageSize: 300, maxDocs: 10000 }
      );
      if (truncated) {
        G.showToast('會員帳戶超過一萬個，僅顯示最近部分，請用搜尋功能', 'error');
      }
      const accounts = docs.map((d) => d.data());
      // updatedAt 為 ISO 字串，Number() 會得到 NaN 令排序失效；
      // 統一用時間戳比較（兼容 Firestore Timestamp 物件與數字）
      const walletTs = (v) => {
        if (v == null) return 0;
        if (typeof v === 'number') return v;
        if (typeof v === 'object' && v.seconds != null) return Number(v.seconds) * 1000;
        const t = Date.parse(v);
        return Number.isFinite(t) ? t : 0;
      };
      accounts.sort((a, b) => walletTs(b.updatedAt) - walletTs(a.updatedAt));
      const withBalance = accounts.filter((a) =>
        walletRound2(a.balance) + walletRound2(a.bonusBalance) > 0
      );
      const ids = withBalance.map((a) => String(a.patientId));
      const infoMap = await resolveWalletPatientInfo(ids);
      walletCurrentEntries = withBalance.map((a) => ({
        patientId: String(a.patientId),
        account: a,
        info: infoMap.get(String(a.patientId)) || null
      }));
      renderWalletMemberRows();
    } catch (error) {
      console.error('loadWalletMemberList error:', error);
      listEl.innerHTML = `<div class="px-4 py-8 text-center text-sm text-red-400">${
        window.escapeHtml((error && error.message) || '載入失敗，請重試')
      }</div>`;
    }
  }

  // 與病人資料管理一致的本地過濾條件（姓名／電話／病人編號／身份證）
  // 與病人資料管理一致的本地過濾條件（姓名／電話／病人編號／身份證）
  export function walletLocalMatch(p, kw, compact) {
    return !!(
      (p.name && String(p.name).toLowerCase().includes(kw))
      || (p.phone && String(p.phone).replace(/\s/g, '').toLowerCase().includes(compact))
      || (p.patientNumber && String(p.patientNumber).toLowerCase().includes(kw))
      || (p.idCard && String(p.idCard).toLowerCase().includes(kw))
    );
  }

  export async function searchWalletMembers(keyword) {
    const listEl = document.getElementById('walletMemberList');
    if (!listEl) return;
    walletCurrentIsSearch = true;
    listEl.innerHTML = walletListLoadingHtml();
    try {
      const kw = String(keyword || '').trim().toLowerCase();
      const compact = kw.replace(/\s/g, '');
      let found = [];

      // 主力：與病人資料管理相同的 searchPatients（searchKeywords 索引）
      try {
        if (window.firebaseDataManager) {
          const res = await window.firebaseDataManager.searchPatients(kw, 50);
          if (res && res.success && Array.isArray(res.data)) found = res.data;
        }
      } catch (searchErr) {
        console.warn('wallet searchPatients failed, fallback to local:', searchErr);
      }

      // 兜底：索引無結果時（舊文件缺 searchKeywords、dataManager 未備妥等），
      // 確保病人全量快取已載入後做本地過濾，保證「輸入名字就能找到」。
      if (!found.length && kw) {
        let all = [];
        try {
          if (window.firebaseDataManager) {
            const pr = await window.firebaseDataManager.getPatients(false);
            if (pr && pr.success && Array.isArray(pr.data)) all = pr.data;
          }
        } catch (allErr) {
          console.warn('wallet load all patients failed:', allErr);
        }
        if (!all.length && Array.isArray(G.patients)) all = G.patients;
        found = all.filter((p) => p && walletLocalMatch(p, kw, compact)).slice(0, 50);
      }

      const cid = currentWalletClinicId();
      const ids = found.map((p) => String(p.id));
      // 帳戶文件 ID 即為「診所__病人」複合鍵，直接以 getDoc 逐筆讀取
      // （分兩批並行）。不可用 where('patientId','in',...)：那會跨診所
      // 取回文件，在員工跨診所隔離規則下整個查詢會被拒絕。
      const accMap = new Map();
      const getOne = async (pid) => {
        try {
          const snap = await window.firebase.getDoc(
            window.firebase.doc(
              window.firebase.db,
              'patientWalletAccounts',
              walletAccountDocId(cid, pid)
            )
          );
          if (snap && snap.exists()) accMap.set(pid, snap.data());
        } catch (_e) { /* 無帳戶或無權限＝視為無帳戶 */ }
      };
      for (let i = 0; i < ids.length; i += 10) {
        await Promise.all(ids.slice(i, i + 10).map(getOne));
      }
      walletCurrentEntries = found.map((p) => {
        const id = String(p.id);
        const info = {
          name: p.name || '',
          patientNumber: p.patientNumber || '',
          phone: p.phone || ''
        };
        walletPatientInfoCache.set(id, info);
        return { patientId: id, account: accMap.get(id) || null, info };
      });
      // 有餘額者排前面
      walletCurrentEntries.sort((a, b) => {
        const ta = a.account ? walletRound2(a.account.balance) + walletRound2(a.account.bonusBalance) : 0;
        const tb = b.account ? walletRound2(b.account.balance) + walletRound2(b.account.bonusBalance) : 0;
        return tb - ta;
      });
      renderWalletMemberRows();
    } catch (error) {
      console.error('searchWalletMembers error:', error);
      listEl.innerHTML = '<div class="px-4 py-8 text-center text-sm text-red-400">搜尋失敗，請重試</div>';
    }
  }

  export function renderWalletMemberRows() {
    const listEl = document.getElementById('walletMemberList');
    const countEl = document.getElementById('walletMemberCount');
    if (!listEl) return;
    if (countEl) {
      countEl.textContent = walletCurrentIsSearch
        ? `${walletCurrentEntries.length} 個結果`
        : `${walletCurrentEntries.length} 位會員`;
    }
    if (!walletCurrentEntries.length) {
      listEl.innerHTML = `<div class="px-4 py-10 text-center text-sm text-gray-400">${
        walletCurrentIsSearch ? '沒有找到符合條件的病人' : '暫無已儲值會員'
      }</div>`;
      return;
    }
    listEl.innerHTML = walletCurrentEntries.map((e) => {
      const total = e.account
        ? walletRound2(e.account.balance) + walletRound2(e.account.bonusBalance)
        : 0;
      const selected = walletSelectedPatientId === e.patientId;
      const name = e.info && e.info.name ? e.info.name : '（未知姓名）';
      const sub = e.info ? (e.info.patientNumber || e.info.phone || '') : '';
      return `
        <button onclick="selectWalletPatient('${window.escapeHtml(e.patientId)}')"
          class="w-full text-left px-4 py-3 transition hover:bg-teal-50 ${
            selected ? 'bg-teal-50 border-l-4 border-teal-600' : 'border-l-4 border-transparent'
          }">
          <div class="flex justify-between items-center gap-2">
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-800 truncate">${window.escapeHtml(name)}</div>
              <div class="text-xs text-gray-500 truncate">${window.escapeHtml(sub)}</div>
            </div>
            ${total > 0
              ? `<span class="text-sm font-semibold text-green-700 whitespace-nowrap">HK$${total.toFixed(2)}</span>`
              : '<span class="text-xs text-gray-400 whitespace-nowrap">未儲值</span>'}
          </div>
        </button>`;
    }).join('');
  }

  export function loadWalletManagement() {
    const input = document.getElementById('walletPatientSearch');
    const panel = document.getElementById('walletPanel');
    const empty = document.getElementById('walletEmptyState');
    if (panel) panel.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    // 「會員設定」僅診所管理（擁有 walletAdjust 權限）可見
    const configArea = document.getElementById('walletConfigArea');
    if (configArea) {
      configArea.classList.toggle('hidden', !G.hasActionPermission('walletAdjust'));
    }
    const configForm = document.getElementById('walletConfigForm');
    if (configForm) {
      configForm.classList.add('hidden');
      configForm.innerHTML = '';
    }
    const configToggle = document.getElementById('walletConfigToggle');
    if (configToggle) configToggle.textContent = '展開';
    walletSelectedPatientId = '';
    if (input) {
      input.value = '';
      let debounceTimer = null;
      input.oninput = function () {
        if (debounceTimer) clearTimeout(debounceTimer);
        const value = this.value;
        debounceTimer = setTimeout(() => {
          if (value.trim()) searchWalletMembers(value);
          else loadWalletMemberList();
        }, 350);
      };
    }
    loadWalletMemberList();

    // 視窗高度改變時，重新渲染交易分頁（版面配合）
    if (!walletResizeBound) {
      let rt = null;
      window.addEventListener('resize', () => {
        if (rt) clearTimeout(rt);
        rt = setTimeout(() => {
          if (walletLastTxs.length
              && !document.getElementById('walletManagement').classList.contains('hidden')) {
            renderWalletTxRows();
          }
        }, 200);
      });
      walletResizeBound = true;
    }
  }

  export async function selectWalletPatient(patientId) {
    walletSelectedPatientId = patientId;
    renderWalletMemberRows();
    const empty = document.getElementById('walletEmptyState');
    if (empty) empty.classList.add('hidden');
    await renderWalletPanel(patientId, true);
    // 手機版右欄在下方，自動捲動到詳情
    if (window.innerWidth < 1024) {
      const panel = document.getElementById('walletPanel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // 充值／退款／調整／狀態變更後，同步左欄列表的帳戶資料
  // 充值／退款／調整／狀態變更後，同步左欄列表的帳戶資料
  export async function syncWalletListEntry(patientId) {
    const id = String(patientId);
    const idx = walletCurrentEntries.findIndex((e) => e.patientId === id);
    const fresh = await getWalletAccount(id, true);
    const total = fresh
      ? walletRound2(fresh.balance) + walletRound2(fresh.bonusBalance)
      : 0;
    if (walletCurrentIsSearch) {
      if (idx >= 0) walletCurrentEntries[idx].account = fresh;
      renderWalletMemberRows();
      return;
    }
    // 預設列表只保留有餘額者；新產生餘額的帳戶則整個重載
    if (idx >= 0) {
      if (total > 0) walletCurrentEntries[idx].account = fresh;
      else walletCurrentEntries.splice(idx, 1);
      renderWalletMemberRows();
    } else if (total > 0) {
      await loadWalletMemberList();
    }
  }

  export async function renderWalletPanel(patientId, force) {
    const panel = document.getElementById('walletPanel');
    if (!panel) return;

    const account = await getWalletAccount(patientId, !!force);
    let txs = [];
    if (account) txs = await loadWalletTransactions(patientId);

    panel.classList.remove('hidden');

    // 頂部顯示目前選中的病人（姓名／編號／電話）
    const infoMap = await resolveWalletPatientInfo([String(patientId)]);
    const pInfo = infoMap.get(String(patientId)) || null;
    walletLastPatientInfo = pInfo;
    document.getElementById('walletPatientName').textContent =
      `病人姓名：${(pInfo && pInfo.name) ? pInfo.name : '未知病人'}`;
    const metaParts = [];
    if (pInfo && pInfo.patientNumber) metaParts.push(`病人編號：${pInfo.patientNumber}`);
    if (pInfo && pInfo.phone) metaParts.push(`電話：${pInfo.phone}`);
    document.getElementById('walletPatientMeta').textContent = metaParts.join('　');

    const balance = account ? walletRound2(account.balance) : 0;
    const bonus = account ? walletRound2(account.bonusBalance) : 0;
    document.getElementById('walletBalanceView').textContent =
      `HK$${balance.toFixed(2)}`;
    document.getElementById('walletBonusView').textContent =
      `HK$${bonus.toFixed(2)}`;
    document.getElementById('walletStatusView').textContent = account
      ? (WALLET_STATUS_LABELS[account.status] || account.status)
      : '未開戶';

    // 充值區：依權限顯示，金額輸入即時提示贈送額
    const topupArea = document.getElementById('walletTopupArea');
    const canTopup = G.hasActionPermission('walletTopup');
    topupArea.style.display = canTopup ? '' : 'none';
    const amountInput = document.getElementById('walletTopupAmount');
    const hint = document.getElementById('walletTopupHint');
    amountInput.oninput = async function () {
      const amt = Number(this.value);
      if (!(amt > 0)) { hint.textContent = ''; return; }
      const cfg = await getWalletMembershipConfig();
      const bonusAmount = walletBonusFor(cfg, amt);
      hint.textContent = bonusAmount > 0
        ? `此金額可獲贈 HK$${bonusAmount.toFixed(2)}`
        : '此金額沒有贈送';
    };

    // 管理員區：退款/調整/狀態（帳戶存在才顯示）；預設收合
    const adminArea = document.getElementById('walletAdminArea');
    const adminForm = document.getElementById('walletAdminForm');
    const adminOpsBody = document.getElementById('walletAdminOpsBody');
    const adminOpsToggle = document.getElementById('walletAdminOpsToggle');
    if (adminForm) adminForm.classList.add('hidden');
    if (adminOpsBody) adminOpsBody.classList.add('hidden');
    if (adminOpsToggle) adminOpsToggle.textContent = '展開';
    if (account && G.hasAdminRole()) {
      adminArea.classList.remove('hidden');
    } else {
      adminArea.classList.add('hidden');
    }

    // 交易表：每頁最多 10 筆，超出的於分頁列切換頁面
    walletLastTxs = txs;
    walletTxPage = 1;
    renderWalletTxRows();
  }

  export const WALLET_TX_PAGE_SIZE = 10;
  export let walletLastTxs = [];
  export let walletTxPage = 1;
  export let walletLastPatientInfo = null;

  export function walletTxRowHtml(tx) {
    const amount = walletRound2(tx.amount);
    const isPayment = tx.type === 'payment' || amount < 0;
    let atText = '';
    try {
      atText = new Date(tx.at).toLocaleString('zh-HK', { hour12: false });
    } catch (_e) { atText = tx.at || ''; }
    // 充值流水標注實際收款渠道（舊記錄無欄位時不顯示）
    let typeText = WALLET_TYPE_LABELS[tx.type] || tx.type;
    if (tx.type === 'topup' && tx.paymentMethod) {
      const methodLabel = WALLET_METHOD_LABELS[tx.paymentMethod] || tx.paymentMethod;
      typeText += `（${methodLabel}）`;
    }
    // 狀態變更另顯示轉換軌跡（active→frozen 等）
    if (tx.type === 'statusChange' && tx.toStatus) {
      const fromL = WALLET_STATUS_LABELS[tx.fromStatus] || tx.fromStatus || '運作中';
      const toL = WALLET_STATUS_LABELS[tx.toStatus] || tx.toStatus;
      typeText += `（${fromL}→${toL}）`;
    }
    // 狀態變更不涉金額，顯示「—」，不套用紅綠色
    const isZeroAmount = tx.type === 'statusChange' || amount === 0;
    const amountCell = isZeroAmount
      ? '<span class="text-gray-400">—</span>'
      : `<span class="${isPayment ? 'text-red-600' : 'text-green-600'}">`
        + `${isPayment ? '-' : ''}HK$${Math.abs(amount).toFixed(2)}</span>`;
    return `
      <tr class="border-t border-gray-100">
        <td class="px-3 py-1.5 text-gray-600 whitespace-nowrap">${window.escapeHtml(atText)}</td>
        <td class="px-3 py-1.5 text-gray-800">${window.escapeHtml(typeText)}</td>
        <td class="px-3 py-1.5 text-right font-medium">${amountCell}</td>
        <td class="px-3 py-1.5 text-gray-500 max-w-sm truncate">${window.escapeHtml(tx.note || '')}</td>
      </tr>`;
  }

  // 分頁列：上一頁／頁碼／下一頁（頁碼過多時首尾與目前頁附近保留，其餘省略）
  // 分頁列：上一頁／頁碼／下一頁（頁碼過多時首尾與目前頁附近保留，其餘省略）
  export function walletTxPagerHtml(totalPages) {
    const pages = [];
    const push = (p) => pages.push(p);
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - walletTxPage) <= 1) push(p);
      else if (pages[pages.length - 1] !== '…') push('…');
    }
    const btns = pages.map((p) => p === '…'
      ? '<span class="px-1 text-gray-400">…</span>'
      : `<button onclick="walletGoToTxPage(${p})"
          class="min-w-[28px] px-2 py-1 rounded ${p === walletTxPage
            ? 'bg-teal-600 text-white' : 'text-teal-700 hover:bg-teal-50'}">${p}</button>`
    ).join('');
    return `
      <div class="flex items-center gap-1">
        <button onclick="walletGoToTxPage(${walletTxPage - 1})"
          ${walletTxPage <= 1 ? 'disabled class="px-2 py-1 text-gray-300 cursor-default"'
            : 'class="px-2 py-1 text-teal-700 hover:bg-teal-50 rounded"'}>上一頁</button>
        ${btns}
        <button onclick="walletGoToTxPage(${walletTxPage + 1})"
          ${walletTxPage >= totalPages ? 'disabled class="px-2 py-1 text-gray-300 cursor-default"'
            : 'class="px-2 py-1 text-teal-700 hover:bg-teal-50 rounded"'}>下一頁</button>
      </div>
      <span class="text-xs text-gray-500 whitespace-nowrap">第 ${walletTxPage} / ${totalPages} 頁</span>`;
  }

  export function renderWalletTxRows() {
    const tbody = document.getElementById('walletTxTable');
    const pager = document.getElementById('walletTxPager');
    if (!tbody) return;
    if (!walletLastTxs.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-gray-400">尚無交易記錄</td></tr>';
      if (pager) pager.classList.add('hidden');
      return;
    }

    const totalPages = Math.ceil(walletLastTxs.length / WALLET_TX_PAGE_SIZE);
    if (walletTxPage > totalPages) walletTxPage = totalPages;
    if (walletTxPage < 1) walletTxPage = 1;
    const start = (walletTxPage - 1) * WALLET_TX_PAGE_SIZE;
    const pageTxs = walletLastTxs.slice(start, start + WALLET_TX_PAGE_SIZE);
    tbody.innerHTML = pageTxs.map(walletTxRowHtml).join('');

    if (pager) {
      if (totalPages > 1) {
        pager.innerHTML = walletTxPagerHtml(totalPages);
        pager.classList.remove('hidden');
      } else {
        pager.classList.add('hidden');
      }
    }
  }

  export function walletGoToTxPage(p) {
    const totalPages = Math.ceil(walletLastTxs.length / WALLET_TX_PAGE_SIZE);
    const next = Math.max(1, Math.min(totalPages, Number(p)));
    if (next === walletTxPage) return;
    walletTxPage = next;
    renderWalletTxRows();
  }

  // 管理員操作區收合
  // 管理員操作區收合
  export function openWalletAdminOps() {
    const body = document.getElementById('walletAdminOpsBody');
    const toggle = document.getElementById('walletAdminOpsToggle');
    if (body) body.classList.remove('hidden');
    if (toggle) toggle.textContent = '收合';
  }

  export function toggleWalletAdminOps() {
    const body = document.getElementById('walletAdminOpsBody');
    const toggle = document.getElementById('walletAdminOpsToggle');
    if (!body) return;
    if (body.classList.contains('hidden')) {
      body.classList.remove('hidden');
      if (toggle) toggle.textContent = '收合';
    } else {
      body.classList.add('hidden');
      if (toggle) toggle.textContent = '展開';
    }
  }

