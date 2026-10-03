/* ============================================================
 * auth/staff.js — 員工與權限管理：用戶 CRUD、啟用／封存／復職、職位權限面板、診所名額
 * ------------------------------------------------------------
 * Phase 3 自 system.js 原樣遷入，邏輯零改動；舊全域存取一律經 G。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { archiveStaffAuthAccount, createStaffAuthAccount, syncStaffClaims } from './claims.js';

let editingUserId = null;
let currentUserFilter = 'all';
let usersFromFirebase = []; // 儲存從 Firebase 讀取的用戶數據

const clinicUserLimits = {
    clinicAdmin: 3,
    doctor: 5,
    assistant: 5,
    general: 5
};

export function getClinicIdForUser(user, fallbackClinicId) {
    try {
        const cid = user && (user.clinicId !== undefined && user.clinicId !== null) ? String(user.clinicId) : '';
        if (cid) return cid;
    } catch (_e) {}
    try {
        const fb = fallbackClinicId !== undefined && fallbackClinicId !== null ? String(fallbackClinicId) : '';
        return fb;
    } catch (_e) {
        return '';
    }
}

export function getClinicUserLimitGroup(position) {
    const p = position ? String(position).trim() : '';
    if (!p) return null;
    if (p === '醫師') return 'doctor';
    if (p === '護理師' || p === '助理') return 'assistant';
    if (p === '用戶' || p === '一般用戶') return 'general';
    if (p === '診所管理' || p.includes('管理')) return 'clinicAdmin';
    return null;
}

export function getClinicUserLimitLabel(group) {
    if (group === 'doctor') return '醫師';
    if (group === 'assistant') return '助理';
    if (group === 'clinicAdmin') return '診所管理';
    if (group === 'general') return '一般用戶';
    return '';
}

export function canActivateUserUnderClinicLimit(opts) {
    const usersList = Array.isArray(opts && opts.users) ? opts.users : [];
    const targetClinicId = opts && opts.clinicId !== undefined && opts.clinicId !== null ? String(opts.clinicId) : '';
    const targetPosition = opts && opts.position !== undefined && opts.position !== null ? String(opts.position) : '';
    const targetActive = !!(opts && opts.active);
    const excludeUserId = opts && opts.excludeUserId ? String(opts.excludeUserId) : null;
    if (!targetActive) return { ok: true };
    const group = getClinicUserLimitGroup(targetPosition);
    if (!group) return { ok: true };
    const limit = clinicUserLimits[group];
    if (!(limit > 0)) return { ok: true };
    const count = usersList.filter(u => {
        if (!u) return false;
        if (excludeUserId && String(u.id) === excludeUserId) return false;
        const isActive = u.active !== false;
        if (!isActive) return false;
        const cid = getClinicIdForUser(u, targetClinicId);
        if (String(cid) !== String(targetClinicId)) return false;
        return getClinicUserLimitGroup(u.position) === group;
    }).length;
    if (count >= limit) {
        return { ok: false, group, label: getClinicUserLimitLabel(group), limit, count };
    }
    return { ok: true, group, label: getClinicUserLimitLabel(group), limit, count };
}

export function getPrimaryClinicNameForUser(user) {
    try {
        const cid = user && user.clinicId !== undefined && user.clinicId !== null ? String(user.clinicId).trim() : '';
        if (!cid) return '-';
        if (cid === 'local-default') return '預設診所';
        if (Array.isArray(clinicsList)) {
            const c = clinicsList.find(x => x && String(x.id) === cid);
            if (c) {
                try {
                    if (typeof G.getClinicDisplayName === 'function') return G.getClinicDisplayName(c);
                } catch (_e) {}
                if (c.chineseName) return String(c.chineseName);
                if (c.englishName) return String(c.englishName);
            }
        }
        return cid;
    } catch (_e) {
        return '-';
    }
}

export async function loadUserManagement() {
    await loadUsersFromFirebase();
    displayUsers();
    
    // 搜尋功能
    const searchInput = document.getElementById('searchUser');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            displayUsers();
        });
    }
}

export async function loadPermissionManagementPanel() {
    const panel = document.getElementById('permissionManagementPanel');
    const positionSelect = document.getElementById('permissionPositionSelect');
    const hint = document.getElementById('permissionPositionHint');
    if (!panel || !positionSelect) return;
    if (!G.hasAccessToSection('userManagement')) {
        panel.classList.add('hidden');
        return;
    }
    panel.classList.remove('hidden');
    const currentPos = positionSelect.value || '';
    positionSelect.innerHTML = '<option value="">請選擇職位</option>';
    G.CLINIC_PERMISSION_POSITIONS.forEach(pos => {
        const option = document.createElement('option');
        option.value = pos;
        option.textContent = pos;
        positionSelect.appendChild(option);
    });
    if (currentPos && G.CLINIC_PERMISSION_POSITIONS.includes(currentPos)) {
        positionSelect.value = currentPos;
    }
    if (!positionSelect.value && G.CLINIC_PERMISSION_POSITIONS.length > 0) {
        positionSelect.value = G.CLINIC_PERMISSION_POSITIONS[0];
    }
    if (hint) hint.textContent = '請選擇要設定權限的職位';
    onPermissionPositionChanged();
}

export function onPermissionPositionChanged() {
    const positionSelect = document.getElementById('permissionPositionSelect');
    const hint = document.getElementById('permissionPositionHint');
    if (!positionSelect) return;
    const position = positionSelect.value ? String(positionSelect.value) : '';
    if (!position) {
        if (hint) hint.textContent = '請先選擇要設定權限的職位';
        G.CLINIC_SECTION_PERMISSION_OPTIONS.forEach(item => {
            const cb = document.getElementById(`permSection_${item.key}`);
            if (cb) cb.checked = false;
        });
        CLINIC_ACTION_PERMISSION_OPTIONS.forEach(item => {
            const cb = document.getElementById(`permAction_${item.key}`);
            if (cb) cb.checked = false;
        });
        return;
    }
    const settings = getEffectivePermissionSettingsForPosition(position);
    G.CLINIC_SECTION_PERMISSION_OPTIONS.forEach(item => {
        const cb = document.getElementById(`permSection_${item.key}`);
        if (cb) cb.checked = !!settings.sections[item.key];
    });
    CLINIC_ACTION_PERMISSION_OPTIONS.forEach(item => {
        const cb = document.getElementById(`permAction_${item.key}`);
        if (cb) cb.checked = !!settings.actions[item.key];
    });
    if (hint) hint.textContent = `目前設定職位：${position}`;
}

export async function saveSelectedPositionPermissions() {
    if (!G.hasAccessToSection('userManagement')) {
        G.showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    if (!currentClinicId) {
        G.showToast('未選擇診所', 'error');
        return;
    }
    const positionSelect = document.getElementById('permissionPositionSelect');
    if (!positionSelect || !positionSelect.value) {
        G.showToast('請先選擇要設定的職位', 'error');
        return;
    }
    const position = String(positionSelect.value);
    const sections = {};
    const actions = {};
    G.CLINIC_SECTION_PERMISSION_OPTIONS.forEach(item => {
        const cb = document.getElementById(`permSection_${item.key}`);
        sections[item.key] = !!(cb && cb.checked);
    });
    CLINIC_ACTION_PERMISSION_OPTIONS.forEach(item => {
        const cb = document.getElementById(`permAction_${item.key}`);
        actions[item.key] = !!(cb && cb.checked);
    });
    try {
        const currentMap = getClinicPositionPermissionSettingsMap();
        const nextMap = {
            ...currentMap,
            [position]: {
                sections,
                actions,
                // 標記此職位已於新版進入區塊權限面板明確儲存，
                // 會員儲值等基準開放區塊可被管理員明確關閉
                entryControlVersion: 2
            }
        };
        const payload = {
            positionPermissionSettings: nextMap,
            updatedAt: new Date().toISOString()
        };
        const result = await window.firebaseDataManager.updateClinic(currentClinicId, payload);
        if (!result || !result.success) {
            G.showToast('儲存權限設定失敗，請稍後再試', 'error');
            return;
        }
        clinicSettings.positionPermissionSettings = nextMap;
        clinicSettings.updatedAt = payload.updatedAt;
        if (Array.isArray(clinicsList)) {
            clinicsList = clinicsList.map(c => (String(c.id) === String(currentClinicId) ? { ...c, ...payload } : c));
            try { localStorage.setItem('clinics', JSON.stringify(clinicsList)); } catch (_e) {}
        }
        if (G.currentUserData && String(G.currentUserData.position || '') === position) {
            generateSidebarMenu();
            updateWelcomeCards();
        }
        G.showToast('權限設定已儲存', 'success');
    } catch (error) {
        console.error('儲存權限設定失敗:', error);
        G.showToast('儲存權限設定失敗，請稍後再試', 'error');
    }
}

// 從 Firebase 載入用戶數據
export async function loadUsersFromFirebase() {
    // 在載入用戶資料前先確保 Firebase DataManager 已就緒，避免尚未初始化造成讀取失敗
    if (typeof G.waitForFirebaseDataManager === 'function') {
        try {
            await G.waitForFirebaseDataManager();
        } catch (e) {
            console.warn('等待雲端數據管理器就緒時發生錯誤:', e);
        }
    }
    const tbody = document.getElementById('userList');
    // 若找不到 userList 元素，則提前結束
    if (!tbody) {
        console.warn('找不到 userList 元素，無法載入用戶列表');
        return;
    }
    // 顯示載入中
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <div class="mt-2">載入中...</div>
            </td>
        </tr>
    `;

    try {
        // 改為使用 fetchUsers() 以利用快取減少讀取次數
        const data = await G.fetchUsers();
        if (Array.isArray(data) && data.length > 0) {
            usersFromFirebase = data;
            G.users = data.map(user => ({
                ...user,
                createdAt: user.createdAt ? (user.createdAt.seconds ? new Date(user.createdAt.seconds * 1000).toISOString() : user.createdAt) : new Date().toISOString(),
                updatedAt: user.updatedAt ? (user.updatedAt.seconds ? new Date(user.updatedAt.seconds * 1000).toISOString() : user.updatedAt) : new Date().toISOString(),
                lastLogin: user.lastLogin ? (user.lastLogin.seconds ? new Date(user.lastLogin.seconds * 1000).toISOString() : user.lastLogin) : null
            }));
            console.log('已載入用戶數據 (使用快取):', usersFromFirebase.length, '筆');
        } else {
            // 如果讀取失敗或無資料，使用本地 users 數據
            usersFromFirebase = G.users;
            console.log('快取或雲端讀取失敗，使用本地用戶數據');
        }
    } catch (error) {
        console.error('載入用戶數據錯誤:', error);
        usersFromFirebase = G.users; // 使用本地數據作為備用
        G.showToast('載入用戶數據時發生錯誤，使用本地數據', 'warning');
    }
}

export function filterUsers(status) {
    currentUserFilter = status;
    
    // 更新按鈕樣式
    document.querySelectorAll('[id^="user-filter-"]').forEach(btn => {
        btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-200';
    });
    // 設定當前篩選按鈕樣式，若元素不存在則忽略
    const activeBtn = document.getElementById(`user-filter-${status}`);
    if (activeBtn) {
        activeBtn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 transition duration-200';
    }
    displayUsers();
}

export function displayUsers() {
    // 取得搜尋關鍵字，若搜尋欄位不存在則使用空字串
    const searchInput = document.getElementById('searchUser');
    const searchTerm = searchInput && searchInput.value
        ? String(searchInput.value).toLowerCase()
        : '';
    const tbody = document.getElementById('userList');
    // 若找不到 userList 元素則不進行渲染
    if (!tbody) {
        console.warn('找不到 userList 元素，無法渲染用戶列表');
        return;
    }
    
    // 使用 Firebase 數據或本地數據
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
    
    // 過濾用戶資料
    let filteredUsers = currentUsers.filter(user => {
        // 僅以姓名或電子郵件進行搜尋，不包含帳號
        const matchesSearch = user.name.toLowerCase().includes(searchTerm) ||
                            (user.email && user.email.toLowerCase().includes(searchTerm));
        
        let matchesFilter = true;
        const isArchivedUser = user.archived === true || user.status === 'archived';
        if (currentUserFilter === 'archived') {
            // 已離職：僅顯示封存用戶
            matchesFilter = isArchivedUser;
        } else if (currentUserFilter === 'inactive') {
            // 已停用：排除已封存（離職）者
            matchesFilter = !isArchivedUser && !user.active;
        } else {
            // 全部用戶：預設只顯示在職者（含停用但未離職），隱藏已封存者
            matchesFilter = !isArchivedUser;
        }

        return matchesSearch && matchesFilter;
    });
    
        tbody.innerHTML = '';
    
    if (filteredUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                    ${searchTerm ? '沒有找到符合條件的用戶' : '尚無用戶資料'}
                </td>
            </tr>
        `;
        return;
    }
    
        filteredUsers.forEach(user => {
        const isUserArchived = user.archived === true || user.status === 'archived';
        let statusClass;
        let statusText;
        if (isUserArchived) {
            statusClass = 'bg-gray-200 text-gray-600';
            statusText = '已離職';
        } else if (user.active) {
            statusClass = 'bg-green-100 text-green-800';
            statusText = '啟用';
        } else {
            statusClass = 'bg-red-100 text-red-800';
            statusText = '停用';
        }
        
        // 處理 Firebase Timestamp 格式
        let lastLogin = '從未登入';
        if (user.lastLogin) {
            if (user.lastLogin.seconds) {
                lastLogin = new Date(user.lastLogin.seconds * 1000).toLocaleString('zh-TW');
            } else {
                lastLogin = new Date(user.lastLogin).toLocaleString('zh-TW');
            }
        }
        // 對動態資料進行轉義
        const safeId = window.escapeHtml(String(user.id));
        const safeName = window.escapeHtml(user.name);
        const safePosition = window.escapeHtml(user.position || '未設定');
        const safePrimaryClinic = window.escapeHtml(getPrimaryClinicNameForUser(user));
        const safeRegNumber = user.position === '醫師' ? window.escapeHtml(user.registrationNumber || '未設定') : '-';
        const safeEmail = window.escapeHtml(user.email || '未設定');
        const safeLastLogin = window.escapeHtml(lastLogin);
        let actionsHtml;
        const superAdminEmail = 'admin@clinic.com';
        if (user.email && user.email.toLowerCase() === superAdminEmail) {
            actionsHtml = `<span class="text-gray-400 text-xs">主管理員不可修改</span>`;
        } else if (user.id === G.currentUserData.id) {
            actionsHtml = `
                        <button onclick="editUser('${safeId}')" class="text-blue-600 hover:text-blue-800">編輯</button>
                        <span class="text-gray-400 text-xs ml-1">當前用戶</span>
                    `;
        } else if (isUserArchived) {
            actionsHtml = `
                        <button onclick="editUser('${safeId}')" class="text-blue-600 hover:text-blue-800">編輯</button>
                        <button onclick="restoreUser('${safeId}')" class="text-green-600 hover:text-green-800">復職</button>
                    `;
        } else {
            actionsHtml = `
                        <button onclick="editUser('${safeId}')" class="text-blue-600 hover:text-blue-800">編輯</button>
                        <button onclick="toggleUserStatus('${safeId}')" class="text-orange-600 hover:text-orange-800">
                            ${user.active ? '停用' : '啟用'}
                        </button>
                        <button onclick="archiveUser('${safeId}')" class="text-red-600 hover:text-red-800">封存</button>
                    `;
        }
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-900">${safeName}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${safePosition}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${safePrimaryClinic}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${safeRegNumber}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeEmail}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600">${safeLastLogin}</td>
            <td class="px-4 py-3 text-sm space-x-2">${actionsHtml}</td>
        `;
        tbody.appendChild(row);
    });
}

export function showAddUserForm() {
    editingUserId = null;
    // 使用防呆處理，避免目標元素不存在時拋出錯誤
    const titleEl = document.getElementById('userFormTitle');
    if (titleEl) {
        titleEl.textContent = '新增用戶';
    }
    const saveBtnTextEl = document.getElementById('userSaveButtonText');
    if (saveBtnTextEl) {
        saveBtnTextEl.textContent = '儲存';
    }
    clearUserForm();
    setUserEmailFieldEditable(true);
    const modalEl = document.getElementById('addUserModal');
    if (modalEl) {
        modalEl.classList.remove('hidden');
    }
    // 新增用戶時顯示密碼欄位
    try {
        const pwdField = document.getElementById('passwordFields');
        if (pwdField) {
            pwdField.classList.remove('hidden');
        }
    } catch (_e) {}
}

export function hideAddUserForm() {
    document.getElementById('addUserModal').classList.add('hidden');
    clearUserForm();
    editingUserId = null;
}

export function clearUserForm() {
    ['userDisplayName', 'userPosition', 'userEmail', 'userPhone', 'userRegistrationNumber', 'userPassword', 'userPasswordConfirm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('userActive').checked = true;
    setUserEmailFieldEditable(true);
    
    // 隱藏註冊編號欄位
    document.getElementById('registrationNumberField').classList.add('hidden');
}

export function setUserEmailFieldEditable(isEditable, lockedEmail = '') {
    const emailEl = document.getElementById('userEmail');
    const hintEl = document.getElementById('userEmailHint');
    if (emailEl) {
        emailEl.readOnly = !isEditable;
        emailEl.classList.toggle('bg-gray-100', !isEditable);
        emailEl.classList.toggle('cursor-not-allowed', !isEditable);
    }
    if (hintEl) {
        hintEl.textContent = isEditable
            ? '新增用戶時設定登入電子郵件；建立後請透過帳號遷移流程調整。'
            : `此用戶的登入電子郵件目前不可在此直接修改${lockedEmail ? `：${lockedEmail}` : ''}`;
    }
}

// 切換註冊編號欄位顯示
export function toggleRegistrationNumberField() {
    const positionSelect = document.getElementById('userPosition');
    const registrationField = document.getElementById('registrationNumberField');
    
    if (positionSelect.value === '醫師') {
        registrationField.classList.remove('hidden');
    } else {
        registrationField.classList.add('hidden');
        // 清空註冊編號欄位
        document.getElementById('userRegistrationNumber').value = '';
    }
}

export async function editUser(id) {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!G.hasAccessToSection('userManagement')) {
        G.showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;
    // 禁止編輯主管理員帳號（使用電子郵件判斷）
    const superAdminEmail = 'admin@clinic.com';
    if (user.email && user.email.toLowerCase() === superAdminEmail) {
        G.showToast('主管理員帳號不可編輯！', 'error');
        return;
    }
    
    editingUserId = id;
    // 使用防呆處理，避免目標元素不存在時拋出錯誤
    const titleEl = document.getElementById('userFormTitle');
    if (titleEl) {
        titleEl.textContent = '編輯用戶';
    }
    const saveBtnTextEl = document.getElementById('userSaveButtonText');
    if (saveBtnTextEl) {
        saveBtnTextEl.textContent = '更新';
    }
    
    // 填充表單資料
    const displayNameEl = document.getElementById('userDisplayName');
    if (displayNameEl) displayNameEl.value = user.name || '';
    const positionEl = document.getElementById('userPosition');
    if (positionEl) positionEl.value = user.position || '';
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.value = user.email || '';
    setUserEmailFieldEditable(false, user.email || '');
    const phoneEl = document.getElementById('userPhone');
    if (phoneEl) phoneEl.value = user.phone || '';
    const regNumEl = document.getElementById('userRegistrationNumber');
    if (regNumEl) regNumEl.value = user.registrationNumber || '';
    const activeEl = document.getElementById('userActive');
    if (activeEl) activeEl.checked = user.active !== false;
    
    // 根據職位顯示或隱藏註冊編號欄位
    toggleRegistrationNumberField();

    // 編輯用戶時隱藏密碼欄位
    try {
        const pwdField = document.getElementById('passwordFields');
        if (pwdField) {
            pwdField.classList.add('hidden');
        }
    } catch (_e) {}
    
    const modalEl = document.getElementById('addUserModal');
    if (modalEl) {
        modalEl.classList.remove('hidden');
    }
}

export async function saveUser() {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!G.hasAccessToSection('userManagement')) {
        G.showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    const name = document.getElementById('userDisplayName').value.trim();
    const position = document.getElementById('userPosition').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const phone = document.getElementById('userPhone').value.trim();
    const registrationNumber = document.getElementById('userRegistrationNumber').value.trim();
    const active = document.getElementById('userActive').checked;

    // 取得密碼與確認密碼（可能不存在於編輯模式）
    const password = document.getElementById('userPassword') ? document.getElementById('userPassword').value : '';
    const passwordConfirm = document.getElementById('userPasswordConfirm') ? document.getElementById('userPasswordConfirm').value : '';

    // 產生內部用戶識別名稱（username）
    let username;
    if (email) {
        username = email.split('@')[0];
    } else {
        username = 'user_' + Date.now();
    }
    
    // 驗證必填欄位（姓名、職位與電子郵件）
    if (!email) {
        G.showToast('請填寫電子郵件地址！', 'error');
        return;
    }

    // 驗證必填欄位（姓名與職位）
    if (!name || !position) {
        G.showToast('請填寫必要資料（姓名、職位）！', 'error');
        return;
    }

    // 檢查電子郵件格式
    if (email) {
        // 基本電子郵件格式驗證
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            G.showToast('電子郵件格式不正確！', 'error');
            return;
        }
    }

    // 檢查電話格式：允許 7~15 位數字
    if (phone) {
        const phonePattern = /^\d{7,15}$/;
        if (!phonePattern.test(phone)) {
            G.showToast('電話格式不正確，請輸入 7-15 位數字！', 'error');
            return;
        }
    }
    
    // 醫師職位必須填寫註冊編號
    if (position === '醫師' && !registrationNumber) {
        G.showToast('醫師職位必須填寫中醫註冊編號！', 'error');
        return;
    }
    
    // 檢查電子郵件是否重複
    if (email) {
        const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
        const existingUserByEmail = currentUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase() && u.id !== editingUserId);
        if (existingUserByEmail) {
            G.showToast('此電子郵件已存在，請使用其他電子郵件！', 'error');
            return;
        }
    }
    
    // 驗證電子郵件格式
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            G.showToast('請輸入有效的電子郵件格式！', 'error');
            return;
        }
    }

    // 如果正在編輯，且用戶為主管理員則禁止編輯
    if (editingUserId) {
        const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
        const editingUser = currentUsers.find(u => u.id === editingUserId);
        const superAdminEmail = 'admin@clinic.com';
        if (editingUser && editingUser.email && editingUser.email.toLowerCase() === superAdminEmail) {
            G.showToast('主管理員帳號不可編輯！', 'error');
            return;
        }
    }

    const currentUsersForLimit = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
    const clinicIdForLimit = (() => {
        if (editingUserId) {
            const existing = currentUsersForLimit.find(u => u && String(u.id) === String(editingUserId));
            if (existing && existing.clinicId !== undefined && existing.clinicId !== null && String(existing.clinicId)) {
                return String(existing.clinicId);
            }
        }
        return currentClinicId ? String(currentClinicId) : 'local-default';
    })();
    const limitCheck = canActivateUserUnderClinicLimit({
        users: currentUsersForLimit,
        clinicId: clinicIdForLimit,
        position: position,
        active: active,
        excludeUserId: editingUserId ? String(editingUserId) : null
    });
    if (!limitCheck.ok) {
        G.showToast(`此診所「${limitCheck.label}」人數已達上限（${limitCheck.count}/${limitCheck.limit}），無法新增/啟用。`, 'error');
        return;
    }

    // 顯示保存中狀態：在按鈕中顯示旋轉小圈並禁用按鈕
    // 透過 id 取得按鈕，以避免使用 onclick 選擇器時無法精確匹配
    const saveButton = document.getElementById('userSaveButton');
    G.setButtonLoading(saveButton, '保存中...');

    try {
        if (editingUserId) {
            const existingUserRecord = (usersFromFirebase.length > 0 ? usersFromFirebase : G.users).find(u => u && String(u.id) === String(editingUserId));
            if (!existingUserRecord) {
                G.showToast('找不到要更新的用戶資料！', 'error');
                return;
            }
            const lockedEmail = (existingUserRecord.email || '').trim();
            if (String(email) !== String(lockedEmail)) {
                G.showToast('登入電子郵件目前不可在此直接修改，請維持原值。', 'error');
                return;
            }
            // 已封存（離職）用戶不可透過編輯表單直接啟用；恢復帳號請使用「復職」
            const editingArchived = existingUserRecord.archived === true
                || existingUserRecord.status === 'archived';
            const effectiveActive = editingArchived ? false : active;
            if (editingArchived && active) {
                G.showToast('該用戶已離職封存，請使用「已離職」清單中的「復職」按鈕恢復帳號', 'warning');
            }
            // 更新現有用戶
            const userData = {
                name: name,
                position: position,
                registrationNumber: position === '醫師' ? registrationNumber : null,
                email: lockedEmail,
                phone: phone,
                uid: existingUserRecord.uid || '',
                active: effectiveActive,
                clinicId: clinicIdForLimit
            };
            // 保留已有的權限設定；沒有的用戶不帶此欄位（Firestore 不接受 undefined）
            if (existingUserRecord.permissionSettings !== undefined
                && existingUserRecord.permissionSettings !== null) {
                userData.permissionSettings = existingUserRecord.permissionSettings;
            }

            const result = await window.firebaseDataManager.updateUser(editingUserId, userData);
            
            if (result.success) {
                // 更新本地數據
                const userIndex = G.users.findIndex(u => u.id === editingUserId);
                if (userIndex !== -1) {
                    G.users[userIndex] = { ...users[userIndex], ...userData, updatedAt: new Date().toISOString() };
                }

                // 更新 Firebase 數據
                const firebaseUserIndex = usersFromFirebase.findIndex(u => u.id === editingUserId);
                if (firebaseUserIndex !== -1) {
                    usersFromFirebase[firebaseUserIndex] = { ...usersFromFirebase[firebaseUserIndex], ...userData };
                }
                
                // 如果更新的是當前登入用戶，同步更新 currentUserData
                if (editingUserId === G.currentUserData.id) {
                    G.currentUserData = { ...currentUserData, ...userData };
                    G.currentUser = G.users[userIndex].username;
                    
                    // 更新顯示的用戶資訊
                    document.getElementById('userRole').textContent = `當前用戶：${G.getUserDisplayName(G.currentUserData)}`;
                    document.getElementById('sidebarUserRole').textContent = `當前用戶：${G.getUserDisplayName(G.currentUserData)}`;
                }

                // 同步授權到 custom claims（職位/診所/啟用狀態變更即時反映到 ID Token）
                if (existingUserRecord.uid) {
                    try {
                        await syncStaffClaims(
                            { id: editingUserId, uid: existingUserRecord.uid },
                            { forceRevoke: userData.active === false }
                        );
                    } catch (claimsErr) {
                        console.error('同步用戶授權 claims 失敗:', claimsErr);
                        G.showToast('用戶資料已更新，但授權同步失敗：請重試或執行 adminClaimsBootstrap() 修復', 'error');
                    }
                } else {
                    console.warn('用戶缺少 Auth uid，無法同步 claims:', editingUserId);
                }

                G.showToast('用戶資料已成功更新！', 'success');
            } else {
                G.showToast('更新用戶資料失敗，請稍後再試', 'error');
                return;
            }
        } else {
            // 新增用戶
            // 新增用戶一律透過 Firebase Auth 建立帳號
            let newUid = '';
            if (email) {
                // 驗證密碼與確認密碼
                if (!password || !passwordConfirm) {
                    G.showToast('請輸入並確認密碼！', 'error');
                    G.clearButtonLoading(saveButton);
                    return;
                }
                if (password !== passwordConfirm) {
                    G.showToast('兩次輸入的密碼不一致！', 'error');
                    G.clearButtonLoading(saveButton);
                    return;
                }
                if (password.length < 6) {
                    G.showToast('密碼長度至少需 6 位數！', 'error');
                    G.clearButtonLoading(saveButton);
                    return;
                }
                try {
                    // 經後端 Service Account 建立 Auth 帳號：
                    // 不可用客戶端 createUserWithEmailAndPassword，否則管理員的
                    // 瀏覽器工作階段會被切換成新帳號（無 admin claims，後續寫入全被拒）
                    const created = await createStaffAuthAccount({ email, password, displayName: name });
                    newUid = created.uid;
                } catch (authErr) {
                    console.error('建立系統帳號失敗:', authErr);
                    // SDK 原生錯誤訊息可能含供應商名稱，顯示前先遮蔽
                    const rawAuthMsg = authErr && authErr.message ? String(authErr.message) : '';
                    const safeAuthMsg = rawAuthMsg
                        .replace(/firebase authentication|firebase auth|firestore|firebase|cloudflare/gi, '系統');
                    G.showToast('建立系統帳號失敗：' + safeAuthMsg, 'error');
                    G.clearButtonLoading(saveButton);
                    return;
                }
            }
            // 構建用戶資料
            const userData = {
                username: username,
                name: name,
                position: position,
                registrationNumber: position === '醫師' ? registrationNumber : null,
                email: email,
                phone: phone,
                uid: newUid || '',
                active: active,
                clinicId: clinicIdForLimit,
                lastLogin: null
            };
            const result = await window.firebaseDataManager.addUser(userData);
            if (result.success) {
                // 更新本地數據
                const newUser = {
                    id: result.id,
                    ...userData,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                G.users.push(newUser);
                usersFromFirebase.push(newUser);

                // 同步授權到 custom claims 與 userAuthIndex（後端 SA 寫入）
                if (newUid) {
                    try {
                        await syncStaffClaims({ id: result.id, uid: newUid }, { forceRevoke: !userData.active });
                    } catch (claimsErr) {
                        console.error('同步新用戶授權 claims 失敗:', claimsErr);
                        G.showToast('用戶已建立，但授權同步失敗：請重新編輯此用戶並儲存，或執行 adminClaimsBootstrap() 修復', 'error');
                    }
                }

                G.showToast('用戶已成功新增！', 'success');
            } else {
                G.showToast('新增用戶失敗，請稍後再試', 'error');
                G.clearButtonLoading(saveButton);
                return;
            }
        }
        
        // 保存到本地儲存作為備用
        localStorage.setItem('users', JSON.stringify(G.users));
        displayUsers();
        hideAddUserForm();

    } catch (error) {
        console.error('保存用戶資料錯誤:', error);
        G.showToast('保存時發生錯誤', 'error');
    } finally {
        // 恢復按鈕狀態與內容
        G.clearButtonLoading(saveButton);
    }
}

export async function toggleUserStatus(id) {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!G.hasAccessToSection('userManagement')) {
        G.showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;
    
    // 防止停用自己的帳號
    if (user.id === G.currentUserData.id) {
        G.showToast('不能停用自己的帳號！', 'error');
        return;
    }
    // 禁止停用主管理員帳號（使用電子郵件判斷）
    const superAdminEmail = 'admin@clinic.com';
    if (user.email && user.email.toLowerCase() === superAdminEmail) {
        G.showToast('主管理員帳號不可停用！', 'error');
        return;
    }

    if (!user.active) {
        const currentUsersForLimit = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
        const clinicIdForLimit = getClinicIdForUser(user, (currentClinicId ? String(currentClinicId) : 'local-default'));
        const limitCheck = canActivateUserUnderClinicLimit({
            users: currentUsersForLimit,
            clinicId: clinicIdForLimit,
            position: user.position,
            active: true,
            excludeUserId: String(id)
        });
        if (!limitCheck.ok) {
            G.showToast(`此診所「${limitCheck.label}」人數已達上限（${limitCheck.count}/${limitCheck.limit}），無法啟用。`, 'error');
            return;
        }
    }
    
    const action = user.active ? '停用' : '啟用';
    // 啟用/停用用戶確認訊息支援中英文
    const lang8 = localStorage.getItem('lang') || 'zh';
    const zhMsg8 = `確定要${action}用戶「${user.name}」嗎？\n\n${user.active ? '停用後該用戶將無法登入系統。' : '啟用後該用戶可以正常登入系統。'}`;
    const actionEn = user.active ? 'disable' : 'enable';
    const enMsg8 = `Are you sure you want to ${actionEn} user \"${user.name}\"?\n\n${user.active ? 'Once disabled, this user will not be able to log in.' : 'Once enabled, this user will be able to log in normally.'}`;
    const confirmMsg8 = lang8 === 'en' ? enMsg8 : zhMsg8;
    const confirmedToggle = await G.showConfirmation(confirmMsg8, 'warning');
    if (confirmedToggle) {
        // 顯示處理中狀態
        G.showToast('處理中...', 'info');

        try {
            const userData = {
                active: !user.active
            };

            const result = await window.firebaseDataManager.updateUser(id, userData);
            
            if (result.success) {
                // 更新本地數據
                const userIndex = G.users.findIndex(u => u.id === id);
                if (userIndex !== -1) {
                    G.users[userIndex].active = !user.active;
                    G.users[userIndex].updatedAt = new Date().toISOString();
                }

                // 更新 Firebase 數據
                const firebaseUserIndex = usersFromFirebase.findIndex(u => u.id === id);
                if (firebaseUserIndex !== -1) {
                    usersFromFirebase[firebaseUserIndex].active = !user.active;
                }

                // 同步 claims：停用时 active=false 並撤銷 refresh token；
                // 啟用時恢復 active=true
                if (user.uid) {
                    try {
                        await syncStaffClaims(
                            { id, uid: user.uid },
                            { forceRevoke: user.active === true }
                        );
                    } catch (claimsErr) {
                        console.error('同步用戶啟用狀態 claims 失敗:', claimsErr);
                        G.showToast('帳號狀態已更新，但授權同步失敗：請重試或執行 adminClaimsBootstrap() 修復', 'error');
                    }
                }

                localStorage.setItem('users', JSON.stringify(G.users));
                displayUsers();
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    // Determine English action words
                    const actionZh = action; // '停用' or '啟用'
                    const actionEn = user.active ? 'disabled' : 'enabled';
                    const zhMsg = `用戶「${user.name}」已${actionZh}！`;
                    const enMsg = `User "${user.name}" has been ${actionEn}!`;
                    const msg = lang === 'en' ? enMsg : zhMsg;
                    G.showToast(msg, 'success');
                }
            } else {
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    // For failure message, refer to the action in English or Chinese
                    const actionEn = user.active ? 'disable' : 'enable';
                    const zhMsg = `${action}用戶失敗，請稍後再試`;
                    const enMsg = `Failed to ${actionEn} user, please try again later`;
                    const msg = lang === 'en' ? enMsg : zhMsg;
                    G.showToast(msg, 'error');
                }
            }
        } catch (error) {
            console.error('更新用戶狀態錯誤:', error);
            G.showToast('更新用戶狀態時發生錯誤', 'error');
        }
    }
}

// 將封存/復職後的用戶資料同步更新到本地各份快取
export function patchLocalUserRecord(id, patch) {
    const applyPatch = (list) => {
        if (!Array.isArray(list)) return list;
        return list.map(u => (u && u.id === id ? { ...u, ...patch } : u));
    };
    G.users = applyPatch(G.users);
    usersFromFirebase = applyPatch(usersFromFirebase);
    try {
        if (Array.isArray(G.userCache)) {
            G.userCache = applyPatch(G.userCache);
        }
    } catch (_e) {
        // userCache 未定義或不可用時忽略
    }
    try {
        localStorage.setItem('users', JSON.stringify(G.users));
    } catch (_lsErr) {
        // localStorage 寫入失敗時忽略
    }
}

// 封存用戶（離職）：軟刪除，保留 users 文件與 Auth 帳號作審計追溯
export async function archiveUser(id) {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!G.hasAccessToSection('userManagement')) {
        G.showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;

    // 防止封存自己的帳號
    if (user.id === G.currentUserData.id) {
        G.showToast('不能封存自己的帳號！', 'error');
        return;
    }
    // 禁止封存主管理員帳號（使用電子郵件判斷）
    const superAdminEmail = 'admin@clinic.com';
    if (user.email && user.email.toLowerCase() === superAdminEmail) {
        G.showToast('主管理員帳號不可封存！', 'error');
        return;
    }

    // 檢查是否為最後一個在職管理員
    const activeAdmins = currentUsers.filter(
        u => u.position === '診所管理'
            && u.active !== false
            && u.archived !== true
            && u.status !== 'archived'
            && u.id !== id
    );
    if (user.position === '診所管理' && activeAdmins.length === 0) {
        G.showToast('不能封存最後一個在職診所管理帳號！', 'error');
        return;
    }

    // 封存確認（可選填離職原因），支援中英文
    const lang = localStorage.getItem('lang') || 'zh';
    const safeName = window.escapeHtml(user.name || '');
    const safePosition = window.escapeHtml(user.position || '');
    const safeEmail = window.escapeHtml(user.email || (lang === 'en' ? 'Not set' : '未設定'));
    const swalResult = await Swal.fire({
        icon: 'warning',
        title: lang === 'en' ? 'Archive user (resigned)?' : '封存用戶（離職）？',
        html: lang === 'en'
            ? `User: <b>${safeName}</b><br/>Position: ${safePosition}<br/>Email: ${safeEmail}<br/><br/>The account will be disabled and cannot log in. Records are retained for audit and can be restored later.`
            : `用戶：<b>${safeName}</b><br/>職位：${safePosition}<br/>電子郵件：${safeEmail}<br/><br/>封存後該帳號將停用且無法登入，資料保留供日後審計，可隨時復職。`,
        input: 'text',
        inputPlaceholder: lang === 'en' ? 'Resignation reason (optional)' : '離職原因（選填）',
        showCancelButton: true,
        confirmButtonText: lang === 'en' ? 'Archive' : '確定封存',
        cancelButtonText: lang === 'en' ? 'Cancel' : '取消',
        focusConfirm: false
    });
    if (!swalResult || !swalResult.isConfirmed) return;
    const reason = String(swalResult.value || '').trim().slice(0, 200);

    G.showToast(lang === 'en' ? 'Archiving...' : '封存中...', 'info');

    try {
        const result = await window.firebaseDataManager.archiveUser(id, true, reason);
        if (!result.success) {
            G.showToast(lang === 'en' ? 'Failed to archive user, please try again later' : '封存用戶失敗，請稍後再試', 'error');
            return;
        }

        // 更新本地數據
        patchLocalUserRecord(id, {
            active: false,
            status: 'archived',
            archived: true,
            archivedAt: new Date().toISOString(),
            archivedBy: G.currentUser || 'system',
            archiveReason: reason
        });

        // 後端停用 Auth 帳號、同步 active=false claims 並撤銷工作階段（Auth 帳號保留）
        if (user.uid) {
            try {
                await archiveStaffAuthAccount(user.uid, id, true);
            } catch (claimsErr) {
                console.error('封存 Auth 帳號失敗:', claimsErr);
                G.showToast('用戶已封存，但 Auth 帳號停用失敗：請於已離職清單重試或手動處理', 'error');
            }
        } else {
            console.warn('用戶缺少 Auth uid，封存時未同步 Auth 狀態:', id);
            G.showToast('用戶已封存，但缺少 Auth 帳號關聯，該帳號無法被停用，請手動核查', 'warning');
        }

        displayUsers();
        const zhMsg = `用戶「${user.name}」已封存（離職）！`;
        const enMsg = `User "${user.name}" has been archived!`;
        G.showToast(lang === 'en' ? enMsg : zhMsg, 'success');
    } catch (error) {
        console.error('封存用戶錯誤:', error);
        G.showToast(lang === 'en' ? 'Error while archiving user' : '封存用戶時發生錯誤', 'error');
    }
}

// 復職用戶：重新啟用帳號並恢復登入
export async function restoreUser(id) {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!G.hasAccessToSection('userManagement')) {
        G.showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : G.users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;

    // 復職等同重新啟用，須符合診所人數上限
    const limitCheck = canActivateUserUnderClinicLimit({
        users: currentUsers,
        clinicId: (user.clinicId !== undefined && user.clinicId !== null) ? String(user.clinicId) : (currentClinicId || 'local-default'),
        position: user.position,
        active: true,
        excludeUserId: String(id)
    });
    if (!limitCheck.ok) {
        G.showToast(`此診所「${limitCheck.label}」人數已達上限（${limitCheck.count}/${limitCheck.limit}），無法復職。`, 'error');
        return;
    }

    const lang = localStorage.getItem('lang') || 'zh';
    const zhMsg0 = `確定要讓用戶「${user.name}」復職嗎？\n\n復職後該用戶可以正常登入系統。`;
    const enMsg0 = `Are you sure you want to restore user \"${user.name}\"?\n\nOnce restored, the user will be able to log in normally.`;
    const confirmed = await G.showConfirmation(lang === 'en' ? enMsg0 : zhMsg0, 'warning');
    if (!confirmed) return;

    G.showToast(lang === 'en' ? 'Restoring...' : '復職處理中...', 'info');

    try {
        const result = await window.firebaseDataManager.archiveUser(id, false);
        if (!result.success) {
            G.showToast(lang === 'en' ? 'Failed to restore user, please try again later' : '復職失敗，請稍後再試', 'error');
            return;
        }

        // 更新本地數據
        patchLocalUserRecord(id, {
            active: true,
            status: 'active',
            archived: false,
            restoredAt: new Date().toISOString(),
            restoredBy: G.currentUser || 'system'
        });

        // 後端重新啟用 Auth 帳號並同步 active=true claims
        if (user.uid) {
            try {
                await archiveStaffAuthAccount(user.uid, id, false);
            } catch (claimsErr) {
                console.error('復職啟用 Auth 帳號失敗:', claimsErr);
                G.showToast('用戶已復職，但 Auth 帳號啟用失敗：請重試或手動處理', 'error');
            }
        } else {
            console.warn('用戶缺少 Auth uid，復職時未同步 Auth 狀態:', id);
        }

        displayUsers();
        const zhMsg = `用戶「${user.name}」已復職！`;
        const enMsg = `User "${user.name}" has been restored!`;
        G.showToast(lang === 'en' ? enMsg : zhMsg, 'success');
    } catch (error) {
        console.error('復職用戶錯誤:', error);
        G.showToast(lang === 'en' ? 'Error while restoring user' : '復職用戶時發生錯誤', 'error');
    }
}
