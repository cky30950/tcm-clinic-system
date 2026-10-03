/* ============================================================
 * wallet/consultation-pay.js — 診症表單整合：會員自動折扣＋儲值餘額支付
 * ------------------------------------------------------------
 * Phase 2 自 system.js IIFE 原樣拆分，邏輯零改動；跨檔共享
 * 符號經 ESM import，舊全域存取一律經 G（js/lib/legacy.js）。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { getWalletAccount, getWalletMembershipConfig, invalidateWalletAccount, walletAvailable } from './account.js';
import { currentWalletClinicId, walletApi, walletRound2 } from './shared.js';

  /* ============================================================
   * 診症表單整合：會員自動折扣 + 儲值餘額支付
   * ------------------------------------------------------------
   * setupConsultationWallet：開表單時讀帋戶與會員設定
   * processConsultationWalletPayment：病歷保存後扣款（冪等）
   * 扣款失敗保留表單，提供重試／取消按鈕
   * ============================================================ */
  export const consultWallet = {
    clinicId: '',
    patientId: '',
    account: null,
    config: null,
    discountItemId: '',
    autoDiscountApplied: false,
    consultationId: '',
    pendingPay: false,
    paid: false,
    // 總費用高於餘額而自動取消並鎖定勾選框時為 true
    autoLocked: false
  };

  export function showWalletPayMessage(html, isError) {
    const m = document.getElementById('walletPaymentMessage');
    if (!m) return;
    if (!html) {
      m.innerHTML = '';
      m.classList.add('hidden');
      return;
    }
    m.innerHTML = html;
    m.classList.remove('hidden');
    m.classList.toggle('text-red-600', !!isError);
    m.classList.toggle('text-teal-700', !isError);
  }

  export function resetConsultWalletUI() {
    consultWallet.clinicId = '';
    consultWallet.patientId = '';
    consultWallet.account = null;
    consultWallet.config = null;
    consultWallet.discountItemId = '';
    consultWallet.autoDiscountApplied = false;
    consultWallet.consultationId = '';
    consultWallet.pendingPay = false;
    consultWallet.paid = false;
    consultWallet.autoLocked = false;
    const area = document.getElementById('walletPaymentArea');
    if (area) area.classList.add('hidden');
    const cb = document.getElementById('useWalletPayment');
    if (cb) {
      cb.checked = false;
      cb.disabled = false;
      cb.onchange = null;
      const label = cb.closest('label');
      if (label) {
        label.classList.remove('opacity-50', 'cursor-not-allowed');
        label.classList.add('cursor-pointer');
      }
    }
    showWalletPayMessage('', false);
  }

  export function readConsultationTotal() {
    const el = document.getElementById('totalBillingAmount');
    if (!el) return 0;
    const n = parseFloat(String(el.textContent).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : walletRound2(n);
  }

  /**
   * 依目前總費用與儲值餘額的關係，同步「使用儲值餘額支付」欄位：
   * 總費用 > 餘額 → 取消選擇、反白並鎖定欄位，顯示原因
   * 總費用 <= 餘額 → 解鎖欄位（不自動重新勾選，由員工自行選擇）
   * 由 updateBillingDisplay() 於每次總費用重算後調用。
   */
  /**
   * 依目前總費用與儲值餘額的關係，同步「使用儲值餘額支付」欄位：
   * 總費用 > 餘額 → 取消選擇、反白並鎖定欄位，顯示原因
   * 總費用 <= 餘額 → 解鎖欄位（不自動重新勾選，由員工自行選擇）
   * 由 updateBillingDisplay() 於每次總費用重算後調用。
   */
  export function syncConsultWalletAvailability() {
    // 已付款病歷保持鎖定與事實顯示，不隨總費用變化
    if (consultWallet.paid) return;
    const area = document.getElementById('walletPaymentArea');
    const cb = document.getElementById('useWalletPayment');
    if (!area || !cb || area.classList.contains('hidden')) return;
    if (!walletAvailable(consultWallet.account)) return;
    const available = walletRound2(
      Number(consultWallet.account.balance) + Number(consultWallet.account.bonusBalance)
    );
    if (!(available > 0)) return;

    const total = readConsultationTotal();
    const label = cb.closest('label');

    if (total > available) {
      // 總費用高於餘額：取消選擇並反白鎖定
      if (cb.checked || consultWallet.pendingPay) {
        cb.checked = false;
        consultWallet.pendingPay = false;
      }
      cb.disabled = true;
      if (label) {
        label.classList.add('opacity-50', 'cursor-not-allowed');
        label.classList.remove('cursor-pointer');
      }
      consultWallet.autoLocked = true;
      showWalletPayMessage(
        '<i data-lucide="triangle-alert" class="w-4 h-4 inline-block align-text-bottom mr-1 text-amber-500"></i>總費用 HK$' + total.toFixed(2) +
        ' 高於儲值餘額 HK$' + available.toFixed(2) +
        '，已取消「使用儲值餘額支付」；總費用調低至餘額以內後將自動解鎖。',
        true
      );
    } else if (cb.disabled || consultWallet.autoLocked) {
      // 總費用回落至餘額以內：解鎖欄位（維持未勾選，等待員工重新選擇）
      cb.disabled = false;
      if (label) {
        label.classList.remove('opacity-50', 'cursor-not-allowed');
        label.classList.add('cursor-pointer');
      }
      if (consultWallet.autoLocked) {
        consultWallet.autoLocked = false;
        showWalletPayMessage('', false);
      }
    }
  }

  export async function setupConsultationWallet(appointment) {
    resetConsultWalletUI();
    // 版本限制：會員功能關閉時（如簡單版）不載入會員折扣與儲值支付
    if (!G.versionFeatureEnabled('membership')) return;
    if (!appointment || !appointment.patientId) return;
    const isEdit = appointment.status === 'completed' && appointment.consultationId;
    consultWallet.patientId = String(appointment.patientId);
    if (isEdit) consultWallet.consultationId = String(appointment.consultationId);
    // 扣款診所以掛號所屬診所為準（缺者退回目前選取診所）
    consultWallet.clinicId = String(
      appointment.clinicId
      || (() => { try { return currentWalletClinicId(); } catch (_e) { return ''; } })()
    );

    const [account, config] = await Promise.all([
      getWalletAccount(consultWallet.patientId, false, consultWallet.clinicId)
        .catch(() => null),
      getWalletMembershipConfig(consultWallet.clinicId).catch(() => null)
    ]);
    consultWallet.account = account;
    consultWallet.config = config;
    consultWallet.discountItemId = config && config.discountItemId ? String(config.discountItemId) : '';

    // 編輯模式：讀病歷確認是否曾以儲值支付
    let existing = null;
    if (isEdit && consultWallet.consultationId) {
      try {
        const r = await window.firebaseDataManager.getConsultationById(
          consultWallet.consultationId, true
        );
        if (r && r.success) existing = r.data;
      } catch (_e) {}
    }

    const area = document.getElementById('walletPaymentArea');
    const cb = document.getElementById('useWalletPayment');

    if (existing && existing.walletPaid) {
      // 已付款病歷：顯示事實，不允許差額自動扣款
      consultWallet.paid = true;
      area.classList.remove('hidden');
      cb.checked = true;
      cb.disabled = true;
      document.getElementById('walletPaymentAvailable').textContent = '';
      showWalletPayMessage(
        '此診症已以儲值餘額支付 HK$' +
        Number(existing.walletPaid).toFixed(2) +
        '。編輯時不會自動追加差額；如需退款，請使用「<i data-lucide="credit-card" class="w-3.5 h-3.5 inline-block align-text-bottom mx-0.5"></i>會員錢包」內的退款功能。',
        false
      );
      return;
    }

    const available = walletAvailable(account)
      ? Number(account.balance) + Number(account.bonusBalance)
      : 0;
    if (available > 0) {
      area.classList.remove('hidden');
      document.getElementById('walletPaymentAvailable').textContent =
        '（可用 HK$' + available.toFixed(2) + '）';
      cb.checked = false;
      cb.disabled = false;
      cb.onchange = function () {
        if (!cb.checked) {
          consultWallet.pendingPay = false;
          showWalletPayMessage('', false);
          return;
        }
        const total = readConsultationTotal();
        if (total > available) {
          cb.checked = false;
          G.showToast('儲值餘額不足，可用 HK$' + available.toFixed(2), 'warning');
          return;
        }
        consultWallet.pendingPay = true;
      };
      // 表單開啟時若已帶入收費項目（如編輯病歷），立即依總費用鎖定／解鎖
      syncConsultWalletAvailability();
    }

    // 新診症：僅「有效會員」（儲值帳戶 active 且有餘額）自動帶入折扣；
    // 未開戶、凍結/關閉或零餘額者皆不套用（available 已含 active 檢查）
    if (!isEdit && available > 0) applyAutoMembershipDiscount();
  }

  export function applyAutoMembershipDiscount() {
    const id = consultWallet.discountItemId;
    if (!id || consultWallet.autoDiscountApplied) return;
    if (Array.isArray(G.selectedBillingItems) &&
        G.selectedBillingItems.some(b => String(b.id) === id)) {
      consultWallet.autoDiscountApplied = true;
      return;
    }
    const def = (typeof G.billingItems !== 'undefined' && Array.isArray(G.billingItems))
      ? G.billingItems.find(b => String(b.id) === id)
      : null;
    if (!def || def.category !== 'discount') return;
    G.selectedBillingItems.push({
      id: id,
      name: def.name,
      category: 'discount',
      price: def.price,
      unit: def.unit || '',
      description: def.description || '',
      quantity: 1,
      includedInDiscount: false
    });
    consultWallet.autoDiscountApplied = true;
    G.updateBillingDisplay();
  }

  export async function processConsultationWalletPayment(opts) {
    // 回傳 true：成功或不需扣款；false：扣款失敗（表單保留）
    if (!consultWallet.pendingPay || consultWallet.paid) return true;
    const patientId = String((opts && opts.patientId) || consultWallet.patientId || '');
    const consultationId = String((opts && opts.consultationId) || consultWallet.consultationId || '');
    const clinicId = String((opts && opts.clinicId) || consultWallet.clinicId || '');
    if (!patientId || !consultationId) return true;
    const amount = readConsultationTotal();
    if (!(amount > 0)) {
      consultWallet.pendingPay = false;
      return true;
    }
    try {
      // 冪等鍵由後端強制為 pay:{consultationId}，客戶端不必也不可指定
      const res = await walletApi('payment', {
        clinicId: clinicId || undefined,
        patientId: patientId,
        amount: amount,
        consultationId: consultationId
      });
      // 實收金額以伺服器回傳為準（與診症單帳單核對過）；
      // 舊版冪等記錄可能沒有 chargedAmount，退回前端金額
      const chargedAmount = (res && Number(res.chargedAmount) > 0)
        ? walletRound2(res.chargedAmount) : amount;
      const principalAfter = walletRound2(res && res.balance);
      const bonusAfter = walletRound2(res && res.bonusBalance);
      await window.firebaseDataManager.updateConsultation(consultationId, {
        walletPaid: chargedAmount,
        walletTxId: (res && res.txId) ? String(res.txId) : '',
        // 支付後餘額快照，與套票餘次快照一樣固定寫入診症記錄
        walletPrincipalAfter: principalAfter,
        walletBonusAfter: bonusAfter,
        walletBalanceAfter: walletRound2(principalAfter + bonusAfter),
        // #13 收款狀態：儲值扣款成功，關閉待收款追蹤
        paymentStatus: 'wallet_paid',
        pendingAmount: 0,
        walletPaidAt: new Date().toISOString()
      }, { skipSideEffects: true });
      consultWallet.paid = true;
      consultWallet.pendingPay = false;
      invalidateWalletAccount(patientId, clinicId);
      showWalletPayMessage('已以儲值餘額支付 HK$' + chargedAmount.toFixed(2), false);
      return true;
    } catch (err) {
      const msg = (err && err.message) ? err.message : '未知錯誤';
      // 後端冪等防護指出此診症單先前已扣過款：視同已收款，補齊狀態
      if (err && err.code === 'WALLET_ALREADY_PAID') {
        try {
          await window.firebaseDataManager.updateConsultation(consultationId, {
            paymentStatus: 'wallet_paid',
            pendingAmount: 0,
            walletPaidAt: new Date().toISOString()
          }, { skipSideEffects: true });
        } catch (_markErr) { /* 標記失敗不阻擋流程 */ }
        consultWallet.paid = true;
        consultWallet.pendingPay = false;
        showWalletPayMessage('此診症單先前已以儲值餘額支付', false);
        return true;
      }
      // #13 病歷已保存但款項未收：標記待收款，供財報「待收款追蹤」核銷。
      // 標記失敗不影響原本的重試／改收流程。
      try {
        await window.firebaseDataManager.updateConsultation(consultationId, {
          paymentStatus: 'unpaid',
          pendingAmount: walletRound2(amount),
          walletPayFailedAt: new Date().toISOString()
        }, { skipSideEffects: true });
      } catch (_markErr) { /* 略過 */ }
      showWalletPayMessage(
        '<i data-lucide="triangle-alert" class="w-4 h-4 inline-block align-text-bottom mr-1 text-amber-500"></i>儲值扣款失敗：' + escapeHtml(msg) +
        '（病歷已保存，已列入待收款追蹤）。' +
        '<div class="mt-2">' +
        '<button type="button" onclick="retryConsultationWalletPayment()" ' +
        'class="mr-2 px-3 py-1 text-xs bg-teal-600 text-white rounded">重試扣款</button>' +
        '<button type="button" onclick="cancelConsultationWalletPayment()" ' +
        'class="px-3 py-1 text-xs bg-gray-500 text-white rounded">改以其他方式收款</button>' +
        '</div>',
        true
      );
      return false;
    }
  }

  export async function retryConsultationWalletPayment() {
    const ok = await processConsultationWalletPayment({
      clinicId: consultWallet.clinicId,
      patientId: consultWallet.patientId,
      consultationId: consultWallet.consultationId
    });
    if (ok) {
      G.showToast('儲值扣款成功', 'success');
      G.closeConsultationForm();
      G.loadTodayAppointments();
      G.updateStatistics();
      G.clearAllSearchFields();
    }
  }

  export async function cancelConsultationWalletPayment() {
    consultWallet.pendingPay = false;
    // 員工確定改以現場渠道收款：同樣列入待收款追蹤，
    // 收款後於財報「待收款追蹤」按「標記已收款」核銷
    try {
      const owed = walletRound2(readConsultationTotal());
      if (consultWallet.consultationId && owed > 0) {
        await window.firebaseDataManager.updateConsultation(
          String(consultWallet.consultationId),
          {
            paymentStatus: 'unpaid',
            pendingAmount: owed,
            walletPayFailedAt: new Date().toISOString(),
            walletPaySkipped: true
          },
          { skipSideEffects: true }
        );
      }
    } catch (_markErr) { /* 標記失敗不阻擋提示流程 */ }
    showWalletPayMessage(
      '已取消儲值扣款，請以現金／其他方式向病人收款，並於財報「待收款追蹤」核銷；' +
      '如需調整儲值帳戶，可於會員錢包人工調整。',
      false
    );
    const cb = document.getElementById('useWalletPayment');
    if (cb) cb.checked = false;
  }

  /**
   * 儲值支付預檢查：在保存病歷前驗證扣款是否可行
   * 避免扣款失敗時病歷已標記為 completed 造成狀態不一致
   * @returns {Promise<boolean>} true=可繼續保存；false=應中止保存
   */
  /**
   * 儲值支付預檢查：在保存病歷前驗證扣款是否可行
   * 避免扣款失敗時病歷已標記為 completed 造成狀態不一致
   * @returns {Promise<boolean>} true=可繼續保存；false=應中止保存
   */
  export async function preCheckConsultationWalletPayment() {
    // 沒有用儲值支付或已付過款，直接放行
    if (!consultWallet.pendingPay || consultWallet.paid) return true;

    const patientId = String(consultWallet.patientId || '');
    const clinicId = String(consultWallet.clinicId || '');
    if (!patientId) return true;

    try {
      // force: true 確保讀取最新帳戶狀態，不用快取
      const freshAccount = await getWalletAccount(patientId, true, clinicId);
      const totalAmount = readConsultationTotal();

      let warningMsg = '';

      if (!freshAccount) {
        warningMsg = '儲值帳戶不存在，請改用其他付款方式';
      } else if (freshAccount.status !== 'active') {
        const statusText = freshAccount.status === 'frozen'
          ? '已凍結'
          : (freshAccount.status === 'closed' ? '已關閉' : (freshAccount.status || '狀態異常'));
        warningMsg = `儲值帳戶${statusText}，請改用其他付款方式`;
      } else {
        const availableTotal = walletRound2(
          Number(freshAccount.balance || 0) + Number(freshAccount.bonusBalance || 0)
        );
        if (availableTotal < totalAmount) {
          warningMsg = `儲值餘額不足（可用 HK$${availableTotal.toFixed(2)}），請改用其他付款方式`;
        }
      }

      if (!warningMsg) return true;

      // 有問題：toast 提示 + 顯示在儲值區塊，阻止保存
      showWalletPayMessage('<i data-lucide="triangle-alert" class="w-4 h-4 inline-block align-text-bottom mr-1 text-amber-500"></i>' + escapeHtml(warningMsg), true);
      G.showToast(warningMsg, 'error');
      return false;
    } catch (preCheckErr) {
      console.warn('儲值預檢查失敗:', preCheckErr);
      // 預檢查本身出錯時，保守起見阻止保存
      G.showToast('無法確認儲值帳戶狀態，請稍後再試或改用其他付款方式', 'error');
      return false;
    }
  }
