/* ============================================================
 * wallet/config.js — 會員配置維護、級距編輯
 * ------------------------------------------------------------
 * Phase 2 自 system.js IIFE 原樣拆分，邏輯零改動；跨檔共享
 * 符號經 ESM import，舊全域存取一律經 G（js/lib/legacy.js）。
 * 會員設定面板已移至「系統管理」頁。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { getWalletClinicDoc } from './account.js';
import { walletClinicDocCache, walletMembershipConfigCache } from './shared.js';

  export async function toggleWalletConfigForm() {
    const form = document.getElementById('walletConfigForm');
    const toggle = document.getElementById('walletConfigToggle');
    if (!form) return;
    if (!form.classList.contains('hidden')) {
      form.classList.add('hidden');
      toggle.textContent = '展開';
      return;
    }
    form.classList.remove('hidden');
    toggle.textContent = '收合';
    await renderWalletConfigForm();
  }

  export function walletTierRowHtml(minAmount, bonus) {
    return `
      <div class="wcfg-tier-row flex flex-col md:flex-row gap-2 items-start md:items-center">
        <div class="flex items-center gap-1">
          <span class="text-xs text-gray-500">充值滿 HK$</span>
          <input type="number" min="0" step="0.01"
            class="wcfg-min w-28 border border-gray-300 rounded-lg px-2 py-1 text-sm"
            value="${window.escapeHtml(String(minAmount == null ? '' : minAmount))}">
        </div>
        <div class="flex items-center gap-1">
          <span class="text-xs text-gray-500">送 HK$</span>
          <input type="number" min="0" step="0.01"
            class="wcfg-bonus w-28 border border-gray-300 rounded-lg px-2 py-1 text-sm"
            value="${window.escapeHtml(String(bonus == null ? '' : bonus))}">
        </div>
        <button type="button" onclick="removeWalletTierRow(this)" class="text-sm text-red-500">移除</button>
      </div>`;
  }

  export function addWalletTierRow() {
    const box = document.getElementById('wcfgTiers');
    if (box) box.insertAdjacentHTML('beforeend', walletTierRowHtml('', ''));
  }

  export function removeWalletTierRow(btn) {
    const row = btn.closest('.wcfg-tier-row');
    if (row) row.remove();
  }

  export async function renderWalletConfigForm() {
    const form = document.getElementById('walletConfigForm');
    const clinic = await getWalletClinicDoc();
    if (!clinic) {
      form.innerHTML = '<div class="text-sm text-red-600">找不到診所文件，請先建立診所。</div>';
      return;
    }
    const cfg = clinic.data.membershipConfig || {};
    const enabled = cfg.enabled !== false;
    const deductFirst = cfg.deductBonusFirst !== false;
    const discountId = String(cfg.discountItemId || '');
    const tiers = Array.isArray(cfg.topupBonusTiers) ? cfg.topupBonusTiers : [];
    const discountItems = (Array.isArray(G.billingItems) ? billingItems : [])
      .filter((b) => b && b.category === 'discount');

    form.innerHTML = `
      <div class="space-y-4">
        <label class="flex items-center text-sm text-gray-800">
          <input type="checkbox" id="wcfgEnabled"
            class="mr-2 h-4 w-4 rounded border-gray-300 text-teal-600"
            ${enabled ? 'checked' : ''}>
          啟用會員功能
        </label>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">會員折扣項目</label>
          <select id="wcfgDiscount" class="w-full md:w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">— 不套用自動折扣 —</option>
            ${discountItems.map((b) => `
              <option value="${window.escapeHtml(String(b.id))}"
                ${String(b.id) === discountId ? 'selected' : ''}>
                ${window.escapeHtml(b.name)}
              </option>`).join('')}
          </select>
          <p class="mt-1 text-xs text-gray-500">只列出 category 為 discount 的收費項目；會員開診單時自動帶入，職員可手動移除。</p>
        </div>
        <label class="flex items-center text-sm text-gray-800">
          <input type="checkbox" id="wcfgDeductFirst"
            class="mr-2 h-4 w-4 rounded border-gray-300 text-teal-600"
            ${deductFirst ? 'checked' : ''}>
          扣款時先扣贈送額
        </label>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">充值贈送級距</label>
          <div id="wcfgTiers" class="space-y-2"></div>
          <button type="button" onclick="addWalletTierRow()"
            class="mt-2 text-sm text-teal-700 underline">+ 新增級距</button>
        </div>
        <div id="wcfgMessage" class="text-sm"></div>
        <div class="flex gap-3">
          <button type="button" onclick="submitWalletConfig()"
            class="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm">儲存設定</button>
        </div>
      </div>`;

    const box = document.getElementById('wcfgTiers');
    box.innerHTML = tiers.map((t) => walletTierRowHtml(t.minAmount, t.bonus)).join('');
  }

  export async function submitWalletConfig() {
    const msg = document.getElementById('wcfgMessage');
    try {
      const clinic = await getWalletClinicDoc();
      if (!clinic) throw new Error('找不到診所文件');
      const enabled = document.getElementById('wcfgEnabled').checked;
      const deductFirst = document.getElementById('wcfgDeductFirst').checked;
      const discountItemId = String(document.getElementById('wcfgDiscount').value || '');
      const tiers = [];
      document.querySelectorAll('#wcfgTiers .wcfg-tier-row').forEach((row) => {
        const minAmount = parseFloat(row.querySelector('.wcfg-min').value);
        const bonus = parseFloat(row.querySelector('.wcfg-bonus').value);
        if (!isNaN(minAmount) && !isNaN(bonus) && minAmount > 0 && bonus > 0) {
          tiers.push({ minAmount, bonus });
        }
      });
      if (discountItemId) {
        const valid = (Array.isArray(G.billingItems) ? billingItems : [])
          .some((b) => String(b.id) === discountItemId && b.category === 'discount');
        if (!valid) throw new Error('所選折扣項目不存在或類型不符');
      }
      const membershipConfig = {
        enabled,
        discountItemId,
        deductBonusFirst: deductFirst,
        topupBonusTiers: tiers
      };
      await window.firebase.updateDoc(
        window.firebase.doc(window.firebase.db, 'clinics', clinic.id),
        { membershipConfig }
      );
      walletClinicDocCache.set(clinic.id, {
        id: clinic.id,
        data: Object.assign({}, clinic.data, { membershipConfig })
      });
      walletMembershipConfigCache.set(clinic.id, membershipConfig);
      msg.textContent = '已儲存';
      msg.className = 'text-sm text-green-600';
      G.showToast('會員設定已儲存', 'success');
    } catch (error) {
      msg.textContent = '儲存失敗：' + error.message;
      msg.className = 'text-sm text-red-600';
    }
  }
