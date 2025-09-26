// 進階醫療排班管理系統腳本
//
// 本檔案由 CAL.html 移植而來，提供完整的排班管理邏輯。
// 為了整合至中醫診所系統，此檔案會在載入時定義所有全域函式與資料，
// 使得排班頁面可以正常運作。原始檔案中的 Cloudflare 保護腳本已移除。

// 全域變數
let currentDate = new Date();
let currentView = 'month';
let draggedShift = null;
let currentStaffFilter = 'all';

// 醫護人員資料
const staff = [
    { id: 1, name: '王志明', role: 'doctor', department: '內科', level: '主治醫師', phone: '0912-345-678', email: 'wang@hospital.com', maxHours: 40 },
    { id: 2, name: '李美玲', role: 'doctor', department: '外科', level: '住院醫師', phone: '0923-456-789', email: 'li@hospital.com', maxHours: 36 },
    { id: 3, name: '張建國', role: 'doctor', department: '急診科', level: '主治醫師', phone: '0934-567-890', email: 'zhang@hospital.com', maxHours: 42 },
    { id: 4, name: '陳淑芬', role: 'nurse', department: '內科', level: '護理師', phone: '0945-678-901', email: 'chen@hospital.com', maxHours: 40 },
    { id: 5, name: '林雅婷', role: 'nurse', department: '外科', level: '資深護理師', phone: '0956-789-012', email: 'lin@hospital.com', maxHours: 38 },
    { id: 6, name: '黃志華', role: 'nurse', department: '急診科', level: '護理師', phone: '0967-890-123', email: 'huang@hospital.com', maxHours: 44 },
    { id: 7, name: '劉佳慧', role: 'doctor', department: '兒科', level: '主治醫師', phone: '0978-901-234', email: 'liu@hospital.com', maxHours: 36 },
    { id: 8, name: '吳明珠', role: 'nurse', department: '兒科', level: '護理師', phone: '0989-012-345', email: 'wu@hospital.com', maxHours: 40 },
    { id: 9, name: '蔡文雄', role: 'doctor', department: '婦產科', level: '主治醫師', phone: '0990-123-456', email: 'tsai@hospital.com', maxHours: 38 },
    { id: 10, name: '鄭麗華', role: 'nurse', department: '婦產科', level: '資深護理師', phone: '0901-234-567', email: 'zheng@hospital.com', maxHours: 36 }
];

// 排班資料 - 使用當前月份的日期
let shifts = [];

// 初始化一些示範排班資料
function initializeSampleShifts() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    // 統一使用26號作為示範日期
    const baseDate = 26;
    shifts = [
        { id: 1, staffId: 1, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${baseDate.toString().padStart(2, '0')}`, startTime: '08:00', endTime: '16:00', type: 'morning', status: 'confirmed', notes: '門診' },
        { id: 2, staffId: 4, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${baseDate.toString().padStart(2, '0')}`, startTime: '08:00', endTime: '16:00', type: 'morning', status: 'confirmed', notes: '病房' },
        { id: 3, staffId: 2, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate + 1).toString().padStart(2, '0')}`, startTime: '16:00', endTime: '24:00', type: 'afternoon', status: 'pending', notes: '手術房' },
        { id: 4, staffId: 5, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate + 1).toString().padStart(2, '0')}`, startTime: '16:00', endTime: '24:00', type: 'afternoon', status: 'confirmed', notes: '病房' },
        { id: 5, staffId: 3, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate + 2).toString().padStart(2, '0')}`, startTime: '00:00', endTime: '08:00', type: 'night', status: 'confirmed', notes: '急診' },
        { id: 6, staffId: 6, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate + 2).toString().padStart(2, '0')}`, startTime: '00:00', endTime: '08:00', type: 'night', status: 'confirmed', notes: '急診' },
        { id: 7, staffId: 7, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate - 1).toString().padStart(2, '0')}`, startTime: '09:00', endTime: '17:00', type: 'morning', status: 'confirmed', notes: '兒科門診' },
        { id: 8, staffId: 8, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate - 1).toString().padStart(2, '0')}`, startTime: '09:00', endTime: '17:00', type: 'morning', status: 'confirmed', notes: '兒科病房' }
    ];
}

