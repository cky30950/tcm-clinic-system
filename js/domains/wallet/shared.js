/* ============================================================
 * wallet/shared.js — 共用層：session 快取／標籤常數／walletApi 封裝／金額工具
 * ------------------------------------------------------------
 * Phase 2 自 system.js IIFE 原樣拆分，邏輯零改動；跨檔共享
 * 符號經 ESM import，舊全域存取一律經 G（js/lib/legacy.js）。
 * ============================================================ */
import { G } from '../../lib/legacy.js';

  // 帳戶快取 key 為「診所__病人」，確保切換診所後互不串用
  export const walletAccountCache = new Map();
  export const walletClinicDocCache = new Map(); // cid → clinics/{cid}
  export const walletMembershipConfigCache = new Map(); // cid → membershipConfig
  /**
   * 目前操作的診所 ID（員工帳號僅隸屬單一診所；超管可切換）。
   * 【暫時政策 2026-09】過渡期內所有員工可操作所有診所，故一律使用
   * UI 頂部選取的診所；日後員工診所對應表整理好後，再恢復「繫結員工
   * 強制以 currentUserClaims.clinicId 為準」的版本。
   */
  export function currentWalletClinicId() {
    let cid = '';
    try {
      cid = (typeof G.currentClinicId !== 'undefined' && G.currentClinicId)
        ? String(G.currentClinicId)
        : (localStorage.getItem('currentClinicId') || '');
    } catch (_e) {
      cid = '';
    }
    if (!cid || cid === 'local-default') {
      throw new Error('尚未選擇診所，請先切換至正確診所再操作儲值功能');
    }
    return cid;
  }

  /** 與後端一致的帳戶文件 ID 規則：{clinicId}__{patientId} */
  /** 與後端一致的帳戶文件 ID 規則：{clinicId}__{patientId} */
  export function walletAccountDocId(clinicId, patientId) {
    return String(clinicId) + '__' + String(patientId);
  }

  export function walletCacheKey(clinicId, patientId) {
    return String(clinicId) + '__' + String(patientId);
  }

  /** 切換診所／登出時清空錢包 session 快取 */
  /** 切換診所／登出時清空錢包 session 快取 */
  export function clearWalletCaches() {
    walletAccountCache.clear();
    walletClinicDocCache.clear();
    walletMembershipConfigCache.clear();
  }

  export const WALLET_TYPE_LABELS = {
    topup: '充值',
    topupBonus: '充值贈送',
    payment: '看診付款',
    refund: '退款',
    adjust: '調整',
    statusChange: '狀態變更'
  };
  // 充值收款方式（與後端 TOPUP_PAYMENT_METHODS 白名單一致）
  // 充值收款方式（與後端 TOPUP_PAYMENT_METHODS 白名單一致）
  export const WALLET_METHOD_LABELS = {
    cash: '現金',
    fps: '轉數快',
    eps: 'EPS',
    card: '信用卡',
    cheque: '支票',
    other: '其他'
  };
  export const WALLET_STATUS_LABELS = {
    active: '運作中',
    frozen: '已凍結',
    closed: '已關閉'
  };

  export function walletRound2(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  // 金額位數把關：必須為有限數字且最多兩位小數（與後端 requireMoney2 對應，
  // epsilon 容忍 1.11*100＝110.999… 之類的浮點誤差）
  // 金額位數把關：必須為有限數字且最多兩位小數（與後端 requireMoney2 對應，
  // epsilon 容忍 1.11*100＝110.999… 之類的浮點誤差）
  export function walletIsMoney2(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    const cents = n * 100;
    return Math.abs(cents - Math.round(cents)) <= 1e-6;
  }

  export function newIdempotencyKey(prefix) {
    return prefix + ':' + Date.now().toString(36)
      + ':' + Math.random().toString(36).slice(2, 10);
  }

  export async function walletApi(path, payload) {
    await G.waitForFirebase();
    const fbUser = window.firebase.auth && window.firebase.auth.currentUser;
    if (!fbUser) throw new Error('未登入，無法操作儲值功能');
    const body = Object.assign({}, payload || {});
    // 每筆寫入都帶診所；後端對隸屬單一診所的員工仍以 token claim 鎖定
    if (!body.clinicId) body.clinicId = currentWalletClinicId();
    const token = await fbUser.getIdToken();
    const res = await fetch('/api/wallet/' + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    let data = null;
    try { data = await res.json(); } catch (_e) {}
    if (!res.ok) {
      // 保留後端錯誤碼（如 WALLET_ALREADY_PAID），讓呼叫端可區分語意
      const err = new Error((data && data.message) || ('HTTP ' + res.status));
      err.status = res.status;
      if (data && data.error) err.code = data.error;
      throw err;
    }
    return data || {};
  }

  /**
   * 讀取病人在「指定診所」的儲值帳戶（SDK 單文件，session Map 快取）。
   * @param {string} patientId 病人 ID
   * @param {boolean} force 強制重讀
   * @param {string} [clinicId] 診所 ID，預設為目前選取診所
   * 無帳戶回 null。
   */
