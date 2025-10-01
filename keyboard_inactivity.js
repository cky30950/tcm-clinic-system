/*
 * 全域鍵盤快捷與閒置監控模組
 *
 * 這個模組移植自原先 system.js 中的鍵盤快捷與閒置登出 IIFE。引入此模組後
 * 會立即註冊全域鍵盤監聽器並提供 startInactivityMonitoring() 與
 * stopInactivityMonitoring() 兩個函式來控制閒置監控。
 */

// ======== 全域按鍵處理邏輯 ========
/**
 * 全域鍵盤事件處理函式。
 * 當按下特定按鍵時，依據當前介面與彈窗狀態執行對應操作。
 *
 * @param {KeyboardEvent} ev 鍵盤事件
 */
function handleGlobalKeyDown(ev) {
  const key = ev && ev.key;
  const eventType = ev && ev.type;
  // 只處理特定按鍵
  if (!key || !(['Escape', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(key))) {
    return;
  }
  // 僅在主系統頁面顯示時響應
  const mainSystem = document.getElementById('mainSystem');
  if (!mainSystem || mainSystem.classList.contains('hidden')) {
    return;
  }
  // 收集可視彈窗
  // 預設只選取固定定位 (position: fixed) 的彈窗，並且 ID 包含 "modal"，且未被 Tailwind 的 hidden 類別隱藏。
  // 另外納入排班管理的彈窗（#scheduleManagement .modal.show）以支援 ESC/Enter 快捷操作。
  const modalNodes = [];
  // 選取 .fixed 的彈窗
  document.querySelectorAll('.fixed').forEach(el => modalNodes.push(el));
  // 納入排班管理中的 .modal.show 視窗
  document.querySelectorAll('#scheduleManagement .modal.show').forEach(el => modalNodes.push(el));
  const modals = modalNodes.filter(el => {
    // 排班管理的視窗以 .show 為顯示標記，無需判斷 hidden
    if (el.matches('#scheduleManagement .modal.show')) {
      return true;
    }
    // 其他彈窗需符合條件：未隱藏且 id 名稱含 modal
    const id = (el.id || '').toLowerCase();
    return !el.classList.contains('hidden') && id.includes('modal');
  });
  // 取得事件目標元素，用於判斷是否在可編輯欄位中
  const target = ev.target;
  const tagName = target && target.tagName ? target.tagName.toUpperCase() : '';
  // 將 SELECT 從可編輯輸入排除，讓在下拉選單中按 Enter 也能觸發快捷操作
  const isEditableInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || (target && target.isContentEditable);

  // 處理左右方向鍵：僅在 keydown 階段且病歷或診症記錄彈窗開啟時有效
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    // 只在 keydown 事件處理方向鍵，避免 keypress 重複處理
    if (eventType !== 'keydown') {
      return;
    }
    if (modals.length > 0 && !isEditableInput) {
      const activeModal = modals[modals.length - 1];
      const direction = key === 'ArrowLeft' ? -1 : 1;
      const modalId = activeModal.id || '';
      try {
        if (modalId === 'patientMedicalHistoryModal' && typeof changePatientHistoryPage === 'function') {
          changePatientHistoryPage(direction);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (modalId === 'medicalHistoryModal' && typeof changeConsultationHistoryPage === 'function') {
          changeConsultationHistoryPage(direction);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      } catch (_e) {
        // 若換頁失敗則忽略
      }
    }
    return;
  }

  // 處理 Esc 鍵：僅在 keydown 階段關閉聊天視窗、彈窗或切換側邊欄
  if (key === 'Escape') {
    // 僅處理 keydown，忽略 keypress
    if (eventType !== 'keydown') {
      return;
    }
    // 首先處理聊天彈窗。如果聊天彈窗存在且未隱藏，則優先關閉
    try {
      const chatPopup = document.getElementById('chatPopup');
      if (chatPopup && !chatPopup.classList.contains('hidden')) {
        // 隱藏聊天視窗
        chatPopup.classList.add('hidden');
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    } catch (_e) {
      // 忽略查找或關閉聊天彈窗時的錯誤
    }
    if (modals.length > 0) {
      const modal = modals[modals.length - 1];
      const modalId = modal.id || '';
      // 若為排班管理的排班或固定班視窗，直接調用其關閉函式
      try {
        if (modalId === 'shiftModal' && typeof scheduleCloseModal === 'function') {
          scheduleCloseModal();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (modalId === 'fixedScheduleModal' && typeof scheduleCloseFixedScheduleModal === 'function') {
          scheduleCloseFixedScheduleModal();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      } catch (_e) {
        // ignore errors and continue fallback
      }
      // 嘗試尋找取消/關閉按鈕，避免選中導覽按鈕（如上一頁/下一頁）
      let cancelBtn =
        modal.querySelector('button[id*="cancel" i]') ||
        modal.querySelector('button[id*="hide" i]') ||
        modal.querySelector('button[id*="close" i]') ||
        modal.querySelector('button[onclick*="hide"]') ||
        modal.querySelector('button[onclick*="close"]');
      if (cancelBtn && typeof cancelBtn.click === 'function') {
        cancelBtn.click();
      } else {
        // 若找不到可點擊的關閉按鈕，依彈窗 id 呼叫指定的關閉函式或直接隱藏
        try {
          if (modalId === 'patientDetailModal' && typeof closePatientDetail === 'function') {
            closePatientDetail();
          } else if (modalId === 'patientMedicalHistoryModal' && typeof closePatientMedicalHistoryModal === 'function') {
            closePatientMedicalHistoryModal();
          } else if (modalId === 'medicalHistoryModal' && typeof closeMedicalHistoryModal === 'function') {
            closeMedicalHistoryModal();
          } else if (modalId === 'registrationModal' && typeof closeRegistrationModal === 'function') {
            closeRegistrationModal();
          } else {
            // 對於排班管理模態框以外的固定定位彈窗，可嘗試用 Tailwind 的 hidden 類關閉
            modal.classList.add('hidden');
          }
        } catch (_e) {
          // 若調用關閉函式失敗，直接隱藏
          modal.classList.add('hidden');
        }
      }
      ev.preventDefault();
      ev.stopPropagation();
    } else {
      // 無彈窗時切換側邊欄：開啟或關閉
      const sidebar = document.getElementById('sidebar');
      if (sidebar && typeof toggleSidebar === 'function') {
        toggleSidebar();
        ev.preventDefault();
        ev.stopPropagation();
      }
    }
    return;
  }

  // 處理 Enter 鍵：在彈窗中觸發主要操作。僅在 keypress 階段處理，避免在 keydown 重複觸發。
  if (key === 'Enter') {
    // 僅處理 keypress 事件，忽略 keydown 以避免重複觸發
    if (eventType !== 'keypress') {
      return;
    }
    // 沒有彈窗時無需處理
    if (modals.length === 0) {
      return;
    }
    const modal = modals[modals.length - 1];
    const modalId = modal.id || '';
    // 若為掛號彈窗，直接執行 confirmRegistration（即使焦點在下拉選單中）
    if (modalId === 'registrationModal' && typeof confirmRegistration === 'function') {
      try {
        confirmRegistration();
      } catch (_e) {
        // 忽略錯誤
      }
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    // 排班管理彈窗：shiftModal 與 fixedScheduleModal
    // 按 Enter 時直接執行新增或建立，無論焦點是否在下拉選單中。
    try {
      if (modalId === 'shiftModal' && typeof scheduleAddShift === 'function') {
        scheduleAddShift();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (modalId === 'fixedScheduleModal' && typeof scheduleCreateFixedSchedule === 'function') {
        scheduleCreateFixedSchedule();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    } catch (_e) {
      // 忽略調用錯誤，繼續以下邏輯
    }
    // 在其他可編輯輸入（如 INPUT/TEXTAREA/contentEditable）中，不攔截 Enter
    if (isEditableInput) {
      return;
    }
    // 一般彈窗：尋找主要確認按鈕
    const buttons = Array.from(modal.querySelectorAll('button')).filter(btn => !btn.disabled && btn.offsetParent !== null);
    let confirmBtn = null;
    // 優先根據 id 或 onclick 屬性匹配 save/confirm/apply/ok 或包含 confirm
    confirmBtn = buttons.find(btn => {
      const idAttr = btn.id || '';
      const onclickAttr = (btn.getAttribute && btn.getAttribute('onclick')) || '';
      return /save|confirm|apply|ok/i.test(idAttr) || /confirm/i.test(onclickAttr);
    });
    if (!confirmBtn) {
      // 再以按鈕文字匹配常見中文文案
      confirmBtn = buttons.find(btn => {
        const text = (btn.textContent || '').trim();
        return /儲存|保存|更新|確定|套用|新增|確認|掛號/.test(text);
      });
    }
    if (!confirmBtn) {
      // 取第一個背景非灰色按鈕
      confirmBtn = buttons.find(btn => !/bg-gray/.test(btn.className || ''));
    }
    if (!confirmBtn && buttons.length > 0) {
      // 最後退而求其次取最後一個按鈕
      confirmBtn = buttons[buttons.length - 1];
    }
    if (confirmBtn && typeof confirmBtn.click === 'function') {
      confirmBtn.click();
      ev.preventDefault();
      ev.stopPropagation();
    }
    return;
  }
}

// 註冊全域鍵盤監聽
// 使用 capture 階段並同時監聽 keydown 與 keypress，以便在某些表單元件（如 <select>）中
// 按下 Enter 時仍能捕捉事件。對於不同事件類型使用同一處理函式。
document.addEventListener('keydown', handleGlobalKeyDown, true);
document.addEventListener('keypress', handleGlobalKeyDown, true);

// ======== 閒置自動登出邏輯 ========
// 閒置時間限制（毫秒），預設為 30 分鐘
const INACTIVITY_LIMIT = 30 * 60 * 1000;
let inactivityTimeoutId = null;
let activityHandler = null;
const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];

/**
 * 重置閒置計時器。
 * 每次偵測到使用者互動時呼叫此函式，重新計時。
 */
function resetInactivityTimer() {
  if (inactivityTimeoutId) {
    clearTimeout(inactivityTimeoutId);
  }
  inactivityTimeoutId = setTimeout(() => {
    try {
      // 到達閒置時間後自動登出
      if (typeof showToast === 'function') {
        const lang = localStorage.getItem('lang') || 'zh';
        const zhMsg = '閒置時間過長，自動登出';
        const enMsg = 'Logged out due to inactivity';
        showToast(lang === 'en' ? enMsg : zhMsg, 'warning');
      }
      if (typeof logout === 'function') {
        logout();
      }
    } catch (e) {
      console.error('自動登出時發生錯誤:', e);
    }
  }, INACTIVITY_LIMIT);
}

/**
 * 開始閒置監控。在登入後調用此函式啟用閒置計時。
 */
function startInactivityMonitoring() {
  stopInactivityMonitoring();
  activityHandler = function() {
    resetInactivityTimer();
  };
  activityEvents.forEach(evt => {
    document.addEventListener(evt, activityHandler);
  });
  resetInactivityTimer();
}

/**
 * 停止閒置監控。在登出後調用此函式關閉閒置計時。
 */
function stopInactivityMonitoring() {
  if (activityHandler) {
    activityEvents.forEach(evt => {
      document.removeEventListener(evt, activityHandler);
    });
    activityHandler = null;
  }
  if (inactivityTimeoutId) {
    clearTimeout(inactivityTimeoutId);
    inactivityTimeoutId = null;
  }
}

// 將控制函式掛到 window，使其可被外部調用
window.startInactivityMonitoring = startInactivityMonitoring;
window.stopInactivityMonitoring = stopInactivityMonitoring;

// 選擇性匯出函式，方便其他模組導入使用
export { startInactivityMonitoring, stopInactivityMonitoring };