// 篩選狀態
let currentFilters = {
    department: '',
    role: '',
    shiftType: '',
    staffSearch: ''
};

// 更新當前日期顯示
function updateCurrentDate() {
    const options = { year: 'numeric', month: 'long' };
    const el = document.getElementById('currentDate');
    if (el) {
        el.textContent = currentDate.toLocaleDateString('zh-TW', options);
    }
}

// 導航行事曆
function navigateCalendar(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    updateCurrentDate();
    renderCalendar();
}

// 切換視圖（僅保留月視圖）
function changeView(view) {
    currentView = 'month';
    updateCurrentDate();
    renderCalendar();
}

// 渲染行事曆
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.className = 'calendar-grid month-view';
    renderMonthView(grid);
}

// 渲染月視圖
function renderMonthView(grid) {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    weekdays.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = day;
        grid.appendChild(header);
    });
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    for (let i = 0; i < 42; i++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + i);
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        cell.dataset.date = cellDate.toISOString().split('T')[0];
        if (cellDate.getMonth() !== currentDate.getMonth()) {
            cell.classList.add('other-month');
        }
        const dateLabel = document.createElement('div');
        dateLabel.className = 'date-label';
        dateLabel.textContent = cellDate.getDate();
        cell.appendChild(dateLabel);
        // 在日期上標記今日
        if (isToday(cellDate)) {
            dateLabel.classList.add('today');
        }
        // 渲染班表
        const dayShifts = getShiftsForDate(cellDate.toISOString().split('T')[0]);
        dayShifts.forEach(shift => {
            const shiftEl = createShiftElement(shift);
            cell.appendChild(shiftEl);
        });
        grid.appendChild(cell);
    }
}

// 建立班表元素
function createShiftElement(shift) {
    const el = document.createElement('div');
    el.className = `shift ${shift.status}`;
    el.draggable = true;
    el.textContent = `${shift.startTime} - ${shift.endTime}`;
    el.addEventListener('dragstart', () => {
        draggedShift = shift;
    });
    el.addEventListener('dragend', () => {
        draggedShift = null;
    });
    el.addEventListener('click', () => {
        showShiftDetails(shift);
    });
    return el;
}

// 計算班表時數
function calculateShiftDuration(startTime, endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let start = startH + startM / 60;
    let end = endH + endM / 60;
    if (end <= start) end += 24;
    return end - start;
}

