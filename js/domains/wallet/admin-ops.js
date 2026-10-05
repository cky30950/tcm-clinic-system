/* ============================================================
 * wallet/admin-ops.js — 充值／退款／人工調整／狀態變更
 * ------------------------------------------------------------
 * Phase 2 自 system.js IIFE 原樣拆分，邏輯零改動；跨檔共享
 * 符號經 ESM import，舊全域存取一律經 G（js/lib/legacy.js）。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { getWalletMembershipConfig, invalidateWalletAccount, walletBonusFor } from './account.js';
import { renderWalletPanel, syncWalletListEntry, walletLastPatientInfo, walletLastTxs, walletSelectedPatientId } from './panel.js?v=20261005w';
import { WALLET_METHOD_LABELS, newIdempotencyKey, walletApi, walletIsMoney2, walletRound2 } from './shared.js';

  export async function submitWalletTopup() {
    if (!walletSelectedPatientId) return;
    if (!G.hasActionPermission('walletTopup')) {
      G.showToast('您沒有充值權限', 'error');
      return;
    }
    const amountInput = document.getElementById('walletTopupAmount');
    const amount = Number(amountInput.value);
    if (!(amount > 0)) {
      G.showToast('請輸入有效的充值金額', 'error');
      return;
    }
    if (!walletIsMoney2(amount)) {
      G.showToast('金額最多只可兩位小數（最小 HK$0.01）', 'error');
      return;
    }
    const methodSelect = document.getElementById('walletTopupMethod');
    const paymentMethod = methodSelect ? methodSelect.value : 'cash';
    const methodLabel = WALLET_METHOD_LABELS[paymentMethod] || paymentMethod;
    // 提交前彈窗二次確認（病人、收款方式、金額、贈送額）
    const patientName = (walletLastPatientInfo && walletLastPatientInfo.name) || '未知病人';
    let confirmMsg = `確認以「${methodLabel}」為病人「${patientName}」充值 HK$${walletRound2(amount).toFixed(2)}？`;
    try {
      const cfg = await getWalletMembershipConfig();
      const bonusAmount = walletBonusFor(cfg, amount);
      if (bonusAmount > 0) {
        confirmMsg += `\n此金額可獲贈 HK$${bonusAmount.toFixed(2)}`;
      }
    } catch (_e) { /* 贈送額查詢失敗不阻擋確認 */ }
    const confirmed = await G.showConfirmation(confirmMsg, 'question');
    if (!confirmed) return;
    try {
      const result = await walletApi('topup', {
        patientId: walletSelectedPatientId,
        amount,
        paymentMethod,
        idempotencyKey: newIdempotencyKey('topup')
      });
      invalidateWalletAccount(walletSelectedPatientId);
      amountInput.value = '';
      if (methodSelect) methodSelect.value = 'cash';
      document.getElementById('walletTopupHint').textContent = '';
      G.showToast(
        `充值成功${result.bonusAmount > 0 ? `，贈送 HK$${walletRound2(result.bonusAmount).toFixed(2)}` : ''}`,
        'success'
      );
      await renderWalletPanel(walletSelectedPatientId, true);
      await syncWalletListEntry(walletSelectedPatientId);
    } catch (error) {
      G.showToast('充值失敗：' + error.message, 'error');
    }
  }

  // ── 管理員內聯表單 ──

  export function hideWalletAdminForm() {
    const f = document.getElementById('walletAdminForm');
    if (f) {
      f.classList.add('hidden');
      f.innerHTML = '';
    }
  }

  export function showWalletRefundForm() {
    const f = document.getElementById('walletAdminForm');
    f.classList.remove('hidden');

    // 由已載入的交易記錄中取出儲值付款單，供直接選擇（不必手輸 ID）
    const payTxs = (walletLastTxs || []).filter((tx) =>
      tx && tx.type === 'payment' && tx.consultationId);
    const payOptions = payTxs.map((tx) => {
      let atText = '';
      try {
        atText = new Date(tx.at).toLocaleString('zh-HK', { hour12: false });
      } catch (_e) { atText = tx.at || ''; }
      const amt = Math.abs(walletRound2(tx.amount)).toFixed(2);
      return `<option value="${window.escapeHtml(tx.consultationId)}">${window.escapeHtml(atText)}　HK$${amt}</option>`;
    }).join('');

    f.innerHTML = `
      <h4 class="font-semibold text-gray-800 mb-3">退款</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-sm text-gray-600 mb-1">選擇診症單 *</label>
          <select id="walletRefundCidSelect" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            ${payOptions
              ? payOptions
              : '<option value="">沒有可退款的儲值付款記錄</option>'}
          </select>
        </div>
        <div>
          <label class="block text-sm text-gray-600 mb-1">診症單 ID（或自行輸入）</label>
          <input type="text" id="walletRefundCid" placeholder="20 字病歷 ID" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-sm text-gray-600 mb-1">退款金額（留空＝全額）</label>
          <input type="number" id="walletRefundAmount" min="0" step="0.01" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-sm text-gray-600 mb-1">說明</label>
          <input type="text" id="walletRefundNote" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        </div>
      </div>
      <div class="flex gap-3">
        <button onclick="submitWalletRefund()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm">確認退款</button>
        <button onclick="hideWalletAdminForm()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm">取消</button>
      </div>`;

    // 選擇下拉項目時自動帶入 ID
    const sel = document.getElementById('walletRefundCidSelect');
    const cidInput = document.getElementById('walletRefundCid');
    if (sel && cidInput) {
      sel.onchange = function () { cidInput.value = this.value; };
      if (sel.value) cidInput.value = sel.value;
    }
  }

  export async function submitWalletRefund() {
    const consultationId = String(document.getElementById('walletRefundCid').value || '').trim();
    if (!consultationId) {
      G.showToast('請輸入診症單 ID', 'error');
      return;
    }
    const amountRaw = document.getElementById('walletRefundAmount').value;
    const payload = {
      patientId: walletSelectedPatientId,
      consultationId,
      note: document.getElementById('walletRefundNote').value,
      idempotencyKey: newIdempotencyKey('refund')
    };
    if (amountRaw !== '') {
      const refundAmount = Number(amountRaw);
      if (!walletIsMoney2(refundAmount)) {
        G.showToast('退款金額最多只可兩位小數（最小 HK$0.01）', 'error');
        return;
      }
      payload.amount = refundAmount;
    }
    try {
      await walletApi('refund', payload);
      invalidateWalletAccount(walletSelectedPatientId);
      hideWalletAdminForm();
      G.showToast('退款完成', 'success');
      await renderWalletPanel(walletSelectedPatientId, true);
      await syncWalletListEntry(walletSelectedPatientId);
    } catch (error) {
      G.showToast('退款失敗：' + error.message, 'error');
    }
  }

  export function showWalletAdjustForm() {
    const f = document.getElementById('walletAdminForm');
    f.classList.remove('hidden');
    f.innerHTML = `
      <h4 class="font-semibold text-gray-800 mb-3">人工調整</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-sm text-gray-600 mb-1">本金調整（正增負減）</label>
          <input type="number" id="walletAdjustBalance" step="0.01" value="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-sm text-gray-600 mb-1">贈送額調整</label>
          <input type="number" id="walletAdjustBonus" step="0.01" value="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        </div>
      </div>
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1">原因 *</label>
        <input type="text" id="walletAdjustReason" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
      </div>
      <div class="flex gap-3">
        <button onclick="submitWalletAdjust()" class="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm">確認調整</button>
        <button onclick="hideWalletAdminForm()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm">取消</button>
      </div>`;
  }

  export async function submitWalletAdjust() {
    const reason = String(document.getElementById('walletAdjustReason').value || '').trim();
    if (!reason) {
      G.showToast('必須填寫調整原因', 'error');
      return;
    }
    const deltaBalance = Number(document.getElementById('walletAdjustBalance').value) || 0;
    const deltaBonus = Number(document.getElementById('walletAdjustBonus').value) || 0;
    if (!walletIsMoney2(deltaBalance) || !walletIsMoney2(deltaBonus)) {
      G.showToast('調整金額最多只可兩位小數（最小 HK$0.01）', 'error');
      return;
    }
    try {
      await walletApi('adjust', {
        patientId: walletSelectedPatientId,
        deltaBalance,
        deltaBonus,
        reason,
        idempotencyKey: newIdempotencyKey('adjust')
      });
      invalidateWalletAccount(walletSelectedPatientId);
      hideWalletAdminForm();
      G.showToast('調整完成', 'success');
      await renderWalletPanel(walletSelectedPatientId, true);
      await syncWalletListEntry(walletSelectedPatientId);
    } catch (error) {
      G.showToast('調整失敗：' + error.message, 'error');
    }
  }

  export function showWalletStatusForm() {
    const f = document.getElementById('walletAdminForm');
    f.classList.remove('hidden');
    f.innerHTML = `
      <h4 class="font-semibold text-gray-800 mb-3">凍結／關閉／復用</h4>
      <div class="mb-3">
        <label class="block text-sm text-gray-600 mb-1">新狀態 *</label>
        <select id="walletStatusSelect" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="active">復用（active）</option>
          <option value="frozen">凍結（frozen）</option>
          <option value="closed">關閉（closed）</option>
        </select>
      </div>
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1">說明（凍結／關閉必填）</label>
        <input type="text" id="walletStatusNote" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
      </div>
      <div class="flex gap-3">
        <button onclick="submitWalletStatus()" class="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm">確認</button>
        <button onclick="hideWalletAdminForm()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm">取消</button>
      </div>`;
  }

  export async function submitWalletStatus() {
    const status = String(document.getElementById('walletStatusSelect').value || '');
    const note = String(document.getElementById('walletStatusNote').value || '');
    try {
      await walletApi('status', {
        patientId: walletSelectedPatientId,
        status,
        note,
        idempotencyKey: newIdempotencyKey('status')
      });
      invalidateWalletAccount(walletSelectedPatientId);
      hideWalletAdminForm();
      G.showToast('狀態已更新', 'success');
      await renderWalletPanel(walletSelectedPatientId, true);
      await syncWalletListEntry(walletSelectedPatientId);
    } catch (error) {
      G.showToast('更新失敗：' + error.message, 'error');
    }
  }

  /* ============================================================
   * 會員設定（clinics/{clinicId}.membershipConfig）
   * 僅診所管理可見可改；直接經 SDK updateDoc（rules 允許員工寫 clinics）
   * ============================================================ */
