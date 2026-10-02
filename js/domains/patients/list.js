/* ============================================================
 * patients/list.js — 病人管理列表與搜尋（Phase 4 第二批・子批 A）
 * ------------------------------------------------------------
 * loadPatientList(FromFirebase)／renderPatientList(Table/Page)，
 * 含 #searchPatient 搜尋結果渲染與分頁。原樣遷入，舊服務經 G。
 * ============================================================ */
import { G } from '../../lib/legacy.js';
import { comparePatientsByNumberDesc, getPatientsCount, fetchPatientsPageOptimized } from './store.js';

export async function loadPatientListFromFirebase() {
    const tbody = document.getElementById('patientList');
    if (!tbody) return;
    const searchInput = document.getElementById('searchPatient');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    try {
        
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <div class="mt-2">載入中...</div>
                </td>
            </tr>
        `;
        
        if (searchTerm) {
            
            let searchResult;
            try {
                searchResult = await window.firebaseDataManager.searchPatients(searchTerm, 50);
            } catch (_searchErr) {
                console.error('搜尋病人時發生錯誤:', _searchErr);
            }
            let filteredPatients = (searchResult && searchResult.success && Array.isArray(searchResult.data)) ? searchResult.data : [];
            
            
            
            filteredPatients = filteredPatients.slice();
            filteredPatients.sort(comparePatientsByNumberDesc);
            G.patientListFiltered = filteredPatients;
            renderPatientListTable(false);
        } else {
            
            
            const currentPage = (G.paginationSettings && G.paginationSettings.patientList && G.paginationSettings.patientList.currentPage) || 1;
            
            const totalCount = await getPatientsCount();
            
            const pageItems = await fetchPatientsPageOptimized(currentPage, false, totalCount);
            
            renderPatientListPage(pageItems, totalCount, currentPage);
        }
    } catch (error) {
        console.error('載入病人列表錯誤:', error);
        const msg = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    載入失敗，請檢查網路連接
                </td>
            </tr>
        `;
        tbody.innerHTML = msg;
    }
}

export function loadPatientList() {
    loadPatientListFromFirebase();
}


export function renderPatientListTable(pageChange = false) {
    const tbody = document.getElementById('patientList');
    if (!tbody) return;
    
    if (!Array.isArray(G.patientListFiltered) || G.patientListFiltered.length === 0) {
        const searchTermEl = document.getElementById('searchPatient');
        const searchTerm = searchTermEl ? searchTermEl.value.toLowerCase() : '';
        tbody.innerHTML = `
            <tr>
                <!-- 調整 colspan 以符合增加的建檔日期欄位 -->
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                    ${searchTerm ? '沒有找到符合條件的病人' : '尚無病人資料'}
                </td>
            </tr>
        `;
        const paginEl = G.ensurePaginationContainer('patientList', 'patientListPagination');
        if (paginEl) {
            paginEl.innerHTML = '';
            paginEl.classList.add('hidden');
        }
        return;
    }
    
    if (!pageChange) {
        G.paginationSettings.patientList.currentPage = 1;
    }
    
    
    
    if (Array.isArray(G.patientListFiltered) && G.patientListFiltered.length > 1) {
        G.patientListFiltered.sort(comparePatientsByNumberDesc);
    }
    const totalItems = G.patientListFiltered.length;
    const itemsPerPage = G.paginationSettings.patientList.itemsPerPage;
    let currentPage = G.paginationSettings.patientList.currentPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    G.paginationSettings.patientList.currentPage = currentPage;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = G.patientListFiltered.slice(startIdx, endIdx);
    
    tbody.innerHTML = '';
    
    
    const showDelete = G.hasActionPermission('patientDelete');
    const showEdit = G.hasActionPermission('patientEdit');
    
    pageItems.forEach(patient => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        const safeNumber = window.escapeHtml(patient.patientNumber || '未設定');
        const safeName = window.escapeHtml(patient.name);
        const safeAge = window.escapeHtml(G.formatAge(patient.birthDate));
        const safeGender = window.escapeHtml(patient.gender);
        const safePhone = window.escapeHtml(patient.phone);
        
        let createdAtDateStr = '';
        if (patient && patient.createdAt) {
            let d;
            if (typeof patient.createdAt.seconds !== 'undefined') {
                d = new Date(patient.createdAt.seconds * 1000);
            } else {
                d = new Date(patient.createdAt);
            }
            if (d instanceof Date && !isNaN(d)) {
                
                const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
                const locale = lang === 'en' ? 'en-US' : 'zh-TW';
                createdAtDateStr = d.toLocaleDateString(locale, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
            }
        }
        const safeCreatedAt = window.escapeHtml(createdAtDateStr || '');
        
        let actions = `
                <button onclick="handleViewPatient(event, '${patient.id}')" class="text-blue-600 hover:text-blue-800 bg-blue-50 w-14 px-2 py-1 rounded text-xs transition duration-200">查看</button>
                <button onclick="handleShowMedicalHistory(event, '${patient.id}')" class="text-purple-600 hover:text-purple-800 bg-purple-50 w-14 px-2 py-1 rounded text-xs transition duration-200">病歷</button>
        `;
        if (showEdit) {
            actions += `
                <button onclick="handleEditPatient(event, '${patient.id}')" class="text-green-600 hover:text-green-800 bg-green-50 w-14 px-2 py-1 rounded text-xs transition duration-200">編輯</button>
            `;
        }
        if (showDelete) {
            
            actions += `
                <button onclick="handleDeletePatient(event, '${patient.id}')" class="text-red-600 hover:text-red-800 bg-red-50 w-14 px-2 py-1 rounded text-xs transition duration-200">刪除</button>
            `;
        }
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-blue-600 font-medium">${safeNumber}</td>
            <td class="px-4 py-3 text-sm text-gray-900 font-medium">${safeName}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeAge}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeGender}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safePhone}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeCreatedAt}</td>
            <!--
              將操作按鈕容器設置為 flex 並加入 whitespace-nowrap，
              以避免在按鈕顯示讀取圈時造成換行。space-x-2
              用於按鈕間距，items-center 使按鈕垂直對齊。
            -->
            <td class="px-4 py-3 text-sm whitespace-nowrap">
                <div class="flex items-center space-x-2">
                    ${actions}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    const paginEl = G.ensurePaginationContainer('patientList', 'patientListPagination');
    G.renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
        G.paginationSettings.patientList.currentPage = newPage;
        renderPatientListTable(true);
    }, paginEl);
}


