/* ============================================================
 * wallet/account.js — 帳戶讀取、會員配置、紅利計算、交易查詢、診所文件快取
 * ------------------------------------------------------------
 * Phase 2 自 system.js IIFE 原樣拆分，邏輯零改動；跨檔共享
 * 符號經 ESM import，舊全域存取一律經 G（js/lib/legacy.js）。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { currentWalletClinicId, walletAccountCache, walletAccountDocId, walletCacheKey, walletClinicDocCache, walletMembershipConfigCache, walletRound2 } from './shared.js';

  /**
   * 讀取病人在「指定診所」的儲值帳戶（SDK 單文件，session Map 快取）。
   * @param {string} patientId 病人 ID
   * @param {boolean} force 強制重讀
   * @param {string} [clinicId] 診所 ID，預設為目前選取診所
   * 無帳戶回 null。
   */
  export async function getWalletAccount(patientId, force = false, clinicId = '') {
    const cid = clinicId || currentWalletClinicId();
    const key = walletCacheKey(cid, patientId);
    if (!force && walletAccountCache.has(key)) {
      return walletAccountCache.get(key);
    }
    const snap = await window.firebase.getDoc(
      window.firebase.doc(
        window.firebase.db,
        'patientWalletAccounts',
        walletAccountDocId(cid, patientId)
      )
    );
    const account = snap.exists()
      ? Object.assign({ id: snap.id }, snap.data())
      : null;
    walletAccountCache.set(key, account);
    return account;
  }

  export function invalidateWalletAccount(patientId, clinicId = '') {
    const cid = clinicId || (() => {
        try { return currentWalletClinicId(); } catch (_e) { return ''; }
      })();
    if (cid) walletAccountCache.delete(walletCacheKey(cid, patientId));
  }

  /** 可用餘額（僅 active 帳戶） */
  /** 可用餘額（僅 active 帳戶） */
  export function walletAvailable(account) {
    if (!account || account.status !== 'active') return 0;
    return walletRound2(
      (Number(account.balance) || 0) + (Number(account.bonusBalance) || 0)
    );
  }

  /**
   * 指定診所的會員配置（clinics/{cid}.membershipConfig），每診所獨立快取。
   */
  /**
   * 指定診所的會員配置（clinics/{cid}.membershipConfig），每診所獨立快取。
   */
  export async function getWalletMembershipConfig(clinicId = '') {
    const cid = clinicId || currentWalletClinicId();
    if (walletMembershipConfigCache.has(cid)) {
      return walletMembershipConfigCache.get(cid);
    }
    let cfg = { topupBonusTiers: [] };
    try {
      const clinic = await getWalletClinicDoc(false, cid);
      if (clinic && clinic.data && clinic.data.membershipConfig) {
        cfg = clinic.data.membershipConfig;
      }
    } catch (_e) { /* 取不到則用預設空配置 */ }
    if (!Array.isArray(cfg.topupBonusTiers)) cfg.topupBonusTiers = [];
    walletMembershipConfigCache.set(cid, cfg);
    return cfg;
  }

  export function walletBonusFor(config, amount) {
    const tiers = config && Array.isArray(config.topupBonusTiers)
      ? config.topupBonusTiers
      : [];
    const sorted = tiers
      .map((t) => ({
        minAmount: Number(t && t.minAmount),
        bonus: Number(t && t.bonus)
      }))
      .filter((t) => t.minAmount > 0 && t.bonus > 0)
      .sort((a, b) => b.minAmount - a.minAmount);
    const hit = sorted.find((t) => amount >= t.minAmount);
    return hit ? hit.bonus : 0;
  }

  /**
   * 載入病人在指定診所的近期流水。
   * 走 SA 端點 /api/wallet/account：SDK 直接查 patientWalletTransactions
   * 會跨診所取回該病人全部流水，在員工跨診所隔離規則下會被整筆查詢
   * 拒絕，故由後端以診所維度過濾後回傳（後端用 (patientId,clinicId,at)
   * 複合索引直接 limit；最近 50 筆，病人詳情面板 10 筆）。
   */
  /**
   * 載入病人在指定診所的近期流水。
   * 走 SA 端點 /api/wallet/account：SDK 直接查 patientWalletTransactions
   * 會跨診所取回該病人全部流水，在員工跨診所隔離規則下會被整筆查詢
   * 拒絕，故由後端以診所維度過濾後回傳（後端用 (patientId,clinicId,at)
   * 複合索引直接 limit；最近 50 筆，病人詳情面板 10 筆）。
   */
  export async function loadWalletTransactions(patientId, clinicId = '', limit = 0) {
    await G.waitForFirebase();
    const fbUser = window.firebase.auth && window.firebase.auth.currentUser;
    if (!fbUser) throw new Error('未登入，無法讀取儲值記錄');
    const cid = clinicId || currentWalletClinicId();
    let qs = '?patientId=' + encodeURIComponent(String(patientId))
      + '&clinicId=' + encodeURIComponent(String(cid));
    // 顯式限制筆數（病人詳情面板僅需最近 10 筆，縮減回傳量）
    const n = Number.parseInt(limit, 10);
    if (Number.isFinite(n) && n > 0) {
      qs += '&limit=' + encodeURIComponent(String(Math.min(50, Math.max(1, n))));
    }
    const token = await fbUser.getIdToken();
    const res = await fetch('/api/wallet/account' + qs, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    let data = null;
    try { data = await res.json(); } catch (_e) {}
    if (!res.ok) {
      throw new Error((data && data.message) || ('HTTP ' + res.status));
    }
    return Array.isArray(data && data.transactions) ? data.transactions : [];
  }

  // ── 管理區塊 ──

  /* ============================================================
   * 左欄會員列表
   * 預設：列出總餘額（本金＋贈送額）> 0 的會員
   * 搜尋：複用 firebaseDataManager.searchPatients（姓名／編號／電話）
   * ============================================================ */
  /* ============================================================
   * 會員設定（clinics/{clinicId}.membershipConfig）
   * 僅診所管理可見可改；直接經 SDK updateDoc（rules 允許員工寫 clinics）
   * ============================================================ */
  export async function getWalletClinicDoc(force = false, clinicId = '') {
    const cid = clinicId || currentWalletClinicId();
    if (!force && walletClinicDocCache.has(cid)) {
      return walletClinicDocCache.get(cid);
    }
    const snap = await window.firebase.getDoc(
      window.firebase.doc(window.firebase.db, 'clinics', cid)
    );
    const found = snap.exists() ? { id: snap.id, data: snap.data() || {} } : null;
    walletClinicDocCache.set(cid, found);
    return found;
  }

  // 病人詳情面板用：取指定診所最近 N 筆交易（預設 5）
  export const getRecentWalletTransactions = (patientId, clinicId, limit = 5) =>
    loadWalletTransactions(patientId, clinicId || '', limit);

  /* ============================================================
   * 診症表單整合：會員自動折扣 + 儲值餘額支付
   * ------------------------------------------------------------
   * setupConsultationWallet：開表單時讀帋戶與會員設定
   * processConsultationWalletPayment：病歷保存後扣款（冪等）
   * 扣款失敗保留表單，提供重試／取消按鈕
   * ============================================================ */