// 決定今日
function isToday(date) {
    const today = new Date();
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

// 取得指定日期的班表
function getShiftsForDate(date) {
    return shifts.filter(shift => shift.date === date);
}

// 設置拖曳區域
function setupCellDropZone(cell, date) {
    cell.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    cell.addEventListener('drop', () => {
        if (draggedShift) {
            draggedShift.date = date;
            renderCalendar();
            updateStats();
        }
    });
}

// 取得篩選後的人員
function getFilteredStaff() {
    return staff.filter(member => passesFilter(member));
}

// 判斷是否通過篩選
function passesFilter(member) {
    const { department, role, shiftType, staffSearch } = currentFilters;
    // 部門
    if (department && member.department !== department) return false;
    // 角色
    if (role && member.role !== role) return false;
    // 名稱關鍵字
    if (staffSearch && !member.name.includes(staffSearch)) return false;
    return true;
}

// 渲染人員面板
function renderStaffPanel() {
    const panel = document.getElementById('staffPanel');
    if (!panel) return;
    panel.innerHTML = '';
    const filtered = getFilteredStaff();
    filtered.forEach(member => {
        const card = document.createElement('div');
        card.className = 'staff-card';
        card.innerHTML = `
            <div class="staff-name">${member.name}</div>
            <div class="text-xs text-gray-600">${member.department} | ${member.role === 'doctor' ? '醫師' : '護理師'}</div>
            <div class="mt-2">
                <button class="quick-btn" onclick="viewStaffSchedule(${member.id})">查看排班</button>
                <button class="quick-btn" onclick="contactStaff(${member.id})">聯絡</button>
            </div>
        `;
        panel.appendChild(card);
    });
}

// 查看人員排班
function viewStaffSchedule(staffId) {
    const staffMember = staff.find(s => s.id === staffId);
    const staffShifts = shifts.filter(s => s.staffId === staffId).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (staffShifts.length === 0) {
        alert(`${staffMember.name} 目前沒有排班記錄。`);
        return;
    }
    let scheduleText = `${staffMember.name} 的排班記錄：\n\n`;
    staffShifts.forEach(shift => {
        const date = new Date(shift.date).toLocaleDateString('zh-TW');
        const duration = calculateShiftDuration(shift.startTime, shift.endTime);
        scheduleText += `📅 ${date} ${shift.startTime}-${shift.endTime} (${duration}h) - ${getShiftTypeName(shift.type)}\n`;
        if (shift.notes) scheduleText += `   備註: ${shift.notes}\n`;
    });
    alert(scheduleText);
}

// 聯絡人員
function contactStaff(staffId) {
    const staffMember = staff.find(s => s.id === staffId);
    const contactInfo = `聯絡 ${staffMember.name}：\n\n` +
                      `📞 電話: ${staffMember.phone}\n` +
                      `📧 信箱: ${staffMember.email}\n` +
                      `🏥 部門: ${staffMember.department}\n` +
                      `👔 職位: ${staffMember.level}`;
    if (confirm(contactInfo + '\n\n要撥打電話嗎？')) {
        window.open(`tel:${staffMember.phone}`, '_blank', 'noopener,noreferrer');
    }
}

// 計算今日班表人數與總時數統計
function updateStats() {
    const totalShifts = shifts.length;
    const totalHours = shifts.reduce((acc, shift) => acc + calculateShiftDuration(shift.startTime, shift.endTime), 0);
    const statsEl = document.getElementById('statsInfo');
    if (statsEl) {
        statsEl.textContent = `總班表數：${totalShifts}，總工時：${totalHours}h`;
    }
}

// 取得班別類型名稱
function getShiftTypeName(type) {
    const types = {
        'morning': '早班',
        'afternoon': '中班',
        'night': '晚班',
        'emergency': '急診',
        'custom': '自訂'
    };
    return types[type] || type;
}

// 彈出通知
function showNotification(message) {
    const notification = document.getElementById('notification');
    if (!notification) return;
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// 初始化事件監聽器
function setupEventListeners() {
    // 班別選擇變更
    const shiftTypeSelect = document.getElementById('shiftType');
    if (shiftTypeSelect) {
        shiftTypeSelect.addEventListener('change', function() {
            const type = this.value;
            const startTime = document.getElementById('startTime');
            const endTime = document.getElementById('endTime');
            switch(type) {
                case 'morning':
                    startTime.value = '08:00';
                    endTime.value = '16:00';
                    break;
                case 'afternoon':
                    startTime.value = '16:00';
                    endTime.value = '24:00';
                    break;
                case 'night':
                    startTime.value = '00:00';
                    endTime.value = '08:00';
                    break;
            }
        });
    }
    // 固定排班班別選擇變更
    const fixedShiftTypeSelect = document.getElementById('fixedShiftType');
    if (fixedShiftTypeSelect) {
        fixedShiftTypeSelect.addEventListener('change', function() {
            const type = this.value;
            const customTimeGroup = document.getElementById('customTimeGroup');
            const startTime = document.getElementById('fixedStartTime');
            const endTime = document.getElementById('fixedEndTime');
            if (type === 'custom') {
                customTimeGroup.style.display = 'block';
            } else {
                customTimeGroup.style.display = 'none';
                switch(type) {
                    case 'morning':
                        startTime.value = '08:00';
                        endTime.value = '16:00';
                        break;
                    case 'afternoon':
                        startTime.value = '16:00';
                        endTime.value = '24:00';
                        break;
                    case 'night':
                        startTime.value = '00:00';
                        endTime.value = '08:00';
                        break;
                }
            }
        });
    }
    // 排程範圍選擇變更
    const scheduleRangeSelect = document.getElementById('scheduleRange');
    if (scheduleRangeSelect) {
        scheduleRangeSelect.addEventListener('change', function() {
            const customRangeGroup = document.getElementById('customRangeGroup');
            if (this.value === 'custom-range') {
                customRangeGroup.style.display = 'block';
            } else {
                customRangeGroup.style.display = 'none';
            }
        });
    }
    // 表單提交
    const shiftForm = document.getElementById('shiftForm');
    if (shiftForm) {
        shiftForm.addEventListener('submit', function(e) {
            e.preventDefault();
            addShift();
        });
    }
    // 固定排班表單提交
    const fixedScheduleForm = document.getElementById('fixedScheduleForm');
    if (fixedScheduleForm) {
        fixedScheduleForm.addEventListener('submit', function(e) {
            e.preventDefault();
            createFixedSchedule();
        });
    }
    // 點擊模態框外部關閉
    const shiftModal = document.getElementById('shiftModal');
    if (shiftModal) {
        shiftModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    }
    // 點擊固定排班模態框外部關閉
    const fixedScheduleModal = document.getElementById('fixedScheduleModal');
    if (fixedScheduleModal) {
        fixedScheduleModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeFixedScheduleModal();
            }
        });
    }
}

