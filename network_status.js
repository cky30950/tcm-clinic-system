/*
 * 網路狀態檢測與提示模組
 *
 * 這個模組移植自原本 system.js 中的網路狀態 IIFE。它監聽瀏覽器的
 * `online`、`offline` 事件以及自定義的 `firebaseConnectionChanged` 事件，
 * 依據瀏覽器與 Firebase 的連線狀態控制覆蓋層的顯示或隱藏。
 *
 * 匯入此模組會立即註冊事件監聽並在 DOMContentLoaded 時初始化網路狀態。
 */

// 記錄當前是否已經處於離線狀態，避免重複提示
let wasOffline = false;

/**
 * 顯示網路離線覆蓋層。
 * 如果覆蓋層不存在則會建立一個新的元素。
 *
 * @param {string} message 要顯示的訊息
 */
function showOfflineOverlay(message) {
  let overlay = document.getElementById('networkOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'networkOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '9999';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.color = '#fff';
    overlay.style.fontSize = '1.5rem';
    overlay.style.textAlign = 'center';
    overlay.style.padding = '20px';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = message;
  overlay.style.display = 'flex';
}

/**
 * 隱藏網路離線覆蓋層。
 */
function hideOfflineOverlay() {
  const overlay = document.getElementById('networkOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * 根據瀏覽器與 Firebase 連線狀態更新 UI。
 * 在離線時顯示覆蓋層與提示；在線上時移除覆蓋層。
 */
function updateNetworkStatus() {
  // 如果尚未取得 Firebase 連線狀態，先只檢查瀏覽器的 online 狀態；避免初始載入階段誤判為離線
  const firebaseReady = window.firebaseStatusInitialized === true;
  const online = navigator.onLine && (firebaseReady ? window.firebaseConnected : true);
  // 當離線且先前未處於離線狀態時處理
  if (!online && !wasOffline) {
    wasOffline = true;
    // 顯示覆蓋層，使用「網絡連線中…」提示文字
    showOfflineOverlay('網絡連線中…');
    // 不再顯示離線彈窗，以免干擾使用者
  } else if (online && wasOffline) {
    // 當重新連線且之前處於離線狀態時處理
    wasOffline = false;
    hideOfflineOverlay();
    // 可在此處進行資料重新載入或其他邏輯
  }
}

// 將更新函式掛至全域，以便其他模組呼叫
window.updateNetworkStatus = updateNetworkStatus;

// 監聽瀏覽器線上/離線事件
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// 監聽 Firebase 連線狀態改變事件
window.addEventListener('firebaseConnectionChanged', updateNetworkStatus);

// 在 DOMContentLoaded 後立即檢測網路狀態
document.addEventListener('DOMContentLoaded', updateNetworkStatus);

// 選擇性匯出函式，方便其他模組導入使用（雖然已掛在 window 上）
export { updateNetworkStatus };