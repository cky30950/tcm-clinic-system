/* ============================================================
 * auth/session.js — 工作階段：主登入、登入後資料同步、登出清理、本機快取清除、改密碼／自我封存
 * ------------------------------------------------------------
 * Phase 3 自 system.js 原樣遷入，邏輯零改動；舊全域存取一律經 G。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { archiveStaffAuthAccount, fetchAuthorizedUserByUidOrEmail } from './claims.js';

export function loadAccountSecurity() {
    try {
        const currentInput = document.getElementById('changeCurrentPassword');
        const newInput = document.getElementById('changeNewPassword');
        const confirmInput = document.getElementById('changeConfirmPassword');
        const deleteInput = document.getElementById('deleteAccountPassword');
        if (currentInput) currentInput.value = '';
        if (newInput) newInput.value = '';
        if (confirmInput) confirmInput.value = '';
        if (deleteInput) deleteInput.value = '';
    } catch (_e) {
        
    }
}


export async function changeCurrentUserPassword() {
    const currentPassEl = document.getElementById('changeCurrentPassword');
    const newPassEl = document.getElementById('changeNewPassword');
    const confirmEl = document.getElementById('changeConfirmPassword');
    if (!currentPassEl || !newPassEl || !confirmEl) {
        G.showToast('找不到輸入欄位，請重新載入頁面', 'error');
        return;
    }
    const currentPassword = (currentPassEl.value || '').trim();
    const newPassword = (newPassEl.value || '').trim();
    const confirmPassword = (confirmEl.value || '').trim();
    const lang = localStorage.getItem('lang') || 'zh';
    if (!currentPassword || !newPassword || !confirmPassword) {
        const msg = lang === 'en' ? 'Please fill in all fields' : '請填寫所有欄位';
        G.showToast(msg, 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        const msg = lang === 'en' ? 'New password and confirmation do not match' : '新密碼與確認密碼不一致';
        G.showToast(msg, 'error');
        return;
    }
    if (newPassword.length < 6) {
        const msg = lang === 'en' ? 'Password must be at least 6 characters' : '新密碼長度至少 6 個字元';
        G.showToast(msg, 'error');
        return;
    }
    
    
    const updateButton = document.getElementById('updatePasswordButton');
    
    G.setButtonLoading(updateButton, window.t ? window.t('更新中...') : (lang === 'en' ? 'Updating...' : '更新中...'));
    try {
        const auth = window.firebase.auth;
        const user = auth.currentUser;
        if (!user || !user.email) {
            const msg = lang === 'en' ? 'No authenticated user found' : '未找到已登入用戶';
            G.showToast(msg, 'error');
            return;
        }
        
        
        
        
        const credential = window.firebase.EmailAuthProvider.credential(user.email, currentPassword);
        
        await window.firebase.reauthenticateWithCredential(auth.currentUser, credential);
        
        await window.firebase.updatePassword(auth.currentUser, newPassword);
        const successMsg = lang === 'en' ? 'Password updated successfully' : '密碼更新成功';
        G.showToast(successMsg, 'success');
        
        currentPassEl.value = '';
        newPassEl.value = '';
        confirmEl.value = '';
    } catch (error) {
        console.error('更新密碼錯誤:', error);
        let errMsg = '';
        if (error && error.code) {
            
            switch (error.code) {
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    
                    errMsg = lang === 'en' ? 'Current password is incorrect' : '當前密碼不正確';
                    break;
                case 'auth/weak-password':
                    errMsg = lang === 'en' ? 'New password is too weak' : '新密碼過於簡單';
                    break;
                default:
                    errMsg = error.message || (lang === 'en' ? 'Failed to update password' : '更新密碼失敗');
            }
        } else {
            errMsg = lang === 'en' ? 'Failed to update password' : '更新密碼失敗';
        }
        G.showToast(errMsg, 'error');
    } finally {
        
        G.clearButtonLoading(updateButton);
    }
}


// 帳號安全設定：員工自我封存（離職）。
// 需重新輸入密碼確認身份；後端停用 Auth 帳號但不刪除，記錄保留供審計，
// 日後須由診所管理員於「已離職」清單辦理復職。
export async function archiveCurrentUserAccount() {
    const pwdEl = document.getElementById('deleteAccountPassword');
    const lang = localStorage.getItem('lang') || 'zh';
    if (!pwdEl) {
        G.showToast(lang === 'en' ? 'Cannot find password field' : '找不到密碼輸入欄位', 'error');
        return;
    }
    const password = (pwdEl.value || '').trim();
    if (!password) {
        G.showToast(lang === 'en' ? 'Please enter your password' : '請輸入密碼', 'error');
        return;
    }

    try {
        const user = window.firebase.auth.currentUser;
        if (!user || !user.email) {
            G.showToast(lang === 'en' ? 'No authenticated user found' : '未找到已登入用戶', 'error');
            return;
        }

        const confirmMsg = lang === 'en'
            ? 'Are you sure you want to archive (deactivate) your account?\n\nYour account will be disabled and you will no longer be able to log in. Your records will be retained for audit; ask a clinic administrator to restore it if you return.'
            : '確定要封存（停用）您的帳號嗎？\n\n封存後帳號將停用，您將無法再登入系統；帳號資料會保留供日後審計，如需復職請聯絡診所管理員。';
        const confirmedArchive = await G.showConfirmation(confirmMsg, 'warning');
        if (!confirmedArchive) {
            return;
        }

        const archiveButton = document.getElementById('deleteAccountButton');

        G.setButtonLoading(archiveButton, lang === 'en' ? 'Archiving...' : '封存中...');
        try {
            // 重新認證，確認為本人操作
            const credential = window.firebase.EmailAuthProvider.credential(user.email, password);
            await window.firebase.reauthenticateWithCredential(window.firebase.auth.currentUser, credential);

            // 後端統一處理：代寫 users 封存欄位、停用 Auth 帳號、撤銷工作階段（不刪帳號）
            const selfUid = user.uid;
            const selfUserId = G.currentUserData && G.currentUserData.id;
            await archiveStaffAuthAccount(selfUid, selfUserId, true, 'self-requested');

            G.showToast(lang === 'en' ? 'Account archived' : '帳號已封存', 'success');

            await logout();
        } catch (error) {
            console.error('封存帳號錯誤:', error);
            let errMsg;
            if (error && error.code) {
                switch (error.code) {
                    case 'auth/wrong-password':
                    case 'auth/invalid-credential':
                        errMsg = lang === 'en' ? 'Password is incorrect' : '密碼錯誤';
                        break;
                    default:
                        errMsg = error.message || (lang === 'en' ? 'Failed to archive account' : '封存帳號失敗');
                }
            } else {
                errMsg = (error && error.message) || (lang === 'en' ? 'Failed to archive account' : '封存帳號失敗');
            }
            G.showToast(errMsg, 'error');
        } finally {
            G.clearButtonLoading(archiveButton);
        }
    } catch (error) {
        console.error('封存帳號錯誤:', error);
        let errMsg = lang === 'en' ? 'Failed to archive account' : '封存帳號失敗';
        if (error && error.message) {
            errMsg = error.message;
        }
        G.showToast(errMsg, 'error');
    }
}

export async function attemptMainLogin() {
    const email = document.getElementById('mainLoginUsername').value.trim();
    const password = document.getElementById('mainLoginPassword').value;
    
    if (!email || !password) {
        G.showToast('請輸入電子郵件和密碼！', 'error');
        return;
    }

    // 未登入守衛可能正在 terminate Firestore 並準備重新整理（前一位使用者
    // 未登出直接關分頁的最常見路徑）。此期間 Firestore 已不可用，登入的
    // 授權查詢必失敗並可能被誤判「未授權」，故直接擋下等待重整完成。
    if (window.__authGuardWipeInProgress === true) {
        G.showToast('系統正在重新整理，請稍候…', 'error');
        return;
    }

    
    
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        G.setButtonLoading(loginButton, '登入中...');
    }

    try {
        
        await G.waitForFirebase();

        // 不以 Realtime Database 連線狀態作為登入前置門檻：Auth 與 RTDB 是
        // 獨立通道，RTDB websocket 被網路環境阻擋或只等 1.5 秒就判定離線，
        // 會把 Auth 其實可用的情境誤殺成「無法連接到伺服器」。
        // 僅保留瀏覽器層級的明確離線判定；其餘情況交由 signIn 自身的
        // 網路錯誤（auth/network-request-failed）於 catch 中提示。
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            G.showToast('目前沒有網路連線，請檢查網路後再試', 'error');
            return;
        }

        
        const userCredential = await window.firebase.signInWithEmailAndPassword(
            window.firebase.auth,
            email,
            password
        );

        console.log('Firebase 登入成功:', userCredential.user.email);

        // 標記本機 IndexedDB 即將可能寫入診所／病人資料（後續會讀 users 等文件），
        // 供「未登入開頁守衛」判斷需否清除；正常登出清除成功後會撤銷此標記。
        try { localStorage.setItem(IDB_PHI_MARKER, '1'); } catch (_e) {}

        
        const firebaseUser = userCredential.user;
        const uid = firebaseUser.uid;

        
        
        
        try {
            if (firebaseUser && typeof firebaseUser.getIdTokenResult === 'function') {
                await firebaseUser.getIdToken(true);
                const idTokenResult = await firebaseUser.getIdTokenResult();
                if (idTokenResult && idTokenResult.claims) {
                    
                    window.currentUserClaims = idTokenResult.claims;
                } else {
                    window.currentUserClaims = {};
                }
            }
        } catch (claimsErr) {
            console.warn('取得使用者自訂權限失敗:', claimsErr);
            window.currentUserClaims = {};
        }

        // Custom claims 閘門：ID Token 已標示 staff 但 active=false（帳號被停用）→ 即時拒絕。
        // 後端停用時另會撤銷 refresh token，已簽發的 ID Token 最遲一小時後失效。
        if (window.currentUserClaims
            && window.currentUserClaims.staff === true
            && window.currentUserClaims.active === false) {
            G.showToast('您的帳號已被停用，請聯繫管理員', 'error');
            await window.firebase.signOut(window.firebase.auth);
            // 已讀取過 users 等文件：完整清掃（localStorage＋IndexedDB）後重新整理
            wipeDeviceDataAndReload(1000);
            return;
        }

        let matchingUser;
        try {
            matchingUser = await fetchAuthorizedUserByUidOrEmail(uid, firebaseUser && firebaseUser.email);
        } catch (lookupErr) {
            // 網路／逾時／Firestore 實例重整中：切勿誤判為「未授權」而簽退清掃。
            // Auth 已成功，保留工作階段，讓使用者直接再按一次登入重試。
            console.error('登入時查詢授權用戶資料暫時失敗:', lookupErr);
            G.showToast('網路連線不穩，無法確認帳號，請稍後重試', 'error');
            document.getElementById('mainLoginPassword').value = '';
            return;
        }
        if (matchingUser && uid && (!matchingUser.uid || matchingUser.uid !== uid)) {
            matchingUser.uid = uid;
            try {
                await G.waitForFirebaseDataManager(8000);
                if (window.firebaseDataManager && typeof window.firebaseDataManager.updateUser === 'function') {
                    await window.firebaseDataManager.updateUser(matchingUser.id, { uid: uid });
                }
            } catch (error) {
                console.error('更新用戶 UID 失敗:', error);
            }
        }
        if (matchingUser) {
            matchingUser = G.normalizeUserForClient(matchingUser);
        }

        if (matchingUser) {

            if (!matchingUser.active) {
                const accountArchived = matchingUser.archived === true
                    || matchingUser.status === 'archived';
                G.showToast(
                    accountArchived
                        ? '您的帳號已離職封存，請聯繫管理員'
                        : '您的帳號已被停用，請聯繫管理員',
                    'error'
                );
                await window.firebase.signOut(window.firebase.auth);
                // 拒絕登入一併完整清掃（localStorage＋IndexedDB）後重新整理
                wipeDeviceDataAndReload(1000);
                return;
            }

            
            matchingUser.lastLogin = new Date().toISOString();
            try {
                await window.firebaseDataManager.updateUser(matchingUser.id, { 
                    lastLogin: new Date() 
                });
            } catch (error) {
                console.error('更新最後登入時間失敗:', error);
            }
            
            
            G.currentUserData = matchingUser;
            G.currentUser = matchingUser.username;
            try {
                await syncUserDataFromFirebase({ allowLocalFallback: false });
            } catch (syncErr) {
                console.warn('登入後同步用戶資料失敗，保留目前授權用戶資料:', syncErr);
            }
            try {
                if (!Array.isArray(G.users)) G.users = [];
                const idx = G.users.findIndex(u => u && u.id === matchingUser.id);
                if (idx >= 0) G.users[idx] = { ...users[idx], ...matchingUser };
                else G.users.push(matchingUser);
                localStorage.setItem('users', JSON.stringify(G.users));
            } catch (_e) {}
        } else {
            
            G.showToast('此帳號尚未被授權，請聯繫系統管理員', 'error');
            
            try {
                await window.firebase.signOut(window.firebase.auth);
            } catch (e) {
                console.error('登出 Firebase 失敗:', e);
            }
            // 拒絕登入一併完整清掃（localStorage＋IndexedDB）後重新整理
            wipeDeviceDataAndReload(1000);
            return;
        }

        
        
        try {
            const initTasks = [];
            if (typeof G.initHerbLibrary === 'function') {
                initTasks.push(G.initHerbLibrary());
            }
            
            if (typeof G.initHerbInventory === 'function') {
                
                initTasks.push((async () => {
                    try {
                        
                        await G.initHerbInventory(true);
                    } catch (err) {
                        console.error('初始化中藥庫存資料失敗:', err);
                    }
                })());
            }
            if (typeof G.initBillingItems === 'function') {
                initTasks.push(G.initBillingItems());
            }
            if (typeof G.initCategoryData === 'function') {
                initTasks.push((async () => {
                    try {
                        await G.initCategoryData();
                    } catch (err) {
                        console.error('初始化分類資料失敗:', err);
                    }
                })());
            }
            if (typeof G.initTemplateLibrary === 'function') {
                initTasks.push((async () => {
                    try {
                        await G.initTemplateLibrary();
                    } catch (err) {
                        console.error('初始化模板庫資料失敗:', err);
                    }
                })());
            }
            if (typeof G.initAcupointLibrary === 'function') {
                initTasks.push((async () => {
                    try {
                        await G.initAcupointLibrary();
                        try { if (typeof window.applyAcupointCoordinates === 'function') { window.applyAcupointCoordinates(); } } catch (_e) {}
                        try { if (typeof G.initAcupointMap === 'function') { G.initAcupointMap(); } } catch (_e2) {}
                    } catch (err) {
                        console.error('初始化穴位庫資料失敗:', err);
                    }
                })());
            }
            if (initTasks.length > 0) {
                await Promise.all(initTasks);
            }
        } catch (error) {
            console.error('初始化中藥庫或收費項目資料失敗:', error);
        }

        
        performLogin(G.currentUserData);
        
        try {
            if (typeof G.startInactivityMonitoring === 'function') {
                G.startInactivityMonitoring();
            }
        } catch (_e) {
            
        }
        
        await G.initializeSystemAfterLogin();

        
        
        
        try {
            if (window.firebaseDataManager && typeof window.firebaseDataManager.clearOldInquiries === 'function') {
                await window.firebaseDataManager.clearOldInquiries();
            }
        } catch (err) {
            console.error('登入後清理問診資料失敗:', err);
        }

        
        try {
            if (window.ChatModule && typeof window.ChatModule.initChat === 'function') {
                window.ChatModule.initChat(G.currentUserData, G.users);
            }
        } catch (chatErr) {
            console.error('初始化聊天模組失敗:', chatErr);
        }

        G.showToast('登入成功！', 'success');

    } catch (error) {
        console.error('登入失敗:', error);
        let errorMessage = '登入失敗';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = '電子郵件不存在';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = '密碼錯誤';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = '電子郵件格式不正確';
        }
        
        G.showToast(errorMessage, 'error');
        document.getElementById('mainLoginPassword').value = '';
    } finally {
        
        G.clearButtonLoading(loginButton);
    }
}


export async function syncUserDataFromFirebase(options = {}) {
    try {
        const allowLocalFallback = options.allowLocalFallback !== false;
        const localFallback = allowLocalFallback ? G.loadUsersFromLocalStorage() : [];
        if (allowLocalFallback && Array.isArray(localFallback) && localFallback.length && (!Array.isArray(G.users) || G.users.length === 0)) {
            G.users = localFallback;
        }

        if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
            const ok = await G.waitForFirebaseDataManager(8000);
            if (!ok) {
                if (allowLocalFallback) {
                    console.log('Firebase 數據管理器尚未準備就緒，使用本地用戶快取');
                } else {
                    console.warn('Firebase 數據管理器尚未準備就緒，略過本次用戶同步');
                }
                return;
            }
        }

        
        const data = await G.fetchUsers(true);
        if (Array.isArray(data) && data.length > 0) {
            
            G.users = data.map(user => G.normalizeUserForClient(user));
            
            try {
                localStorage.setItem('users', JSON.stringify(G.users));
            } catch (lsErr) {
                console.warn('保存用戶資料到本地失敗:', lsErr);
            }
            console.log('已同步 Firebase 用戶數據到本地:', G.users.length, '筆 (使用快取)');
        } else {
            
            if (allowLocalFallback && Array.isArray(localFallback) && localFallback.length && (!Array.isArray(G.users) || G.users.length === 0)) {
                G.users = localFallback;
            }
            if (allowLocalFallback) {
                console.warn('無法從 Firebase 取得完整用戶列表，改使用本地快取:', Array.isArray(G.users) ? G.users.length : 0, '筆');
            } else {
                console.warn('無法從 Firebase 取得完整用戶列表，保留目前記憶體中的用戶資料');
            }
        }
    } catch (error) {
        console.error('同步 Firebase 用戶數據失敗:', error);
    }
}

        
        
        function performLogin(user) {
            
            const userIndex = G.users.findIndex(u => u.id === user.id);
            if (userIndex !== -1) {
                G.users[userIndex].lastLogin = new Date().toISOString();
                localStorage.setItem('users', JSON.stringify(G.users));
            }
            
            G.currentUser = user.username;
            G.currentUserData = user;
            
            
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('mainSystem').classList.remove('hidden');
            
            if (typeof G.showGlobalCopyright === 'function') {
                try {
                    G.showGlobalCopyright();
                } catch (_e) {
                    
                }
            }
            
            document.getElementById('userRole').textContent = `當前用戶：${G.getUserDisplayName(user)}`;
            document.getElementById('sidebarUserRole').textContent = `當前用戶：${G.getUserDisplayName(user)}`;
            try { initClinics(); } catch (_e) {}
            updateCurrentClinicDisplay();
            
            generateSidebarMenu();
            
            // 全域啟動掛號狀態監聽：登入後即監聽今日掛號，
            // 即使不在「掛號診症」頁面，右上角也會收到候診／診症完成通知與音效。
            // subscribeToAppointments 內部會先移除舊監聽器，重複呼叫安全；
            // 之後進入掛號頁時 loadConsultationSystem 會再以相同方式接續。
            if (typeof subscribeToAppointments === 'function') {
                try {
                    subscribeToAppointments();
                } catch (_e) {
                    console.error('啟動全域掛號監聽失敗:', _e);
                }
            }
            
            if (typeof updateWelcomeCards === 'function') {
                try {
                    updateWelcomeCards();
                } catch (_e) {
                    
                }
            }
            
            
            if (typeof loadPersonalSettings === 'function') {
                loadPersonalSettings().catch((err) => {
                    console.error('載入個人設置時發生錯誤:', err);
                });
            }
            

            
            {
                const lang = localStorage.getItem('lang') || 'zh';
                const zhMsg = `歡迎回來，${G.getUserDisplayName(user)}！`;
                const enMsg = `Welcome back, ${G.getUserDisplayName(user)}!`;
                const msg = lang === 'en' ? enMsg : zhMsg;
                G.showToast(msg, 'success');
            }
        }

        
        export function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            
            if (sidebar.classList.contains('-translate-x-full')) {
                sidebar.classList.remove('-translate-x-full');
                overlay.classList.remove('hidden');
            } else {
                sidebar.classList.add('-translate-x-full');
                overlay.classList.add('hidden');
            }
        }

// ============================================================
// 登出／未登入開頁時的本機個資清掃（單一權威入口）
// ------------------------------------------------------------
// 病人、掛號、病歷、員工、診所設定與財報等 localStorage 快取只作
// 離線加速，登入後一律由 Firestore 重新載入；登出若不清，共用裝置的
// 下一位使用者可直接從瀏覽器儲存讀到病人個資（PHI）。
// 採明確列舉：業務資料鍵（含前綴）清除；語言、推播、介面偏好與
// 公眾節日表等非個資裝置設定保留。
// ============================================================
const LOCAL_CLINIC_DATA_KEYS = Object.freeze([
    'patients',
    'patientsCacheMeta',
    'appointments',
    'consultations',
    'users',
    'clinics',
    'clinicSettings',
    'categories',
    'billingItems',
    'personalStatsV2',
    'personalStatsV3',
    'inventoryLogs',
    'financialSummaryCoverage',
    'financialReportCache'
]);
const LOCAL_CLINIC_DATA_PREFIXES = Object.freeze([
    'patientConsultations:',   // 單一病人病歷快取
    'patientPackages_',        // 單一病人收費套票快取
    'tcmDraft:consultation:',  // 診症症狀草稿（含病人 ID／掛號號／主訴）
    'billingItems_',           // 分科診所收費項目快取（getClinicScopedStorageKey 產生）
    'chat_lastSeen_',          // 聊天未讀時間（依員工 UID）
    'chat_lastPreview_',       // 聊天訊息預覽（依員工 UID）
    'chat_bootstrapEmpty_',   // 聊天啟動負快取（依員工 UID）
    'tcm-video-consent:'       // 視訊同意書本機記錄（含頻道／掛號號）
]);
export function clearLocalClinicData() {
    let removed = 0;
    try {
        // 先快照 key 清單，避免邊走訪邊刪除漏鍵
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) keys.push(key);
        }
        keys.forEach(function (key) {
            const hit = LOCAL_CLINIC_DATA_KEYS.indexOf(key) !== -1 ||
                LOCAL_CLINIC_DATA_PREFIXES.some(function (prefix) {
                    return key.slice(0, prefix.length) === prefix;
                });
            if (hit) {
                try {
                    localStorage.removeItem(key);
                    removed++;
                } catch (_e) {
                    // 隱私模式／儲存不可用：忽略
                }
            }
        });
    } catch (error) {
        console.warn('清理本機診所資料快取失敗:', error);
    }
    // Firestore SDK 的 IndexedDB 離線快取需「terminate 實例後」才能清除，
    // 無法在一般清掃中一併處理，統一由 shutdownFirestoreAndWipePersistence()
    // 於登出／未登入開頁守衛中執行。
    return removed;
}

// ============================================================
// Firestore IndexedDB 離線快取清除（PHI 防護）
// ------------------------------------------------------------
// Firestore 以 persistentLocalCache 持久化，曾讀取的病人／病歷文件會留存
// IndexedDB。SDK 規定 clearIndexedDbPersistence 只能在 terminate() 之後
// 呼叫，而終止後的實例無法復用——呼叫端必須重新整理頁面取得新實例。
// IDB_PHI_MARKER：登入成功後標記「本機快取可能含個資」，清除成功才撤銷；
// 供前一使用者直接關分頁沒登出時，「未登入開頁守衛」判斷需否補清。
// ============================================================
export const IDB_PHI_MARKER = 'firestoreIdbMayContainPhi';
export const IDB_WIPE_ATTEMPTED = 'firestoreIdbWipeAttempted';
const FIRESTORE_SHUTDOWN_TIMEOUT_MS = 5000;

export function detachAllKnownFirestoreListeners() {
    // 病人清單 metadata 監聽
    try {
        if (typeof detachPatientListListener === 'function') {
            detachPatientListListener();
        }
    } catch (_e) {}
    // 單一病人病歷監聽（依病人 ID 掛載的多個實例）
    try {
        if (typeof patientConsultationsListeners === 'object' && patientConsultationsListeners) {
            Object.keys(patientConsultationsListeners).forEach(function (pid) {
                const unsub = patientConsultationsListeners[pid];
                try { if (typeof unsub === 'function') unsub(); } catch (_e) {}
                delete patientConsultationsListeners[pid];
            });
        }
    } catch (_e) {}
    // 病歷管理頁列表監聽
    try {
        if (typeof medicalRecordListUnsubscribe === 'function') {
            medicalRecordListUnsubscribe();
            medicalRecordListUnsubscribe = null;
        }
    } catch (_e) {}
}

/**
 * 先拆除所有已知 onSnapshot 監聽，再 terminate Firestore 實例並清除
 * IndexedDB 離線快取。terminate／清除均設逾時，避免他分頁占用時永久懸浮。
 * @returns {Promise<boolean>} 僅在 terminate 與清除都成功時回 true；
 *   失敗（如其他分頁仍開著導致刪除被擋／逾時）回 false，呼叫端應保留
 *   PHI 標記，留待下次開頁再清。
 */
