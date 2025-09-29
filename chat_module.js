// Chat Module for internal messaging with group and private channels
// This module dynamically creates a chat UI within the application once a user logs in.
// It manages online presence, group chat, and one‑to‑one private chat using Firebase Realtime Database.

(function() {
  class InternalChat {
    constructor() {
      this.initialized = false;
      this.currentUser = null;
      this.currentUserUid = null;
      this.currentChannel = 'public';
      this.privateChatId = null;
      this.chatButton = null;
      this.chatPopup = null;
      this.channelLabel = null;
      this.userListContainer = null;
      this.messageContainer = null;
      this.messageInput = null;
      this.sendButton = null;
      this.charCount = null;
      this.presenceRef = null;
      this.presenceRootRef = null;
      this.presenceListener = null;
      this.messagesRef = null;
      this.dragOffset = { x: 0, y: 0 };
      this.isDragging = false;
      // Store all clinic users passed from the main system. This list will be used
      // to populate the user list on the left. Defaults to an empty array.
      this.usersList = [];
    }

    /**
     * Initialize the chat system for the current user. This should be called
     * once after the user logs in. Subsequent calls will be ignored unless
     * the module was destroyed via destroy().
     *
     * @param {Object} userData - The current user's data object.
     */
    init(userData, usersList) {
      if (this.initialized) return;
      if (!userData) return;
      // Determine UID: prefer userData.uid, fallback to Firebase auth currentUser
      const auth = window.firebase && window.firebase.auth;
      const currentAuthUser = auth && auth.currentUser ? auth.currentUser : null;
      this.currentUserUid = userData.uid || (currentAuthUser ? currentAuthUser.uid : null);
      if (!this.currentUserUid) {
        console.warn('ChatModule: Unable to determine UID for current user. Chat will not initialize.');
        return;
      }
      this.currentUser = userData;
      this.initialized = true;
      // Store users list if provided; fallback to global if available
      if (usersList && Array.isArray(usersList)) {
        this.usersList = usersList;
      } else if (Array.isArray(window.users)) {
        this.usersList = window.users;
      }
      this.createUI();
      this.setupPresence();
      this.populateUserList();
      this.listenToPresence();
      this.listenToMessages('public');
    }

    /**
     * Clean up event listeners, remove UI elements, and unregister presence
     * before the user logs out. After calling destroy(), init() can be
     * invoked again on the next login.
     */
    destroy() {
      if (!this.initialized) return;
      // Remove presence listener
      try {
        if (this.presenceRootRef && this.presenceListener) {
          window.firebase.off(this.presenceRootRef, 'value', this.presenceListener);
        }
      } catch (err) {
        console.error('ChatModule: error detaching presence listener', err);
      }
      this.presenceRootRef = null;
      this.presenceListener = null;
      // Remove messages listener
      try {
        if (this.messagesRef) {
          window.firebase.off(this.messagesRef, 'value');
        }
      } catch (err) {
        console.error('ChatModule: error detaching messages listener', err);
      }
      this.messagesRef = null;
      // Remove presence entry
      try {
        if (this.presenceRef) {
          window.firebase.remove(this.presenceRef);
        }
      } catch (err) {
        console.error('ChatModule: error removing presence entry', err);
      }
      this.presenceRef = null;
      // Remove UI elements and event listeners
      if (this.chatButton) {
        this.chatButton.removeEventListener('click', this.togglePopupHandler);
        this.chatButton.remove();
        this.chatButton = null;
      }
      if (this.chatPopup) {
        // Remove listeners added on header for dragging
        const header = this.chatPopup.querySelector('.chat-header');
        if (header) {
          header.removeEventListener('mousedown', this.startDragHandler);
        }
        // Remove send message events
        if (this.messageInput) {
          this.messageInput.removeEventListener('input', this.inputHandler);
          this.messageInput.removeEventListener('keydown', this.keydownHandler);
        }
        if (this.sendButton) {
          this.sendButton.removeEventListener('click', this.sendHandler);
        }
        this.chatPopup.remove();
        this.chatPopup = null;
      }
      this.initialized = false;
      this.currentUser = null;
      this.currentUserUid = null;
      this.currentChannel = 'public';
      this.privateChatId = null;
      this.usersList = [];
    }

    /**
     * Create the chat toggle button and chat popup DOM elements.
     */
    createUI() {
      // Chat toggle button
      const button = document.createElement('button');
      this.chatButton = button;
      button.id = 'chatToggleButton';
      button.type = 'button';
      button.title = '聊天';
      button.style.position = 'fixed';
      button.style.right = '1rem';
      button.style.bottom = '1rem';
      button.style.zIndex = '10000';
      button.className = 'bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg focus:outline-none';
      button.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16h10"></path></svg>`;
      document.body.appendChild(button);
      // Handler bound to this for removal later
      this.togglePopupHandler = () => this.togglePopup();
      button.addEventListener('click', this.togglePopupHandler);

      // Chat popup
      const popup = document.createElement('div');
      this.chatPopup = popup;
      popup.id = 'chatPopup';
      popup.style.position = 'fixed';
      popup.style.right = '1rem';
      popup.style.bottom = '4.5rem';
      popup.style.width = '360px';
      popup.style.height = '500px';
      popup.style.maxHeight = '80vh';
      popup.style.zIndex = '10000';
      popup.className = 'hidden flex flex-col bg-white rounded-lg shadow-xl border';
      // Enable resizing of the popup
      popup.style.resize = 'both';
      popup.style.overflow = 'hidden';

      // Header
      const header = document.createElement('div');
      header.className = 'chat-header cursor-move flex items-center justify-between p-2 bg-gray-100 border-b';
      this.channelLabel = document.createElement('span');
      this.channelLabel.className = 'font-semibold text-gray-800 text-sm';
      this.channelLabel.textContent = '主頻道';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.innerHTML = '&times;';
      closeBtn.className = 'text-xl text-gray-500 hover:text-gray-700 focus:outline-none';
      closeBtn.addEventListener('click', () => {
        popup.classList.add('hidden');
      });
      header.appendChild(this.channelLabel);
      header.appendChild(closeBtn);
      popup.appendChild(header);

      // Content area: user list + messages
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'flex flex-1 overflow-hidden';
      // User list
      const userList = document.createElement('div');
      this.userListContainer = userList;
      userList.className = 'w-1/3 border-r overflow-y-auto';
      popup.appendChild(contentWrapper);
      // messages container
      const messagesWrapper = document.createElement('div');
      messagesWrapper.className = 'flex-1 flex flex-col';
      // Message display
      const messageList = document.createElement('div');
      this.messageContainer = messageList;
      messageList.className = 'flex-1 overflow-y-auto p-2 space-y-2 bg-white';
      // Input area
      const inputArea = document.createElement('div');
      inputArea.className = 'p-2 border-t bg-gray-50';
      // Textarea
      const textarea = document.createElement('textarea');
      this.messageInput = textarea;
      textarea.className = 'w-full border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring focus:border-blue-300';
      textarea.rows = 2;
      textarea.maxLength = 500;
      textarea.placeholder = '輸入訊息...';
      // Character count
      const charCounter = document.createElement('div');
      this.charCount = charCounter;
      charCounter.className = 'text-xs text-gray-400 text-right pt-1';
      charCounter.textContent = '0/500';
      // Send button
      const sendBtn = document.createElement('button');
      this.sendButton = sendBtn;
      sendBtn.type = 'button';
      sendBtn.className = 'mt-2 w-full bg-blue-500 hover:bg-blue-600 text-white py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed';
      sendBtn.textContent = '發送';
      sendBtn.disabled = true;
      inputArea.appendChild(textarea);
      inputArea.appendChild(charCounter);
      inputArea.appendChild(sendBtn);

      messagesWrapper.appendChild(messageList);
      messagesWrapper.appendChild(inputArea);

      contentWrapper.appendChild(userList);
      contentWrapper.appendChild(messagesWrapper);

      popup.appendChild(contentWrapper);
      document.body.appendChild(popup);

      // Bind event handlers for dragging
      this.startDragHandler = (ev) => {
        this.isDragging = true;
        // Calculate offset between mouse and top left corner of popup
        const rect = this.chatPopup.getBoundingClientRect();
        this.dragOffset.x = ev.clientX - rect.left;
        this.dragOffset.y = ev.clientY - rect.top;
        // Set event listeners on document for dragging and releasing
        document.addEventListener('mousemove', this.dragHandler);
        document.addEventListener('mouseup', this.stopDragHandler);
      };
      this.dragHandler = (ev) => {
        if (!this.isDragging) return;
        // Move popup relative to viewport
        const newLeft = ev.clientX - this.dragOffset.x;
        const newTop = ev.clientY - this.dragOffset.y;
        // Ensure popup stays within window boundaries
        const maxLeft = window.innerWidth - this.chatPopup.offsetWidth;
        const maxTop = window.innerHeight - this.chatPopup.offsetHeight;
        this.chatPopup.style.left = Math.min(Math.max(newLeft, 0), maxLeft) + 'px';
        this.chatPopup.style.top = Math.min(Math.max(newTop, 0), maxTop) + 'px';
        this.chatPopup.style.right = 'auto';
        this.chatPopup.style.bottom = 'auto';
      };
      this.stopDragHandler = () => {
        this.isDragging = false;
        document.removeEventListener('mousemove', this.dragHandler);
        document.removeEventListener('mouseup', this.stopDragHandler);
      };
      header.addEventListener('mousedown', this.startDragHandler);

      // Input handling
      this.inputHandler = () => {
        const text = this.messageInput.value;
        this.charCount.textContent = `${text.length}/500`;
        this.sendButton.disabled = text.trim().length === 0;
        // Auto-resize textarea height
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
      };
      this.messageInput.addEventListener('input', this.inputHandler);
      this.keydownHandler = (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          if (!this.sendButton.disabled) {
            this.sendMessage();
          }
        }
      };
      this.messageInput.addEventListener('keydown', this.keydownHandler);
      // Send button
      this.sendHandler = () => {
        this.sendMessage();
      };
      this.sendButton.addEventListener('click', this.sendHandler);
    }

    /**
     * Show or hide the chat popup when the toggle button is clicked.
     */
    togglePopup() {
      if (this.chatPopup.classList.contains('hidden')) {
        this.chatPopup.classList.remove('hidden');
      } else {
        this.chatPopup.classList.add('hidden');
      }
    }

    /**
     * Register the current user as online and set up onDisconnect removal.
     */
    setupPresence() {
      try {
        // Each user has its own presence entry under presence/<uid>
        this.presenceRef = window.firebase.ref(window.firebase.rtdb, `presence/${this.currentUserUid}`);
        // Remove presence when disconnected
        if (this.presenceRef && typeof this.presenceRef.onDisconnect === 'function') {
          this.presenceRef.onDisconnect().remove();
        }
        window.firebase.set(this.presenceRef, true).catch((err) => {
          console.error('ChatModule: Failed to set presence', err);
        });
      } catch (err) {
        console.error('ChatModule: Error in setupPresence', err);
      }
    }

    /**
     * Populate the user list on the left side of the chat. Includes an entry
     * for the group chat (public) followed by each user except the current one.
     */
    populateUserList() {
      // Clear existing entries
      this.userListContainer.innerHTML = '';
      // Helper to create an item
        const createItem = (userObj, isGroup = false) => {
        const item = document.createElement('div');
        item.className = 'flex items-center px-3 py-2 cursor-pointer hover:bg-gray-100';
        item.dataset.uid = userObj.uid || '';
        // Avatar: first letter
        const avatar = document.createElement('div');
        avatar.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mr-2 flex-shrink-0';
        if (isGroup) {
          avatar.textContent = '#';
          avatar.style.backgroundColor = '#6B7280'; // gray
        } else {
          // Avatar shows first character of name or username
          const nameSource = userObj.name || userObj.username || '?';
          const firstChar = nameSource.charAt(0);
          avatar.textContent = firstChar;
          // Choose a color based on uid
          const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
          let index = 0;
          const uidStr = String(userObj.uid || userObj.id || '');
          if (uidStr) {
            for (let i = 0; i < uidStr.length; i++) {
              index = (index + uidStr.charCodeAt(i)) % colors.length;
            }
          }
          avatar.style.backgroundColor = colors[index];
        }
        // Name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'flex-1 text-sm truncate';
        nameSpan.textContent = isGroup ? '主頻道' : (userObj.name || userObj.username || '未知用戶');
        // Status dot
        const statusDot = document.createElement('span');
        statusDot.className = 'w-2 h-2 rounded-full ml-2 flex-shrink-0';
        statusDot.style.backgroundColor = isGroup ? 'transparent' : '#9CA3AF'; // default gray
        statusDot.dataset.statusDot = 'true';
        item.appendChild(avatar);
        item.appendChild(nameSpan);
        item.appendChild(statusDot);
        // Click handler
        item.addEventListener('click', () => {
          // Remove highlight from previous selection
          const allItems = this.userListContainer.querySelectorAll('.bg-blue-100');
          allItems.forEach(it => it.classList.remove('bg-blue-100'));
          item.classList.add('bg-blue-100');
          if (isGroup) {
            this.selectPublicChannel();
          } else {
            this.selectPrivateChat(userObj);
          }
        });
        return item;
      };
      // Group chat item
      const groupItem = createItem({ username: '主頻道', uid: 'public' }, true);
      groupItem.classList.add('bg-blue-100'); // default selected
      this.userListContainer.appendChild(groupItem);
      // Other users
      const list = Array.isArray(this.usersList) ? this.usersList : [];
      list.forEach(u => {
        if (!u) return;
        // Exclude current user (by uid or id)
        const uid = u.uid || u.id || null;
        if (!uid) return;
        if (uid === this.currentUserUid || String(uid) === String(this.currentUser.id)) return;
        const userItem = createItem(u, false);
        this.userListContainer.appendChild(userItem);
      });
    }

    /**
     * Listen to presence changes for all users and update status dots.
     */
    listenToPresence() {
      try {
        this.presenceRootRef = window.firebase.ref(window.firebase.rtdb, 'presence');
        this.presenceListener = (snapshot) => {
          const presenceData = snapshot.val() || {};
          // Count online users excluding current (for potential use)
          let onlineCount = 0;
          Object.keys(presenceData).forEach(uid => {
            if (presenceData[uid]) {
              if (uid !== this.currentUserUid) onlineCount++;
            }
          });
          // Update status dots
          const items = this.userListContainer.querySelectorAll('div[data-uid]');
          items.forEach(item => {
            const uid = item.dataset.uid;
            const dot = item.querySelector('span[data-status-dot="true"]');
            if (!dot) return;
            if (uid && presenceData[uid]) {
              dot.style.backgroundColor = '#10B981'; // green
            } else {
              dot.style.backgroundColor = '#9CA3AF'; // gray
            }
          });
        };
        window.firebase.onValue(this.presenceRootRef, this.presenceListener);
      } catch (err) {
        console.error('ChatModule: Failed to listen to presence', err);
      }
    }

    /**
     * Switch to the public (group) chat channel.
     */
    selectPublicChannel() {
      this.currentChannel = 'public';
      this.privateChatId = null;
      this.channelLabel.textContent = '主頻道';
      this.listenToMessages('public');
    }

    /**
     * Switch to a private chat with the specified user.
     *
     * @param {Object} userObj - User object representing the other participant.
     */
    selectPrivateChat(userObj) {
      if (!userObj) return;
      const uid = userObj.uid || userObj.id;
      if (!uid) return;
      // Create a deterministic chat ID by sorting the UIDs alphabetically
      const ids = [String(this.currentUserUid), String(uid)].sort();
      const chatId = ids.join('_');
      this.privateChatId = chatId;
      this.currentChannel = 'private';
      // Update channel label to user name
      this.channelLabel.textContent = userObj.name || userObj.username || '私人聊天';
      this.listenToMessages(chatId);
    }

    /**
     * Attach a listener to messages in the specified channel. Automatically
     * removes any previous listener to avoid duplicate callbacks.
     *
     * @param {string} channelId - 'public' for group chat or chat ID for private.
     */
    listenToMessages(channelId) {
      // Detach previous listener
      try {
        if (this.messagesRef) {
          window.firebase.off(this.messagesRef, 'value');
        }
      } catch (err) {
        console.error('ChatModule: error detaching old message listener', err);
      }
      // Determine path
      let path;
      if (channelId === 'public') {
        path = 'chat/messages/public';
      } else {
        path = `chat/private/${channelId}`;
      }
      this.messagesRef = window.firebase.ref(window.firebase.rtdb, path);
      // Listen to full value to fetch entire message list. Since group sizes are small, this is acceptable.
      window.firebase.onValue(this.messagesRef, (snapshot) => {
        const data = snapshot.val() || {};
        const messages = Object.values(data);
        messages.sort((a, b) => {
          const ta = a.timestamp || 0;
          const tb = b.timestamp || 0;
          return ta - tb;
        });
        this.renderMessages(messages);
      });
    }

    /**
     * Render messages in the chat area. Styles the messages depending on
     * whether the current user sent the message.
     *
     * @param {Array} messages - Array of message objects.
     */
    renderMessages(messages) {
      if (!this.messageContainer) return;
      this.messageContainer.innerHTML = '';
      const fragment = document.createDocumentFragment();
      messages.forEach(msg => {
        const isSelf = (msg.senderId === this.currentUserUid);
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-start space-x-2 ' + (isSelf ? 'justify-end' : '');
        // Avatar (optional) only show for other users
        if (!isSelf) {
          const avatar = document.createElement('div');
          avatar.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0';
          const firstChar = (msg.senderName || '?').charAt(0);
          avatar.textContent = firstChar;
          const colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
          let index = 0;
          if (msg.senderId) {
            for (let i = 0; i < String(msg.senderId).length; i++) {
              index = (index + String(msg.senderId).charCodeAt(i)) % colors.length;
            }
          }
          avatar.style.backgroundColor = colors[index];
          wrapper.appendChild(avatar);
        }
        // Content container
        const content = document.createElement('div');
        content.className = 'flex flex-col max-w-[70%]';
        // Name and time row
        const header = document.createElement('div');
        header.className = 'flex items-center text-xs text-gray-500 mb-1';
        if (!isSelf) {
          const nameSpan = document.createElement('span');
          nameSpan.className = 'font-medium text-gray-700 mr-1';
          nameSpan.textContent = msg.senderName || '';
          header.appendChild(nameSpan);
        }
        const timeSpan = document.createElement('span');
        timeSpan.textContent = this.formatTimestamp(msg.timestamp);
        header.appendChild(timeSpan);
        // Message bubble
        const bubble = document.createElement('div');
        bubble.className = (isSelf ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800') + ' rounded-2xl px-3 py-2 text-sm break-words';
        bubble.textContent = msg.text || '';
        content.appendChild(header);
        content.appendChild(bubble);
        wrapper.appendChild(content);
        if (isSelf) {
          // For self messages, show avatar on the right
          const avatar = document.createElement('div');
          avatar.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ml-2';
          const nameSourceSelf = (this.currentUser && (this.currentUser.name || this.currentUser.username)) || '?';
          const firstChar = nameSourceSelf.charAt(0);
          avatar.textContent = firstChar;
          const colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
          let index = 0;
          for (let i = 0; i < String(this.currentUserUid).length; i++) {
            index = (index + String(this.currentUserUid).charCodeAt(i)) % colors.length;
          }
          avatar.style.backgroundColor = colors[index];
          wrapper.appendChild(avatar);
        }
        fragment.appendChild(wrapper);
      });
      this.messageContainer.appendChild(fragment);
      // Auto-scroll to bottom
      this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }

    /**
     * Format a timestamp into HH:mm format. Falls back gracefully if input
     * is invalid.
     *
     * @param {number|string} ts - Timestamp in milliseconds since epoch.
     * @returns {string} Formatted time string.
     */
    formatTimestamp(ts) {
      try {
        const date = new Date(parseInt(ts, 10));
        if (isNaN(date.getTime())) return '';
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
      } catch (_e) {
        return '';
      }
    }

    /**
     * Send the current message input to the appropriate chat channel. Clears
     * the input on success and updates the character counter.
     */
    sendMessage() {
      const text = (this.messageInput && this.messageInput.value) ? this.messageInput.value.trim() : '';
      if (!text) return;
      const timestamp = Date.now();
      const messageData = {
        senderId: this.currentUserUid,
        // Use the clinic user's managed name if available
        senderName: (this.currentUser && (this.currentUser.name || this.currentUser.username)) || '',
        text: text,
        timestamp: timestamp
      };
      let path;
      if (this.currentChannel === 'public') {
        path = 'chat/messages/public';
      } else if (this.privateChatId) {
        path = `chat/private/${this.privateChatId}`;
      } else {
        return;
      }
      // Use timestamp as key for uniqueness; each client writes to its own key
      const msgRef = window.firebase.ref(window.firebase.rtdb, `${path}/${timestamp}`);
      window.firebase.set(msgRef, messageData).then(() => {
        // Clear input
        this.messageInput.value = '';
        this.charCount.textContent = '0/500';
        this.sendButton.disabled = true;
        // Reset textarea height
        this.messageInput.style.height = 'auto';
      }).catch((err) => {
        console.error('ChatModule: failed to send message', err);
      });
    }
  }

  // Create a single instance of InternalChat and expose init/destroy methods
  const chatInstance = new InternalChat();
  window.ChatModule = {
    initChat: (userData, usersList) => {
      try {
        chatInstance.init(userData, usersList);
      } catch (err) {
        console.error('ChatModule: initChat failed', err);
      }
    },
    destroyChat: () => {
      try {
        chatInstance.destroy();
      } catch (err) {
        console.error('ChatModule: destroyChat failed', err);
      }
    }
  };
})();