export function renderPatientListPage(pageItems, totalItems, currentPage) {
    const tbody = document.getElementById('patientList');
    if (!tbody) return;
    
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <!-- 調整 colspan 以符合增加的建檔日期欄位 -->
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                    尚無病人資料
                </td>
            </tr>
        `;
        const paginEl = G.ensurePaginationContainer('patientList', 'patientListPagination');
        if (paginEl) {
            paginEl.innerHTML = '';
            paginEl.classList.add('hidden');
        }
        return;
    }
    
    tbody.innerHTML = '';
    
    
    const showDelete = G.hasActionPermission('patientDelete');
    const showEdit = G.hasActionPermission('patientEdit');
    
    let sortedPageItems;
    if (Array.isArray(pageItems) && pageItems.length > 1) {
        sortedPageItems = pageItems.slice().sort(comparePatientsByNumberDesc);
    } else {
        sortedPageItems = pageItems;
    }
    sortedPageItems.forEach(patient => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        const safeNumber = window.escapeHtml(patient.patientNumber || '未設定');
        const safeName = window.escapeHtml(patient.name);
        const safeAge = window.escapeHtml(G.formatAge(patient.birthDate));
        const safeGender = window.escapeHtml(patient.gender);
        const safePhone = window.escapeHtml(patient.phone);
        
        let createdAtDateStr = '';
        if (patient && patient.createdAt) {
            let d;
            if (typeof patient.createdAt.seconds !== 'undefined') {
                d = new Date(patient.createdAt.seconds * 1000);
            } else {
                d = new Date(patient.createdAt);
            }
            if (d instanceof Date && !isNaN(d)) {
                const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
                const locale = lang === 'en' ? 'en-US' : 'zh-TW';
                createdAtDateStr = d.toLocaleDateString(locale, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
            }
        }
        const safeCreatedAt = window.escapeHtml(createdAtDateStr || '');
        
        let actions = `
                <button onclick="handleViewPatient(event, '${patient.id}')" class="text-blue-600 hover:text-blue-800 bg-blue-50 w-14 px-2 py-1 rounded text-xs transition duration-200">查看</button>
                <button onclick="handleShowMedicalHistory(event, '${patient.id}')" class="text-purple-600 hover:text-purple-800 bg-purple-50 w-14 px-2 py-1 rounded text-xs transition duration-200">病歷</button>
        `;
        if (showEdit) {
            actions += `
                <button onclick="handleEditPatient(event, '${patient.id}')" class="text-green-600 hover:text-green-800 bg-green-50 w-14 px-2 py-1 rounded text-xs transition duration-200">編輯</button>
            `;
        }
        if (showDelete) {
            
            actions += `
                <button onclick="handleDeletePatient(event, '${patient.id}')" class="text-red-600 hover:text-red-800 bg-red-50 w-14 px-2 py-1 rounded text-xs transition duration-200">刪除</button>
            `;
        }
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-blue-600 font-medium">${safeNumber}</td>
            <td class="px-4 py-3 text-sm text-gray-900 font-medium">${safeName}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeAge}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeGender}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safePhone}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeCreatedAt}</td>
            <!--
              將操作按鈕放入 flex 容器並設定 whitespace-nowrap，
              避免按下按鈕時因為讀取圈或寬度變化而換行。
            -->
            <td class="px-4 py-3 text-sm whitespace-nowrap">
                <div class="flex items-center space-x-2">
                    ${actions}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    const paginEl = G.ensurePaginationContainer('patientList', 'patientListPagination');
    G.renderPagination(totalItems, G.paginationSettings.patientList.itemsPerPage, currentPage, function (newPage) {
        
        G.paginationSettings.patientList.currentPage = newPage;
        loadPatientList();
    }, paginEl);
}
