// 排班管理功能模塊
// 這個模塊包含從 cander.html 移植而來的排班行事曆邏輯。
// 為避免與系統其他功能衝突，所有函式與變數均添加前綴 schedule。

// 排班資料相關的全域變數
// 當前日期、視圖與正在拖曳的排班
let scheduleCurrentDate = new Date();
let scheduleCurrentView = 'month';
let scheduleDraggedShift = null;

// 醫護人員資料
const scheduleStaff = [
  { id: 1, name: '王醫師', role: 'doctor', department: '內科' },
  { id: 2, name: '李醫師', role: 'doctor', department: '外科' },
  { id: 3, name: '張醫師', role: 'doctor', department: '急診科' },
  { id: 4, name: '陳護理師', role: 'nurse', department: '內科' },
  { id: 5, name: '林護理師', role: 'nurse', department: '外科' },
  { id: 6, name: '黃護理師', role: 'nurse', department: '急診科' }
];

// 初始排班資料，可根據需要修改或從後端載入
let scheduleShifts = [
  { id: 1, staffId: 1, date: '2024-01-15', startTime: '08:00', endTime: '16:00', type: 'morning' },
  { id: 2, staffId: 4, date: '2024-01-15', startTime: '08:00', endTime: '16:00', type: 'morning' },
  { id: 3, staffId: 2, date: '2024-01-16', startTime: '16:00', endTime: '24:00', type: 'afternoon' },
  { id: 4, staffId: 5, date: '2024-01-16', startTime: '16:00', endTime: '24:00', type: 'afternoon' }
];

// 更新當前日期顯示
function scheduleUpdateCurrentDate() {
  const options = { year: 'numeric', month: 'long' };
  if (scheduleCurrentView === 'day') {
    options.day = 'numeric';
    options.weekday = 'long';
  } else if (scheduleCurrentView === 'week') {
    const weekStart = scheduleGetWeekStart(scheduleCurrentDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
      currentDateEl.textContent =
        `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    }
    return;
  }
  const currentDateEl = document.getElementById('currentDate');
  if (currentDateEl) {
    currentDateEl.textContent = scheduleCurrentDate.toLocaleDateString('zh-TW', options);
  }
}

// 導航行事曆
function scheduleNavigateCalendar(direction) {
  if (scheduleCurrentView === 'month') {
    scheduleCurrentDate.setMonth(scheduleCurrentDate.getMonth() + direction);
  } else if (scheduleCurrentView === 'week') {
    scheduleCurrentDate.setDate(scheduleCurrentDate.getDate() + (direction * 7));
  } else if (scheduleCurrentView === 'day') {
    scheduleCurrentDate.setDate(scheduleCurrentDate.getDate() + direction);
  }
  scheduleUpdateCurrentDate();
  scheduleRenderCalendar();
}

// 切換視圖
function scheduleChangeView(view, evt) {
  scheduleCurrentView = view;
  // 更新按鈕狀態
  document.querySelectorAll('#scheduleManagement .view-btn').forEach(btn => btn.classList.remove('active'));
  if (evt && evt.target) {
    evt.target.classList.add('active');
  } else {
    // 若未傳入事件，根據視圖選擇對應的按鈕
    const btn = document.querySelector(`#scheduleManagement .view-btn[data-view="${view}"]`);
    if (btn) btn.classList.add('active');
  }
  const grid = document.getElementById('calendarGrid');
  if (grid) {
    grid.className = `calendar-grid ${view}-view`;
  }
  scheduleUpdateCurrentDate();
  scheduleRenderCalendar();
}

// 渲染行事曆
function scheduleRenderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (scheduleCurrentView === 'month') {
    scheduleRenderMonthView(grid);
  } else if (scheduleCurrentView === 'week') {
    scheduleRenderWeekView(grid);
  } else if (scheduleCurrentView === 'day') {
    scheduleRenderDayView(grid);
  }
}