export async function shutdownFirestoreAndWipePersistence() {
    const fb = window.firebase;
    if (!fb || !fb.db) return false;

    detachAllKnownFirestoreListeners();

    let termOk = false;
    try {
        if (typeof fb.terminate === 'function') {
            await Promise.race([
                fb.terminate(fb.db),
                new Promise(function (resolve) { setTimeout(resolve, FIRESTORE_SHUTDOWN_TIMEOUT_MS); })
            ]);
            termOk = true;
        }
    } catch (termErr) {
        console.warn('終止 Firestore 實例失敗:', termErr && termErr.code ? termErr.code : termErr);
    }
    if (!termOk) return false;

    try {
        if (typeof fb.clearIndexedDbPersistence !== 'function') return false;
        let cleared = false;
        await Promise.race([
            fb.clearIndexedDbPersistence(fb.db).then(function () { cleared = true; }),
            new Promise(function (resolve) { setTimeout(resolve, FIRESTORE_SHUTDOWN_TIMEOUT_MS); })
        ]);
        if (!cleared) {
            console.warn('清除 Firestore 離線快取逾時（可能有其他分頁仍開啟中）');
            return false;
        }
        return true;
    } catch (clearErr) {
        console.warn('清除 Firestore 離線快取失敗（可能有其他分頁仍開啟中）:',
            clearErr && clearErr.code ? clearErr.code : clearErr);
        return false;
    }
}

