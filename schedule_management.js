(function() {
// 全域變數
        let currentDate = new Date();
        let currentView = 'month';
        let draggedShift = null;
        let currentStaffFilter = 'all';
        
        // 醫護人員資料
        // 預設為空陣列，實際人員資料將透過載入診所用戶後填充。
        // 我們同時將此陣列引用存放於 window.staff，使得其他程式碼（如 system.html 中的排班管理程式）
        // 可以共用同一份人員資料，避免因為預設示範資料而與實際資料不一致。
        let staff = [];
        // 將 staff 指向全域，便於舊有程式碼讀取
        window.staff = staff;

        /**
         * 透過人員 ID 查詢人員資料。若找不到對應的人員，回傳一個預設物件
         * 以避免程式在存取 undefined 屬性時產生錯誤。
         * @param {number|string} id 人員 ID
         * @returns {Object} 人員物件
         */
        function findStaffById(id) {
            const member = staff.find(s => s.id === id);
            if (member) return member;
            // 提供基本預設值，確保後續程式可以安全存取屬性
            return {
                id: id,
                name: '未知人員',
                role: 'doctor',
                department: '',
                level: '',
                phone: '',
                email: '',
                maxHours: 0
            };
        }

        /**
         * 從系統的診所用戶載入醫護人員。此函式嘗試從全域函式 fetchUsers (由
         * system.js 提供) 取得用戶清單，並過濾出職位為「醫師」或「護理師」的
         * 用戶，將其映射為排班系統需要的 staff 結構。若無法取得用戶資料，
         * 將維持 staff 為空陣列，以避免載入預設示範用戶。
         */
        async function loadClinicStaff() {
            try {
                // 在嘗試讀取 Firebase 用戶資料前，等待 FirebaseDataManager 準備完成。
                // 系統在 window.load 事件時才初始化 firebaseDataManager，
                // 而排班管理腳本於 DOMContentLoaded 即會執行，可能導致 fetchUsers 尚未可用。
                if (typeof waitForFirebaseDataManager === 'function') {
                    // 使用系統提供的等待函式確保 firebaseDataManager.isReady
                    try {
                        await waitForFirebaseDataManager();
                    } catch (e) {
                        // 若等待過程出錯，僅記錄警告而不終止流程
                        console.warn('等待 FirebaseDataManager 就緒時發生錯誤:', e);
                    }
                } else {
                    // 若沒有 waitForFirebaseDataManager，則自行輪詢等待一段時間
                    for (let i = 0; i < 50 && (!window.firebaseDataManager || !window.firebaseDataManager.isReady); i++) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                let usersList = [];
                // 優先使用 fetchUsers 函式從 Firebase 讀取診所用戶
                if (typeof fetchUsers === 'function') {
                    try {
                        usersList = await fetchUsers();
                    } catch (e) {
                        console.warn('呼叫 fetchUsers 失敗:', e);
                    }
                }
                // 若尚未取得資料，嘗試從全域緩存或本地資料取得
                if ((!usersList || usersList.length === 0) && window.usersFromFirebase && Array.isArray(window.usersFromFirebase)) {
                    usersList = window.usersFromFirebase;
                } else if ((!usersList || usersList.length === 0) && window.users && Array.isArray(window.users)) {
                    usersList = window.users;
                }
                // 將用戶資料轉換為排班人員格式
                // 清空原陣列以維持同一個引用，避免其他腳本無法取得最新資料
                staff.splice(0, staff.length);
                usersList.forEach(u => {
                    // 僅納入醫師與護理師
                    if (u.position === '醫師' || u.position === '護理師') {
                        staff.push({
                            id: u.id,
                            name: u.name || '',
                            role: u.position === '醫師' ? 'doctor' : 'nurse',
                            // 部門若無資料則使用空字串，避免 undefined
                            department: u.department || '',
                            // level 可使用 position 表示，例如主治醫師或護理師
                            level: u.position || '',
                            phone: u.phone || '',
                            email: u.email || '',
                            // 若有 maxHours 欄位則使用，否則預設 40
                            maxHours: typeof u.maxHours === 'number' ? u.maxHours : 40
                        });
                    }
                });
                // 更新全域 staff 指向最新的資料陣列，確保其他腳本能取得最新人員
                // 由於我們使用 splice 清空陣列並重新填充，不會改變引用，
                // 這裡仍然將 window.staff 指向同一個陣列以防止遺漏。
                window.staff = staff;
            } catch (err) {
                console.error('載入診所用戶時發生錯誤：', err);
                // 若出錯則維持 staff 為空陣列
                staff.splice(0, staff.length);
                // 同步全域 staff（仍指向同一陣列）
                window.staff = staff;
            }
        }

        // 排班資料 - 使用當前月份的日期
        let shifts = [];

        /**
         * 將日期物件轉換為 YYYY-MM-DD 格式的字串，使用本地時間而非 UTC，
         * 以避免使用 toISOString() 造成日期提前一天的問題。
         * @param {Date} date 日期物件
         * @returns {string} 格式化後的日期字串
         */
        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        
        // 初始化一些示範排班資料
        function initializeSampleShifts() {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            // 確保使用一致的日期，避免視圖間不同步
            const baseDate = 26; // 統一使用26號作為示範日期
            
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

        // 包裝函式：處理班表上的編輯與刪除按鈕點擊。
        // 這些函式僅在內部調用 event.stopPropagation() / preventDefault() 並呼叫實際的
        // 編輯或刪除函式。若 scheduleEditShift / scheduleDeleteShift 不存在，則回退到本地函式。
        function handleEditShift(e, shiftId) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            // 使用 scheduleEditShift（global）如果可用
            if (typeof window.scheduleEditShift === 'function') {
                window.scheduleEditShift(shiftId);
            } else if (typeof editShift === 'function') {
                // fallback
                editShift(shiftId);
            }
        }

        function handleDeleteShift(e, shiftId) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof window.scheduleDeleteShift === 'function') {
                window.scheduleDeleteShift(shiftId);
            } else if (typeof deleteShift === 'function') {
                deleteShift(shiftId);
            }
        }

        // 將包裝函式掛載至 window，使 inline onclick 可以順利呼叫
        if (typeof window !== 'undefined') {
            window.handleEditShift = handleEditShift;
            window.handleDeleteShift = handleDeleteShift;
        }

        // 初始化
        document.addEventListener('DOMContentLoaded', async function() {
            // 不再載入示範排班資料，直接更新日期和渲染空行事曆
            updateCurrentDate();
            renderCalendar();
            setupEventListeners();

            // 載入診所實際人員資料
            await loadClinicStaff();

            // 依照載入後的人員重新渲染人員卡片與下拉選單
            renderStaffPanel();
            updateStaffSelects();

            // 更新統計顯示
            updateStats();
        });

        // 設定事件監聽器
        function setupEventListeners() {
            // 班別選擇變更
            document.getElementById('shiftType').addEventListener('change', function() {
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

            // 固定排班班別選擇變更
            document.getElementById('fixedShiftType').addEventListener('change', function() {
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

            // 排程範圍選擇變更
            document.getElementById('scheduleRange').addEventListener('change', function() {
                const customRangeGroup = document.getElementById('customRangeGroup');
                if (this.value === 'custom-range') {
                    customRangeGroup.style.display = 'block';
                } else {
                    customRangeGroup.style.display = 'none';
                }
            });

            // 表單提交
            document.getElementById('shiftForm').addEventListener('submit', function(e) {
                e.preventDefault();
                addShift();
            });

            // 固定排班表單提交
            document.getElementById('fixedScheduleForm').addEventListener('submit', function(e) {
                e.preventDefault();
                createFixedSchedule();
            });
        }

        // 更新當前日期顯示
        function updateCurrentDate() {
            const options = { year: 'numeric', month: 'long' };
            document.getElementById('currentDate').textContent = currentDate.toLocaleDateString('zh-TW', options);
        }

        // 導航行事曆
        function navigateCalendar(direction) {
            currentDate.setMonth(currentDate.getMonth() + direction);
            updateCurrentDate();
            renderCalendar();
        }

        // 切換視圖（僅保留月視圖）
        function changeView(view) {
            // 僅支援月視圖
            currentView = 'month';
            updateCurrentDate();
            renderCalendar();
        }

        // 渲染行事曆
        function renderCalendar() {
            const grid = document.getElementById('calendarGrid');
            grid.innerHTML = '';
            grid.className = 'calendar-grid month-view';
            renderMonthView(grid);
        }

        // 渲染月視圖
        function renderMonthView(grid) {
            // 添加星期標題
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            weekdays.forEach(day => {
                const header = document.createElement('div');
                header.className = 'calendar-header';
                header.textContent = day;
                grid.appendChild(header);
            });

            // 獲取月份的第一天和最後一天
            const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            const startDate = new Date(firstDay);
            startDate.setDate(startDate.getDate() - firstDay.getDay());

            // 渲染42個格子（6週）
            for (let i = 0; i < 42; i++) {
                const cellDate = new Date(startDate);
                cellDate.setDate(startDate.getDate() + i);
                
                const cell = document.createElement('div');
                cell.className = 'calendar-cell';
                // 使用本地日期格式避免時區誤差
                cell.dataset.date = formatDate(cellDate);
                
                if (cellDate.getMonth() !== currentDate.getMonth()) {
                    cell.classList.add('other-month');
                }
                
                if (isToday(cellDate)) {
                    cell.classList.add('today');
                }

                const dayNumber = document.createElement('div');
                dayNumber.className = 'day-number';
                dayNumber.textContent = cellDate.getDate();
                cell.appendChild(dayNumber);

                // 添加排班
                const dayShifts = getShiftsForDate(cellDate).filter(passesFilter);
                dayShifts.forEach(shift => {
                    const shiftElement = createShiftElement(shift);
                    cell.appendChild(shiftElement);
                });

                // 添加拖放功能
                setupCellDropZone(cell);
                
                grid.appendChild(cell);
            }
        }



        // 創建排班元素
        function createShiftElement(shift) {
            const staffMember = findStaffById(shift.staffId);
            const element = document.createElement('div');
            
            let shiftClasses = `shift-item ${staffMember.role}`;
            if (shift.type === 'emergency') shiftClasses += ' emergency';
            if (shift.status === 'overtime') shiftClasses += ' overtime';
            
            element.className = shiftClasses;
            element.draggable = true;
            element.dataset.shiftId = shift.id;
            
            const duration = calculateShiftDuration(shift.startTime, shift.endTime);
            const statusIcon = shift.status === 'confirmed' ? '✓' : shift.status === 'pending' ? '⏳' : '❌'; // 保留計算但不顯示
            
            // 使用單一函式處理按鈕點擊以便 inline 事件僅包含函式呼叫。
            // 直接在 onclick 中調用多個語句（例如 event.stopPropagation(); editShift(...)) 會導致
            // system.js 的 parseArgs 函式無法正確解析，產生 SyntaxError。
            // 因此改為調用包裝函式 handleEditShift / handleDeleteShift，由包裝函式自行處理
            // 停止事件冒泡和觸發實際的編輯或刪除邏輯。
            element.innerHTML = `
                <div class="shift-header">
                    <!-- 顯示人員姓名與職位，例如「張XX醫師」 -->
                    <div class="shift-name">${staffMember.name}${staffMember.level || ''}</div>
                    <div class="shift-actions">
                        <button class="shift-action-btn" onclick="handleEditShift(event, ${shift.id})" title="編輯">✏️</button>
                        <button class="shift-action-btn" onclick="handleDeleteShift(event, ${shift.id})" title="刪除">🗑️</button>
                    </div>
                </div>
                <div class="shift-details">
                    ${shift.startTime}-${shift.endTime} (${duration}h)<br>
                    <!-- 僅顯示排班備註，不再顯示狀態圖示與部門 -->
                    ${shift.notes || '一般排班'}
                </div>
            `;

            // 拖拽事件
            element.addEventListener('dragstart', function(e) {
                draggedShift = shift;
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            element.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                draggedShift = null;
            });

            // 點擊事件（防止拖拽時觸發）
            element.addEventListener('click', function(e) {
                if (!e.target.classList.contains('shift-action-btn')) {
                    showShiftDetails(shift);
                }
            });

            return element;
        }

        // 計算排班時數
        function calculateShiftDuration(startTime, endTime) {
            const start = new Date(`2000-01-01T${startTime}:00`);
            let end = new Date(`2000-01-01T${endTime}:00`);
            
            // 處理跨日情況
            if (end < start) {
                end.setDate(end.getDate() + 1);
            }
            
            return Math.round((end - start) / (1000 * 60 * 60) * 10) / 10;
        }

        // 設定格子拖放區域
        function setupCellDropZone(cell) {
            cell.addEventListener('dragover', function(e) {
                e.preventDefault();
                
                // 檢查是否是人員拖拽或排班拖拽
                const staffId = e.dataTransfer.getData('text/plain');
                if (staffId) {
                    e.dataTransfer.dropEffect = 'copy';
                } else if (draggedShift) {
                    e.dataTransfer.dropEffect = 'move';
                }
                
                this.classList.add('drop-zone');
            });

            cell.addEventListener('dragleave', function(e) {
                // 只有當滑鼠真正離開格子時才移除樣式
                if (!this.contains(e.relatedTarget)) {
                    this.classList.remove('drop-zone');
                }
            });

            cell.addEventListener('drop', function(e) {
                e.preventDefault();
                this.classList.remove('drop-zone');
                
                const staffId = e.dataTransfer.getData('text/plain');
                
                if (staffId) {
                    // 人員拖拽 - 快速新增排班
                    const staffMember = findStaffById(staffId);
                    if (staffMember) {
                        quickAddShiftFromDrag(staffMember, this.dataset.date);
                    }
                } else if (draggedShift) {
                    // 排班拖拽 - 移動排班
                    const newDate = this.dataset.date;
                    
                    // 更新排班日期
                    draggedShift.date = newDate;
                    
                    renderCalendar();
                    showNotification('排班已成功移動！');
                }
            });

            // 點擊添加排班
            cell.addEventListener('click', function(e) {
                // 避免在拖拽操作時觸發點擊
                if (!e.target.closest('.shift-item')) {
                    openShiftModal(this.dataset.date);
                }
            });
        }

        // 快速新增排班（從拖拽）
        function quickAddShiftFromDrag(staffMember, date, hour) {
            // 月視圖 - 預設早班
            const startTime = '08:00';
            const endTime = '16:00';
            const shiftType = 'morning';
            
            // 檢查是否已有排班衝突
            const existingShift = shifts.find(s =>
                s.staffId === staffMember.id &&
                s.date === date &&
                s.startTime === startTime
            );
            
            if (existingShift) {
                showNotification(`${staffMember.name} 在該時段已有排班！`);
                return;
            }
            
            // 新增排班
            const newShift = {
                id: Date.now(),
                staffId: staffMember.id,
                date: date,
                startTime: startTime,
                endTime: endTime,
                type: shiftType,
                status: 'confirmed',
                notes: '拖拽快速新增'
            };
            
            shifts.push(newShift);
            renderCalendar();
            renderStaffPanel(); // 更新人員狀態
            updateStats();
            
            const shiftTypeName = getShiftTypeName(shiftType);
            showNotification(`已為 ${staffMember.name} 新增 ${shiftTypeName} (${startTime}-${endTime})！`);
        }

        // 輔助函數
        function isToday(date) {
            const today = new Date();
            return date.toDateString() === today.toDateString();
        }

        function getShiftsForDate(date) {
            const dateStr = formatDate(date);
            return shifts.filter(shift => shift.date === dateStr);
        }

        // 渲染人員面板
        function renderStaffPanel() {
            const grid = document.getElementById('staffGrid');
            grid.innerHTML = '';

            const filteredStaff = getFilteredStaff();

            filteredStaff.forEach(member => {
                const card = document.createElement('div');
                card.className = `staff-card ${member.role}`;
                card.draggable = true;
                card.dataset.staffId = member.id;
                

                
                // 顯示人員姓名與職位，例如「張XX醫師」
                card.innerHTML = `
                    <div class="staff-name">${member.name}${member.level || ''}</div>
                    <div class="drag-hint">🖱️</div>
                `;

                // 設定拖拽事件
                setupStaffDragEvents(card, member);
                
                grid.appendChild(card);
            });

            // 更新人員選擇下拉選單
            updateStaffSelects();
        }

        // 設定人員拖拽事件
        function setupStaffDragEvents(card, member) {
            let draggedStaffMember = null;

            card.addEventListener('dragstart', function(e) {
                draggedStaffMember = member;
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', member.id);
                
                // 高亮可放置的區域
                document.querySelectorAll('.calendar-cell').forEach(cell => {
                    cell.classList.add('drop-target');
                });
            });

            card.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                draggedStaffMember = null;
                
                // 移除高亮
                document.querySelectorAll('.calendar-cell').forEach(cell => {
                    cell.classList.remove('drop-target');
                });
            });

            // 儲存到全域變數供其他函數使用
            card.draggedStaffMember = member;
        }

        // 獲取篩選後的人員
        function getFilteredStaff() {
            const filter = currentStaffFilter || 'all';
            
            switch (filter) {
                case 'doctor':
                    return staff.filter(s => s.role === 'doctor');
                case 'nurse':
                    return staff.filter(s => s.role === 'nurse');
                default:
                    return staff;
            }
        }

        // 獲取今日人員排班
        function getTodayShiftsForStaff(staffId) {
            const today = formatDate(new Date());
            return shifts.filter(shift => shift.staffId === staffId && shift.date === today);
        }

        // 獲取人員狀態
        function getStaffStatus(staffId, todayShifts) {
            if (todayShifts.length === 0) {
                return { class: '', icon: '✅', text: '可排班' };
            } else if (todayShifts.length === 1) {
                return { class: 'partial', icon: '⏰', text: '已排班' };
            } else {
                return { class: 'busy', icon: '🔴', text: '滿班' };
            }
        }

        // 更新人員選擇下拉選單
        function updateStaffSelects() {
            const select = document.getElementById('staffSelect');
            select.innerHTML = '';
            staff.forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = `${member.name} (${member.role === 'doctor' ? '醫師' : '護理師'})`;
                select.appendChild(option);
            });

            // 更新固定排班人員選擇下拉選單
            const fixedSelect = document.getElementById('fixedStaffSelect');
            if (fixedSelect) {
                fixedSelect.innerHTML = '';
                staff.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = `${member.name} (${member.role === 'doctor' ? '醫師' : '護理師'}) - ${member.department}`;
                    fixedSelect.appendChild(option);
                });
            }
        }

        // 模態框操作
        function openShiftModal(date = null, staffId = null) {
            const modal = document.getElementById('shiftModal');
            const form = document.getElementById('shiftForm');
            
            // 重置表單
            form.reset();
            
            // 設定預設值
            if (date) {
                document.getElementById('shiftDate').value = date;
            } else {
                // 使用本地日期格式
                document.getElementById('shiftDate').value = formatDate(currentDate);
            }
            
            if (staffId) {
                document.getElementById('staffSelect').value = staffId;
            }
            
            // 設定預設時間
            document.getElementById('startTime').value = '08:00';
            document.getElementById('endTime').value = '16:00';
            
            modal.classList.add('show');
        }

        function closeModal() {
            document.getElementById('shiftModal').classList.remove('show');
        }

        // 新增排班
        function addShift() {
            const form = document.getElementById('shiftForm');
            const modal = document.getElementById('shiftModal');
            const editId = modal.dataset.editId;
            
            // 驗證必填欄位
            const staffId = document.getElementById('staffSelect').value;
            const date = document.getElementById('shiftDate').value;
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;
            const type = document.getElementById('shiftType').value;
            
            if (!staffId || !date || !startTime || !endTime || !type) {
                alert('請填寫所有必填欄位！');
                return;
            }
            
            const shiftData = {
                staffId: parseInt(staffId),
                date: date,
                startTime: startTime,
                endTime: endTime,
                type: type,
                status: 'confirmed',
                notes: document.getElementById('shiftNotes') ? document.getElementById('shiftNotes').value : ''
            };
            
            if (editId) {
                // 編輯模式
                const shiftIndex = shifts.findIndex(s => s.id == editId);
                if (shiftIndex !== -1) {
                    shifts[shiftIndex] = { ...shifts[shiftIndex], ...shiftData };
                    showNotification('排班更新成功！');
                }
                delete modal.dataset.editId;
                modal.querySelector('h3').textContent = '新增排班';
            } else {
                // 新增模式
                const newShift = {
                    id: Date.now(),
                    ...shiftData
                };
                shifts.push(newShift);
                showNotification('排班新增成功！');
            }
            
            // 重置表單並關閉視窗
            form.reset();
            modal.classList.remove('show');
            
            // 更新顯示
            renderCalendar();
            updateStats();
        }

        // 同步到 Google Calendar
        function syncToGoogle() {
            // 創建 Google Calendar 事件格式
            const events = shifts.map(shift => {
                // 透過 ID 找到對應的人員
                const staffMember = findStaffById(shift.staffId);
                const startDateTime = `${shift.date}T${shift.startTime}:00`;
                const endDateTime = `${shift.date}T${shift.endTime}:00`;
                return {
                    title: `${staffMember.name} - ${staffMember.role === 'doctor' ? '醫師' : '護理師'}排班`,
                    start: startDateTime,
                    end: endDateTime,
                    description: `部門: ${staffMember.department}\n班別: ${shift.type}`
                };
            });

            // 生成 Google Calendar URL
            const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
            const event = events[0]; // 示範用第一個事件
            if (event) {
                const params = new URLSearchParams({
                    text: event.title,
                    dates: `${event.start.replace(/[-:]/g, '')}/${event.end.replace(/[-:]/g, '')}`,
                    details: event.description
                });
                
                window.open(`${baseUrl}&${params.toString()}`, '_blank', 'noopener,noreferrer');
                showNotification('正在開啟 Google Calendar...');
            } else {
                showNotification('沒有排班資料可同步');
            }
        }

        // 匯出 iCal
        function exportToICal() {
            let icalContent = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//醫療排班系統//排班行事曆//ZH',
                'CALSCALE:GREGORIAN'
            ];

            shifts.forEach(shift => {
                const staffMember = findStaffById(shift.staffId);
                const startDateTime = `${shift.date.replace(/-/g, '')}T${shift.startTime.replace(':', '')}00`;
                const endDateTime = `${shift.date.replace(/-/g, '')}T${shift.endTime.replace(':', '')}00`;
                
                icalContent.push(
                    'BEGIN:VEVENT',
                    `UID:${shift.id}@medical-schedule.com`,
                    `DTSTART:${startDateTime}`,
                    `DTEND:${endDateTime}`,
                    `SUMMARY:${staffMember.name} - ${staffMember.role === 'doctor' ? '醫師' : '護理師'}排班`,
                    `DESCRIPTION:部門: ${staffMember.department}\\n班別: ${shift.type}`,
                    `LOCATION:醫院`,
                    'END:VEVENT'
                );
            });

            icalContent.push('END:VCALENDAR');

            // 創建下載連結
            const blob = new Blob([icalContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = '醫療排班行事曆.ics';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification('iCal 檔案已下載！');
        }

        // 新增功能函數
        
        // 回到今天
        function goToToday() {
            currentDate = new Date();
            updateCurrentDate();
            renderCalendar();
            updateStats();
        }

        // 應用篩選
        function applyFilters() {
            currentFilters.department = document.getElementById('departmentFilter').value;
            currentFilters.role = document.getElementById('roleFilter').value;
            currentFilters.shiftType = document.getElementById('shiftTypeFilter').value;
            currentFilters.staffSearch = document.getElementById('staffSearch').value.toLowerCase();
            
            renderCalendar();
            updateStats();
        }

        // 檢查排班是否符合篩選條件
        function passesFilter(shift) {
            const staffMember = findStaffById(shift.staffId);
            
            if (currentFilters.department && staffMember.department !== currentFilters.department) return false;
            if (currentFilters.role && staffMember.role !== currentFilters.role) return false;
            if (currentFilters.shiftType && shift.type !== currentFilters.shiftType) return false;
            if (currentFilters.staffSearch && !staffMember.name.toLowerCase().includes(currentFilters.staffSearch)) return false;
            
            return true;
        }

        // 更新統計資訊
        function updateStats() {
            // 統計功能已移除，保留函數以避免錯誤
        }



        // 檢查衝突
        function checkConflicts() {
            const conflicts = checkAllConflicts();
            
            if (conflicts.length === 0) {
                showNotification('沒有發現排班衝突！');
                return;
            }

            let message = `發現 ${conflicts.length} 個排班衝突：\n\n`;
            conflicts.forEach((conflict, index) => {
                const staff1 = findStaffById(conflict.shift1.staffId);
                const staff2 = findStaffById(conflict.shift2.staffId);
                message += `${index + 1}. ${staff1.name} 在 ${conflict.shift1.date} 有重疊排班\n`;
            });

            alert(message);
        }

        // 檢查所有衝突
        function checkAllConflicts() {
            const conflicts = [];
            
            for (let i = 0; i < shifts.length; i++) {
                for (let j = i + 1; j < shifts.length; j++) {
                    const shift1 = shifts[i];
                    const shift2 = shifts[j];
                    
                    if (shift1.staffId === shift2.staffId && shift1.date === shift2.date) {
                        const start1 = new Date(`2000-01-01T${shift1.startTime}:00`);
                        const end1 = new Date(`2000-01-01T${shift1.endTime}:00`);
                        const start2 = new Date(`2000-01-01T${shift2.startTime}:00`);
                        const end2 = new Date(`2000-01-01T${shift2.endTime}:00`);
                        
                        if (start1 < end2 && start2 < end1) {
                            conflicts.push({ shift1, shift2 });
                        }
                    }
                }
            }
            
            return conflicts;
        }

        // 清空所有排班
        function clearAllShifts() {
            if (confirm('確定要清空所有排班嗎？此操作無法復原。')) {
                shifts = [];
                renderCalendar();
                updateStats();
                showNotification('所有排班已清空！');
            }
        }

        // 編輯排班
        function editShift(shiftId) {
            const shift = shifts.find(s => s.id === shiftId);
            if (!shift) return;

            // 填入現有資料到表單
            document.getElementById('staffSelect').value = shift.staffId;
            document.getElementById('shiftDate').value = shift.date;
            document.getElementById('startTime').value = shift.startTime;
            document.getElementById('endTime').value = shift.endTime;
            document.getElementById('shiftType').value = shift.type;

            // 標記為編輯模式
            const modal = document.getElementById('shiftModal');
            modal.dataset.editId = shiftId;
            modal.querySelector('h3').textContent = '編輯排班';
            modal.classList.add('show');
        }

        // 刪除排班
        function deleteShift(shiftId) {

            // 事件傳播在 handleDeleteShift 中處理，此函式僅執行刪除邏輯
            
            // 獲取排班資訊用於確認對話框
            const shift = shifts.find(s => s.id == shiftId);
            if (!shift) {
                showNotification('找不到要刪除的排班！');
                return;
            }
            
            const staffMember = findStaffById(shift.staffId);
            const confirmMessage = `確定要刪除以下排班嗎？\n\n` +
                                 `人員：${staffMember.name}\n` +
                                 `日期：${shift.date}\n` +
                                 `時間：${shift.startTime} - ${shift.endTime}\n` +
                                 `備註：${shift.notes || '無'}\n\n` +
                                 `此操作無法復原！`;
            
            if (confirm(confirmMessage)) {
                const shiftIndex = shifts.findIndex(s => s.id == shiftId);
                if (shiftIndex !== -1) {
                    shifts.splice(shiftIndex, 1);
                    renderCalendar();
                    updateStats();
                    showNotification('排班已刪除！');
                } else {
                    showNotification('刪除失敗：找不到排班資料！');
                }
            }
        }

        // 顯示排班詳情
        function showShiftDetails(shift) {
            const staffMember = findStaffById(shift.staffId);
            const duration = calculateShiftDuration(shift.startTime, shift.endTime);
            
            alert(`排班詳情：
姓名：${staffMember.name}
職位：${staffMember.level}
部門：${staffMember.department}
日期：${shift.date}
時間：${shift.startTime} - ${shift.endTime} (${duration} 小時)
狀態：${shift.status === 'confirmed' ? '已確認' : shift.status === 'pending' ? '待確認' : '已取消'}
備註：${shift.notes || '無'}
聯絡電話：${staffMember.phone}
電子郵件：${staffMember.email}`);
        }

        // 根據ID顯示排班詳情
        function showShiftDetailsById(shiftId) {
            const shift = shifts.find(s => s.id === shiftId);
            if (shift) {
                showShiftDetails(shift);
            }
        }

        // 列印排班表
        function printSchedule() {
            const printWindow = window.open('', '_blank', 'noopener,noreferrer');
            const printContent = generatePrintContent();
            
            printWindow.document.write(`
                <html>
                <head>
                    <title>醫療排班表</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .shift-doctor { background-color: #e8f5e8; }
                        .shift-nurse { background-color: #fff3e0; }
                        @media print { body { margin: 0; } }
                    </style>
                </head>
                <body>
                    ${printContent}
                </body>
                </html>
            `);
            
            printWindow.document.close();
            printWindow.print();
        }

        // 生成列印內容
        function generatePrintContent() {
            const currentMonth = currentDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
            let content = `
                <div class="header">
                    <h1>醫療排班表</h1>
                    <h2>${currentMonth}</h2>
                    <p>列印時間：${new Date().toLocaleString('zh-TW')}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>日期</th>
                            <th>姓名</th>
                            <th>職位</th>
                            <th>部門</th>
                            <th>班別</th>
                            <th>時間</th>
                            <th>狀態</th>
                            <th>備註</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            const sortedShifts = shifts
                .filter(passesFilter)
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            sortedShifts.forEach(shift => {
                const staffMember = findStaffById(shift.staffId);
                const statusText = shift.status === 'confirmed' ? '已確認' : shift.status === 'pending' ? '待確認' : '已取消';
                const rowClass = staffMember.role === 'doctor' ? 'shift-doctor' : 'shift-nurse';
                
                content += `
                    <tr class="${rowClass}">
                        <td>${shift.date}</td>
                        <td>${staffMember.name}</td>
                        <td>${staffMember.level}</td>
                        <td>${staffMember.department}</td>
                        <td>${getShiftTypeName(shift.type)}</td>
                        <td>${shift.startTime} - ${shift.endTime}</td>
                        <td>${statusText}</td>
                        <td>${shift.notes || ''}</td>
                    </tr>
                `;
            });

            content += `
                    </tbody>
                </table>
            `;

            return content;
        }

        // 獲取班別名稱
        function getShiftTypeName(type) {
            const types = {
                'morning': '早班',
                'afternoon': '中班',
                'night': '夜班',
                'emergency': '急診',
                'custom': '自訂'
            };
            return types[type] || type;
        }



        // 顯示通知
        function showNotification(message) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.classList.add('show');
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }

        // 固定排班功能
        
        // 開啟固定排班模態框
        function openFixedScheduleModal() {
            const modal = document.getElementById('fixedScheduleModal');
            const form = document.getElementById('fixedScheduleForm');
            
            // 重置表單
            form.reset();
            
            // 設定預設值
            document.getElementById('fixedShiftType').value = 'morning';
            document.getElementById('fixedStartTime').value = '08:00';
            document.getElementById('fixedEndTime').value = '16:00';
            document.getElementById('scheduleRange').value = 'current-month';
            document.getElementById('fixedScheduleNotes').value = '固定上班排程';
            
            // 預設選擇週一到週五
            for (let i = 1; i <= 5; i++) {
                document.getElementById(`day${i}`).checked = true;
            }
            document.getElementById('day0').checked = false;
            document.getElementById('day6').checked = false;
            
            // 隱藏自訂時間和日期範圍
            document.getElementById('customTimeGroup').style.display = 'none';
            document.getElementById('customRangeGroup').style.display = 'none';
            
            modal.classList.add('show');
        }

        // 關閉固定排班模態框
        function closeFixedScheduleModal() {
            document.getElementById('fixedScheduleModal').classList.remove('show');
        }

        // 建立固定排班
        function createFixedSchedule() {
            const staffId = parseInt(document.getElementById('fixedStaffSelect').value);
            const shiftType = document.getElementById('fixedShiftType').value;
            const scheduleRange = document.getElementById('scheduleRange').value;
            const notes = document.getElementById('fixedScheduleNotes').value;
            const replaceExisting = document.getElementById('replaceExisting').checked;
            
            // 獲取選擇的工作日
            const selectedDays = [];
            for (let i = 0; i < 7; i++) {
                if (document.getElementById(`day${i}`).checked) {
                  if (window.scheduleInitialized) return;
                  window.scheduleInitialized = true;
                    selectedDays.push(i);
                }
            }
            
            if (selectedDays.length === 0) {
                alert('請至少選擇一個工作日！');
                return;
            }
            
            // 獲取時間
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
            
            // 獲取日期範圍
            let startDate, endDate;
            const today = new Date();
            
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
            const newShifts = [];
            let shiftIdCounter = Date.now();
            let addedCount = 0;
            let replacedCount = 0;
            
            for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
                const dayOfWeek = date.getDay();
                
                if (selectedDays.includes(dayOfWeek)) {
                    const dateStr = formatDate(date);
                    
                    // 檢查是否已有排班
                    const existingShiftIndex = shifts.findIndex(s =>
                        s.staffId === staffId && s.date === dateStr
                    );
                    
                    if (existingShiftIndex !== -1) {
                        if (replaceExisting) {
                            // 替換現有排班
                            shifts[existingShiftIndex] = {
                                ...shifts[existingShiftIndex],
                                startTime: startTime,
                                endTime: endTime,
                                type: shiftType,
                                notes: notes
                            };
                            replacedCount++;
                        }
                        // 如果不替換，跳過這一天
                    } else {
                        // 新增排班
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
            }
            
            // 更新顯示
            renderCalendar();
            updateStats();
            closeFixedScheduleModal();
            
            // 顯示結果
            const staffMember = findStaffById(staffId);
            let message = `固定排班建立完成！\n\n`;
            message += `人員：${staffMember.name}\n`;
            message += `新增排班：${addedCount} 天\n`;
            if (replacedCount > 0) {
                message += `替換排班：${replacedCount} 天\n`;
            }
            message += `時間：${startTime} - ${endTime}\n`;
            message += `工作日：${selectedDays.map(d => ['日','一','二','三','四','五','六'][d]).join('、')}`;
            
            showNotification(`已為 ${staffMember.name} 建立固定排班！新增 ${addedCount} 天${replacedCount > 0 ? `，替換 ${replacedCount} 天` : ''}。`);
        }

        // 點擊模態框外部關閉
        document.getElementById('shiftModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });

        // 點擊固定排班模態框外部關閉
        document.getElementById('fixedScheduleModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeFixedScheduleModal();
            }
        });

        // 人員篩選功能
        function filterStaff(filter) {
            currentStaffFilter = filter;
            
            // 更新按鈕狀態
            document.querySelectorAll('.staff-filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            // 重新渲染人員面板
            renderStaffPanel();
        }

        // 查看人員排班
        function viewStaffSchedule(staffId) {
            const staffMember = findStaffById(staffId);
            const staffShifts = shifts.filter(s => s.staffId === staffId)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
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
            const staffMember = findStaffById(staffId);
            const contactInfo = `聯絡 ${staffMember.name}：\n\n` +
                              `📞 電話: ${staffMember.phone}\n` +
                              `📧 信箱: ${staffMember.email}\n` +
                              `🏥 部門: ${staffMember.department}\n` +
                              `👔 職位: ${staffMember.level}`;
            
            if (confirm(contactInfo + '\n\n要撥打電話嗎？')) {
                // 在實際應用中，這裡可以整合電話系統
                window.open(`tel:${staffMember.phone}`, '_blank', 'noopener,noreferrer');
            }
        }

// Expose functions to global schedule namespace
  window.scheduleNavigateCalendar = navigateCalendar;
  window.scheduleGoToToday = goToToday;
  window.scheduleSyncToGoogle = syncToGoogle;
  window.scheduleExportToICal = exportToICal;
  window.schedulePrintSchedule = printSchedule;
  window.scheduleApplyFilters = applyFilters;
  window.scheduleOpenFixedScheduleModal = openFixedScheduleModal;
  window.scheduleCloseFixedScheduleModal = closeFixedScheduleModal;
  window.scheduleCreateFixedSchedule = createFixedSchedule;
  window.scheduleCheckConflicts = checkConflicts;
  window.scheduleClearAllShifts = clearAllShifts;
  window.scheduleOpenShiftModal = openShiftModal;
  window.scheduleCloseModal = closeModal;
  window.scheduleAddShift = addShift;
  window.scheduleFilterStaff = filterStaff;
  window.scheduleEditShift = editShift;
  window.scheduleDeleteShift = deleteShift;
  window.scheduleQuickAddShiftFromDrag = quickAddShiftFromDrag;
  window.scheduleContactStaff = contactStaff;
  window.scheduleViewStaffSchedule = viewStaffSchedule;
  window.scheduleShowShiftDetails = showShiftDetails;
  window.scheduleShowShiftDetailsById = showShiftDetailsById;
  window.scheduleUpdateStats = updateStats;

// Initialize on DOMContentLoaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('scheduleManagement')) {
      if (window.scheduleInitialized) return;
      window.scheduleInitialized = true;
      try {
        // Some functions may not exist if script is not included
        // 不再載入示範排班資料，將留待實際數據載入
        if (typeof updateCurrentDate === 'function') updateCurrentDate();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderStaffPanel === 'function') renderStaffPanel();
        if (typeof setupEventListeners === 'function') setupEventListeners();
        if (typeof updateStats === 'function') updateStats();
      } catch (e) { console.error('Schedule init error', e); }
    }
  });
}
})();