// 渲染月視圖
function scheduleRenderMonthView(grid) {
  // 添加星期標題
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  weekdays.forEach(day => {
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.textContent = day;
    grid.appendChild(header);
  });
  // 獲取月份的第一天與最後一天
  const firstDay = new Date(scheduleCurrentDate.getFullYear(), scheduleCurrentDate.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  // 渲染 42 個格子（6 週）
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.dataset.date = cellDate.toISOString().split('T')[0];
    if (cellDate.getMonth() !== scheduleCurrentDate.getMonth()) {
      cell.classList.add('other-month');
    }
    if (scheduleIsToday(cellDate)) {
      cell.classList.add('today');
    }
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = cellDate.getDate();
    cell.appendChild(dayNumber);
    // 加入排班
    const dayShifts = scheduleGetShiftsForDate(cellDate);
    dayShifts.forEach(shift => {
      const shiftElement = scheduleCreateShiftElement(shift);
      cell.appendChild(shiftElement);
    });
    scheduleSetupCellDropZone(cell);
    grid.appendChild(cell);
  }
}

// 渲染週視圖
function scheduleRenderWeekView(grid) {
  const weekStart = scheduleGetWeekStart(scheduleCurrentDate);
  // 時間標題
  const timeHeader = document.createElement('div');
  timeHeader.className = 'calendar-header';
  timeHeader.textContent = '時間';
  grid.appendChild(timeHeader);
  // 日期標題
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.innerHTML = `${weekdays[i]}<br>${date.getMonth() + 1}/${date.getDate()}`;
    grid.appendChild(header);
  }
  // 時間槽
  for (let hour = 0; hour < 24; hour++) {
    // 時間標籤
    const timeSlot = document.createElement('div');
    timeSlot.className = 'time-slot';
    timeSlot.textContent = `${hour.toString().padStart(2, '0')}:00`;
    grid.appendChild(timeSlot);
    // 每日格子
    for (let day = 0; day < 7; day++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + day);
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.dataset.date = date.toISOString().split('T')[0];
      cell.dataset.hour = hour;
      if (scheduleIsToday(date)) cell.classList.add('today');
      const hourShifts = scheduleGetShiftsForDateAndHour(date, hour);
      hourShifts.forEach(shift => {
        const shiftElement = scheduleCreateShiftElement(shift);
        cell.appendChild(shiftElement);
      });
      scheduleSetupCellDropZone(cell);
      grid.appendChild(cell);
    }
  }
}