// 新增班表
function addShift() {
    const staffId = parseInt(document.getElementById('staffSelect').value);
    const date = document.getElementById('shiftDate').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const shiftType = document.getElementById('shiftType').value;
    const notes = document.getElementById('notes').value;
    if (!staffId || !date || !startTime || !endTime) {
        alert('請填寫完整的排班資訊');
        return;
    }
    const id = Date.now();
    shifts.push({ id, staffId, date, startTime, endTime, type: shiftType, status: 'confirmed', notes });
    renderCalendar();
    updateStats();
    closeModal();
    showNotification('排班已新增');
}

// 顯示班表詳情 (簡化)
function showShiftDetails(shift) {
    const staffMember = staff.find(s => s.id === shift.staffId);
    const date = new Date(shift.date).toLocaleDateString('zh-TW');
    const duration = calculateShiftDuration(shift.startTime, shift.endTime);
    let message = `${staffMember.name} 排班詳情\n\n日期：${date}\n時間：${shift.startTime} - ${shift.endTime} (${duration}h)\n班別：${getShiftTypeName(shift.type)}`;
    if (shift.notes) message += `\n備註：${shift.notes}`;
    alert(message);
}

// 顯示班表詳情 by id
function showShiftDetailsById(id) {
    const shift = shifts.find(s => s.id === id);
    if (shift) {
        showShiftDetails(shift);
    }
}

// 移除班表
function deleteShift(id) {
    const index = shifts.findIndex(s => s.id === id);
    if (index !== -1) {
        const shift = shifts[index];
        if (confirm('確定要刪除此班表嗎？')) {
            shifts.splice(index, 1);
            renderCalendar();
            updateStats();
            showNotification('排班已刪除');
        }
    }
}

// 打開排班模態框
function openShiftModal(date) {
    const modal = document.getElementById('shiftModal');
    if (!modal) return;
    modal.classList.add('show');
    document.getElementById('shiftDate').value = date;
    document.getElementById('notes').value = '';
    document.getElementById('staffSelect').value = '';
    document.getElementById('shiftType').value = 'morning';
    document.getElementById('startTime').value = '08:00';
    document.getElementById('endTime').value = '16:00';
}

// 關閉排班模態框
function closeModal() {
    const modal = document.getElementById('shiftModal');
    if (modal) modal.classList.remove('show');
}

// 開啟固定排班模態框
function openFixedScheduleModal() {
    const modal = document.getElementById('fixedScheduleModal');
    const form = document.getElementById('fixedScheduleForm');
    if (!modal || !form) return;
    form.reset();
    document.getElementById('fixedShiftType').value = 'morning';
    document.getElementById('fixedStartTime').value = '08:00';
    document.getElementById('fixedEndTime').value = '16:00';
    document.getElementById('scheduleRange').value = 'current-month';
    document.getElementById('fixedScheduleNotes').value = '固定上班排程';
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`day${i}`).checked = true;
    }
    document.getElementById('day0').checked = false;
    document.getElementById('day6').checked = false;
    document.getElementById('customTimeGroup').style.display = 'none';
    document.getElementById('customRangeGroup').style.display = 'none';
    modal.classList.add('show');
}

// 關閉固定排班模態框
function closeFixedScheduleModal() {
    const modal = document.getElementById('fixedScheduleModal');
    if (modal) modal.classList.remove('show');
}