export function reloadPageSoon(delayMs) {
    setTimeout(function () { window.location.reload(); }, typeof delayMs === 'number' ? delayMs : 800);
}

/**
 * 登出／登入被拒後的完整本機清掃：localStorage 業務鍵 + Firestore IndexedDB，
 * 完成（或逾時）後重新整理頁面取得全新 Firestore 實例。
 */
export async function wipeDeviceDataAndReload(delayMs) {
    try { clearLocalClinicData(); } catch (_e) {}
    let cleared = false;
    try { cleared = await shutdownFirestoreAndWipePersistence(); } catch (_e) {}
    if (cleared) {
        try { localStorage.removeItem(IDB_PHI_MARKER); } catch (_e) {}
    }
    reloadPageSoon(delayMs);
}

export async function logout() {
    try {
        
        
        
        
        try {
            if (window.ChatModule && typeof window.ChatModule.destroyChat === 'function') {
                window.ChatModule.destroyChat();
            }
        } catch (chatErr) {
            console.error('銷毀聊天模組失敗:', chatErr);
        }

        // 先移除收費項目 Firestore 監聽器，避免登出後規則拒絕存取報錯
        try {
            if (typeof window.__stopBillingItemsRealtimeSync === 'function') {
                window.__stopBillingItemsRealtimeSync();
            }
        } catch (billingErr) {
            console.error('移除收費項目監聽器失敗:', billingErr);
        }
        // 清空每診所錢包 session 快取，避免下一登入者看到舊資料
        try {
            if (typeof window.clearWalletCaches === 'function') {
                window.clearWalletCaches();
            }
        } catch (_walletCacheErr) {}

        // 登出不再拆除本裝置推播訂閱：瀏覽器訂閱、後端記錄與 pushDeviceEnabled
        // 標記皆保留，同一帳號重新登入後 syncPushState() 會自動恢復開啟狀態。
        // 共用裝置由不同帳號登入時，pwa.js 偵測 403 後經 claimDeviceSubscription
        // 自動接管；最後一個分頁關閉時 SW 的退訂機制亦不受影響。

        if (window.firebase && window.firebase.auth) {
            await window.firebase.signOut(window.firebase.auth);
        }

        
        
        
        try {
            
            if (typeof herbInventoryListenerAttached !== 'undefined' && herbInventoryListenerAttached) {
                
                const inventoryRef = window.firebase.ref(window.firebase.rtdb, 'herbInventory');
                
                window.firebase.off(inventoryRef, 'value');
                
                herbInventoryListenerAttached = false;
                herbInventoryInitialized = false;
            }
        } catch (err) {
            console.error('取消中藥庫存監聽器失敗:', err);
        }
        
        
        G.currentUser = null;
        G.currentUserData = null;

        // 清除本機瀏覽器中的病人／診所個資快取（監聽器皆已拆除，不會再被寫回；
        // 此類快取僅供離線使用，下次登入由 Firestore 重新載入），並同步清空
        // 記憶體中的個資陣列，避免同分頁換帳殘留前一位使用者資料。
        try {
            // 先停診症草稿自動保存，否則防抖排程可能在清掃後把主訴草稿寫回
            if (typeof stopConsultationSymptomsDraftAutosave === 'function') {
                stopConsultationSymptomsDraftAutosave();
            }
            clearLocalClinicData();
            if (typeof patients !== 'undefined') patients = [];
            if (typeof consultations !== 'undefined') consultations = [];
            if (typeof appointments !== 'undefined') appointments = [];
            if (typeof patientCache !== 'undefined') patientCache = null;
        } catch (cacheErr) {
            console.warn('登出清理本機快取失敗:', cacheErr);
        }

        // Firestore 實例終止並清除 IndexedDB 離線快取（SDK 僅允許 terminate 後
        // 清除）；實例終止後無法復用，顯示登出提示後重新整理頁面取得新實例。
        let firestoreWiped = false;
        try {
            firestoreWiped = await shutdownFirestoreAndWipePersistence();
        } catch (fsErr) {
            console.warn('Firestore 終止／清快取失敗:', fsErr);
        }
        if (firestoreWiped) {
            try { localStorage.removeItem(IDB_PHI_MARKER); } catch (_e) {}
        }

        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('mainSystem').classList.add('hidden');
        
        if (typeof hideGlobalCopyright === 'function') {
            try {
                hideGlobalCopyright();
            } catch (_e) {
                
            }
        }
        document.getElementById('sidebar').classList.add('-translate-x-full');
        document.getElementById('sidebarOverlay').classList.add('hidden');
        hideAllSections();

        
        try {
            
            if (typeof closeConsultationForm === 'function') {
                closeConsultationForm();
            } else if (document.getElementById('consultationForm')) {
                document.getElementById('consultationForm').classList.add('hidden');
            }

            
            if (typeof closeMedicalHistoryModal === 'function') {
                closeMedicalHistoryModal();
            } else if (document.getElementById('medicalHistoryModal')) {
                document.getElementById('medicalHistoryModal').classList.add('hidden');
            }

            
            if (typeof closePatientMedicalHistoryModal === 'function') {
                closePatientMedicalHistoryModal();
            } else if (document.getElementById('patientMedicalHistoryModal')) {
                document.getElementById('patientMedicalHistoryModal').classList.add('hidden');
            }
        } catch (e) {
            console.warn('登出時關閉診症相關面板時發生錯誤:', e);
        }

        
        document.getElementById('mainLoginUsername').value = '';
        document.getElementById('mainLoginPassword').value = '';
        
        G.showToast('已成功登出', 'success');
        // Firestore 已 terminate，短暫停留顯示提示後重新整理至乾淨的登入頁
        reloadPageSoon(1000);

    } catch (error) {
        console.error('登出錯誤:', error);
        G.showToast('登出時發生錯誤', 'error');
    }
}
