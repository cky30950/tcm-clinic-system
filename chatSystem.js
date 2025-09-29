// chatSystem.js
// 內部聊天系統腳本
// 這個模組負責在系統主頁面中初始化一個簡易的一對一聊天功能。
// 它使用 Firebase Realtime Database 來儲存訊息與使用者在線狀態。
// 當使用者登入後，系統會透過 performLogin 呼叫 window.initChatSystem() 來初始化聊天系統。

(function () {
  let initialized = false;

  /**
   * 取得顯示名稱，如果系統有 getUserDisplayName 函式則使用它。
   * @param {Object} user 用戶資料
   * @returns {string} 顯示名稱
   */
  function getDisplayName(user) {
    if (!user) return '';
    if (typeof window.getUserDisplayName === 'function') {
      try {
        return window.getUserDisplayName(user) || user.username || user.email || '';
      } catch (e) {
        // 忽略取得名稱時的錯誤
      }
    }
    return user.username || user.email || '';
  }

  /**
   * 將文字做 HTML escape，避免在訊息中注入 HTML。  
   * @param {string} text 
   * @returns {string}
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 隨機為用戶產生顏色，依序挑選預定義顏色列表。
   * 這可讓不同用戶的頭像顏色有區別。
   * @param {number} index 用戶在列表中的索引
   * @returns {string}
   */
  function getColorByIndex(index) {
    const colors = [
      'bg-green-500',
      'bg-purple-500',
      'bg-yellow-500',
      'bg-pink-500',
      'bg-red-500',
      'bg-teal-500',
      'bg-orange-500',
      'bg-indigo-500',
      'bg-rose-500'
    ];
    return colors[index % colors.length];
  }

  /**
   * 初始化聊天系統。這會建立 UI 事件、載入用戶列表、監聽存在狀態與訊息。
   * 此函式會掛在 window 下，供 performLogin 調用。
   */
  window.initChatSystem = function initChatSystem() {
    // 若已經初始化過，則直接返回
    if (initialized) {
      return;
    }
    initialized = true;

    // 取得 DOM 元件
    const chatToggleButton = document.getElementById('chatToggleButton');
    const chatPopup = document.getElementById('chatPopup');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const userListEl = document.getElementById('chatUserList');
    const chatMessagesEl = document.getElementById('chatMessages');
    const messageInput = document.getElementById('chatMessageInput');
    const messageForm = document.getElementById('chatMessageForm');
    const sendBtn = document.getElementById('chatSendBtn');
    const charCountEl = document.getElementById('chatCharCount');
    const connectionDot = document.getElementById('chatConnectionDot');
    const onlineCountEl = document.getElementById('chatOnlineCount');
    // 拖曳區域（標題）
    const chatPopupHeader = document.getElementById('chatPopupHeader');

    if (!chatToggleButton || !chatPopup || !userListEl || !chatMessagesEl || !messageInput || !messageForm || !sendBtn) {
      console.warn('聊天系統初始化失敗：找不到必要的 DOM 元件');
      return;
    }

    /**
     * 設定聊天視窗可拖曳
     * 透過點擊標題區（chatPopupHeader）觸發拖曳行為，
     * 在拖曳開始時將原本的 bottom/right 定位改為 top/left，
     * 接著在滑鼠移動過程中更新 left/top 以實現自由移動。
     */
    if (chatPopup && chatPopupHeader) {
      let isDraggingWindow = false;
      let dragOffsetX = 0;
      let dragOffsetY = 0;

      const onMouseMove = (e) => {
        if (!isDraggingWindow) return;
        let newLeft = e.clientX - dragOffsetX;
        let newTop = e.clientY - dragOffsetY;
        // 限制拖曳範圍不得超出視窗
        const maxLeft = window.innerWidth - chatPopup.offsetWidth;
        const maxTop = window.innerHeight - chatPopup.offsetHeight;
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop > maxTop) newTop = maxTop;
        chatPopup.style.left = `${newLeft}px`;
        chatPopup.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        if (!isDraggingWindow) return;
        isDraggingWindow = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      chatPopupHeader.addEventListener('mousedown', (e) => {
        // 僅限左鍵拖曳
        if (e.button !== 0) return;
        isDraggingWindow = true;
        const rect = chatPopup.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        // 將初始定位從 bottom/right 轉為 top/left，保留當前位置
        chatPopup.style.right = 'auto';
        chatPopup.style.bottom = 'auto';
        chatPopup.style.left = `${rect.left}px`;
        chatPopup.style.top = `${rect.top}px`;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }

    // 從 Firebase 取得必要函式
    const firebase = window.firebase || {};
    const rtdb = firebase.rtdb;
    const ref = firebase.ref;
    const set = firebase.set;
    const onValue = firebase.onValue;
    const off = firebase.off;
    if (!rtdb || !ref || !set || !onValue || !off) {
      console.warn('聊天系統初始化失敗：Firebase Realtime Database 未就緒');
      return;
    }

    // 取得當前使用者 UID
    let currentUid = null;
    if (window.currentUserData && window.currentUserData.uid) {
      currentUid = window.currentUserData.uid;
    } else if (firebase.auth && firebase.auth.currentUser && firebase.auth.currentUser.uid) {
      currentUid = firebase.auth.currentUser.uid;
    }
    if (!currentUid) {
      console.warn('聊天系統初始化失敗：無法取得當前使用者 UID');
      return;
    }

    // 取得當前使用者顯示名稱
    let currentDisplayName = getDisplayName(window.currentUserData);
    if (!currentDisplayName) {
      currentDisplayName = currentUid;
    }

    // 狀態管理
    let selectedUid = null;            // 目前正在聊天的對象 UID
    let messagesUnsub = null;          // 訊息監聽解除函式
    let presenceUnsub = null;          // 線上狀態監聽解除函式
    const userColorMap = {};           // 用於映射用戶 UID 到色彩類別
    let usersList = [];                // 會顯示在聊天側欄的用戶列表

    /**
     * 加入/移除 UI 的顯示/隱藏。
     */
    function toggleChat() {
      if (chatPopup.classList.contains('hidden')) {
        chatPopup.classList.remove('hidden');
        // 開啟聊天時自動捲至底部
        scrollToBottom();
      } else {
        chatPopup.classList.add('hidden');
      }
    }

    // 綁定開關按鈕
    chatToggleButton.addEventListener('click', () => {
      toggleChat();
    });
    // 關閉按鈕
    closeChatBtn.addEventListener('click', () => {
      chatPopup.classList.add('hidden');
    });

    /**
     * 更新輸入框字元數統計。
     */
    function updateCharCount() {
      const count = messageInput.value.length;
      if (charCountEl) {
        charCountEl.textContent = `${count}/500`;
        // 依照剩餘字元數改變顏色
        if (count > 450) {
          charCountEl.className = 'text-xs text-red-500';
        } else if (count > 400) {
          charCountEl.className = 'text-xs text-yellow-500';
        } else {
          charCountEl.className = 'text-xs text-gray-400';
        }
      }
    }

    /**
     * 根據訊息內容啟用或停用送出按鈕。
     */
    function toggleSendButton() {
      const hasText = messageInput.value.trim().length > 0;
      sendBtn.disabled = !hasText || !selectedUid;
    }

    /**
     * 自動調整 textarea 的高度，使其符合內容。
     */
    function autoResize() {
      messageInput.style.height = 'auto';
      const maxHeight = 120;
      const newHeight = Math.min(messageInput.scrollHeight, maxHeight);
      messageInput.style.height = `${newHeight}px`;
    }

    /**
     * 將訊息區捲至最底部。
     */
    function scrollToBottom() {
      try {
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      } catch (_e) {
        // 忽略
      }
    }

    // 輸入事件與送出事件綁定
    messageInput.addEventListener('input', () => {
      updateCharCount();
      toggleSendButton();
      autoResize();
    });
    // 按下 Enter（不含 Shift）送出訊息
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (messageInput.value.trim()) {
          sendCurrentMessage();
        }
      }
    });
    // 表單提交送出
    messageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (messageInput.value.trim()) {
        sendCurrentMessage();
      }
    });

    /**
     * 當切換聊天對象時，更新 UI 並重新監聽訊息。
     * @param {string} uid 對方 UID
     */
    function selectUser(uid) {
      if (!uid || uid === selectedUid) {
        return;
      }
      selectedUid = uid;
      // 更新送出按鈕狀態
      toggleSendButton();
      // 高亮選擇的用戶
      Array.from(userListEl.children).forEach((item) => {
        if (item.dataset.uid === uid) {
          item.classList.add('bg-blue-100');
        } else {
          item.classList.remove('bg-blue-100');
        }
      });
      // 清空訊息內容
      chatMessagesEl.innerHTML = '';
      // 解除前一個訊息監聽器
      if (typeof messagesUnsub === 'function') {
        try {
          messagesUnsub();
        } catch (_e) {
          // 忽略
        }
        messagesUnsub = null;
      }
      // 設置新的監聽
      const chatId = currentUid < uid ? `${currentUid}_${uid}` : `${uid}_${currentUid}`;
      const messagesRef = ref(rtdb, `messages/${chatId}`);
      messagesUnsub = onValue(messagesRef, (snapshot) => {
        const data = snapshot.val() || {};
        const msgArray = Object.values(data);
        // 更新該用戶的最後訊息時間並重新排序
        if (msgArray && msgArray.length > 0) {
          const last = msgArray[msgArray.length - 1];
          const lastTs = last && last.timestamp;
          if (lastTs && typeof lastTs === 'number') {
            const target = usersList.find((u) => u && u.uid === uid);
            if (target) {
              target.lastChat = lastTs;
              reorderList();
            }
          }
        }
        renderMessages(msgArray);
      });
    }

    /**
     * 將訊息資料陣列呈現在聊天視圖中。
     * @param {Array} msgArray
     */
    function renderMessages(msgArray) {
      // 依照時間排序
      msgArray.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      chatMessagesEl.innerHTML = '';
      msgArray.forEach((msg) => {
        const isCurrent = msg.sender === currentUid;
        const senderName = getDisplayName(usersList.find(u => u.uid === msg.sender) || (msg.sender === currentUid ? window.currentUserData : null)) || msg.sender;
        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '';
        const colorClass = msg.sender === currentUid ? 'bg-blue-500' : (userColorMap[msg.sender] || 'bg-gray-500');
        const initials = senderName ? senderName.charAt(0) : '';
        const wrapper = document.createElement('div');
        wrapper.className = 'message-animation';
        if (isCurrent) {
          wrapper.innerHTML = `
            <div class="flex items-start space-x-3 justify-end">
              <div class="flex-1 flex flex-col items-end">
                <div class="flex items-center space-x-2 mb-1">
                  <span class="text-xs text-gray-500">${timeStr}</span>
                  <span class="font-medium text-sm text-gray-700">${escapeHtml(senderName)}</span>
                </div>
                <div class="bg-blue-500 text-white rounded-2xl rounded-tr-md px-4 py-2 max-w-xs break-words">
                  <p class="text-sm">${escapeHtml(msg.text || '')}</p>
                </div>
              </div>
              <div class="w-8 h-8 ${colorClass} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">${escapeHtml(initials)}</div>
            </div>
          `;
        } else {
          wrapper.innerHTML = `
            <div class="flex items-start space-x-3">
              <div class="w-8 h-8 ${colorClass} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">${escapeHtml(initials)}</div>
              <div class="flex-1">
                <div class="flex items-center space-x-2 mb-1">
                  <span class="font-medium text-sm text-gray-700">${escapeHtml(senderName)}</span>
                  <span class="text-xs text-gray-500">${timeStr}</span>
                </div>
                <div class="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-2 max-w-xs break-words">
                  <p class="text-sm text-gray-800">${escapeHtml(msg.text || '')}</p>
                </div>
              </div>
            </div>
          `;
        }
        chatMessagesEl.appendChild(wrapper);
      });
      scrollToBottom();
    }

    /**
     * 發送當前訊息。當前目標由 selectedUid 指定。
     */
    function sendCurrentMessage() {
      if (!selectedUid) {
        return;
      }
      const text = (messageInput.value || '').trim();
      if (!text) {
        return;
      }
      const ts = Date.now();
      const chatId = currentUid < selectedUid ? `${currentUid}_${selectedUid}` : `${selectedUid}_${currentUid}`;
      const msg = {
        sender: currentUid,
        receiver: selectedUid,
        text: text,
        timestamp: ts
      };
      // 將訊息寫入資料庫，以時間戳作為鍵
      const msgRef = ref(rtdb, `messages/${chatId}/${ts}`);
      set(msgRef, msg).catch((err) => {
        console.error('發送訊息失敗:', err);
      });
      // 清空輸入框
      messageInput.value = '';
      updateCharCount();
      toggleSendButton();
      autoResize();

      // 更新選中對象的最後聊天時間並重新排序用戶列表
      try {
        const target = usersList.find((u) => u && u.uid === selectedUid);
        if (target) {
          target.lastChat = ts;
          reorderList();
        }
      } catch (_err) {
        // 忽略更新列表的錯誤
      }
    }

    /**
     * 讀取所有用戶並渲染於列表。僅包含啟用用戶且排除自己。
     */
    /**
     * 重新渲染用戶列表，根據 usersList 的順序生成 DOM。這個函式會保留選取狀態。
     */
    function renderUserList() {
      userListEl.innerHTML = '';
      usersList.forEach((u) => {
        const displayName = getDisplayName(u);
        const initials = displayName ? displayName.charAt(0) : '';
        const colorCls = userColorMap[u.uid] || 'bg-gray-500';
        const item = document.createElement('div');
        item.dataset.uid = u.uid;
        // 選中目標需套用背景色
        const isSelected = selectedUid && selectedUid === u.uid;
        item.className = 'flex items-center space-x-2 p-2 bg-white hover:bg-gray-100 cursor-pointer text-sm' + (isSelected ? ' bg-blue-100' : '');
        item.innerHTML = `
          <div class="w-8 h-8 ${colorCls} rounded-full flex items-center justify-center text-white text-sm font-bold">${escapeHtml(initials)}</div>
          <span class="truncate">${escapeHtml(displayName)}</span>
          <div class="w-2 h-2 rounded-full ml-auto bg-gray-400" data-status-dot></div>
        `;
        item.addEventListener('click', () => {
          selectUser(u.uid);
        });
        userListEl.appendChild(item);
      });
    }

    /**
     * 根據 lastChat 屬性重新排序 usersList，並重新渲染列表。
     */
    function reorderList() {
      usersList.sort((a, b) => {
        const tA = typeof a.lastChat === 'number' ? a.lastChat : 0;
        const tB = typeof b.lastChat === 'number' ? b.lastChat : 0;
        if (tA === tB) {
          // 若時間相同，依照顯示名稱排序
          const nameA = getDisplayName(a);
          const nameB = getDisplayName(b);
          return nameA.localeCompare(nameB, 'zh-Hant-u-ca-roc-tw');
        }
        return tB - tA;
      });
      renderUserList();
    }

    /**
     * 從 Firebase 中載入用戶列表並取得每個對話的最後訊息時間，最後渲染列表。
     * 這個函式會將 usersList 更新為包含 lastChat 屬性。
     */
    async function loadUsers() {
      const allUsers = Array.isArray(window.users) ? window.users : [];
      usersList = allUsers.filter((u) => {
        return u && u.uid && u.uid !== currentUid && (u.active !== false);
      });
      // 為用戶指定顏色
      usersList.forEach((u, idx) => {
        userColorMap[u.uid] = getColorByIndex(idx);
      });
      // 計算每個用戶與當前用戶之間最後的對話時間
      const fetchPromises = usersList.map(async (u) => {
        const chatId = currentUid < u.uid ? `${currentUid}_${u.uid}` : `${u.uid}_${currentUid}`;
        try {
          const snap = await firebase.get(ref(rtdb, `messages/${chatId}`));
          let last = 0;
          if (snap && snap.exists()) {
            const data = snap.val() || {};
            for (const key in data) {
              const msg = data[key];
              const ts = msg && msg.timestamp;
              if (ts && typeof ts === 'number' && ts > last) {
                last = ts;
              }
            }
          }
          u.lastChat = last;
        } catch (_err) {
          u.lastChat = 0;
        }
      });
      try {
        await Promise.all(fetchPromises);
      } catch (_e) {
        // 忽略任何錯誤
      }
      // 依照最後對話時間排序
      usersList.sort((a, b) => {
        const tA = typeof a.lastChat === 'number' ? a.lastChat : 0;
        const tB = typeof b.lastChat === 'number' ? b.lastChat : 0;
        if (tA === tB) {
          const nameA = getDisplayName(a);
          const nameB = getDisplayName(b);
          return nameA.localeCompare(nameB, 'zh-Hant-u-ca-roc-tw');
        }
        return tB - tA;
      });
      renderUserList();
    }

    /**
     * 更新列表中的用戶在線狀態，並更新統計。
     * @param {Object} presenceData 從 Firebase 取得的 presence 對象。
     */
    function updatePresenceUI(presenceData) {
      let onlineCount = 0;
      // 更新每個用戶
      Array.from(userListEl.children).forEach((item) => {
        const uid = item.dataset.uid;
        const dot = item.querySelector('[data-status-dot]');
        const isOnline = presenceData && presenceData[uid];
        if (dot) {
          if (isOnline) {
            dot.classList.remove('bg-gray-400');
            dot.classList.add('bg-green-400');
            onlineCount++;
          } else {
            dot.classList.remove('bg-green-400');
            dot.classList.add('bg-gray-400');
          }
        }
      });
      // 更新標題區的在線狀態與數量
      if (connectionDot) {
        const selfOnline = presenceData && presenceData[currentUid];
        if (selfOnline) {
          connectionDot.classList.remove('bg-gray-400');
          connectionDot.classList.add('bg-green-400');
        } else {
          connectionDot.classList.remove('bg-green-400');
          connectionDot.classList.add('bg-gray-400');
        }
      }
      if (onlineCountEl) {
        onlineCountEl.textContent = `${onlineCount} 人在線`;
      }
    }

    // 為當前用戶設定在線狀態，當頁面離開時將其標記為離線
    const presenceRef = ref(rtdb, `presence/${currentUid}`);
    set(presenceRef, true).catch(() => {});
    window.addEventListener('beforeunload', () => {
      try {
        set(presenceRef, false);
      } catch (_e) {
        // 忽略
      }
    });

    // 監聽 presence 變化
    presenceUnsub = onValue(ref(rtdb, 'presence'), (snapshot) => {
      const presenceData = snapshot.val() || {};
      updatePresenceUI(presenceData);
    });

    // 載入用戶列表（含最後聊天時間）
    loadUsers().catch(() => {});
    // 初始字數統計與送出按鈕狀態
    updateCharCount();
    toggleSendButton();
    autoResize();
  };
})();