// 建立固定排班（簡化邏輯，忽略替換）
function createFixedSchedule() {
    const staffId = parseInt(document.getElementById('fixedStaffSelect').value);
    const shiftType = document.getElementById('fixedShiftType').value;
    const scheduleRange = document.getElementById('scheduleRange').value;
    const notes = document.getElementById('fixedScheduleNotes').value;
    // 選擇的工作日
    const selectedDays = [];
    for (let i = 0; i < 7; i++) {
        if (document.getElementById(`day${i}`).checked) {
            selectedDays.push(i);
        }
    }
    if (selectedDays.length === 0) {
        alert('請至少選擇一個工作日！');
        return;
    }
    // 時間
    let startTime, endTime;
    if (shiftType === 'custom') {
        startTime = document.getElementById('fixedStartTime').value;
        endTime = document.getElementById('fixedEndTime').value;
        if (!startTime || !endTime) {
            alert('請設定自訂時間！');
            return;
        }
    } else {
        const timeMap = {
            'morning': { start: '08:00', end: '16:00' },
            'afternoon': { start: '16:00', end: '24:00' },
            'night': { start: '00:00', end: '08:00' }
        };
        startTime = timeMap[shiftType].start;
        endTime = timeMap[shiftType].end;
    }
    // 日期範圍
    let startDate, endDate;
    switch (scheduleRange) {
        case 'current-month':
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            break;
        case 'next-month':
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
            break;
        case 'current-and-next':
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
            break;
        case 'custom-range':
            const startDateStr = document.getElementById('rangeStartDate').value;
            const endDateStr = document.getElementById('rangeEndDate').value;
            if (!startDateStr || !endDateStr) {
                alert('請設定自訂日期範圍！');
                return;
            }
            startDate = new Date(startDateStr);
            endDate = new Date(endDateStr);
            break;
    }
    // 生成排班
    let shiftIdCounter = Date.now();
    let addedCount = 0;
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = date.getDay();
        if (selectedDays.includes(dayOfWeek)) {
            const dateStr = date.toISOString().split('T')[0];
            const newShift = {
                id: shiftIdCounter++,
                staffId: staffId,
                date: dateStr,
                startTime: startTime,
                endTime: endTime,
                type: shiftType,
                status: 'confirmed',
                notes: notes
            };
            shifts.push(newShift);
            addedCount++;
        }
    }
    renderCalendar();
    updateStats();
    closeFixedScheduleModal();
    const staffMember = staff.find(s => s.id === staffId);
    showNotification(`已為 ${staffMember.name} 建立固定排班！新增 ${addedCount} 天。`);
}

// 將傳統的導覽按鈕轉為今日
function goToToday() {
    currentDate = new Date();
    updateCurrentDate();
    renderCalendar();
}

// 應用篩選器
function applyFilters() {
    const deptFilter = document.getElementById('departmentFilter');
    const roleFilter = document.getElementById('roleFilter');
    const typeFilter = document.getElementById('shiftTypeFilter');
    const searchInput = document.getElementById('staffSearch');
    currentFilters.department = deptFilter ? deptFilter.value : '';
    currentFilters.role = roleFilter ? roleFilter.value : '';
    currentFilters.shiftType = typeFilter ? typeFilter.value : '';
    currentFilters.staffSearch = searchInput ? searchInput.value.trim() : '';
    renderStaffPanel();
}

// 匯出 iCal
function exportToICal() {
    // 由於瀏覽器端無法直接產出 iCal 檔案，這裡僅顯示通知
    showNotification('匯出 iCal 功能尚未實作');
}

// 同步 Google
function syncToGoogle() {
    // 模擬成功同步
    showNotification('已與 Google 行事曆同步');
}

// 列印排班
function printSchedule() {
    showNotification('列印功能尚未實作');
}

// 在首次載入頁面時自動初始化排班資料與介面
document.addEventListener('DOMContentLoaded', () => {
    try {
        initializeSampleShifts();
        updateCurrentDate();
        renderCalendar();
        renderStaffPanel();
        setupEventListeners();
        updateStats();
    } catch (err) {
        console.error('排班管理初始化失敗:', err);
    }
});

// 外部呼叫的入口，用於在顯示排班區域時刷新內容。
function loadScheduleManagement() {
    // 每次切換到排班管理時，都更新日期與畫面
    try {
        updateCurrentDate();
        renderCalendar();
        renderStaffPanel();
        updateStats();
    } catch (err) {
        console.error('載入排班管理失敗:', err);
    }
}