// 渲染日視圖
function scheduleRenderDayView(grid) {
  // 標題
  const timeHeader = document.createElement('div');
  timeHeader.className = 'calendar-header';
  timeHeader.textContent = '時間';
  grid.appendChild(timeHeader);
  const dateHeader = document.createElement('div');
  dateHeader.className = 'calendar-header';
  dateHeader.textContent = scheduleCurrentDate.toLocaleDateString('zh-TW', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  grid.appendChild(dateHeader);
  for (let hour = 0; hour < 24; hour++) {
    const timeSlot = document.createElement('div');
    timeSlot.className = 'time-slot';
    timeSlot.textContent = `${hour.toString().padStart(2, '0')}:00`;
    grid.appendChild(timeSlot);
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.dataset.date = scheduleCurrentDate.toISOString().split('T')[0];
    cell.dataset.hour = hour;
    if (scheduleIsToday(scheduleCurrentDate)) cell.classList.add('today');
    const hourShifts = scheduleGetShiftsForDateAndHour(scheduleCurrentDate, hour);
    hourShifts.forEach(shift => {
      const shiftElement = scheduleCreateShiftElement(shift);
      cell.appendChild(shiftElement);
    });
    scheduleSetupCellDropZone(cell);
    grid.appendChild(cell);
  }
}

// 創建排班元素
function scheduleCreateShiftElement(shift) {
  const staffMember = scheduleStaff.find(s => s.id === shift.staffId);
  const element = document.createElement('div');
  element.className = `shift-item ${staffMember.role}`;
  element.draggable = true;
  element.dataset.shiftId = shift.id;
  element.innerHTML = `
    <div>${staffMember.name}</div>
    <div style="font-size: 9px; opacity: 0.8;">${shift.startTime}-${shift.endTime}</div>
  `;
  element.addEventListener('dragstart', function(e) {
    scheduleDraggedShift = shift;
    element.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  element.addEventListener('dragend', function() {
    element.classList.remove('dragging');
    scheduleDraggedShift = null;
  });
  return element;
}

// 設定格子拖放區域
function scheduleSetupCellDropZone(cell) {
  cell.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    cell.classList.add('drop-zone');
  });
  cell.addEventListener('dragleave', function() {
    cell.classList.remove('drop-zone');
  });
  cell.addEventListener('drop', function(e) {
    e.preventDefault();
    cell.classList.remove('drop-zone');
    if (scheduleDraggedShift) {
      const newDate = cell.dataset.date;
      const newHour = cell.dataset.hour;
      scheduleDraggedShift.date = newDate;
      if (newHour !== undefined) {
        const hour = parseInt(newHour);
        scheduleDraggedShift.startTime = `${hour.toString().padStart(2, '0')}:00`;
        scheduleDraggedShift.endTime = `${(hour + 8).toString().padStart(2, '0')}:00`;
      }
      scheduleRenderCalendar();
      scheduleShowNotification('排班已成功移動！');
    }
  });
  cell.addEventListener('click', function() {
    scheduleOpenShiftModal(cell.dataset.date);
  });
}

// 取得某日期所在週的第一天 (週日)
function scheduleGetWeekStart(date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return start;
}

// 判斷是否為今天
function scheduleIsToday(date) {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

// 取得某日期所有排班
function scheduleGetShiftsForDate(date) {
  const dateStr = date.toISOString().split('T')[0];
  return scheduleShifts.filter(shift => shift.date === dateStr);
}

// 取得某日某時段的排班
function scheduleGetShiftsForDateAndHour(date, hour) {
  const dateStr = date.toISOString().split('T')[0];
  return scheduleShifts.filter(shift => {
    if (shift.date !== dateStr) return false;
    const startHour = parseInt(shift.startTime.split(':')[0]);
    const endHour = parseInt(shift.endTime.split(':')[0]);
    return hour >= startHour && hour < endHour;
  });
}

// 渲染人員面板
function scheduleRenderStaffPanel() {
  const grid = document.getElementById('staffGrid');
  if (!grid) return;
  grid.innerHTML = '';
  scheduleStaff.forEach(member => {
    const card = document.createElement('div');
    card.className = `staff-card ${member.role}`;
    card.innerHTML = `
      <div class="staff-name">${member.name}</div>
      <div class="staff-role">${member.role === 'doctor' ? '醫師' : '護理師'} - ${member.department}</div>
      <button class="add-shift-btn" onclick="scheduleOpenShiftModal(null, ${member.id})">新增排班</button>
    `;
    grid.appendChild(card);
  });
  // 更新人員下拉選單
  const select = document.getElementById('staffSelect');
  if (!select) return;
  select.innerHTML = '';
  scheduleStaff.forEach(member => {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = `${member.name} (${member.role === 'doctor' ? '醫師' : '護理師'})`;
    select.appendChild(option);
  });
}

// 顯示新增排班模態框
function scheduleOpenShiftModal(date = null, staffId = null) {
  const modal = document.getElementById('shiftModal');
  const form = document.getElementById('shiftForm');
  if (!modal || !form) return;
  form.reset();
  if (date) {
    document.getElementById('shiftDate').value = date;
  } else {
    document.getElementById('shiftDate').value = scheduleCurrentDate.toISOString().split('T')[0];
  }
  if (staffId) {
    document.getElementById('staffSelect').value = staffId;
  }
  document.getElementById('startTime').value = '08:00';
  document.getElementById('endTime').value = '16:00';
  modal.classList.add('show');
}

// 關閉模態框
function scheduleCloseModal() {
  const modal = document.getElementById('shiftModal');
  if (modal) modal.classList.remove('show');
}

// 新增排班
function scheduleAddShift() {
  const newShift = {
    id: Date.now(),
    staffId: parseInt(document.getElementById('staffSelect').value),
    date: document.getElementById('shiftDate').value,
    startTime: document.getElementById('startTime').value,
    endTime: document.getElementById('endTime').value,
    type: document.getElementById('shiftType').value
  };
  scheduleShifts.push(newShift);
  scheduleRenderCalendar();
  scheduleCloseModal();
  scheduleShowNotification('排班新增成功！');
}

// 同步到 Google Calendar（僅示範第一筆）
function scheduleSyncToGoogle() {
  const events = scheduleShifts.map(shift => {
    const person = scheduleStaff.find(s => s.id === shift.staffId);
    const startDateTime = `${shift.date}T${shift.startTime}:00`;
    const endDateTime = `${shift.date}T${shift.endTime}:00`;
    return {
      title: `${person.name} - ${person.role === 'doctor' ? '醫師' : '護理師'}排班`,
      start: startDateTime,
      end: endDateTime,
      description: `部門: ${person.department}\n班別: ${shift.type}`
    };
  });
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const event = events[0];
  if (event) {
    const params = new URLSearchParams({
      text: event.title,
      dates: `${event.start.replace(/[-:]/g, '')}/${event.end.replace(/[-:]/g, '')}`,
      details: event.description
    });
    window.open(`${baseUrl}&${params.toString()}`, '_blank', 'noopener,noreferrer');
    scheduleShowNotification('正在開啟 Google Calendar...');
  } else {
    scheduleShowNotification('沒有排班資料可同步');
  }
}

// 匯出 iCal
function scheduleExportToICal() {
  let icalContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//醫療排班系統//排班行事曆//ZH',
    'CALSCALE:GREGORIAN'
  ];
  scheduleShifts.forEach(shift => {
    const person = scheduleStaff.find(s => s.id === shift.staffId);
    const startDateTime = `${shift.date.replace(/-/g, '')}T${shift.startTime.replace(':', '')}00`;
    const endDateTime = `${shift.date.replace(/-/g, '')}T${shift.endTime.replace(':', '')}00`;
    icalContent.push(
      'BEGIN:VEVENT',
      `UID:${shift.id}@medical-schedule.com`,
      `DTSTART:${startDateTime}`,
      `DTEND:${endDateTime}`,
      `SUMMARY:${person.name} - ${person.role === 'doctor' ? '醫師' : '護理師'}排班`,
      `DESCRIPTION:部門: ${person.department}\\n班別: ${shift.type}`,
      `LOCATION:醫院`,
      'END:VEVENT'
    );
  });
  icalContent.push('END:VCALENDAR');
  const blob = new Blob([icalContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '醫療排班行事曆.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  scheduleShowNotification('iCal 檔案已下載！');
}

// 顯示通知
function scheduleShowNotification(message) {
  const notification = document.getElementById('notification');
  if (!notification) return;
  notification.textContent = message;
  notification.classList.add('show');
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// 設定事件監聽器（班別選擇與表單提交等）
function scheduleSetupEventListeners() {
  const shiftType = document.getElementById('shiftType');
  if (shiftType) {
    shiftType.addEventListener('change', function() {
      const type = this.value;
      const startTime = document.getElementById('startTime');
      const endTime = document.getElementById('endTime');
      switch (type) {
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
  const shiftForm = document.getElementById('shiftForm');
  if (shiftForm) {
    shiftForm.addEventListener('submit', function(e) {
      e.preventDefault();
      scheduleAddShift();
    });
  }
  const shiftModal = document.getElementById('shiftModal');
  if (shiftModal) {
    shiftModal.addEventListener('click', function(e) {
      if (e.target === shiftModal) {
        scheduleCloseModal();
      }
    });
  }
}

// 初始化排班模組
function initScheduleManagement() {
  if (window.scheduleInitialized) return;
  window.scheduleInitialized = true;
  scheduleUpdateCurrentDate();
  scheduleRenderCalendar();
  scheduleRenderStaffPanel();
  scheduleSetupEventListeners();
}

// 將部分函式暴露到全域，供 HTML inline 事件調用
window.scheduleNavigateCalendar = scheduleNavigateCalendar;
window.scheduleChangeView = scheduleChangeView;
window.scheduleOpenShiftModal = scheduleOpenShiftModal;
window.scheduleCloseModal = scheduleCloseModal;
window.scheduleAddShift = scheduleAddShift;
window.scheduleSyncToGoogle = scheduleSyncToGoogle;
window.scheduleExportToICal = scheduleExportToICal;
window.initScheduleManagement = initScheduleManagement;
// 自動初始化排班管理模塊，如果存在於頁面中
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('scheduleManagement');
    if (el && typeof initScheduleManagement === 'function') {
      initScheduleManagement();
    }
  });
}
