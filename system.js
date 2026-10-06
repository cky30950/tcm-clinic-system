

let currentUser = null;
let currentUserData = null;




window.currentUserClaims = {};


function debounce(func, wait, immediate = false) {
    let timeout;
    return function (...args) {
        const context = this;
        const later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}


const paginationSettings = {
    
    herbLibrary: { currentPage: 1, itemsPerPage: 9 },
    personalHerbCombos: { currentPage: 1, itemsPerPage: 6 },
    personalAcupointCombos: { currentPage: 1, itemsPerPage: 6 },
    prescriptionTemplates: { currentPage: 1, itemsPerPage: 6 },
    diagnosisTemplates: { currentPage: 1, itemsPerPage: 6 },
    patientList: { currentPage: 1, itemsPerPage: 10 },
    
    medicalRecordList: { currentPage: 1, itemsPerPage: 10 }
};


function initAcupointMagnifier() {
    try {
        const img = document.getElementById('acupointImage');
        if (!img) {
            return;
        }
        
        if (img.dataset && img.dataset.magnified) {
            return;
        }
        
        if (img.dataset) {
            img.dataset.magnified = 'true';
        }
        
        magnify(img, 2);
    } catch (e) {
        console.warn('初始化穴位放大鏡失敗:', e);
    }
}




function magnify(img, zoom) {
    
    const lens = document.createElement('div');
    lens.setAttribute('class', 'img-magnifier-glass');
    
    const container = img.parentElement;
    if (container) {
        const style = window.getComputedStyle(container);
        if (style.position === 'static' || !style.position) {
            container.style.position = 'relative';
        }
        container.insertBefore(lens, img);
    } else {
        document.body.insertBefore(lens, img);
    }
    
    lens.style.backgroundImage = `url('${img.src}')`;
    lens.style.backgroundRepeat = 'no-repeat';
    
    const w = lens.offsetWidth / 2;
    const h = lens.offsetHeight / 2;
    
    lens.style.backgroundSize = (img.width * zoom) + 'px ' + (img.height * zoom) + 'px';
    
    const pointer = document.createElement('div');
    pointer.className = 'magnifier-pointer';
    lens.appendChild(pointer);

    
    function moveLens(e) {
        e.preventDefault();
        const pos = getCursorPos(e);
        let x = pos.x;
        let y = pos.y;
        
        if (x > img.width - (w / zoom)) { x = img.width - (w / zoom); }
        if (x < w / zoom) { x = w / zoom; }
        if (y > img.height - (h / zoom)) { y = img.height - (h / zoom); }
        if (y < h / zoom) { y = h / zoom; }
        
        lens.style.left = (x - w) + 'px';
        lens.style.top = (y - h) + 'px';
        
        
        const bw = parseInt(window.getComputedStyle(lens).borderTopWidth) || 0;
        lens.style.backgroundPosition = '-' + ((x * zoom) - w + bw) + 'px -' + ((y * zoom) - h + bw) + 'px';
    }
    
    function getCursorPos(e) {
        const rect = img.getBoundingClientRect();
        let x = e.pageX - rect.left - window.pageXOffset;
        let y = e.pageY - rect.top - window.pageYOffset;
        return { x, y };
    }
    
    lens.addEventListener('mousemove', moveLens);
    img.addEventListener('mousemove', moveLens);
    lens.addEventListener('touchmove', moveLens);
    img.addEventListener('touchmove', moveLens);
}


paginationSettings.acupointLibrary = { currentPage: 1, itemsPerPage: 6 };



const UNIT_FACTOR_MAP = {
    g: 1,
    jin: 600,
    liang: 37.5,
    qian: 3.75
};
const UNIT_LABEL_MAP = {
    g: '克',
    jin: '斤',
    liang: '兩',
    qian: '錢'
};



document.addEventListener('DOMContentLoaded', function () {
    try {
        const qtyUnitSelect = document.getElementById('inventoryQuantityUnit');
        
        if (qtyUnitSelect) {
            
            qtyUnitSelect.dataset.prevUnit = qtyUnitSelect.value || 'g';
            
            if (qtyUnitSelect._unitChangeHandler) {
                qtyUnitSelect.removeEventListener('change', qtyUnitSelect._unitChangeHandler);
            }
            
            qtyUnitSelect._unitChangeHandler = function (e) {
                const selectEl = e && e.target ? e.target : qtyUnitSelect;
                const newUnitVal = selectEl.value || 'g';
                const prevUnitVal = selectEl.dataset.prevUnit || 'g';
                
                if (newUnitVal === prevUnitVal) {
                    return;
                }
                
                const qtyInput = document.getElementById('inventoryQuantity');
                const thrInput = document.getElementById('inventoryThreshold');
                
                const prevFactor = UNIT_FACTOR_MAP[prevUnitVal] || 1;
                const newFactorVal = UNIT_FACTOR_MAP[newUnitVal] || 1;
                
                if (qtyInput) {
                    const qValRaw = parseFloat(qtyInput.value);
                    if (!isNaN(qValRaw)) {
                        const grams = qValRaw * prevFactor;
                        const convertedQty = grams / newFactorVal;
                        
                        qtyInput.value = (Math.round(convertedQty * 1000) / 1000).toString();
                    }
                }
                
                if (thrInput) {
                    const thrValRaw = parseFloat(thrInput.value);
                    if (!isNaN(thrValRaw)) {
                        const grams = thrValRaw * prevFactor;
                        const convertedThr = grams / newFactorVal;
                        thrInput.value = (Math.round(convertedThr * 1000) / 1000).toString();
                    }
                }
                
                selectEl.dataset.prevUnit = newUnitVal;
            };
            
            qtyUnitSelect.addEventListener('change', qtyUnitSelect._unitChangeHandler);
        }
    } catch (_e) {
        
    }
});


document.addEventListener('DOMContentLoaded', function () {
    try {
        const selectEl = document.getElementById('prescriptionTypeSelect');
        if (selectEl) {
            
            let defaultMode = 'granule';
            try {
                if (typeof currentInventoryMode !== 'undefined' && (currentInventoryMode === 'granule' || currentInventoryMode === 'slice')) {
                    defaultMode = currentInventoryMode;
                } else {
                    
                    const storedMode = (typeof localStorage !== 'undefined') ? localStorage.getItem('inventoryMode') : null;
                    if (storedMode === 'granule' || storedMode === 'slice') {
                        defaultMode = storedMode;
                    }
                }
            } catch (_e) {
                
            }
            selectEl.value = defaultMode;
            
            const granOpt = selectEl.querySelector('option[value="granule"]');
            const sliceOpt = selectEl.querySelector('option[value="slice"]');
            if (granOpt) {
                let label = '顆粒沖劑';
                try {
                    if (typeof window.t === 'function') {
                        const translated = window.t('顆粒沖劑');
                        if (translated) label = translated;
                    }
                } catch (_e) {
                    
                }
                granOpt.textContent = label;
            }
            if (sliceOpt) {
                let label = '飲片';
                try {
                    if (typeof window.t === 'function') {
                        const translated = window.t('飲片');
                        if (translated) label = translated;
                    }
                } catch (_e) {
                    
                }
                sliceOpt.textContent = label;
            }
        }
    } catch (_e) {
        
    }
});



let patientSearchSelectionIndex = -1;



let herbIngredientSearchSelectionIndex = -1;



let acupointComboSearchSelectionIndex = -1;
let prescriptionSearchSelectionIndex = -1;
let acupointNotesSearchSelectionIndex = -1;



paginationSettings.patientPackageStatus = { currentPage: 1, itemsPerPage: 6 };


let patientListFiltered = [];


let herbSortOrder = '';


function changeHerbSortOrder(order) {
    herbSortOrder = order || '';
    
    if (paginationSettings && paginationSettings.herbLibrary) {
        paginationSettings.herbLibrary.currentPage = 1;
    }
    if (typeof displayHerbLibrary === 'function') {
        displayHerbLibrary();
    }
}


window.changeHerbSortOrder = changeHerbSortOrder;


function changeInventoryType(type) {
    if (type !== 'granule' && type !== 'slice') {
        return;
    }
    currentInventoryMode = type;
    
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('inventoryMode', type);
        }
    } catch (_e) {
        
    }
    
    if (typeof initHerbInventory === 'function') {
        initHerbInventory(true).then(() => {
            
            if (typeof displayHerbLibrary === 'function') {
                displayHerbLibrary();
            }
        }).catch((_err) => {
            
            if (typeof displayHerbLibrary === 'function') {
                displayHerbLibrary();
            }
        });
    }
}


function onPrescriptionTypeChange(type) {
    
    if (type !== 'granule' && type !== 'slice') {
        return;
    }
    
    try {
        changeInventoryType(type);
    } catch (_e) {
        
    }
    
    try {
        const searchEl = document.getElementById('prescriptionSearch');
        const query = searchEl && searchEl.value ? String(searchEl.value).trim() : '';
        if (query && query.length > 0) {
            
            setTimeout(function () {
                try {
                    searchHerbsForPrescription();
                } catch (_e) {
                    
                }
            }, 300);
        }
    } catch (_e) {
        
    }
}



function onInventoryTypeChange(type) {
    if (type !== 'granule' && type !== 'slice') return;
    currentHerbLibraryViewMode = type;
    try {
        changeInventoryType(type);
        const prescriptionSelect = document.getElementById('prescriptionTypeSelect');
        if (prescriptionSelect) {
            prescriptionSelect.value = type;
        }
    } catch (_e) {}
    ensureInventoryCacheForMode(type).then(() => {
        try { displayHerbLibrary(); } catch (_e) {}
    }).catch(() => {
        try { displayHerbLibrary(); } catch (_e) {}
    });
}


window.onInventoryTypeChange = onInventoryTypeChange;


window.onPrescriptionTypeChange = onPrescriptionTypeChange;


window.changeInventoryType = changeInventoryType;


let herbInventoryGranule = {};
let herbInventorySlice = {};
let herbInventoryGranuleInitialized = false;
let herbInventorySliceInitialized = false;
let currentHerbLibraryViewMode = 'granule';
async function ensureInventoryCacheForMode(mode) {
    await waitForFirebaseDb();
    const clinicId = (function() {
        try {
            return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
        } catch (_e) {
            return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
        }
    })();
    const path = mode === 'slice' ? 'herbInventorySlice' : 'herbInventory';
    const ref = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/' + path);
    try {
        const snap = await window.firebase.get(ref);
        let data = snap && snap.exists() ? snap.val() || {} : {};
        if (!snap || !snap.exists()) {
            data = {};
        }
        if (mode === 'slice') {
            herbInventorySlice = data;
            herbInventorySliceInitialized = true;
        } else {
            herbInventoryGranule = data;
            herbInventoryGranuleInitialized = true;
        }
    } catch (_e) {}
}
function getHerbInventoryFromView(itemId) {
    const mode = currentHerbLibraryViewMode === 'slice' ? 'slice' : 'granule';
    const obj = mode === 'slice' ? herbInventorySlice : herbInventoryGranule;
    const inv = obj && obj[String(itemId)];
    if (inv && typeof inv === 'object') {
        return {
            quantity: inv.quantity ?? 0,
            threshold: inv.threshold ?? 0,
            unit: inv.unit || 'g',
            disabled: !!inv.disabled,
            defaultDosage: (typeof inv.defaultDosage === 'number' && !Number.isNaN(inv.defaultDosage)) ? inv.defaultDosage : null
        };
    }
    return { quantity: 0, threshold: 0, unit: 'g', disabled: false, defaultDosage: null };
}


function ensurePaginationContainer(parentId, paginationId) {
    const parentEl = document.getElementById(parentId);
    if (!parentEl) return null;
    let container = document.getElementById(paginationId);
    
    if (!container) {
        container = document.createElement('div');
        container.id = paginationId;
        
        container.className = 'mt-4 flex justify-center';
    }

    
    const parentTag = parentEl.tagName ? parentEl.tagName.toLowerCase() : '';
    
    const tableTags = ['table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th'];
    
    let tableEl = null;
    if (tableTags.includes(parentTag)) {
        
        tableEl = parentEl.closest('table');
    }
    if (tableEl) {
        const tableParent = tableEl.parentNode;
        
        let insertionParent = tableParent;
        let referenceNode = tableEl.nextSibling;
        
        if (tableParent && tableParent.classList && tableParent.classList.contains('overflow-x-auto')) {
            
            const overflowContainer = tableParent;
            insertionParent = overflowContainer.parentNode;
            referenceNode = overflowContainer.nextSibling;
        }
        
        if (!container.parentNode || container.parentNode !== insertionParent) {
            if (referenceNode) {
                insertionParent.insertBefore(container, referenceNode);
            } else {
                insertionParent.appendChild(container);
            }
        }
    } else {
        
        const parentContainer = parentEl.parentNode;
        if (!container.parentNode || container.parentNode !== parentContainer) {
            if (parentEl.nextSibling) {
                parentContainer.insertBefore(container, parentEl.nextSibling);
            } else {
                parentContainer.appendChild(container);
            }
        }
    }
    return container;
}


function renderPagination(totalItems, itemsPerPage, currentPage, onPageChange, container) {
    if (!container) return;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    container.innerHTML = '';
    if (totalPages <= 1) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    
    const createBtn = (page, text, disabled = false, active = false) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className = 'mx-1 px-3 py-1 rounded border text-sm ' +
            (active
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100');
        if (disabled) {
            btn.className += ' cursor-not-allowed opacity-50';
            btn.disabled = true;
        }
        btn.addEventListener('click', () => {
            if (!disabled && page !== currentPage && typeof onPageChange === 'function') {
                onPageChange(page);
            }
        });
        return btn;
    };
    
    
    container.appendChild(createBtn(1, '最前一頁', currentPage === 1));
    
    container.appendChild(createBtn(Math.max(1, currentPage - 1), '上一頁', currentPage === 1));
    
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
        container.appendChild(createBtn(i, String(i), false, i === currentPage));
    }
    
    container.appendChild(createBtn(Math.min(totalPages, currentPage + 1), '下一頁', currentPage === totalPages));
    
    
    container.appendChild(createBtn(totalPages, '最後一頁', currentPage === totalPages));
}


function navigatePagination(direction) {
  try {
    
    const containers = document.querySelectorAll('div[id$="Pagination"]');
    for (const container of containers) {
      
      const isHidden = container.classList && container.classList.contains('hidden');
      const isVisible = !isHidden && container.offsetParent !== null;
      if (!isVisible) {
        continue;
      }
      
      const buttons = Array.from(container.querySelectorAll('button'));
      
      if (direction < 0) {
        
        const prevBtn = buttons.find(btn => {
          const text = (btn.textContent || '').trim().toLowerCase();
          return !btn.disabled && (text.includes('上一頁') || text.includes('上一页') || text.includes('previous') || text.includes('prev'));
        });
        if (prevBtn && typeof prevBtn.click === 'function') {
          prevBtn.click();
          break;
        }
      } else if (direction > 0) {
        
        const nextBtn = buttons.find(btn => {
          const text = (btn.textContent || '').trim().toLowerCase();
          return !btn.disabled && (text.includes('下一頁') || text.includes('下一页') || text.includes('next'));
        });
        if (nextBtn && typeof nextBtn.click === 'function') {
          nextBtn.click();
          break;
        }
      }
    }
  } catch (e) {
    
    console.error(e);
  }
}


const ROLE_PERMISSIONS = {
  
  
  
  
  '診所管理': ['patientManagement', 'consultationSystem', 'medicalRecordManagement', 'herbLibrary', 'acupointLibrary', 'templateLibrary', 'scheduleManagement', 'billingManagement', 'walletManagement', 'userManagement', 'financialReports', 'systemManagement', 'accountSecurity'],

  '醫師': ['patientManagement', 'consultationSystem', 'medicalRecordManagement', 'herbLibrary', 'acupointLibrary', 'templateLibrary', 'scheduleManagement', 'billingManagement', 'walletManagement', 'personalSettings', 'personalStatistics', 'accountSecurity'],

  '護理師': ['patientManagement', 'consultationSystem', 'medicalRecordManagement', 'herbLibrary', 'acupointLibrary', 'templateLibrary', 'scheduleManagement', 'walletManagement', 'accountSecurity'],

  '診所助理': ['patientManagement', 'consultationSystem', 'scheduleManagement', 'walletManagement', 'accountSecurity'],

  // 部分舊帳號職位名為「助理」，權限與「診所助理」相同
  '助理': ['patientManagement', 'consultationSystem', 'scheduleManagement', 'walletManagement', 'accountSecurity'],
  
  '用戶': ['patientManagement', 'consultationSystem', 'templateLibrary', 'accountSecurity']
};

const CLINIC_SECTION_PERMISSION_OPTIONS = [
  { key: 'patientManagement', label: '病人資料管理' },
  { key: 'medicalRecordManagement', label: '病歷管理' },
  { key: 'scheduleManagement', label: '醫療排班' },
  { key: 'billingManagement', label: '收費項目管理' },
  { key: 'walletManagement', label: '會員儲值' },
  { key: 'herbLibrary', label: '中藥庫' },
  { key: 'acupointLibrary', label: '穴位庫' },
  { key: 'templateLibrary', label: '模板庫' }
];

const CLINIC_ACTION_PERMISSION_OPTIONS = [
  { key: 'patientCreate', label: '病人資料管理：新增病人' },
  { key: 'patientEdit', label: '病人資料管理：編輯病人' },
  { key: 'patientDelete', label: '病人資料管理：刪除病人' },
  { key: 'medicalRecordDelete', label: '病歷管理：刪除病歷' },
  { key: 'walletTopup', label: '會員儲值：充值' },
  { key: 'walletRefund', label: '會員儲值：退款' },
  { key: 'walletAdjust', label: '會員儲值：人工調整' },
  { key: 'herbInventoryEdit', label: '中藥庫：編輯庫存' },
  { key: 'herbBatchInventory', label: '中藥庫：批量入庫' }
];

const CLINIC_PERMISSION_POSITIONS = ['醫師', '護理師', '用戶'];

function getDefaultSectionPermissionMap(position) {
  const pos = position && position.trim ? position.trim() : (position || '');
  const roleList = ROLE_PERMISSIONS[pos] || [];
  const map = {};
  CLINIC_SECTION_PERMISSION_OPTIONS.forEach(item => {
    map[item.key] = roleList.includes(item.key);
  });
  return map;
}

function getDefaultActionPermissionMap(position) {
  const pos = position && position.trim ? position.trim() : (position || '');
  const roleList = ROLE_PERMISSIONS[pos] || [];
  const sectionDefaults = getDefaultSectionPermissionMap(pos);
  return {
    patientCreate: !!sectionDefaults.patientManagement,
    patientEdit: !!sectionDefaults.patientManagement,
    patientDelete: !!(pos === '診所管理' || pos === '護理師' || pos === '醫師'),
    medicalRecordDelete: !!(roleList.includes('medicalRecordManagement') && (pos === '診所管理' || pos === '護理師' || pos === '醫師')),
    walletTopup: !!sectionDefaults.walletManagement,
    walletRefund: pos === '診所管理',
    walletAdjust: pos === '診所管理',
    herbInventoryEdit: !!sectionDefaults.herbLibrary,
    herbBatchInventory: !!sectionDefaults.herbLibrary
  };
}

function getClinicPositionPermissionSettingsMap() {
  const raw = clinicSettings && clinicSettings.positionPermissionSettings;
  return raw && typeof raw === 'object' ? raw : {};
}

function getEffectivePermissionSettingsForPosition(position) {
  const pos = position ? String(position).trim() : '';
  const sectionDefaults = getDefaultSectionPermissionMap(pos);
  const actionDefaults = getDefaultActionPermissionMap(pos);
  const allOverrides = getClinicPositionPermissionSettingsMap();
  const posOverride = allOverrides[pos] && typeof allOverrides[pos] === 'object' ? allOverrides[pos] : {};
  const storedSections = posOverride.sections && typeof posOverride.sections === 'object' ? posOverride.sections : {};
  const storedActions = posOverride.actions && typeof posOverride.actions === 'object' ? posOverride.actions : {};
  // 該職位曾在新版「進入區塊權限」面板明確儲存後，其覆寫值即為最終決定
  // （可明確關閉醫師／護理師的會員儲值進入權限）；從未於新版面板儲存過的
  // 職位則沿用基準保護——舊版面板沒有會員儲值勾選項，儲存時會連帶寫入 false，
  // 不得因此剝奪醫師／護理師等基準開放職位的進入權限。
  const explicitEntryControl = Number(posOverride.entryControlVersion || 0) >= 2;
  const sections = {};
  const actions = {};
  CLINIC_SECTION_PERMISSION_OPTIONS.forEach(item => {
    const baseline = !!sectionDefaults[item.key];
    // 會員儲值為醫師／護理師／助理等角色的系統基準權限：
    // 舊診所設定中殘留的 false（基準開放前儲存）不得將其剝奪；
    // 管理員於新版面板明確儲存後，以管理員的設定為準。
    if (item.key === 'walletManagement' && baseline && !explicitEntryControl) {
      sections[item.key] = true;
    } else if (typeof storedSections[item.key] === 'boolean') {
      sections[item.key] = storedSections[item.key];
    } else {
      sections[item.key] = baseline;
    }
  });
  CLINIC_ACTION_PERMISSION_OPTIONS.forEach(item => {
    const baseline = !!actionDefaults[item.key];
    // 充值權限同理，基準開放的職位一律保留
    if (item.key === 'walletTopup' && baseline) {
      actions[item.key] = true;
    } else if (typeof storedActions[item.key] === 'boolean') {
      actions[item.key] = storedActions[item.key];
    } else {
      actions[item.key] = baseline;
    }
  });
  return { sections, actions };
}

function getOrderedMenuPermissions(menuItems) {
  const userPosition = (currentUserData && currentUserData.position) || '';
  const roleOrdered = ROLE_PERMISSIONS[userPosition] || [];
  const ordered = roleOrdered.filter(id => !!menuItems[id] && hasAccessToSection(id));
  const extras = Object.keys(menuItems).filter(id => !ordered.includes(id) && hasAccessToSection(id));
  return ordered.concat(extras);
}

function getEffectivePermissionSettingsForUser(user) {
  const position = user && user.position ? user.position : '';
  return getEffectivePermissionSettingsForPosition(position);
}

function hasActionPermission(actionKey) {
  if (!currentUserData) return false;
  const settings = getEffectivePermissionSettingsForUser(currentUserData);
  return !!(settings && settings.actions && settings.actions[actionKey]);
}

function hasAdminRole(user = currentUserData) {
  const position = user && user.position ? String(user.position).trim() : '';
  const claims = (typeof window !== 'undefined' && window.currentUserClaims && typeof window.currentUserClaims === 'object')
    ? window.currentUserClaims
    : {};
  const claimRole = claims.role ? String(claims.role).trim().toLowerCase() : '';
  return !!(
    claims.admin === true ||
    claimRole === 'admin' ||
    position === '診所管理'
  );
}

window.isAdminUser = function(user = currentUserData) {
  return hasAdminRole(user);
};

function updatePermissionControlledButtonsVisibility() {
  const addPatientBtn = document.getElementById('showAddPatientButton');
  if (addPatientBtn) {
    addPatientBtn.classList.toggle('hidden', !hasActionPermission('patientCreate'));
  }
  const batchInventoryBtn = document.getElementById('batchInventoryBtn');
  if (batchInventoryBtn) {
    batchInventoryBtn.classList.toggle('hidden', !hasActionPermission('herbBatchInventory'));
  }
}

function getCurrentVisibleSectionId() {
  const sectionIds = [
    'patientManagement',
    'consultationSystem',
    'medicalRecordManagement',
    'herbLibrary',
    'acupointLibrary',
    'templateLibrary',
    'scheduleManagement',
    'billingManagement',
    'walletManagement',
    'userManagement',
    'financialReports',
    'systemManagement',
    'personalSettings',
    'personalStatistics',
    'accountSecurity'
  ];
  return sectionIds.find(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  }) || null;
}

function refreshClinicScopedUi() {
  try {
    if (typeof generateSidebarMenu === 'function') {
      generateSidebarMenu();
    }
  } catch (_eMenu) {}
  try {
    if (typeof updateWelcomeCards === 'function') {
      updateWelcomeCards();
    }
  } catch (_eWelcome) {}
  try {
    updatePermissionControlledButtonsVisibility();
  } catch (_eButtons) {}

  const currentSectionId = getCurrentVisibleSectionId();
  if (!currentSectionId) return;

  if (!hasAccessToSection(currentSectionId)) {
    try {
      hideAllSections();
    } catch (_eHide) {}
    const welcomePage = document.getElementById('welcomePage');
    if (welcomePage) {
      welcomePage.classList.remove('hidden');
    }
    showToast('已切換至其他診所，當前頁面在這間診所沒有存取權限', 'warning');
    return;
  }

  if (currentSectionId === 'patientManagement') {
    try {
      if (!hasActionPermission('patientCreate') && typeof hideAddPatientForm === 'function') {
        hideAddPatientForm();
      }
    } catch (_eHideModal) {}
    try {
      loadPatientList();
    } catch (_eLoadPatients) {}
  } else if (currentSectionId === 'medicalRecordManagement') {
    try {
      if (typeof loadMedicalRecordManagement === 'function') {
        loadMedicalRecordManagement();
      }
    } catch (_eLoadMedicalRecords) {}
  } else if (currentSectionId === 'systemManagement') {
    try {
      if (typeof loadPermissionManagementPanel === 'function') {
        loadPermissionManagementPanel();
      }
    } catch (_eLoadPermissionPanel) {}
  } else if (currentSectionId === 'walletManagement') {
    try {
      if (typeof window.clearWalletCaches === 'function') {
        window.clearWalletCaches();
      }
      if (typeof window.loadWalletManagement === 'function') {
        window.loadWalletManagement();
      }
    } catch (_eLoadWallet) {}
  }
}


// 依系統版本（version-config.js）隱藏標示 data-version-feature 的元素：
// 功能關閉時加上 hidden，開啟時移除（避免殘留隱藏狀態）。
function applyVersionFeatureVisibility() {
  try {
    document.querySelectorAll('[data-version-feature]').forEach(function (el) {
      var feature = el.getAttribute('data-version-feature');
      var enabled = (typeof window.isVersionFeatureEnabled === 'function')
        ? window.isVersionFeatureEnabled(feature)
        : true;
      el.classList.toggle('hidden', !enabled);
    });
  } catch (_e) {}
}

// 版本功能是否開啟的簡短封裝（API 不存在時視為開啟，保持舊行為）
function versionFeatureEnabled(featureName) {
  return (typeof window.isVersionFeatureEnabled === 'function')
    ? window.isVersionFeatureEnabled(featureName)
    : true;
}

// 頁面載入時先套用一次（defer 腳本執行時 DOM 已解析完成）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyVersionFeatureVisibility);
} else {
  applyVersionFeatureVisibility();
}

function hasAccessToSection(sectionId) {

  if (!currentUserData || !currentUserData.position) return false;

  // 版本限制：會員功能關閉時（如簡單版），不得進入「會員儲值」區
  if (sectionId === 'walletManagement' && !versionFeatureEnabled('membership')) {
    return false;
  }

  
  const pos = currentUserData.position.trim ? currentUserData.position.trim() : currentUserData.position;

  
  
  
  
  if (sectionId === 'userManagement') {
    return hasAdminRole(currentUserData);
  }

  
  const clinicSectionKeys = CLINIC_SECTION_PERMISSION_OPTIONS.map(item => item.key);
  if (clinicSectionKeys.includes(sectionId)) {
    const effective = getEffectivePermissionSettingsForUser(currentUserData);
    return !!(effective && effective.sections && effective.sections[sectionId]);
  }

  const allowed = ROLE_PERMISSIONS[pos] || [];
  return allowed.includes(sectionId);
}


let patients = [];
let consultations = [];
function readCache(name, key) {
    try {
        const s = localStorage.getItem(name);
        if (!s) return null;
        const obj = JSON.parse(s);
        const v = obj && obj[key];
        return v || null;
    } catch (_e) {
        return null;
    }
}
function writeCache(name, key, value) {
    try {
        const s = localStorage.getItem(name);
        const obj = s ? JSON.parse(s) : {};
        obj[key] = value;
        localStorage.setItem(name, JSON.stringify(obj));
    } catch (_e) {}
}
let appointments = [];

let patientCache = null;


let globalUsageCounts = {};



async function computeGlobalUsageCounts() {
    
    try {
        
        try {
            if (typeof stopInactivityMonitoring === 'function') {
                stopInactivityMonitoring();
            }
        } catch (_e) {
            
        }
        if (!Array.isArray(consultations) || consultations.length === 0) {
            if (typeof loadConsultationsForFinancial === 'function') {
                await loadConsultationsForFinancial();
            }
        }
    } catch (_e) {
        
    }
    globalUsageCounts = {};
    let list = Array.isArray(consultations) ? consultations.slice() : [];
    try {
        const cid = typeof currentClinicId !== 'undefined' ? currentClinicId : null;
        const cnameZh = clinicSettings && clinicSettings.chineseName ? String(clinicSettings.chineseName).trim().toLowerCase() : '';
        const cnameEn = clinicSettings && clinicSettings.englishName ? String(clinicSettings.englishName).trim().toLowerCase() : '';
        if (cid && cid !== 'local-default') {
            list = list.filter(cons => {
                try {
                    const itemCid = cons && cons.clinicId ? String(cons.clinicId) : '';
                    const itemName = cons && cons.clinicName ? String(cons.clinicName).trim().toLowerCase() : '';
                    if (itemCid && String(itemCid) === String(cid)) return true;
                    if (itemName && (itemName === cnameZh || itemName === cnameEn)) return true;
                } catch (_e0) {}
                return false;
            });
        }
    } catch (_ef) {}
    if (Array.isArray(list)) {
        list.forEach(cons => {
            try {
                const pres = cons && cons.prescription ? cons.prescription : '';
                const lines = pres.split('\n');
                lines.forEach(rawLine => {
                    const line = rawLine.trim();
                    if (!line) return;
                    const match = line.match(/^([^0-9\s\(\)\.]+)/);
                    const name = match ? match[1].trim() : line.split(/[\d\s]/)[0];
                    if (!name) return;
                    globalUsageCounts[name] = (globalUsageCounts[name] || 0) + 1;
                });
            } catch (_e) {
                
            }
        });
    }
    if (Array.isArray(herbLibrary)) {
        herbLibrary.forEach(item => {
            try {
                item.usageCount = globalUsageCounts[item.name] || 0;
            } catch (_e) {
                item.usageCount = 0;
            }
        });
    }
}




async function loadPastRecords(patientId, excludeConsultationId = null) {
    try {
        let records = [];
        try {
            // 使用快取：單病人 consultations onSnapshot 已保證跨裝置即時同步，無需每次強制全量刷新
            const res = await window.firebaseDataManager.getPatientConsultations(patientId, false);
            if (res && res.success && Array.isArray(res.data)) {
                records = res.data;
            }
        } catch (err) {
            console.error('載入診症記錄時發生錯誤:', err);
        }
        if (!Array.isArray(records) || records.length === 0) {
            return;
        }
        records = records.filter(c => {
            if (!c || (typeof c.patientId === 'undefined')) return false;
            if (String(c.patientId) !== String(patientId)) return false;
            if (excludeConsultationId && String(c.id) === String(excludeConsultationId)) return false;
            return true;
        }).sort((a, b) => {
            const getTime = (c) => {
                let d = null;
                if (c.date) {
                    if (typeof c.date === 'object' && c.date.seconds) {
                        d = new Date(c.date.seconds * 1000);
                    } else {
                        d = new Date(c.date);
                    }
                } else if (c.createdAt) {
                    if (typeof c.createdAt === 'object' && c.createdAt.seconds) {
                        d = new Date(c.createdAt.seconds * 1000);
                    } else {
                        d = new Date(c.createdAt);
                    }
                }
                return d ? d.getTime() : 0;
            };
            return getTime(b) - getTime(a);
        });
        
        const lines = records.map(c => {
            let dateObj = null;
            if (c.date) {
                if (typeof c.date === 'object' && c.date.seconds) {
                    dateObj = new Date(c.date.seconds * 1000);
                } else {
                    dateObj = new Date(c.date);
                }
            } else if (c.createdAt) {
                if (typeof c.createdAt === 'object' && c.createdAt.seconds) {
                    dateObj = new Date(c.createdAt.seconds * 1000);
                } else {
                    dateObj = new Date(c.createdAt);
                }
            }
            const dateStr = dateObj ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}` : '';
            const symptoms = c.symptoms ? String(c.symptoms).replace(/\n/g, ' ').trim() : '';
            const history = c.currentHistory ? String(c.currentHistory).replace(/\n/g, ' ').trim() : '';
            const tongue = c.tongue ? String(c.tongue).replace(/\n/g, ' ').trim() : '';
            const pulse = c.pulse ? String(c.pulse).replace(/\n/g, ' ').trim() : '';
            const parts = [];
            
            if (symptoms) parts.push(symptoms);
            if (history) parts.push(history);
            
            const special = [];
            if (tongue) special.push(tongue);
            if (pulse) special.push(pulse);
            if (special.length) parts.push(`(${special.join('，')})`);
            const content = parts.join(' ').trim();
            return `${dateStr} ${content}`.trim();
        });
        
        const historyField = document.getElementById('formCurrentHistory');
        if (historyField) {
            
            
            const separator = '\n──────────\n';
            historyField.value = lines.join(separator);
        }
    } catch (e) {
        console.error('載入過往記錄時發生錯誤:', e);
    }
}






/* Phase 3 ESM 遷移：帳號安全（改密碼／自我封存，loadAccountSecurity）已移至 js/domains/auth/session.js，window facade 見 js/app.js；原 system.js 段落已刪除 */





let patientPackagesCache = {};
let patientConsultationsCache = {};
let patientConsultationsListeners = {};
let currentPatientHistoryPatientId = null;
let currentConsultationHistoryPatientId = null;
// consultationHistoryPager 批次拉取大小：每次 getDocs 拉取多筆病歷，
// 而不是逐筆拉取。例如一個病人有 50 筆病歷，原本需要 50 次 getDocs，
// 改為 BATCH_SIZE=20 後只需要 3 次。
const CONSULTATION_PAGER_BATCH_SIZE = 20;

const consultationHistoryPager = {
    patientPagedCache: {},
    contexts: {
        patient: {
            getPatientId: () => currentPatientHistoryPatientId,
            setPatientId: (id) => { currentPatientHistoryPatientId = id; },
            getConsultations: () => currentPatientConsultations,
            setConsultations: (list) => { currentPatientConsultations = list; },
            getCurrentPage: () => currentPatientHistoryPage,
            setCurrentPage: (page) => { currentPatientHistoryPage = page; }
        },
        consultation: {
            getPatientId: () => currentConsultationHistoryPatientId,
            setPatientId: (id) => { currentConsultationHistoryPatientId = id; },
            getConsultations: () => currentConsultationConsultations,
            setConsultations: (list) => { currentConsultationConsultations = list; },
            getCurrentPage: () => currentConsultationHistoryPage,
            setCurrentPage: (page) => { currentConsultationHistoryPage = page; }
        }
    },
    normalizeAndSortConsultations(list) {
        const arr = Array.isArray(list) ? list.slice() : [];
        return arr.sort((a, b) => {
            const dateA = getConsultationEffectiveDate(a);
            const dateB = getConsultationEffectiveDate(b);
            if (!dateA || isNaN(dateA.getTime())) return 1;
            if (!dateB || isNaN(dateB.getTime())) return -1;
            return dateA - dateB;
        });
    },
    createEmptyPatientState(patientId) {
        return {
            patientId: String(patientId || ''),
            totalCount: 0,
            countReady: false,
            recordsByIndex: [],
            descPageCache: {},
            descPageCursors: {},
            ascPageCache: {},
            ascPageCursors: {},
            allLoaded: false,
            mode: 'paged',
            dateIndexMap: {},
            dateIndexReady: false,
            monthDateIndexCache: {},
            // 部分月索引：true 代表該月快取只含單日補讀結果，不能當成整月索引使用
            monthDateIndexPartial: {},
            // 月初前累計筆數快取（asc offset 基準）：{ [monthKey]: { offset, totalCount } }
            // 僅在 state.totalCount 未變時重用，避免翻月時重複 getCountFromServer
            monthOffsetCache: {}
        };
    },
    dateToKey(dateObj) {
        if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '';
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },
    getRecordDateKey(record) {
        if (!record || typeof record !== 'object') return '';
        const d = parseConsultationDate(record.date || record.createdAt || record.updatedAt || null);
        return this.dateToKey(d);
    },
    rebuildDateIndexFromState(state) {
        if (!state || !Array.isArray(state.recordsByIndex)) return;
        const map = {};
        state.recordsByIndex.forEach((record, idx) => {
            const key = this.getRecordDateKey(record);
            if (!key) return;
            if (!Array.isArray(map[key])) {
                map[key] = [];
            }
            map[key].push(idx);
        });
        state.dateIndexMap = map;
        state.dateIndexReady = true;
    },
    getCachedPatientState(patientId) {
        const pid = String(patientId || '');
        if (!pid) return null;
        if (!this.patientPagedCache[pid]) {
            this.patientPagedCache[pid] = this.createEmptyPatientState(pid);
        }
        return this.patientPagedCache[pid];
    },
    async ensurePatientState(patientId, forceRefresh = false) {
        const pid = String(patientId || '');
        if (!pid) return { success: false, state: null };
        let state = this.getCachedPatientState(pid);
        if (!state) return { success: false, state: null };
        if (forceRefresh) {
            state = this.createEmptyPatientState(pid);
            this.patientPagedCache[pid] = state;
        }
        if (state.countReady && !forceRefresh) {
            return { success: true, state };
        }
        if (state.mode === 'full' && Array.isArray(state.recordsByIndex) && !forceRefresh) {
            state.totalCount = state.recordsByIndex.length;
            state.countReady = true;
            return { success: true, state };
        }
        try {
            const patient = await getPatientByIdWithRefresh(pid);
            const aggregateCount = patient && typeof patient.consultationCount === 'number' && patient.consultationCount >= 0
                ? Math.max(0, Number(patient.consultationCount) || 0)
                : null;
            const hasReliableAggregate = aggregateCount !== null && aggregateCount > 0 && !!patient.latestConsultationAt;
            if (hasReliableAggregate) {
                const total = aggregateCount;
                state.totalCount = total;
                state.countReady = true;
                state.recordsByIndex = new Array(total);
                state.mode = 'paged';
                state.allLoaded = false;
                return { success: true, state };
            }
        } catch (_patientAggregateError) {}
        try {
            if (window.firebaseDataManager && typeof window.firebaseDataManager.ensurePatientConsultationSortDates === 'function') {
                const backfillResult = await window.firebaseDataManager.ensurePatientConsultationSortDates(pid);
                if (!backfillResult || !backfillResult.success) {
                    throw new Error((backfillResult && backfillResult.error) || 'sortDate backfill failed');
                }
            }
            await waitForFirebaseDb();
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const q = window.firebase.firestoreQuery(colRef, window.firebase.where('patientId', '==', pid));
            const countSnap = await window.firebase.getCountFromServer(q);
            const total = Number(countSnap && countSnap.data && countSnap.data().count) || 0;
            state.totalCount = total;
            state.countReady = true;
            state.recordsByIndex = new Array(total);
            state.mode = 'paged';
            state.allLoaded = false;
            try {
                if (window.firebaseDataManager && typeof window.firebaseDataManager.applyPatientAggregateToCaches === 'function') {
                    window.firebaseDataManager.applyPatientAggregateToCaches(pid, {
                        consultationCount: total,
                        ...(total === 0 ? { latestConsultationAt: null, latestFollowUpDate: null } : {})
                    });
                }
            } catch (_aggregateCachePatchErr) {}
            return { success: true, state };
        } catch (error) {
            console.warn('病歷分頁初始化失敗，改用全量讀取模式:', error);
            return await this.loadFullModeFallback(pid);
        }
    },
    async loadFullModeFallback(patientId) {
        const pid = String(patientId || '');
        const state = this.getCachedPatientState(pid);
        if (!state) return { success: false, state: null };
        const consultationResult = await window.firebaseDataManager.getPatientConsultations(pid, true);
        if (!consultationResult || !consultationResult.success) {
            return { success: false, state };
        }
        const sorted = this.normalizeAndSortConsultations(consultationResult.data || []);
        state.mode = 'full';
        state.allLoaded = true;
        state.totalCount = sorted.length;
        state.countReady = true;
        state.recordsByIndex = sorted.slice();
        state.descPageCache = {};
        state.descPageCursors = {};
        // 全量模式的索引基準（有效日期排序）與分頁模式（sortDate 排序）不同，
        // 必須丟棄所有月索引，避免日曆沿用舊的錯位索引
        state.monthDateIndexCache = {};
        state.monthDateIndexPartial = {};
        state.monthOffsetCache = {};
        this.rebuildDateIndexFromState(state);
        return { success: true, state };
    },
    async fetchDescPage(patientId, descPageNumber) {
        const pid = String(patientId || '');
        const targetPageNum = Number(descPageNumber) || 1;
        const state = this.getCachedPatientState(pid);
        if (!state || targetPageNum < 1) return { success: false };
        if (state.mode === 'full') return { success: true };
        if (Object.prototype.hasOwnProperty.call(state.descPageCache, targetPageNum)) return { success: true };
        try {
            await waitForFirebaseDb();
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');

            // 找出第一個缺失的 page（從 1 到 targetPageNum）
            // 用 hasOwnProperty 檢查，確保 null sentinel（表示到底）不被當成缺失
            let firstMissing = 1;
            for (; firstMissing <= targetPageNum; firstMissing++) {
                if (!Object.prototype.hasOwnProperty.call(state.descPageCache, firstMissing)) break;
            }
            if (firstMissing > targetPageNum) return { success: true };

            // 批次拉取：每次從 firstMissing 開始拉 BATCH_SIZE 筆
            // 一次 getDocs 就填多個 cache entry，大幅減少 read 次數
            while (firstMissing <= targetPageNum) {
                const queryParts = [
                    window.firebase.where('patientId', '==', pid),
                    window.firebase.orderBy('sortDate', 'desc'),
                    window.firebase.limit(CONSULTATION_PAGER_BATCH_SIZE)
                ];
                // 用上一個已拉完 page 的 cursor 來 startAfter
                const cursorKey = firstMissing - 1;
                if (cursorKey >= 1 && state.descPageCursors[cursorKey]) {
                    queryParts.push(window.firebase.startAfter(state.descPageCursors[cursorKey]));
                }
                const q = window.firebase.firestoreQuery(colRef, ...queryParts);
                const snapshot = await window.firebase.getDocs(q);

                const docs = [];
                snapshot.forEach((docSnap) => docs.push({ id: docSnap.id, ...docSnap.data() }));

                if (docs.length === 0) {
                    // 沒有更多資料了：在 firstMissing 標記 null 表示到底
                    state.descPageCache[firstMissing] = null;
                    break;
                }

                // 把整個批次的 doc 都填到 cache（預取超範圍的資料是批次拉取的優勢）
                for (let j = 0; j < docs.length; j++) {
                    const pageIdx = firstMissing + j;
                    const doc = docs[j];
                    state.descPageCache[pageIdx] = doc;
                    const uiIndex = state.totalCount - pageIdx;
                    if (uiIndex >= 0 && uiIndex < state.totalCount) {
                        state.recordsByIndex[uiIndex] = doc;
                    }
                }

                // 存 cursor：這個 batch 最後一筆對應的 pageIdx
                const lastPageIdx = firstMissing + docs.length - 1;
                state.descPageCursors[lastPageIdx] = snapshot.docs[snapshot.docs.length - 1];

                // 如果這個 batch 不滿（到尾了）就停，並填充 null sentinels
                // 避免未來請求超過實際資料範圍時再發一次空的 getDocs
                if (docs.length < CONSULTATION_PAGER_BATCH_SIZE) {
                    for (let p = lastPageIdx + 1; p <= targetPageNum; p++) {
                        state.descPageCache[p] = null;
                    }
                    break;
                }
                firstMissing += docs.length;
            }
            return { success: true };
        } catch (error) {
            console.warn('病歷分頁讀取失敗，改用全量讀取模式:', error);
            return await this.loadFullModeFallback(pid);
        }
    },
    async fetchAscPage(patientId, ascPageNumber) {
        const pid = String(patientId || '');
        const targetPageNum = Number(ascPageNumber) || 1;
        const state = this.getCachedPatientState(pid);
        if (!state || targetPageNum < 1) return { success: false };
        if (state.mode === 'full') return { success: true };
        if (Object.prototype.hasOwnProperty.call(state.ascPageCache, targetPageNum)) return { success: true };
        try {
            await waitForFirebaseDb();
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');

            // 找出第一個缺失的 page（從 1 到 targetPageNum）
            let firstMissing = 1;
            for (; firstMissing <= targetPageNum; firstMissing++) {
                if (!Object.prototype.hasOwnProperty.call(state.ascPageCache, firstMissing)) break;
            }
            if (firstMissing > targetPageNum) return { success: true };

            // 批次拉取：每次從 firstMissing 開始拉 BATCH_SIZE 筆
            while (firstMissing <= targetPageNum) {
                const queryParts = [
                    window.firebase.where('patientId', '==', pid),
                    window.firebase.orderBy('sortDate', 'asc'),
                    window.firebase.limit(CONSULTATION_PAGER_BATCH_SIZE)
                ];
                // 用上一個已拉完 page 的 cursor 來 startAfter
                const cursorKey = firstMissing - 1;
                if (cursorKey >= 1 && state.ascPageCursors[cursorKey]) {
                    queryParts.push(window.firebase.startAfter(state.ascPageCursors[cursorKey]));
                }
                const q = window.firebase.firestoreQuery(colRef, ...queryParts);
                const snapshot = await window.firebase.getDocs(q);

                const docs = [];
                snapshot.forEach((docSnap) => docs.push({ id: docSnap.id, ...docSnap.data() }));

                if (docs.length === 0) {
                    state.ascPageCache[firstMissing] = null;
                    break;
                }

                // 把整個批次的 doc 都填到 cache（預取超範圍的資料是批次拉取的優勢）
                for (let j = 0; j < docs.length; j++) {
                    const pageIdx = firstMissing + j;
                    const doc = docs[j];
                    state.ascPageCache[pageIdx] = doc;
                    const uiIndex = pageIdx - 1;
                    if (uiIndex >= 0 && uiIndex < state.totalCount) {
                        state.recordsByIndex[uiIndex] = doc;
                    }
                }

                // 存 cursor：這個 batch 最後一筆對應的 pageIdx
                const lastPageIdx = firstMissing + docs.length - 1;
                state.ascPageCursors[lastPageIdx] = snapshot.docs[snapshot.docs.length - 1];

                // 如果這個 batch 不滿（到尾了）就停，並填充 null sentinels
                // 避免未來請求超過實際資料範圍時再發一次空的 getDocs
                if (docs.length < CONSULTATION_PAGER_BATCH_SIZE) {
                    for (let p = lastPageIdx + 1; p <= targetPageNum; p++) {
                        state.ascPageCache[p] = null;
                    }
                    break;
                }
                firstMissing += docs.length;
            }
            return { success: true };
        } catch (error) {
            console.warn('病歷升序讀取失敗，改用全量讀取模式:', error);
            return await this.loadFullModeFallback(pid);
        }
    },
    async ensureLoadedAtIndex(patientId, index) {
        const pid = String(patientId || '');
        const targetIndex = Number(index);
        const stateResult = await this.ensurePatientState(pid, false);
        if (!stateResult.success || !stateResult.state) return false;
        const state = stateResult.state;
        if (targetIndex < 0 || targetIndex >= state.totalCount) return false;
        if (state.recordsByIndex[targetIndex]) return true;
        if (state.mode === 'full') return !!state.recordsByIndex[targetIndex];
        const distanceFromOldest = targetIndex;
        const distanceFromNewest = Math.max(0, state.totalCount - 1 - targetIndex);
        let pageResult;
        if (distanceFromOldest < distanceFromNewest) {
            const ascPageNumber = targetIndex + 1;
            pageResult = await this.fetchAscPage(pid, ascPageNumber);
        } else {
            const descPageNumber = state.totalCount - targetIndex;
            pageResult = await this.fetchDescPage(pid, descPageNumber);
        }
        return !!(pageResult && pageResult.success && state.recordsByIndex[targetIndex]);
    },
    buildFullModeMonthMap(state, year, month) {
        const monthKey = `${Number(year)}-${String(Number(month) + 1).padStart(2, '0')}`;
        const monthMap = {};
        Object.entries((state && state.dateIndexMap) || {}).forEach(([dateKey, indices]) => {
            if (String(dateKey).slice(0, 7) === monthKey) {
                monthMap[dateKey] = Array.isArray(indices) ? indices.slice() : [];
            }
        });
        if (state) {
            state.monthDateIndexCache[monthKey] = monthMap;
            state.monthDateIndexPartial[monthKey] = false;
        }
        return monthMap;
    },
    // 計算月初前累計筆數（日曆 asc 索引基準）。state.totalCount 未變時可重用，
    // 避免同一工作階段翻月時重複執行 getCountFromServer。
    async getMonthBaseOffset(state, pid, colRef, monthStart, monthKey) {
        if (state.monthOffsetCache &&
            state.monthOffsetCache[monthKey] &&
            state.monthOffsetCache[monthKey].totalCount === state.totalCount) {
            return state.monthOffsetCache[monthKey].offset;
        }
        const countQuery = window.firebase.firestoreQuery(
            colRef,
            window.firebase.where('patientId', '==', pid),
            window.firebase.where('sortDate', '<', monthStart)
        );
        const countSnap = await window.firebase.getCountFromServer(countQuery);
        const offset = Number(countSnap && countSnap.data && countSnap.data().count) || 0;
        if (!state.monthOffsetCache) state.monthOffsetCache = {};
        state.monthOffsetCache[monthKey] = { offset, totalCount: state.totalCount };
        return offset;
    },
    // 把全月查詢結果順手預取進 recordsByIndex 槽位（純本地操作，零額外讀取），
    // 同時建立「日期 -> asc 索引」的月圓點 map。填充時即場校驗槽位：
    // 槽位被其他病歷佔據（id 不同）或索引超出 totalCount 範圍，代表分頁索引已飄移。
    // 預取後使用者點選月內任何日期都直接命中槽位，無需再發當日查詢，也不會把月索引標成 partial。
    fillMonthDocsIntoState(state, docs, baseOffset) {
        if (!state || !Array.isArray(state.recordsByIndex)) {
            return { monthMap: {}, coherent: false };
        }
        const monthMap = {};
        let coherent = true;
        let ascOffset = Number(baseOffset) || 0;
        docs.forEach((docSnap) => {
            const rec = { id: docSnap.id, ...docSnap.data() };
            const idx = ascOffset;
            if (idx < 0 || idx >= state.totalCount) {
                coherent = false;
            } else {
                const existing = state.recordsByIndex[idx];
                if (existing && existing.id !== rec.id) {
                    coherent = false;
                } else {
                    if (!existing) state.recordsByIndex[idx] = rec;
                    const key = this.getRecordDateKey(rec);
                    if (key) {
                        if (!Array.isArray(monthMap[key])) monthMap[key] = [];
                        monthMap[key].push(idx);
                    }
                }
            }
            ascOffset += 1;
        });
        return { monthMap, coherent, endOffset: ascOffset };
    },
    // 分頁索引飄移的局部自愈：以伺服器端權威總數（1 次聚合 count，不讀病歷文件）
    // 校正 totalCount，並重算當月 baseOffset、用手上已取得的全月文件重建槽位。
    // 僅當飄移源頭是 patients.consultationCount 聚合欄位過期時可修復；
    // 若權威總數與本地相同卻仍對不上，代表存在 sortDate 與病歷日期不一致的記錄，
    // 回 null 交由全量模式（以有效日期排序）作最終守備。
    async repairMonthIndexWithFreshCount(state, pid, monthDocs, monthStart, monthKey) {
        await waitForFirebaseDb();
        const colRef = window.firebase.collection(window.firebase.db, 'consultations');
        const totalQuery = window.firebase.firestoreQuery(
            colRef,
            window.firebase.where('patientId', '==', pid)
        );
        const totalSnap = await window.firebase.getCountFromServer(totalQuery);
        const freshTotal = Number(totalSnap && totalSnap.data && totalSnap.data().count) || 0;
        if (freshTotal === state.totalCount) return null;
        // 聚合總數改變後，所有 asc 槽位與分頁游標都可能已位移，必須全數失效
        state.totalCount = freshTotal;
        state.countReady = true;
        state.recordsByIndex = new Array(freshTotal);
        state.descPageCache = {};
        state.descPageCursors = {};
        state.ascPageCache = {};
        state.ascPageCursors = {};
        state.monthDateIndexCache = {};
        state.monthDateIndexPartial = {};
        state.monthOffsetCache = {};
        // 以新總數重新計算當月權威 baseOffset（不重用可能已過期的快取）
        const baseCountQuery = window.firebase.firestoreQuery(
            colRef,
            window.firebase.where('patientId', '==', pid),
            window.firebase.where('sortDate', '<', monthStart)
        );
        const baseCountSnap = await window.firebase.getCountFromServer(baseCountQuery);
        const baseOffset = Number(baseCountSnap && baseCountSnap.data && baseCountSnap.data().count) || 0;
        state.monthOffsetCache[monthKey] = { offset: baseOffset, totalCount: freshTotal };
        const { monthMap, coherent } = this.fillMonthDocsIntoState(state, monthDocs, baseOffset);
        if (!coherent) return null;
        return monthMap;
    },
    // 強制切換到全量模式並以「有效日期」重建索引，保證日曆圓點與點擊結果一致
    async forceFullMode(patientId) {
        const fallback = await this.loadFullModeFallback(patientId);
        if (!fallback || !fallback.success || !fallback.state) return null;
        this.rebuildDateIndexFromState(fallback.state);
        return fallback.state;
    },
    async ensureMonthDateIndex(patientId, year, month) {
        const pid = String(patientId || '');
        if (!pid) return false;
        const targetYear = Number(year);
        const targetMonth = Number(month);
        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth)) return false;
        const stateResult = await this.ensurePatientState(pid, false);
        if (!stateResult.success || !stateResult.state) return false;
        const state = stateResult.state;
        const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
        if (state.mode === 'full') {
            this.rebuildDateIndexFromState(state);
            this.buildFullModeMonthMap(state, targetYear, targetMonth);
            return true;
        }
        // 只有完整的整月索引可直接重用；單日補讀產生的部分索引必須重建
        if (state.monthDateIndexCache &&
            state.monthDateIndexCache[monthKey] &&
            !state.monthDateIndexPartial[monthKey]) {
            return true;
        }
        try {
            await waitForFirebaseDb();
            const monthStart = new Date(targetYear, targetMonth, 1);
            const nextMonthStart = new Date(targetYear, targetMonth + 1, 1);
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const ascOffset = await this.getMonthBaseOffset(state, pid, colRef, monthStart, monthKey);
            const monthQuery = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('patientId', '==', pid),
                window.firebase.where('sortDate', '>=', monthStart),
                window.firebase.where('sortDate', '<', nextMonthStart),
                window.firebase.orderBy('sortDate', 'asc')
            );
            const monthSnap = await window.firebase.getDocs(monthQuery);
            // 全月文件順手預取進槽位：之後點選月內任何日期都直接命中，
            // 無需再發「當日 count + 當日 getDocs」，也不會把月索引標成 partial。
            const fillResult = this.fillMonthDocsIntoState(state, monthSnap.docs, ascOffset);
            if (!fillResult.coherent) {
                // 最常見是 patients.consultationCount 聚合欄位過期：
                // 先以 1 次聚合 count 局部自愈，不直接全量讀取所有病歷。
                const repairedMap = await this.repairMonthIndexWithFreshCount(
                    state, pid, monthSnap.docs, monthStart, monthKey
                );
                if (!repairedMap) {
                    // 權威總數無誤仍對不上＝存在 sortDate 與病歷日期不一致的記錄，最終守備
                    console.warn('病歷分頁索引與日期不一致，改用全量讀取模式重建日曆索引');
                    const fullState = await this.forceFullMode(pid);
                    if (!fullState) return false;
                    this.buildFullModeMonthMap(fullState, targetYear, targetMonth);
                    return true;
                }
                state.monthDateIndexCache[monthKey] = repairedMap;
                state.monthDateIndexPartial[monthKey] = false;
                return true;
            }
            state.monthDateIndexCache[monthKey] = fillResult.monthMap;
            state.monthDateIndexPartial[monthKey] = false;
            return true;
        } catch (error) {
            console.warn('建立病歷月份索引失敗，改用全量讀取模式:', error);
            const fallback = await this.loadFullModeFallback(pid);
            if (!fallback.success || !fallback.state) return false;
            this.rebuildDateIndexFromState(fallback.state);
            this.buildFullModeMonthMap(fallback.state, targetYear, targetMonth);
            return true;
        }
    },
    async ensureDateIndex(patientId) {
        const pid = String(patientId || '');
        if (!pid) return false;
        const stateResult = await this.ensurePatientState(pid, false);
        if (!stateResult.success || !stateResult.state) return false;
        const state = stateResult.state;
        if (state.dateIndexReady && state.dateIndexMap && Object.keys(state.dateIndexMap).length > 0) {
            return true;
        }
        if (state.mode === 'full') {
            this.rebuildDateIndexFromState(state);
            return true;
        }
        try {
            await waitForFirebaseDb();
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('patientId', '==', pid),
                window.firebase.orderBy('sortDate', 'desc')
            );
            const snapshot = await window.firebase.getDocs(q);
            const map = {};
            let descIndex = 0;
            snapshot.forEach((docSnap) => {
                const rec = { id: docSnap.id, ...docSnap.data() };
                const key = this.getRecordDateKey(rec);
                if (!key) {
                    descIndex++;
                    return;
                }
                const ascIndex = Math.max(0, state.totalCount - 1 - descIndex);
                if (!Array.isArray(map[key])) {
                    map[key] = [];
                }
                map[key].push(ascIndex);
                descIndex++;
            });
            state.dateIndexMap = map;
            state.dateIndexReady = true;
            return true;
        } catch (_err) {
            const fallback = await this.loadFullModeFallback(pid);
            if (!fallback.success || !fallback.state) return false;
            this.rebuildDateIndexFromState(fallback.state);
            return true;
        }
    },
    getDateIndex(patientId, dateKey) {
        const state = this.getCachedPatientState(patientId);
        if (!state || !state.dateIndexMap) return null;
        const indices = state.dateIndexMap[dateKey];
        if (!Array.isArray(indices) || indices.length === 0) return null;
        return indices[indices.length - 1];
    },
    getDateIndices(patientId, dateKey) {
        const state = this.getCachedPatientState(patientId);
        if (!state || !state.dateIndexMap) return [];
        const indices = state.dateIndexMap[dateKey];
        return Array.isArray(indices) ? indices.slice() : [];
    },
    getDateIndexMap(patientId) {
        const state = this.getCachedPatientState(patientId);
        return (state && state.dateIndexMap) ? state.dateIndexMap : {};
    },
    getMonthDateIndexMap(patientId, year, month) {
        const state = this.getCachedPatientState(patientId);
        if (!state || !state.monthDateIndexCache) return {};
        const monthKey = `${Number(year)}-${String(Number(month) + 1).padStart(2, '0')}`;
        return state.monthDateIndexCache[monthKey] || {};
    },
    async loadRecordsForDate(patientId, dateKey) {
        const pid = String(patientId || '');
        const key = String(dateKey || '').trim();
        if (!pid || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            return { success: false, indices: [] };
        }
        const stateResult = await this.ensurePatientState(pid, false);
        if (!stateResult.success || !stateResult.state) {
            return { success: false, indices: [] };
        }
        const state = stateResult.state;
        if (state.mode === 'full') {
            if (!state.dateIndexReady) {
                this.rebuildDateIndexFromState(state);
            }
            return { success: true, indices: Array.isArray(state.dateIndexMap[key]) ? state.dateIndexMap[key].slice() : [] };
        }
        const fallbackToFull = async () => {
            const fullState = await this.forceFullMode(pid);
            if (!fullState) return { success: false, indices: [] };
            return {
                success: true,
                indices: Array.isArray(fullState.dateIndexMap[key]) ? fullState.dateIndexMap[key].slice() : []
            };
        };
        const existingIndices = [];
        if (state.monthDateIndexCache) {
            Object.values(state.monthDateIndexCache).forEach((monthMap) => {
                const arr = monthMap && Array.isArray(monthMap[key]) ? monthMap[key] : null;
                if (arr && arr.length > 0) {
                    arr.forEach((idx) => {
                        if (!existingIndices.includes(idx)) {
                            existingIndices.push(idx);
                        }
                    });
                }
            });
        }
        if (existingIndices.length > 0 && existingIndices.every((idx) => !!state.recordsByIndex[idx])) {
            // 槽位內容必須真的是該日期的病歷；對不上代表索引飄移
            const slotsMatch = existingIndices
                .map((idx) => this.getRecordDateKey(state.recordsByIndex[idx]))
                .every((slotKey) => slotKey === key);
            if (!slotsMatch) {
                // 先廢棄當月索引並局部自愈（ensureMonthDateIndex 內含權威 count 修復，
                // 只重讀當月而非全量讀取所有病歷）；仍對不上才轉全量模式
                const [reYear, reMonth] = key.split('-').map(v => parseInt(v, 10));
                const reMonthKey = key.slice(0, 7);
                delete state.monthDateIndexCache[reMonthKey];
                state.monthDateIndexPartial[reMonthKey] = true;
                const rebuilt = await this.ensureMonthDateIndex(pid, reYear, reMonth - 1);
                if (rebuilt && state.mode === 'full') {
                    // 自愈過程中已確定必須全量（日期欄不一致），dateIndexMap 已重建，直接取用
                    return {
                        success: true,
                        indices: Array.isArray(state.dateIndexMap[key]) ? state.dateIndexMap[key].slice() : []
                    };
                }
                if (rebuilt) {
                    const freshIndices = this.getMonthDateIndexMap(pid, reYear, reMonth - 1)[key];
                    const freshMatch = Array.isArray(freshIndices) && freshIndices.length > 0 &&
                        freshIndices.every((idx) => !!state.recordsByIndex[idx]) &&
                        freshIndices
                            .map((idx) => this.getRecordDateKey(state.recordsByIndex[idx]))
                            .every((slotKey) => slotKey === key);
                    if (freshMatch) {
                        return { success: true, indices: freshIndices.slice().sort((a, b) => a - b) };
                    }
                }
                console.warn('日曆日期與已載入病歷不一致，改用全量讀取模式');
                return await fallbackToFull();
            }
            existingIndices.sort((a, b) => a - b);
            return { success: true, indices: existingIndices };
        }
        try {
            await waitForFirebaseDb();
            const [year, month, day] = key.split('-').map(v => parseInt(v, 10));
            const dayStart = new Date(year, month - 1, day);
            const nextDayStart = new Date(year, month - 1, day + 1);
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const countQuery = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('patientId', '==', pid),
                window.firebase.where('sortDate', '<', dayStart)
            );
            const countSnap = await window.firebase.getCountFromServer(countQuery);
            let ascOffset = Number(countSnap && countSnap.data && countSnap.data().count) || 0;
            const dayQuery = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('patientId', '==', pid),
                window.firebase.where('sortDate', '>=', dayStart),
                window.firebase.where('sortDate', '<', nextDayStart),
                window.firebase.orderBy('sortDate', 'asc')
            );
            const daySnap = await window.firebase.getDocs(dayQuery);
            const loadedIndices = [];
            let dateCoherent = true;
            daySnap.forEach((docSnap) => {
                const rec = { id: docSnap.id, ...docSnap.data() };
                const idx = ascOffset;
                // sortDate 落在該日但病歷日期不是該日（兩欄不一致），或索引超出總數（聚合飄移），
                // 分頁索引基準都已不可信，交給全量模式處理
                if (this.getRecordDateKey(rec) !== key || idx < 0 || idx >= state.totalCount) {
                    dateCoherent = false;
                }
                if (idx >= 0 && idx < state.totalCount) {
                    state.recordsByIndex[idx] = rec;
                    loadedIndices.push(idx);
                }
                ascOffset += 1;
            });
            if (!dateCoherent || ascOffset > state.totalCount) {
                console.warn('按日期查到的病歷與日曆日期不一致，改用全量讀取模式');
                return await fallbackToFull();
            }
            loadedIndices.sort((a, b) => a - b);
            const monthKey = key.slice(0, 7);
            if (!state.monthDateIndexCache[monthKey]) {
                state.monthDateIndexCache[monthKey] = {};
            }
            state.monthDateIndexCache[monthKey][key] = loadedIndices.slice();
            // 單日補讀只代表該月的部分索引，標記後下次開日曆會重建完整月索引
            state.monthDateIndexPartial[monthKey] = true;
            if (state.dateIndexReady || state.mode === 'full') {
                state.dateIndexMap[key] = loadedIndices.slice();
            }
            return { success: true, indices: loadedIndices };
        } catch (error) {
            console.warn('按日期載入病歷失敗，改用全量讀取模式:', error);
            return await fallbackToFull();
        }
    },
    async loadAdjacentRecord(patientId, currentIndex, direction) {
        const pid = String(patientId || '');
        const fromIndex = Number(currentIndex);
        const step = Number(direction);
        if (!pid || !Number.isFinite(fromIndex) || ![ -1, 1 ].includes(step)) {
            return false;
        }
        const stateResult = await this.ensurePatientState(pid, false);
        if (!stateResult.success || !stateResult.state) {
            return false;
        }
        const state = stateResult.state;
        const targetIndex = fromIndex + step;
        if (targetIndex < 0 || targetIndex >= state.totalCount) {
            return false;
        }
        if (state.recordsByIndex[targetIndex]) {
            return true;
        }
        if (!state.recordsByIndex[fromIndex]) {
            const currentLoaded = await this.ensureLoadedAtIndex(pid, fromIndex);
            if (!currentLoaded) return false;
        }
        const currentRecord = state.recordsByIndex[fromIndex];
        const currentDate = getConsultationEffectiveDate(currentRecord);
        if (!currentDate || isNaN(currentDate.getTime())) {
            return false;
        }
        try {
            await waitForFirebaseDb();
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const queryParts = [
                window.firebase.where('patientId', '==', pid)
            ];
            if (step < 0) {
                queryParts.push(window.firebase.where('sortDate', '<', currentDate));
                queryParts.push(window.firebase.orderBy('sortDate', 'desc'));
            } else {
                queryParts.push(window.firebase.where('sortDate', '>', currentDate));
                queryParts.push(window.firebase.orderBy('sortDate', 'asc'));
            }
            queryParts.push(window.firebase.limit(1));
            const q = window.firebase.firestoreQuery(colRef, ...queryParts);
            const snap = await window.firebase.getDocs(q);
            if (!snap || !snap.docs || snap.docs.length === 0) {
                return false;
            }
            const docSnap = snap.docs[0];
            state.recordsByIndex[targetIndex] = { id: docSnap.id, ...docSnap.data() };
            return true;
        } catch (error) {
            console.warn('讀取相鄰病歷失敗，改用既有補讀模式:', error);
            return false;
        }
    },
    setContextData(contextKey, patientId, list) {
        const ctx = this.contexts[contextKey];
        if (!ctx) return;
        const sorted = this.normalizeAndSortConsultations(list);
        ctx.setPatientId(patientId);
        ctx.setConsultations(sorted);
        ctx.setCurrentPage(Math.max(0, sorted.length - 1));
    },
    async loadForContext(contextKey, patientId) {
        const ctx = this.contexts[contextKey];
        if (!ctx) return { success: false, data: [] };
        const stateResult = await this.ensurePatientState(patientId, false);
        if (!stateResult.success || !stateResult.state) {
            return { success: false, data: [] };
        }
        const state = stateResult.state;
        ctx.setPatientId(String(patientId || ''));
        if (state.totalCount <= 0) {
            ctx.setConsultations(state.recordsByIndex);
            ctx.setCurrentPage(0);
            return { success: true, data: ctx.getConsultations(), totalCount: 0 };
        }
        const latestPage = state.totalCount - 1;
        const loaded = await this.ensureLoadedAtIndex(patientId, latestPage);
        if (!loaded) {
            return { success: false, data: [] };
        }
        const latestState = this.getCachedPatientState(patientId);
        if (!latestState || !Array.isArray(latestState.recordsByIndex) || !latestState.recordsByIndex[latestPage]) {
            console.warn('loadForContext: loaded data validation failed');
            return { success: false, data: [] };
        }
        ctx.setConsultations(latestState.recordsByIndex);
        ctx.setCurrentPage(latestPage);
        return { success: true, data: ctx.getConsultations(), totalCount: latestState.totalCount };
    },
    applyListenerList(patientId, list) {
        const pid = String(patientId || '');
        const sorted = this.normalizeAndSortConsultations(list || []);
        const state = this.getCachedPatientState(pid);
        if (state) {
            state.mode = 'full';
            state.allLoaded = true;
            state.totalCount = sorted.length;
            state.recordsByIndex = sorted.slice();
            state.descPageCache = {};
            state.descPageCursors = {};
            state.ascPageCache = {};
            state.ascPageCursors = {};
            state.monthDateIndexCache = {};
            state.monthDateIndexPartial = {};
            state.monthOffsetCache = {};
            this.rebuildDateIndexFromState(state);
        }
        const contexts = ['patient', 'consultation'];
        contexts.forEach((key) => {
            const ctx = this.contexts[key];
            if (!ctx) return;
            if (String(ctx.getPatientId() || '') !== pid) return;
            ctx.setConsultations(state ? state.recordsByIndex : sorted.slice());
            ctx.setCurrentPage(Math.max(0, sorted.length - 1));
        });
    },
    async changePage(contextKey, direction) {
        const ctx = this.contexts[contextKey];
        if (!ctx) return false;
        const list = ctx.getConsultations();
        const oldPage = Number(ctx.getCurrentPage()) || 0;
        const newPage = oldPage + direction;
        if (newPage < 0 || newPage >= list.length) return false;
        const patientId = ctx.getPatientId();
        if (!patientId) return false;
        let loaded = await this.loadAdjacentRecord(patientId, oldPage, direction);
        if (!loaded) {
            loaded = await this.ensureLoadedAtIndex(patientId, newPage);
        }
        if (!loaded) return false;
        const latestState = this.getCachedPatientState(patientId);
        if (!latestState || !Array.isArray(latestState.recordsByIndex) || !latestState.recordsByIndex[newPage]) {
            console.warn('changePage: loaded data validation failed for index', newPage);
            return false;
        }
        ctx.setConsultations(latestState.recordsByIndex);
        ctx.setCurrentPage(newPage);
        return true;
    },
    close(contextKey) {
        const ctx = this.contexts[contextKey];
        if (!ctx) return;
        const pid = ctx.getPatientId();
        try { detachPatientConsultationsListener(pid); } catch (_e) {}
        ctx.setPatientId(null);
    },
    /** 清除指定病人的 pager 快取（由 patientsMeta/consultation 遠端事件觸發） */
    clearPatientCache(patientId) {
        const pid = String(patientId || '');
        if (!pid) return;
        // 清 pager 狀態快取
        delete this.patientPagedCache[pid];
        // 也清全域 G.currentPatientConsultations / G.currentConsultationConsultations
        // 兩者都可能正顯示該病人
        try { if (G.currentPatientHistoryPatientId === pid) G.currentPatientConsultations = []; } catch (_e) {}
        try { if (G.currentConsultationHistoryPatientId === pid) G.currentConsultationConsultations = []; } catch (_e) {}
    }
};




let patientPagesCache = {};
let patientPageCursors = {};
let patientAscPagesCache = {};
let patientAscPageCursors = {};


let patientsCountCache = null;


let herbLibraryLoaded = false;

let acupointLibraryLoaded = false;
let billingItemsLoaded = false;
let templateLibraryLoaded = false;


let consultationCache = null;
let userCache = null;







let pendingPackageChanges = [];




let pendingPackagePurchases = [];




async function commitPendingPackageChanges() {
    try {
        
        const aggregated = {};
        for (const change of pendingPackageChanges) {
            if (!change || !change.patientId || !change.packageRecordId || typeof change.delta !== 'number') continue;
            const key = String(change.patientId) + '||' + String(change.packageRecordId);
            if (!aggregated[key]) {
                aggregated[key] = { patientId: change.patientId, packageRecordId: change.packageRecordId, delta: 0 };
            }
            aggregated[key].delta += change.delta;
        }
        
        for (const key in aggregated) {
            const { patientId, packageRecordId, delta } = aggregated[key];
            
            if (!delta) continue;
            try {
                
                
                
                let packages = await getPatientPackages(patientId, true);
                
                const pkg = packages.find(p => String(p.id) === String(packageRecordId));
                if (!pkg) continue;
                let newRemaining = (pkg.remainingUses || 0) + delta;
                
                if (typeof pkg.totalUses === 'number') {
                    newRemaining = Math.max(0, Math.min(pkg.totalUses, newRemaining));
                } else {
                    newRemaining = Math.max(0, newRemaining);
                }
                
                const updatedPackage = { ...pkg, remainingUses: newRemaining };
                
                await window.firebaseDataManager.updatePatientPackage(packageRecordId, updatedPackage);
                await recordPatientPackageHistory(buildPatientPackageHistoryRecord({
                    patientId,
                    packageId: packageRecordId,
                    packageName: pkg.name,
                    source: delta < 0 ? 'consultationBillingUse' : 'consultationBillingReturn',
                    type: delta < 0 ? 'consume' : 'restoreUse',
                    fromRemainingUses: Number(pkg.remainingUses) || 0,
                    toRemainingUses: newRemaining,
                    changeCount: Math.abs(delta)
                }));
                
                if (patientPackagesCache && Array.isArray(patientPackagesCache[patientId])) {
                    patientPackagesCache[patientId] = patientPackagesCache[patientId].map(p => {
                        if (String(p.id) === String(packageRecordId)) {
                            return { ...p, ...updatedPackage };
                        }
                        return p;
                    });
                }
            } catch (err) {
                console.error('套用暫存套票變更時發生錯誤:', err);
            }
        }
    } catch (error) {
        console.error('提交暫存套票變更錯誤:', error);
    }
}


async function commitPendingPackagePurchases() {
    try {
        if (!pendingPackagePurchases || pendingPackagePurchases.length === 0) {
            return;
        }
        for (const purchase of pendingPackagePurchases) {
            if (!purchase || !purchase.patientId || !purchase.item) continue;
            const { patientId, item, confirmUse, usageItemId } = purchase;
            
            const purchasedPackage = await purchasePackage(patientId, {
                ...item,
                historySource: 'consultationBillingPurchase'
            });
            if (purchasedPackage) {
                
                if (confirmUse) {
                    try {
                        const useResult = await consumePackage(patientId, purchasedPackage.id, {
                            historySource: 'consultationBillingUse'
                        });
                        if (useResult && useResult.ok) {
                            
                            if (usageItemId) {
                                const idx = selectedBillingItems.findIndex(it => it && it.id === usageItemId);
                                if (idx >= 0) {
                                    
                                    const newId = `use-${purchasedPackage.id}-${Date.now()}-${Math.random()}`;
                                    selectedBillingItems[idx] = {
                                        ...selectedBillingItems[idx],
                                        id: newId,
                                        patientId: (patientId !== undefined && patientId !== null) ? String(patientId) : '',
                                        packageRecordId: (purchasedPackage && purchasedPackage.id) ? String(purchasedPackage.id) : ''
                                    };
                                } else {
                                    
                                    selectedBillingItems.push({
                                        id: `use-${purchasedPackage.id}-${Date.now()}-${Math.random()}`,
                                        name: `${item.name} (使用套票)`,
                                        category: 'packageUse',
                                        price: 0,
                                        unit: '次',
                                        description: '套票抵扣一次',
                                        quantity: 1,
                                        includedInDiscount: false,
                                        patientId: (patientId !== undefined && patientId !== null) ? String(patientId) : '',
                                        packageRecordId: (purchasedPackage && purchasedPackage.id) ? String(purchasedPackage.id) : ''
                                    });
                                }
                            } else {
                                
                                selectedBillingItems.push({
                                    id: `use-${purchasedPackage.id}-${Date.now()}-${Math.random()}`,
                                    name: `${item.name} (使用套票)`,
                                    category: 'packageUse',
                                    price: 0,
                                    unit: '次',
                                    description: '套票抵扣一次',
                                    quantity: 1,
                                    includedInDiscount: false,
                                    patientId: (patientId !== undefined && patientId !== null) ? String(patientId) : '',
                                    packageRecordId: (purchasedPackage && purchasedPackage.id) ? String(purchasedPackage.id) : ''
                                });
                            }
                            {
                                
                                const lang = localStorage.getItem('lang') || 'zh';
                                const zhMsg = `已使用套票：${item.name}，剩餘 ${useResult.record.remainingUses} 次`;
                                const enMsg = `Used package: ${item.name}, remaining ${useResult.record.remainingUses} uses`;
                                const msg = lang === 'en' ? enMsg : zhMsg;
                                showToast(msg, 'info');
                            }
                        } else {
                            {
                                const lang = localStorage.getItem('lang') || 'zh';
                                const zhMsg = `使用套票失敗：${useResult && useResult.msg ? useResult.msg : '不明錯誤'}`;
                                const enMsg = `Failed to use package: ${useResult && useResult.msg ? useResult.msg : 'Unknown error'}`;
                                const msg = lang === 'en' ? enMsg : zhMsg;
                                showToast(msg, 'error');
                            }
                        }
                    } catch (err) {
                        console.error('使用套票時發生錯誤:', err);
                        {
                            const lang = localStorage.getItem('lang') || 'zh';
                            const zhMsg = '使用套票時發生錯誤';
                            const enMsg = 'An error occurred while using the package';
                            const msg = lang === 'en' ? enMsg : zhMsg;
                            showToast(msg, 'error');
                        }
                    }
                }
            } else {
                {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const zhMsg = `套票「${item.name}」購買失敗`;
                    const enMsg = `Failed to purchase package "${item.name}"`;
                    const msg = lang === 'en' ? enMsg : zhMsg;
                    showToast(msg, 'error');
                }
            }
        }
        
        if (typeof updateBillingDisplay === 'function') {
            updateBillingDisplay();
        }
        
        pendingPackagePurchases = [];
    } catch (err) {
        console.error('提交暫存套票購買時發生錯誤:', err);
    }
}


function revertPendingPackagePurchases() {
    try {
        
        if (Array.isArray(selectedBillingItems) && selectedBillingItems.length > 0) {
            selectedBillingItems = selectedBillingItems.filter(item => {
                return !(item && typeof item.id === 'string' && item.id.startsWith('pending-use-'));
            });
            
            if (typeof updateBillingDisplay === 'function') {
                updateBillingDisplay();
            }
        }
    } catch (err) {
        console.error('復原暫存套票購買時發生錯誤:', err);
    }
    
    pendingPackagePurchases = [];
}


async function revertPendingPackageChanges() {
    
    
    try {
        
        if (typeof revertPendingPackagePurchases === 'function') {
            revertPendingPackagePurchases();
        }
        
        pendingPackageChanges = [];
        
        pendingPackagePurchases = [];
        if (typeof refreshPatientPackagesUI === 'function') {
            await refreshPatientPackagesUI();
        }
    } catch (e) {
        console.error('重置暫存套票變更錯誤:', e);
    }
}


async function fetchDataWithCache(cache, fetchFunc, forceRefresh = false) {
    try {
        
        if (forceRefresh || !cache) {
            const result = await fetchFunc();
            if (result && result.success) {
                cache = result.data;
            } else {
                
                
                if (!cache) {
                    cache = null;
                }
            }
        }
        
        return cache || [];
    } catch (error) {
        console.error('資料載入失敗:', error);
        return [];
    }
}


/* Phase 4 ESM: patient paged cache fetch (fetchPatients family, 7 fns) moved to js/domains/patients/store.js; window facades in js/app.js; original block removed */


async function fetchConsultations(forceRefresh = false) {
    consultationCache = await fetchDataWithCache(
        consultationCache,
        () => window.firebaseDataManager.getConsultations(),
        forceRefresh
    );
    return consultationCache;
}



async function fetchUsers(forceRefresh = false) {
    
    userCache = await fetchDataWithCache(
        userCache,
        () => window.firebaseDataManager.getUsers(forceRefresh),
        forceRefresh
    );
    return userCache;
}
        
        let clinicSettings = {};
        // 確保跨 script（systemmanagement.js 等）可見，且重新賦值時保持同步
        Object.defineProperty(window, 'clinicSettings', {
            get: () => clinicSettings,
            set: (v) => { clinicSettings = v; },
            configurable: true
        });
        let currentClinicId = localStorage.getItem('currentClinicId') || null;
        let clinicsList = [];
        function prePopulateClinicsFromCache() {
            try {
                const stored = localStorage.getItem('clinics');
                if (stored) {
                    const local = JSON.parse(stored);
                    if (Array.isArray(local) && local.length) {
                        clinicsList = local;
                        if (!currentClinicId) {
                            currentClinicId = local[0].id;
                            localStorage.setItem('currentClinicId', currentClinicId);
                        }
                        const found = local.find(c => String(c.id) === String(currentClinicId));
                        clinicSettings = found || {};
                        populateClinicSelectors();
                        updateClinicSettingsDisplay();
                        updateCurrentClinicDisplay();
                    }
                }
            } catch (_e) {}
        }
        async function initClinics() {
            prePopulateClinicsFromCache();
            await waitForFirebase();
            let userLoggedIn = !!(window.firebase && window.firebase.auth && window.firebase.auth.currentUser);
            let res = null;
            try {
                res = await window.firebaseDataManager.getClinics();
            } catch (_eGet) {
                res = { success: false, data: [] };
            }
            clinicsList = res && res.success && Array.isArray(res.data) ? res.data : [];
            if (!clinicsList.length) {
                if (userLoggedIn) {
                    try {
                        const created = await window.firebaseDataManager.addClinic({
                            chineseName: '名醫診所系統',
                            englishName: 'Dr.Great Clinic',
                            businessHours: '週一至週五 09:00-18:00',
                            phone: '(852) 2345-6789',
                            address: '香港中環皇后大道中123號',
                            createdAt: new Date()
                        });
                        if (created && created.success && created.id) {
                            const single = await window.firebaseDataManager.getClinicById(created.id);
                            clinicsList = single && single.success && single.data ? [{ id: created.id, ...single.data }] : [];
                            currentClinicId = created.id;
                            localStorage.setItem('currentClinicId', currentClinicId);
                        }
                    } catch (_eAdd) {
                        
                        clinicsList = [{
                            id: 'local-default',
                            chineseName: '名醫診所系統',
                            englishName: 'Dr.Great Clinic',
                            businessHours: '週一至週五 09:00-18:00',
                            phone: '(852) 2345-6789',
                            address: '香港中環皇后大道中123號'
                        }];
                        currentClinicId = 'local-default';
                        localStorage.setItem('currentClinicId', currentClinicId);
                    }
                } else {
                    
                    clinicsList = [{
                        id: 'local-default',
                        chineseName: '名醫診所系統',
                        englishName: 'Dr.Great Clinic',
                        businessHours: '週一至週五 09:00-18:00',
                        phone: '(852) 2345-6789',
                        address: '香港中環皇后大道中123號'
                    }];
                    currentClinicId = currentClinicId || 'local-default';
                    localStorage.setItem('currentClinicId', currentClinicId);
                }
            }
            if (((!currentClinicId) || currentClinicId === 'local-default') && clinicsList.length) {
                const firstRealClinic = clinicsList.find(c => c && c.id && c.id !== 'local-default') || clinicsList[0];
                currentClinicId = firstRealClinic.id;
                localStorage.setItem('currentClinicId', currentClinicId);
            }
            if (currentClinicId && currentClinicId !== 'local-default') {
                try {
                    const cur = await window.firebaseDataManager.getClinicById(currentClinicId);
                    clinicSettings = cur && cur.success && cur.data ? cur.data : {};
                } catch (_eCur) {
                    clinicSettings = clinicsList.find(c => c.id === currentClinicId) || {};
                }
            } else {
                clinicSettings = clinicsList.find(c => c.id === currentClinicId) || {};
            }
            updateClinicSettingsDisplay();
            populateClinicSelectors();
            updateCurrentClinicDisplay();
            try { localStorage.setItem('clinics', JSON.stringify(clinicsList)); } catch (_e) {}
        }
        function populateClinicSelectors() {
            try {
                const loginSel = document.getElementById('loginClinicSelector');
                if (loginSel) {
                    loginSel.innerHTML = clinicsList.map(c => `<option value="${window.escapeHtml(c.id)}">${window.escapeHtml(getClinicDisplayName(c))}</option>`).join('');
                    if (currentClinicId) loginSel.value = currentClinicId;
                    loginSel.addEventListener('change', function() {
                        setCurrentClinicId(this.value);
                    });
                }
            } catch (_e) {}
            try {
                let currentSel = document.getElementById('currentClinicSelector');
                if (currentSel) {
                    
                    const parent = currentSel.parentNode;
                    const cloned = currentSel.cloneNode(false);
                    if (parent && cloned) {
                        parent.replaceChild(cloned, currentSel);
                        currentSel = cloned;
                    }
                    currentSel.innerHTML = clinicsList.map(c => `<option value="${window.escapeHtml(c.id)}">${window.escapeHtml(getClinicDisplayName(c))}</option>`).join('');
                    if (currentClinicId) currentSel.value = currentClinicId;
                    
                }
            } catch (_e2) {}
            try {
                let systemSel = document.getElementById('systemManagementClinicSelector');
                if (systemSel) {
                    const parent = systemSel.parentNode;
                    const cloned = systemSel.cloneNode(false);
                    if (parent && cloned) {
                        parent.replaceChild(cloned, systemSel);
                        systemSel = cloned;
                    }
                    systemSel.innerHTML = clinicsList.map(c => `<option value="${window.escapeHtml(c.id)}">${window.escapeHtml(getClinicDisplayName(c))}</option>`).join('');
                    if (currentClinicId) systemSel.value = currentClinicId;
                    systemSel.addEventListener('change', async function() {
                        if (this.value && String(this.value) !== String(currentClinicId || '')) {
                            await setCurrentClinicId(this.value);
                        }
                    });
                }
            } catch (_e3) {}
            try {
                const addBtn = document.getElementById('systemAddClinicButton');
                if (addBtn && !addBtn.dataset.bound) {
                    addBtn.addEventListener('click', function() {
                        if (typeof window.isSimpleVersion === 'function' && window.isSimpleVersion()) {
                            showToast('簡單版僅可使用一間診所，無法新增診所', 'error');
                            return;
                        }
                        if (typeof window.isAdvancedVersion === 'function' && !window.isAdvancedVersion()) {
                            showToast('「新增診所」為進階版系統專屬功能', 'error');
                            return;
                        }
                        showAddClinicModal();
                    });
                    addBtn.dataset.bound = 'true';
                }
            } catch (_e4) {}
            try {
                const delBtn = document.getElementById('systemDeleteClinicButton');
                if (delBtn && !delBtn.dataset.bound) {
                    delBtn.addEventListener('click', async function() {
                        if (typeof window.isSimpleVersion === 'function' && window.isSimpleVersion()) {
                            showToast('簡單版僅可使用一間診所，無法刪除診所', 'error');
                            return;
                        }
                        if (typeof window.isAdvancedVersion === 'function' && !window.isAdvancedVersion()) {
                            showToast('「刪除目前診所」為進階版系統專屬功能', 'error');
                            return;
                        }
                        if (!currentClinicId || currentClinicId === 'local-default') {
                            showToast('未選擇診所或此診所不可刪除', 'error');
                            return;
                        }
                        if (!Array.isArray(clinicsList) || clinicsList.length <= 1) {
                            showToast('至少保留一間診所，無法刪除', 'error');
                            return;
                        }
                        const lang = localStorage.getItem('lang') || 'zh';
                        const currentClinic = Array.isArray(clinicsList)
                            ? clinicsList.find(c => c && String(c.id) === String(currentClinicId))
                            : null;
                        const clinicDisplayName = currentClinic
                            ? getClinicDisplayName(currentClinic)
                            : '目前診所';

                        const firstConfirmMessage = lang === 'en'
                            ? `Are you sure you want to delete clinic "${clinicDisplayName}"?\n\nThis action cannot be undone.`
                            : `確定要刪除診所「${clinicDisplayName}」嗎？\n\n此操作無法復原。`;
                        const firstConfirmed = await showConfirmation(firstConfirmMessage, 'warning');
                        if (!firstConfirmed) return;

                        const secondConfirmMessage = lang === 'en'
                            ? `Final warning: permanently delete clinic "${clinicDisplayName}"?\n\nThis action cannot be undone.\nAll clinic settings and related clinic data will be removed.`
                            : `最後警告：真的要永久刪除診所「${clinicDisplayName}」嗎？\n\n此操作不可復原。\n該診所設定及相關診所資料將被移除。`;
                        const secondConfirmed = await showConfirmation(secondConfirmMessage, 'warning');
                        if (!secondConfirmed) return;
                        try {
                            const res = await window.firebaseDataManager.deleteClinic(currentClinicId);
                            if (res && res.success) {
                                const listRes = await window.firebaseDataManager.getClinics();
                                clinicsList = listRes && listRes.success && Array.isArray(listRes.data) ? listRes.data : [];
                                const nextId = clinicsList.length ? clinicsList[0].id : null;
                                if (nextId) {
                                    await setCurrentClinicId(nextId);
                                } else {
                                    currentClinicId = 'local-default';
                                    clinicSettings = {
                                        chineseName: '名醫診所系統',
                                        englishName: 'Dr.Great Clinic',
                                        businessHours: '週一至週五 09:00-18:00',
                                        phone: '(852) 2345-6789',
                                        address: '香港中環皇后大道中123號'
                                    };
                                    populateClinicSelectors();
                                    updateClinicSettingsDisplay();
                                    updateCurrentClinicDisplay();
                                }
                                showToast('診所已刪除', 'success');
                            } else {
                                showToast('刪除診所失敗', 'error');
                            }
                        } catch (err) {
                            console.error('刪除診所錯誤:', err);
                            showToast('刪除診所失敗', 'error');
                        }
                    });
                    delBtn.dataset.bound = 'true';
                }
            } catch (_e5) {}
            // 依版本設定更新新增／刪除診所按鈕狀態
            try { applyClinicVersionRestrictions(); } catch (_e6) {}
        }
        // 依據系統版本（簡單版／普通版／進階版，設定見 version-config.js）處理診所按鈕：
        // 簡單版：實際隱藏「新增診所」「刪除目前診所」按鈕，只能使用一間診所；
        // 普通版：按鈕反白，並標示為進階版專屬功能；
        // 進階版：按鈕正常可用。
        function applyClinicVersionRestrictions() {
            const advanced = (typeof window.isAdvancedVersion === 'function') ? window.isAdvancedVersion() : true;
            const simple = (typeof window.isSimpleVersion === 'function') ? window.isSimpleVersion() : false;
            const maxClinics = (typeof window.getMaxClinics === 'function') ? window.getMaxClinics() : 3;
            const lockTip = '此功能僅限「進階版」系統提供';
            const buttonStyles = [
                { id: 'systemAddClinicButton', colorClass: 'bg-green-600', hoverClass: 'hover:bg-green-700' },
                { id: 'systemDeleteClinicButton', colorClass: 'bg-red-600', hoverClass: 'hover:bg-red-700' }
            ];
            buttonStyles.forEach(function(item) {
                const btn = document.getElementById(item.id);
                if (!btn) return;
                if (simple) {
                    // 簡單版：實際隱藏按鈕（不顯示、不可點）
                    btn.classList.add('hidden');
                    return;
                }
                btn.classList.remove('hidden');
                if (advanced) {
                    btn.classList.remove('bg-gray-400', 'opacity-60', 'cursor-not-allowed');
                    btn.classList.add(item.colorClass, item.hoverClass);
                    btn.removeAttribute('title');
                    btn.setAttribute('aria-disabled', 'false');
                } else {
                    btn.classList.remove(item.colorClass, item.hoverClass);
                    btn.classList.add('bg-gray-400', 'opacity-60', 'cursor-not-allowed');
                    btn.setAttribute('title', lockTip);
                    btn.setAttribute('aria-disabled', 'true');
                }
            });
            // 普通版時於按鈕下方顯示進階版專屬標示；簡單版／進階版時移除標示
            let note = document.getElementById('clinicVersionRestrictionNote');
            const addBtn = document.getElementById('systemAddClinicButton');
            const buttonGroup = addBtn ? addBtn.parentNode : null;
            if (!advanced && !simple) {
                if (buttonGroup) buttonGroup.classList.add('flex-wrap');
                if (!note && buttonGroup) {
                    note = document.createElement('p');
                    note.id = 'clinicVersionRestrictionNote';
                    note.className = 'basis-full w-full text-xs text-amber-700 mt-1 text-right';
                    buttonGroup.appendChild(note);
                }
                if (note) {
                    note.textContent = '「新增診所 / 刪除目前診所」為進階版系統專屬功能（目前為普通版，僅可使用 ' + maxClinics + ' 間診所）';
                }
            } else {
                if (buttonGroup) buttonGroup.classList.remove('flex-wrap');
                if (note) note.parentNode.removeChild(note);
            }
        }
        let _globalLoadingTotal = 0;
        let _globalLoadingCurrent = 0;
        function showGlobalLoading(total = 100, text = '') {
            _globalLoadingTotal = total > 0 ? total : 100;
            _globalLoadingCurrent = 0;
            const overlay = document.getElementById('globalLoadingOverlay');
            const bar = document.getElementById('globalLoadingProgressBar');
            const percent = document.getElementById('globalLoadingPercent');
            const t = document.getElementById('globalLoadingText');
            if (overlay) overlay.classList.remove('hidden');
            if (bar) bar.style.width = '0%';
            if (percent) percent.textContent = '0%';
            if (t && text) t.textContent = text;
        }
        function advanceGlobalLoading(step = 1) {
            _globalLoadingCurrent += step;
            const p = Math.max(0, Math.min(100, Math.round((_globalLoadingCurrent / _globalLoadingTotal) * 100)));
            const bar = document.getElementById('globalLoadingProgressBar');
            const percent = document.getElementById('globalLoadingPercent');
            if (bar) bar.style.width = p + '%';
            if (percent) percent.textContent = p + '%';
        }
        function hideGlobalLoading() {
            const overlay = document.getElementById('globalLoadingOverlay');
            if (overlay) overlay.classList.add('hidden');
            _globalLoadingTotal = 0;
            _globalLoadingCurrent = 0;
        }
        async function setCurrentClinicId(id) {
            try {
                try {
                    hideInventoryModal();
                } catch (_eHideInv) {}
                try { currentInventoryItemId = null; } catch (_eResetId) {}
                const consultFormEl = document.getElementById('consultationForm');
                const isConsultFormVisible = consultFormEl && !consultFormEl.classList.contains('hidden');
                const isConsulting = (typeof currentConsultingAppointmentId !== 'undefined' && currentConsultingAppointmentId);
                if (isConsultFormVisible || isConsulting) {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const zhMsg = '目前正在診症或修改病歷，請先完成或關閉後再切換診所';
                    const enMsg = 'You are consulting or editing a medical record. Finish or close before switching clinic.';
                    showToast(lang === 'en' ? enMsg : zhMsg, 'warning');
                    try {
                        const sel = document.getElementById('currentClinicSelector');
                        if (sel && currentClinicId) sel.value = currentClinicId;
                    } catch (_eSel) {}
                    try {
                        const systemSel = document.getElementById('systemManagementClinicSelector');
                        if (systemSel && currentClinicId) systemSel.value = currentClinicId;
                    } catch (_eSystemSel) {}
                    return;
                }
            } catch (_guardErr) {}
            showGlobalLoading(7, (typeof window.t === 'function' ? window.t('切換診所並載入所需資料…') : '切換診所並載入所需資料…'));
            currentClinicId = id;
            localStorage.setItem('currentClinicId', currentClinicId);
            const cur = await window.firebaseDataManager.getClinicById(currentClinicId);
            clinicSettings = cur && cur.success && cur.data ? cur.data : {};
            advanceGlobalLoading();
            try {
                if (Array.isArray(clinicsList)) {
                    clinicsList = clinicsList.map(c => (String(c.id) === String(currentClinicId) ? { ...c, ...clinicSettings } : c));
                }
            } catch (_e) {}
            updateClinicSettingsDisplay();
            advanceGlobalLoading();
            updateCurrentClinicDisplay();
            try { refreshClinicScopedUi(); } catch (_eRefreshUi) {}
            advanceGlobalLoading();
            try { populateClinicSelectors(); } catch (_e2) {}
            advanceGlobalLoading();
            try { localStorage.setItem('clinics', JSON.stringify(clinicsList)); } catch (_e3) {}
            try { loadTodayAppointments(); } catch (_e) {}
            advanceGlobalLoading();
            try { if (typeof window.scheduleReloadForClinic === 'function') window.scheduleReloadForClinic(); } catch (_e4) {}
            try { await initBillingItems(true); } catch (_e5) {}
            advanceGlobalLoading();
            try { await initHerbInventory(true); } catch (_eInv) {}
            try { if (typeof computeGlobalUsageCounts === 'function') await computeGlobalUsageCounts(); } catch (_eUsage) {}
            try { if (typeof displayHerbLibrary === 'function') displayHerbLibrary(); } catch (_eDisp) {}
            try { if (typeof displayBillingItems === 'function') displayBillingItems(); } catch (_e6) {}
            try {
                if (typeof renderDiagnosisSettingsForm === 'function') {
                    renderDiagnosisSettingsForm(true);
                }
            } catch (_eDiagnosisSettings) {}
            advanceGlobalLoading();
            try {
                const modal = document.getElementById('inventoryHistoryModal');
                if (modal && !modal.classList.contains('hidden')) {
                    try { loadInventoryHistory('in'); } catch (_ei) {}
                    try { loadInventoryHistory('out'); } catch (_eo) {}
                }
            } catch (_eInvHist) {}
            hideGlobalLoading();
        }
        function getClinicDisplayName(c) {
            try {
                const lang = (localStorage.getItem('lang') || 'zh').toLowerCase();
                if (lang.startsWith('en')) {
                    return (c && (c.englishName || c.chineseName || c.name || c.id)) || '';
                }
                return (c && (c.chineseName || c.englishName || c.name || c.id)) || '';
            } catch (_e) {
                return (c && (c.chineseName || c.englishName || c.name || c.id)) || '';
            }
        }
        function updateCurrentClinicDisplay() {
            const el = document.getElementById('currentClinicDisplay');
            if (el) {
                let name = '';
                try { name = getClinicDisplayName(clinicSettings); } catch (_eName) {}
                if (!name) {
                    try {
                        if (Array.isArray(clinicsList)) {
                            const c = clinicsList.find(c => String(c.id) === String(currentClinicId));
                            name = getClinicDisplayName(c || {});
                        }
                    } catch (_eList) {}
                }
                if (!name) {
                    el.textContent = (typeof window.t === 'function' ? window.t('當前診所：') : '當前診所：') + (typeof window.t === 'function' ? window.t('載入中…') : '載入中…');
                    try {
                        const cid = currentClinicId;
                        if (cid && window.firebaseDataManager && typeof window.firebaseDataManager.getClinicById === 'function') {
                            window.firebaseDataManager.getClinicById(cid).then(res => {
                                if (res && res.success && res.data) {
                                    clinicSettings = res.data;
                                    let n = '';
                                    try { n = getClinicDisplayName(clinicSettings); } catch (_eN) {}
                                    if (!n && Array.isArray(clinicsList)) {
                                        const cc = clinicsList.find(c => String(c.id) === String(cid));
                                        n = getClinicDisplayName(cc || {});
                                    }
                                    el.textContent = (typeof window.t === 'function' ? window.t('當前診所：') : '當前診所：') + (n || (typeof window.t === 'function' ? window.t('未命名診所') : '未命名診所'));
                                }
                            }).catch(() => {});
                        }
                    } catch (_eAsync) {}
                } else {
                    el.textContent = (typeof window.t === 'function' ? window.t('當前診所：') : '當前診所：') + name;
                }
            }
            try {
                const currentSel = document.getElementById('currentClinicSelector');
                if (currentSel && currentClinicId) currentSel.value = currentClinicId;
            } catch (_e) {}
            try {
                const systemSel = document.getElementById('systemManagementClinicSelector');
                if (systemSel && currentClinicId) systemSel.value = currentClinicId;
            } catch (_eSystemSel) {}
            try {
                const switchBtn = document.getElementById('clinicSwitchButton');
                if (switchBtn) {
                    if (Array.isArray(clinicsList) && clinicsList.length <= 1) {
                        switchBtn.classList.add('hidden');
                    } else {
                        switchBtn.classList.remove('hidden');
                    }
                }
            } catch (_e2) {}
        }
        async function resolveClinicSettingsByConsultation(consultation) {
            let result = {};
            try {
                const cid = consultation && consultation.clinicId;
                const cname = consultation && consultation.clinicName;
                if (cid && cid !== 'local-default') {
                    try {
                        const cur = await window.firebaseDataManager.getClinicById(cid);
                        if (cur && cur.success && cur.data) {
                            result = cur.data;
                        }
                    } catch (_eFetchClinic) {}
                }
                if (!result || Object.keys(result).length === 0) {
                    try {
                        if (Array.isArray(clinicsList)) {
                            const byId = cid ? clinicsList.find(c => String(c.id) === String(cid)) : null;
                            result = byId || result;
                            if ((!result || Object.keys(result).length === 0) && cname) {
                                const byName = clinicsList.find(c => (String(c.chineseName) === String(cname)) || (String(c.englishName) === String(cname)));
                                result = byName || result;
                            }
                        }
                    } catch (_eList) {}
                }
                if (!result || Object.keys(result).length === 0) {
                    result = clinicSettings || {};
                }
            } catch (_err) {
                result = clinicSettings || {};
            }
            return result;
        }
        if (!window.resolveClinicSettingsByConsultation) {
            window.resolveClinicSettingsByConsultation = resolveClinicSettingsByConsultation;
        }
        
        
        // Notiflix.Notify 全站通知層：僅初始化一次，設定與舊 toastr 外觀對齊
        // （右上角、內建圖示、hover 暫停）；Notiflix 缺失時無縫退回 toastr。
        let notiflixNotifyReady = false;
        const NOTIFLIX_TYPE_MAP = { success: 'success', error: 'failure', warning: 'warning', info: 'info' };
        function ensureNotiflixNotify() {
            if (notiflixNotifyReady) return true;
            if (!window.Notiflix || !window.Notiflix.Notify) return false;
            try {
                window.Notiflix.Notify.init({
                    width: '320px',
                    position: 'right-top',
                    distance: '12px',
                    opacity: 0.96,
                    borderRadius: '8px',
                    fontFamily: 'inherit',
                    cssAnimationStyle: 'from-right',
                    useIcon: true,
                    closeButton: false,
                    // 點擊通知本體即關閉（所有類型適用；超時自動消失照舊）
                    clickToClose: true,
                    pauseOnHover: true,
                    // 訊息安全由 showToast 的 htmlToastToPlainText 統一
                    // escape 後再交付（plainText:false 時 Notiflix 僅做一次
                    // innerHTML 解析）；切勿用預設 plainText:true——該模式會
                    // 先 decode 實體再 innerHTML，令含「<」的文字被二次解析。
                    plainText: false,
                    // 預設 110 字會截斷中文提示；舊 toastr 無長度限制
                    messageMaxLength: 10000,
                    // 全域預設逾時；實際每條以 message 長度動態傳入 timeout
                    timeout: 3000,
                    zindex: 4001
                });
                notiflixNotifyReady = true;
                return true;
            } catch (e) {
                console.warn('[Notiflix] Notify.init 失敗，退回 toastr：', e);
                return false;
            }
        }

        // 把 showToast 收到的訊息正規化為「純文字的 HTML 編碼」再送入 Notiflix。
        // 背景：Notiflix 3.2.8 內部以 HTML 解析訊息（實測未 escape 的
        // <img onerror> 會被執行），而 pwa.js 路徑會先 escapeHtml 再把 \n
        // 換成 <br>。故：<br> 還原為真實換行（配合 CSS pre-line 顯示），
        // 其餘內容經 textarea 解碼為純文字後統一重新 escape，既還原實體
        // 顯示（&amp; → &），也保證任何 < > 只作文字呈現，無 XSS 風險。
        function htmlToastToPlainText(value) {
            const withNewlines = String(value == null ? '' : value).replace(/<br\s*\/?\s*>/gi, '\n');
            let plain;
            try {
                const decoder = document.createElement('textarea');
                decoder.innerHTML = withNewlines;
                plain = decoder.value;
            } catch (_e) {
                plain = withNewlines;
            }
            return plain
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function showToast(message, type = 'info') {
            try {
                if (window.t) {
                    message = window.t(message);
                } else {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const dict = window.translations && window.translations[lang] || {};
                    message = dict[message] || message;
                }
            } catch (e) {
                
            }
            
            const timeout = Math.max(3000, (message || '').length * 100);

            // 優先使用 Notiflix（本地託管、無 jQuery 依賴、RWD）
            if (ensureNotiflixNotify()) {
                const kind = NOTIFLIX_TYPE_MAP[type] || 'info';
                try {
                    // Notiflix 3.2.8 內部以 HTML 解析訊息，故送入前統一
                    // 正規化：<br> 還原為換行（pre-line 顯示）、實體解碼後
                    // 重新 escape，純文字內容不變且可免疫未 escape 的標籤。
                    const nxMessage = htmlToastToPlainText(message);
                    window.Notiflix.Notify[kind](nxMessage, { timeout: timeout });
                    return;
                } catch (e) { console.warn('[Notiflix] 通知發送失敗，改用 toastr：', e); }
            }

            toastr.options = {
                closeButton: true,
                progressBar: true,
                positionClass: 'toast-top-right',
                tapToDismiss: true,
                timeOut: timeout,
                extendedTimeOut: timeout + 1000
            };
            
            let method = 'info';
            if (type === 'success') method = 'success';
            else if (type === 'error') method = 'error';
            else if (type === 'warning') method = 'warning';
            else if (type === 'info') method = 'info';
            toastr[method](message);
        }

        
        if (!window.showToast) {
            window.showToast = showToast;
        }

        // ── Firebase 索引自動檢測管理 ──
        // Firestore 在索引缺失時會在錯誤訊息中附上一個已預填所有參數的
        // Firebase Console 建立連結；此模組擷取該連結、去重、顯示一鍵建立 UI。
        const IndexManager = (function () {
            // 已發現的缺失索引：Map<url, { url, hint, collection, fields, createdAt }>
            const missing = new Map();
            let toastShownAt = 0;
            let modalBuilt = false;

            // 從 Firestore 錯誤訊息中擷取 Firebase Console 建立索引連結
            function extractCreationUrl(error) {
                if (!error) return '';
                const msg = String(error.message || error || '');
                const match = msg.match(/https:\/\/console\.firebase\.google\.com\/[^「\s」]+/i);
                if (match) {
                    let url = match[0];
                    // 截斷到網址結束點（錯誤訊息可能在網址後面還有其他字）
                    url = url.split(/[\s「」,，\.)）;；]/)[0];
                    return url;
                }
                return '';
            }

            // 從網址參數中解析 collectionId 和 fields，方便 UI 顯示
            function parseIndexUrl(url) {
                try {
                    const u = new URL(url);
                    const params = u.searchParams;
                    const collectionId = params.get('collectionId') || params.get('collection-group') || '';
                    const fields = [];
                    // Firestore 用 fields=field1:ASCENDING,field2:DESCENDING 格式
                    const rawFields = params.get('fields');
                    if (rawFields) {
                        rawFields.split(',').forEach((f) => {
                            const parts = f.split(':');
                            fields.push({ field: parts[0], order: parts[1] || 'ASCENDING' });
                        });
                    }
                    return { collectionId, fields };
                } catch (_e) {
                    return { collectionId: '', fields: [] };
                }
            }

            // 把查詢出錯登記進列表，顯示提示
            function register(error, hint) {
                const url = extractCreationUrl(error);
                if (!url) return;
                if (missing.has(url)) return; // 已看過

                const parsed = parseIndexUrl(url);
                missing.set(url, {
                    url,
                    hint: hint || '雲端資料庫複合索引缺失',
                    collection: parsed.collectionId,
                    fields: parsed.fields,
                    createdAt: Date.now()
                });

                // 頻率限制：15 秒內最多彈一次 toast，避免連續查詢重複轟炸
                const now = Date.now();
                if (now - toastShownAt > 15000) {
                    toastShownAt = now;
                    showToast(`偵測到 ${missing.size} 個雲端資料庫索引未建立，點擊右下角圖示一鍵建立`, 'warning');
                }
                buildIndicator();
            }

            // 動態建立右下角浮動提示按鈕
            function buildIndicator() {
                let btn = document.getElementById('indexMissingIndicator');
                if (!btn) {
                    btn = document.createElement('button');
                    btn.id = 'indexMissingIndicator';
                    btn.innerHTML = `<i data-lucide="wrench" class="w-6 h-6 pointer-events-none"></i><span class="index-badge">0</span>`;
                    btn.title = '建立缺失的雲端資料庫索引';
                    btn.style.cssText = `
                        position: fixed; bottom: 24px; right: 24px; z-index: 9998;
                        width: 52px; height: 52px; border-radius: 50%;
                        background: #f59e0b; color: white; border: none;
                        box-shadow: 0 4px 14px rgba(245,158,11,0.5);
                        font-size: 22px; cursor: pointer;
                        display: none; align-items: center; justify-content: center;
                        transition: transform 0.2s;
                    `;
                    btn.onmouseenter = () => btn.style.transform = 'scale(1.08)';
                    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
                    btn.onclick = () => openModal();
                    document.body.appendChild(btn);
                }
                const count = missing.size;
                const badge = btn.querySelector('.index-badge');
                if (count > 0) {
                    btn.style.display = 'flex';
                    badge.textContent = count;
                    badge.style.cssText = `
                        position: absolute; top: -4px; right: -4px;
                        background: #ef4444; color: white; border-radius: 12px;
                        min-width: 20px; height: 20px; font-size: 12px;
                        display: flex; align-items: center; justify-content: center;
                        padding: 0 5px; font-weight: bold;
                    `;
                } else {
                    btn.style.display = 'none';
                }
            }

            // 動態建立 Modal（只建一次）
            function buildModal() {
                if (modalBuilt) return;
                modalBuilt = true;
                const overlay = document.createElement('div');
                overlay.id = 'indexManagerOverlay';
                overlay.style.cssText = `
                    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
                    z-index: 9999; display: none; align-items: center; justify-content: center;
                `;
                overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

                const modal = document.createElement('div');
                modal.style.cssText = `
                    background: white; border-radius: 12px; padding: 24px;
                    max-width: 620px; width: 90vw; max-height: 80vh; overflow-y: auto;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.25);
                `;
                modal.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                        <h3 style="margin:0;font-size:18px;font-weight:600;color:#1f2937;"><i data-lucide="wrench" class="w-5 h-5 inline-block align-text-bottom mr-1.5" style="color:#f59e0b;"></i>建立雲端資料庫索引</h3>
                        <button onclick="window.__indexManagerClose()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1;"><i data-lucide="x" class="w-5 h-5 pointer-events-none"></i></button>
                    </div>
                    <div id="indexManagerIntro" style="font-size:14px;color:#6b7280;margin-bottom:16px;line-height:1.6;">
                        以下是系統執行時發現缺失的資料庫索引。點擊「一鍵建立」會在新分頁打開已預填好參數的資料庫管理後台，你只需登入後按一下 <b>Create</b> 即可。
                        <br><br>
                        索引建立需要幾分鐘（視資料量而定），完成後刷新頁面即可。
                    </div>
                    <div id="indexManagerList" style="display:flex;flex-direction:column;gap:12px;"></div>
                `;
                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                window.__indexManagerClose = closeModal;
            }

            function openModal() {
                buildModal();
                renderList();
                const overlay = document.getElementById('indexManagerOverlay');
                overlay.style.display = 'flex';
            }

            function closeModal() {
                const overlay = document.getElementById('indexManagerOverlay');
                if (overlay) overlay.style.display = 'none';
            }

            function renderList() {
                const listEl = document.getElementById('indexManagerList');
                if (!listEl) return;
                if (missing.size === 0) {
                    listEl.innerHTML = `<div style="text-align:center;color:#10b981;padding:20px;font-size:15px;">
                        <i data-lucide="circle-check" class="w-5 h-5 inline-block align-text-bottom mr-1"></i>所有索引都已建立，沒有缺失
                    </div>`;
                    return;
                }
                listEl.innerHTML = Array.from(missing.values()).map((item, i) => {
                    // 集合名/欄位名雖來自 Firestore 錯誤訊息中的 console 網址，
                    // 仍統一跳脫動態文字，避免任何罕見的內容注入
                    const fieldHtml = item.fields.length
                        ? item.fields.map((f) =>
                            `<span style="background:#f3f4f6;padding:2px 8px;border-radius:4px;margin:0 4px;font-family:monospace;font-size:12px;">
                                ${window.escapeHtml(f.field)} <span style="color:#6b7280;font-size:11px;">${window.escapeHtml(f.order)}</span>
                            </span>`
                        ).join('')
                        : '<span style="color:#9ca3af;font-size:12px;">（網址自動帶入參數）</span>';
                    return `
                        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;background:#fafafa;">
                            <div style="font-size:13px;color:#374151;font-weight:500;margin-bottom:6px;">
                                <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px;margin-right:8px;">
                                    ${i + 1}
                                </span>
                                ${window.escapeHtml(item.hint)}
                            </div>
                            <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">
                                集合：<b>${window.escapeHtml(item.collection || '（未知）')}</b>　|　欄位：${fieldHtml}
                            </div>
                            <div style="display:flex;gap:8px;">
                                <a href="${item.url}" target="_blank" rel="noopener"
                                   style="flex:1;background:#2563eb;color:white;padding:8px 14px;border-radius:6px;
                                          text-decoration:none;font-size:13px;text-align:center;font-weight:500;">
                                    <i data-lucide="rocket" class="w-4 h-4 inline-block align-text-bottom mr-1"></i>一鍵建立（開啟資料庫管理後台）
                                </a>
                                <button onclick="window.__indexManagerSkip(${i})"
                                        style="background:#e5e7eb;color:#4b5563;border:none;padding:8px 12px;border-radius:6px;
                                               cursor:pointer;font-size:13px;">
                                    稍後
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
                window.__indexManagerSkip = (idx) => {
                    const items = Array.from(missing.values());
                    let i = 0;
                    for (const [url] of missing) {
                        if (i === idx) { missing.delete(url); break; }
                        i++;
                    }
                    renderList();
                    buildIndicator();
                };
            }

            // 公開 API
            return {
                register,
                openModal,
                closeModal,
                getCount: () => missing.size
            };
        })();

        if (!window.indexManager) {
            window.indexManager = IndexManager;
        }

        
        async function showConfirmation(message, type = 'warning') {
            
            try {
                if (window.t) {
                    message = window.t(message);
                } else {
                    const lang = localStorage.getItem('lang') || 'zh';
                    const dict = window.translations && window.translations[lang] || {};
                    message = dict[message] || message;
                }
            } catch (e) {
                
            }
            const lang = localStorage.getItem('lang') || 'zh';
            const okLabel = lang === 'en' ? 'OK' : '確定';
            const cancelLabel = lang === 'en' ? 'Cancel' : '取消';
            const result = await Swal.fire({
                icon: type || 'warning',
                html: (message || '').replace(/\n/g, '<br/>'),
                showCancelButton: true,
                confirmButtonText: okLabel,
                cancelButtonText: cancelLabel,
                focusConfirm: false
            });
            return !!(result && result.isConfirmed);
        }
        if (!window.showConfirmation) {
            window.showConfirmation = showConfirmation;
        }

        
        
        
function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = 'sine';
        
        oscillator.frequency.setValueAtTime(440, ctx.currentTime);
        
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();
        
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        oscillator.stop(ctx.currentTime + 0.8);
    } catch (err) {
        console.error('播放提醒音效失敗:', err);
    }
}



function showBackupProgressBar(totalSteps) {
    const container = document.getElementById('backupProgressContainer');
    const bar = document.getElementById('backupProgressBar');
    const text = document.getElementById('backupProgressText');
    if (container && bar && text) {
             container.classList.remove('hidden');
             bar.style.width = '0%';
             
             let baseLabel = '匯入進度';
             try {
                 if (window.t) {
                     baseLabel = window.t('匯入進度');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     baseLabel = dict['匯入進度'] || baseLabel;
                 }
             } catch (e) {
                 baseLabel = '匯入進度';
             }
             text.textContent = baseLabel + ' 0%';
             container.dataset.totalSteps = totalSteps;
    }
}


function updateBackupProgressBar(currentStep, totalSteps) {
    const container = document.getElementById('backupProgressContainer');
    const bar = document.getElementById('backupProgressBar');
    const text = document.getElementById('backupProgressText');
    if (container && bar && text) {
        const percent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
             bar.style.width = percent + '%';
             let baseLabel = '匯入進度';
             try {
                 if (window.t) {
                     baseLabel = window.t('匯入進度');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     baseLabel = dict['匯入進度'] || baseLabel;
                 }
             } catch (e) {
                 baseLabel = '匯入進度';
             }
             text.textContent = baseLabel + ' ' + percent + '%';
    }
}


function finishBackupProgressBar(success) {
    const container = document.getElementById('backupProgressContainer');
    const bar = document.getElementById('backupProgressBar');
    const text = document.getElementById('backupProgressText');
    if (container && bar && text) {
             bar.style.width = '100%';
             let successMsg = '匯入完成！';
             let failureMsg = '匯入失敗！';
             try {
                 if (window.t) {
                     successMsg = window.t('匯入完成！');
                     failureMsg = window.t('匯入失敗！');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     successMsg = dict['匯入完成！'] || successMsg;
                     failureMsg = dict['匯入失敗！'] || failureMsg;
                 }
             } catch (e) {
                 
             }
             text.textContent = success ? successMsg : failureMsg;
        
        setTimeout(() => {
            container.classList.add('hidden');
        }, 2000);
    }
}


function showImportProgressBar(totalSteps) {
    const container = document.getElementById('importProgressContainer');
    const bar = document.getElementById('importProgressBar');
    const text = document.getElementById('importProgressText');
    if (container && bar && text) {
             container.classList.remove('hidden');
             bar.style.width = '0%';
             let baseLabel = '匯入進度';
             try {
                 if (window.t) {
                     baseLabel = window.t('匯入進度');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     baseLabel = dict['匯入進度'] || baseLabel;
                 }
             } catch (e) {
                 baseLabel = '匯入進度';
             }
             text.textContent = baseLabel + ' 0%';
             container.dataset.totalSteps = totalSteps;
    }
}


function updateImportProgressBar(currentStep, totalSteps) {
    const container = document.getElementById('importProgressContainer');
    const bar = document.getElementById('importProgressBar');
    const text = document.getElementById('importProgressText');
    if (container && bar && text) {
        const percent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
             bar.style.width = percent + '%';
             let baseLabel = '匯入進度';
             try {
                 if (window.t) {
                     baseLabel = window.t('匯入進度');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     baseLabel = dict['匯入進度'] || baseLabel;
                 }
             } catch (e) {
                 baseLabel = '匯入進度';
             }
             text.textContent = baseLabel + ' ' + percent + '%';
    }
}


function finishImportProgressBar(success) {
    const container = document.getElementById('importProgressContainer');
    const bar = document.getElementById('importProgressBar');
    const text = document.getElementById('importProgressText');
    if (container && bar && text) {
             bar.style.width = '100%';
             let successMsg = '匯入完成！';
             let failureMsg = '匯入失敗！';
             try {
                 if (window.t) {
                     successMsg = window.t('匯入完成！');
                     failureMsg = window.t('匯入失敗！');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     successMsg = dict['匯入完成！'] || successMsg;
                     failureMsg = dict['匯入失敗！'] || failureMsg;
                 }
             } catch (e) {
                 
             }
             text.textContent = success ? successMsg : failureMsg;
        setTimeout(() => {
            container.classList.add('hidden');
        }, 2000);
    }
}


function generateMedicalRecordNumber() {
    try {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        return `MR${datePart}-${randomPart}`;
    } catch (e) {
        
        return `MR${Date.now()}`;
    }
}
        
        
        
        function setButtonLoading(button, loadingText) {
            if (!button) return;
            
            
            if (!button.dataset.originalHtml) {
                button.dataset.originalHtml = button.innerHTML;
            }
            
            if (!button.dataset.originalWidth || !button.dataset.originalHeight) {
                const computedWidth = button.offsetWidth;
                const computedHeight = button.offsetHeight;
                
                if (computedWidth > 0) {
                    button.dataset.originalWidth = computedWidth + 'px';
                    button.style.width = button.dataset.originalWidth;
                }
                
                if (computedHeight > 0) {
                    button.dataset.originalHeight = computedHeight + 'px';
                    button.style.height = button.dataset.originalHeight;
                }
            }
            
            button.disabled = true;
            
            
            
            if (!button.dataset.originalPosition) {
                button.dataset.originalPosition = button.style.position || '';
                button.dataset.originalOverflow = button.style.overflow || '';
            }
            
            button.style.position = 'relative';
            button.style.overflow = 'hidden';
            
            const originalHtml = button.dataset.originalHtml || button.innerHTML;
            button.innerHTML = `
                <span class="invisible pointer-events-none">${originalHtml}</span>
                <span class="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
                    <span class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></span>
                </span>
            `;
        }

        
        function clearButtonLoading(button) {
            if (!button) return;
            
            if (button.dataset.originalHtml) {
                button.innerHTML = button.dataset.originalHtml;
                delete button.dataset.originalHtml;
            }
            
            if (button.dataset.originalWidth) {
                
                button.style.width = '';
                delete button.dataset.originalWidth;
            }
            
            if (button.dataset.originalHeight) {
                
                button.style.height = '';
                delete button.dataset.originalHeight;
            }
            
            if (button.dataset.originalPosition !== undefined) {
                button.style.position = button.dataset.originalPosition;
                delete button.dataset.originalPosition;
            }
            if (button.dataset.originalOverflow !== undefined) {
                button.style.overflow = button.dataset.originalOverflow;
                delete button.dataset.originalOverflow;
            }
            
            button.disabled = false;
        }

        
        function getLoadingButtonFromEvent(fallbackSelector) {
            let btn = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    btn = event.currentTarget;
                }
            } catch (_e) {
                
            }
            if (!btn) {
                try {
                    btn = document.querySelector(fallbackSelector);
                } catch (_e) {
                    btn = null;
                }
            }
            return btn;
        }

        
        function calculateAge(birthDate) {
            const birth = new Date(birthDate);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            
            return age;
        }
        
        
        function formatAge(birthDate) {
            if (!birthDate) return '未知';

            const birth = new Date(birthDate);
            const today = new Date();

            let years = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();

            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                years--;
            }

            
            const translate = typeof window.t === 'function' ? window.t : (s) => s;

            if (years > 0) {
                
                const unit = translate('歲');
                const joiner = unit !== '歲' ? ' ' : '';
                return `${years}${joiner}${unit}`;
            } else {
                
                let months = today.getMonth() - birth.getMonth();
                let days = today.getDate() - birth.getDate();

                if (days < 0) {
                    months--;
                    const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                    days += lastMonth.getDate();
                }

                if (months < 0) {
                    months += 12;
                }

                if (months > 0) {
                    const unit = translate('個月');
                    const joiner = unit !== '個月' ? ' ' : '';
                    return `${months}${joiner}${unit}`;
                } else {
                    const unit = translate('天');
                    const joiner = unit !== '天' ? ' ' : '';
                    return `${days}${joiner}${unit}`;
                }
            }
        }
        
        
        



let herbLibrary = [];


let herbInventory = {};
let herbInventoryInitialized = false;
let herbInventoryListenerAttached = false;


let currentInventoryMode = 'granule';
try {
    const savedMode = (typeof localStorage !== 'undefined') ? localStorage.getItem('inventoryMode') : null;
    if (savedMode === 'slice' || savedMode === 'granule') {
        currentInventoryMode = savedMode;
    }
} catch (_e) {
    
    currentInventoryMode = 'granule';
}

let herbInventoryRefPath = null;











let patientListListenerAttached = false;

let patientListUnsubscribe = null;

/* Phase 4 ESM: patient multi-client sync infra (17 fns) moved to js/domains/patients/store.js; window facades in js/app.js; original block removed */


async function initHerbInventory(forceRefresh = false) {
    const clinicId = (function() {
        try {
            return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
        } catch (_e) {
            return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
        }
    })();
    const basePath = (currentInventoryMode === 'slice') ? 'herbInventorySlice' : 'herbInventory';
    const clinicPath = 'clinics/' + String(clinicId) + '/' + basePath;
    if (herbInventoryInitialized && herbInventoryListenerAttached && !forceRefresh && herbInventoryRefPath === clinicPath) {
        return;
    }
    await waitForFirebaseDb();
    const inventoryRef = window.firebase.ref(window.firebase.rtdb, clinicPath);
    if ((forceRefresh || herbInventoryRefPath !== clinicPath) && herbInventoryListenerAttached && typeof window.herbInventoryRef !== 'undefined' && window.herbInventoryRef) {
        try {
            window.firebase.off(window.herbInventoryRef, 'value');
            herbInventoryListenerAttached = false;
        } catch (err) {
            console.error('重置中藥庫存監聽時發生錯誤:', err);
        }
    }
    try {
        window.herbInventoryRef = inventoryRef;
    } catch (_e) {
    }
    herbInventoryRefPath = clinicPath;
    try {
        const snapshot = await window.firebase.get(inventoryRef);
        if (snapshot && snapshot.exists()) {
            herbInventory = snapshot.val() || {};
        } else {
            const globalRef = window.firebase.ref(window.firebase.rtdb, basePath);
            const globalSnap = await window.firebase.get(globalRef);
            herbInventory = globalSnap && globalSnap.exists() ? globalSnap.val() || {} : {};
        }
        herbInventoryInitialized = true;
        try {
            if (currentInventoryMode === 'slice') {
                herbInventorySlice = herbInventory;
                herbInventorySliceInitialized = true;
            } else {
                herbInventoryGranule = herbInventory;
                herbInventoryGranuleInitialized = true;
            }
        } catch (_e) {}
    } catch (error) {
        console.error('讀取中藥庫存資料失敗:', error);
        herbInventory = {};
        herbInventoryInitialized = true;
    }
    if (!herbInventoryListenerAttached) {
        window.firebase.onValue(inventoryRef, (snap) => {
            herbInventory = snap && snap.exists() ? snap.val() || {} : {};
            try {
                if (currentInventoryMode === 'slice') {
                    herbInventorySlice = herbInventory;
                    herbInventorySliceInitialized = true;
                } else {
                    herbInventoryGranule = herbInventory;
                    herbInventoryGranuleInitialized = true;
                }
            } catch (_e) {}
            
            try {
                if (document.getElementById('herbLibraryList')) {
                    displayHerbLibrary();
                }
                
                if (typeof updatePrescriptionDisplay === 'function') {
                    updatePrescriptionDisplay();
                }
            } catch (_e) {
                
            }
        });
        herbInventoryListenerAttached = true;
    }
}


function getHerbInventory(itemId) {
    const inv = herbInventory && herbInventory[String(itemId)];
    
    if (inv && typeof inv === 'object') {
        return {
            quantity: inv.quantity ?? 0,
            threshold: inv.threshold ?? 0,
            unit: inv.unit || 'g',
            
            disabled: !!inv.disabled,
            defaultDosage: (typeof inv.defaultDosage === 'number' && !Number.isNaN(inv.defaultDosage)) ? inv.defaultDosage : null
        };
    }
    
    return { quantity: 0, threshold: 0, unit: 'g', disabled: false, defaultDosage: null };
}

function parseDefaultDosageNumber(raw) {
    const val = parseFloat(String(raw ?? '').trim());
    if (!Number.isFinite(val) || val < 0) return null;
    return Math.round(val * 100) / 100;
}

function resolvePrescriptionDefaultDosage(item, inv) {
    if (inv && typeof inv.defaultDosage === 'number' && Number.isFinite(inv.defaultDosage) && inv.defaultDosage >= 0) {
        return Math.round(inv.defaultDosage * 100) / 100;
    }
    return item && item.type === 'formula' ? 5 : 1;
}


async function setHerbInventory(itemId, quantity, threshold, unit, disabled, defaultDosage) {
    await waitForFirebaseDb();
    const data = {};
    if (quantity !== undefined && quantity !== null) {
        data.quantity = Number(quantity);
    }
    if (threshold !== undefined && threshold !== null) {
        data.threshold = Number(threshold);
    }
    if (unit !== undefined && unit !== null) {
        data.unit = unit;
    }
    if (disabled !== undefined && disabled !== null) {
        data.disabled = !!disabled;
    }
    if (defaultDosage !== undefined && defaultDosage !== null && !Number.isNaN(Number(defaultDosage))) {
        data.defaultDosage = Number(defaultDosage);
    }
    const clinicId = (function() {
        try {
            return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
        } catch (_e) {
            return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
        }
    })();
    const basePath = (currentInventoryMode === 'slice') ? 'herbInventorySlice' : 'herbInventory';
    const refPath = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/' + basePath + '/' + String(itemId));
    await window.firebase.update(refPath, data);
}


function normalizeHerbInventoryEntry(inv) {
    if (!inv || typeof inv !== 'object') return null;
    return {
        quantity: inv.quantity ?? 0,
        threshold: inv.threshold ?? 0,
        unit: inv.unit || 'g',
        disabled: !!inv.disabled,
        defaultDosage: (typeof inv.defaultDosage === 'number' && !Number.isNaN(inv.defaultDosage)) ? inv.defaultDosage : null
    };
}

/**
 * 一次 get 整個庫存節點（clinic 節點不存在的品項以 global 節點補位，
 * 語義與 getHerbInventoryForMode 的逐品項 fallback 相同）。
 * 兩個節點平行讀取，固定 2 次往返、與藥味數無關。
 */
async function readHerbInventoryNodesForMode(mode) {
    await waitForFirebaseDb();
    const clinicId = (function() {
        try {
            return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
        } catch (_e) {
            return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
        }
    })();
    const path = (mode === 'slice') ? 'herbInventorySlice' : 'herbInventory';
    const safeGet = async (r) => {
        try {
            const snap = await window.firebase.get(r);
            return snap && snap.exists() ? (snap.val() || {}) : {};
        } catch (_e) {
            return {};
        }
    };
    const [clinic, global] = await Promise.all([
        safeGet(window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/' + path)),
        safeGet(window.firebase.ref(window.firebase.rtdb, path))
    ]);
    return { clinic, global };
}


async function getHerbInventoryForMode(itemId, mode) {
    await waitForFirebaseDb();
    const clinicId = (function() {
        try {
            return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
        } catch (_e) {
            return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
        }
    })();
    const path = (mode === 'slice') ? 'herbInventorySlice' : 'herbInventory';
    const ref = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/' + path + '/' + String(itemId));
    try {
        const snap = await window.firebase.get(ref);
        if (snap && snap.exists()) {
            const inv = snap.val() || {};
            return {
                quantity: inv.quantity ?? 0,
                threshold: inv.threshold ?? 0,
                unit: inv.unit || 'g',
                disabled: !!inv.disabled,
                defaultDosage: (typeof inv.defaultDosage === 'number' && !Number.isNaN(inv.defaultDosage)) ? inv.defaultDosage : null
            };
        }
    } catch (_e) {}
    const globalRef = window.firebase.ref(window.firebase.rtdb, path + '/' + String(itemId));
    try {
        const gSnap = await window.firebase.get(globalRef);
        if (gSnap && gSnap.exists()) {
            const inv = gSnap.val() || {};
            return {
                quantity: inv.quantity ?? 0,
                threshold: inv.threshold ?? 0,
                unit: inv.unit || 'g',
                disabled: !!inv.disabled,
                defaultDosage: (typeof inv.defaultDosage === 'number' && !Number.isNaN(inv.defaultDosage)) ? inv.defaultDosage : null
            };
        }
    } catch (_e2) {}
    return { quantity: 0, threshold: 0, unit: 'g', disabled: false, defaultDosage: null };
}


async function getClinicScopedHerbInventoryForMode(itemId, mode) {
    await waitForFirebaseDb();
    const clinicId = (function() {
        try {
            return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
        } catch (_e) {
            return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
        }
    })();
    const path = (mode === 'slice') ? 'herbInventorySlice' : 'herbInventory';
    const ref = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/' + path + '/' + String(itemId));
    try {
        const snap = await window.firebase.get(ref);
        if (snap && snap.exists()) {
            const inv = snap.val() || {};
            return {
                quantity: inv.quantity ?? 0,
                threshold: inv.threshold ?? 0,
                unit: inv.unit || 'g',
                disabled: !!inv.disabled,
                defaultDosage: (typeof inv.defaultDosage === 'number' && !Number.isNaN(inv.defaultDosage)) ? inv.defaultDosage : null
            };
        }
    } catch (_e) {}
    return { quantity: 0, threshold: 0, unit: 'g', disabled: false, defaultDosage: null };
}


async function setHerbInventoryForMode(itemId, quantity, threshold, unit, disabled, mode, defaultDosage) {
    await waitForFirebaseDb();
    const data = {};
    if (quantity !== undefined && quantity !== null) data.quantity = Number(quantity);
    if (threshold !== undefined && threshold !== null) data.threshold = Number(threshold);
    if (unit !== undefined && unit !== null) data.unit = unit;
    if (disabled !== undefined && disabled !== null) data.disabled = !!disabled;
    if (defaultDosage !== undefined && defaultDosage !== null && !Number.isNaN(Number(defaultDosage))) {
        data.defaultDosage = Number(defaultDosage);
    }
    const clinicId = (function() {
        try {
            return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
        } catch (_e) {
            return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
        }
    })();
    const path = (mode === 'slice') ? 'herbInventorySlice' : 'herbInventory';
    const ref = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/' + path + '/' + String(itemId));
    await window.firebase.update(ref, data);
}


async function revertInventoryForConsultation(consultationId) {
    if (!consultationId) return;
    await waitForFirebaseDb();

    try {
        if (typeof initHerbInventory === 'function') {
            await initHerbInventory(false);
        }
    } catch (_initErr) {}

    try {
        const logRef = window.firebase.ref(window.firebase.rtdb, 'inventoryLogs/' + String(consultationId));
        const logSnap = await window.firebase.get(logRef);
        if (!logSnap || !logSnap.exists()) return;
        const log = logSnap.val() || {};

        // ① 純記憶體解析 log，按 mode 聚合回補量（舊 log 可能無 mode 前綴＝granule）
        const restoreByMode = { granule: {}, slice: {} };
        for (const rawKey in log) {
            const consumption = Number(log[rawKey]) || 0;
            if (consumption === 0) continue;
            const parts = String(rawKey).split(':');
            let mode = 'granule';
            let itemId = String(rawKey);
            if (parts.length === 2) { mode = parts[0] === 'slice' ? 'slice' : 'granule'; itemId = parts[1]; }
            restoreByMode[mode][String(itemId)] = (restoreByMode[mode][String(itemId)] || 0) + consumption;
        }

        // ② 每種模式一次 get 整個庫存節點（clinic＋global 平行），
        //    取代過去每味藥 1～2 次序列化 get（20 味最多 40 次往返）
        const modes = ['granule', 'slice'].filter(m => Object.keys(restoreByMode[m]).length > 0);
        const nodesByMode = {};
        await Promise.all(modes.map(async (mode) => {
            nodesByMode[mode] = await readHerbInventoryNodesForMode(mode);
        }));
        const resolveEntry = (mode, itemId) => {
            const nodes = nodesByMode[mode] || { clinic: {}, global: {} };
            return normalizeHerbInventoryEntry(nodes.clinic[itemId])
                || normalizeHerbInventoryEntry(nodes.global[itemId])
                || { quantity: 0, threshold: 0, unit: 'g', disabled: false, defaultDosage: null };
        };

        const clinicId = (function() {
            try {
                return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
            } catch (_e) {
                return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
            }
        })();

        // ③ 記憶體算回補後數量；所有庫存回補＋inventoryLogs 刪除放進同一筆
        //    root multi-path update：全部成功或全部失敗，避免回補一半或
        //    log 已刪導致無法重跑（舊式逐筆 update + 事後 remove 皆有此風險）
        const updates = {};
        const cachePatches = [];
        for (const mode of modes) {
            const basePath = 'clinics/' + String(clinicId) + '/' + (mode === 'slice' ? 'herbInventorySlice' : 'herbInventory');
            for (const itemId of Object.keys(restoreByMode[mode])) {
                const inv = resolveEntry(mode, itemId);
                const newQty = (inv.quantity || 0) + restoreByMode[mode][itemId];
                const unit = inv.unit || 'g';
                const writeData = {
                    quantity: Number(newQty),
                    threshold: Number(inv.threshold) || 0,
                    unit,
                    disabled: !!inv.disabled
                };
                if (typeof inv.defaultDosage === 'number' && !Number.isNaN(inv.defaultDosage)) {
                    writeData.defaultDosage = Number(inv.defaultDosage);
                }
                updates[basePath + '/' + itemId] = writeData;
                cachePatches.push({
                    mode,
                    itemId,
                    entry: {
                        quantity: newQty,
                        threshold: writeData.threshold,
                        unit,
                        disabled: !!inv.disabled,
                        defaultDosage: ('defaultDosage' in writeData) ? writeData.defaultDosage : null
                    }
                });
            }
        }
        updates['inventoryLogs/' + String(consultationId)] = null;
        await window.firebase.update(window.firebase.ref(window.firebase.rtdb), updates);

        // ④ 提交成功後更新本地快取與 localStorage 鏡像
        for (const patch of cachePatches) {
            try {
                if (patch.mode === 'slice') {
                    herbInventorySlice[String(patch.itemId)] = patch.entry;
                } else {
                    herbInventoryGranule[String(patch.itemId)] = patch.entry;
                }
            } catch (_e) {}
        }
        try {
            const ls = localStorage.getItem('inventoryLogs');
            if (ls) {
                const obj = JSON.parse(ls);
                if (Object.prototype.hasOwnProperty.call(obj, String(consultationId))) {
                    delete obj[String(consultationId)];
                    localStorage.setItem('inventoryLogs', JSON.stringify(obj));
                }
            }
        } catch (_e) {}
    } catch (err) {
        console.error('還原診症庫存資料失敗:', err);
    }
}


async function updateInventoryAfterConsultation(consultationId, items, days, freq, isEditing = false, previousLog = null) {
    if (!consultationId || !Array.isArray(items)) return;
    await waitForFirebaseDb();
    
    
    
    try {
        if (typeof initHerbInventory === 'function') {
            await initHerbInventory(false);
        }
    } catch (_initErr) {
        
    }
    
    if (isEditing && previousLog) {
        for (const key in previousLog) {
            const consumption = Number(previousLog[key]) || 0;
            const inv = getHerbInventory(key);
            const newQty = (inv.quantity || 0) + consumption;
            
            await setHerbInventory(key, newQty, inv.threshold, inv.unit, inv.disabled, inv.defaultDosage);
            
            try {
                if (typeof herbInventory !== 'undefined') {
                    herbInventory[String(key)] = {
                        quantity: newQty,
                        threshold: inv.threshold,
                        unit: inv.unit,
                        disabled: !!inv.disabled,
                        defaultDosage: (typeof inv.defaultDosage === 'number' && Number.isFinite(inv.defaultDosage)) ? inv.defaultDosage : null
                    };
                }
            } catch (_e) {
                
            }
        }
    }
    const log = {};
    const historyEntries = [];
    for (const item of items) {
        if (!item || !item.id) continue;
        const dosageStr = item.customDosage || item.dosage || '';
        const dosage = parseFloat(dosageStr);
        if (isNaN(dosage) || dosage <= 0) continue;
        const consumption = dosage * days * freq;
        const inv = getHerbInventory(item.id);
        const newQty = (inv.quantity || 0) - consumption;
        await setHerbInventory(item.id, newQty, inv.threshold, inv.unit, inv.disabled, inv.defaultDosage);
        
        try {
            if (typeof herbInventory !== 'undefined') {
                herbInventory[String(item.id)] = {
                    quantity: newQty,
                    threshold: inv.threshold,
                    unit: inv.unit,
                    disabled: !!inv.disabled,
                    defaultDosage: (typeof inv.defaultDosage === 'number' && Number.isFinite(inv.defaultDosage)) ? inv.defaultDosage : null
                };
            }
        } catch (_e) {
            
        }
        log[String(item.id)] = consumption;
        historyEntries.push({ itemId: String(item.id), quantity: consumption, unit: inv.unit || 'g' });
    }
    if (!isEditing) {
        await window.firebase.set(window.firebase.ref(window.firebase.rtdb, 'inventoryLogs/' + String(consultationId)), log);
        try { await recordInventoryHistory('out', historyEntries, { consultationId: String(consultationId) }); } catch (_e) {}
    } else {
        try {
            await window.firebase.set(window.firebase.ref(window.firebase.rtdb, 'inventoryLogs/' + String(consultationId)), log);
            const ls = localStorage.getItem('inventoryLogs');
            const obj = ls ? JSON.parse(ls) : {};
            obj[String(consultationId)] = log;
            localStorage.setItem('inventoryLogs', JSON.stringify(obj));
        } catch (_e) {}
    }
    
    try {
        if (typeof updatePrescriptionDisplay === 'function') {
            updatePrescriptionDisplay();
        }
    } catch (_e) {
        
    }
}


async function updateInventoryAfterConsultationMulti(consultationId, prescriptionsList, isEditing = false, previousLog = null) {
    if (!consultationId || !Array.isArray(prescriptionsList)) return;
    await waitForFirebaseDb();
    try {
        if (typeof initHerbInventory === 'function') {
            await initHerbInventory(false);
        }
    } catch (_initErr) {}
    const newLog = {};
    for (const section of prescriptionsList) {
        const d = parseInt(section && section.days) || 0;
        const f = parseInt(section && section.freq) || 0;
        if (d <= 0 || f <= 0) continue;
        const items = Array.isArray(section && section.items) ? section.items : [];
        const mode = (section && (section.mode === 'slice' || section.mode === 'granule')) ? section.mode : 'granule';
        for (const it of items) {
            if (!it || !it.id) continue;
            const dosageStr = it.customDosage || it.dosage || '';
            const dosage = parseFloat(dosageStr);
            if (isNaN(dosage) || dosage <= 0) continue;
            const consumption = dosage * d * f;
            const key = mode + ':' + String(it.id);
            newLog[key] = (newLog[key] || 0) + consumption;
        }
    }
    if (isEditing && previousLog === null) {
        try { if (typeof updatePrescriptionDisplay === 'function') updatePrescriptionDisplay(); } catch (_e) {}
        const totalsForEdit = {};
        for (const k of Object.keys(newLog)) {
            const parts = String(k).split(':');
            const itemId = parts.length === 2 ? parts[1] : String(k);
            const qty = Number(newLog[k]) || 0;
            totalsForEdit[itemId] = (totalsForEdit[itemId] || 0) + qty;
        }
        try {
            await window.firebase.set(window.firebase.ref(window.firebase.rtdb, 'inventoryLogs/' + String(consultationId)), totalsForEdit);
            const ls = localStorage.getItem('inventoryLogs');
            const obj = ls ? JSON.parse(ls) : {};
            obj[String(consultationId)] = totalsForEdit;
            localStorage.setItem('inventoryLogs', JSON.stringify(obj));
        } catch (_e) {}
    }
    const historyOut = [];
    const historyIn = [];

    // ① 先算本次藥單的各 mode 合計（edit 寫 log/history 用，純記憶體）
    const totals = {};
    const totalsByMode = { granule: {}, slice: {} };
    for (const k of Object.keys(newLog)) {
        const parts = String(k).split(':');
        const m = parts.length === 2 ? (parts[0] === 'slice' ? 'slice' : 'granule') : 'granule';
        const itemId = parts.length === 2 ? parts[1] : String(k);
        const qty = Number(newLog[k]) || 0;
        totals[itemId] = (totals[itemId] || 0) + qty;
        totalsByMode[m][itemId] = (totalsByMode[m][itemId] || 0) + qty;
    }

    // ② 記憶體計算全部差異（無 I/O）
    const allItemIds = new Set([
        ...Object.keys(newLog),
        ...(previousLog ? Object.keys(previousLog) : [])
    ]);
    const deductions = [];
    const neededModes = new Set();
    // edit 模式的 history finalEntries 需全部品項的 unit（含差異為 0 者），
    // 故需預載所有出現過的 mode；非 edit 只需差異品項所屬的 mode
    if (isEditing) {
        for (const m of ['granule', 'slice']) {
            if (Object.keys(totalsByMode[m]).length > 0) neededModes.add(m);
        }
    }
    for (const key of allItemIds) {
        const prev = previousLog ? (Number(previousLog[key]) || 0) : 0;
        const next = Number(newLog[key]) || 0;
        const delta = next - prev;
        if (delta === 0) continue;
        const parts = String(key).split(':');
        let mode = 'granule';
        let itemId = String(key);
        if (parts.length === 2) { mode = parts[0] === 'slice' ? 'slice' : 'granule'; itemId = parts[1]; }
        deductions.push({ mode, itemId: String(itemId), delta });
        neededModes.add(mode);
    }

    // ③ 每種模式一次 get 整個庫存節點（clinic＋global 平行），取代過去
    //    每味藥 1～2 次序列化 get（20 味藥 20～40 次往返）
    const nodesByMode = {};
    await Promise.all([...neededModes].map(async (mode) => {
        nodesByMode[mode] = await readHerbInventoryNodesForMode(mode);
    }));
    const resolveEntry = (mode, itemId) => {
        const nodes = nodesByMode[mode] || { clinic: {}, global: {} };
        return normalizeHerbInventoryEntry(nodes.clinic[itemId])
            || normalizeHerbInventoryEntry(nodes.global[itemId])
            || { quantity: 0, threshold: 0, unit: 'g', disabled: false, defaultDosage: null };
    };

    // ④ 記憶體算差異，組單一 multi-path update：所有庫存增減＋inventoryLogs
    //    同一筆寫入，全部成功或全部失敗，不再中途失敗只扣一半
    const clinicId = (function() {
        try {
            return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
        } catch (_e) {
            return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
        }
    })();
    const updates = {};
    const cachePatches = [];
    for (const { mode, itemId, delta } of deductions) {
        const inv = resolveEntry(mode, itemId);
        const newQty = (inv.quantity || 0) - delta;
        const unit = inv.unit || 'g';
        const basePath = 'clinics/' + String(clinicId) + '/' + (mode === 'slice' ? 'herbInventorySlice' : 'herbInventory');
        const writeData = {
            quantity: Number(newQty),
            threshold: Number(inv.threshold) || 0,
            unit,
            disabled: !!inv.disabled
        };
        if (typeof inv.defaultDosage === 'number' && !Number.isNaN(inv.defaultDosage)) {
            writeData.defaultDosage = Number(inv.defaultDosage);
        }
        updates[basePath + '/' + itemId] = writeData;
        cachePatches.push({
            mode,
            itemId,
            entry: {
                quantity: newQty,
                threshold: writeData.threshold,
                unit,
                disabled: !!inv.disabled,
                defaultDosage: ('defaultDosage' in writeData) ? writeData.defaultDosage : null
            }
        });
        if (delta > 0) {
            historyOut.push({ itemId: String(itemId), quantity: delta, unit, mode });
        } else {
            historyIn.push({ itemId: String(itemId), quantity: Math.abs(delta), unit, mode });
        }
    }

    const inventoryLogPath = 'inventoryLogs/' + String(consultationId);
    updates[inventoryLogPath] = isEditing ? totals : newLog;
    if (deductions.length > 0) {
        await window.firebase.update(window.firebase.ref(window.firebase.rtdb), updates);
    } else {
        await window.firebase.set(window.firebase.ref(window.firebase.rtdb, inventoryLogPath), updates[inventoryLogPath]);
    }

    // ⑤ 提交成功後更新本地快取與 localStorage 記錄
    for (const patch of cachePatches) {
        try {
            if (patch.mode === 'slice') {
                herbInventorySlice[String(patch.itemId)] = patch.entry;
            } else {
                herbInventoryGranule[String(patch.itemId)] = patch.entry;
            }
        } catch (_e) {}
    }
    try {
        const ls = localStorage.getItem('inventoryLogs');
        const obj = ls ? JSON.parse(ls) : {};
        obj[String(consultationId)] = isEditing ? totals : newLog;
        localStorage.setItem('inventoryLogs', JSON.stringify(obj));
    } catch (_e) {}

    // ⑥ 歷史記錄（失敗不影響已提交的庫存）
    if (!isEditing) {
        try { if (historyIn.length) await recordInventoryHistory('in', historyIn, { consultationId: String(consultationId) }); } catch (_e) {}
        try { if (historyOut.length) await recordInventoryHistory('out', historyOut, { consultationId: String(consultationId) }); } catch (_e) {}
    } else {
        // unit 直接用已載入的庫存節點解析，不再逐品項重跑 getHerbInventoryForMode
        const finalEntries = [];
        for (const m of ['granule', 'slice']) {
            for (const itemId of Object.keys(totalsByMode[m])) {
                const inv = resolveEntry(m, itemId);
                finalEntries.push({ itemId: String(itemId), quantity: totalsByMode[m][itemId], unit: inv.unit || 'g', mode: m });
            }
        }
        try { await recordInventoryHistory('out', finalEntries, { consultationId: String(consultationId), replaceExistingForConsultation: true }); } catch (_e) {}
    }
    try { if (typeof updatePrescriptionDisplay === 'function') updatePrescriptionDisplay(); } catch (_e) {}
}


let currentInventoryItemId = null;


async function openInventoryModal(itemId) {
    if (!hasActionPermission('herbInventoryEdit')) {
        showToast('權限不足，無法編輯中藥庫存', 'error');
        return;
    }
    try {
        currentInventoryItemId = itemId;
        try { await ensureInventoryCacheForMode(currentHerbLibraryViewMode); } catch (_e) {}
        const modal = document.getElementById('inventoryModal');
        const qtyInput = document.getElementById('inventoryQuantity');
        const thrInput = document.getElementById('inventoryThreshold');
        const defaultDosageInput = document.getElementById('inventoryDefaultDosage');
        
        try {
            
            if (qtyInput) {
                
                if (qtyInput._enterSaveHandler) {
                    qtyInput.removeEventListener('keypress', qtyInput._enterSaveHandler);
                }
                
                qtyInput._enterSaveHandler = function (ev) {
                    if (ev && ev.key === 'Enter') {
                        ev.preventDefault();
                        try {
                            
                            const saveBtn = modal ? modal.querySelector('button[onclick*="saveInventoryChanges"]') : null;
                            if (saveBtn && typeof saveBtn.click === 'function') {
                                saveBtn.click();
                                return;
                            }
                        } catch (_e) {
                            
                        }
                        
                        try {
                            if (typeof saveInventoryChanges === 'function') {
                                saveInventoryChanges();
                            }
                        } catch (_e) {
                            
                            console.error('Enter 鍵觸發庫存儲存失敗:', _e);
                        }
                    }
                };
                
                qtyInput.addEventListener('keypress', qtyInput._enterSaveHandler);
            }
            
            if (thrInput) {
                
                if (thrInput._enterSaveHandler) {
                    thrInput.removeEventListener('keypress', thrInput._enterSaveHandler);
                }
                thrInput._enterSaveHandler = function (ev) {
                    if (ev && ev.key === 'Enter') {
                        ev.preventDefault();
                        try {
                            const saveBtn = modal ? modal.querySelector('button[onclick*="saveInventoryChanges"]') : null;
                            if (saveBtn && typeof saveBtn.click === 'function') {
                                saveBtn.click();
                                return;
                            }
                        } catch (_e) {
                            
                        }
                        try {
                            if (typeof saveInventoryChanges === 'function') {
                                saveInventoryChanges();
                            }
                        } catch (_e) {
                            console.error('Enter 鍵觸發庫存儲存失敗:', _e);
                        }
                    }
                };
                thrInput.addEventListener('keypress', thrInput._enterSaveHandler);
            }

            if (defaultDosageInput) {
                if (defaultDosageInput._enterSaveHandler) {
                    defaultDosageInput.removeEventListener('keypress', defaultDosageInput._enterSaveHandler);
                }
                defaultDosageInput._enterSaveHandler = function (ev) {
                    if (ev && ev.key === 'Enter') {
                        ev.preventDefault();
                        try {
                            const saveBtn = modal ? modal.querySelector('button[onclick*="saveInventoryChanges"]') : null;
                            if (saveBtn && typeof saveBtn.click === 'function') {
                                saveBtn.click();
                                return;
                            }
                        } catch (_e) {
                        }
                        try {
                            if (typeof saveInventoryChanges === 'function') {
                                saveInventoryChanges();
                            }
                        } catch (_e) {
                            console.error('Enter 鍵觸發庫存儲存失敗:', _e);
                        }
                    }
                };
                defaultDosageInput.addEventListener('keypress', defaultDosageInput._enterSaveHandler);
            }
        } catch (_e) {
            
            console.error('綁定庫存輸入 Enter 鍵事件失敗:', _e);
        }
        const titleEl = document.getElementById('inventoryModalTitle');
        
        let nameStr = '';
        try {
            const item = Array.isArray(herbLibrary) ? herbLibrary.find(h => h && String(h.id) === String(itemId)) : null;
            if (item && item.name) {
                nameStr = String(item.name);
            }
        } catch (_e) {}
        if (titleEl) {
            
            
            const baseTitle = (typeof window.t === 'function') ? window.t('編輯庫存') : '編輯庫存';
            titleEl.textContent = nameStr ? `${baseTitle} - ${nameStr}` : baseTitle;
        }
        
        let inv = await getClinicScopedHerbInventoryForMode(itemId, currentHerbLibraryViewMode);
        if (qtyInput || thrInput) {
            
            const unit = inv.unit || 'g';
            const factor = UNIT_FACTOR_MAP[unit] || 1;
            if (qtyInput) {
                qtyInput.value = ((inv.quantity ?? 0) / factor).toString();
            }
            if (thrInput) {
                thrInput.value = ((inv.threshold ?? 0) / factor).toString();
            }
            if (defaultDosageInput) {
                const item = Array.isArray(herbLibrary) ? herbLibrary.find(h => h && String(h.id) === String(itemId)) : null;
                const defaultDose = resolvePrescriptionDefaultDosage(item || { type: 'herb', dosage: null }, inv);
                defaultDosageInput.value = Number.isFinite(defaultDose) ? String(defaultDose) : '';
            }
            
            try {
                const qtyUnitSel = document.getElementById('inventoryQuantityUnit');
                if (qtyUnitSel) {
                    
                    qtyUnitSel.value = unit;
                    
                    qtyUnitSel.dataset.prevUnit = unit;

                    
                    try {
                        
                        if (qtyUnitSel._unitChangeHandler) {
                            qtyUnitSel.removeEventListener('change', qtyUnitSel._unitChangeHandler);
                        }
                        
                        qtyUnitSel._unitChangeHandler = function (e) {
                            const selectEl = e && e.target ? e.target : qtyUnitSel;
                            const newUnitVal = selectEl.value || 'g';
                            const prevUnitVal = selectEl.dataset.prevUnit || 'g';
                            
                            if (newUnitVal === prevUnitVal) {
                                return;
                            }
                            const prevFactor = UNIT_FACTOR_MAP[prevUnitVal] || 1;
                            const newFactorVal = UNIT_FACTOR_MAP[newUnitVal] || 1;
                            
                            if (qtyInput) {
                                const qValRaw = parseFloat(qtyInput.value);
                                if (!isNaN(qValRaw)) {
                                    const grams = qValRaw * prevFactor;
                                    const convertedQty = grams / newFactorVal;
                                    
                                    qtyInput.value = (Math.round(convertedQty * 1000) / 1000).toString();
                                }
                            }
                            
                            if (thrInput) {
                                const thrValRaw = parseFloat(thrInput.value);
                                if (!isNaN(thrValRaw)) {
                                    const grams = thrValRaw * prevFactor;
                                    const convertedThr = grams / newFactorVal;
                                    thrInput.value = (Math.round(convertedThr * 1000) / 1000).toString();
                                }
                            }
                            
                            selectEl.dataset.prevUnit = newUnitVal;
                        };
                        
                        qtyUnitSel.addEventListener('change', qtyUnitSel._unitChangeHandler);
                    } catch (_e) {
                        
                        console.error('綁定庫存單位變更監聽器失敗:', _e);
                    }
                }
            } catch (_e) {}
            
            try {
                const disSel = document.getElementById('inventoryDisabled');
                if (disSel) {
                    
                    disSel.value = inv && inv.disabled ? 'true' : 'false';
                }
            } catch (_e) {
                
            }
        }
        if (modal) {
            modal.classList.remove('hidden');
        }
    } catch (err) {
        console.error('開啟庫存編輯彈窗錯誤:', err);
    }
}


function hideInventoryModal() {
    const modal = document.getElementById('inventoryModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}


async function saveInventoryChanges() {
    if (!hasActionPermission('herbInventoryEdit')) {
        showToast('權限不足，無法編輯中藥庫存', 'error');
        return;
    }
    
    const saveBtn = getLoadingButtonFromEvent('button[onclick="saveInventoryChanges()"]');
    setButtonLoading(saveBtn);
    try {
        const qtyInput = document.getElementById('inventoryQuantity');
        const thrInput = document.getElementById('inventoryThreshold');
        const defaultDosageInput = document.getElementById('inventoryDefaultDosage');
        const qVal = qtyInput ? parseFloat(qtyInput.value) : NaN;
        const tVal = thrInput ? parseFloat(thrInput.value) : NaN;
        
        const qtyUnitSelect = document.getElementById('inventoryQuantityUnit');
        const qtyUnit = qtyUnitSelect ? qtyUnitSelect.value : 'g';
        
        const factor = UNIT_FACTOR_MAP[qtyUnit] || 1;
        let quantity = isNaN(qVal) ? 0 : qVal;
        let threshold = isNaN(tVal) ? 0 : tVal;
        const quantityBase = quantity * factor;
        const thresholdBase = threshold * factor;
        const id = currentInventoryItemId;
        
        let disabledVal = false;
        try {
            const disSel = document.getElementById('inventoryDisabled');
            if (disSel) {
                disabledVal = (disSel.value === 'true');
            }
        } catch (_e) {
            disabledVal = false;
        }
        
        const itemForDefault = Array.isArray(herbLibrary) ? herbLibrary.find(h => h && String(h.id) === String(id)) : null;
        const fallbackDefaultDose = resolvePrescriptionDefaultDosage(itemForDefault || { type: 'herb', dosage: null }, null);
        const parsedDefaultDose = parseDefaultDosageNumber(defaultDosageInput ? defaultDosageInput.value : null);
        const defaultDoseToSave = parsedDefaultDose !== null ? parsedDefaultDose : fallbackDefaultDose;
        await setHerbInventoryForMode(id, quantityBase, thresholdBase, qtyUnit, disabledVal, currentHerbLibraryViewMode, defaultDoseToSave);
        try {
            if (currentHerbLibraryViewMode === 'slice') {
                herbInventorySlice[String(id)] = { quantity: quantityBase, threshold: thresholdBase, unit: qtyUnit, disabled: !!disabledVal, defaultDosage: defaultDoseToSave };
                herbInventorySliceInitialized = true;
            } else {
                herbInventoryGranule[String(id)] = { quantity: quantityBase, threshold: thresholdBase, unit: qtyUnit, disabled: !!disabledVal, defaultDosage: defaultDoseToSave };
                herbInventoryGranuleInitialized = true;
            }
        } catch (_e) {}
        
        try {
            if (Array.isArray(herbLibrary)) {
                const idx = herbLibrary.findIndex(h => h && String(h.id) === String(id));
                if (idx >= 0 && herbLibrary[idx]) {
                    herbLibrary[idx].stock = quantityBase;
                    herbLibrary[idx].threshold = thresholdBase;
                    herbLibrary[idx].unit = qtyUnit;
                }
            }
        } catch (_e) {}
        
        showToast('庫存已更新！', 'success');
        
        hideInventoryModal();
        
        
        try {
            if (typeof displayHerbLibrary === 'function') {
                displayHerbLibrary();
            }
        } catch (_e) {}
        try {
            if (typeof updatePrescriptionDisplay === 'function') {
                updatePrescriptionDisplay();
            }
        } catch (_e) {}
    } catch (err) {
            console.error('保存庫存變更時發生錯誤:', err);
            showToast('保存庫存變更失敗！', 'error');
        } finally {
            
            clearButtonLoading(saveBtn);
        }
    }
        
        function openBatchInventoryModal() {
            if (!hasActionPermission('herbBatchInventory')) {
                showToast('權限不足，無法使用中藥批量入庫', 'error');
                return;
            }
            try {
                
                if (typeof initHerbLibrary === 'function' && !herbLibraryLoaded) {
                    initHerbLibrary().then(() => {
                        _openBatchModalInner();
                    });
                } else {
                    _openBatchModalInner();
                }
            } catch (e) {
                console.error('openBatchInventoryModal error:', e);
            }
        }

        function _openBatchModalInner() {
            const modal = document.getElementById('batchInventoryModal');
            if (!modal) return;
            
            const rowsContainer = document.getElementById('batchRows');
            if (rowsContainer) rowsContainer.innerHTML = '';
            
            addBatchRow();
            
            try {
                const title = document.getElementById('batchInventoryModalTitle');
                if (title && typeof window.t === 'function') {
                    title.textContent = window.t('批量入庫');
                }
                const addButton = modal.querySelector('button[onclick="addBatchRow()"]');
                if (addButton && typeof window.t === 'function') {
                    addButton.textContent = '+ ' + window.t('新增藥材');
                }
                const cancelBtn = modal.querySelector('button[onclick="hideBatchInventoryModal()"]');
                if (cancelBtn && typeof window.t === 'function') {
                    cancelBtn.textContent = window.t('取消');
                }
                const saveBtn = modal.querySelector('button[onclick="saveBatchInventory()"]');
                if (saveBtn && typeof window.t === 'function') {
                    saveBtn.textContent = window.t('儲存');
                }
                const btnLabel = document.getElementById('batchInventoryBtnText');
                if (btnLabel && typeof window.t === 'function') {
                    btnLabel.textContent = window.t('批量入庫');
                }
                
                const typeDisplay = document.getElementById('batchInventoryTypeDisplay');
                if (typeDisplay) {
                    const mode = (currentHerbLibraryViewMode === 'slice') ? 'slice' : 'granule';
                    let label = mode === 'slice' ? '飲片' : '顆粒沖劑';
                    
                    if (typeof window.t === 'function') {
                        label = window.t(label);
                    }
                    typeDisplay.textContent = label;
                }
            } catch (_e) {
                
            }
            modal.classList.remove('hidden');
        }

        function hideBatchInventoryModal() {
            const modal = document.getElementById('batchInventoryModal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }

        function addBatchRow() {
            const rowsContainer = document.getElementById('batchRows');
            if (!rowsContainer) return;
            
            const row = document.createElement('div');
            row.className = 'batch-row flex flex-wrap items-center gap-2';
            
            const searchContainer = document.createElement('div');
            
            searchContainer.className = 'relative flex-1';
            
            const herbInput = document.createElement('input');
            herbInput.type = 'text';
            herbInput.className = 'batch-herb-input border border-gray-300 rounded px-2 py-1 w-full';
            herbInput.placeholder = (typeof window.t === 'function') ? (window.t('搜尋藥材或方劑') || '搜尋藥材或方劑') : '搜尋藥材或方劑';
            
            const suggestionList = document.createElement('div');
            suggestionList.className = 'absolute z-10 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-300 rounded w-full hidden';
            
            row.dataset.herbId = '';
            
            let suggestionIndex = -1;
            
            function updateSuggestions() {
                
                suggestionIndex = -1;
                const query = herbInput.value.trim().toLowerCase();
                suggestionList.innerHTML = '';
                if (!query) {
                    suggestionList.classList.add('hidden');
                    row.dataset.herbId = '';
                    return;
                }
                const matches = [];
                if (Array.isArray(herbLibrary)) {
                    for (const h of herbLibrary) {
                        let name = h.name || '';
                        let englishName = h.englishName || '';
                        let searchTarget = name;
                        
                        try {
                            const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                            if (langSel && langSel.toLowerCase().startsWith('en') && englishName) {
                                searchTarget = englishName;
                            }
                        } catch (_e) {}
                        
                        const lowerSearchTarget = searchTarget.toLowerCase();
                        const lowerEnglishName = englishName.toLowerCase();
                        if (lowerSearchTarget.includes(query) || lowerEnglishName.includes(query)) {
                            
                            let disabled = false;
                            try {
                                const invInfo = getHerbInventoryFromView(h.id);
                                if (invInfo && invInfo.disabled) {
                                    disabled = true;
                                }
                            } catch (_e) {
                                
                                disabled = false;
                            }
                            
                            if (!disabled) {
                                matches.push(h);
                                if (matches.length >= 10) break;
                            }
                        }
                    }
                }
                if (matches.length === 0) {
                    suggestionList.classList.add('hidden');
                    return;
                }
                matches.forEach(h => {
                    const item = document.createElement('div');
                    item.className = 'px-2 py-1 cursor-pointer hover:bg-gray-100';
                    let displayName = h.name;
                    try {
                        const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                        if (langSel && langSel.toLowerCase().startsWith('en') && h.englishName) {
                            displayName = h.englishName;
                        }
                    } catch (_e) {}
                    item.textContent = displayName;
                    item.addEventListener('click', () => {
                        
                        row.dataset.herbId = h.id;
                        suggestionList.classList.add('hidden');
                        
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'batch-herb-name px-2 py-1 w-full';
                        nameSpan.textContent = displayName;
                        
                        searchContainer.innerHTML = '';
                        searchContainer.appendChild(nameSpan);
                        
                        try {
                            
                            let herbUnit = 'g';
                            if (typeof getHerbInventory === 'function') {
                                const invInfo = getHerbInventory(h.id);
                                if (invInfo && invInfo.unit) {
                                    herbUnit = invInfo.unit;
                                }
                            }
                            
                            row.dataset.herbUnit = herbUnit;
                            
                            const unitDisplay = row.querySelector('span.batch-herb-unit');
                            if (unitDisplay) {
                                let label = (typeof UNIT_LABEL_MAP !== 'undefined' && UNIT_LABEL_MAP && UNIT_LABEL_MAP[herbUnit]) ? UNIT_LABEL_MAP[herbUnit] : herbUnit;
                                
                                label = (typeof window.t === 'function') ? window.t(label) : label;
                                unitDisplay.textContent = label;
                                
                                try {
                                    unitDisplay.classList.remove('text-gray-400');
                                    unitDisplay.classList.add('text-gray-600');
                                    
                                    unitDisplay.classList.remove('border-transparent');
                                    unitDisplay.classList.add('border-gray-300');
                                    
                                    unitDisplay.classList.add('rounded');
                                    
                                    unitDisplay.classList.remove('bg-transparent');
                                    unitDisplay.classList.add('bg-gray-50');
                                } catch (_e) {
                                    
                                }
                            }
                        } catch (_err) {
                            
                        }
                    });
                    suggestionList.appendChild(item);
                });
                suggestionList.classList.remove('hidden');
            }
            herbInput.addEventListener('input', updateSuggestions);
            herbInput.addEventListener('focus', updateSuggestions);
            
            herbInput.addEventListener('keydown', function(ev) {
                const key = ev && ev.key;
                if (!key || !(['ArrowUp', 'ArrowDown', 'Enter'].includes(key))) {
                    return;
                }
                
                if (suggestionList.classList.contains('hidden')) {
                    return;
                }
                const items = Array.from(suggestionList.children);
                if (!items || items.length === 0) {
                    return;
                }
                if (key === 'ArrowDown') {
                    ev.preventDefault();
                    suggestionIndex = (suggestionIndex + 1) % items.length;
                    items.forEach((el, idx) => {
                        if (idx === suggestionIndex) {
                            el.classList.add('bg-gray-200');
                        } else {
                            el.classList.remove('bg-gray-200');
                        }
                    });
                    const currentEl = items[suggestionIndex];
                    if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                        currentEl.scrollIntoView({ block: 'nearest' });
                    }
                } else if (key === 'ArrowUp') {
                    ev.preventDefault();
                    suggestionIndex = (suggestionIndex - 1 + items.length) % items.length;
                    items.forEach((el, idx) => {
                        if (idx === suggestionIndex) {
                            el.classList.add('bg-gray-200');
                        } else {
                            el.classList.remove('bg-gray-200');
                        }
                    });
                    const currentEl = items[suggestionIndex];
                    if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                        currentEl.scrollIntoView({ block: 'nearest' });
                    }
                } else if (key === 'Enter') {
                    if (suggestionIndex >= 0 && suggestionIndex < items.length) {
                        ev.preventDefault();
                        const selectedEl = items[suggestionIndex];
                        if (selectedEl && typeof selectedEl.click === 'function') {
                            selectedEl.click();
                        }
                    }
                }
            });
            document.addEventListener('click', function(ev) {
                if (!searchContainer.contains(ev.target)) {
                    suggestionList.classList.add('hidden');
                }
            });
            searchContainer.appendChild(herbInput);
            searchContainer.appendChild(suggestionList);
            row.appendChild(searchContainer);
            
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.min = '0';
            qtyInput.step = '0.5';
            qtyInput.placeholder = (typeof window.t === 'function') ? window.t('數量') : '數量';
            qtyInput.className = 'batch-herb-qty w-24 border border-gray-300 rounded px-2 py-1';
            row.appendChild(qtyInput);
            
            const unitDisplay = document.createElement('span');
            
            unitDisplay.className =
                'batch-herb-unit w-20 border border-transparent px-2 py-1 text-sm text-gray-400 bg-transparent flex items-center justify-center';
            
            try {
                const placeholderLabel = (typeof window.t === 'function') ? window.t('單位') : '單位';
                unitDisplay.textContent = placeholderLabel;
            } catch (_e) {
                unitDisplay.textContent = '單位';
            }
            row.appendChild(unitDisplay);
            
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'text-red-500 hover:text-red-700 px-2';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function() {
                row.remove();
            });
            row.appendChild(removeBtn);
            rowsContainer.appendChild(row);
        }

        async function saveBatchInventory() {
            if (!hasActionPermission('herbBatchInventory')) {
                showToast('權限不足，無法使用中藥批量入庫', 'error');
                return;
            }
            
            const saveBtn = getLoadingButtonFromEvent('#batchInventoryModal button[onclick="saveBatchInventory()"]');
            setButtonLoading(saveBtn);
            
            const originalInventoryMode = currentInventoryMode;
            try {
                
                if (typeof initHerbInventory === 'function' && !herbInventoryInitialized) {
                    try {
                        await initHerbInventory();
                    } catch (_e) {
                        
                    }
                }
                const rowsContainer = document.getElementById('batchRows');
                if (!rowsContainer) {
                    clearButtonLoading(saveBtn);
                    return;
                }
                
                const rows = rowsContainer.querySelectorAll('.batch-row');
                if (!rows || rows.length === 0) {
                    hideBatchInventoryModal();
                    clearButtonLoading(saveBtn);
                    return;
                }
                
                let selectedInventoryMode = currentInventoryMode;
                try {
                    const typeSelect = document.getElementById('batchInventoryTypeSelect');
                    if (typeSelect) {
                        const val = typeSelect.value;
                        if (val === 'granule' || val === 'slice') {
                            selectedInventoryMode = val;
                        }
                    }
                } catch (_e) {
                    
                }
                
                let allValid = true;
                for (const row of rows) {
                    const qtyInputTemp = row.querySelector('input.batch-herb-qty');
                    let herbIdTemp = '';
                    if (row.dataset && row.dataset.herbId) {
                        herbIdTemp = row.dataset.herbId;
                    }
                    if (!herbIdTemp) {
                        const selectElTemp = row.querySelector('select.batch-herb-select');
                        if (selectElTemp) {
                            herbIdTemp = selectElTemp.value;
                        }
                    }
                    const qValTemp = qtyInputTemp ? parseFloat(qtyInputTemp.value) : NaN;
                    if (!herbIdTemp || isNaN(qValTemp) || qValTemp <= 0) {
                        allValid = false;
                        break;
                    }
                }
                if (!allValid) {
                    
                    showToast((typeof window.t === 'function') ? (window.t('請選擇中藥') + ' / ' + window.t('數量')) : '請選擇中藥 / 數量', 'error');
                    clearButtonLoading(saveBtn);
                    return;
                }
                
                currentInventoryMode = selectedInventoryMode;
                
                
                try {
                    if (typeof initHerbInventory === 'function') {
                        await initHerbInventory(true);
                    }
                } catch (_initErr) {
                    
                }
                
                const historyEntries = [];
                for (const row of rows) {
                    const qtyInput = row.querySelector('input.batch-herb-qty');
                    let herbId = '';
                    
                    if (row.dataset && row.dataset.herbId) {
                        herbId = row.dataset.herbId;
                    }
                    
                    if (!herbId) {
                        const selectEl = row.querySelector('select.batch-herb-select');
                        if (selectEl) {
                            herbId = selectEl.value;
                        }
                    }
                    
                    if (!qtyInput || !herbId) continue;
                    const qVal = parseFloat(qtyInput.value);
                    if (isNaN(qVal) || qVal <= 0) continue;
                    
                    let inv = { quantity: 0, threshold: 0, unit: 'g', disabled: false };
                    try {
                        if (typeof getHerbInventory === 'function') {
                            inv = getHerbInventory(herbId);
                        }
                    } catch (_errInv) {
                        
                    }
                    const unitVal = (row.dataset && row.dataset.herbUnit) ? row.dataset.herbUnit : (inv && inv.unit ? inv.unit : 'g');
                    const factor = UNIT_FACTOR_MAP[unitVal] || 1;
                    const addBase = qVal * factor;
                    const existingBaseQty = typeof inv.quantity === 'number' ? inv.quantity : 0;
                    const existingThreshold = typeof inv.threshold === 'number' ? inv.threshold : 0;
                    const existingUnit = inv.unit || 'g';
                    const existingDisabled = !!inv.disabled;
                    const newBaseQty = existingBaseQty + addBase;
                    
                    if (typeof setHerbInventory === 'function') {
                        await setHerbInventory(herbId, newBaseQty, existingThreshold, existingUnit, existingDisabled);
                    }
                    
                    try {
                        if (typeof herbInventory !== 'undefined') {
                            herbInventory[String(herbId)] = {
                                quantity: newBaseQty,
                                threshold: existingThreshold,
                                unit: existingUnit,
                                disabled: existingDisabled
                            };
                        }
                    } catch (_e) {
                        
                    }
                    historyEntries.push({ itemId: String(herbId), quantity: qVal, unit: unitVal });
                }
                try { await recordInventoryHistory('in', historyEntries, { mode: selectedInventoryMode }); } catch (_e) {}
                
                showToast((typeof window.t === 'function') ? window.t('庫存已更新！') : '庫存已更新！', 'success');
                
                hideBatchInventoryModal();
                
                try {
                    if (typeof displayHerbLibrary === 'function') {
                        displayHerbLibrary();
                    }
                    if (typeof updatePrescriptionDisplay === 'function') {
                        updatePrescriptionDisplay();
                    }
                } catch (_e) {
                    
                }
            } catch (err) {
                console.error('批量入庫錯誤:', err);
                showToast((typeof window.t === 'function') ? window.t('批量入庫失敗！') : '批量入庫失敗！', 'error');
            } finally {
                
                try {
                    if (typeof originalInventoryMode !== 'undefined') {
                        currentInventoryMode = originalInventoryMode;
                    }
                } catch (_e) {
                    
                }
                
                try {
                    if (typeof initHerbInventory === 'function') {
                        await initHerbInventory(true);
                    }
                } catch (_initErr) {
                    
                }
                clearButtonLoading(saveBtn);
            }
        }

async function recordInventoryHistory(type, entries, extra = {}) {
            await waitForFirebaseDb();
            const arr = Array.isArray(entries) ? entries : [];
            if (type === 'out' && extra && extra.consultationId) {
                if (extra.replaceExistingForConsultation) {
                    try {
                        const clinicId = localStorage.getItem('currentClinicId') || currentClinicId || 'local-default';
                        const baseRef = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/inventoryHistory/out');
                        let snap = null;
                        try { snap = await window.firebase.get(baseRef); } catch (_e) { snap = null; }
                        const obj = snap && snap.exists() ? snap.val() || {} : {};
                        for (const k in obj) {
                            const rec = obj[k] || {};
                            if (String(rec.consultationId || '') === String(extra.consultationId)) {
                                const child = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/inventoryHistory/out/' + String(k));
                                await window.firebase.set(child, null);
                            }
                        }
                    } catch (_e) {}
                } else if (arr.length) {
                    try {
                        const clinicId = localStorage.getItem('currentClinicId') || currentClinicId || 'local-default';
                        const baseRef = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/inventoryHistory/out');
                        const q = window.firebase.query(baseRef, window.firebase.orderByChild('timestamp'), window.firebase.limitToLast(50));
                        let snap = null;
                        try { snap = await window.firebase.get(q); } catch (_e) { snap = null; }
                        const obj = snap && snap.exists() ? snap.val() || {} : {};
                        const norm = (list) => list.slice().map(e => ({ itemId: String(e.itemId), quantity: Number(e.quantity) || 0, unit: e.unit || 'g' }))
                            .sort((a,b) => a.itemId.localeCompare(b.itemId))
                            .map(e => e.itemId + ':' + e.quantity + ':' + e.unit).join('|');
                        const target = norm(arr);
                        const keys = Object.keys(obj);
                        let duplicated = false;
                        for (const k of keys) {
                            const rec = obj[k] || {};
                            if (String(rec.consultationId || '') !== String(extra.consultationId)) continue;
                            const recEntries = Array.isArray(rec.entries) ? rec.entries : [];
                            if (norm(recEntries) === target) { duplicated = true; break; }
                        }
                        if (duplicated) return;
                    } catch (_e) {}
                }
            }
            const ts = Date.now();
            const clinicId = localStorage.getItem('currentClinicId') || currentClinicId || 'local-default';
            const ref = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/inventoryHistory/' + String(type) + '/' + String(ts));
            const data = { timestamp: ts, entries: arr };
            for (const k in extra) { data[k] = extra[k]; }
            await window.firebase.set(ref, data);
        }

        async function getPreviousInventoryLogFromHistory(consultationId) {
            if (!consultationId) return null;
            await waitForFirebaseDb();
            try {
                const clinicId = localStorage.getItem('currentClinicId') || currentClinicId || 'local-default';
                const baseRef = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/inventoryHistory/out');
                const q = window.firebase.query(baseRef, window.firebase.orderByChild('consultationId'), window.firebase.equalTo(String(consultationId)));
                const snap = await window.firebase.get(q);
                if (!snap || !snap.exists()) return null;
                const obj = snap.val() || {};
                let latest = null;
                for (const k in obj) {
                    const rec = obj[k] || {};
                    if (!Array.isArray(rec.entries)) continue;
                    if (!latest || Number(rec.timestamp || 0) > Number(latest.timestamp || 0)) {
                        latest = rec;
                    }
                }
                if (!latest) return null;
                const log = {};
                const list = Array.isArray(latest.entries) ? latest.entries : [];
                for (const e of list) {
                    const id = String(e.itemId);
                    const qty = Number(e.quantity) || 0;
                    log[id] = (log[id] || 0) + qty;
                }
                return log;
            } catch (_e) {
                return null;
            }
        }

        function openInventoryHistoryModal() {
            const modal = document.getElementById('inventoryHistoryModal');
            if (!modal) return;
            modal.classList.remove('hidden');
            switchInventoryHistoryTab('in');
            loadInventoryHistory('in');
            loadInventoryHistory('out');
        }

        function hideInventoryHistoryModal() {
            const modal = document.getElementById('inventoryHistoryModal');
            if (!modal) return;
            modal.classList.add('hidden');
        }

        function switchInventoryHistoryTab(tab) {
            const inEl = document.getElementById('inventoryHistoryIn');
            const outEl = document.getElementById('inventoryHistoryOut');
            const tabIn = document.getElementById('historyTabIn');
            const tabOut = document.getElementById('historyTabOut');
            if (!inEl || !outEl || !tabIn || !tabOut) return;
            if (tab === 'in') {
                inEl.classList.remove('hidden');
                outEl.classList.add('hidden');
                tabIn.classList.remove('bg-gray-100', 'text-gray-700');
                tabIn.classList.add('bg-blue-100', 'text-blue-800');
                tabOut.classList.remove('bg-blue-100', 'text-blue-800');
                tabOut.classList.add('bg-gray-100', 'text-gray-700');
            } else {
                outEl.classList.remove('hidden');
                inEl.classList.add('hidden');
                tabOut.classList.remove('bg-gray-100', 'text-gray-700');
                tabOut.classList.add('bg-blue-100', 'text-blue-800');
                tabIn.classList.remove('bg-blue-100', 'text-blue-800');
                tabIn.classList.add('bg-gray-100', 'text-gray-700');
            }
        }

        function getHerbNameById(id) {
            try {
                if (Array.isArray(herbLibrary)) {
                    const found = herbLibrary.find(h => String(h.id) === String(id));
                    if (found) {
                        try {
                            const lang = (localStorage.getItem('lang') || 'zh').toLowerCase();
                            if (lang.startsWith('en') && found.englishName) return found.englishName;
                        } catch (_eLang) {}
                        if (found.name) return found.name;
                    }
                }
            } catch (_e) {}
            return String(id);
        }

        async function getMedicalRecordNumberByConsultationId(id) {
            try {
                if (window.firebaseDataManager && typeof window.firebaseDataManager.getConsultationById === 'function') {
                    const res = await window.firebaseDataManager.getConsultationById(String(id));
                    if (res && res.success && res.data) {
                        return res.data.medicalRecordNumber || res.data.id;
                    }
                }
            } catch (_e) {}
            return String(id);
        }

        async function isConsultationMissing(id) {
            try {
                if (window.firebaseDataManager && typeof window.firebaseDataManager.getConsultationById === 'function') {
                    const res = await window.firebaseDataManager.getConsultationById(String(id));
                    return !(res && res.success && res.data);
                }
            } catch (_e) {}
            return true;
        }

        async function loadInventoryHistory(type) {
            await waitForFirebaseDb();
            try {
                if (typeof initHerbLibrary === 'function' && !herbLibraryLoaded) {
                    await initHerbLibrary();
                }
            } catch (_e) {}
            const containerId = type === 'in' ? 'inventoryHistoryIn' : 'inventoryHistoryOut';
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            try {
                const clinicId = localStorage.getItem('currentClinicId') || currentClinicId || 'local-default';
                const baseRef = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/inventoryHistory/' + String(type));
                const q = window.firebase.query(baseRef, window.firebase.orderByChild('timestamp'), window.firebase.limitToLast(20));
                let snap = null;
                try { snap = await window.firebase.get(q); } catch (_qe) { snap = null; }
                let obj = snap && snap.exists() ? snap.val() || {} : {};
                if (!obj || Object.keys(obj).length === 0) {
                    try {
                        const snap2 = await window.firebase.get(baseRef);
                        obj = snap2 && snap2.exists() ? snap2.val() || {} : {};
                    } catch (_fe) {}
                }
                const keys = Object.keys(obj).sort((a, b) => Number(b) - Number(a)).slice(0, 20);
                for (const k of keys) {
                    const rec = obj[k] || {};
                    const ts = Number(rec.timestamp || k);
                    const timeText = new Date(ts).toLocaleString();
                    const div = document.createElement('div');
                    div.className = 'border rounded px-3 py-2';
                    const items = Array.isArray(rec.entries) ? rec.entries : [];
                    const lines = items.map(e => {
                        const name = getHerbNameById(e.itemId);
                        const qty = typeof e.quantity === 'number' ? e.quantity : 0;
                        const unit = e.unit || 'g';
                        let modeTag = '';
                        if (e.mode === 'slice') modeTag = '（' + (typeof window.t === 'function' ? window.t('飲片') : '飲片') + '）';
                        else if (e.mode === 'granule') modeTag = '（' + (typeof window.t === 'function' ? window.t('顆粒') : '顆粒') + '）';
                        return name + '：' + qty + ((typeof window.t === 'function') ? window.t(unit === 'g' ? '克' : unit) : unit) + (modeTag ? modeTag : '');
                    });
                    const extra = [];
                    if (type === 'in' && rec.mode) { extra.push((typeof window.t === 'function' ? window.t('類型：') : '類型：') + rec.mode); }
                    if (type === 'out' && rec.consultationId) {
                        const mrn = await getMedicalRecordNumberByConsultationId(rec.consultationId);
                        extra.push((typeof window.t === 'function' ? window.t('病歷編號：') : '病歷編號：') + window.escapeHtml(mrn));
                        const modes = new Set(items.map(e => e && e.mode).filter(m => m === 'slice' || m === 'granule'));
                        if (modes.size === 1) {
                            const m = Array.from(modes)[0];
                            const posLabel = (typeof window.t === 'function' ? window.t('位置：') : '位置：');
                            const posVal = (typeof window.t === 'function' ? window.t(m === 'slice' ? '飲片' : '顆粒沖劑') : (m === 'slice' ? '飲片' : '顆粒沖劑'));
                            extra.push(posLabel + posVal);
                        } else if (modes.size > 1) {
                            const posLabel = (typeof window.t === 'function' ? window.t('位置：') : '位置：');
                            const posVal = (typeof window.t === 'function' ? window.t('混合') : '混合');
                            extra.push(posLabel + posVal);
                        }
                        const missing = await isConsultationMissing(rec.consultationId);
                        if (missing) { extra.push('<span class="text-red-600">' + ((typeof window.t === 'function') ? window.t('已退回') : '已退回') + '</span>'); }
                    }
                    div.innerHTML = '<div class="text-sm text-gray-600">' + timeText + (extra.length ? '（' + extra.join('，') + '）' : '') + '</div>' +
                        '<div class="mt-1 text-gray-800">' + (lines.length ? lines.join('；') : ((typeof window.t === 'function') ? window.t('無項目') : '無項目')) + '</div>';
                    container.appendChild(div);
                }
                if (!container.children.length) {
                    const empty = document.createElement('div');
                    empty.className = 'text-gray-500 px-3 py-2';
                    empty.textContent = (typeof window.t === 'function') ? window.t('暫無記錄') : '暫無記錄';
                    container.appendChild(empty);
                }
            } catch (_e) {}
            if (type === 'out') {
                try {
                    const logsRef = window.firebase.ref(window.firebase.rtdb, 'inventoryLogs');
                    const q2 = window.firebase.query(logsRef, window.firebase.orderByKey(), window.firebase.limitToLast(20));
                    let logSnap = null;
                    try { logSnap = await window.firebase.get(q2); } catch (_qe2) { logSnap = null; }
                    let logObj = logSnap && logSnap.exists() ? logSnap.val() || {} : {};
                    if (!logObj || Object.keys(logObj).length === 0) {
                        try {
                            const snapAll = await window.firebase.get(logsRef);
                            logObj = snapAll && snapAll.exists() ? snapAll.val() || {} : {};
                        } catch (_fe2) {}
                    }
                    const ids = Object.keys(logObj).slice(-20).reverse();
                    for (const cid of ids) {
                        const itemsObj = logObj[cid] || {};
                        const div = document.createElement('div');
                        div.className = 'border rounded px-3 py-2';
                        const lines = Object.keys(itemsObj).map(itemId => {
                            const name = getHerbNameById(itemId);
                            const qty = typeof itemsObj[itemId] === 'number' ? itemsObj[itemId] : 0;
                            return name + '：' + qty + 'g';
                        });
                        const mrn = await getMedicalRecordNumberByConsultationId(cid);
                        const missing = await isConsultationMissing(cid);
                        const extraTag = missing ? '，<span class="text-red-600">已退回</span>' : '';
                        let locText = '';
                        try {
                            const clinicId = localStorage.getItem('currentClinicId') || currentClinicId || 'local-default';
                            const baseRef3 = window.firebase.ref(window.firebase.rtdb, 'clinics/' + String(clinicId) + '/inventoryHistory/out');
                            const q3 = window.firebase.query(baseRef3, window.firebase.orderByChild('consultationId'), window.firebase.equalTo(String(cid)));
                            let snap3 = null;
                            try { snap3 = await window.firebase.get(q3); } catch (_e3) { snap3 = null; }
                            if (snap3 && snap3.exists()) {
                                const obj3 = snap3.val() || {};
                                let latestRec = null;
                                for (const kk in obj3) {
                                    const rr = obj3[kk] || {};
                                    if (!Array.isArray(rr.entries)) continue;
                                    if (!latestRec || Number(rr.timestamp || 0) > Number(latestRec.timestamp || 0)) latestRec = rr;
                                }
                                if (latestRec && Array.isArray(latestRec.entries)) {
                                    const modes = new Set(latestRec.entries.map(e => e && e.mode).filter(m => m === 'slice' || m === 'granule'));
                                    if (modes.size === 1) {
                                        const m = Array.from(modes)[0];
                                        const posLabel = (typeof window.t === 'function' ? window.t('位置：') : '位置：');
                                        const posVal = (typeof window.t === 'function' ? window.t(m === 'slice' ? '飲片' : '顆粒沖劑') : (m === 'slice' ? '飲片' : '顆粒沖劑'));
                                        locText = '，' + posLabel + posVal;
                                } else if (modes.size > 1) {
                                    const posLabel = (typeof window.t === 'function' ? window.t('位置：') : '位置：');
                                    const posVal = (typeof window.t === 'function' ? window.t('混合') : '混合');
                                    locText = '，' + posLabel + posVal;
                                }
                            }
                            }
                        } catch (_eLoc) {}
                        div.innerHTML = '<div class="text-sm text-gray-600">' + ((typeof window.t === 'function') ? window.t('舊出庫記錄') : '舊出庫記錄') + '（' + ((typeof window.t === 'function') ? window.t('病歷編號：') : '病歷編號：') + window.escapeHtml(mrn) + locText + extraTag + '）</div>' +
                            '<div class="mt-1 text-gray-800">' + (lines.length ? lines.join('；') : ((typeof window.t === 'function') ? window.t('無項目') : '無項目')) + '</div>';
                        container.appendChild(div);
                    }
                    if (!container.children.length) {
                        const empty2 = document.createElement('div');
                        empty2.className = 'text-gray-500 px-3 py-2';
                        empty2.textContent = (typeof window.t === 'function') ? window.t('暫無記錄') : '暫無記錄';
                        container.appendChild(empty2);
                    }
                } catch (_e2) {}
            }
        }
        
        let acupointLibrary = [];
        
        
        
        let currentAcupointFilter = 'all';
        
        async function initHerbLibrary(forceRefresh = false) {
            
            if (herbLibraryLoaded && !forceRefresh) {
                return;
            }
            
            try {
                const herbData = await fetchJsonWithFallback('herbLibrary.json');
                const formulaData = await fetchJsonWithFallback('herbformulaLibrary.json');
                const herbList = Array.isArray(herbData.herbLibrary) ? herbData.herbLibrary : [];
                const formulaList = Array.isArray(formulaData.herbLibrary) ? formulaData.herbLibrary : [];
                herbLibrary = [...herbList, ...formulaList];
                herbLibraryLoaded = true;
            } catch (error) {
                console.error('讀取本地 JSON 中藥庫資料失敗:', error);
            }
        }

        
        

        
        let billingItems = [];
        let billingItemsGlobalUnsubscribe = null;
        let billingItemsClinicUnsubscribe = null;
        let billingItemsRealtimeClinicId = null;
        let billingItemsGlobalMap = new Map();
        let billingItemsClinicMap = new Map();
        
        function getClinicScopedStorageKey(base) {
            try {
                const lsCid = localStorage.getItem('currentClinicId');
                const memCid = (typeof currentClinicId !== 'undefined' ? currentClinicId : null);
                let cid = lsCid || memCid || 'local-default';
                if (cid === 'local-default' && Array.isArray(clinicsList) && clinicsList.length) {
                    const firstRealClinic = clinicsList.find(c => c && c.id && c.id !== 'local-default') || clinicsList[0];
                    cid = firstRealClinic.id || cid;
                }
                return `${base}_${cid}`;
            } catch (_e) {
                return `${base}_local-default`;
            }
        }
/* Phase 5 ESM: billing items realtime sync (4 fns) moved to js/domains/billing/items.js; window facades in js/app.js; original block removed */
        async function initTemplateLibrary(forceRefresh = false) {
            
            if (templateLibraryLoaded && !forceRefresh) {
                if (typeof renderPrescriptionTemplates === 'function') {
                    try { renderPrescriptionTemplates(); } catch (_e) {}
                }
                if (typeof renderDiagnosisTemplates === 'function') {
                    try { renderDiagnosisTemplates(); } catch (_e) {}
                }
                if (typeof refreshTemplateCategoryFilters === 'function') {
                    try { refreshTemplateCategoryFilters(); } catch (_e) {}
                }
                return;
            }
            
            try {
                const presData = await fetchJsonWithFallback('prescriptionTemplates.json');
                const diagData = await fetchJsonWithFallback('diagnosisTemplates.json');
                prescriptionTemplates = Array.isArray(presData.prescriptionTemplates) ? presData.prescriptionTemplates : [];
                diagnosisTemplates = Array.isArray(diagData.diagnosisTemplates) ? diagData.diagnosisTemplates : [];
                templateLibraryLoaded = true;
            } catch (error) {
                console.error('讀取本地模板資料失敗:', error);
            }
            
            try {
                if (typeof renderPrescriptionTemplates === 'function') {
                    try { renderPrescriptionTemplates(); } catch (_e) {}
                }
                if (typeof renderDiagnosisTemplates === 'function') {
                    try { renderDiagnosisTemplates(); } catch (_e) {}
                }
                
                
                if (typeof refreshTemplateCategoryFilters === 'function') {
                    try { refreshTemplateCategoryFilters(); } catch (_e) {}
                }
            } catch (err) {
                console.error('渲染模板庫內容失敗:', err);
            }
        }

        
        

        
        let users = [];



function loadUsersFromLocalStorage() {
    try {
        const stored = localStorage.getItem('users');
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
        return [];
    }
}

function normalizeUserForClient(user = {}) {
    const { personalSettings, ...rest } = user || {};
    return {
        ...rest,
        createdAt: user.createdAt
          ? (user.createdAt.seconds
            ? new Date(user.createdAt.seconds * 1000).toISOString()
            : user.createdAt)
          : new Date().toISOString(),
        updatedAt: user.updatedAt
          ? (user.updatedAt.seconds
            ? new Date(user.updatedAt.seconds * 1000).toISOString()
            : user.updatedAt)
          : new Date().toISOString(),
        lastLogin: user.lastLogin
          ? (user.lastLogin.seconds
            ? new Date(user.lastLogin.seconds * 1000).toISOString()
            : user.lastLogin)
          : null
    };
}

async function waitForFirebase() {
  while (!window.firebase) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function waitForFirebaseDb() {
  await waitForFirebase();
  while (!window.firebase.db) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function waitForFirebaseDataManager(timeoutMs = 10000) {
    await waitForFirebase();
    const start = Date.now();
    while (!(window.firebaseDataManager && window.firebaseDataManager.isReady)) {
        if (Date.now() - start > timeoutMs) return false;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return true;
}

async function waitForFirebaseConnectionStatus(timeoutMs = 2000) {
    const start = Date.now();
    while (!window.firebaseStatusInitialized) {
        if (Date.now() - start > timeoutMs) break;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

/* Phase 3 ESM 遷移：授權索引／admin claims API／Auth 帳號生命週期已移至 js/domains/auth/claims.js，window facade 見 js/app.js；原 system.js 段落已刪除 */


function generateSearchKeywords(patient = {}) {
    const keywords = new Set();
    
    if (patient.name) {
        const nameLower = String(patient.name).toLowerCase();
        for (let start = 0; start < nameLower.length; start++) {
            for (let end = start + 1; end <= nameLower.length; end++) {
                const sub = nameLower.slice(start, end).trim();
                if (sub) {
                    keywords.add(sub);
                }
            }
        }
    }
    
    
    if (patient.phone) {
        const phone = String(patient.phone).replace(/\s+/g, '').toLowerCase();
        if (phone) {
            
            keywords.add(phone);
            
            const minLen = 3;
            const maxLen = phone.length;
            for (let len = minLen; len <= maxLen; len++) {
                for (let i = 0; i <= phone.length - len; i++) {
                    const fragment = phone.slice(i, i + len);
                    if (fragment) keywords.add(fragment);
                }
            }
        }
    }
    
    if (patient.idCard) {
        const idLower = String(patient.idCard).toLowerCase();
        if (idLower) {
            keywords.add(idLower);
            if (idLower.length >= 4) {
                keywords.add(idLower.slice(-4));
            }
        }
    }
    
    
    if (patient.patientNumber) {
        const numLower = String(patient.patientNumber).replace(/\s+/g, '').toLowerCase();
        if (numLower) {
            keywords.add(numLower);
            const minLen = 3;
            const maxLen = numLower.length;
            for (let len = minLen; len <= maxLen; len++) {
                for (let i = 0; i <= numLower.length - len; i++) {
                    const fragment = numLower.slice(i, i + len);
                    if (fragment) keywords.add(fragment);
                }
            }
            
            if (numLower.length >= 4) {
                keywords.add(numLower.slice(-4));
            }
        }
    }
    return Array.from(keywords);
}

/**
 * 為診症記錄生成搜尋關鍵字。
 * 覆蓋：病歷編號、病人 ID、病人編號、病人姓名、醫師（字串或物件）、主訴/診斷。
 * 所有欄位轉小寫，編號/姓名做子字串展開，長文字只保留完整字。
 *
 * @param {object} consultation 診症記錄物件
 * @returns {string[]} 關鍵字陣列
 */
function generateConsultationSearchKeywords(consultation = {}) {
    const keywords = new Set();

    const addSubstrings = (value, opts = {}) => {
        if (!value) return;
        const { minLen = 2, maxLen = 8, trim = true, dedupePhone = false } = opts;
        let s = trim ? String(value).replace(/\s+/g, '').toLowerCase() : String(value).toLowerCase();
        if (!s) return;
        keywords.add(s);
        if (s.length >= 4 && dedupePhone) keywords.add(s.slice(-4));
        const maxStart = Math.min(s.length, maxLen);
        for (let start = 0; start < s.length; start++) {
            for (let end = start + minLen; end <= Math.min(start + maxLen, s.length); end++) {
                const sub = s.slice(start, end);
                if (sub) keywords.add(sub);
            }
        }
    };

    const addPlain = (value) => {
        if (value) {
            const s = String(value).toLowerCase().trim();
            if (s) keywords.add(s);
        }
    };

    // ① 病歷編號（最重要）
    if (consultation.medicalRecordNumber) {
        addSubstrings(consultation.medicalRecordNumber, { minLen: 2, maxLen: 20 });
    }

    // ② 病人 ID（UUID，只加完整值，不做子字串）
    addPlain(consultation.patientId);

    // ③ 病人編號
    if (consultation.patientNumber) {
        addSubstrings(consultation.patientNumber, { minLen: 3, maxLen: 12, dedupePhone: true });
    }

    // ④ 病人姓名（多種可能欄位）
    const patientNameFields = [
        consultation.patientName,
        consultation.patient && consultation.patient.name,
    ].filter(Boolean);
    for (const name of patientNameFields) {
        addSubstrings(name, { minLen: 1, maxLen: 20 });
    }

    // ⑤ 醫師（可能是字串 username，或物件有 username/displayName/fullName/name/email）
    const doctorRaw = consultation.doctor;
    if (doctorRaw) {
        if (typeof doctorRaw === 'string') {
            addSubstrings(doctorRaw, { minLen: 2, maxLen: 20 });
        } else if (typeof doctorRaw === 'object') {
            for (const f of ['username', 'displayName', 'fullName', 'name', 'email']) {
                if (doctorRaw[f]) addSubstrings(doctorRaw[f], { minLen: 2, maxLen: 20 });
            }
        }
    }

    // ⑥ 主訴 / 診斷（長文字，只保留完整字，不做子字串以免爆炸）
    addPlain(consultation.chiefComplaint);
    addPlain(consultation.diagnosis);

    return Array.from(keywords);
}

/**
 * 一次性歷史資料回填：掃描所有 consultations，為缺少 searchKeywords 的舊文檔補寫。
 * 執行方式：在瀏覽器 Console 執行 `await window.backfillConsultationSearchKeywords()`
 * 支援中斷後續跑：傳入上次最後處理的 doc id：
 *   await window.backfillConsultationSearchKeywords('lastDocIdFromPrevRun')
 *
 * 全量掃描完成後會自動寫入 systemMeta/searchKeywordsBackfill 完成旗標
 * （須診所管理身份），旗標寫入後所有客戶端最遲 1 小時內關閉病歷搜尋的
 * legacy fallback；若以非管理員執行導致寫入失敗，請管理員補跑
 * `await window.markSearchKeywordsBackfillComplete()`。
 * 注意：中斷續跑若未掃到最後一頁，不會寫入完成旗標。
 */
window.backfillConsultationSearchKeywords = async function(startAfterDocId = null) {
    await waitForFirebaseDb();
    const PAGE_SIZE = 500;
    const col = window.firebase.collection(window.firebase.db, 'consultations');

    let cursorQuery = window.firebase.firestoreQuery(col, window.firebase.limit(PAGE_SIZE));
    if (startAfterDocId) {
        const startDoc = await window.firebase.getDoc(
            window.firebase.doc(window.firebase.db, 'consultations', startAfterDocId)
        );
        if (startDoc.exists()) {
            cursorQuery = window.firebase.firestoreQuery(
                col,
                window.firebase.startAfter(startDoc),
                window.firebase.limit(PAGE_SIZE)
            );
        } else {
            console.warn('[backfill] startAfterDocId 不存在，從頭開始');
        }
    }

    let totalScanned = 0;
    let totalBackfilled = 0;
    let lastProcessedId = null;

    while (true) {
        const snap = await window.firebase.getDocs(cursorQuery);
        const docs = snap.docs;
        if (docs.length === 0) break;

        for (const doc of docs) {
            lastProcessedId = doc.id;
            totalScanned++;
            const data = doc.data();
            if (!Array.isArray(data.searchKeywords) || data.searchKeywords.length === 0) {
                const newKeywords = generateConsultationSearchKeywords(data);
                if (newKeywords.length > 0) {
                    await window.firebase.updateDoc(doc.ref, { searchKeywords: newKeywords });
                    totalBackfilled++;
                }
            }
        }

        console.log(`[backfill] 掃描 ${totalScanned}，回填 ${totalBackfilled}，最後處理 ${lastProcessedId}`);

        if (docs.length < PAGE_SIZE) break;

        // 下一頁
        cursorQuery = window.firebase.firestoreQuery(
            col,
            window.firebase.startAfter(docs[docs.length - 1]),
            window.firebase.limit(PAGE_SIZE)
        );
    }

    // 掃到最後一頁＝全量完成（中斷續跑例外：傳入的斷點之後若從一開始就
    // 小於一頁，仍代表已掃完剩餘全部，視同完成）。寫入完成旗標關閉 fallback。
    let markerWritten = false;
    let markerError = '';
    try {
        await writeSearchKeywordsBackfillMarker({ totalScanned, totalBackfilled });
        markerWritten = true;
        console.log('[backfill] 完成旗標已寫入 systemMeta/searchKeywordsBackfill，本機 legacy fallback 已關閉；其他客戶端最遲 1 小時內生效（重新整理可立即檢查）');
    } catch (e) {
        markerError = (e && e.message) || String(e);
        console.warn('[backfill] 完成旗標寫入失敗（需診所管理身份，且雲端資料庫存取規則需已部署 systemMeta 規則）：', markerError, '。請管理員執行 await window.markSearchKeywordsBackfillComplete() 補寫');
    }

    const result = { totalScanned, totalBackfilled, lastProcessedId, markerWritten, markerError };
    console.log('[backfill] 完成', result);
    return result;
};

/**
 * 管理員手動標記 searchKeywords 回填完成（關閉 legacy fallback）。
 * 用於回填時旗標寫入失敗，或已確定全部文件皆有 searchKeywords 的情境。
 */
window.markSearchKeywordsBackfillComplete = async function(stats = {}) {
    await waitForFirebaseDb();
    await writeSearchKeywordsBackfillMarker(stats || {});
    console.log('[backfill] 完成旗標已手動寫入，本機 legacy fallback 已關閉');
    return { ok: true };
};

/**
 * 管理員手動清除完成旗標（重新開啟 legacy fallback）。
 * 用於發現回填遺漏或 searchKeywords 詞條規則需要重跑時的逃生口。
 * 注意：其他客戶端正面快取最久 24h；本機立即生效。
 */
window.clearSearchKeywordsBackfillMarker = async function() {
    await waitForFirebaseDb();
    await window.firebase.deleteDoc(
        window.firebase.doc(
            window.firebase.db,
            SEARCH_KEYWORDS_BACKFILL_COLLECTION,
            SEARCH_KEYWORDS_BACKFILL_DOC
        )
    );
    clearSearchKeywordsBackfillCache();
    console.log('[backfill] 完成旗標已清除，本機 legacy fallback 已重新開啟');
    return { ok: true };
};

/**
 * 全量重算所有病人的診症聚合欄位（consultationCount, latestConsultationAt, latestFollowUpDate）。
 * 執行方式：在瀏覽器 Console 執行 `await window.recomputeAllPatientAggregates()`
 * 這會讀取所有病人 + 每個病人的診症計數，耗時較久，僅在資料不同步時使用。
 */
window.recomputeAllPatientAggregates = async function() {
    await waitForFirebaseDb();
    const dm = window.firebaseDataManager;
    if (!dm || !dm.getPatients) { console.error('雲端數據管理器未就緒'); return; }

    const patientsRes = await dm.getPatients(true);
    const patients = (patientsRes && patientsRes.success && patientsRes.data) || [];
    let done = 0;
    for (const p of patients) {
        await dm.recomputePatientConsultationAggregate(p.id).catch(() => {});
        done++;
        if (done % 20 === 0) console.log(`[recompute] ${done}/${patients.length}`);
    }
    console.log(`[recompute] 完成，共 ${done} 位病人`);
    return { total: done };
};


// 注意：waitForFirebaseDataManager 唯一定義在前方（含逾時保護，預設 10 秒），
// 此處曾有一個無逾時的重複宣告，於同層級經典腳本中覆蓋前者，導致傳入的
// 8000ms 逾時完全失效、初始化失敗時登入永久卡住，已移除。


async function safeGetPatients(_forceRefresh = false) {
  try {
    
    if (!window.firebaseDataManager || typeof window.firebaseDataManager.getPatients !== 'function') {
      const startTime = Date.now();
      const maxWait = 3000; 
      
      while ((!window.firebaseDataManager || typeof window.firebaseDataManager.getPatients !== 'function') && (Date.now() - startTime < maxWait)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!window.firebaseDataManager || typeof window.firebaseDataManager.getPatients !== 'function') {
        return { success: false, data: [] };
      }
    }
    
    if (typeof waitForFirebaseDataManager === 'function') {
      try {
        await waitForFirebaseDataManager();
      } catch (_e) {
        
      }
    }
    
    if (!window.firebaseDataManager || typeof window.firebaseDataManager.getPatients !== 'function') {
      return { success: false, data: [] };
    }
    
    const result = await window.firebaseDataManager.getPatients(!!_forceRefresh);
    
    if (result && typeof result.success === 'boolean' && Array.isArray(result.data)) {
      return result;
    }
    return { success: false, data: [] };
  } catch (err) {
    console.error('safeGetPatients 發生錯誤:', err);
    return { success: false, data: [] };
  }
}


async function getLatestAppointmentById(appointmentId) {
    
    try {
        await waitForFirebaseDataManager();
    } catch (_e) {
        
    }

    const idStr = String(appointmentId);
    let found = null;

    
    if (Array.isArray(appointments) && appointments.length > 0) {
        found = appointments.find(apt => apt && String(apt.id) === idStr) || null;
    }

    
    if (!found) {
        try {
            const stored = localStorage.getItem('appointments');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    
                    if (!Array.isArray(appointments) || appointments.length === 0) {
                        appointments = parsed.map(item => ({ ...item }));
                    }
                    found = parsed.find(item => item && String(item.id) === idStr) || null;
                }
            }
        } catch (e) {
            console.error('getLatestAppointmentById: 讀取本地掛號快取失敗:', e);
        }
    }

    
    if (!found) {
        try {
            const result = await window.firebaseDataManager.getAppointment(String(appointmentId));
            if (result && result.success && result.data) {
                found = result.data;
                if (!Array.isArray(appointments)) appointments = [];
                const index = appointments.findIndex(apt => apt && String(apt.id) === idStr);
                if (index >= 0) {
                    appointments[index] = { ...found };
                } else {
                    appointments.push({ ...found });
                }
                try { localStorage.setItem('appointments', JSON.stringify(appointments)); } catch (_storageErr) {}
            }
        } catch (_err) {}
    }

    
    if (!found) {
        try {
            const listRes = await window.firebaseDataManager.getAppointments();
            if (listRes && listRes.success && Array.isArray(listRes.data)) {
                const fromList = listRes.data.find(item => item && String(item.id) === idStr) || null;
                if (fromList) {
                    found = fromList;
                    appointments = listRes.data.map(item => ({ ...item }));
                    try { localStorage.setItem('appointments', JSON.stringify(appointments)); } catch (_e) {}
                }
            }
        } catch (_e) {}
    }

    return found || null;
}


function parseJsonWithComments(text) {
    try {
        return JSON.parse(text);
    } catch (_e) {
        let t = text;
        t = t.replace(/^\uFEFF/, '');
        t = t.replace(/\/\*[\s\S]*?\*\//g, '');
        t = t.replace(/^\s*\/\/.*$/gm, '');
        t = t.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(t);
    }
}
async function fetchJsonWithFallback(fileName) {
    const host = window.location.hostname;
    const isGithubPages = host && host.endsWith('github.io');
    
    if (!isGithubPages) {
        try {
            const relativeResponse = await fetch(`data/${fileName}`, { cache: 'reload' });
            if (relativeResponse.ok) {
                const txt = await relativeResponse.text();
                return parseJsonWithComments(txt);
            }
            
            throw new Error(`Relative path HTTP error ${relativeResponse.status}`);
        } catch (relativeErr) {
            
        }
    }
    
    if (host && host.endsWith('github.io')) {
        try {
            const user = host.split('.')[0];
            const pathParts = window.location.pathname.split('/');
            const repo = pathParts.length > 1 ? pathParts[1] : '';
            if (user && repo) {
                
                const branches = ['main', 'master'];
                for (const branch of branches) {
                    
                    const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/data/${fileName}`;
                    try {
                        const rawResponse = await fetch(rawUrl, { cache: 'reload' });
                        if (rawResponse.ok) {
                            const txt = await rawResponse.text();
                            return parseJsonWithComments(txt);
                        }
                    } catch (fetchErr) {
                        
                    }
                }
            }
        } catch (fallbackErr) {
            console.error(`回退至 GitHub raw 讀取 ${fileName} 失敗:`, fallbackErr);
            
        }
    }
    
    throw new Error(`無法取得 ${fileName} 資料`);
}

    


/* Phase 3 ESM 遷移：主登入／登入後同步／登出清理／本機快取清除已移至 js/domains/auth/session.js，window facade 見 js/app.js；原 system.js 段落已刪除 */

        
        function generateSidebarMenu() {
            const menuContainer = document.getElementById('sidebarMenu');
            menuContainer.innerHTML = '';

            // 重新套用版本功能隱藏（如簡單版的會員／附件相關元素）
            try { applyVersionFeatureVisibility(); } catch (_eVersion) {}

            
            const menuItems = {
                patientManagement: { title: '病人資料管理', icon: 'users', description: '新增、查看、管理病人資料' },
                consultationSystem: { title: '診症系統', icon: 'stethoscope', description: '記錄症狀、診斷、開立處方' },
                herbLibrary: { title: '中藥庫', icon: 'leaf', description: '查看中藥材及方劑資料' },
                
                acupointLibrary: { title: '穴位庫', icon: 'map-pin', description: '查看穴位資料' },
                
                scheduleManagement: { title: '醫療排班', icon: 'calendar-days', description: '排班與行事曆查看' },
                
                medicalRecordManagement: { title: '病歷管理', icon: 'clipboard-list', description: '查看及搜尋病歷' },
                billingManagement: { title: '收費項目管理', icon: 'wallet', description: '管理診療費用及收費項目' },
                walletManagement: { title: '會員儲值', icon: 'credit-card', description: '充值、扣款與會員帳戶管理' },

                userManagement: { title: '診所用戶管理', icon: 'user', description: '管理診所用戶權限' },
                financialReports: { title: '財務報表', icon: 'bar-chart-3', description: '收入分析與財務統計' },
                systemManagement: { title: '系統管理', icon: 'settings', description: '統計資料、備份匯出' },
                
                personalStatistics: { title: '個人統計分析', icon: 'trending-up', description: '統計個人用藥與穴位偏好' },
                
                personalSettings: { title: '個人設置', icon: 'wrench', description: '管理慣用藥方及穴位組合' },
                
                accountSecurity: { title: '帳號安全設定', icon: 'lock', description: '變更密碼及封存帳號' },
                
                templateLibrary: { title: '模板庫', icon: 'library', description: '查看醫囑與診斷模板' }
            };

            
            const permissions = getOrderedMenuPermissions(menuItems);
            updatePermissionControlledButtonsVisibility();

            
            permissions.forEach(permission => {
                const item = menuItems[permission];
                if (!item) return;
                
                if (!hasAccessToSection(permission)) return;
                const button = document.createElement('button');
                
                button.className = 'w-full text-left p-4 rounded-lg hover:bg-gray-100 transition duration-200 border border-gray-200';
                button.innerHTML = `
                    <div class="flex items-center">
                        <i data-lucide="${item.icon}" class="w-6 h-6 mr-4 mt-1 shrink-0 text-[#D9782B]"></i>
                        <div>
                            <div class="font-semibold text-gray-800">${item.title}</div>
                            <div class="text-sm text-gray-600">${item.description}</div>
                        </div>
                    </div>
                `;
                button.onclick = () => {
                    if (window.__sbPush) window.__sbPush('menuItem', permission);
                    showSection(permission);
                    closeSidebar();
                };
                menuContainer.appendChild(button);
            });
        }

        

        
        function showSection(sectionId) {
            
            if (!hasAccessToSection(sectionId)) {
                showToast('權限不足，您沒有存取此功能的權限', 'error');
                return;
            }
            hideAllSections();

            
            
            
            try {
                const wrapper = document.getElementById('contentWrapper');
                if (wrapper) {
                    // 以下分頁的容器位於 contentWrapper 之外：顯示時需隱藏 wrapper，
                    // 否則空 wrapper 仍以 py-6 佔用 48px，把外部分額外推遠，導致與
                    // wrapper 內分頁的「卡片頂部～nav 啡色線」距離不一致
                    const outsideWrapperSections = ['personalSettings', 'templateLibrary', 'medicalRecordManagement', 'personalStatistics', 'accountSecurity', 'scheduleManagement'];
                    if (outsideWrapperSections.includes(sectionId)) {
                        wrapper.classList.add('hidden');
                    } else {
                        wrapper.classList.remove('hidden');
                    }
                }
            } catch (e) {
                console.error('切換區域時調整版面顯示失敗：', e);
            }
            
            document.getElementById('welcomePage').classList.add('hidden');
            
            const sectionEl = document.getElementById(sectionId);
            if (sectionEl) sectionEl.classList.remove('hidden');
            
            if (sectionId === 'patientManagement') {
                
                loadPatientList();
                attachPatientListListener();
            } else if (sectionId === 'consultationSystem') {
                loadConsultationSystem();
            } else if (sectionId === 'herbLibrary') {
                loadHerbLibrary();
            } else if (sectionId === 'acupointLibrary') {
                loadAcupointLibrary();
            } else if (sectionId === 'scheduleManagement') {
                
                if (typeof window.initializeScheduleManagement === 'function') {
                    window.initializeScheduleManagement();
                }
                
                if (typeof window.scheduleUpdateAdminUI === 'function') {
                    try {
                        window.scheduleUpdateAdminUI();
                    } catch (uiErr) {
                        console.warn('Failed to update admin UI in navigateTo', uiErr);
                    }
                }
            } else if (sectionId === 'medicalRecordManagement') {
                
                if (typeof loadMedicalRecordManagement === 'function') {
                    loadMedicalRecordManagement();
                }
                attachMedicalRecordListListener();
            } else if (sectionId === 'billingManagement') {
                loadBillingManagement();
            } else if (sectionId === 'walletManagement') {
                loadWalletManagement();
            } else if (sectionId === 'financialReports') {
                loadFinancialReports();
            } else if (sectionId === 'systemManagement') {
                try {
                    updateClinicSettingsDisplay();
                } catch (_eUpdateClinicSettingsDisplay) {}
                try {
                    loadPermissionManagementPanel();
                } catch (_eLoadPermissionPanel) {}
                try {
                    if (versionFeatureEnabled('membership') && typeof renderWalletConfigForm === 'function') {
                        renderWalletConfigForm();
                    }
                } catch (_eRenderWalletConfig) {}
            } else if (sectionId === 'userManagement') {
                loadUserManagement();
            } else if (sectionId === 'personalSettings') {
                if (typeof renderDiagnosisSettingsForm === 'function') {
                    renderDiagnosisSettingsForm(true);
                }
            } else if (sectionId === 'personalStatistics') {
                
                if (typeof loadPersonalStatistics === 'function') {
                    loadPersonalStatistics();
                }
            } else if (sectionId === 'accountSecurity') {

                if (typeof loadAccountSecurity === 'function') {
                    loadAccountSecurity();
                }
            }
        }
        // 暴露給外層作用域（病人詳情面板跳轉會員儲值用）
        window.showSection = showSection;

        function hideAllSections() {
            
            
            
            
            ['patientManagement', 'consultationSystem', 'medicalRecordManagement', 'herbLibrary', 'acupointLibrary', 'templateLibrary', 'scheduleManagement', 'billingManagement', 'walletManagement', 'userManagement', 'financialReports', 'systemManagement', 'personalSettings', 'personalStatistics', 'accountSecurity', 'welcomePage'].forEach(id => {
                
                if (id === 'herbLibrary') {
                    try {
                        if (typeof herbInventoryListenerAttached !== 'undefined' && herbInventoryListenerAttached) {
                            
                            if (window.herbInventoryRef) {
                                window.firebase.off(window.herbInventoryRef, 'value');
                            } else {
                                
                                const tempRef = window.firebase.ref(window.firebase.rtdb, 'herbInventory');
                                window.firebase.off(tempRef, 'value');
                            }
                            herbInventoryListenerAttached = false;
                        }
                    } catch (err) {
                        console.error('離開中藥庫時取消監聽失敗:', err);
                    }
                }
                
                if (id === 'consultationSystem') {
                    try {
                        if (currentUserData && typeof subscribeToAppointments === 'function') {
                            // 已登入並在頁面間切換：不拆除監聽，改為釘回「今日」範圍，
                            // 使候診／診症完成的右上角站內通知在任何頁面都持續運作；
                            // 也避免停留在先前查看的未來日期。
                            subscribeToAppointments(true);
                        } else if (window.appointmentsListenerAttached && window.appointmentsQuery && window.appointmentsListener) {
                            window.firebase.off(window.appointmentsQuery, 'value', window.appointmentsListener);
                            window.appointmentsListenerAttached = false;
                        }
                    } catch (err) {
                        console.error('切換頁面時處理掛號監聽失敗:', err);
                    }
                }
                
                if (id === 'patientManagement') {
                    try {
                        detachPatientListListener();
                    } catch (err) {
                        console.error('離開病人管理時取消病人監聽失敗:', err);
                    }
                }
                if (id === 'medicalRecordManagement') {
                    try {
                        detachMedicalRecordListListener();
                    } catch (err) {
                        console.error('離開病歷管理時取消病歷監聽失敗:', err);
                    }
                }
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
        }

        
        function updateWelcomeCards() {
            const welcomePageEl = document.getElementById('welcomePage');
            if (!welcomePageEl) return;
            const cards = welcomePageEl.querySelectorAll('.grid > div');
            cards.forEach(card => {
                const titleEl = card.querySelector('.font-semibold');
                const title = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
                let sectionId = null;
                switch (title) {
                    case '病人資料管理':
                        sectionId = 'patientManagement';
                        break;
                    case '診症系統':
                        sectionId = 'consultationSystem';
                        break;
                    case '用戶管理':
                        sectionId = 'userManagement';
                        break;
                    case '系統管理':
                        sectionId = 'systemManagement';
                        break;
                    default:
                        sectionId = null;
                }
                if (sectionId && !hasAccessToSection(sectionId)) {
                    card.classList.add('hidden');
                } else {
                    card.classList.remove('hidden');
                }
            });
        }

        
        let editingPatientId = null;
        let filteredPatients = [];
        const PATIENT_MEDICAL_PROFILE_SECTIONS = [
            {
                key: 'medicalConditions',
                title: '疾病史',
                noteId: 'patientMedicalConditionsNotes',
                options: [
                    { key: 'hypertension', label: '高血壓' },
                    { key: 'diabetes', label: '糖尿病' },
                    { key: 'hyperlipidemia', label: '高脂血症' },
                    { key: 'asthma', label: '哮喘' },
                    { key: 'chronicKidneyDisease', label: '慢性腎病' },
                    { key: 'hepatitis', label: '肝炎' },
                    { key: 'tuberculosis', label: '肺結核' },
                    { key: 'cancer', label: '癌症' },
                    { key: 'stroke', label: '中風' },
                    { key: 'myocardialInfarction', label: '心肌梗塞' }
                ]
            },
            {
                key: 'surgicalHistory',
                title: '手術與外傷史',
                noteId: 'patientSurgicalHistoryNotes',
                options: [
                    { key: 'pacemakerImplantation', label: '心律調節器植入手術' },
                    { key: 'cardiacStentProcedure', label: '心臟金屬支架手術' },
                    { key: 'polypectomy', label: '息肉切除術' },
                    { key: 'jointReplacement', label: '人工關節手術' },
                    { key: 'endoscopicHemostasis', label: '內視鏡止血術' },
                    { key: 'dialysisFistulaAngioplasty', label: '洗腎瘻管成形術' },
                    { key: 'endovascularThrombectomy', label: '血管內取栓術' },
                    { key: 'vascularEmbolization', label: '血管栓塞術' },
                    { key: 'fracture', label: '骨折' },
                    { key: 'headTrauma', label: '頭部創傷' },
                    { key: 'trafficAccident', label: '車禍' }
                ]
            },
            {
                key: 'allergies',
                title: '過敏史',
                noteId: 'patientAllergyNotes',
                options: [
                    { key: 'g6pdDeficiency', label: '蠶豆症（G6PD 缺乏症）' },
                    { key: 'seafoodAllergy', label: '海鮮過敏' },
                    { key: 'nutsAllergy', label: '堅果' },
                    { key: 'eggProteinAllergy', label: '蛋白質' },
                    { key: 'glutenAllergy', label: '麩質' },
                    { key: 'soyAllergy', label: '大豆' },
                    { key: 'mangoAllergy', label: '芒果' }
                ]
            },
            {
                key: 'medications',
                title: '用藥史',
                noteId: 'patientMedicationNotes',
                options: [
                    { key: 'antihypertensives', label: '降血壓藥' },
                    { key: 'lipidLoweringAgents', label: '降血脂藥' },
                    { key: 'antidiabeticAgents', label: '降血糖藥' },
                    { key: 'anticoagulants', label: '抗凝血藥物' },
                    { key: 'asthmaCopdMedications', label: '氣喘/COPD 藥物' },
                    { key: 'antihistamines', label: '抗組織胺藥物' },
                    { key: 'antidepressantsAnxiolytics', label: '抗抑鬱/焦慮藥' },
                    { key: 'sleepingPills', label: '安眠藥' },
                    { key: 'antiepileptics', label: '抗癲癇藥' },
                    { key: 'parkinsonMedications', label: '帕金森氏症藥物' },
                    { key: 'thyroidMedications', label: '甲狀腺藥物' },
                    { key: 'osteoporosisMedications', label: '骨質疏鬆藥' },
                    { key: 'goutPreventiveMedications', label: '痛風預防藥' },
                    { key: 'gastricMedications', label: '胃藥' },
                    { key: 'hormonalMedications', label: '荷爾蒙類藥物' },
                    { key: 'immunosuppressants', label: '免疫抑制劑藥物' },
                    { key: 'vitamins', label: '維他命' },
                    { key: 'healthSupplements', label: '健康食品' },
                    { key: 'chinesePatentMedicines', label: '中成藥' }
                ]
            }
        ];

// [Phase 6D1 moved] Patient medical profile: normalize/merge/sync, profile form collect/populate/clear, medical history editor open/save -> js/domains/consultation/profile.js
        
        
        function updatePatientAge() {
            const birthDate = document.getElementById('patientBirthDate').value;
            const ageInput = document.getElementById('patientAge');
            
            if (birthDate) {
                const age = calculateAge(birthDate);
                ageInput.value = age;
            } else {
                ageInput.value = '';
            }
        }

        function showAddPatientForm() {
            if (!hasActionPermission('patientCreate')) {
                showToast('權限不足，無法新增病人', 'error');
                return;
            }
            editingPatientId = null;
            document.getElementById('formTitle').textContent = '新增病人資料';
            document.getElementById('saveButtonText').textContent = '儲存';
            document.getElementById('addPatientModal').classList.remove('hidden');
            clearPatientForm();
        }

        function hideAddPatientForm() {
            document.getElementById('addPatientModal').classList.add('hidden');
            clearPatientForm();
            editingPatientId = null;
        }

        function clearPatientForm() {
            ['patientName', 'patientAge', 'patientGender', 'patientPhone', 'patientEmergencyContactName', 'patientEmergencyContactPhone', 'patientIdCard', 'patientBirthDate', 'patientAddress'].forEach(id => {
                document.getElementById(id).value = '';
            });
            clearPatientMedicalProfileForm();
        }

/**
 * 以電話號碼尋找既有病人（病人資料管理防重複登記用）。
 * 比對策略：
 *   1. 先查本機病人快取（純數字歸一，零網路開銷）；
 *   2. 再以 Firestore equality 查詢做權威確認，避免快取過期漏判。
 * 緊急聯絡人電話不屬病人主電話，不在此檢查範圍。
 *
 * @param {string} phone 表單輸入之病人電話
 * @param {string} [excludePatientId] 編輯時排除當前病人自身
 * @returns {Promise<object|null>} 命中之病人記錄；查詢服務異常時回 null
 */
async function findPatientByPhone(phone, excludePatientId) {
    const normalized = String(phone || '').replace(/\D/g, '');
    const isOther = (p) => p
        && String(p.id) !== String(excludePatientId || '')
        && String(p.phone || '').replace(/\D/g, '') === normalized;

    // 1) 本機快取
    try {
        const cached = await window.firebaseDataManager.getPatients();
        if (cached && cached.success && Array.isArray(cached.data)) {
            const hit = cached.data.find(isOther);
            if (hit) return hit;
        }
    } catch (_cacheErr) { /* 快取不可用就走遠端 */ }

    // 2) Firestore 權威 equality 查詢
    try {
        const dupQuery = window.firebase.firestoreQuery(
            window.firebase.collection(window.firebase.db, 'patients'),
            window.firebase.where('phone', '==', String(phone).trim())
        );
        const snapshot = await window.firebase.getDocs(dupQuery);
        let found = null;
        snapshot.forEach((docSnap) => {
            if (found) return;
            if (String(docSnap.id) === String(excludePatientId || '')) return;
            found = { id: docSnap.id, ...docSnap.data() };
        });
        return found;
    } catch (queryErr) {
        console.error('電話重複查詢失敗:', queryErr);
        return null;
    }
}

async function savePatient() {
    if (editingPatientId && !hasActionPermission('patientEdit')) {
        showToast('權限不足，無法編輯病人資料', 'error');
        return;
    }
    if (!editingPatientId && !hasActionPermission('patientCreate')) {
        showToast('權限不足，無法新增病人', 'error');
        return;
    }
    const medicalProfile = collectPatientMedicalProfileFromForm();
    const medicalProfileSummary = buildPatientMedicalProfileLegacySummary(medicalProfile);
    const patient = {
        name: document.getElementById('patientName').value.trim(),
        age: document.getElementById('patientAge').value,
        gender: document.getElementById('patientGender').value,
        phone: document.getElementById('patientPhone').value.trim(),
        emergencyContactName: document.getElementById('patientEmergencyContactName').value.trim(),
        emergencyContactPhone: document.getElementById('patientEmergencyContactPhone').value.trim(),
        idCard: document.getElementById('patientIdCard').value.trim(),
        birthDate: document.getElementById('patientBirthDate').value,
        address: document.getElementById('patientAddress').value.trim(),
        allergies: medicalProfileSummary.allergies,
        history: medicalProfileSummary.history,
        medicalProfile
    };

    
    if (!patient.name || !patient.gender || !patient.phone || !patient.birthDate || !patient.idCard) {
        showToast('請填寫必要資料（姓名、性別、電話、出生日期、身分證字號）！', 'error');
        return;
    }

    
    const phonePattern = /^\d{7,15}$/;
    if (!phonePattern.test(patient.phone)) {
        showToast('電話格式不正確，請輸入 7-15 位數字！', 'error');
        return;
    }

    
    const birthDate = new Date(patient.birthDate);
    const today = new Date();
    if (birthDate > today) {
        showToast('出生日期不能晚於今天！', 'error');
        return;
    }

    
    const calculatedAge = calculateAge(patient.birthDate);
    if (calculatedAge > 120) {
        showToast('請確認出生日期是否正確！', 'error');
        return;
    }

    
    const phoneRegex = /^[0-9\-\+\(\)\s]+$/;
    if (!phoneRegex.test(patient.phone)) {
        showToast('請輸入有效的電話號碼！', 'error');
        return;
    }

    // 電話號碼唯一性：新增及編輯均不可與其他病人重複
    // （緊急聯絡人電話不在管制範圍）；編輯時排除病人自身
    const duplicatePatient = await findPatientByPhone(patient.phone, editingPatientId);
    if (duplicatePatient) {
        showToast(
            `電話號碼已使用於病人「${duplicatePatient.name || duplicatePatient.id}」，不可重複登記！`,
            'error'
        );
        return;
    }



    
    
    const saveButton = document.getElementById('savePatientButton') || document.querySelector('[onclick="savePatient()"]');
    if (saveButton) {
        
        const loadingText = (typeof editingPatientId !== 'undefined' && editingPatientId) ? '更新中...' : '儲存中...';
        setButtonLoading(saveButton, loadingText);
    }

    try {
        if (editingPatientId) {
            
            const result = await window.firebaseDataManager.updatePatient(editingPatientId, patient);
            if (result.success) {
                showToast('病人資料已成功更新！', 'success');
            } else {
                showToast('更新失敗，請稍後再試', 'error');
                return;
            }
        } else {
            
            
            patient.patientNumber = await generatePatientNumberFromFirebase();
            
            const result = await window.firebaseDataManager.addPatient(patient);
            if (result.success) {
                showToast('病人資料已成功新增！', 'success');
            } else {
                showToast('新增失敗，請稍後再試', 'error');
                return;
            }
        }

        
        
        
        
        patientCache = null;
        
        if (typeof patientPagesCache === 'object') {
            patientPagesCache = {};
        }
        if (typeof patientPageCursors === 'object') {
            patientPageCursors = {};
        }
        if (typeof patientAscPagesCache === 'object') {
            patientAscPagesCache = {};
        }
        if (typeof patientAscPageCursors === 'object') {
            patientAscPageCursors = {};
        }
        
        patientsCountCache = null;

        
        await loadPatientListFromFirebase();
        hideAddPatientForm();
        updateStatistics();

    } catch (error) {
        console.error('保存病人資料錯誤:', error);
        showToast('保存時發生錯誤，請稍後再試', 'error');
    } finally {
        
        if (saveButton) {
            clearButtonLoading(saveButton);
        }
    }

    } 

        
async function generatePatientNumberFromFirebase() {
    try {
        await waitForFirebaseDb();
        const formatPatientNumber = (num) => `P${String(num).padStart(6, '0')}`;
        const parsePatientNumber = (value) => {
            const raw = String(value || '').trim().toUpperCase();
            if (!raw.startsWith('P')) return 0;
            const parsed = parseInt(raw.slice(1), 10);
            return Number.isFinite(parsed) ? parsed : 0;
        };
        const counterRef = window.firebase.doc(window.firebase.db, 'systemCounters', 'patientNumber');
        let bootstrapMax = 0;
        try {
            const latestQuery = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'patients'),
                window.firebase.orderBy('patientNumber', 'desc'),
                window.firebase.limit(1)
            );
            const latestSnap = await window.firebase.getDocs(latestQuery);
            latestSnap.forEach((docSnap) => {
                const data = docSnap.data ? docSnap.data() : {};
                bootstrapMax = Math.max(bootstrapMax, parsePatientNumber(data && data.patientNumber));
            });
        } catch (queryErr) {
            console.warn('讀取最新病人編號失敗，回退至全量掃描初始化 counter:', queryErr);
            const result = await safeGetPatients(true);
            if (result && result.success && Array.isArray(result.data)) {
                bootstrapMax = result.data.reduce((max, patient) => {
                    return Math.max(max, parsePatientNumber(patient && patient.patientNumber));
                }, 0);
            }
        }
        const nextNumber = await window.firebase.runTransaction(window.firebase.db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            const currentNumber = counterSnap && counterSnap.exists()
                ? Math.max(bootstrapMax, Number(counterSnap.data().current) || 0)
                : bootstrapMax;
            const newNumber = currentNumber + 1;
            transaction.set(counterRef, {
                current: newNumber,
                updatedAt: new Date()
            }, { merge: true });
            return newNumber;
        });
        return formatPatientNumber(nextNumber);
    } catch (error) {
        console.error('生成病人編號失敗:', error);
        return `P${Date.now().toString().slice(-6)}`; 
    }
}


/* Phase 4 ESM: patient management list + search (4 fns) moved to js/domains/patients/list.js; window facades in js/app.js; original block removed */


        
async function editPatient(id) {
    if (!hasActionPermission('patientEdit')) {
        showToast('權限不足，無法編輯病人資料', 'error');
        return;
    }
    try {
        
        const patient = await getPatientByIdWithRefresh(id);
        if (!patient) {
            showToast('找不到病人資料', 'error');
            return;
        }

        editingPatientId = id;
        document.getElementById('formTitle').textContent = '編輯病人資料';
        document.getElementById('saveButtonText').textContent = '更新';
        
        
        document.getElementById('patientName').value = patient.name || '';
        document.getElementById('patientGender').value = patient.gender || '';
        document.getElementById('patientPhone').value = patient.phone || '';
        document.getElementById('patientEmergencyContactName').value = patient.emergencyContactName || '';
        document.getElementById('patientEmergencyContactPhone').value = patient.emergencyContactPhone || '';
        document.getElementById('patientIdCard').value = patient.idCard || '';
        document.getElementById('patientBirthDate').value = patient.birthDate || '';
        document.getElementById('patientAddress').value = patient.address || '';
        populatePatientMedicalProfileForm(patient.medicalProfile, patient);
        
        
        updatePatientAge();
        
        document.getElementById('addPatientModal').classList.remove('hidden');

    } catch (error) {
        console.error('編輯病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    }
}
async function deletePatient(id) {
    try {
        if (!hasActionPermission('patientDelete')) {
            showToast('權限不足，無法刪除病人資料', 'error');
            return;
        }

        
        const patient = await getPatientByIdWithRefresh(id);
        if (!patient) {
            showToast('找不到病人資料', 'error');
            return;
        }

        
        const lang = localStorage.getItem('lang') || 'zh';
        
        const zhConfirmMsg = `確定要刪除病人「${patient.name}」的資料嗎？\n\n注意：相關的診症記錄、掛號及套票也會一併刪除！`;
        const enConfirmMsg = `Are you sure you want to delete the patient \"${patient.name}\"?\n\nNote: related consultation records, appointments and packages will also be deleted.`;
        const confirmMessage = lang === 'en' ? enConfirmMsg : zhConfirmMsg;
        const confirmedDelPatient = await showConfirmation(confirmMessage, 'warning');
        if (confirmedDelPatient) {
            
            showToast('刪除中...', 'info');

            
            try {
                await deletePatientAssociatedData(id);
            } catch (assocErr) {
                console.error('刪除病人相關資料時發生錯誤:', assocErr);
            }

            
            const deleteResult = await window.firebaseDataManager.deletePatient(id);

            if (deleteResult && deleteResult.success) {
                showToast('病人資料已刪除！', 'success');
                
                
                
                patientCache = null;
                if (typeof patientPagesCache === 'object') {
                    patientPagesCache = {};
                }
                if (typeof patientPageCursors === 'object') {
                    patientPageCursors = {};
                }
                if (typeof patientAscPagesCache === 'object') {
                    patientAscPagesCache = {};
                }
                if (typeof patientAscPageCursors === 'object') {
                    patientAscPageCursors = {};
                }
                patientsCountCache = null;
            
            await loadPatientListFromFirebase();
            updateStatistics();
            try {
                if (typeof loadTodayAppointments === 'function') {
                    await loadTodayAppointments();
                }
            } catch (_e) {
                
            }
            } else {
                showToast('刪除失敗，請稍後再試', 'error');
            }
        }

    } catch (error) {
        console.error('刪除病人資料錯誤:', error);
        showToast('刪除時發生錯誤', 'error');
    }
}


async function deletePatientAssociatedData(patientId) {
    try {
        await waitForFirebaseDb();
        
        try {
            const consRef = window.firebase.collection(window.firebase.db, 'consultations');
            const consQuery = window.firebase.firestoreQuery(consRef, window.firebase.where('patientId', '==', patientId));
            const consSnap = await window.firebase.getDocs(consQuery);
            const consDocs = consSnap && consSnap.docs ? consSnap.docs : [];
            for (const docSnap of consDocs) {
                try {
                    await window.firebase.deleteDoc(docSnap.ref);
                } catch (delErr) {
                    console.error('刪除診症記錄失敗:', delErr);
                }
            }
            
            if (patientConsultationsCache && patientConsultationsCache[patientId]) {
                delete patientConsultationsCache[patientId];
            }
            try {
                const pid = String(patientId || '');
                if (pid && consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                    delete consultationHistoryPager.patientPagedCache[pid];
                }
            } catch (_e) {}
        } catch (err) {
            console.error('查詢或刪除診症記錄失敗:', err);
        }
        
        try {
            const pkgRef = window.firebase.collection(window.firebase.db, 'patientPackages');
            const pkgQuery = window.firebase.firestoreQuery(pkgRef, window.firebase.where('patientId', '==', patientId));
            const pkgSnap = await window.firebase.getDocs(pkgQuery);
            const pkgDocs = pkgSnap && pkgSnap.docs ? pkgSnap.docs : [];
            for (const docSnap of pkgDocs) {
                try {
                    await window.firebase.deleteDoc(docSnap.ref);
                } catch (delErr) {
                    console.error('刪除患者套票失敗:', delErr);
                }
            }
            
            if (patientPackagesCache && patientPackagesCache[patientId]) {
                delete patientPackagesCache[patientId];
            }
            
            try {
                const localKey = `patientPackages_${patientId}`;
                localStorage.removeItem(localKey);
            } catch (e) {
                console.warn('刪除本地患者套票快取失敗:', e);
            }
        } catch (err) {
            console.error('查詢或刪除患者套票失敗:', err);
        }

        try {
            const historyRef = window.firebase.collection(window.firebase.db, 'patientPackageHistory');
            const historyQuery = window.firebase.firestoreQuery(historyRef, window.firebase.where('patientId', '==', patientId));
            const historySnap = await window.firebase.getDocs(historyQuery);
            const historyDocs = historySnap && historySnap.docs ? historySnap.docs : [];
            for (const docSnap of historyDocs) {
                try {
                    await window.firebase.deleteDoc(docSnap.ref);
                } catch (delErr) {
                    console.error('刪除患者套票記錄失敗:', delErr);
                }
            }
            if (window.firebaseDataManager && typeof window.firebaseDataManager.resetPatientPackageHistoryPagination === 'function') {
                window.firebaseDataManager.resetPatientPackageHistoryPagination(patientId);
            }
        } catch (err) {
            console.error('查詢或刪除患者套票記錄失敗:', err);
        }

        
        try {
            
            if (typeof waitForFirebaseDataManager === 'function') {
                try {
                    await waitForFirebaseDataManager();
                } catch (_e) {
                    
                }
            }
            
            let apptRes = null;
            try {
                apptRes = await window.firebaseDataManager.getAppointments();
            } catch (getErr) {
                console.error('讀取掛號記錄失敗:', getErr);
            }
            if (apptRes && apptRes.success && Array.isArray(apptRes.data)) {
                
                const apptsToDelete = apptRes.data.filter(ap => ap && String(ap.patientId) === String(patientId));
                for (const ap of apptsToDelete) {
                    try {
                        await window.firebaseDataManager.deleteAppointment(String(ap.id));
                    } catch (delErr) {
                        console.error('刪除掛號記錄失敗:', delErr);
                    }
                }
            }
            
            try {
                if (Array.isArray(appointments)) {
                    appointments = appointments.filter(ap => ap && String(ap.patientId) !== String(patientId));
                }
                localStorage.setItem('appointments', JSON.stringify(appointments));
            } catch (_lsErr) {
                
            }
        } catch (err) {
            console.error('查詢或刪除掛號記錄失敗:', err);
        }
    } catch (error) {
        console.error('刪除病人相關資料時發生錯誤:', error);
    }
}

/* Phase 4 ESM: patient detail modal viewPatient moved to js/domains/patients/detail.js; window facade in js/app.js; original block removed */

        function closePatientDetail() {
            document.getElementById('patientDetailModal').classList.add('hidden');
        }





        

        
        let selectedPatientForRegistration = null;
        let currentConsultingAppointmentId = null;
        let currentConsultationEditContext = null;
const GENERAL_REGISTRATION_DOCTOR_KEY = '__general_registration__';
const GENERAL_REGISTRATION_LABEL = '一般掛號';
let inquiryOptionsData = {};

// [Phase 6D3 moved] Access/meta pure functions: general registration detection, doctor view/edit scope, edit restriction, symptom summary -> js/domains/consultation/access.js
        
        
// [Phase 6C moved] Registration, appointments, arrival, start/continue consultation, loadConsultationForEdit and parsers -> js/domains/consultation/registration.js
        
const CONSULTATION_DRAFT_TEXT_FIELD_IDS = [
    'formSymptoms',
    'formTongue',
    'formPulse',
    'formDiagnosis',
    'formSyndrome',
    'formUsage',
    'formTreatmentCourse',
    'formInstructions'
];

let consultationSymptomsDraftState = {
    key: null,
    meta: null,
    listeners: [],
    saveSoon: null,
    // 程式化載入/清空表單期間暫停草稿寫入，避免殘影覆蓋
    suspended: false,
    // 每次 setup 遞增，作廢前一診次已排程的防抖寫入
    generation: 0,
    // 編輯模式下本次從資料庫載入之已保存病歷的時間戳（ms）
    loadedRecordUpdatedAt: 0
};

// [Phase 6B moved] Consultation draft autosave, form lifecycle, billing structuring and saveConsultation hub -> js/domains/consultation/save.js
        
/* Phase 4 ESM: patient/consultation medical history UI (23 fns + historyCalendarState) moved to js/domains/patients/history.js; window facades in js/app.js; original block removed */
// 以下共享分頁狀態所有權保留在 system.js（consultationHistoryPager 的方法直接閉包讀寫，history.js 經 G 讀寫）
        let currentPatientConsultations = [];
        let currentPatientHistoryPage = 0;
        let currentConsultationConsultations = [];
        let currentConsultationHistoryPage = 0;
        
// [Phase 6D2 moved] Post-visit: history modal/pager, package use records, package/wallet billing display, withdraw consultation, medical record edit entry, consultation summary -> js/domains/consultation/postvisit.js
        
// 更新統計功能
async function updateStatistics() {
    try {
        // 如果 Firebase 數據管理器尚未初始化或尚未準備好，則跳過統計更新。
        if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
            console.log('雲端數據管理器尚未準備就緒，統計資訊將稍後更新');
            return;
        }
        // 為避免在主頁多次從 Firebase 讀取掛號和病人資料，這裡優先使用已緩存或本地儲存的資料計算統計。
        let totalPatients = 0;
        try {
            // 如果全域 patients 已載入且非空，直接使用其長度
            if (Array.isArray(patients) && patients.length > 0) {
                totalPatients = patients.length;
            } else if (Array.isArray(patientCache) && patientCache.length > 0) {
                // 如果有快取，使用快取長度
                totalPatients = patientCache.length;
            } else {
                // 最後檢查本地存儲
                const storedPatients = localStorage.getItem('patients');
                if (storedPatients) {
                    try {
                        const parsed = JSON.parse(storedPatients);
                        if (Array.isArray(parsed)) {
                            totalPatients = parsed.length;
                        }
                    } catch (parseError) {
                        // ignore JSON parse error
                    }
                }
            }
        } catch (countError) {
            console.error('計算病人數量錯誤:', countError);
            totalPatients = 0;
        }
        // 更新病人總數顯示
        const totalPatientsElement = document.getElementById('totalPatients');
        if (totalPatientsElement) {
            totalPatientsElement.textContent = totalPatients;
        }
        // 處理掛號資料：優先使用全域 appointments，如果不存在再使用本地儲存。
        let appointmentsData = [];
        try {
            if (Array.isArray(appointments) && appointments.length > 0) {
                appointmentsData = appointments;
            } else {
                const storedApts = localStorage.getItem('appointments');
                if (storedApts) {
                    try {
                        const parsedApt = JSON.parse(storedApts);
                        if (Array.isArray(parsedApt)) {
                            appointmentsData = parsedApt;
                        }
                    } catch (parseErr) {
                        // ignore JSON parse error
                    }
                }
            }
        } catch (aptError) {
            console.error('讀取掛號資料錯誤:', aptError);
            appointmentsData = [];
        }
        // 計算今日診療數（從掛號數據計算）
        const today = new Date().toDateString();
        const todayConsultations = appointmentsData.filter(apt => 
            apt.status === 'completed' && 
            new Date(apt.appointmentTime).toDateString() === today
        ).length;
        const todayConsultationsElement = document.getElementById('todayConsultations');
        if (todayConsultationsElement) {
            todayConsultationsElement.textContent = todayConsultations;
        }
        // 計算本月診療數
        const thisMonth = new Date();
        const monthlyConsultations = appointmentsData.filter(apt => 
            apt.status === 'completed' && 
            new Date(apt.appointmentTime).getMonth() === thisMonth.getMonth() &&
            new Date(apt.appointmentTime).getFullYear() === thisMonth.getFullYear()
        ).length;
        const monthlyConsultationsElement = document.getElementById('monthlyConsultations');
        if (monthlyConsultationsElement) {
            monthlyConsultationsElement.textContent = monthlyConsultations;
        }
    } catch (error) {
        console.error('更新統計錯誤:', error);
        // 如果計算失敗，顯示 0
        const totalPatientsElement = document.getElementById('totalPatients');
        if (totalPatientsElement) {
            totalPatientsElement.textContent = '0';
        }
    }
}

// 在用戶透過 Authentication 登入後初始化系統資料。
// 這個函式會載入掛號、診療記錄及患者資料，
// 並在完成後更新統計資訊以及訂閱掛號即時更新。
async function initializeSystemAfterLogin() {
    // 確保 Firebase 資料管理器已準備好
    await waitForFirebaseDataManager();
    try {
        /**
         * 2025-09: 為了避免在登入後立即從 Firebase 讀取所有病歷記錄，
         * 我們不再於此自動讀取 consultations 資料。
         * 病歷記錄將在實際需要顯示或操作時再個別查詢，
         * 以降低初始化時的讀取量。
         *
         * 此處先從本地存儲讀取任何已緩存的診療記錄，
         * 若無緩存則保持空陣列，待使用時再讀取。
         */
        try {
            const storedConsultations = localStorage.getItem('consultations');
            if (storedConsultations) {
                const parsed = JSON.parse(storedConsultations);
                if (Array.isArray(parsed)) {
                    consultations = parsed;
                } else {
                    consultations = [];
                }
            } else {
                consultations = [];
            }
        } catch (e) {
            console.warn('讀取本地診療記錄快取時發生錯誤:', e);
            consultations = [];
        }
        console.log('登入後系統資料初始化完成（不自動讀取診療記錄）');
    } catch (error) {
        console.error('初始化系統資料失敗:', error);
        consultations = [];
    }
    // 不在此處更新統計或讀取掛號/病人資料。實時掛號監聽將在後續處理。
    // 不在此處啟動掛號實時監聽。改為在進入掛號系統頁面時才啟動監聽，避免在其他頁面也持續讀取掛號資料。
}



        // 診所設定管理功能
        const RECEIPT_CUSTOM_FIELDS = ['receiptNo', 'medicalRecordNo', 'patientNumber', 'consultationDate', 'consultationTime'];
        const PRESCRIPTION_CUSTOM_FIELDS = ['medicalRecordNo', 'patientNumber', 'consultationDate', 'consultationTime'];

        function normalizeReceiptPaperSize(rawPaperSize) {
            return String(rawPaperSize || '').toUpperCase() === 'A4' ? 'A4' : 'A5';
        }

        function getClinicReceiptPaperSize(settingsObj = null) {
            const source = settingsObj && typeof settingsObj === 'object' ? settingsObj : clinicSettings;
            return normalizeReceiptPaperSize(source && source.receiptPaperSize);
        }

        function getReceiptPrintLayoutConfig(paperSize, layoutType = 'receipt') {
            const normalizedPaperSize = normalizeReceiptPaperSize(paperSize);
            const isA4 = normalizedPaperSize === 'A4';
            const shared = {
                paperSize: normalizedPaperSize,
                containerWidth: isA4 ? '210mm' : '148mm',
                containerHeight: isA4 ? '297mm' : '210mm',
                pageMargin: isA4 ? '12mm' : '10mm',
                windowFeatures: isA4 ? 'width=900,height=1200' : 'width=700,height=900'
            };

            if (layoutType === 'certificate') {
                return {
                    ...shared,
                    bodyPadding: isA4 ? '12px' : '8px',
                    bodyFontSize: isA4 ? '12px' : '10px',
                    containerPadding: isA4 ? '12px' : '8px',
                    clinicHeaderPaddingBottom: isA4 ? '14px' : '10px',
                    clinicHeaderMarginBottom: isA4 ? '20px' : '15px',
                    clinicNameFont: isA4 ? '16px' : '13px',
                    clinicSubtitleFont: isA4 ? '11px' : '10px',
                    titleFont: isA4 ? '20px' : '16px',
                    titleMargin: isA4 ? '12px' : '8px',
                    numberFont: isA4 ? '12px' : '10px',
                    sectionFont: isA4 ? '12px' : '10px',
                    infoLabelMinWidth: isA4 ? '110px' : '80px',
                    infoValueMinWidth: isA4 ? '180px' : '120px',
                    infoValuePadding: isA4 ? '5px 8px' : '3px 6px',
                    highlightPadding: isA4 ? '10px' : '6px',
                    signatureWidth: isA4 ? '100px' : '60px',
                    signatureHeight: isA4 ? '40px' : '25px',
                    signatureLabelFont: isA4 ? '10px' : '9px',
                    watermarkFont: isA4 ? '100px' : '80px',
                    footerFont: isA4 ? '9px' : '8px',
                    dateFont: isA4 ? '12px' : '10px',
                    printBodyFontSize: isA4 ? '12px' : '11px',
                    printPadding: isA4 ? '12mm' : '8mm',
                    sealPadding: isA4 ? '22px' : '15px',
                    sealNoteFont: isA4 ? '12px' : '12px'
                };
            }

            if (layoutType === 'advice') {
                return {
                    ...shared,
                    bodyPadding: isA4 ? '14px' : '10px',
                    bodyFontSize: isA4 ? '12px' : '11px',
                    containerPadding: isA4 ? '14px' : '8px',
                    clinicHeaderPaddingBottom: isA4 ? '14px' : '10px',
                    clinicHeaderMarginBottom: isA4 ? '20px' : '15px',
                    clinicNameFont: isA4 ? '16px' : '14px',
                    clinicSubtitleFont: isA4 ? '11px' : '10px',
                    titleFont: isA4 ? '18px' : '14px',
                    titleMargin: isA4 ? '12px' : '6px',
                    infoFont: isA4 ? '12px' : '11px',
                    infoRowMarginBottom: isA4 ? '5px' : '3px',
                    sectionTitleFont: isA4 ? '14px' : '12px',
                    sectionTitleMarginTop: isA4 ? '14px' : '10px',
                    sectionTitleMarginBottom: isA4 ? '6px' : '4px',
                    sectionContentFont: isA4 ? '12px' : '10px',
                    sectionContentPadding: isA4 ? '8px' : '4px',
                    thankYouMargin: isA4 ? '16px' : '12px',
                    thankYouFont: isA4 ? '13px' : '11px',
                    footerMarginTop: isA4 ? '16px' : '10px',
                    footerPaddingTop: isA4 ? '10px' : '6px',
                    footerFont: isA4 ? '10px' : '9px',
                    printBodyFontSize: isA4 ? '12px' : '11px',
                    printPadding: isA4 ? '10mm' : '8mm'
                };
            }

            return {
                ...shared,
                bodyPadding: isA4 ? '14px' : '10px',
                bodyFontSize: isA4 ? '12px' : '11px',
                containerPadding: isA4 ? '14px' : '8px',
                clinicHeaderPaddingBottom: isA4 ? '14px' : '10px',
                clinicHeaderMarginBottom: isA4 ? '20px' : '15px',
                clinicNameFont: isA4 ? '16px' : '14px',
                clinicSubtitleFont: isA4 ? '11px' : '10px',
                titleFont: isA4 ? '18px' : '14px',
                titleMargin: isA4 ? '12px' : '6px',
                infoFont: isA4 ? '12px' : '11px',
                infoRowMarginBottom: isA4 ? '5px' : '3px',
                itemsPadding: isA4 ? '10px' : '6px',
                itemsMarginY: isA4 ? '12px' : '8px',
                itemsTitleFont: isA4 ? '14px' : '12px',
                itemsTableFont: isA4 ? '12px' : '10px',
                itemCellPadding: isA4 ? '5px 6px' : '3px 5px',
                totalSectionFont: isA4 ? '12px' : '10px',
                totalLabelFont: isA4 ? '11px' : '9px',
                totalAmountFont: isA4 ? '14px' : '10px',
                totalAmountPadding: isA4 ? '4px 8px' : '2px',
                totalAmountMinWidth: isA4 ? '80px' : '50px',
                sectionTitleFont: isA4 ? '12px' : '11px',
                sectionContentFont: isA4 ? '12px' : '10px',
                footerMarginTop: isA4 ? '16px' : '10px',
                footerPaddingTop: isA4 ? '10px' : '6px',
                footerFont: isA4 ? '10px' : '9px',
                footerRowMarginBottom: isA4 ? '4px' : '2px',
                thankYouMargin: isA4 ? '12px' : '8px',
                thankYouFont: isA4 ? '13px' : '11px',
                diagnosisMarginY: isA4 ? '10px' : '6px',
                diagnosisFont: isA4 ? '12px' : '10px',
                highlightPadding: isA4 ? '10px' : '6px',
                printBodyFontSize: isA4 ? '12px' : '11px',
                printPadding: isA4 ? '10mm' : '8mm'
            };
        }

        function getDefaultReceiptVisibilitySettings() {
            return {
                receipt: {
                    receiptNo: true,
                    medicalRecordNo: true,
                    patientNumber: true,
                    consultationDate: true,
                    consultationTime: true
                },
                prescription: {
                    receiptNo: false,
                    medicalRecordNo: true,
                    patientNumber: true,
                    consultationDate: true,
                    consultationTime: true
                }
            };
        }

        function mergeReceiptVisibilitySettings(rawSettings) {
            const defaults = getDefaultReceiptVisibilitySettings();
            const merged = {
                receipt: { ...defaults.receipt },
                prescription: { ...defaults.prescription }
            };
            const receiptSource = rawSettings && rawSettings.receipt;
            if (receiptSource && typeof receiptSource === 'object') {
                RECEIPT_CUSTOM_FIELDS.forEach((field) => {
                    if (typeof receiptSource[field] === 'boolean') merged.receipt[field] = receiptSource[field];
                });
            }
            const prescriptionSource = rawSettings && rawSettings.prescription;
            if (prescriptionSource && typeof prescriptionSource === 'object') {
                PRESCRIPTION_CUSTOM_FIELDS.forEach((field) => {
                    if (typeof prescriptionSource[field] === 'boolean') merged.prescription[field] = prescriptionSource[field];
                });
            }
            return merged;
        }

        function getClinicReceiptVisibilitySettings() {
            return mergeReceiptVisibilitySettings(clinicSettings && clinicSettings.receiptFieldVisibility);
        }

        function applyReceiptCustomizationUI() {
            const settings = getClinicReceiptVisibilitySettings();
            RECEIPT_CUSTOM_FIELDS.forEach((field) => {
                const receiptEl = document.getElementById(`receiptField_${field}`);
                if (receiptEl) receiptEl.checked = !!settings.receipt[field];
            });
            PRESCRIPTION_CUSTOM_FIELDS.forEach((field) => {
                const prescriptionEl = document.getElementById(`prescriptionField_${field}`);
                if (prescriptionEl) prescriptionEl.checked = !!settings.prescription[field];
            });
            const paperSizeEl = document.getElementById('receiptPaperSizeSetting');
            if (paperSizeEl) paperSizeEl.value = getClinicReceiptPaperSize();
        }

        function collectReceiptCustomizationUI() {
            const settings = { receipt: {}, prescription: {} };
            RECEIPT_CUSTOM_FIELDS.forEach((field) => {
                const receiptEl = document.getElementById(`receiptField_${field}`);
                settings.receipt[field] = !!(receiptEl && receiptEl.checked);
            });
            PRESCRIPTION_CUSTOM_FIELDS.forEach((field) => {
                const prescriptionEl = document.getElementById(`prescriptionField_${field}`);
                settings.prescription[field] = !!(prescriptionEl && prescriptionEl.checked);
            });
            settings.prescription.receiptNo = false;
            return settings;
        }

        function isClinicHerbInventoryEnabled(settingsObj = null) {
            const source = settingsObj && typeof settingsObj === 'object' ? settingsObj : clinicSettings;
            return !(source && source.herbInventoryEnabled === false);
        }

        function applyClinicHerbInventoryToggleUI(settingsObj = null) {
            const toggleEl = document.getElementById('systemManagementHerbInventoryEnabled');
            if (toggleEl) {
                toggleEl.checked = isClinicHerbInventoryEnabled(settingsObj);
            }
        }

        // 收集「診所營業時間＋午飯時間」時間輸入（prefix＝'' 或 'addClinic'），
        // 同時生成 businessHours 顯示字串，供收據/頁腳等既有展示沿用。
        function collectBusinessHoursUI(prefix) {
            const val = (id) => {
                const el = document.getElementById(prefix + id);
                return el ? String(el.value || '').trim() : '';
            };
            const start = val('BusinessHoursStart');
            const end = val('BusinessHoursEnd');
            const lunchStart = val('LunchStart');
            const lunchEnd = val('LunchEnd');
            let businessHours = '';
            if (start && end) businessHours = `${start}-${end}`;
            if (lunchStart && lunchEnd && businessHours) {
                businessHours += `（休息 ${lunchStart}-${lunchEnd}）`;
            }
            return { start, end, lunchStart, lunchEnd, businessHours };
        }

        // 以時間字串（HH:mm）換算分鐘，便於驗證先後
        function hmToMinutes(s) {
            const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
            return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
        }

        function showClinicSettingsModal() {
            // 載入現有設定
            document.getElementById('clinicChineseName').value = clinicSettings.chineseName || '';
            document.getElementById('clinicEnglishName').value = clinicSettings.englishName || '';
            const setVal = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.value = v || '';
            };
            setVal('clinicBusinessHoursStart', clinicSettings.businessHoursStart);
            setVal('clinicBusinessHoursEnd', clinicSettings.businessHoursEnd);
            setVal('clinicLunchStart', clinicSettings.lunchStart);
            setVal('clinicLunchEnd', clinicSettings.lunchEnd);
            document.getElementById('clinicPhone').value = clinicSettings.phone || '';
            document.getElementById('clinicAddress').value = clinicSettings.address || '';
            const thankYouInput = document.getElementById('clinicReceiptThankYouText');
            if (thankYouInput) thankYouInput.value = clinicSettings.receiptThankYouText || '';
            document.getElementById('clinicSettingsModal').classList.remove('hidden');
        }
        
        function hideClinicSettingsModal() {
            document.getElementById('clinicSettingsModal').classList.add('hidden');
        }

        function showAddClinicModal() {
            try {
                if (typeof window.isSimpleVersion === 'function' && window.isSimpleVersion()) {
                    showToast('簡單版僅可使用一間診所，無法新增診所', 'error');
                    return;
                }
                if (typeof window.isAdvancedVersion === 'function' && !window.isAdvancedVersion()) {
                    showToast('「新增診所」為進階版系統專屬功能', 'error');
                    return;
                }
                const clinicLimit = (typeof window.getMaxClinics === 'function') ? window.getMaxClinics() : 3;
                const count = Array.isArray(clinicsList) ? clinicsList.length : 0;
                if (count >= clinicLimit) {
                    showToast('診所數量已達上限（' + clinicLimit + '），無法新增', 'error');
                    return;
                }
            } catch (_e) {}
            ['addClinicChineseName', 'addClinicEnglishName',
                'addClinicBusinessHoursStart', 'addClinicBusinessHoursEnd',
                'addClinicLunchStart', 'addClinicLunchEnd',
                'addClinicPhone', 'addClinicAddress', 'addClinicReceiptThankYouText'].forEach((id) => {
                const el = document.getElementById(id);
                if (el && 'value' in el) el.value = '';
            });
            const modal = document.getElementById('addClinicModal');
            if (modal) modal.classList.remove('hidden');
        }

        function hideAddClinicModal() {
            const modal = document.getElementById('addClinicModal');
            if (modal) modal.classList.add('hidden');
        }

        async function saveNewClinic() {
            const chineseName = String((document.getElementById('addClinicChineseName') || {}).value || '').trim();
            const englishName = String((document.getElementById('addClinicEnglishName') || {}).value || '').trim();
            const hours = collectBusinessHoursUI('addClinic');
            const phone = String((document.getElementById('addClinicPhone') || {}).value || '').trim();
            const address = String((document.getElementById('addClinicAddress') || {}).value || '').trim();
            const receiptThankYouText = String((document.getElementById('addClinicReceiptThankYouText') || {}).value || '').trim();
            if (!chineseName) {
                showToast('請輸入診所中文名稱！', 'error');
                return;
            }
            // 營業時間須成對且結束晚於開始；午飯須落在營業時間內
            if ((hours.start && !hours.end) || (!hours.start && hours.end)) {
                showToast('請完整設定診所營業時間（開始及結束）', 'error');
                return;
            }
            if (hours.start && hmToMinutes(hours.end) <= hmToMinutes(hours.start)) {
                showToast('診所結束時間必須晚於開始時間', 'error');
                return;
            }
            if ((hours.lunchStart && !hours.lunchEnd)
                || (!hours.lunchStart && hours.lunchEnd)
                || (hours.lunchStart && hmToMinutes(hours.lunchEnd) <= hmToMinutes(hours.lunchStart))) {
                showToast('請完整設定休息時間，且結束須晚於開始', 'error');
                return;
            }
            if (hours.start && hours.lunchStart
                && (hmToMinutes(hours.lunchStart) < hmToMinutes(hours.start)
                    || hmToMinutes(hours.lunchEnd) > hmToMinutes(hours.end))) {
                showToast('休息時間必須設定於診所營業時間之內', 'error');
                return;
            }
            try {
                const created = await window.firebaseDataManager.addClinic({
                    chineseName,
                    englishName,
                    businessHours: hours.businessHours,
                    businessHoursStart: hours.start,
                    businessHoursEnd: hours.end,
                    lunchStart: hours.lunchStart,
                    lunchEnd: hours.lunchEnd,
                    phone,
                    address,
                    receiptThankYouText,
                    receiptPaperSize: 'A5',
                    herbInventoryEnabled: true,
                    createdAt: new Date()
                });
                if (created && created.success && created.id) {
                    const listRes = await window.firebaseDataManager.getClinics();
                    clinicsList = listRes && listRes.success && Array.isArray(listRes.data) ? listRes.data : clinicsList;
                    try { localStorage.setItem('clinics', JSON.stringify(clinicsList)); } catch (_e) {}
                    hideAddClinicModal();
                    await setCurrentClinicId(created.id);
                    showToast('已新增診所', 'success');
                } else {
                    showToast((created && created.error) ? created.error : '新增診所失敗', 'error');
                }
            } catch (error) {
                console.error('新增診所失敗:', error);
                showToast('新增診所失敗', 'error');
            }
        }
        
        async function saveClinicSettings() {
            const chineseName = document.getElementById('clinicChineseName').value.trim();
            const englishName = document.getElementById('clinicEnglishName').value.trim();
            const hours = collectBusinessHoursUI('clinic');
            const phone = document.getElementById('clinicPhone').value.trim();
            const address = document.getElementById('clinicAddress').value.trim();
            const thankYouInput = document.getElementById('clinicReceiptThankYouText');
            const receiptThankYouText = thankYouInput ? thankYouInput.value.trim() : '';

            if (!chineseName) {
                showToast('請輸入診所中文名稱！', 'error');
                return;
            }
            // 營業時間須成對且結束晚於開始；午飯須落在營業時間內
            if ((hours.start && !hours.end) || (!hours.start && hours.end)) {
                showToast('請完整設定診所營業時間（開始及結束）', 'error');
                return;
            }
            if (hours.start && hmToMinutes(hours.end) <= hmToMinutes(hours.start)) {
                showToast('診所結束時間必須晚於開始時間', 'error');
                return;
            }
            if ((hours.lunchStart && !hours.lunchEnd)
                || (!hours.lunchStart && hours.lunchEnd)
                || (hours.lunchStart && hmToMinutes(hours.lunchEnd) <= hmToMinutes(hours.lunchStart))) {
                showToast('請完整設定休息時間，且結束須晚於開始', 'error');
                return;
            }
            if (hours.start && hours.lunchStart
                && (hmToMinutes(hours.lunchStart) < hmToMinutes(hours.start)
                    || hmToMinutes(hours.lunchEnd) > hmToMinutes(hours.end))) {
                showToast('休息時間必須設定於診所營業時間之內', 'error');
                return;
            }

            clinicSettings.chineseName = chineseName;
            clinicSettings.englishName = englishName;
            clinicSettings.businessHours = hours.businessHours;
            clinicSettings.businessHoursStart = hours.start;
            clinicSettings.businessHoursEnd = hours.end;
            clinicSettings.lunchStart = hours.lunchStart;
            clinicSettings.lunchEnd = hours.lunchEnd;
            clinicSettings.phone = phone;
            clinicSettings.address = address;
            clinicSettings.receiptThankYouText = receiptThankYouText;
            clinicSettings.updatedAt = new Date().toISOString();
            try {
                if (currentClinicId) {
                    await window.firebaseDataManager.updateClinic(currentClinicId, {
                        chineseName,
                        englishName,
                        businessHours: hours.businessHours,
                        businessHoursStart: hours.start,
                        businessHoursEnd: hours.end,
                        lunchStart: hours.lunchStart,
                        lunchEnd: hours.lunchEnd,
                        phone,
                        address,
                        receiptThankYouText,
                        updatedAt: clinicSettings.updatedAt
                    });
                    const listRes = await window.firebaseDataManager.getClinics();
                    clinicsList = listRes && listRes.success && Array.isArray(listRes.data) ? listRes.data : clinicsList;
                    updateClinicSettingsDisplay();
                    populateClinicSelectors();
                    updateCurrentClinicDisplay();
                    hideClinicSettingsModal();
                    showToast('診所資料已成功更新！', 'success');
                } else {
                    showToast('未選擇診所', 'error');
                }
            } catch (e) {
                showToast('更新診所資料失敗', 'error');
            }
        }

        async function saveSystemManagementClinicOptions() {
            if (!currentClinicId) {
                showToast('未選擇診所', 'error');
                return;
            }
            const toggleEl = document.getElementById('systemManagementHerbInventoryEnabled');
            const herbInventoryEnabled = !!(toggleEl ? toggleEl.checked : true);
            const payload = {
                herbInventoryEnabled,
                updatedAt: new Date().toISOString()
            };
            try {
                const result = await window.firebaseDataManager.updateClinic(currentClinicId, payload);
                if (!result || !result.success) {
                    showToast('儲存中藥存庫設定失敗', 'error');
                    return;
                }
                clinicSettings.herbInventoryEnabled = herbInventoryEnabled;
                clinicSettings.updatedAt = payload.updatedAt;
                if (Array.isArray(clinicsList)) {
                    clinicsList = clinicsList.map(c => (String(c.id) === String(currentClinicId) ? { ...c, ...payload } : c));
                    try { localStorage.setItem('clinics', JSON.stringify(clinicsList)); } catch (_e) {}
                }
                updateClinicSettingsDisplay();
                showToast('中藥存庫設定已儲存', 'success');
            } catch (error) {
                console.error('儲存中藥存庫設定失敗:', error);
                showToast('儲存中藥存庫設定失敗', 'error');
            }
        }
        
        function updateClinicSettingsDisplay() {
            // 更新系統管理頁面的診所設定顯示
            const chineseNameSpan = document.getElementById('displayChineseName');
            const englishNameSpan = document.getElementById('displayEnglishName');
            const activeClinicName = getClinicDisplayName(clinicSettings || {}) || '名醫診所系統';
            const showSystemManagementClinicName = Array.isArray(clinicsList) && clinicsList.length > 1;
            const systemManagementClinicNameRowEl = document.getElementById('systemManagementClinicNameRow');
            const systemManagementClinicNameEl = document.getElementById('systemManagementClinicName');
            const herbClinicNameEl = document.getElementById('systemManagementHerbClinicName');
            const permissionClinicNameEl = document.getElementById('permissionClinicName');
            const receiptClinicNameEl = document.getElementById('receiptCustomizationClinicName');
            const walletConfigClinicNameEl = document.getElementById('walletConfigClinicName');
            
            if (chineseNameSpan) {
                chineseNameSpan.textContent = clinicSettings.chineseName || '名醫診所系統';
            }
            if (englishNameSpan) {
                englishNameSpan.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
            }
            if (systemManagementClinicNameRowEl) {
                systemManagementClinicNameRowEl.classList.toggle('hidden', !showSystemManagementClinicName);
            }
            if (systemManagementClinicNameEl) {
                systemManagementClinicNameEl.textContent = activeClinicName;
            }
            if (herbClinicNameEl) {
                herbClinicNameEl.textContent = activeClinicName;
            }
            if (permissionClinicNameEl) {
                permissionClinicNameEl.textContent = activeClinicName;
            }
            if (receiptClinicNameEl) {
                receiptClinicNameEl.textContent = activeClinicName;
            }
            if (walletConfigClinicNameEl) {
                walletConfigClinicNameEl.textContent = activeClinicName;
            }
            // 診所切換時同步重新載入會員設定
            const walletConfigFormEl = document.getElementById('walletConfigForm');
            if (walletConfigFormEl && versionFeatureEnabled('membership') && typeof renderWalletConfigForm === 'function') {
                renderWalletConfigForm();
            }
            
            // 更新登入頁面的診所名稱
            const loginTitle = document.getElementById('loginTitle');
            const loginEnglishTitle = document.getElementById('loginEnglishTitle');
            if (loginTitle) {
                loginTitle.textContent = clinicSettings.chineseName || '名醫診所系統';
            }
            if (loginEnglishTitle) {
                loginEnglishTitle.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
            }
            
            // 更新主頁面的診所名稱
            const systemTitle = document.getElementById('systemTitle');
            const systemEnglishTitle = document.getElementById('systemEnglishTitle');
            if (systemTitle) {
                systemTitle.textContent = clinicSettings.chineseName || '名醫診所系統';
            }
            if (systemEnglishTitle) {
                systemEnglishTitle.textContent = clinicSettings.englishName || 'Dr.Great Clinic System';
            }
            
            // 更新歡迎頁面的診所名稱
            const welcomeTitle = document.getElementById('welcomeTitle');
            const welcomeEnglishTitle = document.getElementById('welcomeEnglishTitle');
            if (welcomeTitle) {
                welcomeTitle.textContent = `歡迎使用${clinicSettings.chineseName || '名醫診所系統'}`;
            }
            if (welcomeEnglishTitle) {
                welcomeEnglishTitle.textContent = `Welcome to ${clinicSettings.englishName || 'Dr.Great Clinic'}`;
            }
            applyReceiptCustomizationUI();
            applyClinicHerbInventoryToggleUI();
            try {
                if (typeof loadPermissionManagementPanel === 'function') {
                    loadPermissionManagementPanel();
                }
            } catch (_e) {}
            try {
                if (typeof updatePrescriptionDisplay === 'function') {
                    updatePrescriptionDisplay();
                }
            } catch (_e) {}
            try {
                if (typeof searchHerbsForPrescription === 'function') {
                    searchHerbsForPrescription();
                }
            } catch (_e) {}
        }

        async function saveReceiptCustomizationSettings() {
            if (!currentClinicId) {
                showToast('未選擇診所', 'error');
                return;
            }
            try {
                const paperSizeEl = document.getElementById('receiptPaperSizeSetting');
                const receiptPaperSize = normalizeReceiptPaperSize(paperSizeEl ? paperSizeEl.value : 'A5');
                clinicSettings.receiptFieldVisibility = collectReceiptCustomizationUI();
                clinicSettings.receiptPaperSize = receiptPaperSize;
                clinicSettings.updatedAt = new Date().toISOString();
                await window.firebaseDataManager.updateClinic(currentClinicId, {
                    receiptFieldVisibility: clinicSettings.receiptFieldVisibility,
                    receiptPaperSize: clinicSettings.receiptPaperSize,
                    updatedAt: clinicSettings.updatedAt
                });
                const listRes = await window.firebaseDataManager.getClinics();
                clinicsList = listRes && listRes.success && Array.isArray(listRes.data) ? listRes.data : clinicsList;
                try { localStorage.setItem('clinics', JSON.stringify(clinicsList)); } catch (_e) {}
                updateClinicSettingsDisplay();
                showToast('收據自定義設定已儲存', 'success');
            } catch (e) {
                console.error('儲存收據自定義設定失敗:', e);
                showToast('儲存收據自定義設定失敗', 'error');
            }
        }



        // 中藥庫管理功能
        let editingHerbId = null;
        let editingFormulaId = null;
        let currentHerbFilter = 'all';
        
        async function loadHerbLibrary() {
            // 若尚未載入中藥庫資料，才從 Firestore 重新載入
            if (typeof initHerbLibrary === 'function' && (!Array.isArray(herbLibrary) || herbLibrary.length === 0)) {
                await initHerbLibrary();
            }
            // 初始化庫存資料
            if (typeof initHerbInventory === 'function') {
                await initHerbInventory();
            }
            // 設置庫存類型下拉選單的預設值
            try {
                const invSelect = document.getElementById('inventoryTypeSelect');
                if (invSelect) {
                    invSelect.value = currentInventoryMode || 'granule';
                    currentHerbLibraryViewMode = invSelect.value;
                }
            } catch (_e) {
                // 忽略
            }
            // 計算全院中藥及方劑使用次數，供排序與卡片顯示
            if (typeof computeGlobalUsageCounts === 'function') {
                try {
                    await computeGlobalUsageCounts();
                } catch (_e) {
                    console.error('計算全院使用次數失敗：', _e);
                }
            }
            displayHerbLibrary();
            
            // 搜尋功能：當搜尋條件變化時重置至第一頁並重新渲染
            const searchInput = document.getElementById('searchHerb');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    paginationSettings.herbLibrary.currentPage = 1;
                    displayHerbLibrary();
                });
            }
        }
        
        function filterHerbLibrary(type) {
            currentHerbFilter = type;
            
            // 更新按鈕樣式
            document.querySelectorAll('[id^="filter-"]').forEach(btn => {
                btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-200';
            });
            document.getElementById(`filter-${type}`).className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 transition duration-200';
            
            // 切換分類時重置至第一頁並重新渲染
            paginationSettings.herbLibrary.currentPage = 1;
            displayHerbLibrary();
        }
        
        function displayHerbLibrary() {
            const searchTerm = document.getElementById('searchHerb').value.toLowerCase();
            const listContainer = document.getElementById('herbLibraryList');

            // 在搜尋條件下統計中藥庫數量，無論當前篩選類型為何。
            // 這允許「全部」按鈕顯示包括中藥材與方劑的總數量。
            // 另外也更新「中藥材」及「方劑」按鈕的數量提示，以便使用者快速瞭解各類型總數。
            (function updateHerbFilterCounts() {
                /**
                 * 根據搜尋條件過濾 herbLibrary。
                 * 為了讓使用者能夠搜尋到中藥材或方劑的詳細內容，
                 * 不再僅僅比對名稱或別名，而是將物件的所有主要欄位
                 * （字串或數值）合併為一段文字進行搜尋。
                 * 這樣可以支援搜尋性味、歸經、主治、用法等內容。
                 */
                const searchFiltered = Array.isArray(herbLibrary) ? herbLibrary.filter(item => {
                    try {
                        // 將所有值轉為字串並合併，用於全文搜尋
                        let combined = '';
                        Object.keys(item).forEach(key => {
                            if (key === 'id' || key === 'type') return;
                            const v = item[key];
                            if (!v) return;
                            if (Array.isArray(v)) {
                                combined += ' ' + v.join(' ');
                            } else if (typeof v === 'string' || typeof v === 'number') {
                                combined += ' ' + String(v);
                            }
                        });
                        combined = combined.toLowerCase();
                        return combined.includes(searchTerm);
                    } catch (_e) {
                        return false;
                    }
                }) : [];
                // 計算各類別總數時排除已停用的中藥材/方劑。
                let totalAll = 0;
                let totalHerbsAll = 0;
                let totalFormulasAll = 0;
                // 遍歷搜尋後的列表並累計非停用項目
                searchFiltered.forEach(item => {
                    let isDisabled = false;
                    try { const inv = getHerbInventoryFromView(item.id); isDisabled = inv && inv.disabled; } catch (_e) { isDisabled = false; }
                    // 只有在未被停用時才納入統計
                    if (!isDisabled) {
                        totalAll++;
                        if (item.type === 'herb') totalHerbsAll++;
                        if (item.type === 'formula') totalFormulasAll++;
                    }
                });
                // 新增計算已停用資料數量：根據庫存資訊中的 disabled 屬性
                const totalDisabledAll = searchFiltered.filter(item => { try { const inv = getHerbInventoryFromView(item.id); return inv && inv.disabled; } catch (_e) {} return false; }).length;
                // 更新各分類按鈕的顯示文字
                const allBtn = document.getElementById('filter-all');
                if (allBtn) {
                    allBtn.innerHTML = `全部 (${totalAll})`;
                }
                const herbBtn = document.getElementById('filter-herb');
                if (herbBtn) {
                    herbBtn.innerHTML = `中藥材 (${totalHerbsAll})`;
                }
                const formulaBtn = document.getElementById('filter-formula');
                if (formulaBtn) {
                    formulaBtn.innerHTML = `方劑 (${totalFormulasAll})`;
                }
                // 更新已停用分類按鈕的顯示文字
                const disabledBtn = document.getElementById('filter-disabled');
                if (disabledBtn) {
                    disabledBtn.innerHTML = `已停用 (${totalDisabledAll})`;
                }
            })();
            // 過濾資料：同樣使用全文搜尋，並根據類型篩選
            let filteredItems = Array.isArray(herbLibrary) ? herbLibrary.filter(item => {
                let matchesSearch = true;
                try {
                    let combined = '';
                    Object.keys(item).forEach(key => {
                        if (key === 'id' || key === 'type') return;
                        const v = item[key];
                        if (!v) return;
                        if (Array.isArray(v)) {
                            combined += ' ' + v.join(' ');
                        } else if (typeof v === 'string' || typeof v === 'number') {
                            combined += ' ' + String(v);
                        }
                    });
                    combined = combined.toLowerCase();
                    matchesSearch = combined.includes(searchTerm);
                } catch (_e) {
                    matchesSearch = false;
                }
                // 根據當前分類篩選。
                let matchesFilter = false;
                if (currentHerbFilter === 'all') {
                    matchesFilter = true;
                } else if (currentHerbFilter === 'herb') {
                    matchesFilter = item.type === 'herb';
                } else if (currentHerbFilter === 'formula') {
                    matchesFilter = item.type === 'formula';
                } else if (currentHerbFilter === 'disabled') {
                    // 已停用：需要檢查庫存資訊的 disabled 屬性
                    try { const inv = getHerbInventoryFromView(item.id); matchesFilter = inv && inv.disabled; } catch (_e) { matchesFilter = false; }
                }
                return matchesSearch && matchesFilter;
            }) : [];
            // 依照停用狀態與排序條件重新排序 filteredItems
            try {
                filteredItems.sort((a, b) => {
                    // 取得停用狀態，停用項目應排在最末
                    let invA = { disabled: false };
                    let invB = { disabled: false };
                    try {
                        invA = getHerbInventoryFromView(a.id) || { disabled: false };
                        invB = getHerbInventoryFromView(b.id) || { disabled: false };
                    } catch (_e) {
                        invA = { disabled: false };
                        invB = { disabled: false };
                    }
                    const disA = invA && invA.disabled ? 1 : 0;
                    const disB = invB && invB.disabled ? 1 : 0;
                    if (disA !== disB) {
                        // 停用 (1) 排在啟用 (0) 之後
                        return disA - disB;
                    }
                    // 如果已選擇排序方式，則在非停用條件下進行庫存或使用次數排序
                    if (herbSortOrder) {
                        // 庫存排序
                        if (herbSortOrder === 'most' || herbSortOrder === 'least') {
                            const qtyA = invA && typeof invA.quantity === 'number' ? invA.quantity : 0;
                            const qtyB = invB && typeof invB.quantity === 'number' ? invB.quantity : 0;
                            return herbSortOrder === 'most' ? qtyB - qtyA : qtyA - qtyB;
                        }
                        // 使用次數排序
                        if (herbSortOrder === 'useMost' || herbSortOrder === 'useLeast') {
                            const countA = (typeof a.usageCount === 'number') ? a.usageCount : 0;
                            const countB = (typeof b.usageCount === 'number') ? b.usageCount : 0;
                            return herbSortOrder === 'useMost' ? countB - countA : countA - countB;
                        }
                    }
                    // 若未設定排序方式，或排序比較值相同，保持原順序
                    return 0;
                });
            } catch (_e) {
                // 若排序過程出現錯誤則忽略排序
            }
            // 若無資料，顯示提示並清除分頁
            if (!filteredItems || filteredItems.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="mb-4 flex justify-center"><i data-lucide="leaf" class="w-10 h-10 text-[#D9782B]"></i></div>
                        <div class="text-lg font-medium mb-2">沒有找到相關資料</div>
                        <div class="text-sm">請嘗試其他搜尋條件或新增中藥材/方劑</div>
                    </div>
                `;
                // 隱藏分頁容器
                const paginEl = ensurePaginationContainer('herbLibraryList', 'herbLibraryPagination');
                if (paginEl) {
                    paginEl.innerHTML = '';
                    paginEl.classList.add('hidden');
                }
                return;
            }
            // 計算分頁並取得當前頁資料
            const totalItems = filteredItems.length;
            const itemsPerPage = paginationSettings.herbLibrary.itemsPerPage;
            let currentPage = paginationSettings.herbLibrary.currentPage;
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            // 防止當前頁超出範圍
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.herbLibrary.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = filteredItems.slice(startIdx, endIdx);
            // 計算當前篩選條件下各類型的總數（非頁面數量）
            // herbLibrary 包含中藥材與方劑兩種類型，這裡統計的是在篩選條件下
            // 所有符合條件的項目總數，避免只顯示當前頁的數量
            // 計算篩選後中藥材與方劑的數量。
            // 預設排除停用資料，除非當前分類是 disabled，則計算停用資料。
            let totalHerbsInFiltered = 0;
            let totalFormulasInFiltered = 0;
            filteredItems.forEach(item => {
                if (item.type === 'herb') {
                    let isDisabled = false;
                    try {
                        if (typeof getHerbInventory === 'function') {
                            const inv = getHerbInventory(item.id);
                            isDisabled = inv && inv.disabled;
                        }
                    } catch (_e) {
                        isDisabled = false;
                    }
                    // 排除停用項目，除非當前分類為 disabled
                    if (currentHerbFilter === 'disabled' || !isDisabled) {
                        totalHerbsInFiltered++;
                    }
                } else if (item.type === 'formula') {
                    let isDisabled = false;
                    try {
                        if (typeof getHerbInventory === 'function') {
                            const inv = getHerbInventory(item.id);
                            isDisabled = inv && inv.disabled;
                        }
                    } catch (_e) {
                        isDisabled = false;
                    }
                    if (currentHerbFilter === 'disabled' || !isDisabled) {
                        totalFormulasInFiltered++;
                    }
                }
            });
            // 按類型分組顯示分頁資料
            const herbsInPage = pageItems.filter(item => item.type === 'herb');
            const formulasInPage = pageItems.filter(item => item.type === 'formula');
            let html = '';
            if (herbsInPage.length > 0 && (currentHerbFilter === 'all' || currentHerbFilter === 'herb' || currentHerbFilter === 'disabled')) {
                html += `
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <i data-lucide="leaf" class="w-5 h-5 mr-2 text-[#D9782B]"></i>中藥材 (${totalHerbsInFiltered})
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${herbsInPage.map(herb => createHerbCard(herb)).join('')}
                        </div>
                    </div>
                `;
            }
            if (formulasInPage.length > 0 && (currentHerbFilter === 'all' || currentHerbFilter === 'formula' || currentHerbFilter === 'disabled')) {
                html += `
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <i data-lucide="clipboard-list" class="w-5 h-5 mr-2 text-blue-500"></i>方劑 (${totalFormulasInFiltered})
                        </h3>
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            ${formulasInPage.map(formula => createFormulaCard(formula)).join('')}
                        </div>
                    </div>
                `;
            }
            listContainer.innerHTML = html;
            // 產生分頁控制
            const paginationEl = ensurePaginationContainer('herbLibraryList', 'herbLibraryPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
                paginationSettings.herbLibrary.currentPage = newPage;
                displayHerbLibrary();
            }, paginationEl);
        }
        
        function createHerbCard(herb) {
            // 為避免 XSS，對文字內容進行轉義
            const safeName = window.escapeHtml(herb.name);
            const safeAlias = herb.alias ? window.escapeHtml(herb.alias) : null;
            // Retrieve englishName if available and escape it. englishName contains the romanised
            // name generated from the herb name. It may be undefined for legacy data. When
            // displaying the card we choose between the Chinese name or the English name based
            // on the current language stored in localStorage (default is zh). This mirrors
            // the behaviour used for acupoint cards: in English mode we hide the Chinese
            // name and show only the pinyin/English name, while in Chinese mode we show
            // only the Chinese name.
            const safeEnglishName = herb.englishName ? window.escapeHtml(herb.englishName) : null;
            // Determine which name to display
            let displayName = safeName;
            try {
                const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                if (langSel && langSel.toLowerCase().startsWith('en')) {
                    // In English mode prefer the englishName. If englishName is not
                    // available fall back to the Chinese name.
                    displayName = safeEnglishName || safeName;
                }
            } catch (_e) {
                // If accessing localStorage fails just use the Chinese name
                displayName = safeName;
            }
            // 新增性味、歸經與主治欄位的轉義處理
            const safeNature = herb.nature ? window.escapeHtml(herb.nature) : null;
            const safeMeridian = herb.meridian ? window.escapeHtml(herb.meridian) : null;
            const safeEffects = herb.effects ? window.escapeHtml(herb.effects) : null;
            const safeIndications = herb.indications ? window.escapeHtml(herb.indications) : null;
            const safeDosage = herb.dosage ? window.escapeHtml(String(herb.dosage)) : null;
            const safeCautions = herb.cautions ? window.escapeHtml(herb.cautions) : null;
            // 中藥卡片：僅顯示資訊，不提供編輯/刪除操作
            // 取得庫存資料（含停用狀態）
            const inv = getHerbInventoryFromView(herb.id);
            // 判斷是否停用以決定狀態標籤
            const isDisabled = inv && inv.disabled ? true : false;
            const statusLabel = isDisabled ? '停用' : '啟用';
            // Tailwind 樣式：停用用紅色背景，啟用用綠色背景
            const statusClass = isDisabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
            const qty = inv && typeof inv.quantity === 'number' ? inv.quantity : 0;
            const thr = inv && typeof inv.threshold === 'number' ? inv.threshold : 0;
            const unit = inv && inv.unit ? inv.unit : 'g';
            const factor = UNIT_FACTOR_MAP[unit] || 1;
            const qtyDisplay = (() => {
                const val = qty / factor;
                return parseFloat(val.toFixed(3)).toString();
            })();
            const thrDisplay = (() => {
                const val = thr / factor;
                return parseFloat(val.toFixed(3)).toString();
            })();
            // Translate unit label and inventory/alert labels based on current language
            const rawUnitLabel = UNIT_FACTOR_MAP && UNIT_LABEL_MAP ? UNIT_LABEL_MAP[unit] || '克' : '克';
            const unitLabelTranslated = (typeof window.t === 'function') ? window.t(rawUnitLabel) : rawUnitLabel;
            const inventoryLabel = (typeof window.t === 'function') ? window.t('庫存：') : '庫存：';
            const alertLabel = (typeof window.t === 'function') ? window.t('警戒：') : '警戒：';
            const stockColor = qty <= thr ? 'text-red-600 font-bold' : 'text-green-600';
            const canEditInventory = hasActionPermission('herbInventoryEdit');
            const editInventoryButtonHtml = canEditInventory
                ? `<button onclick="openInventoryModal('${herb.id}')" class="mt-2 sm:mt-0 sm:ml-auto bg-blue-100 hover:bg-blue-200 text-blue-700 rounded" style="padding:5px 10px;font-size:13px;line-height:1.3;">編輯庫存</button>`
                : '';
            const inventoryHtml = `
                <div class="mt-2 flex flex-col sm:flex-row items-center text-xs gap-x-3 gap-y-1">
                    <div class="whitespace-nowrap"><span class="font-medium text-gray-700">${inventoryLabel}</span><span class="${stockColor}"> ${qtyDisplay}${unitLabelTranslated}</span></div>
                    <div class="whitespace-nowrap"><span class="font-medium text-gray-700">${alertLabel}</span><span class="text-gray-600"> ${thrDisplay}${unitLabelTranslated}</span></div>
                    ${editInventoryButtonHtml}
                </div>
            `;
            // Build usage display based on language
            const usageCount = herb.usageCount || 0;
            const usageText = (() => {
                try {
                    const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                    if (langSel && langSel.toLowerCase().startsWith('en')) {
                        return `Used ${usageCount} times`;
                    }
                } catch (_e) {
                    // ignore errors reading localStorage
                }
                return `使用 ${usageCount} 次`;
            })();
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="text-lg font-semibold text-gray-900">${displayName}</h4>
                            ${safeAlias ? `<p class="text-sm text-gray-600">${safeAlias}</p>` : ''}
                        </div>
                        <span class="ml-2 text-xs px-2 py-1 rounded ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="space-y-2 text-sm">
                        ${safeNature ? `<div><span class="font-medium text-gray-700">性味：</span>${safeNature}</div>` : ''}
                        ${safeMeridian ? `<div><span class="font-medium text-gray-700">歸經：</span>${safeMeridian}</div>` : ''}
                        ${safeEffects ? `<div><span class="font-medium text-gray-700">功效：</span>${safeEffects}</div>` : ''}
                        ${safeIndications ? `<div><span class="font-medium text-gray-700">主治：</span>${safeIndications}</div>` : ''}
                        ${safeDosage ? `<div><span class="font-medium text-gray-700">劑量：</span><span class="text-blue-600 font-medium">${safeDosage}</span></div>` : ''}
                        ${safeCautions ? `<div><span class="font-medium text-red-600">注意：</span><span class="text-red-700">${safeCautions}</span></div>` : ''}
                    </div>
                    ${inventoryHtml}
                    <div class="mt-2 text-xs text-gray-500 text-right">${usageText}</div>
                </div>
            `;
        }
        
        function createFormulaCard(formula) {
            // 為避免 XSS，對文字內容進行轉義
            const safeName = window.escapeHtml(formula.name);
            // Retrieve englishName if available and escape it. englishName contains
            // the romanised name derived from the formula name. It may be undefined
            // for legacy data. Similar to herbs and acupoints, we decide between
            // the Chinese name and the English name based on the current language
            // setting stored in localStorage. In English mode only the englishName
            // is displayed; in Chinese mode only the Chinese name is shown.
            const safeEnglishName = formula.englishName ? window.escapeHtml(formula.englishName) : null;
            let displayName = safeName;
            try {
                const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                if (langSel && langSel.toLowerCase().startsWith('en')) {
                    displayName = safeEnglishName || safeName;
                }
            } catch (_e) {
                displayName = safeName;
            }
            const safeSource = formula.source ? window.escapeHtml(formula.source) : null;
            const safeEffects = formula.effects ? window.escapeHtml(formula.effects) : null;
            // 新增主治與用法欄位的轉義處理
            const safeIndications = formula.indications ? window.escapeHtml(formula.indications) : null;
            const safeComposition = formula.composition ? window.escapeHtml(formula.composition).replace(/\n/g, '<br>') : null;
            const safeUsage = formula.usage ? window.escapeHtml(formula.usage) : null;
            const safeCautions = formula.cautions ? window.escapeHtml(formula.cautions) : null;
            // 方劑卡片：僅顯示資訊，不提供編輯/刪除操作
            // 取得庫存資料（含停用狀態）
            const inv = getHerbInventoryFromView(formula.id);
            // 判斷是否停用以決定狀態標籤
            const isDisabled = inv && inv.disabled ? true : false;
            const statusLabel = isDisabled ? '停用' : '啟用';
            const statusClass = isDisabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
            const qty = inv && typeof inv.quantity === 'number' ? inv.quantity : 0;
            const thr = inv && typeof inv.threshold === 'number' ? inv.threshold : 0;
            const unit = inv && inv.unit ? inv.unit : 'g';
            const factor = UNIT_FACTOR_MAP[unit] || 1;
            const qtyDisplay = (() => {
                const val = qty / factor;
                return parseFloat(val.toFixed(3)).toString();
            })();
            const thrDisplay = (() => {
                const val = thr / factor;
                return parseFloat(val.toFixed(3)).toString();
            })();
            const rawUnitLabel = UNIT_LABEL_MAP[unit] || '克';
            const unitLabelTranslated = (typeof window.t === 'function') ? window.t(rawUnitLabel) : rawUnitLabel;
            const inventoryLabel = (typeof window.t === 'function') ? window.t('庫存：') : '庫存：';
            const alertLabel = (typeof window.t === 'function') ? window.t('警戒：') : '警戒：';
            const stockColor = qty <= thr ? 'text-red-600 font-bold' : 'text-green-600';
            const canEditInventory = hasActionPermission('herbInventoryEdit');
            const editInventoryButtonHtml = canEditInventory
                ? `<button onclick="openInventoryModal('${formula.id}')" class="mt-2 sm:mt-0 sm:ml-auto bg-blue-100 hover:bg-blue-200 text-blue-700 rounded" style="padding:5px 10px;font-size:13px;line-height:1.3;">編輯庫存</button>`
                : '';
            const inventoryHtml = `
                <div class="mt-2 flex flex-col sm:flex-row items-center text-xs gap-x-3 gap-y-1">
                    <div class="whitespace-nowrap"><span class="font-medium text-gray-700">${inventoryLabel}</span><span class="${stockColor}"> ${qtyDisplay}${unitLabelTranslated}</span></div>
                    <div class="whitespace-nowrap"><span class="font-medium text-gray-700">${alertLabel}</span><span class="text-gray-600"> ${thrDisplay}${unitLabelTranslated}</span></div>
                    ${editInventoryButtonHtml}
                </div>
            `;
            // Build usage display based on language
            const usageCountF = formula.usageCount || 0;
            const usageTextF = (() => {
                try {
                    const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                    if (langSel && langSel.toLowerCase().startsWith('en')) {
                        return `Used ${usageCountF} times`;
                    }
                } catch (_e) {
                    /* ignore */
                }
                return `使用 ${usageCountF} 次`;
            })();
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="text-lg font-semibold text-gray-900">${displayName}</h4>
                            ${safeSource ? `<p class="text-sm text-gray-600">出處：${safeSource}</p>` : ''}
                        </div>
                        <span class="ml-2 text-xs px-2 py-1 rounded ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="space-y-3 text-sm">
                        ${safeEffects ? `<div><span class="font-medium text-gray-700">功效：</span>${safeEffects}</div>` : ''}
                        ${safeIndications ? `<div><span class="font-medium text-gray-700">主治：</span>${safeIndications}</div>` : ''}
                        ${safeComposition ? `
                            <div>
                                <span class="font-medium text-gray-700">組成：</span>
                                <div class="mt-1 p-2 bg-yellow-50 rounded text-xs whitespace-pre-line border-l-2 border-yellow-400">${safeComposition}</div>
                            </div>
                        ` : ''}
                        ${safeUsage ? `<div><span class="font-medium text-gray-700">用法：</span>${safeUsage}</div>` : ''}
                        ${safeCautions ? `<div><span class="font-medium text-red-600">注意：</span><span class="text-red-700">${safeCautions}</span></div>` : ''}
                    </div>
                    ${inventoryHtml}
                    <div class="mt-2 text-xs text-gray-500 text-right">${usageTextF}</div>
                </div>
            `;
        }
        
        // 中藥材表單功能
        function showAddHerbForm() {
            editingHerbId = null;
            document.getElementById('herbFormTitle').textContent = '新增中藥材';
            document.getElementById('herbSaveButtonText').textContent = '儲存';
            clearHerbForm();
            document.getElementById('addHerbModal').classList.remove('hidden');
        }
        
        function hideAddHerbForm() {
            document.getElementById('addHerbModal').classList.add('hidden');
            clearHerbForm();
            editingHerbId = null;
        }
        
        function clearHerbForm() {
            // 清除中藥材表單欄位（包含性味、歸經與主治）
            ['herbName', 'herbAlias', 'herbNature', 'herbMeridian', 'herbEffects', 'herbIndications', 'herbDosage', 'herbCautions', 'herbStock', 'herbThreshold'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }
        
        
        
        async function saveHerb() {
            const name = document.getElementById('herbName').value.trim();
            
            if (!name) {
                showToast('請輸入中藥材名稱！', 'error');
                return;
            }
            
            // 讀取庫存與警戒值
            const stockVal = parseFloat(document.getElementById('herbStock') && document.getElementById('herbStock').value);
            const thresholdVal = parseFloat(document.getElementById('herbThreshold') && document.getElementById('herbThreshold').value);
            // 組合中藥物件（包含性味、歸經與主治欄位，以及庫存資訊）
            const herb = {
                id: editingHerbId || Date.now(),
                type: 'herb',
                name: name,
                alias: document.getElementById('herbAlias').value.trim(),
                nature: document.getElementById('herbNature').value.trim(),
                meridian: document.getElementById('herbMeridian').value.trim(),
                effects: document.getElementById('herbEffects').value.trim(),
                indications: document.getElementById('herbIndications').value.trim(),
                dosage: document.getElementById('herbDosage').value.trim(),
                cautions: document.getElementById('herbCautions').value.trim(),
                stock: isNaN(stockVal) ? 0 : stockVal,
                threshold: isNaN(thresholdVal) ? 0 : thresholdVal,
                createdAt: editingHerbId ? herbLibrary.find(h => h.id === editingHerbId).createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            if (editingHerbId) {
                const index = herbLibrary.findIndex(item => item.id === editingHerbId);
                herbLibrary[index] = herb;
                showToast('中藥材資料已更新！', 'success');
            } else {
                herbLibrary.push(herb);
                showToast('中藥材已新增！', 'success');
            }
            // 同步庫存至 Firebase Realtime Database
            try {
                if (typeof setHerbInventory === 'function') {
                    // 新增或更新中藥材時，預設使用克 (g) 為單位儲存庫存
                    await setHerbInventory(herb.id, herb.stock, herb.threshold, 'g');
                }
            } catch (err) {
                console.error('更新中藥庫存至雲端資料庫失敗:', err);
            }
            // 不再將中藥材資料寫入 Firestore；資料僅保留於本地陣列
            hideAddHerbForm();
            displayHerbLibrary();
        }
        
        // 方劑表單功能
        function showAddFormulaForm() {
            editingFormulaId = null;
            document.getElementById('formulaFormTitle').textContent = '新增方劑';
            document.getElementById('formulaSaveButtonText').textContent = '儲存';
            clearFormulaForm();
            document.getElementById('addFormulaModal').classList.remove('hidden');
        }
        
        function hideAddFormulaForm() {
            document.getElementById('addFormulaModal').classList.add('hidden');
            clearFormulaForm();
            editingFormulaId = null;
        }
        
        function clearFormulaForm() {
            // 清除方劑表單欄位（包含主治與用法）
            ['formulaName', 'formulaSource', 'formulaEffects', 'formulaComposition', 'formulaCautions', 'formulaIndications', 'formulaUsage', 'formulaStock', 'formulaThreshold'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }
        
        
        
        async function saveFormula() {
            const name = document.getElementById('formulaName').value.trim();
            const composition = document.getElementById('formulaComposition').value.trim();
            
            if (!name) {
                showToast('請輸入方劑名稱！', 'error');
                return;
            }
            
            if (!composition) {
                showToast('請輸入方劑組成！', 'error');
                return;
            }
            
            // 讀取庫存與警戒值
            const stockValF = parseFloat(document.getElementById('formulaStock') && document.getElementById('formulaStock').value);
            const thresholdValF = parseFloat(document.getElementById('formulaThreshold') && document.getElementById('formulaThreshold').value);
            // 組合方劑物件（包含主治與用法欄位及庫存資訊）
            const formula = {
                id: editingFormulaId || Date.now(),
                type: 'formula',
                name: name,
                source: document.getElementById('formulaSource').value.trim(),
                effects: document.getElementById('formulaEffects').value.trim(),
                indications: document.getElementById('formulaIndications').value.trim(),
                composition: composition,
                usage: document.getElementById('formulaUsage').value.trim(),
                cautions: document.getElementById('formulaCautions').value.trim(),
                stock: isNaN(stockValF) ? 0 : stockValF,
                threshold: isNaN(thresholdValF) ? 0 : thresholdValF,
                createdAt: editingFormulaId ? herbLibrary.find(f => f.id === editingFormulaId).createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            if (editingFormulaId) {
                const index = herbLibrary.findIndex(item => item.id === editingFormulaId);
                herbLibrary[index] = formula;
                showToast('方劑資料已更新！', 'success');
            } else {
                herbLibrary.push(formula);
                showToast('方劑已新增！', 'success');
            }
            // 同步庫存至 Firebase Realtime Database
            try {
                if (typeof setHerbInventory === 'function') {
                    // 新增或更新方劑時，預設使用克 (g) 為單位儲存庫存
                    await setHerbInventory(formula.id, formula.stock, formula.threshold, 'g');
                }
            } catch (err) {
                console.error('更新方劑庫存至雲端資料庫失敗:', err);
            }
            // 不再將方劑資料寫入 Firestore；資料僅保留於本地陣列
            hideAddFormulaForm();
            displayHerbLibrary();
        }
        
        


        // 穴位庫管理功能
        /**
         * 初始化穴位庫資料。
         * 從本地 data 資料夾讀取 acupointLibrary.json。
         * 若檔案不存在或解析失敗，將使用預設資料填充。
         * @param {boolean} forceRefresh - 是否強制重新載入資料
         */
        async function initAcupointLibrary(forceRefresh = false) {
            if (acupointLibraryLoaded && !forceRefresh) {
                return;
            }
            try {
                const data = await fetchJsonWithFallback('acupointLibrary.json');
                // 支援資料根節點為 acupointLibrary 或直接為陣列
                let items = [];
                if (data) {
                    if (Array.isArray(data)) {
                        items = data;
                    } else if (Array.isArray(data.acupointLibrary)) {
                        items = data.acupointLibrary;
                    } else if (Array.isArray(data.acupoints)) {
                        items = data.acupoints;
                    }
                }
                // 確保每筆資料存在 id，若缺失則以當前時間戳加索引生成
                acupointLibrary = items.map((item, idx) => {
                    const newItem = { ...item };
                    if (!newItem.id) {
                        newItem.id = Date.now() + idx;
                    }
                    // 規範 functions 與 indications 為陣列
                    if (newItem.functions && !Array.isArray(newItem.functions)) {
                        newItem.functions = String(newItem.functions).split(/\n+/).map(s => s.trim()).filter(Boolean);
                    }
                    if (newItem.indications && !Array.isArray(newItem.indications)) {
                        newItem.indications = String(newItem.indications).split(/\n+/).map(s => s.trim()).filter(Boolean);
                    }
                    if (!newItem.location && newItem['定位']) {
                        newItem.location = String(newItem['定位']);
                    }
                    if (typeof newItem.x === 'string' && !Number.isNaN(parseFloat(newItem.x))) {
                        newItem.x = parseFloat(newItem.x);
                    }
                    if (typeof newItem.y === 'string' && !Number.isNaN(parseFloat(newItem.y))) {
                        newItem.y = parseFloat(newItem.y);
                    }
                    return newItem;
                });
                acupointLibraryLoaded = true;
                try { if (typeof window !== 'undefined') { window.acupointLibrary = acupointLibrary; } } catch (_e) {}
                try { if (typeof window.applyAcupointCoordinates === 'function') { window.applyAcupointCoordinates(); } } catch (_e) {}
            } catch (err) {
                console.error('無法讀取穴位庫資料：', err);
                // fallback：使用預設範例資料
                acupointLibrary = [
                    {
                        id: Date.now(),
                        name: '中府',
                        meridian: '手太陰肺經',
                        location: '胸外側部，雲門下1寸，平第一肋間隙，距前正中線6寸',
                        functions: ['宣肺理氣', '止咳平喘', '清熱化痰'],
                        indications: ['咳嗽', '氣喘', '胸痛', '肩背痛', '皮膚病'],
                        method: '斜刺或平刺0.5-0.8寸',
                        category: '肺之募穴',
                        // createdAt 與 updatedAt 留在這裡，座標請在外部模組 acupointIntegration.js 中定義
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }
                ];
                acupointLibraryLoaded = true;
                try { if (typeof window !== 'undefined') { window.acupointLibrary = acupointLibrary; } } catch (_e) {}
                try { if (typeof window.applyAcupointCoordinates === 'function') { window.applyAcupointCoordinates(); } } catch (_e) {}
            }
        }

        /**
         * 載入穴位庫管理畫面。若資料尚未初始化，會先讀取資料。
         * 綁定搜尋輸入框的事件，當搜尋字串變化時重置頁碼並重新渲染列表。
         */
        async function loadAcupointLibrary() {
            // 權限檢查：護理師與診所管理者、醫師可使用；其他角色禁止
            if (!hasAccessToSection('acupointLibrary')) {
                showToast('權限不足，無法存取穴位庫管理', 'error');
                return;
            }
            // 若尚未載入資料則初始化
            if (!acupointLibraryLoaded || !Array.isArray(acupointLibrary) || acupointLibrary.length === 0) {
                await initAcupointLibrary();
            }
            // 綁定搜尋事件：僅綁定一次
            const searchInput = document.getElementById('searchAcupoint');
            if (searchInput && !searchInput.dataset.listenerAdded) {
                searchInput.addEventListener('input', function() {
                    // 搜尋時重置頁碼為 1
                    paginationSettings.acupointLibrary.currentPage = 1;
                    displayAcupointLibrary();
                });
                searchInput.dataset.listenerAdded = 'true';
            }
            // 初次或重新載入時顯示列表
            displayAcupointLibrary();
            // 在載入列表後初始化穴位 Leaflet 地圖，確保容器已存在於 DOM
            if (typeof initAcupointMap === 'function') {
                try {
                    initAcupointMap();
                } catch (_err) {
                    console.warn('初始化穴位地圖失敗:', _err);
                }
            }
        }

        /**
         * 切換經絡篩選條件並更新列表。
         * @param {string} meridian - 篩選的經絡名稱或 'all' 表示全部
         */
        function filterAcupointLibrary(meridian) {
            currentAcupointFilter = meridian;
            // 重置當前頁碼為 1
            paginationSettings.acupointLibrary.currentPage = 1;
            // 更新按鈕樣式
            // 取得分類篩選容器。前端 HTML 使用 id="acupointFilterContainer"
            // 這裡修正名稱以避免與不存在的 acupointFilterButtons 不符導致無法更新按鈕樣式
            const container = document.getElementById('acupointFilterContainer');
            if (container) {
                Array.from(container.children).forEach(btn => {
                    btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-200';
                });
                const safeId = meridian === 'all' ? 'all' : meridian.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                const selectedBtn = document.getElementById('acupoint-filter-' + safeId);
                if (selectedBtn) {
                    selectedBtn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 transition duration-200';
                }
            }
            displayAcupointLibrary();
        }

        /**
         * 根據搜尋及篩選條件顯示穴位庫列表，並處理分頁。
         */
        function displayAcupointLibrary() {
            const listContainer = document.getElementById('acupointLibraryList');
            const searchInput = document.getElementById('searchAcupoint');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            const termNormalized = searchTerm ? searchTerm.replace(/[\s-]/g, '') : '';
            // 依搜尋字串過濾資料
            const searchFiltered = Array.isArray(acupointLibrary) ? acupointLibrary.filter(item => {
                const nameMatch = item.name && item.name.toLowerCase().includes(searchTerm);
                const meridianMatch = item.meridian && item.meridian.toLowerCase().includes(searchTerm);
                const locationMatch = item.location && item.location.toLowerCase().includes(searchTerm);
                const funcMatch = item.functions && Array.isArray(item.functions) ? item.functions.join(' ').toLowerCase().includes(searchTerm) : (item.functions ? String(item.functions).toLowerCase().includes(searchTerm) : false);
                const indMatch = item.indications && Array.isArray(item.indications) ? item.indications.join(' ').toLowerCase().includes(searchTerm) : (item.indications ? String(item.indications).toLowerCase().includes(searchTerm) : false);
                // 針法/治療方法搜尋
                const methodMatch = item.method && item.method.toLowerCase().includes(searchTerm);
                // 分類搜尋
                const categoryMatch = item.category && item.category.toLowerCase().includes(searchTerm);
                const engMatch = item.englishName && item.englishName.toLowerCase().includes(searchTerm);
                const codeStr = item.internationalCode ? item.internationalCode.toLowerCase() : '';
                const codeNorm = codeStr ? codeStr.replace(/[\s-]/g, '') : '';
                const codeMatch = (codeStr && codeStr.includes(searchTerm)) || (termNormalized && codeNorm.includes(termNormalized));
                return nameMatch || meridianMatch || locationMatch || funcMatch || indMatch || methodMatch || categoryMatch || engMatch || codeMatch;
            }) : [];
            // 計算各經絡的總數量，用於篩選按鈕顯示
            const meridianCounts = {};
            searchFiltered.forEach(item => {
                const m = item.meridian || '';
                if (!meridianCounts[m]) meridianCounts[m] = 0;
                meridianCounts[m]++;
            });
            // 更新篩選按鈕
            // 取得分類篩選容器。前端 HTML 使用 id="acupointFilterContainer"
            // 修正 ID 名稱，避免因為找不到元素而不顯示分類按鈕
            const filterContainer = document.getElementById('acupointFilterContainer');
            if (filterContainer) {
                filterContainer.innerHTML = '';
                // 全部按鈕
                const allBtn = document.createElement('button');
                allBtn.id = 'acupoint-filter-all';
                const totalAll = searchFiltered.length;
                allBtn.textContent = totalAll > 0 ? `全部 (${totalAll})` : '全部 (0)';
                allBtn.className = 'px-4 py-2 rounded-lg text-sm font-medium ' + (currentAcupointFilter === 'all' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200') + ' transition duration-200';
                allBtn.addEventListener('click', () => filterAcupointLibrary('all'));
                filterContainer.appendChild(allBtn);
                // 其他經絡按鈕
                Object.keys(meridianCounts).forEach(m => {
                    const btn = document.createElement('button');
                    const safeId = m.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                    btn.id = 'acupoint-filter-' + safeId;
                    btn.textContent = `${m} (${meridianCounts[m]})`;
                    btn.className = 'px-4 py-2 rounded-lg text-sm font-medium ' + (currentAcupointFilter === m ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200') + ' transition duration-200';
                    btn.addEventListener('click', () => filterAcupointLibrary(m));
                    filterContainer.appendChild(btn);
                });
            }
            // 根據經絡篩選
            const meridianFiltered = currentAcupointFilter === 'all' ? searchFiltered : searchFiltered.filter(item => item.meridian === currentAcupointFilter);
            // 若無資料，顯示提示並隱藏分頁
            if (!meridianFiltered || meridianFiltered.length === 0) {
                listContainer.innerHTML = `\n                    <div class="text-center py-12 text-gray-500">\n                        <div class="mb-4 flex justify-center"><i data-lucide="map-pin" class="w-10 h-10 text-blue-500"></i></div>\n                        <div class="text-lg font-medium mb-2">沒有找到相關穴位</div>\n                        <div class="text-sm">請嘗試其他搜尋條件</div>\n                    </div>\n                `;
                const paginEl = ensurePaginationContainer('acupointLibraryList', 'acupointLibraryPagination');
                if (paginEl) {
                    paginEl.innerHTML = '';
                    paginEl.classList.add('hidden');
                }
                return;
            }
            // 計算分頁
            const totalItems = meridianFiltered.length;
            const itemsPerPage = paginationSettings.acupointLibrary.itemsPerPage;
            let currentPage = paginationSettings.acupointLibrary.currentPage;
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.acupointLibrary.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = meridianFiltered.slice(startIdx, endIdx);
            // 依照經絡分組
            const groups = {};
            pageItems.forEach(item => {
                const m = item.meridian || '';
                if (!groups[m]) groups[m] = [];
                groups[m].push(item);
            });
            let html = '';
            Object.keys(groups).forEach(m => {
                // 取得此經絡在搜尋條件下的總數量
                const totalForMeridian = meridianCounts[m] || groups[m].length;
                html += `\n                    <div class="mb-8">\n                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">\n                            <i data-lucide="map-pin" class="w-5 h-5 mr-2 text-blue-500"></i>${window.escapeHtml(m)} (${totalForMeridian})\n                        </h3>\n                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">\n                            ${groups[m].map(ac => createAcupointCard(ac)).join('')}\n                        </div>\n                    </div>\n                `;
            });
            listContainer.innerHTML = html;
            // 渲染分頁控制
            const paginationEl = ensurePaginationContainer('acupointLibraryList', 'acupointLibraryPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
                paginationSettings.acupointLibrary.currentPage = newPage;
                displayAcupointLibrary();
            }, paginationEl);
        }

        /**
         * 建立單一穴位的卡片 HTML 字串。
         * @param {object} ac - 穴位資料物件
         * @returns {string}
         */
        function createAcupointCard(ac) {
            // 將穴位名稱定義為可再指派的變數，以便後續使用組合名稱覆蓋
            let safeName = window.escapeHtml(ac.name || '');
            // 新增英譯名稱與國際編碼的處理。從資料中讀取英譯名稱 (englishName) 與國際編碼 (internationalCode)，若不存在則使用空字串。
            const safeEnglishName = ac.englishName ? window.escapeHtml(ac.englishName) : '';
            const safeCode = ac.internationalCode ? window.escapeHtml(ac.internationalCode) : '';
            // 組合顯示名稱：根據介面語言決定是否顯示中文
            // 取得目前語言設定，預設為中文（zh）。localStorage.getItem('lang') 在英文版會是 'en'
            const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
            let displayName;
            if (lang === 'en' && safeEnglishName) {
                // 英文介面：僅顯示英文名稱，不含中文
                displayName = safeEnglishName;
            } else {
                // 中文介面或沒有英文名稱：僅顯示中文名稱
                displayName = safeName;
            }
            // 如有國際編碼，一律加上 (國際編碼)
            if (safeCode) {
                displayName += ' (' + safeCode + ')';
            }
            // 將組合後的名稱覆蓋回 safeName，讓卡片標題使用
            safeName = displayName;
            const safeMeridian = ac.meridian ? window.escapeHtml(ac.meridian) : '';
            const safeLocation = ac.location ? window.escapeHtml(ac.location) : '';
            const funcs = Array.isArray(ac.functions) ? ac.functions : (ac.functions ? [ac.functions] : []);
            const inds = Array.isArray(ac.indications) ? ac.indications : (ac.indications ? [ac.indications] : []);
            const safeFunctions = funcs.length > 0 ? funcs.map(item => window.escapeHtml(item)).join('、') : '';
            const safeIndications = inds.length > 0 ? inds.map(item => window.escapeHtml(item)).join('、') : '';
            const safeMethod = ac.method ? window.escapeHtml(ac.method) : '';
            const safeCategory = ac.category ? window.escapeHtml(ac.category) : '';
            return `\n                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">\n                    <div class="flex justify-between items-start mb-3">\n                        <div>\n                            <h4 class="text-lg font-semibold text-gray-900">${safeName}</h4>\n                            ${safeMeridian ? `<p class="text-sm text-gray-600">${safeMeridian}</p>` : ''}\n                        </div>\n                    </div>\n                    <div class="space-y-2 text-sm">\n                        ${safeLocation ? `<div><span class="font-medium text-gray-700">定位：</span>${safeLocation}</div>` : ''}\n                        ${safeFunctions ? `<div><span class="font-medium text-gray-700">功能：</span>${safeFunctions}</div>` : ''}\n                        ${safeIndications ? `<div><span class="font-medium text-gray-700">主治：</span>${safeIndications}</div>` : ''}\n                        ${safeMethod ? `<div><span class="font-medium text-gray-700">針法：</span>${safeMethod}</div>` : ''}\n                        ${safeCategory ? `<div><span class="font-medium text-gray-700">穴性：</span>${safeCategory}</div>` : ''}\n                    </div>\n                </div>\n            `;
        }

        /**
         * 以下函式與 UI 操作相關，用於新增、編輯與刪除穴位資料。
         * 現在系統改用只讀模式，如需重新啟用此功能，可重新撰寫相應的表單與事件處理邏輯。
         */

        // 收費項目管理功能
        let editingBillingItemId = null;
        let currentBillingFilter = 'all';
        
/* Phase 5 ESM: billing items management UI (10 fns) moved to js/domains/billing/items.js; window facades in js/app.js; original block removed */
// [Phase 6A moved] Consultation form: prescription + in-consultation billing operations -> js/domains/consultation/form.js
        let prescriptions = [{ name: '處方', items: [], days: 5, freq: 2, mode: (currentInventoryMode === 'slice' ? 'slice' : 'granule') }];
        let activePrescriptionIndex = 0;
        let selectedPrescriptionItems = prescriptions[activePrescriptionIndex].items;
        let selectedBillingItems = [];
        
        // 清空診症表單時也要清空處方搜索



        // 獲取用戶顯示名稱（姓名全名 + 職位）
        function getUserDisplayName(user) {
            if (!user || !user.name) return '未知用戶';

            const fullName = user.name;
            const position = user.position || '用戶';

            // 使用國際化函式翻譯職位名稱，如果當前語言為中文，翻譯結果會與原文一致。
            const translate = typeof window.t === 'function' ? window.t : (s) => s;
            const translatedPosition = translate(position);
            // 若翻譯後的職位與原職位不同（例如英文界面），則在姓名與職位之間插入空格。
            const joiner = translatedPosition !== position ? ' ' : '';
            return `${fullName}${joiner}${translatedPosition}`;
        }
        
        // 獲取醫師顯示名稱
        function getDoctorDisplayName(doctorRole) {
            if (!doctorRole) return '未記錄';
    if (isGeneralRegistrationDoctorValue(doctorRole)) {
        return GENERAL_REGISTRATION_LABEL;
    }
            
            // 如果是舊的固定值，直接返回
            if (doctorRole === 'doctor') {
                return '張中醫師醫師';
            }
            
            // 尋找對應的醫師用戶
            const doctorUser = users.find(u => u.username === doctorRole);
            if (doctorUser) {
                return getUserDisplayName(doctorUser);
            }
            
            // 如果找不到，返回原值
            return doctorRole;
        }
        
        // 獲取醫師註冊編號
        function getDoctorRegistrationNumber(doctorRole) {
            if (!doctorRole) return null;
    if (isGeneralRegistrationDoctorValue(doctorRole)) {
        return null;
    }
            
            // 如果是舊的固定值，返回預設註冊編號
            if (doctorRole === 'doctor') {
                return 'CM001234';
            }
            
            // 尋找對應的醫師用戶
            const doctorUser = users.find(u => u.username === doctorRole);
            if (doctorUser && doctorUser.position === '醫師') {
                return doctorUser.registrationNumber || null;
            }
            
            return null;
        }
        
// 用戶管理功能
/* Phase 3 ESM 遷移：員工與權限管理（23 函式）已移至 js/domains/auth/staff.js，window facade 見 js/app.js；原 system.js 段落已刪除 */

// 財務報表功能
/* Phase 5 ESM: financial reports cluster (71 fns + private cache/filter states) moved to js/domains/billing/reports.js; window facades in js/app.js; original block removed */
/* Phase 5 ESM: clinic expenses (16 fns) moved to js/domains/billing/expenses.js; window facades in js/app.js; original block removed */
// ================== 資料備份與還原相關函式 ==================
/**
 * 等待 Firebase DataManager 準備就緒的輔助函式。
 * 某些情況下網頁載入時 Firebase 仍在初始化，直接讀取資料會失敗。
 */
async function ensureFirebaseReady() {
    if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
        for (let i = 0; i < 100 && (!window.firebaseDataManager || !window.firebaseDataManager.isReady); i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
}

// ================== 雲端備份（Cloudflare R2）相關函式 ==================
/**
 * 雲端備份端點（Cloudflare Pages Functions）。
 * 同步在伺服器端以 Service Account 讀 Firestore，下載只經 R2，不產生 Firestore 讀取。
 */
const CLOUD_BACKUP_BASE = '/api/backup';

async function getBackupAuthToken() {
    await ensureFirebaseReady();
    const user = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
    if (!user) throw new Error('尚未登入，無法操作雲端備份');
    return user.getIdToken();
}

async function callBackupApi(path, fetchOptions) {
    const token = await getBackupAuthToken();
    const response = await fetch(CLOUD_BACKUP_BASE + path, Object.assign({
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
    }, fetchOptions, {
        headers: Object.assign(
            { 'Authorization': 'Bearer ' + token },
            (fetchOptions && fetchOptions.headers) || {}
        )
    }));
    let data = null;
    try {
        data = await response.json();
    } catch (_parseErr) {
        data = null;
    }
    if (!response.ok) {
        const error = new Error((data && data.message) || ('雲端備份服務回應異常（HTTP ' + response.status + '）'));
        error.status = response.status;
        error.code = data && data.error;
        throw error;
    }
    return data;
}

function formatBackupDateTime(iso) {
    if (!iso) return '尚未執行';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return String(iso);
    return date.toLocaleString('zh-Hant-HK', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function setBackupCloudStatus(message, tone) {
    const el = document.getElementById('backupCloudStatus');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('text-gray-500', 'text-green-600', 'text-red-600', 'text-amber-600');
    el.classList.add(tone === 'success'
        ? 'text-green-600'
        : tone === 'error'
            ? 'text-red-600'
            : tone === 'warn'
                ? 'text-amber-600'
                : 'text-gray-500');
}

/**
 * 讀取並顯示最近雲端備份狀態。
 */
// 狀態請求序號：換帳號期間舊請求可能較晚返回，過期結果不寫入狀態列
let backupStatusRequestSeq = 0;

async function refreshCloudBackupStatus() {
    const seq = ++backupStatusRequestSeq;
    try {
        const status = await callBackupApi('/status');
        if (seq !== backupStatusRequestSeq) return status;
        const lastRun = status.lastRun || {};
        const lines = [];
        lines.push('最近備份檔：' + (status.lastExportFileName
            ? `${status.lastExportFileName}（${formatBackupDateTime(status.lastExportAt)}）`
            : '尚無備份檔'));
        if (lastRun.at) {
            const stateText = lastRun.status === 'success'
                ? '成功'
                : lastRun.status === 'partial'
                    ? '部分成功'
                    : '失敗';
            lines.push(`最近同步：${formatBackupDateTime(lastRun.at)}・${stateText}` +
                (typeof lastRun.firestoreReads === 'number' ? `・本次雲端資料庫讀取 ${lastRun.firestoreReads} 次` : ''));
        }
        if (lastRun.status === 'partial' && Array.isArray(lastRun.failures) && lastRun.failures.length) {
            lines.push('失敗項目：' + lastRun.failures.map(f => f.source).join('、'));
        }
        setBackupCloudStatus(lines.join('　｜　'), lastRun.status === 'success' ? 'success' : 'warn');
        return status;
    } catch (error) {
        if (seq !== backupStatusRequestSeq) return null;
        // 未登入時不顯示錯誤（系統頁可能先載入、稍後才登入）
        if (/尚未登入/.test(String(error.message || ''))) {
            setBackupCloudStatus('登入後可查看雲端備份狀態');
        } else {
            setBackupCloudStatus('無法讀取雲端備份狀態：' + (error.message || error), 'error');
        }
        return null;
    }
}

/**
 * 手動觸發 Firestore → R2 同步。
 * @param {boolean} forceBaseline true 時強制全部集合全量讀取（可用於立即校正刪除）
 */
async function syncCloudBackup(forceBaseline) {
    const button = document.getElementById('backupSyncBtn');
    if (button) button.disabled = true;
    const progressContainer = document.getElementById('backupProgressContainer');
    const progressText = document.getElementById('backupProgressText');
    const progressBar = document.getElementById('backupProgressBar');
    try {
        if (progressContainer) progressContainer.classList.remove('hidden');
        if (progressBar) progressBar.style.width = '30%';
        if (progressText) {
            progressText.textContent = forceBaseline
                ? '正在執行完整比對同步，需時較長，請勿關閉頁面…'
                : '正在同步增量資料至雲端備份，請稍候…';
        }
        setBackupCloudStatus('同步進行中…');

        const result = await callBackupApi('/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ forceBaseline: !!forceBaseline })
        });
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) {
            let compressionInfo = '';
            if (result.exportBytes > 0 && result.exportBytesUncompressed > 0) {
                const mb = (bytes) => bytes >= 1048576
                    ? (bytes / 1048576).toFixed(2) + ' MB'
                    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
                const ratio = Math.round((1 - result.exportBytes / result.exportBytesUncompressed) * 100);
                compressionInfo = `，壓縮後 ${mb(result.exportBytes)}（原 ${mb(result.exportBytesUncompressed)}，縮減 ${ratio}%）`;
            }
            const summary = `同步完成（${result.status === 'partial' ? '部分成功' : '成功'}），本次雲端資料庫讀取 ${result.firestoreReads} 次${compressionInfo}，備份檔：${result.exportFileName}`;
            progressText.textContent = summary;
        }
        showToast(result.status === 'partial'
            ? '雲端備份部分完成，部份資料同步失敗，請查看狀態列'
            : '雲端備份同步完成！', result.status === 'partial' ? 'error' : 'success');
        await refreshCloudBackupStatus();
    } catch (error) {
        console.error('雲端備份同步失敗:', error);
        if (progressText) progressText.textContent = '同步失敗：' + (error.message || error);
        setBackupCloudStatus('同步失敗：' + (error.message || error), 'error');
        showToast('雲端備份同步失敗，請稍後再試', 'error');
    } finally {
        if (button) button.disabled = false;
        setTimeout(() => {
            if (progressContainer) progressContainer.classList.add('hidden');
            if (progressBar) progressBar.style.width = '0%';
        }, 4000);
    }
}

/**
 * 由 R2 下載最新備份檔（零 Firestore 讀取）。
 * R2 尚無備份時引導使用者先執行雲端同步；不再提供會大量讀取 Firestore 的本機匯出。
 */
async function exportClinicBackupFromCloud() {
    const button = document.getElementById('backupExportBtn');
    if (button) button.disabled = true;
    try {
        const token = await getBackupAuthToken();
        const response = await fetch(`${CLOUD_BACKUP_BASE}/download?key=latest`, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!response.ok) {
            let data = null;
            try { data = await response.json(); } catch (_e) { data = null; }
            // 404＝雲端未有備份：引導先同步，其餘錯誤（401/403 等）直接顯示
            if (response.status === 404 && data && data.error === 'NO_BACKUP_AVAILABLE') {
                showToast('雲端尚未有備份檔，請先按「立即同步雲端備份」建立備份後再下載', 'error');
                return;
            }
            throw new Error((data && data.message) || ('下載失敗（HTTP ' + response.status + '）'));
        }

        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        const nameMatch = disposition.match(/filename="?([^"]+)"?/);
        const fileName = nameMatch ? nameMatch[1]
            : `clinic_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('雲端備份已下載！', 'success');
    } catch (error) {
        console.error('下載雲端備份失敗:', error);
        showToast('下載雲端備份失敗：' + (error.message || error), 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

// 雲端備份狀態跟隨登入帳號自動刷新：每次登入／換帳號重抓、登出重置。
// 不可只在首次登入刷新——登出不會重整頁面，否則換帳號後會殘留前一位
// 使用者的權限錯誤（例如醫師帳號的「需要管理員權限」）。
(function scheduleCloudStatusAutoRefresh() {
    function bind() {
        const fb = window.firebase;
        if (!fb || !fb.auth || typeof fb.onAuthStateChanged !== 'function') return false;
        // onAuthStateChanged 註冊後會立即以目前狀態（含已還原的 currentUser）回補一次
        fb.onAuthStateChanged(fb.auth, (user) => {
            if (user) {
                refreshCloudBackupStatus();
            } else {
                setBackupCloudStatus('登入後可查看雲端備份狀態');
            }
        });
        return true;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else if (!bind()) {
        // 極少數 firebase_init 尚未就緒的情況：短輪詢補綁
        const timer = setInterval(() => {
            if (bind()) clearInterval(timer);
        }, 200);
        setTimeout(() => clearInterval(timer), 15000);
    }
})();

// 未登入開頁守衛：Auth 採 session 持久化且每次開頁都需重新登入，
// 若前一位使用者直接關分頁而沒走登出，病人個資快取會永久滯留本機。
// onAuthStateChanged 首次回補（已含持久化還原結果）判定為未登入時，
// 主動清掃一次；登入後的工作階段不受影響（資料由 Firestore 重載）。
(function sweepLocalClinicDataWhenSignedOut() {
    let done = false;
    function bind() {
        const fb = window.firebase;
        if (!fb || !fb.auth || typeof fb.onAuthStateChanged !== 'function') return false;
        fb.onAuthStateChanged(fb.auth, function (user) {
            if (done) return;
            done = true;
            if (!user) {
                // 前一使用者直接關分頁沒走登出時，IndexedDB 仍可能殘留病人文件。
                // 僅在帶有 PHI 標記時執行 terminate＋清除，並以 sessionStorage
                // 確保每個分頁工作階段最多補清一次（避免他分頁占用時反覆重新整理）。
                let mayContainPhi = false;
                try { mayContainPhi = localStorage.getItem(window.IDB_PHI_MARKER) === '1'; } catch (_e) {}
                try { clearLocalClinicData(); } catch (_e) {}
                if (mayContainPhi) {
                    let wipeTried = false;
                    try {
                        wipeTried = sessionStorage.getItem(window.IDB_WIPE_ATTEMPTED) === '1';
                        if (!wipeTried) sessionStorage.setItem(window.IDB_WIPE_ATTEMPTED, '1');
                    } catch (_e) {}
                    if (!wipeTried) {
                        // 清掃＋重新整理最長約 10 秒，期間 Firestore 已 terminate。
                        // 設旗標並停用登入表單，避免登入請求打到已終結的實例而
                        // 被誤判「未授權」（attemptMainLogin 會檢查此旗標）。
                        try { window.__authGuardWipeInProgress = true; } catch (_e) {}
                        try {
                            const guardBtn = document.getElementById('loginButton');
                            const guardUserInput = document.getElementById('mainLoginUsername');
                            const guardPassInput = document.getElementById('mainLoginPassword');
                            if (guardBtn) guardBtn.disabled = true;
                            if (guardUserInput) guardUserInput.disabled = true;
                            if (guardPassInput) guardPassInput.disabled = true;
                        } catch (_e) {}
                        shutdownFirestoreAndWipePersistence().then(function (cleared) {
                            if (cleared) {
                                try { localStorage.removeItem(window.IDB_PHI_MARKER); } catch (_e) {}
                            }
                            // 實例已 terminate，無論成敗都需重新整理取得可用實例
                            window.location.reload();
                        });
                    }
                }
            }
        });
        return true;
    }
    if (!bind()) {
        // firebase_init 尚未就緒（或 DOM 仍在載入）：短輪詢補綁
        const timer = setInterval(function () {
            if (bind()) clearInterval(timer);
        }, 200);
        setTimeout(function () { clearInterval(timer); }, 15000);
    }
})();

/**
 * 觸發備份檔案匯入流程：清空檔案輸入框並打開檔案選擇視窗。
 */
function triggerBackupImport() {
    const input = document.getElementById('backupFileInput');
    if (input) {
        input.value = '';  // 重置 value，確保可重新選檔
        input.click();
    }
}

/**
 * 讀取並解析備份檔：支援舊版 .json 與雲端下載的 .json.gz（gzip）。
 * gzip 使用瀏覽器原生 DecompressionStream 解壓，零依賴。
 * @param {File} file
 * @returns {Promise<Object>}
 */
async function parseBackupFileJson(file) {
    const name = (file.name || '').toLowerCase();
    const looksGzip = name.endsWith('.gz')
        || file.type === 'application/gzip'
        || file.type === 'application/x-gzip';

    if (!looksGzip) {
        return JSON.parse(await file.text());
    }

    if (typeof DecompressionStream === 'undefined') {
        throw new Error('目前瀏覽器不支援 gzip 解壓，請使用新版 Chrome／Edge／Safari');
    }
    const decompressed = file.stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(decompressed).text();
    return JSON.parse(text);
}

/**
 * 處理使用者選擇的備份檔案，解析後進行匯入。
 * @param {File} file 使用者選擇的 JSON／JSON.GZ 檔案
 */
async function handleBackupFile(file) {
    if (!file) return;
    {
        const lang = localStorage.getItem('lang') || 'zh';
        const zhMsg = '匯入備份將覆蓋現有資料，確定要繼續嗎？';
        const enMsg = 'Importing a backup will overwrite existing data; are you sure you want to continue?';
        const confirmed = await showConfirmation(lang === 'en' ? enMsg : zhMsg, 'warning');
        if (!confirmed) {
            return;
        }
    }
    const button = document.getElementById('backupImportBtn');
    setButtonLoading(button);
    // 動態計算匯入步驟。基本十一步：patients、consultations、users、clinics、
    // billingItems、patientPackages、patientPackageHistory、patientWalletAccounts、
    // patientWalletTransactions、clinicExpenses、consultationAuditLogs。
    let totalStepsForBackupImport = 11;
    let data;
    try {
        data = await parseBackupFileJson(file);
        if (data && typeof data.rtdb === 'object' && data.rtdb !== null) {
            totalStepsForBackupImport++;
        }
    } catch (parseErr) {
        console.error('讀取備份檔案失敗:', parseErr);
        showToast('讀取備份檔案失敗，請確認檔案格式是否正確', 'error');
        clearButtonLoading(button);
        return;
    }
    // 顯示匯入進度條
    showBackupProgressBar(totalStepsForBackupImport);
    try {
        // 傳入進度回調以更新匯入進度。第三個參數為總步驟數
        await importClinicBackup(data, function(step, total) {
            updateBackupProgressBar(step, total);
        }, totalStepsForBackupImport);
        showToast('備份資料匯入完成！', 'success');
        finishBackupProgressBar(true);
    } catch (error) {
        console.error('匯入備份失敗:', error);
        showToast('匯入備份失敗，請確認檔案格式是否正確', 'error');
        // 進度條標記為失敗
        finishBackupProgressBar(false);
    } finally {
        clearButtonLoading(button);
    }
}

/**
 * 將備份資料寫回 Firestore，覆蓋現有資料。Realtime Database 資料不受影響。
 * @param {Object} data 備份物件
 */
async function importClinicBackup(data) {
    let progressCallback = null;
    // 還原病人、診症、用戶、診所、收費項目、套票、套票記錄、錢包帳戶、錢包交易、
    // 診所支出、審核追蹤，總步驟數為 11
    let totalSteps = 11;
    // 若第二個參數為函式，視為進度回調；第三個參數為總步驟數（可選）
    if (arguments.length >= 2 && typeof arguments[1] === 'function') {
        progressCallback = arguments[1];
    }
    if (arguments.length >= 3 && typeof arguments[2] === 'number') {
        totalSteps = arguments[2];
    }
    await ensureFirebaseReady();
    // 備份 JSON 往返後 Firestore Timestamp 一律變成 {seconds,nanoseconds} 普通物件，
    // 直接寫回會成為 map 欄位，破壞 orderBy('sortDate'/'date' 等) 嘅排序。
    // 遞迴還原成 Date，SDK 寫入時自動轉回 Timestamp。
    function reviveBackupTimestamps(value) {
        if (value === null || value === undefined) return value;
        if (Array.isArray(value)) return value.map(reviveBackupTimestamps);
        if (value instanceof Date) return value;
        if (typeof value === 'object') {
            if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
                const d = new Date(value.seconds * 1000 + value.nanoseconds / 1000000);
                if (!isNaN(d.getTime())) return d;
            }
            const out = {};
            for (const key of Object.keys(value)) {
                out[key] = reviveBackupTimestamps(value[key]);
            }
            return out;
        }
        return value;
    }
    // helper：清空並覆寫集合資料
    /**
     * 將集合資料替換為指定項目，僅刪除不在 items 中的文件，並使用批次寫入以減少網路往返。
     * @param {string} collectionName 集合名稱
     * @param {Array} items 要寫入的新資料陣列，每個元素需包含 id 屬性
     */
    async function replaceCollection(collectionName, items) {
        const colRef = window.firebase.collection(window.firebase.db, collectionName);
        try {
            // 取得現有文件 ID
            const snap = await window.firebase.getDocs(colRef);
            const existingIds = new Set();
            snap.forEach((docSnap) => {
                existingIds.add(docSnap.id);
            });
            // 建立新資料 ID 集合
            const newIds = new Set();
            if (Array.isArray(items)) {
                items.forEach(item => {
                    if (item && item.id !== undefined && item.id !== null) {
                        newIds.add(String(item.id));
                    }
                });
            }
            // 計算需要刪除的文件（現有但不在新的 ID 集合中）
            const idsToDelete = [];
            existingIds.forEach(id => {
                if (!newIds.has(id)) {
                    idsToDelete.push(id);
                }
            });
            // 使用批次寫入刪除與寫入，單批次最多 500 個操作
            let batch = window.firebase.writeBatch(window.firebase.db);
            let opCount = 0;
            const commitBatch = async () => {
                if (opCount > 0) {
                    await batch.commit();
                    batch = window.firebase.writeBatch(window.firebase.db);
                    opCount = 0;
                }
            };
            // 先處理刪除
            for (const id of idsToDelete) {
                const docRef = window.firebase.doc(window.firebase.db, collectionName, id);
                batch.delete(docRef);
                opCount++;
                if (opCount >= 500) {
                    await commitBatch();
                }
            }
            // 再處理寫入/更新
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (!item || item.id === undefined || item.id === null) continue;
                    const idStr = String(item.id);
                    const docRef = window.firebase.doc(window.firebase.db, collectionName, idStr);
                    // 移除 id 屬性，避免將 id 寫入文件內容
                    let dataToWrite;
                    try {
                        const { id, ...rest } = item || {};
                        dataToWrite = { ...rest };
                    } catch (_omitErr) {
                        dataToWrite = item;
                    }
                    // 還原所有 Timestamp 欄位型別（重點：consultations.sortDate）
                    dataToWrite = reviveBackupTimestamps(dataToWrite);
                    // 備份檔內 updatedAt 經 JSON 往返後只餘 {seconds,nanoseconds} 普通物件，
                    // 直接寫回會破壞增量備份的 Timestamp 查詢；交由 writeBatch 攔截器
                    // 補上真正的 Firestore serverTimestamp
                    try {
                        if (Object.prototype.hasOwnProperty.call(dataToWrite, 'updatedAt')) {
                            delete dataToWrite.updatedAt;
                        }
                    } catch (_tsErr) {}
                    if (collectionName === 'consultations') {
                        const sortDate = getConsultationEffectiveDate(dataToWrite, new Date(0));
                        if (sortDate && !isNaN(sortDate.getTime())) {
                            dataToWrite.sortDate = sortDate;
                        }
                    }
                    if (collectionName === 'patients') {
                        dataToWrite.searchKeywords = generateSearchKeywords({
                            ...dataToWrite,
                            patientNumber: dataToWrite.patientNumber
                        });
                    }
                    batch.set(docRef, dataToWrite);
                    opCount++;
                    if (opCount >= 500) {
                        await commitBatch();
                    }
                }
            }
            // 提交最後一批
            await commitBatch();
        } catch (err) {
            console.error('更新 ' + collectionName + ' 資料時發生錯誤:', err);
        }
    }
    // 覆蓋各集合並更新進度
    let stepCount = 0;
    // 覆蓋需要還原的集合，順序為：patients -> consultations -> users -> clinics
    // -> billingItems -> patientPackages -> patientPackageHistory
    // -> patientWalletAccounts -> patientWalletTransactions
    // -> clinicExpenses -> consultationAuditLogs
    // 新集合僅在備份檔「明確包含」該欄位時才覆蓋，舊備份檔缺少時跳過，避免誤刪現有資料。
    const replaceCollectionIfPresent = async (collectionName, key) => {
        if (Array.isArray(data[key])) {
            await replaceCollection(collectionName, data[key]);
        }
    };
    await replaceCollection('patients', Array.isArray(data.patients) ? data.patients : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('consultations', Array.isArray(data.consultations) ? data.consultations : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('users', Array.isArray(data.users) ? data.users : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollectionIfPresent('clinics', 'clinics');
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('billingItems', Array.isArray(data.billingItems) ? data.billingItems : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('patientPackages', Array.isArray(data.patientPackages) ? data.patientPackages : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('patientPackageHistory', Array.isArray(data.patientPackageHistory) ? data.patientPackageHistory : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    // 錢包帳戶先於交易還原；舊備份檔缺少錢包欄位時跳過，避免誤刪現有資料。
    await replaceCollectionIfPresent('patientWalletAccounts', 'patientWalletAccounts');
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollectionIfPresent('patientWalletTransactions', 'patientWalletTransactions');
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollectionIfPresent('clinicExpenses', 'clinicExpenses');
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollectionIfPresent('consultationAuditLogs', 'consultationAuditLogs');
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);
    // 如果備份包含 Realtime Database 資料，將其寫回
    const rtdbData = data && typeof data.rtdb === 'object' ? data.rtdb : null;
    if (rtdbData) {
        try {
            for (const key of Object.keys(rtdbData)) {
                await window.firebase.set(window.firebase.ref(window.firebase.rtdb, key), rtdbData[key]);
            }
            // 更新本地中藥庫存或其他即時資料快取
            if (typeof initHerbInventory === 'function') {
                await initHerbInventory(true);
            } else if (rtdbData.herbInventory) {
                try {
                    herbInventory = rtdbData.herbInventory || {};
                    herbInventoryInitialized = true;
                } catch (_e) {}
            }
        } catch (err) {
            console.error('還原 Realtime Database 資料時發生錯誤:', err);
        }
        stepCount++;
        if (progressCallback) progressCallback(stepCount, totalSteps);
    }
    /*
     * 匯入完成後更新本地快取並刷新應用程式資料。
     * 為了節省 Firebase 讀取量，我們直接將備份資料寫入快取與全域變數，
     * 並預先產生分頁快取與總數，讓後續 API 調用可使用快取而非再向 Firestore 讀取。
     */
    try {
        // 將患者、診症及用戶資料寫入本地快取
        patientCache = Array.isArray(data.patients)
            ? data.patients.map(p => {
                // 確保 ID 為字串，避免數字與字串比較不相等而導致找不到病人
                const cloned = { ...(p || {}) };
                if (cloned.id !== undefined && cloned.id !== null) {
                    cloned.id = String(cloned.id);
                }
                return cloned;
            })
            : [];
        // 將病人資料依 createdAt 由新至舊排序，以模擬 Firestore 預設排序
        if (Array.isArray(patientCache) && patientCache.length > 1) {
            patientCache.sort((a, b) => {
                let dateA = 0;
                let dateB = 0;
                if (a && a.createdAt) {
                    if (a.createdAt.seconds !== undefined) {
                        dateA = a.createdAt.seconds * 1000;
                    } else {
                        const d = new Date(a.createdAt);
                        dateA = d instanceof Date && !isNaN(d) ? d.getTime() : 0;
                    }
                }
                if (b && b.createdAt) {
                    if (b.createdAt.seconds !== undefined) {
                        dateB = b.createdAt.seconds * 1000;
                    } else {
                        const d = new Date(b.createdAt);
                        dateB = d instanceof Date && !isNaN(d) ? d.getTime() : 0;
                    }
                }
                return dateB - dateA;
            });
        }
        consultationCache = Array.isArray(data.consultations)
            ? data.consultations.map(c => {
                const clone = { ...(c || {}) };
                if (clone.id !== undefined && clone.id !== null) {
                    clone.id = String(clone.id);
                }
                if (clone.patientId !== undefined && clone.patientId !== null) {
                    clone.patientId = String(clone.patientId);
                }
                return clone;
            })
            : [];
        userCache = Array.isArray(data.users)
            ? data.users.map(u => {
                const clone = { ...(u || {}) };
                if (clone.id !== undefined && clone.id !== null) {
                    clone.id = String(clone.id);
                }
                return clone;
            })
            : [];
        // 將資料同步至全域變數（部分功能直接引用）
        consultations = Array.isArray(consultationCache) ? consultationCache.slice() : [];
        // 同步 userCache 到全域 users 變數（去除 personalSettings 以減少冗餘）
        if (Array.isArray(userCache)) {
            users = userCache.map(u => {
                try {
                    const { personalSettings, ...rest } = u || {};
                    return { ...rest };
                } catch (_e) {
                    return { ...(u || {}) };
                }
            });
        } else {
            users = [];
        }
        // 將病人資料同步至全域 patients 變數，以便不依賴 fetchPatients() 也能直接存取
        patients = Array.isArray(patientCache) ? patientCache.slice() : [];
        // 儲存到本地存儲以便離線使用或初始載入
        try {
            localStorage.setItem('patients', JSON.stringify(patients));
        } catch (_lsErr) {
            // 忽略 localStorage 錯誤
        }
        // 更新收費項目及其載入狀態
        billingItems = Array.isArray(data.billingItems) ? data.billingItems : [];
        billingItemsLoaded = true;
        try {
            localStorage.setItem('billingItems', JSON.stringify(billingItems));
        } catch (_lsErr) {
            // 忽略 localStorage 錯誤
        }
        // 更新病人總數快取
        patientsCountCache = Array.isArray(patientCache) ? patientCache.length : 0;
        // 清空病人分頁快取，讓後續依使用者所在頁面再即時讀取，避免一次預切所有頁資料
        patientPagesCache = {};
        patientPageCursors = {};
        patientAscPagesCache = {};
        patientAscPageCursors = {};
        // 重置套票記錄分頁快取，避免匯入後仍沿用舊頁碼與總數
        if (window.firebaseDataManager && typeof window.firebaseDataManager.resetPatientPackageHistoryPagination === 'function') {
            window.firebaseDataManager.resetPatientPackageHistoryPagination();
        }
        if (typeof invalidatePatientPackageHistoryCaches === 'function') {
            invalidatePatientPackageHistoryCaches();
        }
        // 重新計算中藥庫使用次數（若有相關函式）
        if (typeof computeGlobalUsageCounts === 'function') {
            try { await computeGlobalUsageCounts(); } catch (_e) {}
        }
    } catch (_assignErr) {
        console.error('匯入備份後更新本地快取失敗:', _assignErr);
    }
    // 更新界面（使用快取資料）
    try {
        if (typeof loadPatientList === 'function') {
            loadPatientList();
        }
        if (typeof loadTodayAppointments === 'function') {
            await loadTodayAppointments();
        }
        if (typeof updateStatistics === 'function') {
            updateStatistics();
        }
    } catch (_uiErr) {
        console.error('匯入備份後重新渲染介面時發生錯誤:', _uiErr);
    }
    // 若最後仍未達到總步驟數，進行最後一次更新以顯示 100%
    if (progressCallback && stepCount < totalSteps) {
        progressCallback(totalSteps, totalSteps);
    }
}

/**
 * 觸發模板庫資料匯入。
 * 點擊匯入模板資料按鈕時，觸發隱藏的檔案選擇器。
 */
function triggerTemplateImport() {
  try {
    const input = document.getElementById('templateImportFile');
    if (input) {
      // Reset the input so selecting the same file again triggers change
      input.value = '';
      input.click();
    }
  } catch (e) {
    console.error('觸發模板匯入時發生錯誤:', e);
  }
}

/**
 * 處理選擇的模板庫匯入檔案。
 * 檔案應為 JSON 格式，包含 prescriptionTemplates 或 diagnosisTemplates 陣列，或直接為模板陣列。
 * 匯入會覆蓋現有的模板庫資料。
 * @param {File} file 使用者選擇的檔案
 */
async function handleTemplateImportFile(file) {
  if (!file) return;
  try {
    // 提醒使用者匯入將新增資料，不會刪除現有資料（支援中英文）
    {
      const lang = localStorage.getItem('lang') || 'zh';
      const zhMsg = '匯入模板資料將新增資料（不會刪除現有模板庫資料），是否繼續？';
      const enMsg = 'Importing template data will add new entries (existing template library data will not be deleted). Do you want to continue?';
      const confirmedTemplate = await showConfirmation(lang === 'en' ? enMsg : zhMsg, 'warning');
      if (!confirmedTemplate) {
        return;
      }
    }
    const text = await file.text();
    const data = JSON.parse(text);
    // 將檔案內容拆分成醫囑模板與診斷模板
    let prescriptions = [];
    let diagnoses = [];
    // 如果是陣列，根據欄位判斷類型
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (!item || typeof item !== 'object') return;
        // 若未指定 id，產生一個唯一 id
        if (item.id === undefined || item.id === null) {
          item.id = Date.now() + Math.floor(Math.random() * 10000);
        }
        // 跳過中藥或方劑資料
        if (item.type === 'herb' || item.type === 'formula') {
          return;
        }
        // 透過診斷模板特有欄位判斷
        if ('chiefComplaint' in item || 'currentHistory' in item || 'tcmDiagnosis' in item || 'syndromeDiagnosis' in item) {
          diagnoses.push(item);
        } else {
          prescriptions.push(item);
        }
      });
    } else if (data && typeof data === 'object') {
      // JSON 物件可能包含 prescriptionTemplates、diagnosisTemplates 或其他命名
      if (Array.isArray(data.prescriptionTemplates)) {
        prescriptions = data.prescriptionTemplates.map(item => {
          if (!item || typeof item !== 'object') return null;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return null;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          return item;
        }).filter(Boolean);
      }
      if (Array.isArray(data.prescriptions)) {
        // 兼容名稱 prescriptions
        const arr = data.prescriptions.map(item => {
          if (!item || typeof item !== 'object') return null;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return null;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          return item;
        }).filter(Boolean);
        prescriptions = prescriptions.concat(arr);
      }
      if (Array.isArray(data.diagnosisTemplates)) {
        diagnoses = data.diagnosisTemplates.map(item => {
          if (!item || typeof item !== 'object') return null;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return null;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          return item;
        }).filter(Boolean);
      }
      if (Array.isArray(data.diagnoses)) {
        const arr = data.diagnoses.map(item => {
          if (!item || typeof item !== 'object') return null;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return null;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          return item;
        }).filter(Boolean);
        diagnoses = diagnoses.concat(arr);
      }
      // 若資料包含單一 templates 陣列
       if (Array.isArray(data.templates)) {
        data.templates.forEach(item => {
          if (!item || typeof item !== 'object') return;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          if ('chiefComplaint' in item || 'currentHistory' in item || 'tcmDiagnosis' in item || 'syndromeDiagnosis' in item) {
            diagnoses.push(item);
          } else {
            prescriptions.push(item);
          }
        });
      }
    }
    // 如未找到任何模板資料，根據模式決定是否提示錯誤
    const hasPrescriptions = Array.isArray(prescriptions) && prescriptions.length > 0;
    const hasDiagnoses = Array.isArray(diagnoses) && diagnoses.length > 0;
    if (!hasPrescriptions && !hasDiagnoses) {
      if (!window.isCombinedImportMode) {
        showToast('未偵測到有效的模板資料', 'error');
      }
      return;
    }
    // 計算總步驟：醫囑模板與診斷模板項目總數
    const totalSteps =
      (Array.isArray(prescriptions) ? prescriptions.length : 0) +
      (Array.isArray(diagnoses) ? diagnoses.length : 0);
    try {
      showImportProgressBar(totalSteps);
      let processedCount = 0;
      await importTemplateLibraryData(
        prescriptions,
        diagnoses,
        () => {
          // 增加處理計數並更新進度條
          processedCount++;
          updateImportProgressBar(processedCount, totalSteps);
        }
      );
      finishImportProgressBar(true);
      showToast('模板資料匯入完成！', 'success');
    } catch (err) {
      finishImportProgressBar(false);
      throw err;
    }
  } catch (err) {
    console.error('處理模板匯入檔案時發生錯誤:', err);
    showToast('匯入模板資料失敗，請確認檔案格式是否正確', 'error');
  }
}

/**
 * 將模板庫資料寫入 Firestore，覆蓋現有的醫囑模板與診斷模板集合。
 * 同步更新本地變數並重新渲染界面。
 * @param {Array} prescriptions 醫囑模板陣列
 * @param {Array} diagnoses 診斷模板陣列
 */
async function importTemplateLibraryData(prescriptions, diagnoses, progressCallback) {
  try {
    // Firestore 不再用於模板庫管理，移除遠端寫入及初始化等待。
    // 定義資料處理 helper，只用於調整進度條，不與 Firestore 互動。
    async function upsertCollectionItems(collectionName, items) {
      if (!Array.isArray(items) || items.length === 0) return;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        // 遞增進度
        if (typeof progressCallback === 'function') {
          progressCallback();
        }
      }
    }
    // 先初始化本地全域變數為空陣列（如果尚未存在）
    if (typeof prescriptionTemplates === 'undefined') {
      prescriptionTemplates = [];
    }
    if (typeof diagnosisTemplates === 'undefined') {
      diagnosisTemplates = [];
    }
    // 更新/新增醫囑模板
    if (Array.isArray(prescriptions) && prescriptions.length > 0) {
      // 不再寫入至 Firestore，僅更新本地資料並調整進度
      await upsertCollectionItems('prescriptionTemplates', prescriptions);
      // 合併到本地資料：根據 id 替換或新增
      const updated = Array.isArray(prescriptionTemplates) ? [...prescriptionTemplates] : [];
      prescriptions.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const idx = updated.findIndex(p => String(p.id) === String(item.id));
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], ...item };
        } else {
          updated.push(item);
        }
      });
      prescriptionTemplates = updated;
    }
    // 更新/新增診斷模板
    if (Array.isArray(diagnoses) && diagnoses.length > 0) {
      // 不再寫入至 Firestore，僅更新本地資料並調整進度
      await upsertCollectionItems('diagnosisTemplates', diagnoses);
      const updatedDiag = Array.isArray(diagnosisTemplates) ? [...diagnosisTemplates] : [];
      diagnoses.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const idx = updatedDiag.findIndex(d => String(d.id) === String(item.id));
        if (idx >= 0) {
          updatedDiag[idx] = { ...updatedDiag[idx], ...item };
        } else {
          updatedDiag.push(item);
        }
      });
      diagnosisTemplates = updatedDiag;
    }
    // 重新渲染模板列表
    if (typeof renderPrescriptionTemplates === 'function') {
      try {
        renderPrescriptionTemplates();
      } catch (_e) {}
    }
    if (typeof renderDiagnosisTemplates === 'function') {
      try {
        renderDiagnosisTemplates();
      } catch (_e) {}
    }
    // 更新分類下拉選單
    if (typeof refreshTemplateCategoryFilters === 'function') {
      try {
        refreshTemplateCategoryFilters();
      } catch (_e) {}
    }
  } catch (error) {
    console.error('匯入模板資料時發生錯誤:', error);
    throw error;
  }
}

/**
 * 觸發中藥庫資料匯入。
 * 點擊匯入中藥資料按鈕時，觸發隱藏的檔案選擇器。
 */
function triggerHerbImport() {
  try {
    const input = document.getElementById('herbImportFile');
    if (input) {
      input.value = '';
      input.click();
    }
  } catch (e) {
    console.error('觸發中藥庫匯入時發生錯誤:', e);
  }
}

/**
 * 處理選擇的中藥庫匯入檔案。
 * 檔案應為 JSON 格式，包含 herbLibrary 陣列，或直接為中藥庫條目陣列。
 * 匯入會覆蓋現有的中藥庫資料。
 * @param {File} file 使用者選擇的檔案
 */
async function handleHerbImportFile(file) {
  if (!file) return;
  try {
    {
      const lang = localStorage.getItem('lang') || 'zh';
      const zhMsg = '匯入中藥資料將新增資料（不會刪除現有中藥庫資料），是否繼續？';
      const enMsg = 'Importing herbal data will add new entries (existing herb library data will not be deleted). Do you want to continue?';
      const confirmedHerb = await showConfirmation(lang === 'en' ? enMsg : zhMsg, 'warning');
      if (!confirmedHerb) {
        return;
      }
    }
    const text = await file.text();
    const data = JSON.parse(text);
    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.herbLibrary)) {
        items = data.herbLibrary;
      } else if (Array.isArray(data.herbs)) {
        items = data.herbs;
      } else if (Array.isArray(data.items)) {
        items = data.items;
      }
    }
    // 過濾僅保留中藥或方劑資料
    if (Array.isArray(items)) {
      items = items.filter(item => {
        return item && typeof item === 'object' && (item.type === 'herb' || item.type === 'formula');
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      if (!window.isCombinedImportMode) {
        showToast('未偵測到有效的中藥庫資料', 'error');
      }
      return;
    }
    // 給未設置 id 的項目產生 id
    items = items.map(item => {
      if (!item || typeof item !== 'object') return item;
      if (item.id === undefined || item.id === null) {
        item.id = Date.now() + Math.floor(Math.random() * 10000);
      }
      return item;
    });
    // 計算總步驟
    const totalSteps = Array.isArray(items) ? items.length : 0;
    try {
      showImportProgressBar(totalSteps);
      let processedCount = 0;
      await importHerbLibraryData(items, () => {
        processedCount++;
        updateImportProgressBar(processedCount, totalSteps);
      });
      finishImportProgressBar(true);
      showToast('中藥資料匯入完成！', 'success');
    } catch (err2) {
      finishImportProgressBar(false);
      throw err2;
    }
  } catch (err) {
    console.error('處理中藥匯入檔案時發生錯誤:', err);
    showToast('匯入中藥資料失敗，請確認檔案格式是否正確', 'error');
  }
}

/**
 * 將中藥庫資料寫入 Firestore，覆蓋現有的 herbLibrary 集合。
 * 同步更新本地變數並重新渲染中藥庫列表。
 * @param {Array} items 中藥庫資料陣列
 */
async function importHerbLibraryData(items, progressCallback) {
  try {
    // 不再使用 Firestore，移除遠端初始化等待。
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }
    // 確保本地變數存在
    if (typeof herbLibrary === 'undefined') {
      herbLibrary = [];
    }
    // 逐一新增/更新藥材資料
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const idStr = String(item.id);
      // 不再寫入至 Firestore，只更新本地資料並調整進度
      if (typeof progressCallback === 'function') {
        progressCallback();
      }
      // 更新本地陣列：若已存在則覆蓋，否則加入
      const idx = herbLibrary.findIndex(h => String(h.id) === idStr);
      if (idx >= 0) {
        herbLibrary[idx] = { ...herbLibrary[idx], ...item };
      } else {
        herbLibrary.push(item);
      }
    }
    // 重新載入並顯示資料
    if (typeof initHerbLibrary === 'function') {
      try {
        await initHerbLibrary();
      } catch (_e) {}
    }
    if (typeof displayHerbLibrary === 'function') {
      try {
        displayHerbLibrary();
      } catch (_e) {}
    }
  } catch (error) {
    console.error('匯入中藥資料時發生錯誤:', error);
    throw error;
  }
}

/**
 * 清除所有模板資料（醫囑與診斷模板）。
 * 顯示進度條並逐一刪除資料。
 */

/**
 * 清除所有中藥資料。
 * 顯示進度條並逐一刪除資料。
 */

/**
 * 觸發匯入模板與中藥資料的檔案選擇器。
 * 清空檔案輸入框並打開檔案選擇對話框。
 */

/**
 * 處理選擇的模板及中藥資料檔案。
 * 會先顯示確認提示，再依次執行模板匯入與中藥匯入。
 * 在合併匯入模式下，將會抑制單項匯入時的確認提示與無效資料錯誤提示。
 * @param {File} file 使用者選擇的檔案
 */

/**
 * 將模板與中藥庫資料匯出為 JSON 檔案。
 * 會從 Firestore 讀取醫囑模板、診斷模板及中藥庫資料，組合成單一檔案下載。
 */

        
// 套票管理函式
// 取得指定患者的套票清單，並使用本地快取避免重複讀取。
// 新增 forceRefresh 參數允許呼叫端強制重新讀取資料。
// ── 套票診所歸屬（2026-09 起每間診所的套票獨立）──

/**
 * 目前 UI 選取的診所 ID（與錢包 currentWalletClinicId 概念一致）。
 * 未選擇或離線預設值時回傳空字串。
 */
/* Phase 5 ESM: patient packages cluster (47 fns) moved to js/domains/billing/packages.js; window facades in js/app.js; original block removed */
const patientDetailClinicState = { patientId: '', clinicId: '' };
function hkBoundOf(date, isEnd) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return new Date(`${y}-${m}-${d}T${isEnd ? '23:59:59.999' : '00:00:00'}+08:00`);
}

// ============================================================
// 財務報表 Field Mask：只取報表所需欄位，大幅縮減傳輸量
// ============================================================
const FINANCIAL_CONSULTATION_FIELDS = [
    'patientId', 'patientName', 'doctor', 'status',
    'clinicId', 'clinicName',
    'date', 'dateKey', 'sortDate',
    'totalAmount', 'financialTotalAmount',
    'summaryItems', 'financialSummaryItems',
    'billingItems', 'billingItemsStructured',
    'createdAt', 'updatedAt', 'syncedAt', 'isDeleted'
];
const FINANCIAL_SUMMARY_FIELDS = [
    'consultationId', 'patientId', 'patientName', 'doctor', 'status',
    'clinicId', 'clinicName',
    'date', 'dateKey', 'sortDate',
    'totalAmount', 'summaryItems',
    'createdAt', 'updatedAt', 'syncedAt', 'isDeleted'
];

// 個人統計：客戶端唯讀；所有寫入走 /api/personal-stats/*（SA 端）
const PERSONAL_STATS_SUMMARY_COLLECTION = 'personalStatisticsMonthlySummaries';

// Firebase 數據管理系統
class FirebaseDataManager {
    constructor() {
        // 設置初始狀態與快取欄位
        this.isReady = false;
        // 用於緩存病人列表，避免在同一工作階段重複向 Firestore 讀取整個 patients 集合
        this.patientsCache = null;
        this.patientsCacheSource = 'none';
        this.patientsCacheFetchedAt = 0;
        // 用於緩存診症記錄列表與其分頁資訊
        this.consultationsCache = null;
        this.consultationsLastVisible = null;
        this.consultationsHasMore = false;
        this.consultationSortDateReadyPatients = {};
        this.consultationSortDatePromises = {};
        // 用於緩存用戶列表與其分頁資訊
        this.usersCache = null;
        this.usersLastVisible = null;
        this.usersHasMore = false;
        // 用於緩存套票紀錄分頁與統計
        this.patientPackageHistoryPagination = {};
        this.patientPackageHistoryCountCache = {};
        this.initializeWhenReady();
    }

    async initializeWhenReady() {
        // 等待 Firebase 初始化，使用通用等待函式
        await waitForFirebase();
        this.isReady = true;
        console.log('雲端數據管理器已準備就緒');
    }

    applyPatientAggregateToCaches(patientId, aggregatePatch) {
        const pid = String(patientId || '');
        if (!pid || !aggregatePatch || typeof aggregatePatch !== 'object') return;

        // 處理增量欄位（consultationCountDelta: N 代表在現有 count 上加 N）
        const countDelta = Number(aggregatePatch.consultationCountDelta);
        const hasCountDelta = !Number.isNaN(countDelta);

        const applyPatchToList = (list) => {
            if (!Array.isArray(list)) return false;
            let updated = false;
            for (let i = 0; i < list.length; i++) {
                const patient = list[i];
                if (patient && String(patient.id) === pid) {
                    let merged = { ...patient };
                    // 如果 patch 包含 consultationCount（絕對值），直接用
                    if (Object.prototype.hasOwnProperty.call(aggregatePatch, 'consultationCount')
                        && typeof aggregatePatch.consultationCount === 'number') {
                        merged.consultationCount = aggregatePatch.consultationCount;
                    } else if (hasCountDelta) {
                        // 否則套用增量
                        merged.consultationCount = Math.max(0, Number(patient.consultationCount || 0) + countDelta);
                    }
                    // 其他欄位正常覆蓋（latestConsultationAt, latestFollowUpDate）
                    if (aggregatePatch.latestConsultationAt !== undefined) {
                        merged.latestConsultationAt = aggregatePatch.latestConsultationAt;
                    }
                    if (aggregatePatch.latestFollowUpDate !== undefined) {
                        merged.latestFollowUpDate = aggregatePatch.latestFollowUpDate;
                    }
                    list[i] = merged;
                    updated = true;
                }
            }
            return updated;
        };

        if (Array.isArray(this.patientsCache)) {
            applyPatchToList(this.patientsCache);
        }

        Object.keys(patientPagesCache).forEach((pageKey) => {
            applyPatchToList(patientPagesCache[pageKey]);
        });
        Object.keys(patientAscPagesCache).forEach((pageKey) => {
            applyPatchToList(patientAscPagesCache[pageKey]);
        });

        try {
            const stored = localStorage.getItem('patients');
            if (stored) {
                const patients = JSON.parse(stored);
                if (Array.isArray(patients) && applyPatchToList(patients)) {
                    localStorage.setItem('patients', JSON.stringify(patients));
                }
            }
        } catch (_lsErr) {}
    }

    async getLatestPatientConsultation(patientId) {
        if (!this.isReady) return { success: false, data: null };
        const pid = String(patientId || '');
        if (!pid) return { success: false, data: null, error: 'missing_patient_id' };

        try {
            if (typeof this.ensurePatientConsultationSortDates === 'function') {
                const backfillResult = await this.ensurePatientConsultationSortDates(pid);
                if (!backfillResult || !backfillResult.success) {
                    console.warn('取得最新診症前補 sortDate 失敗:', backfillResult && backfillResult.error);
                }
            }

            await waitForFirebaseDb();
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('patientId', '==', pid),
                window.firebase.orderBy('sortDate', 'desc'),
                window.firebase.limit(1)
            );
            const snapshot = await window.firebase.getDocs(q);
            if (!snapshot || !snapshot.docs || snapshot.docs.length === 0) {
                return { success: true, data: null };
            }

            const latestDoc = snapshot.docs[0];
            return { success: true, data: { id: latestDoc.id, ...latestDoc.data() } };
        } catch (error) {
            console.error('讀取最新病人診症記錄失敗:', error);
            return { success: false, data: null, error: error.message };
        }
    }

    /**
     * 建構病人診症聚合的寫入計畫（純邏輯、不寫入）。
     * 供 patchPatientAggregate 單獨提交，或由 add/update/deleteConsultation
     * 放進與病歷主文件相同的 writeBatch 一起原子提交。
     *
     * @returns {{patientOps: Array<{pid:string, patch:object, cachePatch:object}>, meta: object|null}}
     */
    _buildPatientAggregatePlan(patientId, operation, consultation, prevPatientId) {
        const pid = String(patientId || '');
        const patientOps = [];
        // Firebase v12 modular SDK 只有頂級 increment() 函數，FieldValue 類別
        // 在此版本沒有靜態 increment 方法。如果 increment 不可用，說明
        // firebase_init.js 可能被 Service Worker 快取了舊版本。
        const increment = window.firebase && window.firebase.increment;
        if (typeof increment !== 'function') {
            console.error('[聚合計畫] 雲端 increment 函數不可用！'
                + ' 請強制刷新（Ctrl+F5）或清除瀏覽器快取。'
                + ' 雲端模組鍵:', window.firebase ? Object.keys(window.firebase) : 'null');
            // 靜默降級：返回空計畫，不中斷病歷保存主流程。
            // 病人聚合統計會在下次 add/update 時被正確覆蓋。
            return { patientOps: [], meta: null };
        }

        // 先處理舊病人（update 時病人 ID 變更的情況）
        if (operation === 'update' && prevPatientId && String(prevPatientId) !== pid) {
            const oldPid = String(prevPatientId);
            // 舊病人 count -1
            patientOps.push({
                pid: oldPid,
                patch: { consultationCount: increment(-1) },
                cachePatch: { consultationCountDelta: -1 }
            });
        }

        const patch = {};
        if (operation === 'add') {
            patch.consultationCount = increment(1);
        } else if (operation === 'delete') {
            patch.consultationCount = increment(-1);
            // 刪除時不動 latest — 我們不知道是不是刪了最新那筆，
            // 讓它保持樂觀值即可，下次 add/update 會被覆蓋
        }
        // update：同一病人下 count 不變，只更新 latest

        // latest 欄位：add / update 時樂觀設定為當前 record 的值
        if (consultation && (operation === 'add' || operation === 'update')) {
            const sortDate = getConsultationEffectiveDate(consultation);
            if (sortDate) patch.latestConsultationAt = sortDate;
            const fu = parseConsultationDate(consultation.followUpDate);
            if (fu) patch.latestFollowUpDate = fu;
        }

        // 只有 patch 有內容才寫入病人文件
        if (pid && Object.keys(patch).length > 0) {
            // cachePatch 與舊行為一致：直接傳 patch（increment sentinel 會被快取邏輯忽略，
            // 僅 latest 欄位生效）
            patientOps.push({ pid, patch, cachePatch: patch });
        }

        // patientsMeta/lastChange 全域通知旗標：同一文件於單一批次只能寫一次，
        // 故聚合成一個最終 payload（舊路徑會連寫兩次，第二次覆蓋第一次）。
        // 額外帶 kind:'consultation' 讓監聽器區分「病人基本資料變更」與「診症 CRUD」，
        // 後者可額外觸發病歷彈窗的即時刷新。
        const meta = pid ? {
            timestamp: new Date(),
            operation: (operation === 'add' || operation === 'delete') ? operation : 'update',
            patientId: pid,
            kind: 'consultation',
            nonce: (typeof G.newSelfMetaNonce === 'function') ? G.newSelfMetaNonce() : undefined
        } : null;
        return { patientOps, meta };
    }

    /** 把聚合計畫的 Firestore 寫入加入既有批次。 */
    _appendPatientAggregateToBatch(batch, plan) {
        if (!batch || !plan) return;
        (plan.patientOps || []).forEach((op) => {
            batch.update(window.firebase.doc(window.firebase.db, 'patients', op.pid), op.patch);
        });
        if (plan.meta) {
            batch.set(
                window.firebase.doc(window.firebase.db, 'patientsMeta', 'lastChange'),
                plan.meta,
                { merge: true }
            );
        }
    }

    /** 批次提交成功後，把聚合變更套用到本地病人快取。 */
    _applyPatientAggregatePlanCaches(plan) {
        if (!plan) return;
        (plan.patientOps || []).forEach((op) => {
            try {
                this.applyPatientAggregateToCaches(op.pid, op.cachePatch);
            } catch (_e) {}
        });
    }

    /**
     * 精簡版病人診症聚合更新 — 0 次讀取，單一批次原子寫入病人文件與 patientsMeta。
     * 一般 CRUD 已改為與病歷主文件同批次提交（見 add/update/deleteConsultation），
     * 此方法保留給獨立呼叫使用。邊緣不精確可用 recomputePatientConsultationAggregate 重算。
     */
    async patchPatientAggregate(patientId, operation, consultation, prevPatientId) {
        if (!this.isReady) return;
        const pid = String(patientId || '');
        if (!pid) return;

        try {
            const plan = this._buildPatientAggregatePlan(pid, operation, consultation, prevPatientId);
            const batch = window.firebase.writeBatch(window.firebase.db);
            this._appendPatientAggregateToBatch(batch, plan);
            await batch.commit();
            this._applyPatientAggregatePlanCaches(plan);
        } catch (error) {
            console.warn('patchPatientAggregate 失敗（非致錯路徑）:', error.message);
        }
    }

    /**
     * 全量重算病人診症聚合 — 讀取該病人所有 consultations 並重新計算。
     * 僅在以下情況使用：
     *   1. 管理員主動修復聚合資料（透過 Console 手動調用）
     *   2. 資料庫嚴重不同步時的一次性修復
     *
     * 一般 CRUD 請用 patchPatientAggregate（0 讀取）。
     */
    async recomputePatientConsultationAggregate(patientId) {
        if (!this.isReady) return { success: false };
        const pid = String(patientId || '');
        if (!pid) return { success: false, error: 'missing_patient_id' };

        try {
            await waitForFirebaseDb();
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');

            // 確保 sortDate 已回填（一次性，每病人只做一次）
            if (typeof this.ensurePatientConsultationSortDates === 'function') {
                await this.ensurePatientConsultationSortDates(pid).catch(() => {});
            }

            const countSnap = await window.firebase.getCountFromServer(
                window.firebase.firestoreQuery(colRef, window.firebase.where('patientId', '==', pid))
            );
            const consultationCount = Number(countSnap && countSnap.data && countSnap.data().count) || 0;

            let latestConsultationAt = null;
            let latestFollowUpDate = null;
            if (consultationCount > 0) {
                const latestSnap = await window.firebase.getDocs(
                    window.firebase.firestoreQuery(
                        colRef,
                        window.firebase.where('patientId', '==', pid),
                        window.firebase.orderBy('sortDate', 'desc'),
                        window.firebase.limit(1)
                    )
                );
                if (latestSnap.docs && latestSnap.docs.length > 0) {
                    const d = latestSnap.docs[0].data() || {};
                    latestConsultationAt = getConsultationEffectiveDate(d) || null;
                    latestFollowUpDate = parseConsultationDate(d.followUpDate) || null;
                }
            }

            const patch = { consultationCount, latestConsultationAt, latestFollowUpDate };
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'patients', pid),
                patch
            );
            this.applyPatientAggregateToCaches(pid, patch);
            touchPatientsMeta('update', pid).catch(() => {});
            return { success: true, ...patch };
        } catch (error) {
            console.error('重算病人診症彙總失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async addClinic(clinicData) {
        if (!this.isReady) return { success: false };
        try {
            try {
                const clinicCol = window.firebase.collection(window.firebase.db, 'clinics');
                let count = 0;
                try {
                    const agg = await window.firebase.getCountFromServer(clinicCol);
                    count = (agg && typeof agg.data?.count === 'number') ? agg.data.count : 0;
                } catch (_eAgg) {
                    // 舊 SDK 或權限問題退回全量讀取（罕見）
                    try {
                        const snap = await window.firebase.getDocs(clinicCol);
                        count = (snap && typeof snap.size === 'number') ? snap.size : 0;
                    } catch (_e2) {}
                }
                // 診所數量上限依版本設定（version-config.js）：進階版 5 間、普通版 1 間
                const clinicLimit = (typeof window.getMaxClinics === 'function') ? window.getMaxClinics() : 3;
                if (count >= clinicLimit) {
                    return { success: false, error: '診所數量已達上限（' + clinicLimit + '），無法新增' };
                }
            } catch (_eLimit) {}
            let dataToWrite;
            try {
                const { id, ...rest } = clinicData || {};
                dataToWrite = rest;
            } catch (_e) {
                dataToWrite = clinicData;
            }
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'clinics'),
                {
                    ...dataToWrite,
                    createdAt: new Date()
                }
            );
            return { success: true, id: docRef.id };
        } catch (err) {
            return { success: false, error: err && err.message ? err.message : String(err) };
        }
    }
    async getClinics() {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const snap = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'clinics')
            );
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            try { localStorage.setItem('clinics', JSON.stringify(list)); } catch (_e) {}
            return { success: true, data: list };
        } catch (err) {
            return { success: false, data: [] };
        }
    }
    async getClinicById(id) {
        if (!this.isReady) return { success: false, data: null };
        try {
            const d = await window.firebase.getDoc(
                window.firebase.doc(window.firebase.db, 'clinics', id)
            );
            if (d && d.exists()) {
                return { success: true, data: d.data() };
            }
            return { success: false, data: null };
        } catch (err) {
            return { success: false, data: null };
        }
    }
    async updateClinic(id, clinicData) {
        if (!this.isReady) return { success: false };
        try {
            let dataToWrite;
            try {
                const { id: _id, ...rest } = clinicData || {};
                dataToWrite = rest;
            } catch (_e) {
                dataToWrite = clinicData;
            }
            const clinicDocRef = window.firebase.doc(window.firebase.db, 'clinics', id);
            const payload = {
                ...dataToWrite,
                updatedAt: new Date()
            };
            try {
                await window.firebase.updateDoc(clinicDocRef, payload);
            } catch (_updateErr) {
                // 若文件尚未建立（例如 local-default 初始診所），改用 merge upsert。
                await window.firebase.setDoc(clinicDocRef, payload, { merge: true });
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err && err.message ? err.message : String(err) };
        }
    }
    async deleteClinic(id) {
        if (!this.isReady) return { success: false };
        try {
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'clinics', id)
            );
            return { success: true };
        } catch (err) {
            return { success: false, error: err && err.message ? err.message : String(err) };
        }
    }

    // 病人數據管理
    async addPatient(patientData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }

        try {
            // 計算搜尋關鍵字
            const keywords = generateSearchKeywords({
                ...patientData,
                patientNumber: patientData.patientNumber
            });
            // 移除 id 屬性，避免儲存到文件內容
            let dataToWrite;
            try {
                const { id, ...rest } = patientData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = patientData;
            }
            const now = new Date();
            const newPatientData = {
                ...dataToWrite,
                searchKeywords: keywords,
                // 初始化套票彙總欄位，避免未購買套票時為 undefined
                consultationCount: 0,
                latestConsultationAt: null,
                latestFollowUpDate: null,
                packageActiveCount: 0,
                packageRemainingUses: 0,
                createdAt: now,
                updatedAt: now,
                createdBy: currentUser || 'system'
            };
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'patients'),
                newPatientData
            );

            console.log('病人數據已添加到雲端資料庫:', docRef.id);
            // 通知其他裝置病人列表有變更（帶本機 nonce，自己的監聽器會跳過）
            touchPatientsMeta('create', docRef.id, { nonce: newSelfMetaNonce() }).catch(() => {});
            // 樂觀就地更新本機所有快取層，不再清空後全量重讀
            this.applyPatientUpsertToCaches({ id: docRef.id, ...newPatientData });
            adjustPatientsCountCache(1);
            resetPatientPaginationCaches();
            reloadVisiblePatientList();
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加病人數據失敗:', error);
            showToast('保存病人數據失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * 把單筆病人的最新內容合併進所有「全量病人快取層」：
     * 記憶體 patientsCache、全域 patientCache、localStorage 病人陣列。
     * 分頁快取不在此處理（排序可能因更新改變），由呼叫端清平分頁快取後重載。
     *
     * @param {Object} patient 完整或局部病人欄位（必須含 id）；局部欄位會與舊記錄合併
     */
    applyPatientUpsertToCaches(patient) {
        if (!patient || patient.id === undefined || patient.id === null) return;
        const idStr = String(patient.id);
        const mergeIntoList = (list) => {
            if (!Array.isArray(list)) return;
            const idx = list.findIndex((p) => p && String(p.id) === idStr);
            if (idx >= 0) {
                list[idx] = { ...list[idx], ...patient, id: list[idx].id };
            } else {
                list.push({ ...patient, id: idStr });
            }
        };
        if (Array.isArray(this.patientsCache)) mergeIntoList(this.patientsCache);
        if (typeof patientCache !== 'undefined' && Array.isArray(patientCache)) mergeIntoList(patientCache);
        try {
            const raw = localStorage.getItem('patients');
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    mergeIntoList(arr);
                    localStorage.setItem('patients', JSON.stringify(arr));
                }
            }
        } catch (_lsErr) { /* 忽略 localStorage 錯誤 */ }
    }

    /** 從所有全量病人快取層移除單筆病人（分頁快取由呼叫端清屏） */
    applyPatientRemovalToCaches(patientId) {
        const idStr = String(patientId);
        const removeFromList = (list) => {
            if (!Array.isArray(list)) return;
            for (let i = list.length - 1; i >= 0; i--) {
                if (list[i] && String(list[i].id) === idStr) list.splice(i, 1);
            }
        };
        if (Array.isArray(this.patientsCache)) removeFromList(this.patientsCache);
        if (typeof patientCache !== 'undefined' && Array.isArray(patientCache)) removeFromList(patientCache);
        try {
            const raw = localStorage.getItem('patients');
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    removeFromList(arr);
                    localStorage.setItem('patients', JSON.stringify(arr));
                }
            }
        } catch (_lsErr) { /* 忽略 localStorage 錯誤 */ }
    }

    /**
     * 冷啟動時以 patientsMeta/lastChange（1 次讀取）驗證 localStorage
     * 全量病人快取是否仍與伺服器一致：戳記相同則沿用，免去整個集合重讀；
     * 離線期間有變更（戳記不同）才全量重取。另有 12 小時硬 TTL 保險。
     *
     * @returns {Promise<Array|null>} 可沿用的病人陣列；null 表示需重新全量讀取
     */
    async loadPatientsFromLocalStorageWithValidation() {
        let raw = null;
        try {
            raw = localStorage.getItem('patients');
        } catch (_e) {
            return null;
        }
        if (!raw) return null;
        let localData;
        try {
            localData = JSON.parse(raw);
        } catch (_e) {
            return null;
        }
        if (!Array.isArray(localData)) return null;

        const meta = readPatientsStorageMeta();
        const now = Date.now();
        if (meta && meta.fetchedAt && (now - Number(meta.fetchedAt) > window.PATIENTS_CACHE_TTL_MS)) {
            return null; // 超過硬 TTL，重新全量讀取
        }

        try {
            await waitForFirebaseDb();
            const metaSnap = await window.firebase.getDoc(
                window.firebase.doc(window.firebase.db, 'patientsMeta', 'lastChange')
            );
            const metaData = metaSnap && metaSnap.exists() ? metaSnap.data() : null;
            const serverTs = metaData ? metaTimestampToMillis(metaData.timestamp) : null;
            if (serverTs == null) {
                // 伺服器尚無 meta 文檔：病人集合從未透過 CRUD 變更，可沿用本地快取
                return localData;
            }
            stampPatientsStorageMetaTimestamp(serverTs);
            const cachedTs = meta && meta.metaTimestamp != null ? Number(meta.metaTimestamp) : null;
            if (cachedTs == null) {
                // 舊版快取沒有戳記：首次保守沿用一次（戳記已補上），之後正常比對
                return localData;
            }
            return cachedTs === serverTs ? localData : null;
        } catch (err) {
            // 驗證請求失敗（網路/權限）：TTL 內沿用快取，避免強制全量讀取
            console.warn('驗證本地病人快取失敗，TTL 內沿用:', err);
            return localData;
        }
    }

    /** 讀取 patientsMeta/lastChange 當前時間戳（毫秒），失敗回 null */
    async fetchCurrentPatientsMetaTimestamp() {
        try {
            await waitForFirebaseDb();
            const metaSnap = await window.firebase.getDoc(
                window.firebase.doc(window.firebase.db, 'patientsMeta', 'lastChange')
            );
            const metaData = metaSnap && metaSnap.exists() ? metaSnap.data() : null;
            return metaData ? metaTimestampToMillis(metaData.timestamp) : null;
        } catch (_e) {
            return null;
        }
    }

    /**
     * 讀取病人列表並使用內部快取。
     * 預設情況下若已存在快取，直接回傳快取內容以避免重複讀取。
     * 傳入 forceRefresh=true 可強制刷新快取並重新從 Firestore 取得最新資料。
     *
     * @param {boolean} forceRefresh 是否強制重新載入
     * @returns {Promise<{ success: boolean, data: Array }>} 病人資料
     */
    async getPatients(forceRefresh = false) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 若已存在快取且不需強制刷新，直接回傳快取
            // 包含空陣列亦應視為有效快取，避免在沒有病人時每次都去讀取
            if (!forceRefresh && this.patientsCache !== null) {
                return { success: true, data: this.patientsCache };
            }
            // 冷啟動：用 1 次 meta 讀取驗證 localStorage 全量快取是否仍新鮮
            if (!forceRefresh) {
                const localData = await this.loadPatientsFromLocalStorageWithValidation();
                if (localData) {
                    this.patientsCache = localData;
                    this.patientsCacheSource = 'localStorage';
                    const cacheMeta = readPatientsStorageMeta();
                    this.patientsCacheFetchedAt = (cacheMeta && cacheMeta.fetchedAt) || Date.now();
                    return { success: true, data: localData };
                }
            }
            const querySnapshot = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'patients')
            );
            const patients = [];
            querySnapshot.forEach((doc) => {
                patients.push({ id: doc.id, ...doc.data() });
            });
            // 將結果寫入快取與 localStorage，並記錄對應的 meta 時間戳
            this.patientsCache = patients;
            this.patientsCacheSource = 'remote';
            this.patientsCacheFetchedAt = Date.now();
            try {
                localStorage.setItem('patients', JSON.stringify(patients));
                const metaTs = await this.fetchCurrentPatientsMetaTimestamp();
                writePatientsStorageMeta({ fetchedAt: Date.now(), metaTimestamp: metaTs });
            } catch (lsErr) {
                console.warn('保存病人資料到本地失敗:', lsErr);
            }
            console.log('已從雲端資料庫讀取病人數據:', patients.length, '筆');
            return { success: true, data: patients };
        } catch (error) {
            console.error('讀取病人數據失敗:', error);
            return { success: false, data: [] };
        }
    }

    async updatePatient(patientId, patientData) {
        try {
            // 計算搜尋關鍵字，以便後續搜尋
            const keywords = generateSearchKeywords({
                ...patientData,
                patientNumber: patientData.patientNumber
            });
            // 移除 id 屬性，以避免 id 被儲存到文件內容
            let dataToWrite;
            try {
                const { id, ...rest } = patientData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = patientData;
            }
            const patchData = {
                ...dataToWrite,
                searchKeywords: keywords,
                updatedAt: new Date(),
                updatedBy: currentUser || 'system'
            };
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'patients', patientId),
                patchData
            );
            // 通知其他裝置病人列表有變更（帶本機 nonce，自己的監聽器會跳過）
            touchPatientsMeta('update', patientId, { nonce: newSelfMetaNonce() }).catch(() => {});
            // 樂觀就地更新本機所有快取層（局部欄位與舊記錄合併），不再清空全量快取
            this.applyPatientUpsertToCaches({ id: patientId, ...patchData });
            resetPatientPaginationCaches();
            reloadVisiblePatientList();
            return { success: true };
        } catch (error) {
            console.error('更新病人數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async deletePatient(patientId) {
        try {
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'patients', patientId)
            );
            // 通知其他裝置病人列表有變更（帶本機 nonce，自己的監聽器會跳過）
            touchPatientsMeta('delete', patientId, { nonce: newSelfMetaNonce() }).catch(() => {});
            // 樂觀地從本機所有快取層移除該病人
            this.applyPatientRemovalToCaches(patientId);
            adjustPatientsCountCache(-1);
            resetPatientPaginationCaches();
            reloadVisiblePatientList();
            return { success: true };
        } catch (error) {
            console.error('刪除病人數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 根據搜尋字串搜尋病人。
     *
     * 此方法會優先使用存於每筆病人文件中的 searchKeywords 欄位進行 array-contains 條件查詢，
     * 快速取得匹配的病人列表。若搜尋結果不足且本地已有完整的病人快取，則會在快取中
     * 以關鍵字包含邏輯進行過濾，支援尚未建立 searchKeywords 欄位的舊資料。
     *
     * @param {string} term 要搜尋的關鍵字
     * @param {number} limit 返回結果數量上限
     * @returns {Promise<{success: boolean, data: Array}>}
     */
    async searchPatients(term, limit = 20) {
        if (!this.isReady) {
            return { success: false, data: [] };
        }
        try {
            await waitForFirebaseDb();
            const searchTerm = (term || '').trim().toLowerCase();
            if (!searchTerm) {
                return { success: true, data: [] };
            }
            const results = [];
            // 透過 searchKeywords 進行查詢（主力，精簡且高效）
            try {
                const colRef = window.firebase.collection(window.firebase.db, 'patients');
                const q = window.firebase.query(
                    colRef,
                    window.firebase.where('searchKeywords', 'array-contains', searchTerm),
                    window.firebase.limit(limit)
                );
                const snapshot = await window.firebase.getDocs(q);
                snapshot.forEach(doc => {
                    results.push({ id: doc.id, ...doc.data() });
                });
            } catch (err) {
                console.error('搜尋病人時發生錯誤:', err);
            }

            /*
             * 本地補強搜尋：只有當 searchKeywords 結果不足時才執行。
             * 先嘗試用現有快取（非強制刷新）做本地補強；若快取不存在再考慮遠端讀取。
             * 這避免每次搜尋都觸發全量 getPatients(true)。
             */
            if (results.length < limit) {
                let localPatients = [];
                try {
                    const hasCache = Array.isArray(this.patientsCache) && this.patientsCache.length > 0;
                    if (hasCache) {
                        // 有快取 → 直接用，不強制刷新
                        localPatients = this.patientsCache;
                    } else {
                        // 無快取 → 用非強制模式（優先用 localStorage），失敗才遠端讀取
                        const patientRes = await this.getPatients(false);
                        if (patientRes && patientRes.success && Array.isArray(patientRes.data)) {
                            localPatients = patientRes.data;
                        }
                    }
                } catch (cacheErr) {
                    console.error('讀取病人快取時發生錯誤:', cacheErr);
                    localPatients = Array.isArray(this.patientsCache) ? this.patientsCache : [];
                }
                // 在本地資料中補強搜尋，避免重複加入已在 results 中的病人。
                if (Array.isArray(localPatients) && localPatients.length > 0) {
                    const seen = new Set(results.map(p => String(p.id)));
                    const low = searchTerm;
                    for (const p of localPatients) {
                        if (results.length >= limit) break;
                        if (seen.has(String(p.id))) continue;
                        const nameMatch = p.name && String(p.name).toLowerCase().includes(low);
                        const phoneMatch = p.phone && String(p.phone).toLowerCase().includes(low);
                        const idMatch = p.idCard && String(p.idCard).toLowerCase().includes(low);
                        const numberMatch = p.patientNumber && String(p.patientNumber).toLowerCase().includes(low);
                        if (nameMatch || phoneMatch || idMatch || numberMatch) {
                            results.push(p);
                            seen.add(String(p.id));
                        }
                    }
                }
            }
            return { success: true, data: results };
        } catch (error) {
            console.error('searchPatients 發生錯誤:', error);
            return { success: false, data: [] };
        }
    }
// 診症記錄管理
    async addConsultation(consultationData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }

        try {
            // When creating a new consultation record we only set the createdAt timestamp
            // and createdBy. The updatedAt field should be reserved for subsequent edits.
            // 移除 id 屬性，避免儲存到文件內容
            let dataToWrite;
            try {
                const { id, ...rest } = consultationData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = consultationData;
            }
            const createdAt = new Date();
            const sortDate = getConsultationEffectiveDate({ ...dataToWrite, createdAt }, createdAt);
            const searchKeywords = generateConsultationSearchKeywords({ ...dataToWrite, createdAt, sortDate });
            const fullRecord = {
                ...dataToWrite,
                createdAt,
                sortDate: sortDate || createdAt,
                createdBy: currentUser,
                searchKeywords
            };
            // 客戶端預先產生病歷 ID，使「病歷主文件 + 財務摘要 + 病人聚合 + patientsMeta」
            // 四處寫入於同一個 writeBatch 原子提交（原本是 4 次獨立 RPC）。
            const consRef = window.firebase.doc(
                window.firebase.collection(window.firebase.db, 'consultations')
            );
            const batch = window.firebase.writeBatch(window.firebase.db);
            batch.set(consRef, fullRecord);
            const summaryRecord = {
                ...dataToWrite,
                createdAt,
                sortDate: sortDate || createdAt,
                createdBy: currentUser
            };
            const summaryPayload = buildConsultationFinancialSummaryPayload(consRef.id, summaryRecord);
            batch.set(
                window.firebase.doc(window.firebase.db, 'consultationFinancialSummaries', consRef.id),
                summaryPayload,
                { merge: true }
            );
            let aggregatePlan = null;
            try {
                const aggPid = consultationData && consultationData.patientId
                    ? String(consultationData.patientId)
                    : '';
                if (aggPid) {
                    aggregatePlan = this._buildPatientAggregatePlan(
                        aggPid,
                        'add',
                        { ...dataToWrite, createdAt, sortDate, createdBy: currentUser }
                    );
                    this._appendPatientAggregateToBatch(batch, aggregatePlan);
                }
            } catch (_planErr) {
                console.warn('建構病人診症彙總計畫失敗:', _planErr);
            }
            await batch.commit();
            if (aggregatePlan) {
                this._applyPatientAggregatePlanCaches(aggregatePlan);
            }
            // 個人統計 / 財務日聚合寫入在 SA 端，無法與客戶端批次合併，
            // 於主批次成功後以 best-effort 方式同步。
            try {
                await this.syncConsultationPersonalStatsSummaries(null, {
                    id: consRef.id,
                    ...summaryRecord
                });
            } catch (_personalStatsErr) {
                console.warn('新增診症後同步個人統計摘要失敗:', _personalStatsErr);
            }
            try {
                await this.syncConsultationDailyFinancialStats(null, {
                    id: consRef.id,
                    ...summaryRecord
                });
            } catch (_finStatsErr) {
                console.warn('新增診症後同步財務日聚合失敗:', _finStatsErr);
            }

            console.log('診症記錄已添加到雲端資料庫:', consRef.id);
            // 新增診症後清除全域診症快取並移除本地存檔
            this.consultationsCache = null;
            try {
                localStorage.removeItem('consultations');
            } catch (_lsErr) {
                // 忽略 localStorage 錯誤
            }
            // 同時清除或更新單一病人的診症快取，以便下次重新讀取
            try {
                if (consultationData && consultationData.patientId) {
                    delete patientConsultationsCache[consultationData.patientId];
                    try { localStorage.removeItem('patientConsultations:' + String(consultationData.patientId)); } catch (_e) {}
                    try {
                        const pid = String(consultationData.patientId || '');
                        if (pid && consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                            delete consultationHistoryPager.patientPagedCache[pid];
                        }
                    } catch (_e2) {}
                } else {
                    // 如果缺少病人 ID，清除所有病人診症快取
                    patientConsultationsCache = {};
                    try {
                        if (consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                            consultationHistoryPager.patientPagedCache = {};
                        }
                    } catch (_e3) {}
                }
            } catch (_err) {
                // 若執行快取清理時發生錯誤，直接重置快取
                patientConsultationsCache = {};
                try {
                    if (consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                        consultationHistoryPager.patientPagedCache = {};
                    }
                } catch (_e4) {}
            }
            return { success: true, id: consRef.id };
        } catch (error) {
            console.error('添加診症記錄失敗:', error);
            showToast('保存診症記錄失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    async ensurePatientConsultationSortDates(patientId, forceRefresh = false) {
        if (!this.isReady) return { success: false, error: 'not_ready' };
        const pid = String(patientId || '');
        if (!pid) return { success: false, error: 'missing_patient_id' };
        // 全域回填已完成（systemMeta/sortDateBackfill 旗標）：歷史病歷已
        // 全數補齊 sortDate，新病歷儲存時亦必定自帶，無需每個 session
        // 第一次開病人都無 limit 全量讀取核對。forceRefresh（管理員
        // 顯式修復）仍可重跑。
        if (!forceRefresh && await isSortDateBackfillComplete()) {
            this.consultationSortDateReadyPatients[pid] = true;
            return { success: true, updatedCount: 0, skipped: 'global-backfill-complete' };
        }
        if (!forceRefresh && this.consultationSortDateReadyPatients[pid]) {
            return { success: true, updatedCount: 0 };
        }
        if (!forceRefresh && this.consultationSortDatePromises[pid]) {
            return await this.consultationSortDatePromises[pid];
        }
        const task = (async () => {
            try {
                await waitForFirebaseDb();
                const colRef = window.firebase.collection(window.firebase.db, 'consultations');
                const q = window.firebase.firestoreQuery(colRef, window.firebase.where('patientId', '==', pid));
                const snapshot = await window.firebase.getDocs(q);
                let batch = window.firebase.writeBatch(window.firebase.db);
                let opCount = 0;
                let updatedCount = 0;
                const commitBatch = async () => {
                    if (opCount > 0) {
                        await batch.commit();
                        batch = window.firebase.writeBatch(window.firebase.db);
                        opCount = 0;
                    }
                };
                const docs = snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
                for (const docSnap of docs) {
                    const data = docSnap.data() || {};
                    const computedSortDate = getConsultationEffectiveDate(data, new Date(0));
                    const existingSortDate = parseConsultationDate(data.sortDate || null);
                    const computedTime = computedSortDate && !isNaN(computedSortDate.getTime()) ? computedSortDate.getTime() : NaN;
                    const existingTime = existingSortDate && !isNaN(existingSortDate.getTime()) ? existingSortDate.getTime() : NaN;
                    if (!Number.isFinite(computedTime) || existingTime === computedTime) {
                        continue;
                    }
                    batch.update(
                        window.firebase.doc(window.firebase.db, 'consultations', docSnap.id),
                        { sortDate: computedSortDate }
                    );
                    updatedCount += 1;
                    opCount += 1;
                    if (opCount >= 400) {
                        await commitBatch();
                    }
                }
                await commitBatch();
                this.consultationSortDateReadyPatients[pid] = true;
                return { success: true, updatedCount };
            } catch (error) {
                console.error('回填病歷 sortDate 失敗:', error);
                return { success: false, error: error && error.message ? error.message : String(error) };
            } finally {
                delete this.consultationSortDatePromises[pid];
            }
        })();
        this.consultationSortDatePromises[pid] = task;
        return await task;
    }

    /**
     * 讀取診症記錄列表並使用內部快取。
     * 預設情況下若已存在快取，直接回傳快取內容以避免重複讀取。
     * 傳入 forceRefresh=true 可強制刷新快取並重新從 Firestore 取得最新資料。
     *
     * @param {boolean} forceRefresh 是否強制重新載入
     * @returns {Promise<{ success: boolean, data: Array }>} 診症記錄資料
     */
    /**
     * 取得診症記錄列表。
     * 預設僅讀取第一批資料，並將游標與快取存入實例屬性，供後續分頁使用。
     * 若傳入 forceRefresh=true 則重置游標並重新讀取第一批資料。
     *
     * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取第一頁資料
     * @returns {Promise<{ success: boolean, data: Array, hasMore: boolean }>}
     */
    async getConsultations(forceRefresh = false) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 有內存快取且不需強制刷新時直接返回
            if (!forceRefresh && this.consultationsCache !== null) {
                return { success: true, data: this.consultationsCache, hasMore: !!this.consultationsHasMore };
            }
            // 優先從 localStorage 載入診症記錄（僅限第一頁）
            if (!forceRefresh) {
                try {
                    const stored = localStorage.getItem('consultations');
                    if (stored) {
                        const localData = JSON.parse(stored);
                        if (Array.isArray(localData)) {
                            this.consultationsCache = localData;
                            // 本地快取不保存分頁游標或是否有更多資料
                            this.consultationsLastVisible = null;
                            this.consultationsHasMore = false;
                            return { success: true, data: this.consultationsCache, hasMore: this.consultationsHasMore };
                        }
                    }
                } catch (lsErr) {
                    console.warn('載入本地診症記錄失敗:', lsErr);
                }
            }
            // 清除既有快取與游標
            this.consultationsCache = [];
            this.consultationsLastVisible = null;
            this.consultationsHasMore = false;
            const pageSize = 100;
            // 建立查詢：使用 limit 控制單次載入筆數
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'consultations'),
                window.firebase.limit(pageSize),
            );
            const querySnapshot = await window.firebase.getDocs(q);
            const consultations = [];
            querySnapshot.forEach((docSnap) => {
                consultations.push({ id: docSnap.id, ...docSnap.data() });
            });
            // 設定游標為最後一筆文件
            this.consultationsLastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;
            // 判斷是否還有下一頁
            this.consultationsHasMore = querySnapshot.docs.length === pageSize;
            // 更新快取
            this.consultationsCache = consultations;
            // 將結果寫入 localStorage 供下次使用
            try {
                localStorage.setItem('consultations', JSON.stringify(consultations));
            } catch (lsErr) {
                console.warn('保存診症記錄到本地失敗:', lsErr);
            }
            console.log('已從雲端資料庫讀取診症記錄，載入', consultations.length, '筆');
            return { success: true, data: consultations, hasMore: this.consultationsHasMore };
        } catch (error) {
            console.error('讀取診症記錄失敗:', error);
            return { success: false, data: [] };
        }
    }

    /**
     * 取得診症記錄的下一頁資料。
     * 需要先呼叫 getConsultations() 讀取第一批資料後，才能使用本方法。
     * 本方法會更新快取及游標並將新加入的資料附加至快取陣列。
     * 若沒有更多資料可讀取，將回傳空陣列並維持 hasMore 為 false。
     *
     * @returns {Promise<{ success: boolean, data: Array, hasMore: boolean }>}
     */
    async getConsultationsNextPage() {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 若上一頁沒有讀取滿 pageSize，表示沒有更多資料
            if (!this.consultationsHasMore || !this.consultationsLastVisible) {
                return { success: true, data: [], hasMore: false };
            }
            const pageSize = 100;
            // 建立查詢：從上一頁最後一筆之後開始
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'consultations'),
                window.firebase.startAfter(this.consultationsLastVisible),
                window.firebase.limit(pageSize),
            );
            const snapshot = await window.firebase.getDocs(q);
            const newData = [];
            snapshot.forEach((docSnap) => {
                newData.push({ id: docSnap.id, ...docSnap.data() });
            });
            // 更新游標
            this.consultationsLastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : this.consultationsLastVisible;
            // 判斷是否還有更多資料
            this.consultationsHasMore = snapshot.docs.length === pageSize;
            // 將新資料附加至快取
            this.consultationsCache = Array.isArray(this.consultationsCache) ? this.consultationsCache.concat(newData) : newData;
            // 更新 localStorage 快取，用於下次頁面載入
            try {
                localStorage.setItem('consultations', JSON.stringify(this.consultationsCache));
            } catch (lsErr) {
                console.warn('保存診症記錄到本地失敗:', lsErr);
            }
            return { success: true, data: this.consultationsCache, hasMore: this.consultationsHasMore };
        } catch (error) {
            console.error('讀取診症記錄下一頁失敗:', error);
            return { success: false, data: [] };
        }
    }

    async syncConsultationFinancialSummary(consultationId, consultationData, options = {}) {
        if (!this.isReady) return { success: false };
        try {
            await waitForFirebaseDb();
            const idStr = String(consultationId || '');
            if (!idStr) return { success: false, error: 'missing_consultation_id' };
            const payload = buildConsultationFinancialSummaryPayload(idStr, consultationData, options);
            await window.firebase.setDoc(
                window.firebase.doc(window.firebase.db, 'consultationFinancialSummaries', idStr),
                payload,
                { merge: true }
            );
            return { success: true, data: payload };
        } catch (error) {
            console.error('同步財務摘要失敗:', error);
            return { success: false, error: error && error.message ? error.message : String(error) };
        }
    }

    async syncConsultationFinancialSummaries(records, options = {}) {
        if (!this.isReady) return { success: false, syncedCount: 0 };
        try {
            await waitForFirebaseDb();
            const list = Array.isArray(records) ? records : [];
            let batch = window.firebase.writeBatch(window.firebase.db);
            let opCount = 0;
            let syncedCount = 0;
            const commitBatch = async () => {
                if (opCount > 0) {
                    await batch.commit();
                    batch = window.firebase.writeBatch(window.firebase.db);
                    opCount = 0;
                }
            };
            for (const record of list) {
                const idStr = String(record && (record.id || record.consultationId) ? (record.id || record.consultationId) : '');
                if (!idStr) continue;
                const payload = buildConsultationFinancialSummaryPayload(idStr, record, options);
                batch.set(
                    window.firebase.doc(window.firebase.db, 'consultationFinancialSummaries', idStr),
                    payload,
                    { merge: true }
                );
                syncedCount += 1;
                opCount += 1;
                if (opCount >= 400) {
                    await commitBatch();
                }
            }
            await commitBatch();
            return { success: true, syncedCount };
        } catch (error) {
            console.error('批次同步財務摘要失敗:', error);
            return { success: false, syncedCount: 0, error: error && error.message ? error.message : String(error) };
        }
    }

    async syncConsultationPersonalStatsSummaries(beforeRecord, afterRecord) {
        if (!this.isReady) return { success: false };
        try {
            const uid = getCurrentAuthUid();
            if (!uid) return { success: false, error: 'not-signed-in' };
            if (!beforeRecord && !afterRecord) {
                return { success: true, changedCount: 0 };
            }
            const result = await callPersonalStatsApi('sync', {
                before: beforeRecord || null,
                after: afterRecord || null
            });
            // 本機快取只歸目前使用者；其他 owner（如代診醫師）的快取
            // 會在他們下次開啟頁面時自然刷新
            clearPersonalStatisticsLocalCache([uid]);
            return { success: true, changedCount: (result && result.changedOwnerCount) || 0, result };
        } catch (error) {
            console.error('同步個人統計摘要失敗:', error);
            return { success: false, error: error && error.message ? error.message : String(error) };
        }
    }

    async syncConsultationDailyFinancialStats(beforeRecord, afterRecord) {
        if (!this.isReady) return { success: false };
        try {
            if (!beforeRecord && !afterRecord) {
                return { success: true, changedBuckets: 0 };
            }
            const result = await callFinancialStatsApi('sync', {
                before: beforeRecord || null,
                after: afterRecord || null
            });
            return { success: true, changedBuckets: (result && result.changedBuckets) || 0 };
        } catch (error) {
            console.warn('同步財務日聚合失敗:', error && error.message);
            return { success: false, error: error && error.message ? error.message : String(error) };
        }
    }

    /**
     * Firestore 伺服器端聚合查詢：只回結果數字，不回傳任何文件。
     * 比拉全量 consultations 後前端 reduce 省得多（幾乎 0 流量）。
     * 適用於：總營收、總筆數、平均營收這幾個 Key Metrics。
     * 分組統計（doctorStats / serviceStats / dailyStats）仍走後端 dailyFinancialStats 增量聚合。
     */
    async getFinancialAggregates(startDateStr, endDateStr, doctorFilter = null, clinicFilter = null) {
        if (!this.isReady) return { success: false, data: {} };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultationFinancialSummaries');
            const start = hkBoundOf(new Date(startDateStr), false);
            const end = hkBoundOf(new Date(endDateStr), true);
            const parts = [
                window.firebase.where('status', '==', 'completed'),
                window.firebase.where('sortDate', '>=', start),
                window.firebase.where('sortDate', '<=', end),
            ];
            if (doctorFilter) parts.push(window.firebase.where('doctor', '==', doctorFilter));
            if (clinicFilter) parts.push(window.firebase.where('clinicId', '==', clinicFilter));
            const q = window.firebase.firestoreQuery(colRef, ...parts);
            const agg = await window.firebase.getAggregateFromServer(q, {
                totalRevenue: window.firebase.sum('financialTotalAmount'),
                count: window.firebase.count(),
            });
            const d = agg.data();
            const totalConsultations = Number(d.count || 0);
            const totalRevenue = Math.round(Number(d.totalRevenue || 0));
            const averageRevenue = totalConsultations > 0 ? Math.round(totalRevenue / totalConsultations) : 0;
            return { success: true, data: { totalRevenue, averageRevenue, totalConsultations } };
        } catch (error) {
            console.warn('雲端資料庫聚合查詢失敗:', error && error.message);
            return { success: false, data: {}, error: error && error.message ? error.message : String(error) };
        }
    }

    /**
     * 按需鑽取：查詢指定 dateKey（YYYY-MM-DD）的 consultationFinancialSummaries。
     * 只拉一天的資料（通常幾十筆），比 range 查詢整個報表期間省得多。
     */
    async getConsultationFinancialSummariesByDateKey(dateKey, doctorFilter = null, clinicFilter = null) {
        if (!this.isReady || !dateKey) return { success: false, data: [] };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultationFinancialSummaries');
            const parts = [window.firebase.where('dateKey', '==', dateKey)];
            parts.push(window.firebase.where('status', '==', 'completed'));
            if (doctorFilter) parts.push(window.firebase.where('doctor', '==', doctorFilter));
            if (clinicFilter) parts.push(window.firebase.where('clinicId', '==', clinicFilter));
            const q = window.firebase.firestoreQuery(
                colRef,
                ...parts,
                window.firebase.orderBy('sortDate', 'asc'),
                window.firebase.limit(500),
            );
            const snap = await window.firebase.getDocs(q);
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            return { success: true, data: list };
        } catch (error) {
            console.warn('單日鑽取查詢失敗:', error && error.message);
            return { success: false, data: [], error: error && error.message ? error.message : String(error) };
        }
    }

    /**
     * 查詢指定日期範圍的 dailyFinancialStats 聚合。
     * 前端用於財務報表的 summary cards 與 charts（約 N 筆／月）。
     * 鑽取明細仍走 consultationFinancialSummaries。
     */
    async getDailyFinancialStatsByRange(startDateStr, endDateStr, clinicFilter = null) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'dailyFinancialStats');
            const start = hkBoundOf(new Date(startDateStr), false);
            const end = hkBoundOf(new Date(endDateStr), true);
            const pageSize = 300;
            const baseParts = [];
            if (clinicFilter) baseParts.push(window.firebase.where('clinicId', '==', clinicFilter));
            const DAILY_STATS_FIELDS = [
                'dateKey', 'sortDate', 'clinicId', 'clinicName',
                'totalRevenue', 'totalConsultations', 'averageRevenue',
                'doctorStats', 'serviceStats',
                'syncedAt', 'summaryVersion', 'updatedAt'
            ];
            let q = window.firebase.firestoreQuery(
                colRef,
                ...baseParts,
                window.firebase.orderBy('sortDate', 'asc'),
                window.firebase.where('sortDate', '>=', start),
                window.firebase.where('sortDate', '<=', end),
                window.firebase.limit(pageSize),
            );
            let snap = await window.firebase.getDocs(q);
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            let lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            while (snap.docs.length === pageSize && lastVisible) {
                q = window.firebase.firestoreQuery(
                    colRef,
                    ...baseParts,
                    window.firebase.orderBy('sortDate', 'asc'),
                    window.firebase.where('sortDate', '>=', start),
                    window.firebase.where('sortDate', '<=', end),
                    window.firebase.startAfter(lastVisible),
                    window.firebase.limit(pageSize),
                );
                snap = await window.firebase.getDocs(q);
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            }
            return { success: true, data: list };
        } catch (error) {
            console.warn('財務日聚合查詢失敗:', error && error.message);
            return { success: false, data: [], error: error && error.message ? error.message : String(error) };
        }
    }

    async ensureDailyFinancialStatsInitialized(startDate, endDate, clinicId) {
        if (!this.isReady) return { success: false };
        try {
            const res = await callFinancialStatsApi('rebuild', {
                startDate, endDate,
                clinicId: clinicId || null
            });
            return { success: true, ...res };
        } catch (error) {
            console.error('重建財務日聚合失敗:', error && error.message);
            return { success: false, error: error && error.message ? error.message : String(error) };
        }
    }

    async ensurePersonalStatsSummariesInitialized(ownerId) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const owner = normalizePersonalStatsString(ownerId);
            if (!owner) return { success: false, data: [], error: 'missing_owner_id' };
            // 全量重建由 SA 端執行（含租約/dirty 協議）；busy 代表另一裝置
            // 正在重建，視為已初始化中，不算失敗
            const res = await callPersonalStatsApi('rebuild', {});
            if (res && res.busy) {
                return { success: true, data: [], initialized: true, rebuilt: false, busy: true };
            }
            return {
                success: true,
                data: [],
                initialized: true,
                rebuilt: !!(res && res.rebuilt)
            };
        } catch (error) {
            console.error('初始化個人統計摘要失敗:', error);
            return { success: false, data: [], error: error && error.message ? error.message : String(error) };
        }
    }

    async getPersonalStatsMonthlySummaries(ownerId) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 初始化（首次全量重建）可能因索引缺失/權限/網路失敗，但增量
            // 同步的 bucket 仍可能存在，故不中斷讀取，只把失敗狀態帶回前端。
            const initRes = await this.ensurePersonalStatsSummariesInitialized(ownerId);
            const initError = initRes && initRes.success
                ? null
                : ((initRes && initRes.error) || 'personal-stats-init-failed');
            const owner = normalizePersonalStatsString(ownerId);
            if (!owner) return { success: false, data: [], error: 'missing_owner_id' };
            const snap = await window.firebase.getDocs(
                window.firebase.firestoreQuery(
                    window.firebase.collection(window.firebase.db, PERSONAL_STATS_SUMMARY_COLLECTION),
                    window.firebase.where('ownerId', '==', owner)
                )
            );
            const list = [];
            snap.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() });
            });
            list.sort((a, b) => {
                const aMonth = normalizePersonalStatsString(a && a.monthKey);
                const bMonth = normalizePersonalStatsString(b && b.monthKey);
                if (aMonth !== bMonth) return bMonth.localeCompare(aMonth);
                return normalizePersonalStatsString(a && a.clinicName).localeCompare(normalizePersonalStatsString(b && b.clinicName), 'zh-Hant');
            });
            return { success: true, data: list, initError };
        } catch (error) {
            console.error('讀取個人統計摘要失敗:', error);
            return { success: false, data: [], error: error && error.message ? error.message : String(error) };
        }
    }

    async getConsultationFinancialSummariesByRangeAndDoctor(startDateStr, endDateStr, doctorFilter = null, completedOnly = true, clinicFilter = null) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultationFinancialSummaries');
            const parseOrNull = (s) => {
                if (!s || typeof s !== 'string') return null;
                const d = new Date(s);
                return isNaN(d.getTime()) ? null : d;
            };
            let start = parseOrNull(startDateStr);
            let end = parseOrNull(endDateStr);
            const today = new Date();
            if (!start && end) start = new Date(end);
            if (!end && start) end = new Date(start);
            if (!start && !end) {
                start = new Date(today);
                end = new Date(today);
            }
            start = hkBoundOf(start, false);
            end = hkBoundOf(end, true);
            const pageSize = 300;
            const baseParts = [];
            if (completedOnly) baseParts.push(window.firebase.where('status', '==', 'completed'));
            if (doctorFilter) baseParts.push(window.firebase.where('doctor', '==', doctorFilter));
            if (clinicFilter) baseParts.push(window.firebase.where('clinicId', '==', clinicFilter));
            let q = window.firebase.firestoreQuery(
                colRef,
                ...baseParts,
                window.firebase.orderBy('sortDate', 'asc'),
                window.firebase.where('sortDate', '>=', start),
                window.firebase.where('sortDate', '<=', end),
                window.firebase.limit(pageSize),
            );
            let snap = await window.firebase.getDocs(q);
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            let lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            while (snap.docs.length === pageSize && lastVisible) {
                q = window.firebase.firestoreQuery(
                    colRef,
                    ...baseParts,
                    window.firebase.orderBy('sortDate', 'asc'),
                    window.firebase.where('sortDate', '>=', start),
                    window.firebase.where('sortDate', '<=', end),
                    window.firebase.startAfter(lastVisible),
                    window.firebase.limit(pageSize)
                );
                snap = await window.firebase.getDocs(q);
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            }
            return { success: true, data: list };
        } catch (error) {
            console.warn('財務摘要條件查詢失敗:', error);
            if (typeof window.indexManager !== 'undefined') {
                window.indexManager.register(error, '財務摘要查詢（consultationFinancialSummaries）');
            }
            return { success: false, data: [], error: 'financial-summary-query-failed' };
        }
    }

    async getConsultationFinancialSummariesDeltaByRangeAndDoctor(sinceDate, startDateStr, endDateStr, doctorFilter = null, clinicFilter = null) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultationFinancialSummaries');
            const start = hkBoundOf(new Date(startDateStr), false);
            const end = hkBoundOf(new Date(endDateStr), true);
            const pageSize = 300;
            const parts = [];
            if (doctorFilter) parts.push(window.firebase.where('doctor', '==', doctorFilter));
            if (clinicFilter) parts.push(window.firebase.where('clinicId', '==', clinicFilter));
            parts.push(window.firebase.where('sortDate', '>=', start));
            parts.push(window.firebase.where('sortDate', '<=', end));
            parts.push(window.firebase.where('syncedAt', '>', sinceDate));
            let q = window.firebase.firestoreQuery(
                colRef,
                ...parts,
                window.firebase.orderBy('syncedAt', 'asc'),
                window.firebase.limit(pageSize),
            );
            let snap = await window.firebase.getDocs(q);
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            let lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            while (snap.docs.length === pageSize && lastVisible) {
                q = window.firebase.firestoreQuery(
                    colRef,
                    ...parts,
                    window.firebase.orderBy('syncedAt', 'asc'),
                    window.firebase.startAfter(lastVisible),
                    window.firebase.limit(pageSize)
                );
                snap = await window.firebase.getDocs(q);
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            }
            return { success: true, data: list };
        } catch (error) {
            console.warn('財務摘要增量查詢失敗:', error);
            if (typeof window.indexManager !== 'undefined') {
                window.indexManager.register(error, '財務摘要增量查詢（syncedAt 範圍）');
            }
            return { success: false, data: [] };
        }
    }

    async hasConsultationFinancialSummaryUpdates(startDateStr, endDateStr, doctorFilter = null, sinceDate, clinicFilter = null) {
        if (!this.isReady) return false;
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultationFinancialSummaries');
            const start = hkBoundOf(new Date(startDateStr), false);
            const end = hkBoundOf(new Date(endDateStr), true);
            const parts = [];
            if (doctorFilter) parts.push(window.firebase.where('doctor', '==', doctorFilter));
            if (clinicFilter) parts.push(window.firebase.where('clinicId', '==', clinicFilter));
            parts.push(window.firebase.where('sortDate', '>=', start));
            parts.push(window.firebase.where('sortDate', '<=', end));
            if (sinceDate) parts.push(window.firebase.where('syncedAt', '>', sinceDate));
            parts.push(window.firebase.orderBy('syncedAt', 'asc'));
            parts.push(window.firebase.limit(1));
            const q = window.firebase.firestoreQuery(colRef, ...parts);
            const snap = await window.firebase.getDocs(q);
            return !!(snap && snap.size > 0);
        } catch (error) {
            return true;
        }
    }

    async getConsultationsByRangeAndDoctor(startDateStr, endDateStr, doctorFilter = null, completedOnly = true, clinicFilter = null) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const parseOrNull = (s) => {
                if (!s || typeof s !== 'string') return null;
                const d = new Date(s);
                return isNaN(d.getTime()) ? null : d;
            };
            let start = parseOrNull(startDateStr);
            let end = parseOrNull(endDateStr);
            const today = new Date();
            if (!start && end) {
                start = new Date(end);
            }
            if (!end && start) {
                end = new Date(start);
            }
            if (!start && !end) {
                start = new Date(today);
                end = new Date(today);
            }
            start = hkBoundOf(start, false);
            end = hkBoundOf(end, true);
            const pageSize = 300;
            const baseParts = [];
            if (completedOnly) baseParts.push(window.firebase.where('status', '==', 'completed'));
            if (doctorFilter) baseParts.push(window.firebase.where('doctor', '==', doctorFilter));
            if (clinicFilter) baseParts.push(window.firebase.where('clinicId', '==', clinicFilter));
            const runRangeQuery = async (fieldName, startValue, endValue) => {
                const list = [];
                let q = window.firebase.firestoreQuery(
                    colRef,
                    ...baseParts,
                    window.firebase.orderBy(fieldName, 'asc'),
                    window.firebase.where(fieldName, '>=', startValue),
                    window.firebase.where(fieldName, '<=', endValue),
                    window.firebase.limit(pageSize)
                );
                let snap = await window.firebase.getDocs(q);
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                let lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
                while (snap.docs.length === pageSize && lastVisible) {
                    q = window.firebase.firestoreQuery(
                        colRef,
                        ...baseParts,
                        window.firebase.orderBy(fieldName, 'asc'),
                        window.firebase.where(fieldName, '>=', startValue),
                        window.firebase.where(fieldName, '<=', endValue),
                        window.firebase.startAfter(lastVisible),
                        window.firebase.limit(pageSize)
                    );
                    snap = await window.firebase.getDocs(q);
                    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                    lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
                }
                return list;
            };
            // 主力查詢 sortDate：所有現代寫入都會帶標準化 Timestamp，
            // 可一併涵蓋 date 為字串／缺失的舊資料，不會再靜默漏單。
            // 索引首次確認缺失後，本工作階段直接跳過此嘗試，避免每次都白等一條失敗查詢。
            if (!this.sortDateRangeIndexMissing) try {
                const list = await runRangeQuery('sortDate', start, end);
                return { success: true, data: list };
            } catch (sortDateErr) {
                // 缺少 (status[,doctor][,clinic], sortDate) 複合索引時：
                // 印出建立連結，並退回舊的 date／createdAt 查詢，避免功能中斷。
                const msg = String((sortDateErr && sortDateErr.message) || sortDateErr || '');
                if (msg.toLowerCase().includes('index')) {
                    this.sortDateRangeIndexMissing = true;
                    if (typeof window.indexManager !== 'undefined') {
                        window.indexManager.register(sortDateErr, '診症財務報表（status + doctor/clinicId + sortDate）');
                    }
                } else {
                    console.warn('sortDate 查詢失敗，暫用 date 查詢：', msg);
                }
            }
            let list = await runRangeQuery('date', start, end);
            if (list.length === 0) {
                list = await runRangeQuery('createdAt', start, end);
            }
            return { success: true, data: list };
        } catch (error) {
            console.warn('目標條件查詢失敗（已停用全量回退）:', error);
            return { success: false, data: [], error: 'targeted-query-failed' };
        }
    }

    async getConsultationsByDoctor(doctor, pageSize = 100) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            let q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('doctor', '==', doctor),
                window.firebase.orderBy('date', 'asc'),
                window.firebase.limit(pageSize),
            );
            let snap = await window.firebase.getDocs(q);
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            let lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            while (snap.docs.length === pageSize && lastVisible) {
                q = window.firebase.firestoreQuery(
                    colRef,
                    window.firebase.where('doctor', '==', doctor),
                    window.firebase.orderBy('date', 'asc'),
                    window.firebase.startAfter(lastVisible),
                    window.firebase.limit(pageSize)
                );
                snap = await window.firebase.getDocs(q);
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                lastVisible = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            }
            return { success: true, data: list };
        } catch (error) {
            try {
                let res = await this.getConsultations(true);
                if (!res || !res.success) return { success: false, data: [] };
                while (res.hasMore) {
                    res = await this.getConsultationsNextPage();
                    if (!res || !res.success) break;
                }
                const all = Array.isArray(this.consultationsCache) ? this.consultationsCache.slice() : [];
                const filtered = all.filter(c => c && String(c.doctor) === String(doctor));
                return { success: true, data: filtered };
            } catch (_e) {
                return { success: false, data: [] };
            }
        }
    }

    async getConsultationsDeltaByRangeAndDoctor(sinceDate, doctorFilter = null, completedOnly = true, clinicFilter = null) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const pageSize = 100;
            const list = [];
            const q1Parts = [];
            if (completedOnly) q1Parts.push(window.firebase.where('status', '==', 'completed'));
            if (doctorFilter) q1Parts.push(window.firebase.where('doctor', '==', doctorFilter));
            if (clinicFilter) q1Parts.push(window.firebase.where('clinicId', '==', clinicFilter));
            let q1 = window.firebase.firestoreQuery(
                colRef,
                ...q1Parts,
                window.firebase.where('updatedAt', '>', sinceDate),
                window.firebase.orderBy('updatedAt', 'asc'),
                window.firebase.limit(pageSize),
            );
            let snap1 = await window.firebase.getDocs(q1);
            snap1.forEach(d => list.push({ id: d.id, ...d.data() }));
            let last1 = snap1.docs.length ? snap1.docs[snap1.docs.length - 1] : null;
            while (snap1.docs.length === pageSize && last1) {
                q1 = window.firebase.firestoreQuery(
                    colRef,
                    ...q1Parts,
                    window.firebase.where('updatedAt', '>', sinceDate),
                    window.firebase.orderBy('updatedAt', 'asc'),
                    window.firebase.startAfter(last1),
                    window.firebase.limit(pageSize)
                );
                snap1 = await window.firebase.getDocs(q1);
                snap1.forEach(d => list.push({ id: d.id, ...d.data() }));
                last1 = snap1.docs.length ? snap1.docs[snap1.docs.length - 1] : null;
            }
            // 不需再以 createdAt 補查：文件建立時 updatedAt 即等於 createdAt，
            // 之後只會更大，故 createdAt > sinceDate 必定被 updatedAt > sinceDate 覆蓋。
            const seen = new Set();
            const merged = [];
            for (const r of list) {
                const id = String(r.id);
                if (seen.has(id)) continue;
                seen.add(id);
                merged.push(r);
            }
            return { success: true, data: merged };
        } catch (error) {
            return { success: false, data: [] };
        }
    }

    async getConsultationsDeltaByDoctor(doctor, sinceDate) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const pageSize = 100;
            const list = [];
            let q1 = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('doctor', '==', doctor),
                window.firebase.where('updatedAt', '>', sinceDate),
                window.firebase.orderBy('updatedAt', 'asc'),
                window.firebase.limit(pageSize),
            );
            let snap1 = await window.firebase.getDocs(q1);
            snap1.forEach(d => list.push({ id: d.id, ...d.data() }));
            let last1 = snap1.docs.length ? snap1.docs[snap1.docs.length - 1] : null;
            while (snap1.docs.length === pageSize && last1) {
                q1 = window.firebase.firestoreQuery(
                    colRef,
                    window.firebase.where('doctor', '==', doctor),
                    window.firebase.where('updatedAt', '>', sinceDate),
                    window.firebase.orderBy('updatedAt', 'asc'),
                    window.firebase.startAfter(last1),
                    window.firebase.limit(pageSize),
                );
                snap1 = await window.firebase.getDocs(q1);
                snap1.forEach(d => list.push({ id: d.id, ...d.data() }));
                last1 = snap1.docs.length ? snap1.docs[snap1.docs.length - 1] : null;
            }
            let q2 = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('doctor', '==', doctor),
                window.firebase.where('createdAt', '>', sinceDate),
                window.firebase.orderBy('createdAt', 'asc'),
                window.firebase.limit(pageSize),
            );
            let snap2 = await window.firebase.getDocs(q2);
            snap2.forEach(d => list.push({ id: d.id, ...d.data() }));
            let last2 = snap2.docs.length ? snap2.docs[snap2.docs.length - 1] : null;
            while (snap2.docs.length === pageSize && last2) {
                q2 = window.firebase.firestoreQuery(
                    colRef,
                    window.firebase.where('doctor', '==', doctor),
                    window.firebase.where('createdAt', '>', sinceDate),
                    window.firebase.orderBy('createdAt', 'asc'),
                    window.firebase.startAfter(last2),
                    window.firebase.limit(pageSize),
                );
                snap2 = await window.firebase.getDocs(q2);
                snap2.forEach(d => list.push({ id: d.id, ...d.data() }));
                last2 = snap2.docs.length ? snap2.docs[snap2.docs.length - 1] : null;
            }
            const seen = new Set();
            const merged = [];
            for (const r of list) {
                const id = String(r.id);
                if (seen.has(id)) continue;
                seen.add(id);
                merged.push(r);
            }
            return { success: true, data: merged };
        } catch (error) {
            return { success: false, data: [] };
        }
    }

    async hasConsultationUpdates(startDateStr, endDateStr, doctorFilter = null, sinceDate, clinicFilter = null) {
        if (!this.isReady) return false;
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const start = new Date(startDateStr);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDateStr);
            end.setHours(23, 59, 59, 999);
            const parts = [];
            if (doctorFilter) parts.push(window.firebase.where('doctor', '==', doctorFilter));
            if (clinicFilter) parts.push(window.firebase.where('clinicId', '==', clinicFilter));
            parts.push(window.firebase.where('date', '>=', start));
            parts.push(window.firebase.where('date', '<=', end));
            if (sinceDate) parts.push(window.firebase.where('updatedAt', '>', sinceDate));
            parts.push(window.firebase.orderBy('date', 'asc'));
            parts.push(window.firebase.limit(1));
            const q = window.firebase.firestoreQuery(colRef, ...parts);
            const snap = await window.firebase.getDocs(q);
            if (snap && snap.size > 0) return true;
            if (sinceDate) {
                const parts2 = [];
                if (doctorFilter) parts2.push(window.firebase.where('doctor', '==', doctorFilter));
                if (clinicFilter) parts2.push(window.firebase.where('clinicId', '==', clinicFilter));
                parts2.push(window.firebase.where('date', '>=', start));
                parts2.push(window.firebase.where('date', '<=', end));
                parts2.push(window.firebase.where('createdAt', '>', sinceDate));
                parts2.push(window.firebase.orderBy('date', 'asc'));
                parts2.push(window.firebase.limit(1));
                const q2 = window.firebase.firestoreQuery(colRef, ...parts2);
                const snap2 = await window.firebase.getDocs(q2);
                return snap2 && snap2.size > 0;
            }
            return false;
        } catch (error) {
            // 若複合索引缺失或條件不支援，回退為「假設有更新」以確保數據正確
            return true;
        }
    }

    async hasDoctorConsultationUpdates(doctor, sinceDate) {
        if (!this.isReady) return false;
        try {
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('doctor', '==', doctor),
                window.firebase.where('updatedAt', '>', sinceDate),
                window.firebase.orderBy('date', 'asc'),
                window.firebase.limit(1)
            );
            const snap = await window.firebase.getDocs(q);
            if (snap && snap.size > 0) return true;
            const q2 = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('doctor', '==', doctor),
                window.firebase.where('createdAt', '>', sinceDate),
                window.firebase.orderBy('date', 'asc'),
                window.firebase.limit(1)
            );
            const snap2 = await window.firebase.getDocs(q2);
            return snap2 && snap2.size > 0;
        } catch (error) {
            return true;
        }
    }

    async getConsultationById(consultationId, forceRefresh = false) {
        if (!this.isReady) return { success: false, data: null };
        try {
            const idStr = String(consultationId);
            let found = null;
            if (!forceRefresh && Array.isArray(this.consultationsCache)) {
                found = this.consultationsCache.find(c => String(c.id) === idStr) || null;
            }
            if (found) {
                return { success: true, data: found };
            }
            const docRef = window.firebase.doc(window.firebase.db, 'consultations', idStr);
            const docSnap = await window.firebase.getDoc(docRef);
            if (docSnap && docSnap.exists()) {
                const record = { id: docSnap.id, ...docSnap.data() };
                if (Array.isArray(this.consultationsCache)) {
                    const cacheIndex = this.consultationsCache.findIndex(c => String(c.id) === idStr);
                    if (cacheIndex >= 0) {
                        this.consultationsCache[cacheIndex] = record;
                    } else {
                        this.consultationsCache.push(record);
                    }
                } else {
                    this.consultationsCache = [record];
                }
                try {
                    if (Array.isArray(consultations)) {
                        const listIndex = consultations.findIndex(c => String(c.id) === idStr);
                        if (listIndex >= 0) {
                            consultations[listIndex] = record;
                        } else {
                            consultations.push(record);
                        }
                    } else {
                        consultations = [record];
                    }
                } catch (_syncErr) {
                    // 忽略同步全域 consultations 失敗
                }
                try {
                    localStorage.setItem('consultations', JSON.stringify(Array.isArray(this.consultationsCache) ? this.consultationsCache : [record]));
                } catch (lsErr) {
                    console.warn('保存診症記錄到本地失敗:', lsErr);
                }
                return { success: true, data: record };
            }
            return { success: false, data: null };
        } catch (error) {
            console.error('讀取單筆診症記錄失敗:', error);
            return { success: false, data: null };
        }
    }

    /**
     * 更新診症記錄。
     * @param {object} [options]
     * @param {boolean} [options.skipSideEffects=false]
     *        僅寫入病歷主文件，不同步財務摘要／SA 統計／病人聚合／patientsMeta。
     *        適用於「不影響收費金額與病人歸屬」的局部回寫，例如：
     *        套票餘次快照回填、儲值付款狀態（walletPaid/paymentStatus/pendingAmount）、
     *        待收款核銷。這些更新若走完整鏈，會產生淨值為 0 的重複統計寫入。
     */
    async updateConsultation(consultationId, consultationData, options = {}) {
        try {
            const skipSideEffects = !!(options && options.skipSideEffects);
            // 移除 id 屬性，避免將 id 寫入文件內容
            let dataToWrite;
            let existingRecord = null;
            try {
                const { id, ...rest } = consultationData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = consultationData;
            }
            const updatedAt = new Date();
            try {
                const existingDoc = await window.firebase.getDoc(window.firebase.doc(window.firebase.db, 'consultations', consultationId));
                if (existingDoc && existingDoc.exists()) {
                    existingRecord = existingDoc.data() || null;
                }
            } catch (_existingErr) {}
            let temporalBase = { ...(existingRecord || {}), ...dataToWrite, updatedAt };
            const sortDate = getConsultationEffectiveDate(temporalBase, updatedAt);
            const searchKeywords = generateConsultationSearchKeywords({ ...temporalBase, sortDate: sortDate || updatedAt });
            const corePatch = {
                ...dataToWrite,
                updatedAt,
                sortDate: sortDate || updatedAt,
                updatedBy: currentUser,
                searchKeywords
            };
            const consRef = window.firebase.doc(window.firebase.db, 'consultations', String(consultationId));
            const afterRecord = {
                id: String(consultationId),
                ...(existingRecord || {}),
                ...dataToWrite,
                updatedAt,
                sortDate: sortDate || updatedAt,
                updatedBy: currentUser
            };

            if (skipSideEffects) {
                // 局部欄位回寫：單次 updateDoc，不觸發任何連鎖寫入。
                await window.firebase.updateDoc(consRef, corePatch);
            } else {
                // 完整編輯：病歷主文件 + 財務摘要 + 病人聚合 + patientsMeta 單一批次原子提交。
                const batch = window.firebase.writeBatch(window.firebase.db);
                batch.update(consRef, corePatch);
                const summaryPayload = buildConsultationFinancialSummaryPayload(String(consultationId), afterRecord);
                batch.set(
                    window.firebase.doc(window.firebase.db, 'consultationFinancialSummaries', String(consultationId)),
                    summaryPayload,
                    { merge: true }
                );
                let aggregatePlan = null;
                try {
                    const oldPid = String((existingRecord && existingRecord.patientId) || '');
                    const newPid = String((consultationData && consultationData.patientId) || oldPid || '');
                    if (newPid) {
                        aggregatePlan = this._buildPatientAggregatePlan(
                            newPid,
                            'update',
                            {
                                ...(existingRecord || {}),
                                ...dataToWrite,
                                updatedAt,
                                sortDate: sortDate || updatedAt
                            },
                            oldPid && oldPid !== newPid ? oldPid : null
                        );
                    } else if (oldPid) {
                        // 邊緣情況：診症被清除了病人 ID（只更新 patientsMeta）
                        aggregatePlan = this._buildPatientAggregatePlan(oldPid, 'update', null);
                    }
                    if (aggregatePlan) {
                        this._appendPatientAggregateToBatch(batch, aggregatePlan);
                    }
                } catch (_planErr) {
                    console.warn('建構病人診症彙總計畫失敗:', _planErr);
                }
                await batch.commit();
                if (aggregatePlan) {
                    this._applyPatientAggregatePlanCaches(aggregatePlan);
                }
                // 個人統計 / 財務日聚合在 SA 端，主批次成功後 best-effort 同步。
                try {
                    await this.syncConsultationPersonalStatsSummaries(
                        existingRecord ? { id: String(consultationId), ...existingRecord } : null,
                        afterRecord
                    );
                } catch (_personalStatsErr) {
                    console.warn('更新診症後同步個人統計摘要失敗:', _personalStatsErr);
                }
                try {
                    await this.syncConsultationDailyFinancialStats(
                        existingRecord ? { id: String(consultationId), ...existingRecord } : null,
                        afterRecord
                    );
                } catch (_finStatsErr) {
                    console.warn('更新診症後同步財務日聚合失敗:', _finStatsErr);
                }
            }
            // 更新診症後清除全域診症快取並移除本地存檔
            this.consultationsCache = null;
            try {
                localStorage.removeItem('consultations');
            } catch (_lsErr) {
                // 忽略 localStorage 錯誤
            }
            // 更新單一病人診症快取或清除全部快取
            try {
                const affectedPatientIds = Array.from(new Set(
                    [existingRecord && existingRecord.patientId, consultationData && consultationData.patientId]
                        .filter((id) => String(id || '').trim() !== '')
                        .map((id) => String(id))
                ));
                if (affectedPatientIds.length > 0) {
                    affectedPatientIds.forEach((pid) => {
                        delete patientConsultationsCache[pid];
                        try { localStorage.removeItem('patientConsultations:' + pid); } catch (_e) {}
                        try {
                            if (consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                                delete consultationHistoryPager.patientPagedCache[pid];
                            }
                        } catch (_e2) {}
                    });
                } else {
                    // 如果無法確定病人 ID，則清除所有病人診症快取
                    patientConsultationsCache = {};
                    try {
                        if (consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                            consultationHistoryPager.patientPagedCache = {};
                        }
                    } catch (_e3) {}
                }
            } catch (_err) {
                patientConsultationsCache = {};
                try {
                    if (consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                        consultationHistoryPager.patientPagedCache = {};
                    }
                } catch (_e4) {}
            }
            return { success: true };
        } catch (error) {
            console.error('更新診症記錄失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteConsultation(consultationId) {
        if (!this.isReady) return { success: false };
        try {
            const idStr = String(consultationId || '');
            if (!idStr) return { success: false, error: 'missing_consultation_id' };
            let existingRecord = null;
            try {
                const existingDoc = await window.firebase.getDoc(window.firebase.doc(window.firebase.db, 'consultations', idStr));
                if (existingDoc && existingDoc.exists()) {
                    existingRecord = { id: existingDoc.id, ...existingDoc.data() };
                }
            } catch (_getErr) {}
            // 刪除主文件 + 財務摘要標記刪除 + 病人聚合 + patientsMeta 單一批次原子提交。
            const deletedAt = new Date();
            const batch = window.firebase.writeBatch(window.firebase.db);
            batch.delete(window.firebase.doc(window.firebase.db, 'consultations', idStr));
            const summaryPayload = buildConsultationFinancialSummaryPayload(
                idStr,
                { ...(existingRecord || {}), status: 'deleted', updatedAt: deletedAt },
                { forceDeleted: true, now: deletedAt }
            );
            batch.set(
                window.firebase.doc(window.firebase.db, 'consultationFinancialSummaries', idStr),
                summaryPayload,
                { merge: true }
            );
            let aggregatePlan = null;
            try {
                const pid = existingRecord && existingRecord.patientId ? String(existingRecord.patientId) : '';
                if (pid) {
                    aggregatePlan = this._buildPatientAggregatePlan(pid, 'delete');
                    this._appendPatientAggregateToBatch(batch, aggregatePlan);
                }
            } catch (_planErr) {
                console.warn('建構病人診症彙總計畫失敗:', _planErr);
            }
            await batch.commit();
            if (aggregatePlan) {
                this._applyPatientAggregatePlanCaches(aggregatePlan);
            }
            // 個人統計 / 財務日聚合在 SA 端，主批次成功後 best-effort 同步。
            try {
                await this.syncConsultationPersonalStatsSummaries(
                    existingRecord ? { ...existingRecord } : null,
                    null
                );
            } catch (_personalStatsErr) {
                console.warn('刪除診症後同步個人統計摘要失敗:', _personalStatsErr);
            }
            try {
                await this.syncConsultationDailyFinancialStats(
                    existingRecord ? { ...existingRecord } : null,
                    null
                );
            } catch (_finStatsErr) {
                console.warn('刪除診症後同步財務日聚合失敗:', _finStatsErr);
            }
            this.consultationsCache = null;
            try {
                localStorage.removeItem('consultations');
            } catch (_lsErr) {}
            try {
                const pid = String(existingRecord && existingRecord.patientId || '');
                if (pid) {
                    delete patientConsultationsCache[pid];
                    try { localStorage.removeItem('patientConsultations:' + pid); } catch (_e) {}
                    try {
                        if (consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                            delete consultationHistoryPager.patientPagedCache[pid];
                        }
                    } catch (_e2) {}
                } else {
                    patientConsultationsCache = {};
                    try {
                        if (consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                            consultationHistoryPager.patientPagedCache = {};
                        }
                    } catch (_e3) {}
                }
            } catch (_cacheErr) {
                patientConsultationsCache = {};
                try {
                    if (consultationHistoryPager && consultationHistoryPager.patientPagedCache) {
                        consultationHistoryPager.patientPagedCache = {};
                    }
                } catch (_e4) {}
            }
            return { success: true };
        } catch (error) {
            console.error('刪除診症記錄失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async addConsultationAuditLog(auditData) {
        if (!this.isReady) return { success: false };
        try {
            const consultationId = auditData && auditData.consultationId ? String(auditData.consultationId) : '';
            if (!consultationId) {
                return { success: false, error: 'missing_consultation_id' };
            }
            const safeClone = (obj) => {
                try { return JSON.parse(JSON.stringify(obj || {})); } catch (_e) { return {}; }
            };
            const beforeData = safeClone(auditData.beforeData);
            const afterData = safeClone(auditData.afterData);
            const changedFields = [];
            const keys = new Set([...Object.keys(beforeData || {}), ...Object.keys(afterData || {})]);
            keys.forEach((key) => {
                const beforeVal = beforeData ? beforeData[key] : undefined;
                const afterVal = afterData ? afterData[key] : undefined;
                try {
                    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
                        changedFields.push(key);
                    }
                } catch (_e) {
                    if (String(beforeVal) !== String(afterVal)) {
                        changedFields.push(key);
                    }
                }
            });
            // 無實質變更（例如僅觸發儲存但所有欄位皆相同）就不寫 audit log，
            // 避免無意義的寫入；UI 本來就以 changedFields 驅動差異顯示。
            if (changedFields.length === 0) {
                return { success: true, skipped: true, id: '' };
            }
            // 只保留「有變更」的頂層欄位。舊版把完整 before/after 病歷快照
            // （含處方等大型欄位）各存一份，文件體積龐大且大部分內容重複。
            const beforeSlim = {};
            const afterSlim = {};
            changedFields.forEach((key) => {
                if (beforeData && Object.prototype.hasOwnProperty.call(beforeData, key)) {
                    beforeSlim[key] = beforeData[key];
                }
                if (afterData && Object.prototype.hasOwnProperty.call(afterData, key)) {
                    afterSlim[key] = afterData[key];
                }
            });
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'consultationAuditLogs'),
                {
                    consultationId,
                    appointmentId: auditData && auditData.appointmentId ? String(auditData.appointmentId) : '',
                    patientId: auditData && auditData.patientId ? String(auditData.patientId) : '',
                    patientName: auditData && auditData.patientName ? String(auditData.patientName) : '',
                    editedBy: auditData && auditData.editedBy ? String(auditData.editedBy) : (currentUser || 'system'),
                    editReason: auditData && auditData.editReason ? String(auditData.editReason) : '',
                    changedFields,
                    changeCount: changedFields.length,
                    beforeData: beforeSlim,
                    afterData: afterSlim,
                    editedAt: new Date()
                }
            );
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('新增病歷審核追蹤失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async getConsultationAuditLogs(consultationId, limitCount = 100) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const idStr = String(consultationId || '');
            if (!idStr) return { success: true, data: [] };
            const colRef = window.firebase.collection(window.firebase.db, 'consultationAuditLogs');
            const q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.where('consultationId', '==', idStr),
                window.firebase.limit(Math.max(1, Number(limitCount) || 100))
            );
            const snapshot = await window.firebase.getDocs(q);
            const logs = [];
            snapshot.forEach((docSnap) => {
                logs.push({ id: docSnap.id, ...docSnap.data() });
            });
            logs.sort((a, b) => {
                const ta = a && a.editedAt && a.editedAt.seconds ? (a.editedAt.seconds * 1000) : new Date(a && a.editedAt ? a.editedAt : 0).getTime();
                const tb = b && b.editedAt && b.editedAt.seconds ? (b.editedAt.seconds * 1000) : new Date(b && b.editedAt ? b.editedAt : 0).getTime();
                return tb - ta;
            });
            return { success: true, data: logs };
        } catch (error) {
            console.error('讀取病歷審核追蹤失敗:', error);
            return { success: false, data: [], error: error.message };
        }
    }

    async getPatientConsultations(patientId, forceRefresh = false) {
        if (!this.isReady) return { success: false, data: [] };

        try {
            // 若要求強制刷新，先清除該病人的快取，確保從 Firestore 重新讀取最新資料
            if (forceRefresh) {
                if (patientConsultationsCache) {
                    delete patientConsultationsCache[patientId];
                }
                try {
                    localStorage.removeItem('patientConsultations:' + String(patientId));
                } catch (_lsCleanErr) {}
            }
            // 若快取存在（且未被強制清除），直接回傳快取資料
            if (!forceRefresh && patientConsultationsCache && Array.isArray(patientConsultationsCache[patientId])) {
                return { success: true, data: patientConsultationsCache[patientId] };
            }
            if (!forceRefresh) {
                try {
                    const stored = localStorage.getItem('patientConsultations:' + String(patientId));
                    if (stored) {
                        const arr = JSON.parse(stored);
                        if (Array.isArray(arr)) {
                            patientConsultationsCache[patientId] = arr;
                            return { success: true, data: arr };
                        }
                    }
                } catch (_lsErr) {}
            }
            /**
             * 改為直接使用 Firestore 查詢特定 patientId 的診療記錄，避免先讀取全部後再過濾。
             * 這樣可降低讀取量，僅在開啟病歷時讀取該病患相關的診療記錄。
             */
            // 使用 where 條件建立查詢
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const q = window.firebase.firestoreQuery(colRef, window.firebase.where('patientId', '==', patientId));
            const querySnapshot = await window.firebase.getDocs(q);
            const patientConsultations = [];
            querySnapshot.forEach((docSnap) => {
                patientConsultations.push({ id: docSnap.id, ...docSnap.data() });
            });
            // 以 date/createdAt/updatedAt 做容錯排序，避免缺少 date 的病歷錯位。
            patientConsultations.sort((a, b) => {
                return getConsultationEffectiveTimestamp(b) - getConsultationEffectiveTimestamp(a);
            });
            // 儲存至快取以供後續使用
            patientConsultationsCache[patientId] = patientConsultations;
            try {
                localStorage.setItem('patientConsultations:' + String(patientId), JSON.stringify(patientConsultations));
            } catch (_lsErr) {}
            return { success: true, data: patientConsultations };
        } catch (error) {
            console.error('讀取病人診症記錄失敗:', error);
            return { success: false, data: [] };
        }
    }
    // 用戶數據管理
    async addUser(userData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }

        try {
            // 移除 id 屬性，避免儲存到文件內容
            let dataToWrite;
            try {
                const { id, ...rest } = userData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = userData;
            }
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'users'),
                {
                    ...dataToWrite,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: currentUser || 'system'
                }
            );

            // 授權索引 userAuthIndex 與 custom claims 統一由後端
            // /api/admin/claims/sync 以 Service Account 寫入（客戶端已被 Rules 拒絕）

            console.log('用戶數據已添加到雲端資料庫:', docRef.id);
            // 新增用戶後清除快取並移除本地存檔
            this.usersCache = null;
            try {
                localStorage.removeItem('users');
            } catch (_lsErr) {
                // 忽略 localStorage 錯誤
            }
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加用戶數據失敗:', error);
            showToast('保存用戶數據失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * 取得用戶列表。
     * 預設僅讀取第一批資料，並將游標與快取存入實例屬性，供後續分頁使用。
     * 若傳入 forceRefresh=true 則重置游標並重新讀取第一批資料。
     *
     * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取第一頁資料
     * @returns {Promise<{ success: boolean, data: Array, hasMore: boolean }>}
     */
    async getUsers(forceRefresh = false) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 如果尚未登入（無 auth.currentUser），不要嘗試從 Firestore 讀取，以避免觸發權限錯誤。
            const authCurrent = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
            if (!authCurrent) {
                // 未登入時，優先返回快取或本地資料；不嘗試遠端讀取
                if (!forceRefresh && this.usersCache !== null) {
                    return { success: true, data: this.usersCache, hasMore: !!this.usersHasMore };
                }
                if (!forceRefresh) {
                    try {
                        const stored = localStorage.getItem('users');
                        if (stored) {
                            const localData = JSON.parse(stored);
                            if (Array.isArray(localData)) {
                                this.usersCache = localData;
                                this.usersLastVisible = null;
                                this.usersHasMore = false;
                                return { success: true, data: this.usersCache, hasMore: false };
                            }
                        }
                    } catch (lsErr) {
                        console.warn('載入本地用戶資料失敗:', lsErr);
                    }
                }
                // 未登入且無可用資料，返回空陣列
                return { success: true, data: [], hasMore: false };
            }
            // 已登入：若有快取且不需強制刷新，直接回傳現有快取
            if (!forceRefresh && this.usersCache !== null) {
                return { success: true, data: this.usersCache, hasMore: !!this.usersHasMore };
            }
            // 嘗試從 localStorage 載入用戶資料
            if (!forceRefresh) {
                try {
                    const stored = localStorage.getItem('users');
                    if (stored) {
                        const localData = JSON.parse(stored);
                        if (Array.isArray(localData)) {
                            this.usersCache = localData;
                            this.usersLastVisible = null;
                            this.usersHasMore = false;
                            return { success: true, data: this.usersCache, hasMore: false };
                        }
                    }
                } catch (lsErr) {
                    console.warn('載入本地用戶資料失敗:', lsErr);
                }
            }
            // 重置快取與游標
            this.usersCache = [];
            this.usersLastVisible = null;
            this.usersHasMore = false;
            const pageSize = 100;
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'users'),
                window.firebase.limit(pageSize),
            );
            const snapshot = await window.firebase.getDocs(q);
            const users = [];
            snapshot.forEach((docSnap) => {
                users.push({ id: docSnap.id, ...docSnap.data() });
            });
            this.usersLastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
            this.usersHasMore = snapshot.docs.length === pageSize;
            this.usersCache = users;
            // 存入 localStorage 以便下次載入
            try {
                localStorage.setItem('users', JSON.stringify(users));
            } catch (lsErr) {
                console.warn('保存用戶資料到本地失敗:', lsErr);
            }
            console.log('已從雲端資料庫讀取用戶數據，載入', users.length, '筆');
            return { success: true, data: users, hasMore: this.usersHasMore };
        } catch (error) {
            console.error('讀取用戶數據失敗:', error);
            // 發生錯誤時不要覆寫現有快取，仍返回當前快取資料以避免覆蓋
            const fallbackData = Array.isArray(this.usersCache) ? this.usersCache : [];
            return { success: true, data: fallbackData, hasMore: !!this.usersHasMore };
        }
    }

    /**
     * 取得用戶列表的下一頁資料。
     * 需要先呼叫 getUsers() 取得第一頁後，才能使用本方法。
     * 本方法會更新快取及游標並將新資料附加至快取。
     * 若沒有更多資料可讀取，將回傳空陣列並維持 hasMore 為 false。
     *
     * @returns {Promise<{ success: boolean, data: Array, hasMore: boolean }>}
     */
    async getUsersNextPage() {
        if (!this.isReady) return { success: false, data: [] };
        try {
            if (!this.usersHasMore || !this.usersLastVisible) {
                return { success: true, data: [], hasMore: false };
            }
            const pageSize = 100;
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'users'),
                window.firebase.startAfter(this.usersLastVisible),
                window.firebase.limit(pageSize),
            );
            const snapshot = await window.firebase.getDocs(q);
            const newData = [];
            snapshot.forEach((docSnap) => {
                newData.push({ id: docSnap.id, ...docSnap.data() });
            });
            this.usersLastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : this.usersLastVisible;
            this.usersHasMore = snapshot.docs.length === pageSize;
            this.usersCache = Array.isArray(this.usersCache) ? this.usersCache.concat(newData) : newData;
            return { success: true, data: this.usersCache, hasMore: this.usersHasMore };
        } catch (error) {
            console.error('讀取用戶資料下一頁失敗:', error);
            return { success: false, data: [] };
        }
    }

    async updateUser(userId, userData) {
        try {
            // 移除 id 屬性，避免將 id 寫入文件內容
            let dataToWrite;
            try {
                const { id, ...rest } = userData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = userData;
            }
            let existingUser = null;
            try {
                const userRef = window.firebase.doc(window.firebase.db, 'users', userId);
                const userSnap = await window.firebase.getDoc(userRef);
                if (userSnap && userSnap.exists()) {
                    existingUser = { id: userSnap.id, ...userSnap.data() };
                }
            } catch (readErr) {
                console.warn('更新用戶前讀取舊資料失敗:', readErr);
            }
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'users', userId),
                {
                    ...dataToWrite,
                    updatedAt: new Date(),
                    updatedBy: currentUser || 'system'
                }
            );
            // 授權索引與 custom claims 由後端 /api/admin/claims/sync 維護，
            // 此處不再做客戶端索引寫入（Rules 已拒絕）
            // 更新用戶後清除用戶緩存並移除本地存檔
            this.usersCache = null;
            try {
                localStorage.removeItem('users');
            } catch (_lsErr) {
                // 忽略 localStorage 錯誤
            }
            return { success: true };
        } catch (error) {
            console.error('更新用戶數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteUser(userId) {
        try {
            let existingUser = null;
            try {
                const userRef = window.firebase.doc(window.firebase.db, 'users', userId);
                const userSnap = await window.firebase.getDoc(userRef);
                if (userSnap && userSnap.exists()) {
                    existingUser = { id: userSnap.id, ...userSnap.data() };
                }
            } catch (readErr) {
                console.warn('刪除用戶前讀取舊資料失敗:', readErr);
            }
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'users', userId)
            );
            // userAuthIndex 與 Auth 帳號由後端 /api/admin/claims/delete 一併清除
            // 刪除用戶後清除緩存並移除本地存檔
            this.usersCache = null;
            try {
                localStorage.removeItem('users');
            } catch (_lsErr) {
                // 忽略 localStorage 錯誤
            }
            return { success: true };
        } catch (error) {
            console.error('刪除用戶數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    // 封存（離職）／復職用戶：軟刪除，users 文件保留、Auth 帳號由後端停用/啟用
    async archiveUser(userId, archived, reason = '') {
        try {
            const now = new Date();
            const data = archived
                ? {
                    active: false,
                    status: 'archived',
                    archived: true,
                    archivedAt: now,
                    archivedBy: currentUser || 'system',
                    archiveReason: reason || ''
                }
                : {
                    active: true,
                    status: 'active',
                    archived: false,
                    restoredAt: now,
                    restoredBy: currentUser || 'system'
                };
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'users', userId),
                { ...data, updatedAt: now, updatedBy: currentUser || 'system' }
            );
            // 封存/復職後清除用戶緩存並移除本地存檔
            this.usersCache = null;
            try {
                localStorage.removeItem('users');
            } catch (_lsErr) {
                // 忽略 localStorage 錯誤
            }
            return { success: true };
        } catch (error) {
            console.error(archived ? '封存用戶數據失敗:' : '復職用戶數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    // 掛號資料管理（使用 Realtime Database）
    async addAppointment(appointmentData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }
        try {
            const id = appointmentData.id;
            // 將掛號資料存入 Realtime Database，以掛號 ID 作為鍵
            await window.firebase.set(
                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id),
                { ...appointmentData }
            );
            console.log('掛號資料已添加到即時同步服務:', id);
            return { success: true, id: id };
        } catch (error) {
            console.error('添加掛號數據失敗:', error);
            showToast('保存掛號數據失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    async getAppointments() {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const snapshot = await window.firebase.get(
                window.firebase.ref(window.firebase.rtdb, 'appointments')
            );
            const data = snapshot.val() || {};
            const appointments = Object.keys(data).map(key => {
                return { id: key, ...data[key] };
            });
            console.log('已從即時同步服務讀取掛號數據:', appointments.length, '筆');
            return { success: true, data: appointments };
        } catch (error) {
            console.error('讀取掛號數據失敗:', error);
            return { success: false, data: [] };
        }
    }

    /**
     * 讀取單一掛號資料。
     * 透過指定掛號 ID 的路徑讀取，避免一次載入整個 appointments 清單，
     * 以減少無用的資料傳輸。當資料存在時回傳 { id, ...data }；
     * 若節點不存在則回傳 null。
     *
     * @param {string|number} id - 掛號 ID
     * @returns {Promise<{ success: boolean, data: Object|null }>}
     */
    async getAppointment(id) {
        if (!this.isReady) return { success: false, data: null };
        try {
            const snapshot = await window.firebase.get(
                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id)
            );
            const data = snapshot.val();
            if (data !== null && data !== undefined) {
                return { success: true, data: { id: String(id), ...data } };
            } else {
                return { success: false, data: null };
            }
        } catch (error) {
            console.error('讀取單一掛號失敗:', error);
            return { success: false, data: null };
        }
    }

    async updateAppointment(id, appointmentData) {
        try {
            await window.firebase.update(
                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id),
                { ...appointmentData }
            );
            return { success: true };
        } catch (error) {
            console.error('更新掛號數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteAppointment(id) {
        try {
            await window.firebase.remove(
                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id)
            );
            return { success: true };
        } catch (error) {
            console.error('刪除掛號數據失敗:', error);
            return { success: false, error: error.message };
        }
    }
// 患者套票數據管理
    async addPatientPackage(packageData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }

        try {
            // 移除 id 屬性，避免儲存到文件內容
            let dataToWrite;
            try {
                const { id, ...rest } = packageData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = packageData;
            }
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'patientPackages'),
                {
                    ...dataToWrite,
                    createdAt: new Date(),
                    createdBy: currentUser || 'system'
                }
            );
            
            console.log('患者套票已添加到雲端資料庫:', docRef.id);
            // 在成功添加套票後，更新病人文件中的套票彙總欄位。
            try {
                // 套票資料中應包含 patientId
                if (packageData && packageData.patientId) {
                    await this._schedulePatientPackageAggregate(packageData.patientId);
                }
            } catch (aggErr) {
                console.error('新增套票後更新套票彙總欄位失敗:', aggErr);
            }
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加患者套票失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async getPatientPackages(patientId) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 使用條件查詢僅取得該病人的套票，避免一次讀取整個 patientPackages 集合
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'patientPackages'),
                window.firebase.where('patientId', '==', patientId)
            );
            const querySnapshot = await window.firebase.getDocs(q);
            const packages = [];
            querySnapshot.forEach((doc) => {
                packages.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, data: packages };
        } catch (error) {
            console.error('讀取患者套票失敗:', error);
            return { success: false, data: [] };
        }
    }

    async updatePatientPackage(packageId, packageData) {
        try {
            // 移除 id 屬性，避免將 id 寫入文件內容
            let dataToWrite;
            try {
                const { id, ...rest } = packageData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = packageData;
            }
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'patientPackages', packageId),
                {
                    ...dataToWrite,
                    updatedAt: new Date(),
                    updatedBy: currentUser || 'system'
                }
            );
            // 更新本地快取中的套票資料
            try {
                // 如果 packageData 中包含 patientId，且 global 的 patientPackagesCache 有該病人的資料
                if (packageData && packageData.patientId && patientPackagesCache && Array.isArray(patientPackagesCache[packageData.patientId])) {
                    const pidStr = String(packageData.patientId);
                    patientPackagesCache[pidStr] = patientPackagesCache[pidStr].map(p => {
                        if (String(p.id) === String(packageId)) {
                            // 將更新後的資料合併到本地快取中
                            return { ...p, ...packageData };
                        }
                        return p;
                    });
                    // 同步本地快取到 localStorage
                    try {
                        const localKey = `patientPackages_${pidStr}`;
                        localStorage.setItem(localKey, JSON.stringify(patientPackagesCache[pidStr]));
                    } catch (e) {
                        console.warn('更新本地患者套票資料失敗:', e);
                    }
                }
            } catch (cacheErr) {
                console.warn('更新套票後更新本地快取失敗:', cacheErr);
            }
            // 套票更新後，同步更新對應病人的套票彙總欄位。
            try {
                if (packageData && packageData.patientId) {
                    await this._schedulePatientPackageAggregate(packageData.patientId);
                }
            } catch (aggErr) {
                console.error('更新套票後更新套票彙總欄位失敗:', aggErr);
            }
            return { success: true };
        } catch (error) {
            console.error('更新患者套票失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async deletePatientPackage(packageId, patientId = '') {
        try {
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'patientPackages', packageId)
            );
            try {
                const pidStr = String(patientId || '');
                if (pidStr && patientPackagesCache && Array.isArray(patientPackagesCache[pidStr])) {
                    patientPackagesCache[pidStr] = patientPackagesCache[pidStr].filter(p => String(p.id) !== String(packageId));
                    try {
                        const localKey = `patientPackages_${pidStr}`;
                        localStorage.setItem(localKey, JSON.stringify(patientPackagesCache[pidStr]));
                    } catch (e) {
                        console.warn('更新本地患者套票資料失敗:', e);
                    }
                }
            } catch (cacheErr) {
                console.warn('刪除套票後更新本地快取失敗:', cacheErr);
            }
            try {
                if (patientId) {
                    await this._schedulePatientPackageAggregate(patientId);
                }
            } catch (aggErr) {
                console.error('刪除套票後更新套票彙總欄位失敗:', aggErr);
            }
            return { success: true };
        } catch (error) {
            console.error('刪除患者套票失敗:', error);
            return { success: false, error: error.message };
        }
    }

    resetPatientPackageHistoryPagination(patientId = '', clinicId = '') {
        const pid = String(patientId || '');
        const cid = String(clinicId || '');
        if (pid) {
            if (cid) {
                // 只清除指定診所的分頁／數量快取
                const scopedKey = `${pid}__${cid}`;
                delete this.patientPackageHistoryPagination[scopedKey];
                delete this.patientPackageHistoryCountCache[scopedKey];
                return;
            }
            // 未指定診所：清除該病人所有診所維度的快取（含舊制無後綴鍵）
            const prefix = `${pid}__`;
            Object.keys(this.patientPackageHistoryPagination).forEach((k) => {
                if (k === pid || k.indexOf(prefix) === 0) delete this.patientPackageHistoryPagination[k];
            });
            Object.keys(this.patientPackageHistoryCountCache).forEach((k) => {
                if (k === pid || k.indexOf(prefix) === 0) delete this.patientPackageHistoryCountCache[k];
            });
            return;
        }
        this.patientPackageHistoryPagination = {};
        this.patientPackageHistoryCountCache = {};
    }

    async addPatientPackageHistory(historyData) {
        if (!this.isReady) return { success: false };
        try {
            let dataToWrite;
            try {
                const { id, ...rest } = historyData || {};
                dataToWrite = rest;
            } catch (_omitErr) {
                dataToWrite = historyData;
            }
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'patientPackageHistory'),
                {
                    ...dataToWrite,
                    createdAt: new Date(),
                    createdBy: currentUser || 'system'
                }
            );
            if (historyData && historyData.patientId) {
                this.resetPatientPackageHistoryPagination(historyData.patientId);
            }
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('新增套票記錄失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async getPatientPackageHistoryCount(patientId, forceRefresh = false, clinicId = '') {
        if (!this.isReady) return { success: false, count: 0 };
        const pid = String(patientId || '');
        if (!pid) return { success: true, count: 0 };
        const cid = String(clinicId || '');
        // 快取鍵帶診所維度，避免跨診所共用數量
        const cacheKey = cid ? `${pid}__${cid}` : pid;
        if (!forceRefresh && Object.prototype.hasOwnProperty.call(this.patientPackageHistoryCountCache, cacheKey)) {
            return { success: true, count: this.patientPackageHistoryCountCache[cacheKey] };
        }
        try {
            const constraints = [window.firebase.where('patientId', '==', pid)];
            if (cid) constraints.push(window.firebase.where('clinicId', '==', cid));
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'patientPackageHistory'),
                ...constraints
            );
            const snap = await window.firebase.getCountFromServer(q);
            const count = snap && typeof snap.data === 'function' ? (Number(snap.data().count) || 0) : 0;
            this.patientPackageHistoryCountCache[cacheKey] = count;
            return { success: true, count };
        } catch (error) {
            console.error('讀取套票記錄數量失敗:', error);
            return { success: false, count: 0, error: error.message };
        }
    }

    async getPatientPackageHistoryPage(patientId, pageNumber = 1, pageSize = 30, forceRefresh = false, clinicId = '') {
        if (!this.isReady) return { success: false, data: [] };
        const pid = String(patientId || '');
        const targetPage = Math.max(1, Number(pageNumber) || 1);
        const size = Math.max(1, Number(pageSize) || 30);
        if (!pid) return { success: true, data: [], hasMore: false };
        const cid = String(clinicId || '');
        // 分頁狀態依「病人＋診所」分開保存
        const stateKey = cid ? `${pid}__${cid}` : pid;
        if (forceRefresh || !this.patientPackageHistoryPagination[stateKey] || this.patientPackageHistoryPagination[stateKey].pageSize !== size) {
            this.patientPackageHistoryPagination[stateKey] = {
                pageSize: size,
                pages: {},
                lastVisibleByPage: {},
                hasMoreByPage: {}
            };
        }
        const state = this.patientPackageHistoryPagination[stateKey];
        if (state.pages[targetPage]) {
            return {
                success: true,
                data: state.pages[targetPage],
                hasMore: !!state.hasMoreByPage[targetPage]
            };
        }
        try {
            let q = null;
            const baseConstraints = [window.firebase.where('patientId', '==', pid)];
            if (cid) baseConstraints.push(window.firebase.where('clinicId', '==', cid));
            if (targetPage === 1) {
                q = window.firebase.firestoreQuery(
                    window.firebase.collection(window.firebase.db, 'patientPackageHistory'),
                    ...baseConstraints,
                    window.firebase.orderBy('operatedAt', 'desc'),
                    window.firebase.limit(size)
                );
            } else {
                const prevCursor = state.lastVisibleByPage[targetPage - 1];
                if (!prevCursor) {
                    return { success: false, data: [], error: '套票記錄頁碼游標尚未建立' };
                }
                q = window.firebase.firestoreQuery(
                    window.firebase.collection(window.firebase.db, 'patientPackageHistory'),
                    ...baseConstraints,
                    window.firebase.orderBy('operatedAt', 'desc'),
                    window.firebase.startAfter(prevCursor),
                    window.firebase.limit(size)
                );
            }
            const snapshot = await window.firebase.getDocs(q);
            const rows = [];
            snapshot.forEach((docSnap) => {
                rows.push({ id: docSnap.id, ...docSnap.data() });
            });
            state.pages[targetPage] = rows;
            state.lastVisibleByPage[targetPage] = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
            state.hasMoreByPage[targetPage] = snapshot.docs.length === size;
            return {
                success: true,
                data: rows,
                hasMore: !!state.hasMoreByPage[targetPage]
            };
        } catch (error) {
            console.error('讀取套票記錄分頁失敗:', error);
            return { success: false, data: [], error: error.message };
        }
    }

    /**
     * 開啟套票聚合「合併作用域」：作用域期間 addPatientPackage / updatePatientPackage /
     * deletePatientPackage 不再每次重算並寫入 patients 文件（含 patientsMeta），
     * 只記錄受影響的病人 ID；待 flushPackageAggregateBatching() 時每個病人只重算一次。
     *
     * 用途：儲存病歷時可能連續「購買套票＋即時使用＋抵扣多張套票」，
     * 舊路徑每一步都會對同一個病人文件與 patientsMeta 各寫一次（2-4 次）。
     */
    beginPackageAggregateBatching() {
        this._pkgAggBatch = new Set();
    }

    /** 沖排合併作用域：對作用域期間受影響的每個病人執行一次聚合重算。 */
    async flushPackageAggregateBatching() {
        const pending = this._pkgAggBatch;
        this._pkgAggBatch = null;
        if (!pending || pending.size === 0) return;
        // 序列執行，避免同一病人文件並發覆蓋
        for (const pid of Array.from(pending)) {
            try {
                await this.updatePatientPackageAggregates(pid);
            } catch (err) {
                console.warn('沖排套票彙總失敗（非致錯路徑）:', pid, err && err.message);
            }
        }
    }

    /** 供 add/update/deletePatientPackage 呼叫：作用域中改為登記，否則立即重算。 */
    _schedulePatientPackageAggregate(patientId) {
        const pid = String(patientId || '');
        if (!pid) return Promise.resolve();
        if (this._pkgAggBatch) {
            this._pkgAggBatch.add(pid);
            return Promise.resolve();
        }
        return this.updatePatientPackageAggregates(pid);
    }

    /**
     * 更新指定病人文件的套票彙總欄位。
     * 彙總欄位包括：
     * - packageActiveCount：當前仍有剩餘次數的套票數量
     * - packageRemainingUses：當前所有有效套票剩餘次數之和
     * 此函式在添加或更新套票後呼叫，用於去正規化包套票資料，
     * 避免在顯示病人列表時反覆查詢 patientPackages。
     * 若查詢 getCountFromServer 失敗，將回退至讀取文件數量並統計。
     *
     * @param {string} patientId 病人 ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updatePatientPackageAggregates(patientId) {
        // 如果資料管理器尚未準備好，則略過更新
        if (!this.isReady) {
            return { success: false, error: 'Data manager not ready' };
        }
        try {
            // 構建查詢：篩選此病人的套票且剩餘次數大於 0
            const packagesCollection = window.firebase.collection(window.firebase.db, 'patientPackages');
            const activeQuery = window.firebase.firestoreQuery(
                packagesCollection,
                window.firebase.where('patientId', '==', patientId),
                window.firebase.where('remainingUses', '>', 0)
            );
            // 使用單次 getDocs 取得所有有效套票，計算數量及剩餘次數
            let activeCount = 0;
            let totalRemainingUses = 0;
            try {
                const snap = await window.firebase.getDocs(activeQuery);
                activeCount = snap.size;
                snap.forEach((docSnap) => {
                    const d = docSnap.data();
                    if (d && typeof d.remainingUses === 'number') {
                        totalRemainingUses += d.remainingUses;
                    }
                });
            } catch (err) {
                console.warn('取得有效套票資料失敗:', err);
                activeCount = 0;
                totalRemainingUses = 0;
            }
            // 更新病人文件中的彙總欄位
            try {
                const patientRef = window.firebase.doc(window.firebase.db, 'patients', patientId);
                await window.firebase.updateDoc(patientRef, {
                    packageActiveCount: activeCount,
                    packageRemainingUses: totalRemainingUses,
                    updatedAt: new Date(),
                    updatedBy: currentUser || 'system'
                });
                // 通知其他裝置病人列表有變更
                touchPatientsMeta('update', patientId).catch(() => {});
            } catch (updateErr) {
                console.error('更新病人套票彙總欄位失敗:', updateErr);
                return { success: false, error: updateErr.message };
            }
            try {
                const pidStr = String(patientId);
                const applyAggregatePatch = (list) => {
                    if (!Array.isArray(list)) return list;
                    return list.map((patient) => {
                        if (!patient || String(patient.id) !== pidStr) {
                            return patient;
                        }
                        return {
                            ...patient,
                            packageActiveCount: activeCount,
                            packageRemainingUses: totalRemainingUses
                        };
                    });
                };

                if (Array.isArray(patientCache) && patientCache.length > 0) {
                    patientCache = applyAggregatePatch(patientCache);
                }

                if (Array.isArray(this.patientsCache) && this.patientsCache.length > 0) {
                    this.patientsCache = applyAggregatePatch(this.patientsCache);
                }

                try {
                    const storedPatients = localStorage.getItem('patients');
                    if (storedPatients) {
                        const parsedPatients = JSON.parse(storedPatients);
                        if (Array.isArray(parsedPatients)) {
                            localStorage.setItem('patients', JSON.stringify(applyAggregatePatch(parsedPatients)));
                        }
                    }
                } catch (storageErr) {
                    console.warn('同步病人套票彙總到本地儲存失敗:', storageErr);
                }
            } catch (cacheSyncErr) {
                console.warn('同步病人套票彙總快取失敗:', cacheSyncErr);
            }
            return { success: true };
        } catch (err) {
            console.error('更新患者套票彙總欄位錯誤:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * 新增一筆問診資料。
     * 此方法主要用於後端或其他管理介面，如在問診表單頁面可直接使用 Firebase API。
     *
     * @param {string} patientName 病人姓名
     * @param {Object} data 問診資料內容
     * @returns {Promise<{success: boolean, id?: string, error?: string}>}
     */
    async addInquiryRecord(patientName, data) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }
        try {
            const now = new Date();
            const expireDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 小時後過期
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'inquiries'),
                {
                    patientName: patientName,
                    data: data,
                    createdAt: now,
                    expireAt: expireDate
                }
            );
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加問診資料失敗:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 讀取指定病人姓名的問診資料。
     * 僅返回尚未過期的資料，並依照創建時間降序排列。
     *
     * @param {string} patientName 病人姓名
     * @returns {Promise<{success: boolean, data: Array}>}
     */
    async getInquiryRecords(patientName) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            let baseRef = window.firebase.collection(window.firebase.db, 'inquiries');
            // 若有提供 patientName，則使用 where 條件
            let q;
            if (patientName) {
                q = window.firebase.firestoreQuery(
                    baseRef,
                    window.firebase.where('patientName', '==', patientName),
                    window.firebase.orderBy('createdAt', 'desc')
                );
            } else {
                q = window.firebase.firestoreQuery(baseRef, window.firebase.orderBy('createdAt', 'desc'));
            }
            const snapshot = await window.firebase.getDocs(q);
            const now = new Date();
            const records = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                let expireDate = null;
                if (data.expireAt) {
                    if (data.expireAt.seconds !== undefined) {
                        expireDate = new Date(data.expireAt.seconds * 1000);
                    } else {
                        expireDate = new Date(data.expireAt);
                    }
                }
                // 若無 expireAt 或未過期則加入
                if (!expireDate || expireDate >= now) {
                    records.push({ id: doc.id, ...data });
                }
            });
            return { success: true, data: records };
        } catch (error) {
            console.error('讀取問診資料失敗:', error);
            return { success: false, data: [] };
        }
    }

    /**
     * 刪除指定問診資料。
     *
     * @param {string} inquiryId 問診紀錄 ID
     */
    async deleteInquiryRecord(inquiryId) {
        try {
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'inquiries', inquiryId)
            );
            return { success: true };
        } catch (error) {
            console.error('刪除問診資料失敗:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 清除過期的問診資料。
     *
     * Security Rules 規定 `inquiries` 客戶端一律不可寫入/刪除
     * （allow create, update, delete: if false），舊式直接 deleteDoc
     * 會回報 Missing or insufficient permissions。改為呼叫
     * POST /api/inquiry/cleanup，由 Pages Function 驗證職員身份後
     * 以 Service Account 刪除 createdAt／expireAt 早於香港時間今日
     * 00:00 的文件（只保留今天及未來的資料）。
     *
     * @returns {Promise<{success: boolean, deletedCount?: number, error?: string}>}
     */
    async clearOldInquiries() {
        if (!this.isReady) return { success: false };
        try {
            const fbUser = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
            if (!fbUser) return { success: false };

            const token = await fbUser.getIdToken();
            const response = await fetch('/api/inquiry/cleanup', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            let data = null;
            try {
                data = await response.json();
            } catch (_e) {
                data = null;
            }
            if (!response.ok) {
                throw new Error((data && data.message) || ('HTTP ' + response.status));
            }
            return { success: true, deletedCount: (data && data.deletedCount) || 0 };
        } catch (error) {
            console.error('清除過期問診資料失敗:', error);
            return { success: false, error: error.message };
        }
    }
}

// 初始化數據管理器
let firebaseDataManager;
window.addEventListener('load', async () => {
    // 只初始化 FirebaseDataManager，避免在使用者登入前載入大量資料。
    firebaseDataManager = new FirebaseDataManager();
    window.firebaseDataManager = firebaseDataManager; // 全域使用
    // 等待管理器準備好再繼續，但不讀取資料，僅確保後續呼叫不失敗。
    while (!firebaseDataManager.isReady) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 移除系統載入時清除過期問診資料的邏輯，改為在使用者登入後執行。
    // 這是為了避免在未授權狀態下呼叫刪除資料而導致權限錯誤。

    // 設置定時任務：每日自動清理一次過期的問診資料，但僅在使用者已登入時執行
    try {
        const dayMs = 24 * 60 * 60 * 1000;
        setInterval(() => {
            try {
                // 確認使用者已登入（透過 Firebase auth 或本地 currentUserData）
                const userLoggedIn = (window.firebase && window.firebase.auth && window.firebase.auth.currentUser) ||
                                     (typeof currentUserData !== 'undefined' && currentUserData);
                if (userLoggedIn && firebaseDataManager && typeof firebaseDataManager.clearOldInquiries === 'function') {
                    firebaseDataManager.clearOldInquiries().catch(err => {
                        console.error('定時清理問診資料失敗:', err);
                    });
                }
            } catch (e) {
                console.error('定時調用清理問診資料時發生錯誤:', e);
            }
        }, dayMs);
    } catch (_e) {
        // 若無法設置定時任務則忽略
    }
});
        
// 初始化系統
document.addEventListener('DOMContentLoaded', function() {
    
    // 系統管理相關初始化移至 systemmanagement.js，避免在此處過早調用

    // 保持所有中藥材及方劑欄位可見（包含性味、歸經、主治、用法）
    
    
    // 自動聚焦到電子郵件輸入框
    const usernameInput = document.getElementById('mainLoginUsername');
    if (usernameInput) {
        setTimeout(() => {
            usernameInput.focus();
        }, 100);
    }

    // 以下事件綁定已從先前重複的 DOMContentLoaded 事件合併至此處。
    // 針對收費類別的「套票」選項，切換對應的欄位顯示。
    const categorySelect = document.getElementById('billingItemCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', function() {
            const isPackage = this.value === 'package';
            const pf = document.getElementById('packageFields');
            if (pf) {
                pf.classList.toggle('hidden', !isPackage);
            }
        });
    }

    // 病人管理搜尋欄位：輸入時重新載入病人列表（加入防抖處理）
    const searchInput = document.getElementById('searchPatient');
    if (searchInput) {
        // 建立防抖函式，於輸入後延遲一段時間再載入病人列表
        const debouncedLoadPatientList = debounce(() => {
            try {
                // 搜尋時重置分頁至第一頁
                paginationSettings.patientList.currentPage = 1;
                loadPatientList();
            } catch (_err) {
                console.error('載入病人列表時發生錯誤:', _err);
            }
        }, 300);
        searchInput.addEventListener('input', debouncedLoadPatientList);
    }

    try { initClinics(); } catch (_e) {}

    // 掛號彈窗的病人搜尋欄位：加入防抖處理
    const patientSearchInput = document.getElementById('patientSearchInput');
    if (patientSearchInput) {
        // 移除 HTML 中設定的 oninput 以避免重複觸發
        try {
            patientSearchInput.removeAttribute('oninput');
        } catch (_e) {
            // 若移除失敗則忽略
        }
        const debouncedSearchPatients = debounce(() => {
            try {
                if (typeof searchPatientsForRegistration === 'function') {
                    searchPatientsForRegistration();
                }
            } catch (_err) {
                console.error('搜尋掛號病人時發生錯誤:', _err);
            }
        }, 300);
        patientSearchInput.addEventListener('input', debouncedSearchPatients);
        // 加入鍵盤事件處理，支援方向鍵導航搜尋結果及 Enter 快捷掛號
        patientSearchInput.addEventListener('keydown', handlePatientSearchKeyDown);
    }

    // 掛號時選擇醫師的下拉選單：按下 Enter 時直接確認掛號
    const appointmentDoctorSelect = document.getElementById('appointmentDoctor');
    if (appointmentDoctorSelect) {
        // 避免重複綁定事件，可透過自定義屬性判斷是否已綁定
        if (!appointmentDoctorSelect.dataset.bindEnterListener) {
            appointmentDoctorSelect.addEventListener('keydown', function (ev) {
                if (ev && ev.key === 'Enter') {
                    ev.preventDefault();
                    try {
                        if (typeof confirmRegistration === 'function') {
                            confirmRegistration();
                        }
                    } catch (_err) {
                        console.error('從醫師下拉選單按 Enter 確認掛號失敗:', _err);
                    }
                }
            });
            appointmentDoctorSelect.dataset.bindEnterListener = 'true';
        }
    }

    // 掛號時間輸入欄及其他欄位：按下 Enter 時直接確認掛號
    // 日期時間輸入欄 (datetime-local)
    const appointmentDateTimeInput = document.getElementById('appointmentDateTime');
    if (appointmentDateTimeInput) {
        if (!appointmentDateTimeInput.dataset.bindEnterListener) {
            appointmentDateTimeInput.addEventListener('keydown', function(ev) {
                if (ev && ev.key === 'Enter') {
                    ev.preventDefault();
                    try {
                        if (typeof confirmRegistration === 'function') {
                            confirmRegistration();
                        }
                    } catch (err) {
                        console.error('按 Enter 確認掛號（時間輸入）失敗:', err);
                    }
                }
            });
            appointmentDateTimeInput.dataset.bindEnterListener = 'true';
        }
    }
    // 問診資料下拉選單
    const inquirySelectInput = document.getElementById('inquirySelect');
    if (inquirySelectInput) {
        if (!inquirySelectInput.dataset.bindEnterListener) {
            inquirySelectInput.addEventListener('keydown', function(ev) {
                if (ev && ev.key === 'Enter') {
                    ev.preventDefault();
                    try {
                        if (typeof confirmRegistration === 'function') {
                            confirmRegistration();
                        }
                    } catch (err) {
                        console.error('按 Enter 確認掛號（問診選擇）失敗:', err);
                    }
                }
            });
            inquirySelectInput.dataset.bindEnterListener = 'true';
        }
    }
    // 主訴症狀輸入欄 (textarea)
    const chiefComplaintInput = document.getElementById('quickChiefComplaint');
    if (chiefComplaintInput) {
        if (!chiefComplaintInput.dataset.bindEnterListener) {
            chiefComplaintInput.addEventListener('keydown', function(ev) {
                if (ev && ev.key === 'Enter') {
                    ev.preventDefault();
                    try {
                        if (typeof confirmRegistration === 'function') {
                            confirmRegistration();
                        }
                    } catch (err) {
                        console.error('按 Enter 確認掛號（主訴症狀）失敗:', err);
                    }
                }
            });
            chiefComplaintInput.dataset.bindEnterListener = 'true';
        }
    }

    // 當選擇問診資料時，自動隱藏主訴症狀輸入欄位。
    // 由於主訴欄位與其標籤位於同一父層 <div>，使用 parentElement/closest('div')
    // 將容器切換 display。當問診資料未選擇時則顯示主訴欄位。
    const inquirySelectElem = document.getElementById('inquirySelect');
    const quickChiefComplaintElem = document.getElementById('quickChiefComplaint');
    if (inquirySelectElem && quickChiefComplaintElem) {
        // 嘗試取得最近的 div 作為容器，如果找不到則退而求其次使用 parentElement
        const complaintContainer = quickChiefComplaintElem.closest('div') || quickChiefComplaintElem.parentElement;
        function toggleChiefComplaintVisibility() {
            try {
                // 根據問診下拉選擇值決定顯示或隱藏
                if (inquirySelectElem.value && inquirySelectElem.value !== '') {
                    // 已選擇問診資料，隱藏主訴欄位
                    complaintContainer.style.display = 'none';
                } else {
                    // 無問診資料或清空選擇，顯示主訴欄位
                    complaintContainer.style.display = '';
                }
            } catch (_e) {
                // 若容器不存在或遇到錯誤則忽略，避免影響其他邏輯
            }
        }
        // 綁定下拉變更事件
        inquirySelectElem.addEventListener('change', toggleChiefComplaintVisibility);
        // 將函式掛到全域，供其他函式（例如清空表單時）呼叫
        window.toggleChiefComplaintVisibility = toggleChiefComplaintVisibility;
        // 根據預設值初始化顯示狀態
        toggleChiefComplaintVisibility();
    }

    /*
     * 登入頁與側邊欄事件綁定
     * 為了避免在 HTML 中使用 inline 事件處理器，我們在 DOMContentLoaded 之後
     * 使用 addEventListener 綁定對應的事件。這些元素在系統各處使用，透過
     * id 或 data-* 屬性取得後綁定事件處理函式。
     */
    try {
        // 登入按鈕：點擊觸發登入
        const loginBtn = document.getElementById('loginButton');
        if (loginBtn) {
            loginBtn.addEventListener('click', function () {
                try {
                    attemptMainLogin();
                } catch (e) {
                    console.error('登入按鈕事件錯誤:', e);
                }
            });
        }

        // 登入頁輸入框：按下 Enter 鍵觸發登入
        const loginEmailInput = document.querySelector('[data-login-email]');
        const loginPasswordInput = document.querySelector('[data-login-password]');
        const loginKeyListener = function (ev) {
            if (ev && ev.key === 'Enter') {
                try {
                    attemptMainLogin();
                } catch (e) {
                    console.error('登入輸入框鍵盤事件錯誤:', e);
                }
            }
        };
        if (loginEmailInput) {
            loginEmailInput.addEventListener('keypress', loginKeyListener);
        }
        if (loginPasswordInput) {
            loginPasswordInput.addEventListener('keypress', loginKeyListener);
        }

        // 側邊欄開關按鈕與遮罩：
        // 開與關各自呼叫冪等的 openSidebar/closeSidebar（而非共用 toggle）。
        // 控件以 pointerdown 為主事件：觸控手勢嘅目標喺手指按下時已鎖定
        // （pointer/touch 事件唔會因之後抽屜滑動、遮罩出現而被重新指向），
        // 由根源消除「一下觸控變成漢堡掣 + 遮罩/× 掣兩擊」嘅穿透問題；
        // 觸控一併 preventDefault 抑制瀏覽器事後合成嘅相容性 click。
        // click 監聽只留畀鍵盤 Enter／無指標嘅無障礙觸發（800ms 內已由
        // pointerdown 處理過嘅 click 一律忽略）。dataset.bound 防重複綁定。
        function bindSidebarControl(el, action, label) {
            let handledAt = 0;
            el.addEventListener('pointerdown', function (ev) {
                handledAt = Date.now();
                if (window.__sbPush) {
                    window.__sbPush('ptr:' + label, (ev.pointerType || 'mouse') + ' ' +
                        Math.round(ev.clientX) + ',' + Math.round(ev.clientY) +
                        ' trusted=' + ev.isTrusted);
                }
                try {
                    action();
                } catch (e) {
                    console.error('側邊欄控件 pointer 事件錯誤 (' + label + '):', e);
                }
                if (ev.pointerType === 'touch') {
                    ev.preventDefault();
                }
            }, { passive: false });
            el.addEventListener('click', function (ev) {
                if (Date.now() - handledAt < 800) {
                    if (window.__sbPush) window.__sbPush('click-suppressed:' + label);
                    return;
                }
                if (window.__sbPush) {
                    window.__sbPush('click-kbd:' + label, 'detail=' + ev.detail + ' trusted=' + ev.isTrusted);
                }
                try {
                    action();
                } catch (e) {
                    console.error('側邊欄控件 click 事件錯誤 (' + label + '):', e);
                }
            });
            el.dataset.bound = 'true';
        }

        const openSidebarBtn = document.getElementById('openSidebarButton');
        if (openSidebarBtn && !openSidebarBtn.dataset.bound) {
            bindSidebarControl(openSidebarBtn, function () { openSidebar(); }, 'hamburger');
        }
        const closeSidebarBtn = document.getElementById('closeSidebarButton');
        if (closeSidebarBtn && !closeSidebarBtn.dataset.bound) {
            bindSidebarControl(closeSidebarBtn, function () { closeSidebar(); }, 'close-x');
        }
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarOverlay && !sidebarOverlay.dataset.bound) {
            bindSidebarControl(sidebarOverlay, function () { closeSidebar(); }, 'overlay');
        }

        // ── 真機診斷記錄器（只喺網址帶 ?sblog=1 時啟用，正常使用零影響）─────
        // 經過多輪桌面合成事件測試仍無法喺真機重現「選單不斷彈出」，故加入
        // 被動記錄：四個控件嘅指標／點擊事件（含座標、pointerType、isTrusted、
        // 觸控點當下嘅元素）、#sidebar class 突變與實際 transform、過渡事件、
        // 頁面生命週期。環形緩衝 150 筆，持久化 localStorage，左下角 SB 圓鈕
        // 可複製文字回報。
        (function setupSidebarDiagnostics() {
            try {
                if (!/[?&]sblog=1(?:&|$)/.test(window.location.search)) return;
                let arr;
                try {
                    arr = JSON.parse(localStorage.getItem('__sbLog')) || [];
                } catch (_e) {
                    arr = [];
                }
                window.__sbLog = arr;
                window.__sbPush = function (kind, detail) {
                    arr.push({ t: Date.now(), k: String(kind), d: detail === undefined ? '' : String(detail) });
                    if (arr.length > 150) arr.splice(0, arr.length - 150);
                    try {
                        localStorage.setItem('__sbLog', JSON.stringify(arr));
                    } catch (_e) { /* 儲存失敗唔影響記憶體內記錄 */ }
                };
                window.__sbPush('diag-start', window.innerWidth + 'x' + window.innerHeight +
                    ' dpr=' + window.devicePixelRatio + ' ua=' + navigator.userAgent.slice(0, 80));

                const SEL = '#openSidebarButton,#closeSidebarButton,#sidebarOverlay,#sidebarMenu,#sidebar';
                function describeEl(node) {
                    if (!node) return '(null)';
                    return node.id ? '#' + node.id : (node.tagName + (node.className && typeof node.className === 'string' ? '.' + node.className.split(' ')[0] : ''));
                }
                document.addEventListener('pointerdown', function (ev) {
                    const hit = ev.target && ev.target.closest ? ev.target.closest(SEL) : null;
                    if (!hit) return;
                    let atPoint = null;
                    try {
                        atPoint = document.elementFromPoint(ev.clientX, ev.clientY);
                    } catch (_e) { /* 跨域或隱藏框架時可能擋住 */ }
                    window.__sbPush('cap-ptr ' + describeEl(hit), JSON.stringify({
                        p: ev.pointerType || 'mouse',
                        x: Math.round(ev.clientX), y: Math.round(ev.clientY),
                        point: describeEl(atPoint),
                        trusted: ev.isTrusted
                    }));
                }, true);
                document.addEventListener('click', function (ev) {
                    const hit = ev.target && ev.target.closest ? ev.target.closest(SEL) : null;
                    if (!hit) return;
                    window.__sbPush('cap-click ' + describeEl(hit), JSON.stringify({
                        x: Math.round(ev.clientX), y: Math.round(ev.clientY),
                        detail: ev.detail, trusted: ev.isTrusted
                    }));
                }, true);

                const diagSidebar = document.getElementById('sidebar');
                if (diagSidebar) {
                    new MutationObserver(function (mutations) {
                        mutations.forEach(function (m) {
                            if (m.attributeName !== 'class') return;
                            const cs = window.getComputedStyle(diagSidebar);
                            window.__sbPush('MO-class', JSON.stringify({
                                old: m.oldValue || '',
                                now: diagSidebar.className,
                                tf: (cs.transform || '').slice(0, 48)
                            }));
                        });
                    }).observe(diagSidebar, { attributes: true, attributeOldValue: true });
                    ['transitionrun', 'transitionstart', 'transitioncancel', 'transitionend'].forEach(function (name) {
                        diagSidebar.addEventListener(name, function (ev) {
                            if (ev.propertyName === 'transform') window.__sbPush(name, '');
                        });
                    });
                }
                document.addEventListener('visibilitychange', function () {
                    window.__sbPush('visibility', document.visibilityState);
                });
                window.addEventListener('pageshow', function (ev) {
                    window.__sbPush('pageshow', 'persisted=' + ev.persisted);
                });
                let lastResizeAt = 0;
                window.addEventListener('resize', function () {
                    const now = Date.now();
                    if (now - lastResizeAt < 400) return;
                    lastResizeAt = now;
                    window.__sbPush('resize', window.innerWidth + 'x' + window.innerHeight);
                });

                function renderLogText() {
                    return arr.map(function (e) {
                        const pad = String(e.t % 1000).padStart(3, '0');
                        const time = new Date(e.t).toLocaleTimeString('zh-HK', { hour12: false }) + '.' + pad;
                        return time + '  ' + e.k + (e.d ? '  ' + e.d : '');
                    }).join('\n');
                }
                const btnStyle = 'margin-left:6px;padding:2px 8px;border:0;border-radius:4px;background:#fff;color:#333;font-size:11px;';
                const panel = document.createElement('div');
                panel.style.cssText = 'position:fixed;left:8px;bottom:56px;z-index:99999;display:none;' +
                    'flex-direction:column;gap:6px;width:min(88vw,360px);max-height:46vh;padding:8px;' +
                    'border-radius:8px;background:rgba(0,0,0,.85);color:#8f8;font:11px/1.4 monospace;';
                panel.innerHTML =
                    '<div style="color:#fff;white-space:nowrap">SB LOG（最近' + arr.length + '筆）' +
                    '<button id="__sbCopy" style="' + btnStyle + '">複製</button>' +
                    '<button id="__sbClear" style="' + btnStyle + '">清除</button>' +
                    '<button id="__sbPanelClose" style="' + btnStyle + '">×</button></div>' +
                    '<textarea id="__sbText" readonly style="width:100%;height:150px;resize:vertical;' +
                    'font:10px/1.4 monospace;padding:4px;box-sizing:border-box"></textarea>';
                const fab = document.createElement('button');
                fab.textContent = 'SB';
                fab.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;width:42px;height:42px;' +
                    'border-radius:50%;border:0;background:#D9782B;color:#fff;font-weight:bold;font-size:13px;';
                fab.title = '側邊欄診斷記錄';
                fab.addEventListener('click', function () {
                    panel.style.display = 'flex';
                    document.getElementById('__sbText').value = renderLogText();
                });
                panel.addEventListener('click', function (ev) {
                    if (ev.target.id === '__sbPanelClose') {
                        panel.style.display = 'none';
                    } else if (ev.target.id === '__sbClear') {
                        arr.length = 0;
                        localStorage.removeItem('__sbLog');
                        document.getElementById('__sbText').value = '';
                    } else if (ev.target.id === '__sbCopy') {
                        const text = renderLogText();
                        const ta = document.getElementById('__sbText');
                        ta.value = text;
                        ta.select();
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(text).then(function () {
                                ev.target.textContent = '已複製';
                                setTimeout(function () { ev.target.textContent = '複製'; }, 1500);
                            }).catch(function () {
                                try { document.execCommand('copy'); } catch (_e) {}
                            });
                        } else {
                            try { document.execCommand('copy'); } catch (_e) {}
                        }
                    }
                });
                document.body.appendChild(panel);
                document.body.appendChild(fab);
            } catch (e) {
                console.error('側邊欄診斷記錄器啟用失敗:', e);
            }
        })();

        // ── 介面主題切換器（帳號安全設定）：daisyUI 5 全套 35 個內建主題 ─────
        // 切換只改 <html data-theme> 並持久化到本機 localStorage（key: tcm-theme）；
        // 無偏好時移除屬性，保留品牌橙啡 token（system.html head 會喺繪製前先套用）。
        try {
            const THEME_STORAGE_KEY = 'tcm-theme';
            const DAISY_THEMES = [
                'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate',
                'synthwave', 'retro', 'cyberpunk', 'valentine', 'halloween', 'garden',
                'forest', 'aqua', 'lofi', 'pastel', 'fantasy', 'wireframe', 'black',
                'luxury', 'dracula', 'cmyk', 'autumn', 'business', 'acid', 'lemonade',
                'night', 'coffee', 'winter', 'dim', 'nord', 'sunset', 'caramellatte',
                'abyss', 'silk'
            ];
            // 「系統預設」磚嘅品牌色直接凍結喺元素上，唔俾當前主題變數滲入預覽
            const BRAND_THEME_VARS = {
                '--color-primary': '#D9782B',
                '--color-secondary': '#B8621F',
                '--color-accent': '#B48F79',
                '--color-base-100': '#ffffff',
                '--color-base-200': '#F6EFE8',
                '--color-base-300': '#E8DED5',
                '--color-base-content': '#1E1E1E'
            };

            function readStoredTheme() {
                try { return localStorage.getItem(THEME_STORAGE_KEY) || ''; } catch (e) { return ''; }
            }
            function isValidTheme(name) { return !!name && DAISY_THEMES.indexOf(name) !== -1; }
            function getActiveTheme() {
                const attr = document.documentElement.getAttribute('data-theme');
                return isValidTheme(attr) ? attr : '';
            }

            window.applyUiTheme = function (name) {
                const root = document.documentElement;
                if (isValidTheme(name)) {
                    root.setAttribute('data-theme', name);
                    try { localStorage.setItem(THEME_STORAGE_KEY, name); } catch (e) {}
                } else {
                    root.removeAttribute('data-theme');
                    try { localStorage.removeItem(THEME_STORAGE_KEY); } catch (e) {}
                }
                syncThemePickerState();
            };

            function syncThemePickerState() {
                const active = getActiveTheme();
                const box = document.getElementById('themePicker');
                if (box) {
                    box.querySelectorAll('.theme-swatch').forEach(function (b) {
                        b.setAttribute('aria-pressed', (b.dataset.themeName || '') === active ? 'true' : 'false');
                    });
                }
                const label = document.getElementById('themeCurrentName');
                if (label) label.textContent = active ? active : '系統預設（品牌橙啡）';
                const resetBtn = document.getElementById('themeResetButton');
                if (resetBtn) resetBtn.disabled = !active;
            }

            function makeSwatch(themeName, displayName, frozenVars) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'theme-swatch';
                btn.dataset.themeName = themeName || '';
                btn.setAttribute('aria-pressed', 'false');
                if (themeName) btn.setAttribute('data-theme', themeName);
                if (frozenVars) {
                    Object.keys(frozenVars).forEach(function (k) { btn.style.setProperty(k, frozenVars[k]); });
                }
                btn.innerHTML =
                    '<span class="theme-swatch-dots">' +
                        '<span class="theme-dot" style="background:var(--color-primary)"></span>' +
                        '<span class="theme-dot" style="background:var(--color-secondary)"></span>' +
                        '<span class="theme-dot" style="background:var(--color-accent)"></span>' +
                    '</span>' +
                    '<span class="theme-swatch-name"></span>';
                btn.querySelector('.theme-swatch-name').textContent = displayName;
                btn.addEventListener('click', function () { window.applyUiTheme(themeName); });
                return btn;
            }

            function initThemePicker() {
                const box = document.getElementById('themePicker');
                if (!box || box.dataset.built) return;
                box.dataset.built = '1';
                box.appendChild(makeSwatch('', '系統預設', BRAND_THEME_VARS));
                DAISY_THEMES.forEach(function (name) { box.appendChild(makeSwatch(name, name, null)); });
                const resetBtn = document.getElementById('themeResetButton');
                if (resetBtn && !resetBtn.dataset.bound) {
                    resetBtn.dataset.bound = '1';
                    resetBtn.addEventListener('click', function () { window.applyUiTheme(''); });
                }
            }

            // 容器係靜態 HTML，script 載入時已喺 DOM；順便修正 head 早期套用時可能存在嘅非法值
            (function initThemeSwitcher() {
                const stored = readStoredTheme();
                if (stored && !isValidTheme(stored)) {
                    document.documentElement.removeAttribute('data-theme');
                    try { localStorage.removeItem(THEME_STORAGE_KEY); } catch (e) {}
                }
                initThemePicker();
                syncThemePickerState();
            })();
        } catch (e) {
            console.error('主題切換器初始化失敗:', e);
        }

        // 登出按鈕（頂部與側邊欄）：點擊後調用 logout
        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function () {
                try {
                    logout();
                } catch (e) {
                    console.error('頂部登出按鈕事件錯誤:', e);
                }
            });
        }
        const sidebarLogoutBtn = document.getElementById('sidebarLogoutButton');
        if (sidebarLogoutBtn) {
            sidebarLogoutBtn.addEventListener('click', function () {
                try {
                    logout();
                } catch (e) {
                    console.error('側邊欄登出按鈕事件錯誤:', e);
                }
            });
        }

        try {
            const switchBtn = document.getElementById('clinicSwitchButton');
            if (switchBtn && !switchBtn.dataset.bound) {
                switchBtn.addEventListener('click', async function () {
                    try {
                        try { if (typeof populateClinicSelectors === 'function') populateClinicSelectors(); } catch (_e) {}
                        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                        const isEn = lang && lang.toLowerCase().startsWith('en');
                        const options = {};
                        const availableClinics = Array.isArray(clinicsList) ? clinicsList : [];
                        availableClinics.forEach(c => {
                            if (!c || !c.id) return;
                            options[String(c.id)] = window.escapeHtml(getClinicDisplayName(c));
                        });
                        if (Object.keys(options).length === 0) {
                            showToast(isEn ? 'No clinic available' : '目前沒有可切換的診所', 'warning');
                            return;
                        }
                        const picked = await Swal.fire({
                            title: isEn ? 'Switch clinic' : '切換診所',
                            input: 'select',
                            inputOptions: options,
                            inputValue: currentClinicId ? String(currentClinicId) : '',
                            inputPlaceholder: isEn ? 'Please select' : '請選擇',
                            showCancelButton: true,
                            confirmButtonText: isEn ? 'Switch' : '切換',
                            cancelButtonText: isEn ? 'Cancel' : '取消'
                        });
                        if (!picked || !picked.isConfirmed) return;
                        const targetClinicId = String(picked.value || '');
                        if (!targetClinicId || String(targetClinicId) === String(currentClinicId || '')) {
                            return;
                        }
                        await setCurrentClinicId(targetClinicId);
                    } catch (e) {
                        console.error('切換診所按鈕事件錯誤:', e);
                    }
                });
                switchBtn.dataset.bound = 'true';
            }
            const closeBtn = document.getElementById('clinicSwitchCloseButton');
            if (closeBtn && !closeBtn.dataset.bound) {
                closeBtn.addEventListener('click', function () {
                    try {
                        const modal = document.getElementById('clinicSwitchModal');
                        if (modal) modal.classList.add('hidden');
                    } catch (e) {
                        console.error('關閉切換診所彈窗錯誤:', e);
                    }
                });
                closeBtn.dataset.bound = 'true';
            }
            const confirmBtn = document.getElementById('clinicSwitchConfirmButton');
            if (confirmBtn && !confirmBtn.dataset.bound) {
                confirmBtn.addEventListener('click', async function () {
                    try {
                        const sel = document.getElementById('currentClinicSelector');
                        if (sel && sel.value) {
                            await setCurrentClinicId(sel.value);
                        }
                        const modal = document.getElementById('clinicSwitchModal');
                        if (modal) modal.classList.add('hidden');
                    } catch (e) {
                        console.error('確定切換診所錯誤:', e);
                    }
                });
                confirmBtn.dataset.bound = 'true';
            }
            try {
                const modal = document.getElementById('clinicSwitchModal');
                if (modal) {
                    const overlay = modal.querySelector('.absolute');
                    if (overlay && !overlay.dataset.bound) {
                        overlay.addEventListener('click', function () {
                            try { modal.classList.add('hidden'); } catch (_e) {}
                        });
                        overlay.dataset.bound = 'true';
                    }
                }
            } catch (_e) {}
        } catch (_e) {}
 
        // 病人資料管理：新增/隱藏/儲存事件綁定
        // 新增病人按鈕
        const showAddPatientBtn = document.getElementById('showAddPatientButton');
        if (showAddPatientBtn) {
            showAddPatientBtn.addEventListener('click', function () {
                try {
                    showAddPatientForm();
                } catch (e) {
                    console.error('顯示新增病人表單錯誤:', e);
                }
            });
        }
        // 關閉新增病人表單（標題列叉號）
        const hideAddPatientBtnTop = document.getElementById('hideAddPatientButtonTop');
        if (hideAddPatientBtnTop) {
            hideAddPatientBtnTop.addEventListener('click', function () {
                try {
                    hideAddPatientForm();
                } catch (e) {
                    console.error('關閉新增病人表單（標題）錯誤:', e);
                }
            });
        }
        // 取消按鈕：隱藏新增病人表單
        const cancelAddPatientBtn = document.getElementById('cancelAddPatientButton');
        if (cancelAddPatientBtn) {
            cancelAddPatientBtn.addEventListener('click', function () {
                try {
                    hideAddPatientForm();
                } catch (e) {
                    console.error('取消新增病人表單錯誤:', e);
                }
            });
        }
        // 儲存病人按鈕：提交表單
        const savePatientBtn = document.getElementById('savePatientButton');
        if (savePatientBtn) {
            savePatientBtn.addEventListener('click', function () {
                try {
                    savePatient();
                } catch (e) {
                    console.error('儲存病人資料錯誤:', e);
                }
            });
        }

        /**
         * 一次性移除頁面上所有內嵌的 onclick/onchange 事件處理器，改以透過
         * addEventListener 綁定。這樣可避免 HTML 中的 inline 事件污染
         * 全域命名空間，也方便後續維護與重構。此邏輯將在頁面載入時
         * 掃描帶有 onclick 或 onchange 屬性的元素，解析其中的函式名稱
         * 與參數，並以事件委派的方式在相同元素上綁定對應的事件處理
         * 函式。原始的 onclick/onchange 屬性會被移除，避免重複執行。
         */
        (function initInlineEventHandlers() {
            /**
             * 將字串形式的參數列表轉換為實際的引數陣列。
             * 此函式會特別處理字面值 'event' 與 'this'：
             *   - 'event' 會替換為觸發事件的物件
             *   - 'this'  會替換為綁定的 DOM 元素
             * 其餘字串會直接以 JavaScript 字面量解析（例如數字或帶引號的字串）。
             * @param {string} argsStr 原始參數字串，例如 "-1, 'herbs'"
             * @param {Event} event 事件對象
             * @param {HTMLElement} el 觸發事件的元素
             * @returns {Array} 解析後的引數陣列
             */
            function parseArgs(argsStr, event, el) {
                const trimmed = argsStr.trim();
                if (!trimmed) {
                    return [];
                }
                // 先替換 'event' 與 'this' 為特殊標記，避免直接 eval 解析錯誤
                const replaced = trimmed
                    .replace(/\bevent\b/g, '__EVENT__')
                    .replace(/\bthis\b/g, '__THIS__');
                let args;
                try {
                    /*
                     * 使用動態函式的方式來解析包含 __EVENT__/__THIS__ 標記的引數字串，
                     * 並將實際的 event 與元素物件作為參數注入。這樣就可以正確解析
                     * 複雜的屬性存取表達式（例如 __THIS__.files[0]），避免將 __THIS__
                     * 當作字串處理導致無法讀取屬性。
                     */
                    const fn = new Function('__EVENT__', '__THIS__', 'return [' + replaced + '];');
                    args = fn(event, el);
                } catch (e) {
                    console.error('解析 inline 事件參數失敗:', argsStr, e);
                    args = [];
                }
                // args 現在已經是包含正確值的陣列，無需再替換特殊標記
                return args;
            }

            /**
             * 綁定指定屬性的 inline 事件處理器。此函式會從元素上讀取
             * 事件屬性（例如 onclick 或 onchange）的內容並解析出函式
             * 名稱與參數，再透過 addEventListener 重新綁定事件。
             * @param {string} attrName 屬性名稱，例如 'onclick' 或 'onchange'
             * @param {string} eventName 對應的事件名稱，例如 'click' 或 'change'
             */
            function bindInlineHandlers(attrName, eventName) {
                const selector = '[' + attrName + ']';
                document.querySelectorAll(selector).forEach(function (el) {
                    const handlerCode = el.getAttribute(attrName);
                    if (!handlerCode) return;
                    // 移除 inline 屬性，避免瀏覽器原生執行
                    el.removeAttribute(attrName);
                    el.addEventListener(eventName, function (event) {
                        try {
                            // 匹配類似 "functionName(arg1, arg2)" 的字串
                            const match = handlerCode.match(/^\s*([^(]+)\s*\((.*)\)\s*$/);
                            if (!match) {
                                return;
                            }
                            const fnName = match[1].trim();
                            const argsStr = match[2];
                            // 解析參數
                            const args = parseArgs(argsStr, event, el);
                            // 若函式名稱包含 "."，代表可能為某物件的屬性或方法
                            if (fnName.indexOf('.') >= 0) {
                                const parts = fnName.split('.');
                                // 若第一段是 'this'，則從元素本身取用
                                let target;
                                if (parts[0] === 'this') {
                                    target = el;
                                    parts.shift();
                                } else {
                                    // 其餘根據 window 尋找
                                    target = window[parts.shift()];
                                }
                                let prop;
                                while (parts.length > 1 && target) {
                                    prop = parts.shift();
                                    target = target[prop];
                                }
                                const methodName = parts.shift();
                                if (target && typeof target[methodName] === 'function') {
                                    target[methodName].apply(target, args);
                                }
                            } else {
                                // 從全域 window 取用函式
                                const fn = window[fnName];
                                if (typeof fn === 'function') {
                                    fn.apply(el, args);
                                }
                            }
                        } catch (err) {
                            console.error('執行 inline 事件處理器時發生錯誤:', handlerCode, err);
                        }
                    });
                });
            }

            // 綁定所有現有的 onclick 與 onchange 事件
            bindInlineHandlers('onclick', 'click');
            bindInlineHandlers('onchange', 'change');

            /**
             * 監聽 DOM 變更，動態綁定後續新增的元素上的 inline 事件。
             * 有些按鈕會在執行期間動態插入（例如搜尋結果列表），若不在此
             * 監聽，將會導致內嵌事件仍然存在。透過 MutationObserver 監
             * 看新增的節點，並對其及其子孫節點執行相同的綁定邏輯。
             */
            const observer = new MutationObserver(function (mutationsList) {
                mutationsList.forEach(function (mutation) {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType !== 1) return;
                        // 對新增節點及其子孫節點處理
                        [node, ...node.querySelectorAll('[onclick], [onchange]')].forEach(function (el) {
                            if (el.hasAttribute && el.hasAttribute('onclick')) {
                                const code = el.getAttribute('onclick');
                                el.removeAttribute('onclick');
                                // 若已有事件監聽，避免重複綁定（透過 dataset 標記）
                                if (!el.dataset.inlineClickBound) {
                                    el.dataset.inlineClickBound = 'true';
                                    el.addEventListener('click', function (event) {
                                        try {
                                            const match = code.match(/^\s*([^(]+)\s*\((.*)\)\s*$/);
                                            if (!match) return;
                                            const fnName = match[1].trim();
                                            const argsStr = match[2];
                                            const args = parseArgs(argsStr, event, el);
                                            if (fnName.indexOf('.') >= 0) {
                                                const parts = fnName.split('.');
                                                let target;
                                                if (parts[0] === 'this') {
                                                    target = el;
                                                    parts.shift();
                                                } else {
                                                    target = window[parts.shift()];
                                                }
                                                let prop;
                                                while (parts.length > 1 && target) {
                                                    prop = parts.shift();
                                                    target = target[prop];
                                                }
                                                const methodName = parts.shift();
                                                if (target && typeof target[methodName] === 'function') {
                                                    target[methodName].apply(target, args);
                                                }
                                            } else {
                                                const fn = window[fnName];
                                                if (typeof fn === 'function') {
                                                    fn.apply(el, args);
                                                }
                                            }
                                        } catch (err) {
                                            console.error('執行動態 inline 事件處理器錯誤:', code, err);
                                        }
                                    });
                                }
                            }
                            if (el.hasAttribute && el.hasAttribute('onchange')) {
                                const code = el.getAttribute('onchange');
                                el.removeAttribute('onchange');
                                if (!el.dataset.inlineChangeBound) {
                                    el.dataset.inlineChangeBound = 'true';
                                    el.addEventListener('change', function (event) {
                                        try {
                                            const match = code.match(/^\s*([^(]+)\s*\((.*)\)\s*$/);
                                            if (!match) return;
                                            const fnName = match[1].trim();
                                            const argsStr = match[2];
                                            const args = parseArgs(argsStr, event, el);
                                            if (fnName.indexOf('.') >= 0) {
                                                const parts = fnName.split('.');
                                                let target;
                                                if (parts[0] === 'this') {
                                                    target = el;
                                                    parts.shift();
                                                } else {
                                                    target = window[parts.shift()];
                                                }
                                                let prop;
                                                while (parts.length > 1 && target) {
                                                    prop = parts.shift();
                                                    target = target[prop];
                                                }
                                                const methodName = parts.shift();
                                                if (target && typeof target[methodName] === 'function') {
                                                    target[methodName].apply(target, args);
                                                }
                                            } else {
                                                const fn = window[fnName];
                                                if (typeof fn === 'function') {
                                                    fn.apply(el, args);
                                                }
                                            }
                                        } catch (err) {
                                            console.error('執行動態 inline 事件處理器錯誤:', code, err);
                                        }
                                    });
                                }
                            }
                        });
                    });
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        })();
    } catch (e) {
        console.error('綁定登入與側邊欄事件時發生錯誤:', e);
    }
});

// 病歷管理相關函式與變數
// 儲存目前頁的病歷與對應病人名稱（節省流量）
let medicalRecords = [];
let medicalRecordPatients = {};
let medicalRecordPageSize = 10;
let medicalRecordTotalCount = 0;
let medicalRecordPageCursors = {}; // { pageNumber: lastDocSnapshot }
let medicalRecordPageCache = {};   // { pageNumber: Array<consultation> }
let medicalRecordSearchCache = {}; // { term: Array<consultation> }
let medicalRecordAscPageCursors = {}; // { ascIndex: lastDocSnapshot }
let medicalRecordAscPageCache = {};   // { ascIndex: Array<consultation> }
let medicalRecordListListenerAttached = false;
let medicalRecordListUnsubscribe = null;
let medicalRecordRefreshInFlight = null;
let medicalRecordListenerDebounceTimer = null;

function getMedicalRecordSortRawValue(record) {
    if (!record || typeof record !== 'object') return null;
    return record.sortDate || record.date || record.createdAt || record.updatedAt || null;
}

function getMedicalRecordSortTimestamp(record) {
    try {
        const parsed = parseConsultationDate(getMedicalRecordSortRawValue(record));
        return parsed && !isNaN(parsed.getTime()) ? parsed.getTime() : 0;
    } catch (_err) {
        return 0;
    }
}

function sortMedicalRecordsBySortDateDesc(records) {
    return (Array.isArray(records) ? records : []).slice().sort((a, b) => {
        return getMedicalRecordSortTimestamp(b) - getMedicalRecordSortTimestamp(a);
    });
}

function resetMedicalRecordManagementCaches() {
    medicalRecordPageCursors = {};
    medicalRecordPageCache = {};
    medicalRecordSearchCache = {};
    medicalRecordAscPageCursors = {};
    medicalRecordAscPageCache = {};
}

function updateMedicalRecordPatientLookup(patients) {
    (Array.isArray(patients) ? patients : []).forEach(p => {
        const name = p.name || p.patientName || p.fullName || p.displayName || p.chineseName || p.englishName || '';
        medicalRecordPatients[String(p.id).trim()] = name;
    });
}

async function ensureMedicalRecordPatientLookupForRecords(records) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) return;
    const missingIds = Array.from(new Set(
        list
            .map(rec => rec && rec.patientId !== undefined && rec.patientId !== null ? String(rec.patientId).trim() : '')
            .filter(id => id && !medicalRecordPatients[id])
    ));
    if (!missingIds.length) return;
    const loadedPatients = await Promise.all(missingIds.map(async (id) => {
        try {
            return await getPatientByIdWithRefresh(id);
        } catch (_e) {
            return null;
        }
    }));
    updateMedicalRecordPatientLookup(loadedPatients.filter(Boolean));
}

function isMedicalRecordManagementVisible() {
    const sectionEl = document.getElementById('medicalRecordManagement');
    return !!(sectionEl && !sectionEl.classList.contains('hidden'));
}

function hasMedicalRecordSearchTerm() {
    const searchInput = document.getElementById('searchMedicalRecord');
    return !!(searchInput && searchInput.value && searchInput.value.trim());
}

async function refreshMedicalRecordManagementData(preservePage = true, options = {}) {
    if (medicalRecordRefreshInFlight) {
        return medicalRecordRefreshInFlight;
    }
    medicalRecordRefreshInFlight = (async () => {
        const refreshCount = options.refreshCount !== false;
        resetMedicalRecordManagementCaches();
        try {
            if (window.firebaseDataManager && typeof window.firebaseDataManager.consultationsCache !== 'undefined') {
                window.firebaseDataManager.consultationsCache = null;
            }
        } catch (_cacheErr) {}
        try {
            localStorage.removeItem('consultations');
        } catch (_lsErr) {}
        if (refreshCount) {
            const countRes = await getConsultationsCount();
            medicalRecordTotalCount = (countRes && typeof countRes.count === 'number') ? countRes.count : 0;
        }
        await displayMedicalRecords(preservePage);
    })();
    try {
        await medicalRecordRefreshInFlight;
    } finally {
        medicalRecordRefreshInFlight = null;
    }
}

async function attachMedicalRecordListListener() {
    try {
        await waitForFirebaseDb();
        if (medicalRecordListListenerAttached) return;
        const colRef = window.firebase.collection(window.firebase.db, 'consultations');
        let isInitialSnapshot = true;
        let q;
        try {
            q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.orderBy('sortDate', 'desc'),
                window.firebase.limit(1)
            );
        } catch (_e) {
            try {
                q = window.firebase.firestoreQuery(
                    colRef,
                    window.firebase.orderBy('createdAt', 'desc'),
                    window.firebase.limit(1)
                );
            } catch (_e2) {
                try {
                    q = window.firebase.firestoreQuery(
                        colRef,
                        window.firebase.orderBy('date', 'desc'),
                        window.firebase.limit(1)
                    );
                } catch (_fallbackErr) {
                    q = colRef;
                }
            }
        }
        medicalRecordListUnsubscribe = window.firebase.onSnapshot(q, (snapshot) => {
            try {
                if (isInitialSnapshot) {
                    isInitialSnapshot = false;
                    return;
                }
                const addedChanges = snapshot && typeof snapshot.docChanges === 'function'
                    ? snapshot.docChanges().filter(change => change && change.type === 'added')
                    : [];
                if (!addedChanges.length) {
                    return;
                }
                resetMedicalRecordManagementCaches();
                if (typeof medicalRecordTotalCount === 'number' && medicalRecordTotalCount >= 0) {
                    medicalRecordTotalCount += addedChanges.length;
                }
                if (!isMedicalRecordManagementVisible() || hasMedicalRecordSearchTerm()) {
                    return;
                }
                const currentPage = paginationSettings.medicalRecordList && paginationSettings.medicalRecordList.currentPage
                    ? paginationSettings.medicalRecordList.currentPage
                    : 1;
                if (currentPage !== 1) {
                    return;
                }
                if (medicalRecordListenerDebounceTimer) {
                    clearTimeout(medicalRecordListenerDebounceTimer);
                }
                medicalRecordListenerDebounceTimer = setTimeout(() => {
                    medicalRecordListenerDebounceTimer = null;
                    refreshMedicalRecordManagementData(true, { refreshCount: false }).catch((err) => {
                        console.error('病歷管理即時更新處理失敗:', err);
                    });
                }, 400);
            } catch (innerErr) {
                console.error('病歷管理即時更新處理失敗:', innerErr);
            }
        }, (err) => {
            console.error('監聽病歷管理資料失敗:', err);
        });
        medicalRecordListListenerAttached = true;
    } catch (outerErr) {
        console.error('附加病歷管理監聽失敗:', outerErr);
    }
}

function detachMedicalRecordListListener() {
    if (medicalRecordListListenerAttached) {
        try {
            if (typeof medicalRecordListUnsubscribe === 'function') {
                medicalRecordListUnsubscribe();
            }
        } catch (err) {
            console.error('取消病歷管理監聽失敗:', err);
        }
        medicalRecordListListenerAttached = false;
        medicalRecordListUnsubscribe = null;
    }
    if (medicalRecordListenerDebounceTimer) {
        clearTimeout(medicalRecordListenerDebounceTimer);
        medicalRecordListenerDebounceTimer = null;
    }
}

/**
 * 載入病歷管理頁面：重置搜尋欄、讀取診症記錄與病人資料，並綁定搜尋事件。
 */
async function loadMedicalRecordManagement() {
    try {
        // 確保分頁設定存在並重置當前頁
        if (!paginationSettings.medicalRecordList) {
            paginationSettings.medicalRecordList = { currentPage: 1, itemsPerPage: 10 };
        }
        paginationSettings.medicalRecordList.currentPage = 1;
        paginationSettings.medicalRecordList.itemsPerPage = 10;
        resetMedicalRecordManagementCaches();
        const searchInput = document.getElementById('searchMedicalRecord');
        if (searchInput) {
            searchInput.value = '';
            // 移除舊的監聽器以避免重複綁定
            if (searchInput._medicalRecordListener) {
                searchInput.removeEventListener('input', searchInput._medicalRecordListener);
            }
            const listener = debounce(() => {
                // 每當搜尋條件變更時，將頁碼重置為 1 並重新顯示列表
                paginationSettings.medicalRecordList.currentPage = 1;
                displayMedicalRecords(false);
            }, 300);
            searchInput.addEventListener('input', listener);
            searchInput._medicalRecordListener = listener;
        }
        const countRes = await getConsultationsCount();
        medicalRecordTotalCount = (countRes && typeof countRes.count === 'number') ? countRes.count : 0;
        await displayMedicalRecords(false);
    } catch (error) {
        console.error('初始化病歷管理時發生錯誤:', error);
    }
}

/**
 * 顯示病歷列表，可依搜尋條件篩選並進行分頁。
 * @param {boolean} pageChange 若為 true 表示僅更換頁碼，不重置目前頁
 */
async function displayMedicalRecords(pageChange = false) {
    const tbody = document.getElementById('medicalRecordTableBody');
    if (!tbody) return;
    try {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <div class="mt-2">載入中...</div>
                </td>
            </tr>
        `;
    } catch (_e) {}
    const searchInput = document.getElementById('searchMedicalRecord');
    const rawTerm = searchInput && searchInput.value ? searchInput.value.trim() : '';
    const term = rawTerm.toLowerCase();
    const itemsPerPage = (paginationSettings.medicalRecordList && paginationSettings.medicalRecordList.itemsPerPage) ? paginationSettings.medicalRecordList.itemsPerPage : medicalRecordPageSize;
    let currentPage = (paginationSettings.medicalRecordList && paginationSettings.medicalRecordList.currentPage) ? paginationSettings.medicalRecordList.currentPage : 1;
    // 非翻頁重繪時，一律先回到第 1 頁，再依該頁碼抓資料，避免誤把舊頁內容顯示成第一頁。
    if (!pageChange) {
        currentPage = 1;
        if (paginationSettings.medicalRecordList) {
            paginationSettings.medicalRecordList.currentPage = 1;
        }
    }
    let filtered = [];
    if (term) {
        let res = medicalRecordSearchCache[term] || null;
        if (!Array.isArray(res)) {
            res = await searchMedicalRecords(rawTerm, 50);
            if (Array.isArray(res)) medicalRecordSearchCache[term] = res;
        }
        medicalRecords = Array.isArray(res) ? res : [];
        await ensureMedicalRecordPatientLookupForRecords(medicalRecords);
        filtered = medicalRecords.filter(rec => canCurrentUserViewConsultationEntry(rec));
    } else {
        const pageData = await fetchMedicalRecordPageOptimized(currentPage, itemsPerPage);
        medicalRecords = Array.isArray(pageData) ? pageData : [];
        await ensureMedicalRecordPatientLookupForRecords(medicalRecords);
        filtered = medicalRecords.filter(rec => canCurrentUserViewConsultationEntry(rec));
    }
    if (term) {
        filtered = medicalRecords.filter(rec => {
            // 使用病歷編號進行搜尋時優先採用 rec.medicalRecordNumber
            // 若不存在則回退至 Firebase 文件 ID。這樣可讓使用者輸入「MR」開頭的編號
            // 就能搜尋到對應病歷，而不會只比對隱晦的文件 ID。【857813225103928†L1617-L1625】
            const recordNum = String(rec.medicalRecordNumber || rec.id || '').toLowerCase();
            const patientName = String(medicalRecordPatients[String(rec.patientId).trim()] || rec.patientName || '').toLowerCase();
            let doctorName = '';
            // 依據醫師資料設定顯示名稱，若為字串（可能為 username 或角色），
            // 則使用 getDoctorDisplayName() 嘗試從用戶列表取得顯示名稱；
            // 若為物件，則優先使用其 username 再以 getDoctorDisplayName() 轉換，
            // 否則回退至其自身的 displayName/name/fullName 或 email。
            if (rec.doctor) {
                try {
                    if (typeof rec.doctor === 'string') {
                        doctorName = typeof getDoctorDisplayName === 'function'
                            ? getDoctorDisplayName(rec.doctor) : rec.doctor;
                    } else if (rec.doctor.username) {
                        doctorName = typeof getDoctorDisplayName === 'function'
                            ? getDoctorDisplayName(rec.doctor.username) : (rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '');
                    } else {
                        doctorName = rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '';
                    }
                } catch (_err) {
                    doctorName = rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '';
                }
            }
            if (shouldHideGeneralRegistrationDoctorInfo(rec, null)) {
                // 一般掛號沒有指定醫師，醫師欄改顯示「一般掛號」而非空白
                try {
                    const filterLang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
                    doctorName = getGeneralRegistrationSourceLabel(String(filterLang).toLowerCase().startsWith('en'));
                } catch (_e) {
                    doctorName = GENERAL_REGISTRATION_LABEL;
                }
            }
            doctorName = doctorName.toLowerCase();
            return recordNum.includes(term) || patientName.includes(term) || doctorName.includes(term);
        });
    }
    // 統一以 sortDate 為主、其餘日期欄位為後備，避免查詢排序與前端排序基準不一致。
    try {
        filtered = sortMedicalRecordsBySortDateDesc(filtered);
    } catch (_sortErr) {
        // 忽略排序失敗
    }
    const totalItems = term ? filtered.length : (typeof medicalRecordTotalCount === 'number' ? medicalRecordTotalCount : filtered.length);
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    if (paginationSettings.medicalRecordList) {
        paginationSettings.medicalRecordList.currentPage = currentPage;
    }
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageItems = term ? filtered.slice(startIdx, startIdx + itemsPerPage) : filtered;
    tbody.innerHTML = '';
    // 決定語言顯示
    let lang = 'zh';
    try {
        lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
    } catch (_e) {}
    const translations = (typeof window !== 'undefined' && window.translations && window.translations[lang]) ? window.translations[lang] : {};
    const viewLabel = translations['檢視'] || '檢視';
    // 新增刪除按鈕標籤，可根據語言設定
    const deleteLabel = translations['刪除'] || (lang === 'en' ? 'Delete' : '刪除');
    const noMatchText = term ? (lang === 'en' ? 'No matching records found' : '沒有找到符合條件的病歷') : (lang === 'en' ? 'No medical records yet' : '尚無病歷資料');
    if (!pageItems || pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    ${window.escapeHtml(noMatchText)}
                </td>
            </tr>
        `;
    } else {
        pageItems.forEach(rec => {
            // 顯示給使用者看的病歷編號應為系統產生的 medicalRecordNumber；若無則回退至文件 ID。
            const recordNumDisplay = rec.medicalRecordNumber || rec.id || '';
            // 實際用於載入與刪除的病歷 ID 必須使用 Firebase 文件 ID
            const recordId = rec.id || '';
            const patientName = medicalRecordPatients[String(rec.patientId).trim()] || rec.patientName || '';
            let doctorName = '';
            if (rec.doctor) {
                try {
                    if (typeof rec.doctor === 'string') {
                        doctorName = typeof getDoctorDisplayName === 'function'
                            ? getDoctorDisplayName(rec.doctor)
                            : rec.doctor;
                    } else if (rec.doctor.username) {
                        doctorName = typeof getDoctorDisplayName === 'function'
                            ? getDoctorDisplayName(rec.doctor.username)
                            : (rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '');
                    } else {
                        doctorName = rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '';
                    }
                } catch (_err) {
                    doctorName = rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '';
                }
            }
            if (shouldHideGeneralRegistrationDoctorInfo(rec, null)) {
                // 一般掛號沒有指定醫師，醫師欄顯示「一般掛號」而非空白
                doctorName = getGeneralRegistrationSourceLabel(String(lang).toLowerCase().startsWith('en'));
            }
            let clinicName = '';
            try {
                if (rec.clinicName) {
                    clinicName = rec.clinicName;
                } else if (rec.clinicId) {
                    const foundClinic = Array.isArray(clinicsList)
                        ? clinicsList.find(c => String(c.id) === String(rec.clinicId))
                        : null;
                    clinicName = foundClinic ? (foundClinic.chineseName || foundClinic.englishName || '') : '';
                }
            } catch (_eClinicList) {}
            let dateStr = '';
            try {
                const rawDate = getMedicalRecordSortRawValue(rec);
                const parsed = parseConsultationDate(rawDate);
                if (parsed && !isNaN(parsed.getTime())) {
                    const locale = lang === 'en' ? 'en-US' : 'zh-TW';
                    dateStr = parsed.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
                }
            } catch (_err) {}
            // 調整主訴欄位的來源順序：若記錄已有中醫診斷（diagnosis 或 tcmDiagnosis），
            // 則優先顯示該診斷內容；若無則退回至主訴/問診摘要/現病史等其他欄位。
            let complaint = rec.diagnosis || rec.tcmDiagnosis || rec.symptoms || rec.inquirySummary || rec.chiefComplaint || rec.currentHistory || '';
            let complaintDisplay = '';
            if (complaint) {
                const firstLine = complaint.split('\n').find(l => l.trim() !== '');
                complaintDisplay = firstLine || '';
                // 將主訴欄位的顯示長度縮短為 8 個字元，超出部分顯示省略號，
                // 以免列表佔用過多寬度
                if (complaintDisplay.length > 8) {
                    complaintDisplay = complaintDisplay.substring(0, 8) + '...';
                }
            }
            const canDeleteMedicalRecord = hasActionPermission('medicalRecordDelete');
            const viewButtonClasses = `${getMedicalHistoryActionButtonClasses('load')} mr-2`;
            const deleteButtonClasses = getMedicalHistoryActionButtonClasses('delete');
            // 改用 data-* 屬性傳參，避免病人姓名含單引號（如 O'Brien）截斷
            // onclick 屬性造成注入；屬性值一律 escapeHtml
            const deleteButtonHtml = canDeleteMedicalRecord
                ? `<button type="button" class="${deleteButtonClasses}" data-action="delete-medical-record" data-record-id="${window.escapeHtml(recordId)}" data-patient-name="${window.escapeHtml(patientName)}">${window.escapeHtml(deleteLabel)}</button>`
                : '';
            tbody.innerHTML += `
                <tr>
                    <td class="px-4 py-2 whitespace-nowrap">${window.escapeHtml(recordNumDisplay)}</td>
                    <td class="px-4 py-2 whitespace-nowrap">${clinicName ? window.escapeHtml(clinicName) : ''}</td>
                    <td class="px-4 py-2 whitespace-nowrap">${window.escapeHtml(patientName)}</td>
                    <td class="px-4 py-2 whitespace-nowrap">${window.escapeHtml(complaintDisplay)}</td>
                    <td class="px-4 py-2 whitespace-nowrap">${window.escapeHtml(doctorName)}</td>
                    <td class="px-4 py-2 whitespace-nowrap">${window.escapeHtml(dateStr)}</td>
                    <td class="px-4 py-2 whitespace-nowrap">
                        <button type="button" class="${viewButtonClasses}" data-action="view-medical-record" data-record-id="${window.escapeHtml(recordId)}">${window.escapeHtml(viewLabel)}</button>
                        ${deleteButtonHtml}
                    </td>
                </tr>
            `;
        });

        // 綁定檢視/刪除按鈕事件（取代 inline onclick，避免屬性注入）
        tbody.querySelectorAll('button[data-action="view-medical-record"]').forEach(btn => {
            btn.addEventListener('click', function() {
                viewMedicalRecord(this.getAttribute('data-record-id'), this);
            });
        });
        tbody.querySelectorAll('button[data-action="delete-medical-record"]').forEach(btn => {
            btn.addEventListener('click', function() {
                confirmDeleteMedicalRecord(
                    this.getAttribute('data-record-id'),
                    this.getAttribute('data-patient-name'),
                    this
                );
            });
        });
    }
    // 確保分頁容器存在並渲染
    const paginEl = ensurePaginationContainer('medicalRecordList', 'medicalRecordPagination');
    if (paginEl) {
        renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
            if (paginationSettings.medicalRecordList) {
                paginationSettings.medicalRecordList.currentPage = newPage;
            }
            displayMedicalRecords(true);
        }, paginEl);
    }
}

function initializeMedicalRecordPagination() {
    medicalRecordPageCursors = {};
    medicalRecordPageCache = {};
    medicalRecordAscPageCursors = {};
    medicalRecordAscPageCache = {};
}

async function getConsultationsCount() {
    try {
        await waitForFirebaseDb();
        const colRef = window.firebase.collection(window.firebase.db, 'consultations');
        const snapshot = await window.firebase.getCountFromServer(colRef);
        return { count: snapshot.data().count || 0 };
    } catch (_err) {
        return { count: 0 };
    }
}

async function fetchMedicalRecordPage(page = 1, pageSize = 10) {
    try {
        await waitForFirebaseDb();
        if (medicalRecordPageCache[page]) {
            return medicalRecordPageCache[page];
        }
        const colRef = window.firebase.collection(window.firebase.db, 'consultations');
        let q;
        const totalItems = typeof medicalRecordTotalCount === 'number' ? medicalRecordTotalCount : null;
        const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : null;
        if (totalPages && page === totalPages) {
            const rem = totalItems % pageSize;
            const lastPageSize = rem === 0 ? pageSize : rem;
            q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.orderBy('sortDate', 'asc'),
                window.firebase.limit(lastPageSize)
            );
            const snapLast = await window.firebase.getDocs(q);
            let arrLast = [];
            snapLast.forEach(d => arrLast.push({ id: d.id, ...d.data() }));
            try {
                arrLast = sortMedicalRecordsBySortDateDesc(arrLast);
            } catch (_e) {}
            medicalRecordPageCache[page] = arrLast;
            return arrLast;
        }
        if (page === 1) {
            q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.orderBy('sortDate', 'desc'),
                window.firebase.limit(pageSize),
            );
            const snap = await window.firebase.getDocs(q);
            let arr = [];
            snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
            try {
                arr = sortMedicalRecordsBySortDateDesc(arr);
            } catch (_e) {}
            medicalRecordPageCache[1] = arr;
            medicalRecordPageCursors[1] = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            return arr;
        }
        // 確保擁有上一頁游標，若沒有則逐頁計算
        let prevPage = page - 1;
        if (!medicalRecordPageCursors[prevPage]) {
            for (let p = 1; p <= prevPage; p++) {
                if (medicalRecordPageCache[p]) continue;
                await fetchMedicalRecordPage(p, pageSize);
            }
        }
        const last = medicalRecordPageCursors[prevPage];
        if (!last) {
            medicalRecordPageCache[page] = [];
            medicalRecordPageCursors[page] = null;
            return [];
        }
        q = window.firebase.firestoreQuery(
            colRef,
            window.firebase.orderBy('sortDate', 'desc'),
            window.firebase.startAfter(last),
            window.firebase.limit(pageSize),
        );
        const snap2 = await window.firebase.getDocs(q);
        let arr2 = [];
        snap2.forEach(d => arr2.push({ id: d.id, ...d.data() }));
        try {
            arr2 = sortMedicalRecordsBySortDateDesc(arr2);
        } catch (_e) {}
        medicalRecordPageCache[page] = arr2;
        medicalRecordPageCursors[page] = snap2.docs.length ? snap2.docs[snap2.docs.length - 1] : medicalRecordPageCursors[prevPage];
        return arr2;
    } catch (_err) {
        return [];
    }
}

async function fetchMedicalRecordPageAsc(ascIndex = 1, pageSize = 10) {
    try {
        await waitForFirebaseDb();
        if (medicalRecordAscPageCache[ascIndex]) {
            return medicalRecordAscPageCache[ascIndex];
        }
        const colRef = window.firebase.collection(window.firebase.db, 'consultations');
        let q;
        if (ascIndex === 1) {
            q = window.firebase.firestoreQuery(
                colRef,
                window.firebase.orderBy('sortDate', 'asc'),
                window.firebase.limit(pageSize),
            );
            const snap = await window.firebase.getDocs(q);
            let arr = [];
            snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
            try {
                arr = sortMedicalRecordsBySortDateDesc(arr);
            } catch (_e) {}
            medicalRecordAscPageCache[1] = arr;
            medicalRecordAscPageCursors[1] = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            return arr;
        }
        let prev = ascIndex - 1;
        if (!medicalRecordAscPageCursors[prev]) {
            for (let a = 1; a <= prev; a++) {
                if (medicalRecordAscPageCache[a]) continue;
                await fetchMedicalRecordPageAsc(a, pageSize);
            }
        }
        const last = medicalRecordAscPageCursors[prev];
        if (!last) {
            medicalRecordAscPageCache[ascIndex] = [];
            medicalRecordAscPageCursors[ascIndex] = null;
            return [];
        }
        q = window.firebase.firestoreQuery(
            colRef,
            window.firebase.orderBy('sortDate', 'asc'),
            window.firebase.startAfter(last),
            window.firebase.limit(pageSize),
        );
        const snap2 = await window.firebase.getDocs(q);
        let arr2 = [];
        snap2.forEach(d => arr2.push({ id: d.id, ...d.data() }));
        try {
            arr2 = sortMedicalRecordsBySortDateDesc(arr2);
        } catch (_e) {}
        medicalRecordAscPageCache[ascIndex] = arr2;
        medicalRecordAscPageCursors[ascIndex] = snap2.docs.length ? snap2.docs[snap2.docs.length - 1] : medicalRecordAscPageCursors[prev];
        return arr2;
    } catch (_err) {
        return [];
    }
}

async function fetchMedicalRecordPageOptimized(page = 1, pageSize = 10) {
    try {
        const totalItems = typeof medicalRecordTotalCount === 'number' ? medicalRecordTotalCount : null;
        const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : null;
        if (!totalPages) {
            return await fetchMedicalRecordPage(page, pageSize);
        }
        const distStart = page - 1;
        const distEnd = totalPages - page;
        if (distEnd < distStart) {
            const ascIndex = distEnd + 1;
            return await fetchMedicalRecordPageAsc(ascIndex, pageSize);
        }
        return await fetchMedicalRecordPage(page, pageSize);
    } catch (_e) {
        return await fetchMedicalRecordPage(page, pageSize);
    }
}

// ============================================================
// searchKeywords 回填完成旗標 → 關閉病歷搜尋 legacy fallback
// ------------------------------------------------------------
// 歷史 consultations 經 window.backfillConsultationSearchKeywords()
// 全量回填 searchKeywords 後（或管理員手動標記），於 Firestore
// systemMeta/searchKeywordsBackfill 寫入完成旗標，此後病歷搜尋只走
// array-contains（每次約 1～2 次 getDocs），不再執行一輪最多 34 次
// getDocs 的舊邏輯（debounce 300ms 下打字越快讀取越多）。
//
// 單一真相來源在 Firestore（全裝置共用）；客戶端雙層快取控制讀取成本：
//  - 記憶體：本頁生命週期；
//  - localStorage：正面結論快取 24h，負面結論快取 1h（回填完成前
//    避免每次搜尋都多一次 meta getDoc）；異常時 fail-open 走 fallback。
// 若日後修改 generateConsultationSearchKeywords 的詞條邏輯，務必遞增
// SEARCH_KEYWORDS_BACKFILL_VERSION，版本不符視同未回填，自動恢復 fallback。
// ============================================================
const SEARCH_KEYWORDS_BACKFILL_VERSION = 1;
const SEARCH_KEYWORDS_BACKFILL_COLLECTION = 'systemMeta';
const SEARCH_KEYWORDS_BACKFILL_DOC = 'searchKeywordsBackfill';
const SEARCH_KEYWORDS_BACKFILL_LS_KEY = 'sys:searchKeywordsBackfillV1';
const BACKFILL_POSITIVE_CACHE_MS = 24 * 3600 * 1000;
const BACKFILL_NEGATIVE_CACHE_MS = 3600 * 1000;

let _searchKeywordsBackfillComplete = null;

function readSearchKeywordsBackfillCache() {
    try {
        const raw = localStorage.getItem(SEARCH_KEYWORDS_BACKFILL_LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.complete !== 'boolean') return null;
        if (!Number.isFinite(parsed.until) || parsed.until <= Date.now()) return null;
        return parsed.complete;
    } catch (_e) {
        return null;
    }
}

function writeSearchKeywordsBackfillCache(complete, ttlMs) {
    try {
        localStorage.setItem(SEARCH_KEYWORDS_BACKFILL_LS_KEY, JSON.stringify({
            v: SEARCH_KEYWORDS_BACKFILL_VERSION,
            complete,
            until: Date.now() + ttlMs
        }));
    } catch (_e) {}
}

function clearSearchKeywordsBackfillCache() {
    _searchKeywordsBackfillComplete = null;
    try {
        localStorage.removeItem(SEARCH_KEYWORDS_BACKFILL_LS_KEY);
    } catch (_e) {}
}

/**
 * legacy fallback 是否已關閉（＝searchKeywords 回填完成且版本相符）。
 * 失敗時回 false（fail-open：寧可多查也不要讓舊資料搜不到）。
 */
async function isLegacySearchFallbackDisabled() {
    // 記憶體結論（含負面）於本頁生命週期直接信任；同一頁執行回填或
    // 管理員切換旗標時會主動重設此變數，故不會卡住
    if (typeof _searchKeywordsBackfillComplete === 'boolean') {
        return _searchKeywordsBackfillComplete;
    }

    // localStorage 快取（正面 24h／負面 1h）
    const cached = readSearchKeywordsBackfillCache();
    if (typeof cached === 'boolean') {
        _searchKeywordsBackfillComplete = cached;
        return cached;
    }

    try {
        const ref = window.firebase.doc(
            window.firebase.db,
            SEARCH_KEYWORDS_BACKFILL_COLLECTION,
            SEARCH_KEYWORDS_BACKFILL_DOC
        );
        const snap = await window.firebase.getDoc(ref);
        const data = snap.exists() ? snap.data() : null;
        const complete = !!data
            && Number(data.version) === SEARCH_KEYWORDS_BACKFILL_VERSION
            && !!data.completedAt;
        _searchKeywordsBackfillComplete = complete;
        writeSearchKeywordsBackfillCache(
            complete,
            complete ? BACKFILL_POSITIVE_CACHE_MS : BACKFILL_NEGATIVE_CACHE_MS
        );
        return complete;
    } catch (_e) {
        // 網路/權限異常：本輪 fail-open，不寫長期負面快取
        return false;
    }
}

/**
 * 寫入回填完成旗標（systemMeta 規則僅診所管理可寫）。
 * 由 backfill 完成時自動呼叫，亦可由管理員 Console 手動補寫。
 */
async function writeSearchKeywordsBackfillMarker(extra = {}) {
    let completedBy = '';
    try {
        const cur = window.firebase.auth && window.firebase.auth.currentUser
            ? window.firebase.auth.currentUser
            : null;
        completedBy = (cur && (cur.email || cur.uid)) || '';
    } catch (_e) {}
    await window.firebase.setDoc(
        window.firebase.doc(
            window.firebase.db,
            SEARCH_KEYWORDS_BACKFILL_COLLECTION,
            SEARCH_KEYWORDS_BACKFILL_DOC
        ),
        Object.assign({
            version: SEARCH_KEYWORDS_BACKFILL_VERSION,
            completedAt: new Date().toISOString(),
            completedBy
        }, extra)
    );
    _searchKeywordsBackfillComplete = true;
    writeSearchKeywordsBackfillCache(true, BACKFILL_POSITIVE_CACHE_MS);
}

// ============================================================
// sortDate 回填完成旗標 → 關閉「每病人首次全量讀病歷」檢查
// ------------------------------------------------------------
// ensurePatientConsultationSortDates() 原本每個 session 第一次開某病人
// 病歷時，都會無 limit 讀取該病人全部 consultations 核對 sortDate。
// 歷史病歷經 window.backfillConsultationSortDates() 全量回填（或管理員
// 手動標記）後，於 systemMeta/sortDateBackfill 寫入完成旗標，此後該
// 全量核對永久關閉（新病歷儲存時必定自帶 sortDate）。
//
// 快取策略與 searchKeywords 旗標相同：Firestore 為單一真相來源，
// 客戶端記憶體＋localStorage（正面 24h／負面 1h）雙層快取；
// 異常時 fail-open 回 false（寧可多讀，不可令排序錯亂）。
// 若日後修改 sortDate 計算邏輯（getConsultationEffectiveDate），
// 務必遞增 SORT_DATE_BACKFILL_VERSION，版本不符視同未回填。
// ============================================================
const SORT_DATE_BACKFILL_VERSION = 1;
const SORT_DATE_BACKFILL_COLLECTION = 'systemMeta';
const SORT_DATE_BACKFILL_DOC = 'sortDateBackfill';
const SORT_DATE_BACKFILL_LS_KEY = 'sys:sortDateBackfillV1';

let _sortDateBackfillComplete = null;

function readSortDateBackfillCache() {
    try {
        const raw = localStorage.getItem(SORT_DATE_BACKFILL_LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.complete !== 'boolean') return null;
        if (!Number.isFinite(parsed.until) || parsed.until <= Date.now()) return null;
        return parsed.complete;
    } catch (_e) {
        return null;
    }
}

function writeSortDateBackfillCache(complete, ttlMs) {
    try {
        localStorage.setItem(SORT_DATE_BACKFILL_LS_KEY, JSON.stringify({
            v: SORT_DATE_BACKFILL_VERSION,
            complete,
            until: Date.now() + ttlMs
        }));
    } catch (_e) {}
}

function clearSortDateBackfillCache() {
    _sortDateBackfillComplete = null;
    try {
        localStorage.removeItem(SORT_DATE_BACKFILL_LS_KEY);
    } catch (_e) {}
}

/**
 * sortDate 全量回填是否已完成（完成後跳過 per-patient 全量核對）。
 * 失敗時回 false（fail-open：繼續檢查，寧可多讀也不要排序錯亂）。
 */
async function isSortDateBackfillComplete() {
    if (typeof _sortDateBackfillComplete === 'boolean') {
        return _sortDateBackfillComplete;
    }

    const cached = readSortDateBackfillCache();
    if (typeof cached === 'boolean') {
        _sortDateBackfillComplete = cached;
        return cached;
    }

    try {
        const ref = window.firebase.doc(
            window.firebase.db,
            SORT_DATE_BACKFILL_COLLECTION,
            SORT_DATE_BACKFILL_DOC
        );
        const snap = await window.firebase.getDoc(ref);
        const data = snap.exists() ? snap.data() : null;
        const complete = !!data
            && Number(data.version) === SORT_DATE_BACKFILL_VERSION
            && !!data.completedAt;
        _sortDateBackfillComplete = complete;
        writeSortDateBackfillCache(
            complete,
            complete ? BACKFILL_POSITIVE_CACHE_MS : BACKFILL_NEGATIVE_CACHE_MS
        );
        return complete;
    } catch (_e) {
        return false;
    }
}

async function writeSortDateBackfillMarker(extra = {}) {
    let completedBy = '';
    try {
        const cur = window.firebase.auth && window.firebase.auth.currentUser
            ? window.firebase.auth.currentUser
            : null;
        completedBy = (cur && (cur.email || cur.uid)) || '';
    } catch (_e) {}
    await window.firebase.setDoc(
        window.firebase.doc(
            window.firebase.db,
            SORT_DATE_BACKFILL_COLLECTION,
            SORT_DATE_BACKFILL_DOC
        ),
        Object.assign({
            version: SORT_DATE_BACKFILL_VERSION,
            completedAt: new Date().toISOString(),
            completedBy
        }, extra)
    );
    _sortDateBackfillComplete = true;
    writeSortDateBackfillCache(true, BACKFILL_POSITIVE_CACHE_MS);
}

/**
 * 一次性歷史資料回填：掃描所有 consultations，為 sortDate 缺失或
 * 不正確的舊文檔補寫。執行方式（瀏覽器 Console，建議收工後）：
 *   await window.backfillConsultationSortDates()
 * 中斷續跑：await window.backfillConsultationSortDates('lastDocIdFromPrevRun')
 *
 * 全量掃描完成後自動寫入 systemMeta/sortDateBackfill 完成旗標（須診所
 * 管理身份），此後客戶端最遲 24h（重新整理立即）跳過 per-patient
 * 全量核對；非管理員寫入失敗時請管理員補跑
 * await window.markSortDateBackfillComplete()。
 */
window.backfillConsultationSortDates = async function(startAfterDocId = null) {
    await waitForFirebaseDb();
    const PAGE_SIZE = 500;
    const col = window.firebase.collection(window.firebase.db, 'consultations');

    let cursorQuery = window.firebase.firestoreQuery(col, window.firebase.limit(PAGE_SIZE));
    if (startAfterDocId) {
        const startDoc = await window.firebase.getDoc(
            window.firebase.doc(window.firebase.db, 'consultations', startAfterDocId)
        );
        if (startDoc.exists()) {
            cursorQuery = window.firebase.firestoreQuery(
                col,
                window.firebase.startAfter(startDoc),
                window.firebase.limit(PAGE_SIZE)
            );
        } else {
            console.warn('[sortDate-backfill] startAfterDocId 不存在，從頭開始');
        }
    }

    let totalScanned = 0;
    let totalBackfilled = 0;
    let lastProcessedId = null;

    while (true) {
        const snap = await window.firebase.getDocs(cursorQuery);
        const docs = snap.docs;
        if (docs.length === 0) break;

        let batch = window.firebase.writeBatch(window.firebase.db);
        let opCount = 0;
        const commitBatch = async () => {
            if (opCount > 0) {
                await batch.commit();
                batch = window.firebase.writeBatch(window.firebase.db);
                opCount = 0;
            }
        };

        for (const doc of docs) {
            lastProcessedId = doc.id;
            totalScanned++;
            const data = doc.data();
            const computedSortDate = getConsultationEffectiveDate(data, new Date(0));
            const existingSortDate = parseConsultationDate(data.sortDate || null);
            const computedTime = computedSortDate && !isNaN(computedSortDate.getTime())
                ? computedSortDate.getTime() : NaN;
            const existingTime = existingSortDate && !isNaN(existingSortDate.getTime())
                ? existingSortDate.getTime() : NaN;
            if (!Number.isFinite(computedTime) || existingTime === computedTime) {
                continue;
            }
            batch.update(doc.ref, { sortDate: computedSortDate });
            totalBackfilled++;
            opCount++;
            if (opCount >= 400) await commitBatch();
        }
        await commitBatch();

        console.log(`[sortDate-backfill] 掃描 ${totalScanned}，回填 ${totalBackfilled}，最後處理 ${lastProcessedId}`);

        if (docs.length < PAGE_SIZE) break;

        cursorQuery = window.firebase.firestoreQuery(
            col,
            window.firebase.startAfter(docs[docs.length - 1]),
            window.firebase.limit(PAGE_SIZE)
        );
    }

    let markerWritten = false;
    let markerError = '';
    try {
        await writeSortDateBackfillMarker({ totalScanned, totalBackfilled });
        markerWritten = true;
        console.log('[sortDate-backfill] 完成旗標已寫入 systemMeta/sortDateBackfill，per-patient 全量核對已關閉；其他客戶端最遲 24h 內生效（重新整理可立即檢查）');
    } catch (e) {
        markerError = (e && e.message) || String(e);
        console.warn('[sortDate-backfill] 完成旗標寫入失敗（需診所管理身份）：', markerError, '。請管理員執行 await window.markSortDateBackfillComplete() 補寫');
    }

    const result = { totalScanned, totalBackfilled, lastProcessedId, markerWritten, markerError };
    console.log('[sortDate-backfill] 完成', result);
    return result;
};

/**
 * 管理員手動標記 sortDate 回填完成（關閉 per-patient 全量核對）。
 * 用於回填時旗標寫入失敗，或已確定全部病歷皆有正確 sortDate 的情境。
 */
window.markSortDateBackfillComplete = async function(stats = {}) {
    await waitForFirebaseDb();
    await writeSortDateBackfillMarker(stats || {});
    console.log('[sortDate-backfill] 完成旗標已手動寫入，per-patient 全量核對已關閉');
    return { ok: true };
};

/**
 * 管理員手動清除完成旗標（重新開啟 per-patient 全量核對）。
 * 用於發現 sortDate 回填遺漏或日期計算邏輯改動需要重跑時的逃生口。
 * 注意：其他客戶端正面快取最久 24h；本機立即生效。
 */
window.clearSortDateBackfillMarker = async function() {
    await waitForFirebaseDb();
    await window.firebase.deleteDoc(
        window.firebase.doc(
            window.firebase.db,
            SORT_DATE_BACKFILL_COLLECTION,
            SORT_DATE_BACKFILL_DOC
        )
    );
    clearSortDateBackfillCache();
    console.log('[sortDate-backfill] 完成旗標已清除，per-patient 全量核對已重新開啟');
    return { ok: true };
};

async function searchMedicalRecords(term, limitCount = 50) {
    try {
        await waitForFirebaseDb();
        const lc = (term || '').toLowerCase();
        const seen = new Set();
        let out = [];
        if (!lc) return out;

        // ① 快速路徑：輸入剛好是 consultation document ID
        try {
            const dref = window.firebase.doc(window.firebase.db, 'consultations', lc);
            const dsnap = await window.firebase.getDoc(dref);
            if (dsnap && dsnap.exists()) {
                const rec = { id: dsnap.id, ...dsnap.data() };
                out.push(rec);
                seen.add(String(rec.id));
            }
        } catch (_e) {}

        // ② 主力：透過 searchKeywords array-contains 查詢（新資料都有這個欄位）
        try {
            const col = window.firebase.collection(window.firebase.db, 'consultations');
            const q = window.firebase.firestoreQuery(
                col,
                window.firebase.where('searchKeywords', 'array-contains', lc),
                window.firebase.limit(limitCount)
            );
            const snap = await window.firebase.getDocs(q);
            snap.forEach(d => {
                const id = String(d.id);
                if (!seen.has(id)) {
                    out.push({ id: d.id, ...d.data() });
                    seen.add(id);
                }
            });
        } catch (_e) {}

        // ③ 回退：如果 searchKeywords 沒結果（舊資料沒有這個欄位），
        // 用舊邏輯補查。回填完成旗標寫入後此路徑關閉（一輪最多 34 次
        // getDocs，debounce 下成本過高），只走 array-contains。
        if (out.length < limitCount) {
            let fallbackDisabled = false;
            try {
                fallbackDisabled = await isLegacySearchFallbackDisabled();
            } catch (_e) {}
            if (!fallbackDisabled) {
                try {
                    await searchMedicalRecordsLegacy(lc, limitCount, out, seen);
                } catch (_e) {}
            }
        }

        out = out.filter(rec => canCurrentUserViewConsultationEntry(rec));
        try {
            out = sortMedicalRecordsBySortDateDesc(out);
        } catch (_e) {}
        return out;
    } catch (_err) {
        return [];
    }
}

/**
 * 舊版病歷搜尋邏輯。只在 searchKeywords array-contains 無法滿足結果時作為回退使用。
 * 包含：medicalRecordNumber 精確/前綴/大小寫、病人姓名/編號/ID 反查、醫師姓名反查。
 */
async function searchMedicalRecordsLegacy(term, limitCount, out, seen) {
    const termUpper = term.toUpperCase();

    const col = window.firebase.collection(window.firebase.db, 'consultations');

    // medicalRecordNumber 精確（原始 + 大寫）
    for (const exact of [term, termUpper]) {
        if (out.length >= limitCount) break;
        try {
            const q = window.firebase.firestoreQuery(
                col,
                window.firebase.where('medicalRecordNumber', '==', exact),
                window.firebase.limit(Math.max(1, Math.min(20, limitCount - out.length)))
            );
            const snap = await window.firebase.getDocs(q);
            snap.forEach(d => {
                const id = String(d.id);
                if (!seen.has(id) && out.length < limitCount) {
                    out.push({ id: d.id, ...d.data() });
                    seen.add(id);
                }
            });
        } catch (_e) {}
    }

    // medicalRecordNumber 前綴（大寫 + 原始）
    for (const prefix of [termUpper, term]) {
        if (out.length >= limitCount) break;
        try {
            const q = window.firebase.firestoreQuery(
                col,
                window.firebase.orderBy('medicalRecordNumber', 'asc'),
                window.firebase.startAt(prefix),
                window.firebase.endAt(prefix + '\uf8ff'),
                window.firebase.limit(Math.max(1, Math.min(20, limitCount - out.length)))
            );
            const snap = await window.firebase.getDocs(q);
            snap.forEach(d => {
                const id = String(d.id);
                if (!seen.has(id) && out.length < limitCount) {
                    out.push({ id: d.id, ...d.data() });
                    seen.add(id);
                }
            });
        } catch (_e) {}
    }

    // 病人反查（先用 searchPatients 拿到 patientIds）
    let patientIds = [];
    if (out.length < limitCount) {
        try {
            const pres = await (window.firebaseDataManager && typeof window.firebaseDataManager.searchPatients === 'function'
                ? window.firebaseDataManager.searchPatients(term, 10)
                : { success: false, data: [] });
            if (pres && pres.success && Array.isArray(pres.data)) {
                patientIds = pres.data.slice(0, 10).map(p => p.id);
            }
        } catch (_e) {}
        for (const pid of patientIds) {
            if (out.length >= limitCount) break;
            try {
                const q = window.firebase.firestoreQuery(
                    col,
                    window.firebase.where('patientId', '==', pid),
                    window.firebase.limit(Math.max(1, Math.min(10, limitCount - out.length)))
                );
                const snap = await window.firebase.getDocs(q);
                snap.forEach(d => {
                    const id = String(d.id);
                    if (!seen.has(id) && out.length < limitCount) {
                        out.push({ id: d.id, ...d.data() });
                        seen.add(id);
                    }
                });
            } catch (_e) {}
        }
    }

    // 醫師反查
    if (out.length < limitCount) {
        let doctorUsernames = [];
        try {
            const ures = await (window.firebaseDataManager && typeof window.firebaseDataManager.getUsers === 'function'
                ? window.firebaseDataManager.getUsers()
                : { success: false, data: [] });
            const usersArr = (ures && ures.success && Array.isArray(ures.data)) ? ures.data : [];
            const seenUser = new Set();
            usersArr.forEach(u => {
                const fields = [u.displayName, u.fullName, u.name, u.username, u.email].map(x => String(x || '').toLowerCase());
                if (fields.some(v => v && v.includes(term))) {
                    const uname = String(u.username || '').trim();
                    if (uname && !seenUser.has(uname)) {
                        doctorUsernames.push(uname);
                        seenUser.add(uname);
                    }
                }
            });
        } catch (_e) {}
        for (const uname of doctorUsernames.slice(0, 10)) {
            if (out.length >= limitCount) break;
            try {
                // doctor 可能是字串 username
                const qA = window.firebase.firestoreQuery(
                    col,
                    window.firebase.where('doctor', '==', uname),
                    window.firebase.limit(Math.max(1, Math.min(10, limitCount - out.length)))
                );
                const sA = await window.firebase.getDocs(qA);
                sA.forEach(d => {
                    const id = String(d.id);
                    if (!seen.has(id) && out.length < limitCount) {
                        out.push({ id: d.id, ...d.data() });
                        seen.add(id);
                    }
                });
                if (out.length >= limitCount) break;
                // 或 doctor 為物件，取其中 username
                const qB = window.firebase.firestoreQuery(
                    col,
                    window.firebase.where('doctor.username', '==', uname),
                    window.firebase.limit(Math.max(1, Math.min(10, limitCount - out.length)))
                );
                const sB = await window.firebase.getDocs(qB);
                sB.forEach(d => {
                    const id = String(d.id);
                    if (!seen.has(id) && out.length < limitCount) {
                        out.push({ id: d.id, ...d.data() });
                        seen.add(id);
                    }
                });
            } catch (_e) {}
        }
    }
}

 

/**
 * 檢視單筆病歷記錄，顯示於彈窗中。
 * @param {string} recordId 病歷檔案編號
 * @param {HTMLButtonElement|null} buttonEl 觸發按鈕
 */
async function viewMedicalRecord(recordId, buttonEl = null) {
    const loadingButton = buttonEl || null;
    const modal = document.getElementById('medicalRecordDetailModal');
    const content = document.getElementById('medicalRecordDetailContent');

    // 先顯示 modal 與讀取圈
    if (content) {
        content.innerHTML = `
            <div class="text-center py-12">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <div class="mt-2 text-sm text-gray-600">載入病歷中...</div>
            </div>
        `;
    }
    if (modal) modal.classList.remove('hidden');

    try {
        if (loadingButton) {
            setButtonLoading(loadingButton, '讀取中...');
        }
        let rec = null;
        if (window.firebaseDataManager && typeof window.firebaseDataManager.getConsultationById === 'function') {
            const singleRes = await window.firebaseDataManager.getConsultationById(String(recordId), true);
            if (singleRes && singleRes.success && singleRes.data) {
                rec = singleRes.data;
            }
        }
        if (!rec) {
            showToast('找不到病歷記錄', 'error');
            return;
        }
        if (!canCurrentUserViewConsultationEntry(rec)) {
            showToast('您沒有查看此病歷的權限！', 'error');
            return;
        }
        try {
            const patientId = rec && rec.patientId !== undefined && rec.patientId !== null ? String(rec.patientId).trim() : '';
            const patientName = rec && rec.patientName ? String(rec.patientName).trim() : '';
            if (patientId && patientName && !medicalRecordPatients[patientId]) {
                medicalRecordPatients[patientId] = patientName;
            }
        } catch (_lookupErr) {}
        // 取得語言與地區設定，預設為中文
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        const locale = lang === 'en' ? 'en-US' : 'zh-TW';
        // 取得翻譯字典，以便後續標籤可根據語言顯示
        const dict = (window.translations && window.translations[lang]) ? window.translations[lang] : {};
        // 取得醫師名稱，優先透過 getDoctorDisplayName 轉換用戶名稱
        let doctorName = '';
        if (rec.doctor) {
            try {
                if (typeof rec.doctor === 'string') {
                    doctorName = typeof getDoctorDisplayName === 'function'
                        ? getDoctorDisplayName(rec.doctor) : rec.doctor;
                } else if (rec.doctor.username) {
                    doctorName = typeof getDoctorDisplayName === 'function'
                        ? getDoctorDisplayName(rec.doctor.username) : (rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '');
                } else {
                    doctorName = rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '';
                }
            } catch (_err) {
                doctorName = rec.doctor.displayName || rec.doctor.name || rec.doctor.fullName || rec.doctor.email || '';
            }
        }
        const hideDoctorInfo = shouldHideGeneralRegistrationDoctorInfo(rec, null);
        if (hideDoctorInfo) {
            doctorName = '';
        }
        // 解析日期與時間，並組合為完整字串
        const rawDate = rec.date || rec.createdAt || rec.updatedAt || null;
        let dateTimeStr = '日期未知';
        try {
            const parsed = parseConsultationDate(rawDate);
            if (parsed && !isNaN(parsed.getTime())) {
                const datePart = parsed.toLocaleDateString(locale);
                const timePart = parsed.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                dateTimeStr = datePart + ' ' + timePart;
            }
        } catch (_e) {}
        // 準備醫師與病歷編號標籤（含冒號），如果翻譯存在則使用翻譯
        const doctorLabel = dict['醫師：'] || '醫師：';
        const recordNumberLabel = dict['病歷編號：'] || '病歷編號：';
        const clinicLabel = dict['診所：'] || '診所：';
        const generalRegistrationBadge = isGeneralRegistrationConsultation(rec)
            ? `<span class="text-sm text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-100 shadow-sm">${window.escapeHtml(getGeneralRegistrationSourceLabel(String(lang).toLowerCase().startsWith('en')))}</span>`
            : '';
        // 組合詳細內容的 HTML，使用與病人病歷查看一致的卡片樣式
        // 預先建立含餘下套票次數的收費項目 HTML（與收據顯示一致）
        const billingItemsDisplayHtml = await buildConsultationBillingDisplayHtml(
            rec,
            rec && rec.patientId !== undefined && rec.patientId !== null ? String(rec.patientId) : ''
        );
        // 判斷本次診症是否有開藥；沒有開藥時隱藏處方內容與服用方法欄位
        const hasPrescription = consultationHasPrescription(rec);
        // 病歷是否曾被實質修改（以審核日誌為準）：驅動「已修改」標籤與「審核追蹤」按鈕；
        // 不能用 rec.updatedAt（新建病歷與錢包收款都會更新它）
        const recIsModified = await fetchMedicalRecordEdited(rec);
        let detailHtml = '';
        detailHtml += '<div class="border border-gray-200 rounded-lg overflow-hidden shadow-sm">';
        // Header 區塊
        detailHtml += '<div class="bg-linear-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200">';
        detailHtml += '<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">';
        // 左側日期與表列（分兩行）
        detailHtml += '<div class="flex flex-col space-y-2">';
        detailHtml += `<span class="font-semibold text-gray-900 text-lg">${window.escapeHtml(dateTimeStr)}</span>`;
            // 第二行表列包含醫師、病歷編號與診所
            (function () {
                // 取得診所顯示名稱
                let clinicName = '';
                try {
                    if (rec.clinicName) {
                        clinicName = rec.clinicName;
                    } else if (rec.clinicId) {
                        const foundClinic = Array.isArray(clinicsList) ? clinicsList.find(c => String(c.id) === String(rec.clinicId)) : null;
                        clinicName = foundClinic ? (foundClinic.chineseName || foundClinic.englishName || '') : '';
                    } else {
                        clinicName = '';
                    }
                } catch (_e) {
                    clinicName = '';
                }
                const row = [
                    generalRegistrationBadge,
                    hideDoctorInfo ? '' : `<span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">${window.escapeHtml(doctorLabel)}${window.escapeHtml(doctorName)}</span>`,
                    `<span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">${window.escapeHtml(recordNumberLabel)}${window.escapeHtml(rec.medicalRecordNumber || rec.id)}</span>`,
                    `<span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-white/80 shadow-sm">${window.escapeHtml(clinicLabel)}${window.escapeHtml(clinicName || '未設定')}</span>`,
                    recIsModified ? '<span class="text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-100">已修改</span>' : ''
                ].join('');
                detailHtml += `<div class="flex flex-wrap items-center gap-2">${row}</div>`;
            })();
        detailHtml += '</div>'; // 關閉左側信息（兩行）
        // 右側按鈕
        detailHtml += '<div class="medical-history-actions">';
        detailHtml += renderMedicalHistoryActionButtons(rec, { includeSickLeave: true, isModified: recIsModified });
        detailHtml += '</div>'; // 按鈕區塊結束
        detailHtml += '</div>'; // flex 容器結束
        detailHtml += '</div>'; // header 結束
        // 內容區塊
        detailHtml += '<div class="p-6">';
        detailHtml += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">';
        // 左欄：症狀與診斷
        detailHtml += '<div class="space-y-4">';
        // 主訴
        detailHtml += '<div>';
        detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">主訴</span>';
        detailHtml += `<div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${rec.symptoms ? window.escapeHtml(rec.symptoms) : '無記錄'}</div>`;
        detailHtml += '</div>';
        // 現病史
        if (rec.currentHistory) {
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">現病史</span>';
            detailHtml += `<div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(rec.currentHistory)}</div>`;
            detailHtml += '</div>';
        }
        // 舌象
        if (rec.tongue) {
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">舌象</span>';
            detailHtml += `<div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(rec.tongue)}</div>`;
            detailHtml += '</div>';
        }
        // 脈象
        if (rec.pulse) {
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">脈象</span>';
            detailHtml += `<div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(rec.pulse)}</div>`;
            detailHtml += '</div>';
        }
        // 中醫診斷
        detailHtml += '<div>';
        detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">中醫診斷</span>';
        detailHtml += `<div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 medical-field">${rec.diagnosis ? window.escapeHtml(rec.diagnosis) : '無記錄'}</div>`;
        detailHtml += '</div>';
        // 證型診斷
        detailHtml += '<div>';
        detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">證型診斷</span>';
        detailHtml += `<div class="bg-blue-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-blue-400 medical-field">${rec.syndrome ? window.escapeHtml(rec.syndrome) : '無記錄'}</div>`;
        detailHtml += '</div>';
        // 針灸備註
        if (rec.acupunctureNotes) {
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">針灸備註</span>';
            detailHtml += `<div class="bg-orange-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-orange-400 medical-field">${window.escapeHtml(window.stripHtmlTags(rec.acupunctureNotes))}</div>`;
            detailHtml += '</div>';
        }
        detailHtml += '</div>'; // 左欄結束
        // 右欄：處方與用法
        detailHtml += '<div class="space-y-4">';
        // 處方內容（沒有開藥時整欄隱藏）
        if (hasPrescription) {
        detailHtml += '<div>';
        detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">處方內容</span>';
        (function () {
            let prescriptionHtml = '無記錄';
            try {
                if (rec.multiPrescriptions) {
                    const mp = JSON.parse(rec.multiPrescriptions);
                    if (Array.isArray(mp) && mp.length > 0) {
                        const showNames = mp.length > 1;
                        let html = '';
                        mp.forEach((section, sIdx) => {
                            const secName = section && section.name ? section.name : `處方${sIdx + 1}`;
                            const items = Array.isArray(section && section.items) ? section.items : [];
                            const lines = items.map(it => {
                                const dose = it.customDosage || (it.type === 'herb' ? '1' : '5');
                                const unit = (it && it.dosage && typeof it.dosage === 'string' && it.dosage.endsWith('g')) ? 'g' : 'g';
                                return `<div style="margin-bottom: 4px;">${window.escapeHtml(it.name)} ${window.escapeHtml(String(dose))}${unit}</div>`;
                            });
                            const modeLabel = (section && section.mode === 'granule') ? '顆粒沖劑' : ((section && section.mode === 'slice') ? '飲片' : '');
                            const nameWithMode = showNames ? `<div style="font-weight:bold;margin-bottom:2px;">${window.escapeHtml(secName)}${modeLabel ? `<span style="font-size:0.5em;">（${window.escapeHtml(modeLabel)}）</span>` : ''}</div>` : '';
                            html += `<div style="margin-bottom:6px;">${nameWithMode}${lines.join('')}</div>`;
                        });
                        prescriptionHtml = html;
                    }
                } else if (rec.prescription) {
                    prescriptionHtml = window.escapeHtml(rec.prescription).replace(/\n/g, '<br>');
                }
            } catch (_e) {
                prescriptionHtml = rec.prescription ? window.escapeHtml(rec.prescription).replace(/\n/g, '<br>') : '無記錄';
            }
            detailHtml += `<div class="bg-yellow-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-yellow-400 medical-field">${prescriptionHtml}</div>`;
        })();
        detailHtml += '</div>';
        }
        // 服用方法（含各處方天數與次數；沒有開藥時整欄隱藏）
        (function () {
            if (!hasPrescription) return;
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">服用方法</span>';
            let medInfoHtml = '';
            try {
                if (rec.multiPrescriptions) {
                    const mp = JSON.parse(rec.multiPrescriptions);
                    if (Array.isArray(mp) && mp.length > 0) {
                        const showNames = mp.length > 1;
                        const lines = mp.map((section, idx) => {
                            const secName = section && section.name ? section.name : `處方${idx + 1}`;
                            const d = parseInt(section && section.days) || 0;
                            const f = parseInt(section && section.freq) || (parseInt(rec.medicationFrequency) || 0);
                            const partDays = d > 0 ? `服藥天數：${d}天` : '';
                            const partFreq = f > 0 ? `每日次數：${f}次` : '';
                            const combined = [partDays, partFreq].filter(Boolean).join('　');
                            return combined ? `${showNames ? (secName + '：') : ''}${combined}` : '';
                        }).filter(Boolean);
                        if (lines.length > 0) {
                            medInfoHtml += lines.map(l => `<div>${window.escapeHtml(l)}</div>`).join('');
                        }
                    }
                } else {
                    const parts = [];
                    if (rec.medicationDays && Number(rec.medicationDays) > 0) {
                        parts.push('服藥天數：' + rec.medicationDays + '天');
                    }
                    if (rec.medicationFrequency && Number(rec.medicationFrequency) > 0) {
                        parts.push('每日次數：' + rec.medicationFrequency + '次');
                    }
                    if (parts.length > 0) {
                        medInfoHtml += `<div>${window.escapeHtml(parts.join('　'))}</div>`;
                    }
                }
            } catch (_e) {}
            if (rec.usage) {
                medInfoHtml += `<div>${window.escapeHtml(rec.usage)}</div>`;
            }
            detailHtml += `<div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${medInfoHtml || '無記錄'}</div>`;
            detailHtml += '</div>';
        })();
        // 療程
        if (rec.treatmentCourse) {
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">療程</span>';
            detailHtml += `<div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${window.escapeHtml(rec.treatmentCourse)}</div>`;
            detailHtml += '</div>';
        }
        // 醫囑及注意事項
        if (rec.instructions) {
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">醫囑及注意事項</span>';
            detailHtml += `<div class="bg-red-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-red-400 medical-field">${window.escapeHtml(rec.instructions)}</div>`;
            detailHtml += '</div>';
        }
        // 複診時間
        if (rec.followUpDate) {
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">複診時間</span>';
            try {
                const followDate = new Date(rec.followUpDate);
                detailHtml += `<div class="bg-purple-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-purple-400 medical-field">${followDate.toLocaleString(locale)}</div>`;
            } catch (_err) {
                detailHtml += `<div class="bg-purple-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-purple-400 medical-field">${window.escapeHtml(rec.followUpDate)}</div>`;
            }
            detailHtml += '</div>';
        }
        // 收費項目
        if (billingItemsDisplayHtml) {
            detailHtml += '<div>';
            detailHtml += '<span class="text-sm font-semibold text-gray-700 block mb-2">收費項目</span>';
            detailHtml += `<div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 whitespace-pre-line medical-field">${billingItemsDisplayHtml}</div>`;
            detailHtml += '</div>';
        }
        detailHtml += '</div>'; // 右欄結束
        detailHtml += '</div>'; // grid 結束
        detailHtml += '</div>'; // p-6 結束
        detailHtml += '</div>'; // 卡片容器結束
        // 將內容插入彈窗（modal 已在函式開頭顯示）
        if (content) {
            content.innerHTML = detailHtml;
        }
    } catch (error) {
        console.error('檢視病歷記錄錯誤:', error);
        showToast('讀取病歷失敗', 'error');
        if (modal) modal.classList.add('hidden');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

/**
 * 關閉病歷詳細資訊彈窗。
 */
function closeMedicalRecordDetail() {
    const modal = document.getElementById('medicalRecordDetailModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * 顯示刪除病歷確認對話框並執行刪除。
 * 將提示訊息根據當前語言翻譯，避免使用者誤操作。
 * @param {string} recordId - 要刪除的病歷記錄 ID
 * @param {string} patientName - 病人名稱，用於提示中顯示
 * @param {HTMLButtonElement|null} buttonEl - 觸發按鈕
 */
async function confirmDeleteMedicalRecord(recordId, patientName, buttonEl = null) {
    if (!hasActionPermission('medicalRecordDelete')) {
        showToast('權限不足，無法刪除病歷', 'error');
        return;
    }
    const loadingButton = buttonEl || null;
    try {
        if (loadingButton) {
            setButtonLoading(loadingButton, '刪除中...');
        }
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        let message;
        if (lang === 'en') {
            message = `Are you sure you want to delete the record for ${patientName} (ID: ${recordId})?\nThis action cannot be undone.`;
        } else {
            // 中文提示
            message = `確定要刪除病歷「${patientName} - ${recordId}」嗎？\n此動作無法恢復！`;
        }
        const confirmed = await showConfirmation(message, 'warning');
        if (!confirmed) {
            if (loadingButton) {
                clearButtonLoading(loadingButton);
            }
            return;
        }
        await deleteMedicalRecord(recordId, loadingButton);
    } catch (_err) {
        try {
            await deleteMedicalRecord(recordId, loadingButton);
        } catch (_deleteErr) {
            if (loadingButton) {
                clearButtonLoading(loadingButton);
            }
        }
    }
}

/**
 * 刪除指定病歷，從 Firebase 的 consultations 集合中移除並更新本地列表。
 * 如 Firebase DataManager 提供 deleteConsultation 功能，則優先使用；
 * 若無則直接調用 firebase.deleteDoc。
 * @param {string} recordId - 要刪除的病歷記錄 ID
 * @param {HTMLButtonElement|null} buttonEl - 觸發按鈕
 */
async function deleteMedicalRecord(recordId, buttonEl = null) {
    if (!hasActionPermission('medicalRecordDelete')) {
        showToast('權限不足，無法刪除病歷', 'error');
        return;
    }
    const loadingButton = buttonEl || null;
    try {
        if (loadingButton && !loadingButton.disabled) {
            setButtonLoading(loadingButton, '刪除中...');
        }
        // 如果 firebaseDataManager 提供刪除診症紀錄的方法，優先使用
        let deleted = false;
        if (window.firebaseDataManager && typeof window.firebaseDataManager.deleteConsultation === 'function') {
            const result = await window.firebaseDataManager.deleteConsultation(recordId);
            if (result && result.success) {
                deleted = true;
            }
        }
        // 如果 deleteConsultation 沒有成功或不存在，嘗試直接調用 firebase.deleteDoc
        if (!deleted && window.firebase && window.firebase.deleteDoc && window.firebase.doc && window.firebase.db) {
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'consultations', recordId)
            );
            deleted = true;
        }
        if (!deleted) {
            throw new Error('Delete function not available');
        }
        // 清除 patientConsultationsCache 內相關快取
        try {
            if (typeof patientConsultationsCache !== 'undefined' && patientConsultationsCache && typeof patientConsultationsCache === 'object') {
                Object.keys(patientConsultationsCache).forEach(pid => {
                    const arr = patientConsultationsCache[pid];
                    if (Array.isArray(arr)) {
                        patientConsultationsCache[pid] = arr.filter(rec => String(rec.id) !== String(recordId));
                    }
                });
            }
        } catch (_cacheErr) {
            // 忽略快取更新錯誤
        }
        // 清除 consultationsCache 以避免下次從快取讀取已刪除的記錄
        try {
            if (window.firebaseDataManager && typeof window.firebaseDataManager.consultationsCache !== 'undefined') {
                window.firebaseDataManager.consultationsCache = null;
            }
            // 移除 localStorage 中的 consultations 項目
            try {
                localStorage.removeItem('consultations');
            } catch (_lsErr) {
                // 忽略 localStorage 錯誤
            }
            try {
                if (typeof localStorage !== 'undefined') {
                    const keys = Object.keys(localStorage);
                    for (const k of keys) {
                        if (k && k.indexOf('patientConsultations:') === 0) {
                            try { localStorage.removeItem(k); } catch (_e) {}
                        }
                    }
                }
            } catch (_err) {}
        } catch (_err) {
            // 忽略錯誤
        }
        // 重新計算總數並清除頁面快取
        medicalRecordPageCache = {};
        medicalRecordPageCursors = {};
        medicalRecordSearchCache = {};
        if (typeof medicalRecordTotalCount === 'number' && medicalRecordTotalCount > 0) {
            medicalRecordTotalCount -= 1;
        }
        await displayMedicalRecords(false);
        // 顯示提示
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        showToast(lang === 'en' ? 'Record deleted' : '病歷已刪除', 'success');
    } catch (error) {
        console.error('刪除病歷記錄失敗:', error);
        const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
        showToast(lang === 'en' ? 'Failed to delete record' : '刪除病歷失敗', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

// 為 HTML 內使用的函式建立全域引用。
// 這些函式會被 HTML 屬性（例如 onclick、onkeypress）呼叫，若不掛在 window 上，瀏覽器會找不到對應函式。
(function() {
  window.attemptMainLogin = attemptMainLogin;
  window.cancelConsultation = cancelConsultation;
  // 將取消候診函式掛載至全域，供 HTML 內的 onclick 調用
  window.cancelWaiting = cancelWaiting;
  window.clearBillingSearch = clearBillingSearch;
  window.clearPatientSearch = clearPatientSearch;
  window.clearPrescriptionSearch = clearPrescriptionSearch;
  window.closePatientDetail = closePatientDetail;
  window.closePatientMedicalHistoryModal = closePatientMedicalHistoryModal;
  window.closeRegistrationModal = closeRegistrationModal;
  window.confirmRegistration = confirmRegistration;
  window.exportFinancialReportTxt = exportFinancialReportTxt;
  window.exportFinancialReportExcel = exportFinancialReportExcel;
  // 向下相容：舊呼叫仍預設匯出 TXT
  window.exportFinancialReport = exportFinancialReportTxt;
  window.hideAddClinicModal = hideAddClinicModal;
  window.saveNewClinic = saveNewClinic;
  window.saveSystemManagementClinicOptions = saveSystemManagementClinicOptions;
  window.triggerBackupImport = triggerBackupImport;
  window.handleBackupFile = handleBackupFile;

  // 數據匯入相關函式
  window.triggerTemplateImport = triggerTemplateImport;
  window.handleTemplateImportFile = handleTemplateImportFile;
  window.triggerHerbImport = triggerHerbImport;
  window.handleHerbImportFile = handleHerbImportFile;

  // 預留 isCombinedImportMode 旗標為 false，以維持既有匯入流程的邏輯判斷
  window.isCombinedImportMode = false;

  /**
   * 安全地轉義使用者提供的字串，用於避免 XSS 攻擊。
   * 將特殊字元替換為 HTML 實體，確保不會被當成 HTML 插入。
   * @param {any} str 可能包含 HTML 的字串或其他型別
   * @returns {string} 轉義後的字串
   */
  window.escapeHtml = function(str) {
    // 對於 null 或 undefined 直接轉為空字串
    const s = String(str == null ? '' : str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  /**
   * 針灸備註（contenteditable）專用白名單淨化，防範 Stored XSS。
   * ------------------------------------------------------------
   * 針灸備註以 HTML 格式儲存，合法內容只有三種：
   *   1. 純文字節點（醫師輸入的備註）
   *   2. <br> 換行
   *   3. 系統產生的穴位方塊 <span data-acupoint-name>（見 addAcupointToNotes）
   * 穴位方塊一律以 DOM API 重建，只保留固定的 class 與白名單屬性；
   * 其他任何元素（img/svg/script/樣式標籤/on* 事件等）整個解構，
   * 僅保留其文字子節點。來源 HTML 只在脫離文件的容器中解析，
   * 不會掛載到 DOM，故不會觸發資源載入或事件。
   * 儲存前與載入時都呼叫此函式：儲存前擋下新輸入，載入時中立化
   * 已存在於歷史病歷中的攻擊內容（縱深防禦）。
   * @param {string} html 未受信任的針灸備註 HTML
   * @returns {string} 淨化後的安全 HTML
   */
  // 手寫白名單實作：改為內部函式，作為 DOMPurify 之後的第二道關卡與 fail-open 備援
  function legacySanitizeAcupunctureNotesHtml(source) {
    if (!source) return '';
    // 穴位方塊的固定樣式（與 addAcupointToNotes 保持一致）
    const ACU_SPAN_CLASS = 'inline-flex items-center justify-center bg-blue-100 border border-blue-200 rounded text-sm text-blue-800 px-1 py-0.5 mr-1 cursor-pointer';
    // data-tooltip 只接受 encodeURIComponent 產生的字元集
    const TOOLTIP_RE = /^[A-Za-z0-9\-_.!~*'()%]{0,4000}$/;
    const NAME_RE = /^[\s\S]{1,100}$/;

    /**
     * 以白名單遞迴複製節點；不容許的元素只保留其文字內容。
     * @returns {Node|null}
     */
    function cloneSafe(node) {
      if (node.nodeType === 3) { // Node.TEXT_NODE
        return document.createTextNode(node.nodeValue || '');
      }
      if (node.nodeType !== 1) { // 非元素節點（註解等）一律丟棄
        return null;
      }
      const tag = node.tagName;
      if (tag === 'BR') {
        return document.createElement('br');
      }
      if (tag === 'SPAN' && node.hasAttribute && node.hasAttribute('data-acupoint-name')) {
        const name = String(node.getAttribute('data-acupoint-name') || '');
        if (!NAME_RE.test(name)) return null;
        const span = document.createElement('span');
        span.className = ACU_SPAN_CLASS;
        span.setAttribute('contenteditable', 'false');
        // 以 setAttribute 寫入的屬性值是純資料，不會被解析為標記或事件
        span.setAttribute('data-acupoint-name', name);
        const tooltip = node.getAttribute('data-tooltip');
        if (tooltip && TOOLTIP_RE.test(tooltip)) {
          span.setAttribute('data-tooltip', tooltip);
        }
        span.textContent = name;
        return span;
      }
      // 其他元素（b/font/div 等）：解構元素本身，保留其子內容
      const frag = document.createDocumentFragment();
      const children = node.childNodes || [];
      for (let i = 0; i < children.length; i++) {
        const safeChild = cloneSafe(children[i]);
        if (safeChild) frag.appendChild(safeChild);
      }
      return frag;
    }

    let src;
    try {
      // 脫離文件的容器：不插入 document，img 等不會開始載入、事件不會觸發
      src = document.createElement('div');
      src.innerHTML = source;
      const out = document.createElement('div');
      const children = src.childNodes;
      for (let i = 0; i < children.length; i++) {
        const safeNode = cloneSafe(children[i]);
        if (safeNode) out.appendChild(safeNode);
      }
      return out.innerHTML;
    } catch (_e) {
      // 任何異常一律 fail-closed：回傳全跳脫純文字（渲染時只顯示字面內容）
      try {
        const fallback = document.createElement('div');
        fallback.textContent = source;
        return fallback.innerHTML;
      } catch (_e2) {
        return '';
      }
    }
  }

  /**
   * 針灸備註淨化入口：第一層交由 DOMPurify（持續維護的 XSS 特徵庫）
   * 中立化所有非白名單標記／事件／危險協定，第二層再交既有手寫白名單
   * 遞迴重建，外部行為與正規化結果與舊版完全一致；DOMPurify 缺失或
   * 例外時無縫退回手寫實作（fail-open 到同等嚴格的防護，不是不設防）。
   * @param {string} html 未受信任的針灸備註 HTML
   * @returns {string} 淨化後的安全 HTML
   */
  window.sanitizeAcupunctureNotesHtml = function (html) {
    const source = String(html == null ? '' : html);
    if (!source) return '';
    if (window.DOMPurify) {
      try {
        const pre = window.DOMPurify.sanitize(source, {
          ALLOWED_TAGS: ['br', 'span'],
          ALLOWED_ATTR: ['data-acupoint-name', 'data-tooltip', 'class', 'contenteditable'],
          ALLOW_DATA_ATTR: false,
          KEEP_CONTENT: true
        });
        return legacySanitizeAcupunctureNotesHtml(pre);
      } catch (_e) { /* 例外時退回手寫實作 */ }
    }
    return legacySanitizeAcupunctureNotesHtml(source);
  };

  /**
   * 列印文件專用的 HTML 防護：以非執行的 DOMParser 解析整份列印 HTML，
   * 移除 script 等危險元素與所有 on* 事件屬性、javascript: URL，
   * 再交給 printWindow.document.write。可攔截所有殘留於資料插值中的
   * Stored XSS（病人姓名、診斷、診所資料等），同時保留排版用標籤與樣式。
   * @param {string} html 將要寫入列印視窗的完整 HTML
   * @returns {string} 淨化後的 HTML
   */
  // 手寫 DOMParser 黑名單實作：改為內部函式，作為 DOMPurify 版的 fail-open 備援
  function legacySanitizePrintHtml(source) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(source, 'text/html');
    } catch (_e) {
      // 無法解析時退回全字串跳脫，寧願失去排版也不執行內嵌內容
      return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre>' +
        window.escapeHtml(source) + '</pre></body></html>';
    }

    // script/iframe/object 等可執行或載入外部內容的標籤一律移除
    const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'applet', 'base', 'form', 'link'];
    DANGEROUS_TAGS.forEach(function (tag) {
      doc.querySelectorAll(tag).forEach(function (node) { node.remove(); });
    });
    // <meta http-equiv="refresh" content="0;url=javascript:..."> 之於
    // 舊式跳轉/腳本執行；charset 之類的良性 meta 保留
    doc.querySelectorAll('meta[http-equiv]').forEach(function (node) { node.remove(); });

    const DANGEROUS_URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'poster', 'background', 'formaction', 'cite', 'longdesc', 'manifest']);
    // 正規化 URL：移除所有控制字元（含 tab/LS/PS/soft hyphen/BOM），
    // 抵擋「java&#x09;script:」「java\nscript:」這類以空白字元混淆的 scheme
    const CTRL_CHARS_RE = /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g;
    const isDangerousUrl = function (raw) {
      const v = String(raw == null ? '' : raw).replace(CTRL_CHARS_RE, '').toLowerCase();
      if (/^(javascript|vbscript|livescript|file|data:text\/html|mocha):/.test(v)) return true;
      // data: 只允許圖片，其餘（如 data:image/svg+xml 內藏 script 也不應出現於列印）封鎖
      if (/^data:(?!image\/(png|jpeg|jpg|gif|webp|bmp);)/i.test(v)) return true;
      return false;
    };
    const allElements = doc.querySelectorAll('*');
    Array.prototype.forEach.call(allElements, function (el) {
      const attrs = Array.prototype.slice.call(el.attributes);
      attrs.forEach(function (attr) {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '');
        if (name.indexOf('on') === 0) {
          el.removeAttribute(attr.name);
        } else if (DANGEROUS_URL_ATTRS.has(name) && isDangerousUrl(value)) {
          el.removeAttribute(attr.name);
        }
      });
      // srcdoc 可內嵌完整文件（含 script），不應出現於列印
      if (el.hasAttribute && el.hasAttribute('srcdoc')) el.removeAttribute('srcdoc');
    });

    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  /**
   * 列印文件淨化入口：以 DOMPurify 為底層（WHOLE_DOCUMENT 保留完整排版），
   * 危險標籤／srcdoc 走 FORBID 設定，on* 事件由 DOMPurify 內建移除；
   * 另以掛鈎逐條保留舊版自訂加強：meta[http-equiv] 整節移除、URL 屬性
   * 先做控制字元正規化再比對危險協定（含 data: 僅允許圖片）。
   * 掛鈎在呼叫前註冊、呼叫後立刻移除，避免污染全域 DOMPurify singleton。
   * DOMPurify 缺失或例外時無縫退回手寫 DOMParser 版本。
   * @param {string} html 將要寫入列印視窗的完整 HTML
   * @returns {string} 淨化後的 HTML
   */
  window.sanitizePrintHtml = function (html) {
    const source = String(html == null ? '' : html);
    const D = window.DOMPurify;
    if (D) {
      try {
        // 與舊版完全相同的控制字元集合與危險協定判斷
        const CTRL_RE = /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g;
        const isDangerousUrl = function (raw) {
          const v = String(raw == null ? '' : raw).replace(CTRL_RE, '').toLowerCase();
          if (/^(javascript|vbscript|livescript|file|data:text\/html|mocha):/.test(v)) return true;
          if (/^data:(?!image\/(png|jpeg|jpg|gif|webp|bmp);)/i.test(v)) return true;
          return false;
        };
        const URL_ATTRS = { href: 1, src: 1, 'xlink:href': 1, poster: 1, background: 1, formaction: 1, cite: 1, longdesc: 1, manifest: 1 };
        const onMetaHook = function (node) {
          if (node.nodeType === 1 && node.nodeName === 'META' && node.hasAttribute('http-equiv')) {
            this.forceRemove(node);
          }
        };
        const onAttrHook = function (_node, data) {
          if (data && URL_ATTRS[String(data.attrName).toLowerCase()] && isDangerousUrl(data.attrValue)) {
            data.keepAttr = false;
          }
        };
        D.addHook('beforeSanitizeElements', onMetaHook);
        D.addHook('uponSanitizeAttribute', onAttrHook);
        let clean;
        try {
          clean = D.sanitize(source, {
            WHOLE_DOCUMENT: true,
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'applet', 'base', 'form', 'link'],
            FORBID_ATTR: ['srcdoc']
          });
        } finally {
          D.removeHook('beforeSanitizeElements', onMetaHook);
          D.removeHook('uponSanitizeAttribute', onAttrHook);
        }
        // DOMPurify 可能自行加上 doctype，先移除再補上本系統固定版本
        return '<!DOCTYPE html>\n' + String(clean).replace(/^\s*<!DOCTYPE[^>]*>/i, '');
      } catch (_e) { /* 例外時退回手寫實作 */ }
    }
    return legacySanitizePrintHtml(source);
  };

  // ============================================================
  // 會員儲值（wallet）模組已遷移至 js/domains/wallet/（Phase 2）
  // 27 個錢包函式由 js/app.js 以同名掛回 window，HTML inline handler 不變。
  // ============================================================

  window.filterBillingItems = filterBillingItems;
  window.filterHerbLibrary = filterHerbLibrary;
  window.filterUsers = filterUsers;
  window.generateFinancialReport = generateFinancialReport;
  window.scheduleFinancialReportRefresh = scheduleFinancialReportRefresh;
  window.hideAddBillingItemForm = hideAddBillingItemForm;
  window.hideAddFormulaForm = hideAddFormulaForm;
  window.hideAddHerbForm = hideAddHerbForm;
  window.hideAddPatientForm = hideAddPatientForm;
  window.hideAddUserForm = hideAddUserForm;
  window.hideClinicSettingsModal = hideClinicSettingsModal;
  window.loadPreviousBillingItems = loadPreviousBillingItems;
  window.loadPreviousPrescription = loadPreviousPrescription;
  window.logout = logout;
  window.refreshPatientPackagesUI = refreshPatientPackagesUI;
  window.createManualPatientPackage = createManualPatientPackage;
  window.updatePatientPackageExpiry = updatePatientPackageExpiry;
  window.updatePatientPackageRemainingUses = updatePatientPackageRemainingUses;
  window.deletePatientPackageRecord = deletePatientPackageRecord;
  window.openWalletManagementForPatient = openWalletManagementForPatient;
  window.saveBillingItem = saveBillingItem;
  window.saveClinicSettings = saveClinicSettings;
  window.saveReceiptCustomizationSettings = saveReceiptCustomizationSettings;
  window.saveConsultation = saveConsultation;
  window.openConsultationAuditTrail = openConsultationAuditTrail;
  window.closeConsultationAuditTrail = closeConsultationAuditTrail;
  window.toggleAuditDetail = toggleAuditDetail;
  window.saveFormula = saveFormula;
  window.saveHerb = saveHerb;
  window.savePatient = savePatient;
  window.saveSelectedPositionPermissions = saveSelectedPositionPermissions;
  window.saveUser = saveUser;
  window.searchBillingForConsultation = searchBillingForConsultation;
  window.searchHerbsForPrescription = searchHerbsForPrescription;
  window.searchPatientsForRegistration = searchPatientsForRegistration;
  window.setQuickDate = setQuickDate;
  window.showAddBillingItemForm = showAddBillingItemForm;
  window.showAddFormulaForm = showAddFormulaForm;
  window.showAddHerbForm = showAddHerbForm;
  window.showAddPatientForm = showAddPatientForm;
  window.showAddUserForm = showAddUserForm;
  window.showClinicSettingsModal = showClinicSettingsModal;
  window.onPermissionPositionChanged = onPermissionPositionChanged;
  window.switchFinancialTab = switchFinancialTab;
  window.toggleRegistrationNumberField = toggleRegistrationNumberField;
  window.toggleSidebar = toggleSidebar;
  window.updateMedicationDays = updateMedicationDays;
  window.updateMedicationDaysFromInput = updateMedicationDaysFromInput;
  window.updateMedicationFrequency = updateMedicationFrequency;
  window.updatePatientAge = updatePatientAge;
  // 將個人慣用組合的渲染函式公開至全域，方便在搜尋或分類變更時呼叫
  window.renderHerbCombinations = renderHerbCombinations;
  window.renderAcupointCombinations = renderAcupointCombinations;
  window.updateRestPeriod = updateRestPeriod;
  window.useOnePackage = useOnePackage;
  window.undoPackageUse = undoPackageUse;

  // 病歷刪除相關函式
  window.confirmDeleteMedicalRecord = confirmDeleteMedicalRecord;
  window.deleteMedicalRecord = deleteMedicalRecord;

  // 將個人設置與慣用組合相關函式掛載至全域，讓 HTML 按鈕可以直接調用。
  window.loadPersonalSettings = loadPersonalSettings;
  window.updatePersonalSettings = updatePersonalSettings;
  window.renderDiagnosisSettingsForm = renderDiagnosisSettingsForm;
  window.saveDiagnosisSettings = saveDiagnosisSettings;
  window.addDiagnosisDefaultBillingItem = addDiagnosisDefaultBillingItem;
  window.removeDiagnosisDefaultBillingItem = removeDiagnosisDefaultBillingItem;
  window.showHerbComboModal = showHerbComboModal;
  window.hideHerbComboModal = hideHerbComboModal;
  window.selectHerbCombo = selectHerbCombo;
  window.showAcupointComboModal = showAcupointComboModal;
  window.hideAcupointComboModal = hideAcupointComboModal;
  window.selectAcupointCombo = selectAcupointCombo;

  // 病歷管理功能：將相關函式掛載至全域，供 HTML 直接調用。
  // 這些函式負責載入病歷列表、顯示列表、檢視個別病歷以及關閉詳情彈窗。
  window.loadMedicalRecordManagement = loadMedicalRecordManagement;
  window.displayMedicalRecords = displayMedicalRecords;
  window.viewMedicalRecord = viewMedicalRecord;
  window.closeMedicalRecordDetail = closeMedicalRecordDetail;

  // 新增封裝函式：為常用藥方和穴位載入按鈕提供統一的讀取圈效果。
  // 與 openDiagnosisTemplate/openPrescriptionTemplate 風格一致，按下按鈕後顯示讀取圖示再開啟彈窗。
  async function openHerbCombo(ev) {
    let btn = null;
    try {
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      if (!btn) {
        btn = document.querySelector('button[onclick*="openHerbCombo"]');
      }
      if (btn) {
        setButtonLoading(btn);
      }
      // 輕微延遲，讓使用者感受讀取狀態
      await new Promise(resolve => setTimeout(resolve, 200));
      if (typeof showHerbComboModal === 'function') {
        showHerbComboModal();
      }
    } catch (err) {
      console.error('開啟常用藥方按鈕錯誤:', err);
    } finally {
      if (btn) {
        clearButtonLoading(btn);
      }
    }
  }

  async function openAcupointCombo(ev) {
    let btn = null;
    try {
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      if (!btn) {
        btn = document.querySelector('button[onclick*="openAcupointCombo"]');
      }
      if (btn) {
        setButtonLoading(btn);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      if (typeof showAcupointComboModal === 'function') {
        showAcupointComboModal();
      }
    } catch (err) {
      console.error('開啟常用穴位按鈕錯誤:', err);
    } finally {
      if (btn) {
        clearButtonLoading(btn);
      }
    }
  }

  // 將封裝函式掛載至全域，以便 HTML 按鈕呼叫
  window.openHerbCombo = openHerbCombo;
  window.openAcupointCombo = openAcupointCombo;
  // 中藥庫庫存彈窗功能
  window.openInventoryModal = openInventoryModal;
  window.hideInventoryModal = hideInventoryModal;
  window.saveInventoryChanges = saveInventoryChanges;

  // 批量入庫功能掛載至全域
  window.openBatchInventoryModal = openBatchInventoryModal;
  window.hideBatchInventoryModal = hideBatchInventoryModal;
  window.addBatchRow = addBatchRow;
  window.saveBatchInventory = saveBatchInventory;

  // 在腳本載入時為批量入庫彈窗註冊點擊事件，以便當使用者點擊彈窗遮罩（黑色背景）時即可關閉彈窗。
  // 其他彈窗預設已支援點擊遮罩關閉，批量入庫彈窗在先前版本中未實作此行為，故於此補上。
  (function attachBatchModalOutsideClick() {
    try {
      const modal = document.getElementById('batchInventoryModal');
      if (modal && !modal.dataset.outsideClickBound) {
        modal.addEventListener('click', function (evt) {
          // 僅當點擊目標為覆蓋層本身（即黑色背景）時才關閉，避免在內部表單點擊時關閉彈窗
          if (evt.target === modal) {
            hideBatchInventoryModal();
          }
        });
        // 使用資料屬性標記以避免重複綁定事件
        modal.dataset.outsideClickBound = 'true';
      }
    } catch (e) {
      console.error('批量入庫彈窗外部點擊事件綁定失敗:', e);
    }
  })();

  // 帳號安全相關函式掛載至全域，供帳號安全設定頁的按鈕呼叫
  window.loadAccountSecurity = loadAccountSecurity;
  window.changeCurrentUserPassword = changeCurrentUserPassword;
  window.archiveCurrentUserAccount = archiveCurrentUserAccount;

  // 病人管理按鈕的封裝函式：為查看、病歷、編輯和刪除操作添加讀取圈，並在操作完成後清除。
  async function handleViewPatient(ev, id) {
    let btn = ev && ev.currentTarget ? ev.currentTarget : null;
    if (btn) setButtonLoading(btn);
    try {
      await viewPatient(id);
    } catch (error) {
      console.error('Error viewing patient:', error);
    } finally {
      if (btn) clearButtonLoading(btn);
    }
  }

  async function handleShowMedicalHistory(ev, id) {
    let btn = ev && ev.currentTarget ? ev.currentTarget : null;
    if (btn) setButtonLoading(btn);
    try {
      await showPatientMedicalHistory(id);
    } catch (error) {
      console.error('Error showing medical history:', error);
    } finally {
      if (btn) clearButtonLoading(btn);
    }
  }

  async function handleEditPatient(ev, id) {
    let btn = ev && ev.currentTarget ? ev.currentTarget : null;
    if (btn) setButtonLoading(btn);
    try {
      await editPatient(id);
    } catch (error) {
      console.error('Error editing patient:', error);
    } finally {
      if (btn) clearButtonLoading(btn);
    }
  }

  async function handleDeletePatient(ev, id) {
    let btn = ev && ev.currentTarget ? ev.currentTarget : null;
    if (btn) setButtonLoading(btn);
    try {
      await deletePatient(id);
    } catch (error) {
      console.error('Error deleting patient:', error);
    } finally {
      if (btn) clearButtonLoading(btn);
    }
  }

  // 將這些封裝函式掛載到 window，供 HTML 的 onclick 直接調用
  window.handleViewPatient = handleViewPatient;
  window.handleShowMedicalHistory = handleShowMedicalHistory;
  window.handleEditPatient = handleEditPatient;
  window.handleDeletePatient = handleDeletePatient;

  // 模板庫：診斷模板與醫囑模板彈窗
  // 顯示診斷模板選擇彈窗，並動態生成模板列表
  function showDiagnosisTemplateModal() {
    try {
      const modal = document.getElementById('diagnosisTemplateModal');
      const listEl = document.getElementById('diagnosisTemplateList');
      if (!modal || !listEl) return;
      // 在列表上方放置搜尋欄與分類欄，若尚未存在則建立
      let filterBar = modal.querySelector('#diagnosisTemplateFilterBar');
      let searchInput = modal.querySelector('#diagnosisTemplateSearch');
      let categorySelect = modal.querySelector('#diagnosisTemplateModalCategoryFilter');
      if (!filterBar) {
        filterBar = document.createElement('div');
        filterBar.id = 'diagnosisTemplateFilterBar';
        filterBar.className = 'mb-3 flex items-center gap-2';
        searchInput = document.createElement('input');
        searchInput.id = 'diagnosisTemplateSearch';
        searchInput.type = 'text';
        searchInput.placeholder = '搜尋診斷模板...';
        searchInput.className = 'flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded';
        categorySelect = document.createElement('select');
        categorySelect.id = 'diagnosisTemplateModalCategoryFilter';
        categorySelect.className = 'w-36 px-3 py-2 border border-gray-300 rounded bg-white';
        filterBar.appendChild(searchInput);
        filterBar.appendChild(categorySelect);
        listEl.parentNode.insertBefore(filterBar, listEl);
        searchInput.addEventListener('input', function() {
          showDiagnosisTemplateModal();
        });
        categorySelect.addEventListener('change', function() {
          showDiagnosisTemplateModal();
        });
      }
      // 取得搜尋字串並轉成小寫以便比對
      const keyword = searchInput.value ? String(searchInput.value).trim().toLowerCase() : '';
      const templates = Array.isArray(diagnosisTemplates) ? diagnosisTemplates : [];
      // 分類選單取自診斷模板本身 category
      const selectedCategory = categorySelect && categorySelect.value ? String(categorySelect.value) : '全部分類';
      if (categorySelect) {
        const categories = Array.from(new Set(
          templates
            .map(t => (t && t.category ? String(t.category).trim() : ''))
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'zh-Hant', { sensitivity: 'base' }));
        const prev = selectedCategory || '全部分類';
        categorySelect.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '全部分類';
        defaultOpt.textContent = '全部分類';
        categorySelect.appendChild(defaultOpt);
        categories.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat;
          opt.textContent = cat;
          categorySelect.appendChild(opt);
        });
        categorySelect.value = Array.from(categorySelect.options).some(opt => opt.value === prev) ? prev : '全部分類';
      }
      const activeCategory = categorySelect && categorySelect.value ? String(categorySelect.value) : '全部分類';
      listEl.innerHTML = '';
      // 根據關鍵字過濾
      let filtered = templates;
      if (keyword) {
        filtered = templates.filter(t => {
          if (!t) return false;
          const name = (t.name || '').toLowerCase();
          const category = (t.category || '').toLowerCase();
          const content = (t.content || '').toLowerCase();
          return name.includes(keyword) || category.includes(keyword) || content.includes(keyword);
        });
      }
      if (activeCategory && activeCategory !== '全部分類') {
        filtered = filtered.filter(t => String((t && t.category) || '') === activeCategory);
      }
      // 依名稱排序，改善搜尋體驗
      const sorted = filtered.slice().sort((a, b) => {
        const an = (a && a.name) ? a.name : '';
        const bn = (b && b.name) ? b.name : '';
        return an.localeCompare(bn, 'zh-Hans-CN', { sensitivity: 'base' });
      });
      sorted.forEach(template => {
        if (!template) return;
        const div = document.createElement('div');
        div.className = 'p-3 border border-gray-200 rounded-lg flex justify-between items-center hover:bg-gray-50';
        // 對模板名稱與分類進行轉義，避免 XSS
        const safeName = template.name ? window.escapeHtml(template.name) : '';
        const safeCategory = template.category ? window.escapeHtml(template.category) : null;
        const categoryLine = safeCategory ? `<div class="text-sm text-gray-500">${safeCategory}</div>` : '';
        const safeId = String(template.id).replace(/"/g, '&quot;');
        div.innerHTML = `
            <div>
              <div class="font-medium text-gray-800">${safeName}</div>
              ${categoryLine}
            </div>
            <button type="button" class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded" onclick="selectDiagnosisTemplate('${safeId}')">套用</button>
        `;
        listEl.appendChild(div);
      });
      modal.classList.remove('hidden');
    } catch (err) {
      console.error('顯示診斷模板彈窗失敗:', err);
    }
  }

  function hideDiagnosisTemplateModal() {
    const modal = document.getElementById('diagnosisTemplateModal');
    if (modal) modal.classList.add('hidden');
  }

  function selectDiagnosisTemplate(id) {
    try {
      const templates = Array.isArray(diagnosisTemplates) ? diagnosisTemplates : [];
      const template = templates.find(t => String(t.id) === String(id));
      if (!template) return;
      // 填入主訴與診斷相關欄位
      const formSymptoms = document.getElementById('formSymptoms');
      const formCurrentHistory = document.getElementById('formCurrentHistory');
      const formTongue = document.getElementById('formTongue');
      const formPulse = document.getElementById('formPulse');
      const formDiagnosis = document.getElementById('formDiagnosis');
      const formSyndrome = document.getElementById('formSyndrome');

      /**
       * 嘗試從模板的 content 欄位解析特定的診斷欄目，例如「主訴」、「現病史」、「舌象」等。
       * 若模板已有對應屬性（如 chiefComplaint 等）則優先使用該屬性。
       * 解析順序：
       *   - 先檢查模板對應欄位是否有資料。
       *   - 再從 content 中以關鍵字切割獲取。
       *   - 最後退而求其次使用整段 content 或模板名稱。
       */
      const tmplContent = typeof template.content === 'string' ? template.content : '';
      // 解析 content 中指定標題後的內容，使用非貪婪匹配，直到下一個已知標題或字串結尾
      function parseSection(keyword) {
        try {
          const pattern = new RegExp(String(keyword) + '[：:]\\s*([\\s\\S]*?)(?:\\n|$|主訴|現病史|舌象|脈象|中醫診斷|證型診斷|症狀描述|檢查建議|治療建議|復診安排)', 'i');
          const match = tmplContent.match(pattern);
          return match ? match[1].trim() : '';
        } catch (_e) {
          return '';
        }
      }

      // 主訴：若已有內容，則附加模板的主訴或症狀描述到現有內容
      if (formSymptoms) {
        let value = '';
        if (template.chiefComplaint) {
          value = template.chiefComplaint;
        } else {
          // 嘗試從 content 解析「主訴」或「症狀描述」
          value = parseSection('主訴');
          if (!value) {
            value = parseSection('症狀描述');
          }
          // 若仍無法取得，使用整段 content
          if (!value && tmplContent) {
            value = tmplContent;
          }
        }
        // 若取得內容，附加或覆蓋
        if (value) {
          if (formSymptoms.value && formSymptoms.value.trim()) {
            formSymptoms.value = formSymptoms.value.trim() + '\n' + value;
          } else {
            formSymptoms.value = value;
          }
        }
      }

      // 現病史：載入後追加至「主訴及現病史」欄位（formSymptoms）後方。
      // 不再寫入 formCurrentHistory，以免混淆。
      {
        let value = '';
        if (template.currentHistory) {
          value = template.currentHistory;
        } else {
          value = parseSection('現病史');
        }
        if (value && formSymptoms) {
          // 將現病史內容加在主訴內容之後
          if (formSymptoms.value && formSymptoms.value.trim()) {
            formSymptoms.value = formSymptoms.value.trim() + '\n' + value;
          } else {
            formSymptoms.value = value;
          }
        }
      }

      // 舌象：若已有內容，附加模板的舌象
      if (formTongue) {
        let value = '';
        if (template.tongue) {
          value = template.tongue;
        } else {
          value = parseSection('舌象');
        }
        if (value) {
          if (formTongue.value && formTongue.value.trim()) {
            formTongue.value = formTongue.value.trim() + '\n' + value;
          } else {
            formTongue.value = value;
          }
        }
      }

      // 脈象：若已有內容，附加模板的脈象
      if (formPulse) {
        let value = '';
        if (template.pulse) {
          value = template.pulse;
        } else {
          value = parseSection('脈象');
        }
        if (value) {
          if (formPulse.value && formPulse.value.trim()) {
            formPulse.value = formPulse.value.trim() + '\n' + value;
          } else {
            formPulse.value = value;
          }
        }
      }

      // 中醫診斷：若已有內容，附加模板的診斷
      if (formDiagnosis) {
        let value = '';
        if (template.tcmDiagnosis) {
          value = template.tcmDiagnosis;
        } else {
          value = parseSection('中醫診斷');
        }
        // 若仍無內容，使用模板名稱作為診斷
        if (!value && template.name) {
          value = template.name;
        }
        if (value) {
          if (formDiagnosis.value && formDiagnosis.value.trim()) {
            formDiagnosis.value = formDiagnosis.value.trim() + '\n' + value;
          } else {
            formDiagnosis.value = value;
          }
        }
      }

      // 證型診斷：若已有內容，附加模板的證型診斷
      if (formSyndrome) {
        let value = '';
        if (template.syndromeDiagnosis) {
          value = template.syndromeDiagnosis;
        } else {
          value = parseSection('證型診斷');
        }
        if (value) {
          if (formSyndrome.value && formSyndrome.value.trim()) {
            formSyndrome.value = formSyndrome.value.trim() + '\n' + value;
          } else {
            formSyndrome.value = value;
          }
        }
      }

      queueConsultationSymptomsDraftSave();
      hideDiagnosisTemplateModal();
      showToast('已載入診斷模板', 'success');
    } catch (err) {
      console.error('選擇診斷模板錯誤:', err);
    }
  }

  // 顯示醫囑模板選擇彈窗，並動態生成列表
  async function showPrescriptionTemplateModal() {
    /**
     * 顯示醫囑模板選擇彈窗。此函式會在必要時先初始化模板庫資料，
     * 然後根據目前的醫囑模板清單動態產生列表。若無可用模板，
     * 將顯示提示訊息。所有操作包含在 try/catch 中，以避免意外錯誤破壞 UI。
     */
    try {
      const modal = document.getElementById('prescriptionTemplateModal');
      const listEl = document.getElementById('prescriptionTemplateList');
      if (!modal || !listEl) return;
      // 如果模板尚未載入，嘗試從資料庫初始化。
      if (!Array.isArray(prescriptionTemplates) || prescriptionTemplates.length === 0) {
        if (typeof initTemplateLibrary === 'function') {
          try {
            await initTemplateLibrary();
          } catch (e) {
            console.error('初始化模板庫資料失敗:', e);
          }
        }
      }
      const templates = Array.isArray(prescriptionTemplates) ? prescriptionTemplates : [];
      // 在列表上方放置搜尋欄與分類欄，若尚未存在則建立
      let filterBar = modal.querySelector('#prescriptionTemplateFilterBar');
      let searchInput = modal.querySelector('#prescriptionTemplateSearch');
      let categorySelect = modal.querySelector('#prescriptionTemplateModalCategoryFilter');
      if (!filterBar) {
        filterBar = document.createElement('div');
        filterBar.id = 'prescriptionTemplateFilterBar';
        filterBar.className = 'mb-3 flex items-center gap-2';
        searchInput = document.createElement('input');
        searchInput.id = 'prescriptionTemplateSearch';
        searchInput.type = 'text';
        searchInput.placeholder = '搜尋醫囑模板...';
        searchInput.className = 'flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded';
        categorySelect = document.createElement('select');
        categorySelect.id = 'prescriptionTemplateModalCategoryFilter';
        categorySelect.className = 'w-36 px-3 py-2 border border-gray-300 rounded bg-white';
        filterBar.appendChild(searchInput);
        filterBar.appendChild(categorySelect);
        listEl.parentNode.insertBefore(filterBar, listEl);
        searchInput.addEventListener('input', function() {
          showPrescriptionTemplateModal();
        });
        categorySelect.addEventListener('change', function() {
          showPrescriptionTemplateModal();
        });
      }
      const selectedCategory = categorySelect && categorySelect.value ? String(categorySelect.value) : '全部分類';
      if (categorySelect) {
        const categories = Array.from(new Set(
          templates
            .map(t => (t && t.category ? String(t.category).trim() : ''))
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'zh-Hant', { sensitivity: 'base' }));
        const prev = selectedCategory || '全部分類';
        categorySelect.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '全部分類';
        defaultOpt.textContent = '全部分類';
        categorySelect.appendChild(defaultOpt);
        categories.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat;
          opt.textContent = cat;
          categorySelect.appendChild(opt);
        });
        categorySelect.value = Array.from(categorySelect.options).some(opt => opt.value === prev) ? prev : '全部分類';
      }
      const activeCategory = categorySelect && categorySelect.value ? String(categorySelect.value) : '全部分類';
      listEl.innerHTML = '';
      // 取得搜尋字串
      const keyword = searchInput.value ? String(searchInput.value).trim().toLowerCase() : '';
      if (!templates || templates.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-sm text-gray-500 text-center p-4';
        emptyDiv.textContent = '目前尚無醫囑模板，請先建立或同步模板資料。';
        listEl.appendChild(emptyDiv);
      } else {
        // 過濾列表
        let filtered = templates;
        if (keyword) {
          filtered = templates.filter(t => {
            if (!t) return false;
            const name = (t.name || '').toLowerCase();
            const category = (t.category || '').toLowerCase();
            const content = (t.content || '').toLowerCase();
            return name.includes(keyword) || category.includes(keyword) || content.includes(keyword);
          });
        }
        if (activeCategory && activeCategory !== '全部分類') {
          filtered = filtered.filter(t => String((t && t.category) || '') === activeCategory);
        }
        // 依名稱排序
        const sorted = filtered.slice().sort((a, b) => {
          const an = (a && a.name) ? a.name : '';
          const bn = (b && b.name) ? b.name : '';
          return an.localeCompare(bn, 'zh-Hans-CN', { sensitivity: 'base' });
        });
        sorted.forEach(template => {
          if (!template) return;
          const div = document.createElement('div');
          div.className = 'p-3 border border-gray-200 rounded-lg flex justify-between items-center hover:bg-gray-50';
          // 對模板名稱與分類進行轉義，避免 XSS
          const safeName = template.name ? window.escapeHtml(template.name) : '';
          const safeCategory = template.category ? window.escapeHtml(template.category) : null;
          const categoryLine = safeCategory ? `<div class="text-sm text-gray-500">${safeCategory}</div>` : '';
          div.innerHTML = `
            <div>
              <div class="font-medium text-gray-800">${safeName}</div>
              ${categoryLine}
            </div>
            <button type="button" class="text-xs bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded select-prescription-btn" data-id="${template.id}">套用</button>
          `;
          listEl.appendChild(div);
        });
        // 為每個按鈕掛上事件監聽
        const buttons = listEl.querySelectorAll('.select-prescription-btn');
        buttons.forEach(btn => {
          btn.addEventListener('click', function (evt) {
            const tid = evt.currentTarget.getAttribute('data-id');
            // 使用全域掛載的新版函式載入醫囑模板
            if (window && typeof window.selectPrescriptionTemplate === 'function') {
              window.selectPrescriptionTemplate(tid);
            }
          });
        });
      }
      modal.classList.remove('hidden');
    } catch (err) {
      console.error('顯示醫囑模板彈窗失敗:', err);
      showToast('無法顯示醫囑模板', 'error');
    }
  }

  function hidePrescriptionTemplateModal() {
    const modal = document.getElementById('prescriptionTemplateModal');
    if (modal) modal.classList.add('hidden');
  }

// 將舊版醫囑模板載入函式重新命名為 _oldSelectPrescriptionTemplate，避免與新版衝突
function _oldSelectPrescriptionTemplate(id) {
    /**
     * 選擇醫囑模板並套用到表單中。此函式會依序嘗試從模板的 content、note、
     * duration 以及 followUp 中解析出服藥方法、注意事項、療程與複診天數。
     * 完成後將值填入對應表單欄位，並更新複診日期。
     */
    try {
      const templates = Array.isArray(prescriptionTemplates) ? prescriptionTemplates : [];
      // 以 String 比較，確保不同類型的識別值也能匹配
      const template = templates.find(t => String(t.id) === String(id));
      if (!template) {
        showToast('找不到選定的醫囑模板', 'warning');
        return;
      }
      const usageField = document.getElementById('formUsage');
      const treatmentField = document.getElementById('formTreatmentCourse');
      const instructionsField = document.getElementById('formInstructions');
      // 定義解析器：解析文字以取得 usage、instructions、treatment
      const parseSections = text => {
        let usage = '';
        let instructions = '';
        let treatment = '';
        if (!text || typeof text !== 'string') return { usage, instructions, treatment };
        const contentStr = String(text);
        // 定義各區塊標題的候選關鍵字
        const usageMarkers = ['服藥方法', '服用方法', '服用方式', '用藥指導', '服藥指南', '服用指南', '中藥服用方法', '西藥服用方法'];
        const instructionMarkers = ['注意事項', '注意事项', '注意要點', '注意要点', '注意事項及叮嚀', '醫囑', '医嘱', '注意'];
        const treatmentMarkers = ['療程安排', '疗程安排', '療程', '疗程', '治療計劃', '治疗计划', '治療安排', '治疗安排'];
        // 收集所有標題位置
        let positions = [];
        const collectPositions = (markers, type) => {
          markers.forEach(mk => {
            const pos = contentStr.indexOf(mk);
            if (pos !== -1) {
              positions.push({ pos, marker: mk, type });
            }
          });
        };
        collectPositions(usageMarkers, 'usage');
        collectPositions(instructionMarkers, 'instructions');
        collectPositions(treatmentMarkers, 'treatment');
        if (positions.length > 0) {
          // 依位置排序，如位置相同則較長的標題優先（避免較短的關鍵字覆蓋掉完整標題）
          positions.sort((a, b) => {
            if (a.pos === b.pos) {
              return b.marker.length - a.marker.length;
            }
            return a.pos - b.pos;
          });
          // 移除同一位置的重複標題，只保留最長的那個，避免像「注意」與「注意事項」重複解析
          const unique = [];
          positions.forEach(item => {
            if (unique.length === 0 || unique[unique.length - 1].pos !== item.pos) {
              unique.push(item);
            }
          });
          positions = unique;
          const assigned = { usage: false, instructions: false, treatment: false };
          for (let i = 0; i < positions.length; i++) {
            const { pos, marker, type } = positions[i];
            let start = pos + marker.length;
            // 去除冒號、全角冒號以及空白
            const afterMarker = contentStr.substring(start).replace(/^[\s:：]+/, '');
            start = pos + marker.length + (contentStr.substring(start).length - afterMarker.length);
            let end = contentStr.length;
            if (i + 1 < positions.length) {
              end = positions[i + 1].pos;
            }
            if (!assigned[type]) {
              const extracted = contentStr.substring(start, end).trim();
              if (type === 'usage') usage = extracted;
              if (type === 'instructions') instructions = extracted;
              if (type === 'treatment') treatment = extracted;
              assigned[type] = true;
            }
          }
        }
        return { usage, instructions, treatment };
      };
      // 儲存最終解析結果
      let usage = '';
      let instructions = '';
      let treatment = '';
      // 先從 content 解析
      if (template.content && typeof template.content === 'string') {
        const parsed = parseSections(template.content);
        usage = parsed.usage;
        instructions = parsed.instructions;
        treatment = parsed.treatment;
      }
      // 接著使用 note 補充資料：不覆寫服藥方法，僅補充療程與將整段注意事項合併至醫囑欄
      if (template.note && typeof template.note === 'string' && template.note.trim()) {
        const noteStr = template.note.trim();
        // 解析 note 以取得療程資訊，若 treatment 尚未填寫則使用
        const parsedNote = parseSections(template.note);
        if (!treatment && parsedNote.treatment) {
          treatment = parsedNote.treatment;
        }
        // 將 note 內容合併到 instructions 欄位，避免覆寫原本的服藥方法
        if (noteStr) {
          if (instructions) {
            // 若 existing instructions 中尚未包含 note，則以換行分隔後追加
            if (!instructions.includes(noteStr)) {
              instructions = instructions + (instructions.endsWith('\n') ? '' : '\n') + noteStr;
            }
          } else {
            instructions = noteStr;
          }
        }
      }
      // 若仍為空，直接使用 note 或 content 作為 usage
      if (!usage) {
        if (template.note && typeof template.note === 'string' && template.note.trim()) {
          usage = template.note.trim();
        } else if (template.content && typeof template.content === 'string') {
          usage = template.content.trim();
        }
      }
      // 若 instructions 為空，且 note 不等於 usage，使用 note 作為 instructions
      if (!instructions) {
        if (template.note && typeof template.note === 'string' && template.note.trim()) {
          if (template.note.trim() !== usage) {
            instructions = template.note.trim();
          }
        }
      }
      // 若 treatment 為空，使用 duration
      if (!treatment) {
        if (template.duration && typeof template.duration === 'string') {
          treatment = template.duration;
        }
      }
      // 將值填入表單欄位
      if (usageField) usageField.value = usage || '';
      if (instructionsField) instructionsField.value = instructions || '';
      if (treatmentField) treatmentField.value = treatment || '';
      // 自動填入複診日期
      try {
        const followUpField = document.getElementById('formFollowUpDate');
        if (followUpField) {
          let days = 0;
          // 1. 解析 template.followUp
          if (template.followUp && typeof template.followUp === 'string') {
            // 先移除括號以支援格式如「3（週）」或「7（天）」
            const fuClean = template.followUp.replace(/[()（）]/g, '');
            const numMatch = fuClean.match(/(\d+)/);
            if (numMatch) {
              const num = parseInt(numMatch[1], 10);
              if (!isNaN(num)) {
                if (/天|日/.test(fuClean)) {
                  days = num;
                } else if (/週|周/.test(fuClean)) {
                  days = num * 7;
                } else if (/月/.test(fuClean)) {
                  days = num * 30;
                }
              }
            }
            // 如果還無法解析，仍採用舊有正則作為後備
            if (!days) {
              let match;
              match = fuClean.match(/(\d+)\s*(?:個)?\s*(天|日)/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) days = num;
              }
              if (!days) {
                match = fuClean.match(/(\d+)\s*(?:個)?\s*[週周]/);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (!isNaN(num)) days = num * 7;
                }
              }
              if (!days) {
                match = fuClean.match(/(\d+)\s*(?:個)?\s*月/);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (!isNaN(num)) days = num * 30;
                }
              }
            }
          }
          // 2. 若未得出結果，從 content 搜尋回/複診
          const searchFollowUp = (str) => {
            if (!str || typeof str !== 'string') return 0;
            const re = /(\d+)\s*(?:個)?\s*(天|日|週|周|月)\s*(?:後)?\s*[回複復复][診诊]/g;
            let matches = [];
            let m;
            while ((m = re.exec(str)) !== null) {
              matches.push(m);
            }
            if (matches.length > 0) {
              const last = matches[matches.length - 1];
              const num = parseInt(last[1], 10);
              const unit = last[2];
              if (!isNaN(num)) {
                if (unit === '天' || unit === '日') return num;
                if (unit === '週' || unit === '周') return num * 7;
                if (unit === '月') return num * 30;
              }
            }
            return 0;
          };
          if (days <= 0 && template.content && typeof template.content === 'string') {
            days = searchFollowUp(template.content);
          }
          if (days <= 0 && template.note && typeof template.note === 'string') {
            days = searchFollowUp(template.note);
          }
          if (days > 0) {
            // 取得基準日期：優先使用 formVisitTime，否則為當前時間
            let baseDate = new Date();
            const visitField = document.getElementById('formVisitTime');
            if (visitField && visitField.value) {
              const parsed = new Date(visitField.value);
              if (!isNaN(parsed.getTime())) {
                baseDate = parsed;
              }
            }
            const followDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
            const y = followDate.getFullYear();
            const mStr = String(followDate.getMonth() + 1).padStart(2, '0');
            const dStr = String(followDate.getDate()).padStart(2, '0');
            const hStr = String(followDate.getHours()).padStart(2, '0');
            const minStr = String(followDate.getMinutes()).padStart(2, '0');
            followUpField.value = `${y}-${mStr}-${dStr}T${hStr}:${minStr}`;
            try {
              // 派發事件通知可能的監聽器
              followUpField.dispatchEvent(new Event('change'));
              followUpField.dispatchEvent(new Event('input'));
            } catch (e) {
              // ignore event dispatch errors
            }
          }
        }
      } catch (fuErr) {
        // 若解析複診日期失敗則忽略，不提示使用者
        console.warn('解析複診日期失敗：', fuErr);
      }
      hidePrescriptionTemplateModal();
      showToast('已載入醫囑模板', 'success');
    } catch (err) {
      console.error('選擇醫囑模板錯誤:', err);
      showToast('載入醫囑模板失敗', 'error');
    }
  }

  // 將模板相關函式掛載至全域，供 HTML 按鈕調用
  window.showDiagnosisTemplateModal = showDiagnosisTemplateModal;
  window.hideDiagnosisTemplateModal = hideDiagnosisTemplateModal;
  window.selectDiagnosisTemplate = selectDiagnosisTemplate;
  window.showPrescriptionTemplateModal = showPrescriptionTemplateModal;
  window.hidePrescriptionTemplateModal = hidePrescriptionTemplateModal;
  // 定義新版載入醫囑模板函式，僅處理療程、中藥服用方法、複診時間、醫囑及注意事項
  function selectPrescriptionTemplate(id) {
    try {
      const templates = Array.isArray(prescriptionTemplates) ? prescriptionTemplates : [];
      const template = templates.find(t => String(t.id) === String(id));
      if (!template) {
        showToast('找不到選定的醫囑模板', 'warning');
        return;
      }
      const usageField = document.getElementById('formUsage');
      const treatmentField = document.getElementById('formTreatmentCourse');
      const instructionsField = document.getElementById('formInstructions');
      const followUpField = document.getElementById('formFollowUpDate');
      if (treatmentField) treatmentField.value = (template.duration && typeof template.duration === 'string') ? template.duration.trim() : '';
      // 修正載入醫囑模板時將「中藥服用方法」與「醫囑及注意事項」欄位對應錯置的問題
      // 在編輯模板介面中，`note` 對應的是「中藥服用方法」，`content` 對應的是「醫囑內容及注意事項」。
      // 因此在套用模板時，應將 note 填入使用方式欄位，content 填入醫囑欄位。
      if (usageField) {
        // 原本載入醫囑模板會覆蓋「中藥服用方法」欄位內容，需求改為保留既有文字並附加模板中的用藥說明。
        const existingVal = usageField.value || '';
        // 取得模板內的 note（對應中藥服用方法），並去除首尾空白
        const newNote = (template.note && typeof template.note === 'string') ? template.note.trim() : '';
        if (newNote) {
          if (existingVal) {
            // 若已有內容，則在末尾附加新內容，並在兩者間加入換行符以區隔
            const separator = existingVal.endsWith('\n') ? '' : '\n';
            usageField.value = existingVal + separator + newNote;
          } else {
            // 若原本沒有內容，直接填入新內容
            usageField.value = newNote;
          }
        }
      }
      if (instructionsField) {
        instructionsField.value = (template.content && typeof template.content === 'string') ? template.content.trim() : '';
      }
      try {
        if (followUpField) {
          // 先嘗試解析含括號的複診時間。例如「3（週）」應解析為 21 天。
          let days = 0;
          if (template.followUp && typeof template.followUp === 'string') {
            // 移除中英文括號，避免像「7（天）」這樣的格式無法解析
            const fuClean = template.followUp.replace(/[()（）]/g, '');
            const numMatch = fuClean.match(/(\d+)/);
            if (numMatch) {
              const num = parseInt(numMatch[1], 10);
              if (!isNaN(num)) {
                if (/天|日/.test(fuClean)) {
                  days = num;
                } else if (/週|周/.test(fuClean)) {
                  days = num * 7;
                } else if (/月/.test(fuClean)) {
                  days = num * 30;
                }
              }
            }
          }
          // 若尚未解析出天數，退回原本的正則匹配邏輯
          if (days === 0 && template.followUp && typeof template.followUp === 'string') {
            let match;
            const fu = template.followUp;
            match = fu.match(/(\d+)\s*(?:個)?\s*(天|日)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num)) days = num;
            }
            if (!days) {
              match = fu.match(/(\d+)\s*(?:個)?\s*[週周]/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) days = num * 7;
              }
            }
            if (!days) {
              match = fu.match(/(\d+)\s*(?:個)?\s*月/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) days = num * 30;
              }
            }
          }
          if (days > 0) {
            // 取得基準日期：優先使用 formVisitTime，否則為當前時間
            let baseDate = new Date();
            const visitField = document.getElementById('formVisitTime');
            if (visitField && visitField.value) {
              const parsed = new Date(visitField.value);
              if (!isNaN(parsed.getTime())) {
                baseDate = parsed;
              }
            }
            const followDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
            const y = followDate.getFullYear();
            const mStr = String(followDate.getMonth() + 1).padStart(2, '0');
            const dStr = String(followDate.getDate()).padStart(2, '0');
            const hStr = String(followDate.getHours()).padStart(2, '0');
            const minStr = String(followDate.getMinutes()).padStart(2, '0');
            followUpField.value = `${y}-${mStr}-${dStr}T${hStr}:${minStr}`;
            try {
              // 派發事件，讓可能的監聽器能捕捉到變化
              followUpField.dispatchEvent(new Event('change'));
              followUpField.dispatchEvent(new Event('input'));
            } catch (e) {
              // 忽略事件派發錯誤
            }
          }
        }
      } catch (fuErr) {
        console.warn('解析複診日期失敗：', fuErr);
      }
      queueConsultationSymptomsDraftSave();
      hidePrescriptionTemplateModal();
      showToast('已載入醫囑模板', 'success');
    } catch (err) {
      console.error('選擇醫囑模板錯誤:', err);
      showToast('載入醫囑模板失敗', 'error');
    }
  }
  // 將新版函式掛載到全域
  window.selectPrescriptionTemplate = selectPrescriptionTemplate;

  // 以下為封裝診斷模板與醫囑模板載入按鈕的函式。
  // 按下載入按鈕時顯示讀取圈，稍作延遲後再打開對應的模板彈窗，並於完成後恢復原始按鈕內容。
  async function openDiagnosisTemplate(ev) {
    let btn = null;
    try {
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      if (!btn) {
        btn = document.querySelector('button[onclick*="openDiagnosisTemplate"]');
      }
      if (btn) {
        setButtonLoading(btn);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      if (typeof showDiagnosisTemplateModal === 'function') {
        showDiagnosisTemplateModal();
      }
    } catch (err) {
      console.error('開啟診斷模板按鈕錯誤:', err);
    } finally {
      if (btn) {
        clearButtonLoading(btn);
      }
    }
  }

  async function openPrescriptionTemplate(ev) {
    let btn = null;
    try {
      // 找到觸發按鈕
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      if (!btn) {
        // 後備搜尋頁面中的按鈕
        btn = document.querySelector('button[onclick*="openPrescriptionTemplate"]');
      }
      if (btn) {
        setButtonLoading(btn);
      }
      // 若模板尚未載入，嘗試初始化模板庫
      if (!Array.isArray(prescriptionTemplates) || prescriptionTemplates.length === 0) {
        if (typeof initTemplateLibrary === 'function') {
          try {
            await initTemplateLibrary();
          } catch (initErr) {
            console.error('初始化模板庫失敗:', initErr);
          }
        }
      }
      // 小延遲讓使用者感受讀取反饋
      await new Promise(resolve => setTimeout(resolve, 200));
      if (typeof showPrescriptionTemplateModal === 'function') {
        // 使用 await 以確保如有異步操作完成後再繼續
        await showPrescriptionTemplateModal();
      }
    } catch (err) {
      console.error('開啟醫囑模板按鈕錯誤:', err);
      showToast('載入醫囑模板失敗', 'error');
    } finally {
      if (btn) {
        clearButtonLoading(btn);
      }
    }
  }

  // 將封裝函式掛載至全域，供 HTML 直接調用
  window.openDiagnosisTemplate = openDiagnosisTemplate;
  window.openPrescriptionTemplate = openPrescriptionTemplate;

  /**
   * 在使用者嘗試直接關閉或重新整理網頁時提示確認，避免未保存的套票使用紀錄被誤判為取消。
   *
   * 先前的實作中會在取消診症或退出編輯時，將 pendingPackageChanges 中的變更回復。
   * 但如果使用者直接關閉瀏覽器頁籤或刷新頁面，這些變更不應自動回復，
   * 否則將導致套票次數被無意間加回。為此，加入 beforeunload 監聽器，
   * 當存在未保存的套票變更時，提示使用者確認離開。若使用者仍選擇離開，
   * 我們不會執行 revertPendingPackageChanges，而是保留目前資料庫中的套票狀態。
   */
  window.addEventListener('beforeunload', function (e) {
    try {
      // 若有暫存的套票使用變更尚未正式保存，則提示確認離開
      if (pendingPackageChanges && pendingPackageChanges.length > 0) {
        // 阻止預設行為，並設置 returnValue 以符合部分瀏覽器要求
        e.preventDefault();
        e.returnValue = '';
      }
    } catch (_e) {
      // 忽略意外錯誤，避免影響離開流程
    }
  });

  /**
   * 在頁面卸載時清空暫存的套票變更。
   *
   * 離開頁面後，記憶體中的 pendingPackageChanges 將會失效，不過在某些瀏覽器中
   * 仍有可能在後續執行非同步或同步回調時引用到舊資料。為安全起見，在卸載事件
   * 中顯式將暫存變更清空，確保後續不會誤判為需要回復。
   *
   * 注意：Chrome 已以 Permissions-Policy 封鎖即將廢棄的 unload 事件（註冊時
   * 會出現「unload is not allowed in this document」違規提示），故改用官方
   * 建議的 pagehide；頁面進入往返快取（bfcache）時不應清空，避免返回後狀態遺失。
   */
  window.addEventListener('pagehide', function (event) {
    try {
      if (event && event.persisted) return;
      pendingPackageChanges = [];
    } catch (_e) {
      // 若無法清空，略過即可；刷新後此變數會重新初始化
    }
  });
})();
          // 分類數據
          let categories = {
            herbs: ['感冒類', '消化系統', '婦科調理', '補益類', '清熱類'],
            acupoints: ['頭面部', '胸腹部', '四肢部', '背腰部', '內科疾病', '婦科疾病'],
            prescriptions: ['用藥指導', '生活調理', '飲食建議', '運動指導', '慢性病管理', '婦科調理'],
            diagnosis: ['內科', '婦科', '兒科', '皮膚科', '骨傷科']
          };

          // 將分類資料公開到全域，讓其他模組能夠讀取與更新
          window.categories = categories;

          // -----------------------------------------------------------------------------
          // 個人慣用藥方組合及穴位組合的分類（管理分類）
          //
          // 這些分類用於常用中藥組合與穴位組合的管理，可依個人偏好調整。
          // 預設值取自全域 categories.herbs 與 categories.acupoints，
          // 但當用戶在個人設定中另行指定時會被覆蓋。
          // 透過 window 曝露讓其他模組可以存取與更新。
          let herbComboCategories = Array.isArray(categories.herbs) ? [...categories.herbs] : [];
          let acupointComboCategories = Array.isArray(categories.acupoints) ? [...categories.acupoints] : [];
          window.herbComboCategories = herbComboCategories;
          window.acupointComboCategories = acupointComboCategories;
          function getDefaultDiagnosisSettings() {
            return {
              defaultPrescriptionDays: 5,
              defaultPrescriptionFrequency: 2,
              defaultFollowUpOffsetDays: 7,
              defaultFollowUpTime: '',
              defaultUsage: '溫水化開，飯後服',
              defaultTreatmentCourse: '一周',
              defaultInstructions: '注意休息，飲食清淡',
              defaultBillingItemIds: []
            };
          }

          function normalizeDiagnosisSettings(raw) {
            const defaults = getDefaultDiagnosisSettings();
            const source = raw && typeof raw === 'object' ? raw : {};
            const parseIntWithBounds = function(value, fallback, min, max) {
              const parsed = parseInt(value, 10);
              if (Number.isNaN(parsed)) return fallback;
              return Math.min(max, Math.max(min, parsed));
            };
            const getNonEmptyString = function(value, fallback) {
              if (typeof value !== 'string') return fallback;
              const trimmed = value.trim();
              return trimmed !== '' ? trimmed : fallback;
            };
            const followUpTime = typeof source.defaultFollowUpTime === 'string' && /^\d{2}:\d{2}$/.test(source.defaultFollowUpTime.trim())
              ? source.defaultFollowUpTime.trim()
              : defaults.defaultFollowUpTime;
            const billingIds = Array.isArray(source.defaultBillingItemIds)
              ? Array.from(new Set(source.defaultBillingItemIds
                  .map(id => String(id || '').trim())
                  .filter(Boolean)))
              : defaults.defaultBillingItemIds.slice();
            return {
              defaultPrescriptionDays: parseIntWithBounds(source.defaultPrescriptionDays, defaults.defaultPrescriptionDays, 1, 90),
              defaultPrescriptionFrequency: parseIntWithBounds(source.defaultPrescriptionFrequency, defaults.defaultPrescriptionFrequency, 1, 10),
              defaultFollowUpOffsetDays: parseIntWithBounds(source.defaultFollowUpOffsetDays, defaults.defaultFollowUpOffsetDays, 0, 365),
              defaultFollowUpTime: followUpTime,
              defaultUsage: getNonEmptyString(source.defaultUsage, defaults.defaultUsage),
              defaultTreatmentCourse: getNonEmptyString(source.defaultTreatmentCourse, defaults.defaultTreatmentCourse),
              defaultInstructions: getNonEmptyString(source.defaultInstructions, defaults.defaultInstructions),
              defaultBillingItemIds: billingIds
            };
          }

          function normalizeDiagnosisSettingsMap(rawMap) {
            const source = rawMap && typeof rawMap === 'object' ? rawMap : {};
            const normalized = {};
            Object.keys(source).forEach(key => {
              const clinicKey = String(key || '').trim();
              if (!clinicKey) return;
              normalized[clinicKey] = normalizeDiagnosisSettings(source[key]);
            });
            return normalized;
          }

          function getDiagnosisSettingsClinicKey(clinicId) {
            const rawClinicId = clinicId !== undefined && clinicId !== null
              ? clinicId
              : (typeof currentClinicId !== 'undefined' ? currentClinicId : null);
            return String(rawClinicId || 'local-default');
          }

          function getCurrentClinicDisplayNameForDiagnosisSettings() {
            try {
              const fromCurrent = getClinicDisplayName(clinicSettings);
              if (fromCurrent) return fromCurrent;
            } catch (_e) {}
            try {
              if (Array.isArray(clinicsList)) {
                const matchedClinic = clinicsList.find(c => String(c && c.id) === getDiagnosisSettingsClinicKey());
                const fromList = getClinicDisplayName(matchedClinic || {});
                if (fromList) return fromList;
              }
            } catch (_e2) {}
            return '未命名診所';
          }

          let diagnosisSettingsByClinic = {};
          let diagnosisSettings = getDefaultDiagnosisSettings();
          window.diagnosisSettingsByClinic = diagnosisSettingsByClinic;
          window.diagnosisSettings = diagnosisSettings;

          function getEffectiveDiagnosisSettings() {
            const clinicKey = getDiagnosisSettingsClinicKey();
            diagnosisSettingsByClinic = normalizeDiagnosisSettingsMap(diagnosisSettingsByClinic);
            diagnosisSettings = normalizeDiagnosisSettings(diagnosisSettingsByClinic[clinicKey]);
            diagnosisSettingsByClinic[clinicKey] = diagnosisSettings;
            window.diagnosisSettingsByClinic = diagnosisSettingsByClinic;
            window.diagnosisSettings = diagnosisSettings;
            return diagnosisSettings;
          }

          function formatDateTimeLocalValue(date) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
          }

          function buildDefaultFollowUpDate(baseDate) {
            const settings = getEffectiveDiagnosisSettings();
            const followUp = baseDate instanceof Date ? new Date(baseDate) : new Date();
            if (Number.isNaN(followUp.getTime())) return '';
            followUp.setDate(followUp.getDate() + settings.defaultFollowUpOffsetDays);
            if (settings.defaultFollowUpTime) {
              const timeParts = settings.defaultFollowUpTime.split(':');
              const hours = parseInt(timeParts[0], 10);
              const minutes = parseInt(timeParts[1], 10);
              if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
                followUp.setHours(hours, minutes, 0, 0);
              }
            }
            return formatDateTimeLocalValue(followUp);
          }

          function getDiagnosisSettingsFromForm() {
            const current = getEffectiveDiagnosisSettings();
            const daysEl = document.getElementById('diagnosisDefaultDays');
            const freqEl = document.getElementById('diagnosisDefaultFrequency');
            const followUpDaysEl = document.getElementById('diagnosisDefaultFollowUpDays');
            const followUpTimeEl = document.getElementById('diagnosisDefaultFollowUpTime');
            const usageEl = document.getElementById('diagnosisDefaultUsage');
            const courseEl = document.getElementById('diagnosisDefaultTreatmentCourse');
            const instructionsEl = document.getElementById('diagnosisDefaultInstructions');
            return normalizeDiagnosisSettings({
              defaultPrescriptionDays: daysEl ? daysEl.value : current.defaultPrescriptionDays,
              defaultPrescriptionFrequency: freqEl ? freqEl.value : current.defaultPrescriptionFrequency,
              defaultFollowUpOffsetDays: followUpDaysEl ? followUpDaysEl.value : current.defaultFollowUpOffsetDays,
              defaultFollowUpTime: followUpTimeEl ? followUpTimeEl.value : current.defaultFollowUpTime,
              defaultUsage: usageEl ? usageEl.value : current.defaultUsage,
              defaultTreatmentCourse: courseEl ? courseEl.value : current.defaultTreatmentCourse,
              defaultInstructions: instructionsEl ? instructionsEl.value : current.defaultInstructions,
              defaultBillingItemIds: current.defaultBillingItemIds
            });
          }

          function addDiagnosisDefaultBillingItem(itemId) {
            const clinicKey = getDiagnosisSettingsClinicKey();
            const itemIdStr = String(itemId || '').trim();
            if (!itemIdStr) return;
            diagnosisSettingsByClinic = normalizeDiagnosisSettingsMap(diagnosisSettingsByClinic);
            const current = getDiagnosisSettingsFromForm();
            const nextIds = current.defaultBillingItemIds.slice();
            if (!nextIds.includes(itemIdStr)) {
              nextIds.push(itemIdStr);
            }
            diagnosisSettings = normalizeDiagnosisSettings({
              ...current,
              defaultBillingItemIds: nextIds
            });
            diagnosisSettingsByClinic[clinicKey] = diagnosisSettings;
            window.diagnosisSettingsByClinic = diagnosisSettingsByClinic;
            window.diagnosisSettings = diagnosisSettings;
            renderDiagnosisSettingsForm(true);
          }

          function removeDiagnosisDefaultBillingItem(itemId) {
            const clinicKey = getDiagnosisSettingsClinicKey();
            const itemIdStr = String(itemId || '').trim();
            if (!itemIdStr) return;
            diagnosisSettingsByClinic = normalizeDiagnosisSettingsMap(diagnosisSettingsByClinic);
            const current = getDiagnosisSettingsFromForm();
            diagnosisSettings = normalizeDiagnosisSettings({
              ...current,
              defaultBillingItemIds: current.defaultBillingItemIds.filter(id => String(id) !== itemIdStr)
            });
            diagnosisSettingsByClinic[clinicKey] = diagnosisSettings;
            window.diagnosisSettingsByClinic = diagnosisSettingsByClinic;
            window.diagnosisSettings = diagnosisSettings;
            renderDiagnosisSettingsForm(true);
          }

          function renderDiagnosisSettingsForm(forceReloadFromClinic = false) {
            const clinicKey = getDiagnosisSettingsClinicKey();
            const panel = document.getElementById('diagnosisSettingsContent');
            const clinicNameEl = document.getElementById('diagnosisSettingsClinicName');
            if (clinicNameEl) {
              clinicNameEl.textContent = getCurrentClinicDisplayNameForDiagnosisSettings();
            }
            const canReuseFormState = !forceReloadFromClinic && panel && panel.dataset.clinicKey === clinicKey;
            if (canReuseFormState) {
              try {
                diagnosisSettings = getDiagnosisSettingsFromForm();
                diagnosisSettingsByClinic = normalizeDiagnosisSettingsMap(diagnosisSettingsByClinic);
                diagnosisSettingsByClinic[clinicKey] = diagnosisSettings;
              } catch (_e) {
                diagnosisSettings = getEffectiveDiagnosisSettings();
              }
            } else {
              diagnosisSettings = getEffectiveDiagnosisSettings();
            }
            if (panel) panel.dataset.clinicKey = clinicKey;
            window.diagnosisSettingsByClinic = diagnosisSettingsByClinic;
            window.diagnosisSettings = diagnosisSettings;
            const settings = diagnosisSettings;
            const daysEl = document.getElementById('diagnosisDefaultDays');
            const freqEl = document.getElementById('diagnosisDefaultFrequency');
            const followUpDaysEl = document.getElementById('diagnosisDefaultFollowUpDays');
            const followUpTimeEl = document.getElementById('diagnosisDefaultFollowUpTime');
            const usageEl = document.getElementById('diagnosisDefaultUsage');
            const courseEl = document.getElementById('diagnosisDefaultTreatmentCourse');
            const instructionsEl = document.getElementById('diagnosisDefaultInstructions');
            const searchEl = document.getElementById('diagnosisBillingItemSearch');
            const selectedContainer = document.getElementById('diagnosisSelectedBillingItems');
            const container = document.getElementById('diagnosisDefaultBillingItems');
            if (daysEl) daysEl.value = settings.defaultPrescriptionDays;
            if (freqEl) freqEl.value = settings.defaultPrescriptionFrequency;
            if (followUpDaysEl) followUpDaysEl.value = settings.defaultFollowUpOffsetDays;
            if (followUpTimeEl) followUpTimeEl.value = settings.defaultFollowUpTime;
            if (usageEl) usageEl.value = settings.defaultUsage;
            if (courseEl) courseEl.value = settings.defaultTreatmentCourse;
            if (instructionsEl) instructionsEl.value = settings.defaultInstructions;
            if (!container || !selectedContainer) return;
            const keyword = searchEl && searchEl.value ? String(searchEl.value).trim().toLowerCase() : '';
            const availableBillingItems = (typeof billingItems !== 'undefined' && Array.isArray(billingItems))
              ? billingItems.filter(item => item && item.active)
              : [];
            if (availableBillingItems.length === 0) {
              selectedContainer.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">尚未選擇預設收費項目</div>';
              container.innerHTML = '<div class="text-sm text-gray-500 text-center py-6">未找到可用的收費項目</div>';
              return;
            }
            const categoryLabels = {
              consultation: '診療費',
              medicine: '藥費',
              treatment: '治療費',
              other: '其他',
              discount: '折扣項目',
              package: '套票項目',
              packageUse: '套票使用'
            };
            const selectedIds = settings.defaultBillingItemIds.map(id => String(id));
            const selectedIdSet = new Set(selectedIds);
            const selectedItems = selectedIds
              .map(id => availableBillingItems.find(item => String(item.id) === id))
              .filter(Boolean);
            const makeItemMeta = function(item) {
              const categoryLabel = categoryLabels[item.category] || '未分類';
              const safeCategory = window.escapeHtml ? window.escapeHtml(categoryLabel) : categoryLabel;
              const unitText = item.unit ? ` / ${window.escapeHtml ? window.escapeHtml(String(item.unit)) : String(item.unit)}` : '';
              const priceText = item.category === 'discount' ? '折扣項目' : `$${Number(item.price) || 0}`;
              return { safeCategory, unitText, priceText };
            };
            if (selectedItems.length === 0) {
              selectedContainer.innerHTML = `
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm font-medium text-gray-700">已選擇項目</div>
                  <div class="text-xs text-gray-500">0 項</div>
                </div>
                <div class="text-sm text-gray-500 text-center py-4 border border-dashed border-gray-200 rounded-lg">尚未選擇預設收費項目</div>
              `;
            } else {
              const selectedHtml = selectedItems.map(item => {
                const itemId = String(item.id);
                const safeName = window.escapeHtml ? window.escapeHtml(String(item.name || '')) : String(item.name || '');
                const safeDescription = window.escapeHtml ? window.escapeHtml(String(item.description || '')) : String(item.description || '');
                const meta = makeItemMeta(item);
                return `
                  <div class="flex items-start justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
                    <div class="min-w-0 flex-1">
                      <div class="font-medium text-gray-800">${safeName}</div>
                      <div class="text-xs text-gray-500 mt-1">${meta.safeCategory}${meta.unitText}</div>
                      ${safeDescription ? `<div class="text-xs text-gray-500 mt-1">${safeDescription}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <span class="text-sm font-semibold text-amber-700">${meta.priceText}</span>
                      <button type="button" onclick="removeDiagnosisDefaultBillingItem('${itemId}')" class="px-3 py-1.5 text-sm rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors">移除</button>
                    </div>
                  </div>
                `;
              }).join('');
              selectedContainer.innerHTML = `
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm font-medium text-gray-700">已選擇項目</div>
                  <div class="text-xs text-gray-500">${selectedItems.length} 項</div>
                </div>
                ${selectedHtml}
              `;
            }
            const filteredItems = availableBillingItems
              .filter(item => !selectedIdSet.has(String(item.id)))
              .filter(item => {
                if (!keyword) return false;
                const name = item.name ? String(item.name).toLowerCase() : '';
                const description = item.description ? String(item.description).toLowerCase() : '';
                return name.includes(keyword) || description.includes(keyword);
              })
              .sort((a, b) => {
                const aName = a && a.name ? String(a.name) : '';
                const bName = b && b.name ? String(b.name) : '';
                return aName.localeCompare(bName, 'zh-Hant-HK', { sensitivity: 'base' });
              });
            if (!keyword) {
              container.innerHTML = `
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm font-medium text-gray-700">搜索結果</div>
                  <div class="text-xs text-gray-500">未開始搜尋</div>
                </div>
                <div class="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-lg">請先輸入收費項目名稱或描述進行搜尋</div>
              `;
              return;
            }
            if (filteredItems.length === 0) {
              container.innerHTML = `
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm font-medium text-gray-700">搜索結果</div>
                  <div class="text-xs text-gray-500">0 項</div>
                </div>
                <div class="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-lg">找不到符合條件的收費項目</div>
              `;
              return;
            }
            const itemsHtml = filteredItems.map(item => {
              const itemId = String(item.id);
              const safeName = window.escapeHtml ? window.escapeHtml(String(item.name || '')) : String(item.name || '');
              const safeDescription = window.escapeHtml ? window.escapeHtml(String(item.description || '')) : String(item.description || '');
              const meta = makeItemMeta(item);
              const descriptionText = safeDescription ? `<div class="text-xs text-gray-500 mt-1">${safeDescription}</div>` : '';
              return `
                <div class="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors">
                  <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="font-medium text-gray-800">${safeName}</span>
                      <span class="text-sm font-semibold text-amber-700">${meta.priceText}</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">${meta.safeCategory}${meta.unitText}</div>
                    ${descriptionText}
                  </div>
                  <button type="button" onclick="addDiagnosisDefaultBillingItem('${itemId}')" class="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors shrink-0">加入</button>
                </div>
              `;
            }).join('');
            container.innerHTML = `
              <div class="flex items-center justify-between gap-3 px-1 pb-2">
                <div class="text-sm font-medium text-gray-700">搜索結果</div>
                <div class="text-xs text-gray-500">${filteredItems.length} 項</div>
              </div>
              ${itemsHtml}
            `;
          }

          async function saveDiagnosisSettings() {
            const clinicKey = getDiagnosisSettingsClinicKey();
            diagnosisSettingsByClinic = normalizeDiagnosisSettingsMap(diagnosisSettingsByClinic);
            diagnosisSettings = getDiagnosisSettingsFromForm();
            diagnosisSettingsByClinic[clinicKey] = diagnosisSettings;
            window.diagnosisSettingsByClinic = diagnosisSettingsByClinic;
            window.diagnosisSettings = diagnosisSettings;
            await updatePersonalSettings();
            renderDiagnosisSettingsForm(true);
            showToast(`診症設定已保存至「${getCurrentClinicDisplayNameForDiagnosisSettings()}」`, 'success');
          }

        /**
         * 同步個人慣用組合分類與全域分類。
         * 當更新 categories.herbs 或 categories.acupoints 時，
         * 如果個人分類尚未設定或者與全域分類保持一致，
         * 則以最新的全域分類覆蓋個人分類。此函式也會更新對應的 window
         * 變數，以便其他模組立即取得正確的分類資料。
         *
         * @param {string} type - 要同步的分類類型（'herbs' 或 'acupoints'）
         */
        function refreshComboCategories(type) {
          try {
            if (type === 'herbs') {
              // 若個人中藥分類不存在、長度與全域資料不一致，或有任意項目不同，則重新同步
              if (!Array.isArray(herbComboCategories) ||
                  herbComboCategories.length !== (categories.herbs ? categories.herbs.length : 0) ||
                  !herbComboCategories.every((c, idx) => categories.herbs && categories.herbs[idx] === c)) {
                herbComboCategories = Array.isArray(categories.herbs) ? [...categories.herbs] : [];
                window.herbComboCategories = herbComboCategories;
              }
            } else if (type === 'acupoints') {
              // 同步穴位分類，條件同上
              if (!Array.isArray(acupointComboCategories) ||
                  acupointComboCategories.length !== (categories.acupoints ? categories.acupoints.length : 0) ||
                  !acupointComboCategories.every((c, idx) => categories.acupoints && categories.acupoints[idx] === c)) {
                acupointComboCategories = Array.isArray(categories.acupoints) ? [...categories.acupoints] : [];
                window.acupointComboCategories = acupointComboCategories;
              }
            }
          } catch (e) {
            console.error('刷新個人組合分類失敗:', e);
          }

          // 更新分類後，重新建立個人組合搜尋與分類介面，以反映最新的分類資料
          try {
            if (typeof setupPersonalComboSearchAndFilter === 'function') {
              setupPersonalComboSearchAndFilter();
            }
          } catch (_e) {
            // 若初始化失敗，不阻斷流程
          }
        }

/**
 * 刷新模板庫的分類篩選下拉選單。
 * 此函式會根據最新的 categories.prescriptions 和 categories.diagnosis
 * 更新醫囑模板與診斷模板的分類選擇器，以便在模板庫頁面能夠顯示所有
 * 可用分類進行篩選。若當前選中的值仍存在於新的分類清單中，則維持選中；
 * 否則恢復到預設的「全部類別」或「全部科別」。
 */
function refreshTemplateCategoryFilters() {
  try {
    // 醫囑模板分類篩選
    const pFilter = document.getElementById('prescriptionTemplateCategoryFilter');
    if (pFilter) {
      // 保存目前選中值
      const prevValue = pFilter.value;
      // 清空並添加預設選項
      pFilter.innerHTML = '';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '全部類別';
      defaultOpt.textContent = '全部類別';
      pFilter.appendChild(defaultOpt);
      // 加入所有醫囑分類
      const pCats = (categories && Array.isArray(categories.prescriptions)) ? categories.prescriptions : [];
      pCats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        pFilter.appendChild(opt);
      });
      // 恢復先前選項（若仍存在）
      if (prevValue && Array.from(pFilter.options).some(o => o.value === prevValue)) {
        pFilter.value = prevValue;
      } else {
        pFilter.value = '全部類別';
      }
    }
    // 診斷模板分類篩選
    const dFilter = document.getElementById('diagnosisTemplateCategoryFilter');
    if (dFilter) {
      const prevValue2 = dFilter.value;
      dFilter.innerHTML = '';
      const defaultOpt2 = document.createElement('option');
      // 使用原本的預設文案為「全部科別」，若需要亦可使用「全部分類」
      defaultOpt2.value = '全部科別';
      defaultOpt2.textContent = '全部科別';
      dFilter.appendChild(defaultOpt2);
      const dCats = (categories && Array.isArray(categories.diagnosis)) ? categories.diagnosis : [];
      dCats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        dFilter.appendChild(opt);
      });
      if (prevValue2 && Array.from(dFilter.options).some(o => o.value === prevValue2)) {
        dFilter.value = prevValue2;
      } else {
        dFilter.value = '全部科別';
      }
    }
  } catch (e) {
    console.error('刷新模板分類篩選下拉選單失敗:', e);
  }
}

        /**
         * 從 Firebase 初始化分類資料。
         * 嘗試讀取位於 'categories/default' 的文檔，若不存在則寫入當前預設分類。
         * 讀取成功後會更新 categories 物件以及 window.categories。
         */
        async function initCategoryData() {
          // 優先從本地載入分類資料
          let stored;
          try {
            stored = localStorage.getItem('categories');
            if (stored) {
              const localData = JSON.parse(stored);
              if (localData && typeof localData === 'object') {
                if (Array.isArray(localData.herbs)) categories.herbs = localData.herbs;
                if (Array.isArray(localData.acupoints)) categories.acupoints = localData.acupoints;
                if (Array.isArray(localData.prescriptions)) categories.prescriptions = localData.prescriptions;
                if (Array.isArray(localData.diagnosis)) categories.diagnosis = localData.diagnosis;
                // 更新全域引用
                window.categories = categories;
                // 更新模板庫分類篩選下拉選單，以顯示最新的醫囑與診斷分類
                if (typeof refreshTemplateCategoryFilters === 'function') {
                  try {
                    refreshTemplateCategoryFilters();
                  } catch (_e) {}
                }
              }
            }
          } catch (err) {
            console.error('從本地載入分類資料失敗:', err);
          }

          // 如果本地已經載入分類資料，則不再從 Firebase 讀取，減少讀取量
          if (stored) {
            return;
          }

          // 若 Firebase 未定義或缺少 getDoc，則直接結束，使用預設或本地資料
          if (!window.firebase || !window.firebase.getDoc || !window.firebase.doc || !window.firebase.db) {
            return;
          }

          // 等待 Firebase 初始化完成
          await waitForFirebaseDb();
          try {
            const docRef = window.firebase.doc(window.firebase.db, 'categories', 'default');
            const docSnap = await window.firebase.getDoc(docRef);
            if (docSnap && docSnap.exists()) {
              const data = docSnap.data();
              if (data && typeof data === 'object') {
                if (Array.isArray(data.herbs)) {
                  categories.herbs = data.herbs;
                }
                if (Array.isArray(data.acupoints)) {
                  categories.acupoints = data.acupoints;
                }
                if (Array.isArray(data.prescriptions)) {
                  categories.prescriptions = data.prescriptions;
                }
                if (Array.isArray(data.diagnosis)) {
                  categories.diagnosis = data.diagnosis;
                }
              }
            } else {
              // 若文件不存在，初始化一份包含當前分類的文檔
              await window.firebase.setDoc(docRef, {
                herbs: categories.herbs,
                acupoints: categories.acupoints,
                prescriptions: categories.prescriptions,
                diagnosis: categories.diagnosis
              });
            }
            // 更新全域引用
            window.categories = categories;
            // 更新模板庫分類篩選下拉選單，以顯示最新的醫囑與診斷分類
            if (typeof refreshTemplateCategoryFilters === 'function') {
              try {
                refreshTemplateCategoryFilters();
              } catch (_e) {}
            }
          } catch (error) {
            console.error('讀取/初始化分類資料失敗:', error);
          }
        }

        /**
         * 將最新的分類資料寫入 Firebase。
         * 這會覆蓋存儲在 'categories/default' 文檔中的 existing 資料。
         */
        async function saveCategoriesToFirebase() {
          try {
            // Firebase 不再使用：僅將分類資料儲存至 localStorage
            localStorage.setItem('categories', JSON.stringify(categories));
          } catch (err) {
            console.error('保存分類資料至本地失敗:', err);
          }
        }

        /**
         * 將當前分類資料寫入瀏覽器的 localStorage。
         * Firebase 若不可用或寫入失敗，仍可通過此函式確保分類設定不會遺失。
         */
        function persistCategoriesLocally() {
          try {
            localStorage.setItem('categories', JSON.stringify(categories));
          } catch (err) {
            console.error('本地保存分類資料失敗:', err);
          }
        }

          // 數據存儲
          // 移除預設的中藥組合範例，預設為空陣列。
          let herbCombinations = [];

          // 移除預設的穴位組合範例，預設為空陣列。
          let acupointCombinations = [];

          let prescriptionTemplates = [
            {
              id: 1,
              name: '感冒用藥指導模板',
              category: '用藥指導',
              duration: '7天',
              followUp: '3天後',
              content: '服藥方法：每日三次，飯後30分鐘溫服。服藥期間多喝溫開水。避免生冷、油膩、辛辣食物。注意事項：充分休息，避免熬夜。如症狀加重或持續發燒請立即回診。療程安排：建議療程7天，服藥3天後回診評估。',
              note: '',
              lastModified: '2024-02-15'
            }
          ];

          let diagnosisTemplates = [
            {
              id: 1,
              name: '感冒診斷模板',
              category: '內科',
              content: '症狀描述：患者表現為鼻塞、喉嚨痛、咳嗽等症狀。檢查建議：觀察咽部紅腫狀況，測量體溫。治療建議：建議使用疏風解表類中藥，搭配休息和多喝水。復診安排：3天後回診。',
              lastModified: '2024-01-20'
            }
          ];

          // 渲染中藥組合
          function renderHerbCombinations(pageChange = false) {
            const container = document.getElementById('herbCombinationsContainer');
            if (!container) return;
            container.innerHTML = '';
            // 更新中藥組合總數至標籤顯示
            try {
              const totalCount = Array.isArray(herbCombinations)
                ? herbCombinations.filter(item => item && item.name && String(item.name).trim() !== '').length
                : 0;
              const countElem = document.getElementById('herbCount');
              if (countElem) {
                countElem.textContent = String(totalCount);
              }
            } catch (_e) {}
            // 根據搜尋關鍵字與分類篩選清單
            let searchTerm = '';
            ['herbComboSearch', 'searchHerbCombo', 'searchHerbCombination', 'herbComboSearchInput'].some(id => {
              const el = document.getElementById(id);
              if (el) {
                searchTerm = (el.value || '').trim().toLowerCase();
                return true;
              }
              return false;
            });
            let selectedCategory = 'all';
            ['herbComboCategoryFilter', 'herbComboCategory', 'herbComboCategorySelect'].some(id => {
              const el = document.getElementById(id);
              if (el) {
                selectedCategory = el.value;
                return true;
              }
              return false;
            });
            let list = herbCombinations;
            if (searchTerm || (selectedCategory && selectedCategory !== 'all' && selectedCategory !== '')) {
              list = herbCombinations.filter(item => {
                let matchesSearch = true;
                if (searchTerm) {
                  const nameMatch = item.name && item.name.toLowerCase().includes(searchTerm);
                  const descMatch = item.description && item.description.toLowerCase().includes(searchTerm);
                  const ingredientsMatch = Array.isArray(item.ingredients) && item.ingredients.some(ing => {
                    return ing && ing.name && ing.name.toLowerCase().includes(searchTerm);
                  });
                  matchesSearch = nameMatch || descMatch || ingredientsMatch;
                }
                let matchesCategory = true;
                if (selectedCategory && selectedCategory !== 'all' && selectedCategory !== '') {
                  matchesCategory = item.category === selectedCategory;
                }
                return matchesSearch && matchesCategory;
              });
            }
            // 過濾掉未命名的新建組合
            list = Array.isArray(list)
              ? list.filter(item => item && item.name && String(item.name).trim() !== '')
              : [];
            // 分頁邏輯：在非分頁變更情況下重置當前頁至 1
            if (!pageChange) {
              paginationSettings.personalHerbCombos.currentPage = 1;
            }
            const totalItems = Array.isArray(list) ? list.length : 0;
            const itemsPerPage = paginationSettings.personalHerbCombos.itemsPerPage;
            let currentPage = paginationSettings.personalHerbCombos.currentPage;
            const totalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 1;
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.personalHerbCombos.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = Array.isArray(list) ? list.slice(startIdx, endIdx) : [];
            if (!pageItems || pageItems.length === 0) {
              // 無資料顯示提示並隱藏分頁
              container.innerHTML = '<div class="w-full md:col-span-2 text-center text-gray-400 text-lg py-10">創建自己的組合</div>';
              const paginEl = ensurePaginationContainer('herbCombinationsContainer', 'herbCombosPagination');
              if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
              }
              return;
            }
            // 渲染當前頁項目
            pageItems.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-green-200';
              const category = item && item.category ? item.category : '';
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-green-800">${window.escapeHtml(item.name)}</h3>
                    <div class="text-xs text-green-600 mt-1">${window.escapeHtml(category)}</div>
                  </div>
                  <div class="flex gap-2">
                    <button type="button" class="text-blue-600 hover:text-blue-800 text-sm" data-action="edit-herb-combo" data-id="${window.escapeHtml(String(item.id))}">編輯</button>
                    <button type="button" class="text-red-600 hover:text-red-800 text-sm" data-action="delete-herb-combo" data-id="${window.escapeHtml(String(item.id))}">刪除</button>
                  </div>
                </div>
                <p class="text-gray-600 mb-3">${window.escapeHtml(item.description || '')}</p>
                <div class="text-sm text-gray-700 space-y-1">
                  ${(Array.isArray(item.ingredients) ? item.ingredients : []).map(ing => {
                    const dosage = ing && ing.dosage ? String(ing.dosage).trim() : '';
                    const displayDosage = dosage ? (dosage + '克') : '';
                    const nameVal = ing && ing.name ? ing.name : '';
                    // 取得該藥材的提示內容並編碼
                    const tooltipContent = getHerbTooltipContent(nameVal);
                    const encoded = tooltipContent ? encodeURIComponent(tooltipContent) : '';
                    let attrs = '';
                    if (tooltipContent) {
                      // 名稱與劑量為可輸入資料，一律跳脫；tooltip 為 encodeURIComponent 輸出
                      attrs = ' data-tooltip="' + encoded + '" onmouseenter="showTooltip(event, this.getAttribute(\'data-tooltip\'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"';
                    }
                    return '<div class="flex justify-between items-center p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded text-sm"' + attrs + '>' +
                      '<span class="text-green-800">' + window.escapeHtml(nameVal) + '</span>' +
                      '<span class="text-green-600">' + window.escapeHtml(displayDosage) + '</span>' +
                      '</div>';
                  }).join('')}
                </div>
              `;
              // 以事件綁定取代 inline onclick，避免組合名稱含引號時注入
              const editBtn = card.querySelector('button[data-action="edit-herb-combo"]');
              if (editBtn) editBtn.addEventListener('click', () => {
                const target = herbCombinations.find(h => String(h.id) === editBtn.getAttribute('data-id'));
                if (target) showEditModal('herb', target.name);
              });
              const delBtn = card.querySelector('button[data-action="delete-herb-combo"]');
              if (delBtn) delBtn.addEventListener('click', () => {
                deleteHerbCombination(Number(delBtn.getAttribute('data-id')));
              });
              container.appendChild(card);
            });
            // 分頁控制元件
            const paginEl = ensurePaginationContainer('herbCombinationsContainer', 'herbCombosPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
              paginationSettings.personalHerbCombos.currentPage = newPage;
              renderHerbCombinations(true);
            }, paginEl);
          }

          function addNewHerbCombination() {
            // 使用編輯介面新增藥方組合：建立一個空白項目並立即打開編輯視窗
            // 建立一個新的藥方組合，標記為 isNew 以便取消時移除
            const newItem = {
              id: Date.now(),
              // 新項目預設名稱為空，使用者可在編輯視窗中填寫
              name: '',
              // 預設分類採用個人慣用藥方組合分類，若無則回退至全域分類，如果兩者皆無則空字串
              category: (typeof herbComboCategories !== 'undefined' && herbComboCategories.length > 0)
                ? herbComboCategories[0]
                : ((typeof categories !== 'undefined' && categories.herbs && categories.herbs.length > 0) ? categories.herbs[0] : ''),
              description: '',
              ingredients: [],
              lastModified: new Date().toISOString().split('T')[0],
              // 標記此組合為新建，用於取消時回收
              isNew: true
            };
            // 將新組合暫存到列表
            herbCombinations.push(newItem);
            // 渲染並立即開啟編輯介面，讓使用者填寫詳細資料
            renderHerbCombinations();
            showEditModal('herb', newItem.name);
          }


async function deleteHerbCombination(id) {
            // 刪除藥方組合確認訊息支援中英文
            {
              const lang = localStorage.getItem('lang') || 'zh';
              const zhMsg = '確定要刪除此藥方組合嗎？';
              const enMsg = 'Are you sure you want to delete this herb combination?';
              const confirmed = await showConfirmation(lang === 'en' ? enMsg : zhMsg, 'warning');
              if (!confirmed) return;
            }
            herbCombinations = herbCombinations.filter(h => h.id !== id);
            renderHerbCombinations();
            // Persist changes for personal herb combinations
            if (typeof updatePersonalSettings === 'function') {
              try {
                updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
              } catch (_e) {}
            }
          }

          // 渲染穴位組合
          function renderAcupointCombinations(pageChange = false) {
            // 根據搜尋關鍵字與分類篩選並渲染個人慣用穴位組合。
            const container = document.getElementById('acupointCombinationsContainer');
            if (!container) return;
            container.innerHTML = '';
            // 更新穴位組合總數至標籤顯示
            try {
              const totalCount = Array.isArray(acupointCombinations)
                ? acupointCombinations.filter(item => item && item.name && String(item.name).trim() !== '').length
                : 0;
              const countElem = document.getElementById('acupointCount');
              if (countElem) {
                countElem.textContent = String(totalCount);
              }
            } catch (_e) {}
            // 取得搜尋字串，支援多個可能的輸入框 ID。
            let searchTerm = '';
            ['acupointComboSearch', 'searchAcupointCombo', 'acupointComboSearchInput'].some(id => {
              const el = document.getElementById(id);
              if (el) {
                searchTerm = (el.value || '').trim().toLowerCase();
                return true;
              }
              return false;
            });
            // 取得分類篩選值，預設為 'all'。
            let selectedCategory = 'all';
            ['acupointComboCategoryFilter', 'acupointComboCategory', 'acupointComboCategorySelect'].some(id => {
              const el = document.getElementById(id);
              if (el) {
                selectedCategory = el.value;
                return true;
              }
              return false;
            });
            // 篩選資料：依據搜尋字串和分類。
            let list = acupointCombinations;
            if (searchTerm || (selectedCategory && selectedCategory !== 'all' && selectedCategory !== '')) {
              list = acupointCombinations.filter(item => {
                // 搜尋：比對名稱、針法與穴位名稱或類型。
                let matchesSearch = true;
                if (searchTerm) {
                  const nameMatch = (item.name && item.name.toLowerCase().includes(searchTerm));
                  const techniqueMatch = (item.technique && item.technique.toLowerCase().includes(searchTerm));
                  const pointsMatch = Array.isArray(item.points) && item.points.some(pt => {
                    // 搜尋穴位名稱
                    return pt && pt.name && pt.name.toLowerCase().includes(searchTerm);
                  });
                  matchesSearch = nameMatch || techniqueMatch || pointsMatch;
                }
                // 分類條件：只有在選定特定分類時才生效。
                let matchesCategory = true;
                if (selectedCategory && selectedCategory !== 'all' && selectedCategory !== '') {
                  matchesCategory = item.category === selectedCategory;
                }
                return matchesSearch && matchesCategory;
              });
            }
            // 過濾掉未命名的新建組合，避免顯示空白卡片
            list = Array.isArray(list)
              ? list.filter(item => item && item.name && String(item.name).trim() !== '')
              : [];
            // 分頁邏輯：非分頁變更時將頁數重置為 1
            if (!pageChange) {
              paginationSettings.personalAcupointCombos.currentPage = 1;
            }
            const totalItems = Array.isArray(list) ? list.length : 0;
            const itemsPerPage = paginationSettings.personalAcupointCombos.itemsPerPage;
            let currentPage = paginationSettings.personalAcupointCombos.currentPage;
            const totalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 1;
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.personalAcupointCombos.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = Array.isArray(list) ? list.slice(startIdx, endIdx) : [];
            if (!pageItems || pageItems.length === 0) {
              container.innerHTML = '<div class="w-full md:col-span-2 text-center text-gray-400 text-lg py-10">創建自己的組合</div>';
              const paginEl = ensurePaginationContainer('acupointCombinationsContainer', 'acupointCombosPagination');
              if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
              }
              return;
            }
            // 渲染當前頁資料
            pageItems.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-blue-200';
              const category = item && item.category ? item.category : '';
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-blue-800">${window.escapeHtml(item.name)}</h3>
                    <div class="text-xs text-blue-600 mt-1">${window.escapeHtml(category)}</div>
                  </div>
                  <div class="flex gap-2">
                    <button type="button" class="text-blue-600 hover:text-blue-800 text-sm" data-action="edit-acupoint-combo" data-id="${window.escapeHtml(String(item.id))}">編輯</button>
                    <button type="button" class="text-red-600 hover:text-red-800 text-sm" data-action="delete-acupoint-combo" data-id="${window.escapeHtml(String(item.id))}">刪除</button>
                  </div>
                </div>
                <div class="text-sm text-gray-700 space-y-1">
                  ${(Array.isArray(item.points) ? item.points : []).map(pt => {
                    const nameVal = pt && pt.name ? pt.name : '';
                    const tooltipContent = getAcupointTooltipContent(nameVal);
                    const encoded = tooltipContent ? encodeURIComponent(tooltipContent) : '';
                    let attrs = '';
                    if (tooltipContent) {
                      attrs = ' data-tooltip="' + encoded + '" onmouseenter="showTooltip(event, this.getAttribute(\'data-tooltip\'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"';
                    }
                    return '<div class="flex items-center p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-sm"' + attrs + '>' +
                      '<span class="text-blue-800">' + window.escapeHtml(nameVal) + '</span>' +
                      '</div>';
                  }).join('')}
                </div>
                <div class="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
                  <p>針法：${window.escapeHtml(item.technique || '')}</p>
                </div>
              `;
              // 以事件綁定取代 inline onclick，避免組合名稱含引號時注入
              const editBtn = card.querySelector('button[data-action="edit-acupoint-combo"]');
              if (editBtn) editBtn.addEventListener('click', () => {
                const target = acupointCombinations.find(a => String(a.id) === editBtn.getAttribute('data-id'));
                if (target) showEditModal('acupoint', target.name);
              });
              const delBtn = card.querySelector('button[data-action="delete-acupoint-combo"]');
              if (delBtn) delBtn.addEventListener('click', () => {
                deleteAcupointCombination(Number(delBtn.getAttribute('data-id')));
              });
              container.appendChild(card);
            });
            // 分頁控制
            const paginEl = ensurePaginationContainer('acupointCombinationsContainer', 'acupointCombosPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
              paginationSettings.personalAcupointCombos.currentPage = newPage;
              renderAcupointCombinations(true);
            }, paginEl);
          }

          function addNewAcupointCombination() {
            // 使用編輯介面新增穴位組合：建立一個空白項目並立即打開編輯視窗
            // 建立一個新的穴位組合，標記為 isNew 以便取消時移除
            const newItem = {
              id: Date.now(),
              name: '',
              // 預設分類採用個人慣用穴位組合分類，若無則回退至全域分類，如果兩者皆無則空字串
              category: (typeof acupointComboCategories !== 'undefined' && acupointComboCategories.length > 0)
                ? acupointComboCategories[0]
                : ((typeof categories !== 'undefined' && categories.acupoints && categories.acupoints.length > 0) ? categories.acupoints[0] : ''),
              points: [],
              technique: '',
              frequency: '低',
              lastModified: new Date().toISOString().split('T')[0],
              isNew: true
            };
            // 將新組合暫存到列表
            acupointCombinations.push(newItem);
            renderAcupointCombinations();
            showEditModal('acupoint', newItem.name);
          }


async function deleteAcupointCombination(id) {
            // 刪除穴位組合確認訊息支援中英文
            {
              const lang = localStorage.getItem('lang') || 'zh';
              const zhMsg = '確定要刪除此穴位組合嗎？';
              const enMsg = 'Are you sure you want to delete this acupuncture combination?';
              const confirmed = await showConfirmation(lang === 'en' ? enMsg : zhMsg, 'warning');
              if (!confirmed) return;
            }
            acupointCombinations = acupointCombinations.filter(a => a.id !== id);
            renderAcupointCombinations();
            // Persist changes for personal acupoint combinations
            if (typeof updatePersonalSettings === 'function') {
              try {
                updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
              } catch (_e) {}
            }
          }

        /**
         * 初始化個人常用中藥與穴位組合的搜尋與分類篩選界面。
         * 此函式會在個人設定介面上動態插入搜尋框與分類下拉選單，
         * 並根據當前的個人分類（herbComboCategories、acupointComboCategories）
         * 產生選項。若已存在對應的元素，將會更新其選項內容。
         *
         * 調用本函式可確保搜尋與分類介面與最新分類保持同步。
         */
        function setupPersonalComboSearchAndFilter() {
          try {
            // 中藥組合區域：若畫面已含搜尋輸入框與分類下拉選單，僅更新選項；否則建立之
            const herbContainer = document.getElementById('herbCombinationsContainer');
            if (herbContainer) {
              const existingSearch = document.getElementById('herbComboSearchInput');
              const existingSelect = document.getElementById('herbComboCategoryFilter');
              if (existingSearch && existingSelect) {
                // 清空現有分類選項後重新建立，以符合最新分類
                existingSelect.innerHTML = '';
                const defaultOpt = document.createElement('option');
                defaultOpt.value = 'all';
                defaultOpt.textContent = '全部分類';
                existingSelect.appendChild(defaultOpt);
                const herbCats = (typeof herbComboCategories !== 'undefined' && Array.isArray(herbComboCategories) && herbComboCategories.length > 0)
                  ? herbComboCategories
                  : ((categories && Array.isArray(categories.herbs)) ? categories.herbs : []);
                herbCats.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = cat;
                  opt.textContent = cat;
                  existingSelect.appendChild(opt);
                });
                // 不重複綁定事件，事件監聽在初始化後會統一添加
              } else {
                // 若尚未建立搜尋區塊（例如舊畫面），維持原先邏輯建立搜索欄與分類選單
                let herbWrapper = document.getElementById('herbComboSearchWrapper');
                if (!herbWrapper) {
                  herbWrapper = document.createElement('div');
                  herbWrapper.id = 'herbComboSearchWrapper';
                  herbWrapper.className = 'flex flex-wrap gap-2 mb-4';
                  herbContainer.parentNode.insertBefore(herbWrapper, herbContainer);
                }
                herbWrapper.innerHTML = '';
                const herbSearchInput = document.createElement('input');
                herbSearchInput.id = 'herbComboSearchInput';
                herbSearchInput.className = 'px-3 py-2 border border-gray-300 rounded flex-1';
                herbSearchInput.placeholder = '搜索常用藥方...';
                herbWrapper.appendChild(herbSearchInput);
                const herbSelect = document.createElement('select');
                herbSelect.id = 'herbComboCategoryFilter';
                herbSelect.className = 'px-3 py-2 border border-gray-300 rounded';
                const defOpt = document.createElement('option');
                defOpt.value = 'all';
                defOpt.textContent = '全部分類';
                herbSelect.appendChild(defOpt);
                const herbCats2 = (typeof herbComboCategories !== 'undefined' && Array.isArray(herbComboCategories) && herbComboCategories.length > 0)
                  ? herbComboCategories
                  : ((categories && Array.isArray(categories.herbs)) ? categories.herbs : []);
                herbCats2.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = cat;
                  opt.textContent = cat;
                  herbSelect.appendChild(opt);
                });
                herbWrapper.appendChild(herbSelect);
                // 為新建立的搜尋與分類選單綁定事件，以即時刷新列表
                try {
                  herbSearchInput.addEventListener('input', function() {
                    if (typeof renderHerbCombinations === 'function') {
                      renderHerbCombinations();
                    }
                  });
                } catch (_e) {}
                try {
                  herbSelect.addEventListener('change', function() {
                    if (typeof renderHerbCombinations === 'function') {
                      renderHerbCombinations();
                    }
                  });
                } catch (_e) {}
              }
            }
            // 穴位組合區域：若畫面已有搜尋輸入框與分類下拉選單，僅更新選項；否則建立之
            const acupointContainer = document.getElementById('acupointCombinationsContainer');
            if (acupointContainer) {
              const existingAcuSearch = document.getElementById('acupointComboSearchInput');
              const existingAcuSelect = document.getElementById('acupointComboCategoryFilter');
              if (existingAcuSearch && existingAcuSelect) {
                existingAcuSelect.innerHTML = '';
                const acuDefaultOpt = document.createElement('option');
                acuDefaultOpt.value = 'all';
                acuDefaultOpt.textContent = '全部分類';
                existingAcuSelect.appendChild(acuDefaultOpt);
                const acuCats = (typeof acupointComboCategories !== 'undefined' && Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0)
                  ? acupointComboCategories
                  : ((categories && Array.isArray(categories.acupoints)) ? categories.acupoints : []);
                acuCats.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = cat;
                  opt.textContent = cat;
                  existingAcuSelect.appendChild(opt);
                });
                // 不重複綁定事件；統一在其他地方綁定
              } else {
                // 舊邏輯建立
                let acuWrapper = document.getElementById('acupointComboSearchWrapper');
                if (!acuWrapper) {
                  acuWrapper = document.createElement('div');
                  acuWrapper.id = 'acupointComboSearchWrapper';
                  acuWrapper.className = 'flex flex-wrap gap-2 mb-4';
                  acupointContainer.parentNode.insertBefore(acuWrapper, acupointContainer);
                }
                acuWrapper.innerHTML = '';
                const acuSearchInput = document.createElement('input');
                acuSearchInput.id = 'acupointComboSearchInput';
                acuSearchInput.className = 'px-3 py-2 border border-gray-300 rounded flex-1';
                acuSearchInput.placeholder = '搜索常用穴位組合...';
                acuWrapper.appendChild(acuSearchInput);
                const acuSelect = document.createElement('select');
                acuSelect.id = 'acupointComboCategoryFilter';
                acuSelect.className = 'px-3 py-2 border border-gray-300 rounded';
                const acuDefOpt = document.createElement('option');
                acuDefOpt.value = 'all';
                acuDefOpt.textContent = '全部分類';
                acuSelect.appendChild(acuDefOpt);
                const acuCats2 = (typeof acupointComboCategories !== 'undefined' && Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0)
                  ? acupointComboCategories
                  : ((categories && Array.isArray(categories.acupoints)) ? categories.acupoints : []);
                acuCats2.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = cat;
                  opt.textContent = cat;
                  acuSelect.appendChild(opt);
                });
                acuWrapper.appendChild(acuSelect);
                // 綁定事件至新建立的穴位搜尋與分類選單
                try {
                  acuSearchInput.addEventListener('input', function() {
                    if (typeof renderAcupointCombinations === 'function') {
                      renderAcupointCombinations();
                    }
                  });
                } catch (_e) {}
                try {
                  acuSelect.addEventListener('change', function() {
                    if (typeof renderAcupointCombinations === 'function') {
                      renderAcupointCombinations();
                    }
                  });
                } catch (_e) {}
              }
            }
          } catch (error) {
            console.error('初始化個人組合搜尋分類介面錯誤:', error);
          }
        }

          // -----------------------------------------------------------------------------
          // 個人設置相關函式與常用組合載入
          //
          // 讀取並保存當前用戶的個人設置（慣用中藥組合及穴位組合）到 Firebase。
          // 這些函式不會阻塞主要流程，但會在登入後載入使用者的個人設定，
          // 並在任何修改時更新至 Firestore。也提供 UI 彈窗讓診症時快速載入
          // 慣用組合。

          /**
           * 從 Firestore 載入當前用戶的個人設置，包括慣用中藥組合與穴位組合。
           * 如果未找到任何設定，則使用當前的預設數據或維持空陣列。
           */
          async function loadPersonalSettings() {
            try {
              // 等待 Firebase 與資料管理器初始化
              await waitForFirebaseDb();
              await waitForFirebaseDataManager();
              // 若沒有當前用戶資料，直接結束
              if (!currentUserData || !currentUserData.id) {
                return;
              }
              /*
               * 優先嘗試利用 Firestore 的 getDoc API 直接讀取當前用戶的文件，
               * 以避免拉取所有用戶資料。如果 getDoc 不存在或失敗，則退回
               * 到透過 FirebaseDataManager.getUsers() 取得用戶清單後再篩選，
               * 以確保兼容舊環境。
               */
              let userRecord = null;
              // 嘗試直接讀取當前用戶的文件
              try {
                if (window.firebase && window.firebase.getDoc && window.firebase.doc) {
                  const docRef = window.firebase.doc(window.firebase.db, 'users', String(currentUserData.id));
                  const docSnap = await window.firebase.getDoc(docRef);
                  if (docSnap && docSnap.exists()) {
                    userRecord = { id: docSnap.id, ...docSnap.data() };
                  }
                }
              } catch (err) {
                console.error('直接讀取用戶文件時發生錯誤:', err);
              }
              // 若無法直接取得，改為從用戶清單中篩選
              if (!userRecord) {
                try {
                  // 透過 fetchUsers(true) 獲取用戶列表，並以快取降低讀取頻率
                  const userList = await fetchUsers(true);
                  if (Array.isArray(userList) && userList.length > 0) {
                    userRecord = userList.find(u => {
                      const idMatches = u && u.id !== undefined && currentUserData.id !== undefined;
                      return idMatches && String(u.id) === String(currentUserData.id);
                    });
                  }
                } catch (err) {
                  console.error('讀取用戶資料時發生錯誤:', err);
                }
              }
              if (userRecord && userRecord.personalSettings) {
                const personal = userRecord.personalSettings;
                // 如果有保存的個人慣用中藥組合，則載入，否則清空
                if (Array.isArray(personal.herbCombinations)) {
                  herbCombinations = personal.herbCombinations;
                } else {
                  herbCombinations = [];
                }
                // 如果有保存的個人穴位組合，則載入，否則清空
                if (Array.isArray(personal.acupointCombinations)) {
                  acupointCombinations = personal.acupointCombinations;
                } else {
                  acupointCombinations = [];
                }
                // 個人慣用組合分類載入：若 personalSettings 中包含分類，則覆蓋預設值；否則重置個人分類
                if (Array.isArray(personal.herbComboCategories)) {
                  // 更新個人慣用分類
                  herbComboCategories = personal.herbComboCategories;
                  window.herbComboCategories = herbComboCategories;
                  try {
                    // 同步至全域 categories，確保管理分類彈窗能顯示已保存分類
                    categories.herbs = [...herbComboCategories];
                    if (window.categories && Array.isArray(window.categories.herbs)) {
                      window.categories.herbs = categories.herbs;
                    }
                  } catch (_e) {}
                } else {
                  // 沒有個人分類時，清空個人分類，以免殘留前一位使用者的資料
                  herbComboCategories = [];
                  window.herbComboCategories = [];
                }
                if (Array.isArray(personal.acupointComboCategories)) {
                  // 更新個人慣用分類
                  acupointComboCategories = personal.acupointComboCategories;
                  window.acupointComboCategories = acupointComboCategories;
                  try {
                    // 同步至全域 categories，確保管理分類彈窗能顯示已保存分類
                    categories.acupoints = [...acupointComboCategories];
                    if (window.categories && Array.isArray(window.categories.acupoints)) {
                      window.categories.acupoints = categories.acupoints;
                    }
                  } catch (_e) {}
                } else {
                  // 沒有個人分類時，清空個人分類
                  acupointComboCategories = [];
                  window.acupointComboCategories = [];
                }
                diagnosisSettingsByClinic = normalizeDiagnosisSettingsMap(personal.diagnosisSettingsByClinic);
                if ((!diagnosisSettingsByClinic || Object.keys(diagnosisSettingsByClinic).length === 0) && personal.diagnosisSettings) {
                  diagnosisSettingsByClinic = {
                    [getDiagnosisSettingsClinicKey()]: normalizeDiagnosisSettings(personal.diagnosisSettings)
                  };
                }
                diagnosisSettings = normalizeDiagnosisSettings(diagnosisSettingsByClinic[getDiagnosisSettingsClinicKey()]);
                window.diagnosisSettingsByClinic = diagnosisSettingsByClinic;
                window.diagnosisSettings = diagnosisSettings;
              } else {
                // 如果找不到用戶記錄或用戶沒有個人設置，則將相關資料清空
                herbCombinations = [];
                acupointCombinations = [];
                herbComboCategories = [];
                acupointComboCategories = [];
                window.herbComboCategories = [];
                window.acupointComboCategories = [];
                diagnosisSettingsByClinic = {};
                window.diagnosisSettingsByClinic = diagnosisSettingsByClinic;
                diagnosisSettings = getDefaultDiagnosisSettings();
                window.diagnosisSettings = diagnosisSettings;
              }
            } catch (error) {
              console.error('讀取個人設置失敗:', error);
            } finally {
              // 渲染 UI 以反映載入結果
              try {
                if (typeof renderHerbCombinations === 'function') {
                  renderHerbCombinations();
                }
                if (typeof renderAcupointCombinations === 'function') {
                  renderAcupointCombinations();
                }
                // 在載入個人設定後刷新搜尋與分類介面，確保選單與最新資料同步
                if (typeof setupPersonalComboSearchAndFilter === 'function') {
                  try {
                    setupPersonalComboSearchAndFilter();
                  } catch (_e) {}
                }
                if (typeof renderDiagnosisSettingsForm === 'function') {
                  try {
                    renderDiagnosisSettingsForm(true);
                  } catch (_e) {}
                }
              } catch (e) {
                console.error('渲染個人設置失敗:', e);
              }
            }
          }

          /**
           * 將當前的個人設置保存至 Firestore。
           * 包含慣用中藥組合、穴位組合及診症預設設定。
           */
          async function updatePersonalSettings() {
            try {
              await waitForFirebaseDb();
              if (!currentUserData || !currentUserData.id) {
                return;
              }
              await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'users', String(currentUserData.id)),
                {
                  personalSettings: {
                    herbCombinations: Array.isArray(herbCombinations) ? herbCombinations : [],
                    acupointCombinations: Array.isArray(acupointCombinations) ? acupointCombinations : [],
                    // 保存個人分類：中藥組合分類與穴位組合分類
                    herbComboCategories: Array.isArray(herbComboCategories) ? herbComboCategories : [],
                    acupointComboCategories: Array.isArray(acupointComboCategories) ? acupointComboCategories : [],
                    diagnosisSettingsByClinic: normalizeDiagnosisSettingsMap(diagnosisSettingsByClinic),
                    diagnosisSettings: normalizeDiagnosisSettings(diagnosisSettings)
                  },
                  updatedAt: new Date(),
                  updatedBy: currentUser || 'system'
                }
              );
            } catch (error) {
              console.error('更新個人設置至雲端資料庫失敗:', error);
            }
          }

          /**
           * 顯示常用藥方組合選擇彈窗。列出所有個人慣用中藥組合供選擇。
           */
          function showHerbComboModal() {
            try {
              const modal = document.getElementById('herbComboModal');
              const listContainer = document.getElementById('herbComboList');
              if (!modal || !listContainer) return;
              // 在列表上方放置搜尋欄與分類欄，若尚未存在則建立
              let filterBar = modal.querySelector('#herbComboFilterBar');
              let searchInput = modal.querySelector('#herbComboSearch');
              let categorySelect = modal.querySelector('#herbComboModalCategoryFilter');
              if (!filterBar) {
                filterBar = document.createElement('div');
                filterBar.id = 'herbComboFilterBar';
                filterBar.className = 'mb-3 flex items-center gap-2';
                searchInput = document.createElement('input');
                searchInput.id = 'herbComboSearch';
                searchInput.type = 'text';
                searchInput.placeholder = '搜尋常用藥方...';
                searchInput.className = 'flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded';
                categorySelect = document.createElement('select');
                categorySelect.id = 'herbComboModalCategoryFilter';
                categorySelect.className = 'w-36 px-3 py-2 border border-gray-300 rounded bg-white';
                filterBar.appendChild(searchInput);
                filterBar.appendChild(categorySelect);
                listContainer.parentNode.insertBefore(filterBar, listContainer);
                searchInput.addEventListener('input', function() {
                  // 重新渲染列表
                  showHerbComboModal();
                });
                categorySelect.addEventListener('change', function() {
                  showHerbComboModal();
                });
              }
              listContainer.innerHTML = '';
              // 過濾掉名稱為空白或未命名的組合，避免顯示錯誤資料
              let combos = Array.isArray(herbCombinations)
                ? herbCombinations.filter(c => c && c.name && String(c.name).trim() !== '')
                : [];
              // 分類來源：個人設置的 herbComboCategories
              if (categorySelect) {
                const selectedCategory = categorySelect.value || '全部分類';
                const categorySource = Array.isArray(herbComboCategories) ? herbComboCategories.filter(Boolean) : [];
                categorySelect.innerHTML = '';
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '全部分類';
                defaultOpt.textContent = '全部分類';
                categorySelect.appendChild(defaultOpt);
                categorySource.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = String(cat);
                  opt.textContent = String(cat);
                  categorySelect.appendChild(opt);
                });
                categorySelect.value = Array.from(categorySelect.options).some(opt => opt.value === selectedCategory) ? selectedCategory : '全部分類';
              }
              // 取得搜尋關鍵字
              const herbKeyword = searchInput.value ? String(searchInput.value).trim().toLowerCase() : '';
              const activeCategory = categorySelect && categorySelect.value ? String(categorySelect.value) : '全部分類';
              if (herbKeyword) {
                combos = combos.filter(combo => {
                  const nameStr = combo.name ? combo.name.toLowerCase() : '';
                  // 搜尋名稱或原料
                  let ingredientsStr = '';
                  if (Array.isArray(combo.ingredients)) {
                    ingredientsStr = combo.ingredients.map(ing => (ing && ing.name ? String(ing.name).toLowerCase() : '')).join(' ');
                  }
                  return nameStr.includes(herbKeyword) || ingredientsStr.includes(herbKeyword);
                });
              }
              if (activeCategory && activeCategory !== '全部分類') {
                combos = combos.filter(combo => String((combo && combo.category) || '') === activeCategory);
              }
              if (combos.length === 0) {
                listContainer.innerHTML = '<div class="text-center text-gray-500">尚未設定常用藥方組合</div>';
              } else {
                // 依名稱排序
                combos = combos.slice().sort((a, b) => {
                  const an = a && a.name ? a.name : '';
                  const bn = b && b.name ? b.name : '';
                  return an.localeCompare(bn, 'zh-Hans-CN', { sensitivity: 'base' });
                });
                combos.forEach(combo => {
                  const itemDiv = document.createElement('div');
                  itemDiv.className = 'p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer';
                  // 對名稱與原料進行轉義，避免 XSS
                  const safeComboName = combo.name ? window.escapeHtml(combo.name) : '';
                  const ingredientsText = (combo.ingredients && combo.ingredients.length > 0)
                    ? combo.ingredients.map(ing => {
                        const name = ing && ing.name ? window.escapeHtml(ing.name) : '';
                        if (ing && ing.dosage) {
                          // 將劑量也轉義
                          const safeDosage = window.escapeHtml(String(ing.dosage));
                          return name + '(' + safeDosage + '克)';
                        }
                        return name;
                      }).join('、')
                    : '';
                  itemDiv.innerHTML = `
                    <div class="font-semibold text-gray-800 mb-1">${safeComboName}</div>
                    <div class="text-sm text-gray-600">${ingredientsText}</div>
                  `;
                  itemDiv.onclick = function() {
                    selectHerbCombo(combo.id);
                  };
                  listContainer.appendChild(itemDiv);
                });
              }
              modal.classList.remove('hidden');
            } catch (error) {
              console.error('顯示常用藥方彈窗錯誤:', error);
            }
          }

          function hideHerbComboModal() {
            const modal = document.getElementById('herbComboModal');
            if (modal) modal.classList.add('hidden');
          }

          /**
           * 當選擇某個常用藥方組合時，將其藥材加入當前處方。
           * @param {number} comboId 組合的 ID
           */
          function selectHerbCombo(comboId) {
            try {
              const combo = herbCombinations.find(c => String(c.id) === String(comboId));
              if (!combo) return;
              hideHerbComboModal();
              if (!Array.isArray(combo.ingredients) || combo.ingredients.length === 0) return;
              combo.ingredients.forEach(ing => {
                if (!ing || !ing.name) return;
                const item = herbLibrary.find(h => h.name === ing.name);
                if (item) {
                  const addedItem = addToPrescription(item.type, item.id);
                  try {
                    if (addedItem && ing.dosage) {
                      const numeric = String(ing.dosage).match(/[0-9.]+/);
                      addedItem.customDosage = numeric ? numeric[0] : addedItem.customDosage;
                    }
                  } catch (_e) {}
                } else {
                  const numeric = ing.dosage ? String(ing.dosage).match(/[0-9.]+/) : null;
                  selectedPrescriptionItems.push({
                    id: Date.now() + Math.random(),
                    type: 'herb',
                    name: ing.name,
                    dosage: ing.dosage || '',
                    // For herb combinations without a specified dosage, default to 1 g.
                    customDosage: numeric ? numeric[0] : '1',
                    composition: null,
                    effects: ''
                  });
                }
              });
              updatePrescriptionDisplay();
              showToast('已載入常用藥方組合：' + combo.name, 'success');
            } catch (error) {
              console.error('載入常用藥方組合錯誤:', error);
            }
          }

          /**
           * 顯示常用穴位組合選擇彈窗。
           */
          function showAcupointComboModal() {
            try {
              const modal = document.getElementById('acupointComboModal');
              const listContainer = document.getElementById('acupointComboList');
              if (!modal || !listContainer) return;
              // 在列表上方放置搜尋欄與分類欄，若尚未存在則建立
              let filterBar = modal.querySelector('#acupointComboFilterBar');
              let searchInput = modal.querySelector('#acupointComboSearch');
              let categorySelect = modal.querySelector('#acupointComboModalCategoryFilter');
              if (!filterBar) {
                filterBar = document.createElement('div');
                filterBar.id = 'acupointComboFilterBar';
                filterBar.className = 'mb-3 flex items-center gap-2';
                searchInput = document.createElement('input');
                searchInput.id = 'acupointComboSearch';
                searchInput.type = 'text';
                searchInput.placeholder = '搜尋常用穴位...';
                searchInput.className = 'flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded';
                categorySelect = document.createElement('select');
                categorySelect.id = 'acupointComboModalCategoryFilter';
                categorySelect.className = 'w-36 px-3 py-2 border border-gray-300 rounded bg-white';
                filterBar.appendChild(searchInput);
                filterBar.appendChild(categorySelect);
                listContainer.parentNode.insertBefore(filterBar, listContainer);
                searchInput.addEventListener('input', function() {
                  showAcupointComboModal();
                });
                categorySelect.addEventListener('change', function() {
                  showAcupointComboModal();
                });
              }
              listContainer.innerHTML = '';
              let combos = Array.isArray(acupointCombinations)
                ? acupointCombinations.filter(c => c && c.name && String(c.name).trim() !== '')
                : [];
              // 分類來源：個人設置的 acupointComboCategories
              if (categorySelect) {
                const selectedCategory = categorySelect.value || '全部分類';
                const categorySource = Array.isArray(acupointComboCategories) ? acupointComboCategories.filter(Boolean) : [];
                categorySelect.innerHTML = '';
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '全部分類';
                defaultOpt.textContent = '全部分類';
                categorySelect.appendChild(defaultOpt);
                categorySource.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = String(cat);
                  opt.textContent = String(cat);
                  categorySelect.appendChild(opt);
                });
                categorySelect.value = Array.from(categorySelect.options).some(opt => opt.value === selectedCategory) ? selectedCategory : '全部分類';
              }
              // 搜尋關鍵字
              const acuKeyword = searchInput.value ? String(searchInput.value).trim().toLowerCase() : '';
              const activeCategory = categorySelect && categorySelect.value ? String(categorySelect.value) : '全部分類';
              if (acuKeyword) {
                combos = combos.filter(combo => {
                  const nameStr = combo.name ? combo.name.toLowerCase() : '';
                  // 將穴位名稱串起來供搜尋
                  let pointsStr = '';
                  if (Array.isArray(combo.points)) {
                    pointsStr = combo.points.map(pt => {
                      return pt && pt.name ? String(pt.name).toLowerCase() : '';
                    }).join(' ');
                  }
                  const techniqueStr = combo.technique ? String(combo.technique).toLowerCase() : '';
                  return nameStr.includes(acuKeyword) || pointsStr.includes(acuKeyword) || techniqueStr.includes(acuKeyword);
                });
              }
              if (activeCategory && activeCategory !== '全部分類') {
                combos = combos.filter(combo => String((combo && combo.category) || '') === activeCategory);
              }
              if (combos.length === 0) {
                listContainer.innerHTML = '<div class="text-center text-gray-500">尚未設定常用穴位組合</div>';
              } else {
                // 依名稱排序
                combos = combos.slice().sort((a, b) => {
                  const an = a && a.name ? a.name : '';
                  const bn = b && b.name ? b.name : '';
                  return an.localeCompare(bn, 'zh-Hans-CN', { sensitivity: 'base' });
                });
                combos.forEach(combo => {
                  const itemDiv = document.createElement('div');
                  itemDiv.className = 'p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer';
                  // 組合穴位名稱用於列表顯示（不再顯示主穴/配穴）
                  const pointsText = (combo.points && combo.points.length > 0)
                    ? combo.points.map(pt => {
                        const pName = pt && pt.name ? window.escapeHtml(pt.name) : '';
                        return pName;
                      }).join('、')
                    : '';
                  const safeComboName = combo.name ? window.escapeHtml(combo.name) : '';
                  itemDiv.innerHTML = `
                    <div class="font-semibold text-gray-800 mb-1">${safeComboName}</div>
                    <div class="text-sm text-gray-600">${pointsText}</div>
                  `;
                  itemDiv.onclick = function() {
                    selectAcupointCombo(combo.id);
                  };
                  listContainer.appendChild(itemDiv);
                });
              }
              modal.classList.remove('hidden');
            } catch (error) {
              console.error('顯示常用穴位彈窗錯誤:', error);
            }
          }

          function hideAcupointComboModal() {
            const modal = document.getElementById('acupointComboModal');
            if (modal) modal.classList.add('hidden');
          }

          /**
           * 當選擇某個常用穴位組合時，將其內容填入針灸備註欄。
           * @param {number} comboId 組合的 ID
           */
          function selectAcupointCombo(comboId) {
            try {
              const combo = acupointCombinations.find(c => String(c.id) === String(comboId));
              if (!combo) return;
              hideAcupointComboModal();
              const notesEl = document.getElementById('formAcupunctureNotes');
              if (notesEl) {
                // 若有既有內容，將游標移至末尾，準備插入
                // 使用 addAcupointToNotes 將每個穴位以方塊形式插入
                try {
                  if (Array.isArray(combo.points) && combo.points.length > 0) {
                    combo.points.forEach(pt => {
                      if (pt && pt.name) {
                        addAcupointToNotes(pt.name);
                      }
                    });
                  }
                  // 插入針法文字（如有）
                  if (combo.technique && combo.technique.trim()) {
                    // 新增一個文字節點（含前導文字）
                    const prefix = '針法：';
                    // 若備註區已有內容且末尾不是空白，則添加一個空格分隔
                    const lastChild = notesEl.lastChild;
                    if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
                      // ok
                    } else {
                      // 若最後不是文字節點，先添加一個空格
                      notesEl.appendChild(document.createTextNode(' '));
                    }
                    notesEl.appendChild(document.createTextNode(prefix + combo.technique));
                  }
                  queueConsultationSymptomsDraftSave();
                } catch (_e) {
                  // fallback：若 addAcupointToNotes 執行失敗，則直接將文字插入
                  let noteStr = '';
                  if (Array.isArray(combo.points) && combo.points.length > 0) {
                    noteStr += combo.points.map(pt => pt.name).join('、');
                  }
                  if (combo.technique && combo.technique.trim()) {
                    if (noteStr.length > 0) noteStr += '，';
                    noteStr += '針法：' + combo.technique;
                  }
                  notesEl.innerText = noteStr;
                  queueConsultationSymptomsDraftSave();
                }
              }
              showToast('已載入常用穴位組合：' + combo.name, 'success');
            } catch (error) {
              console.error('載入常用穴位組合錯誤:', error);
            }
          }


          // 渲染醫囑模板
          function renderPrescriptionTemplates(list, pageChange = false) {
            const container = document.getElementById('prescriptionTemplatesContainer');
            container.innerHTML = '';
            // 取得要顯示的模板列表；若傳入特定列表則使用之，否則使用全域列表。
            const templates = Array.isArray(list) ? list : prescriptionTemplates;
            // 過濾掉尚未儲存的新建項目
            const displayTemplates = Array.isArray(templates) ? templates.filter(t => !t.isNew) : [];
            // 更新醫囑模板總數至標籤顯示
            try {
              const totalCount = Array.isArray(prescriptionTemplates)
                ? prescriptionTemplates.filter(p => p && !p.isNew).length
                : 0;
              const countElem = document.getElementById('prescriptionCount');
              if (countElem) {
                // Update the displayed total count
                const newCount = String(totalCount);
                countElem.textContent = newCount;
                /*
                 * Also update the i18n metadata on this element. When switching
                 * languages, the translation script relies on dataset.originalText
                 * to restore the original Chinese text. If this element was
                 * initialised with a placeholder value (e.g. "1") it will be
                 * stored as dataset.originalText and reused whenever the
                 * language toggles, causing the count to revert to that initial
                 * value. By refreshing dataset.originalText with the current
                 * count we ensure the translation logic treats the updated
                 * numeric value as the new "original" and does not revert it.
                 */
                try {
                  if (countElem.dataset) {
                    countElem.dataset.originalText = newCount;
                    // Reset lastLang so translation will re-evaluate this node
                    // the next time the language changes. An empty string
                    // forces translateNode to process the element instead of
                    // skipping it because of a matching lastLang.
                    countElem.dataset.lastLang = '';
                  }
                } catch (_err) {}
              }
            } catch (_e) {}
            // 分頁：若非頁面跳轉則重置至第一頁
            if (!pageChange) {
              paginationSettings.prescriptionTemplates.currentPage = 1;
            }
            const totalItems = displayTemplates.length;
            const itemsPerPage = paginationSettings.prescriptionTemplates.itemsPerPage;
            let currentPage = paginationSettings.prescriptionTemplates.currentPage;
            const totalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 1;
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.prescriptionTemplates.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = displayTemplates.slice(startIdx, endIdx);
            // 若無模板資料
            if (!pageItems || pageItems.length === 0) {
              container.innerHTML = '<div class="text-center text-gray-500 py-8">暫無醫囑模板</div>';
              const paginEl = ensurePaginationContainer('prescriptionTemplatesContainer', 'prescriptionTemplatesPagination');
              if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
              }
              return;
            }
            // 渲染當前頁模板
            pageItems.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-purple-200';
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-purple-800">${window.escapeHtml(item.name || '')}</h3>
                    <div class="flex gap-2 mt-1">
                      <span class="text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded">${window.escapeHtml(item.category || '')}</span>
                      <span class="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">療程: ${window.escapeHtml(item.duration || '')}</span>
                      <span class="text-sm bg-orange-100 text-orange-700 px-2 py-1 rounded">複診: ${window.escapeHtml(item.followUp || '')}</span>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    
                  </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg text-gray-700">
                  ${String(item.content || '').split('\n').map(p => '<p class="mb-2">' + window.escapeHtml(p) + '</p>').join('')}
                </div>
              `;
              container.appendChild(card);
            });
            // 分頁控制
            const paginEl = ensurePaginationContainer('prescriptionTemplatesContainer', 'prescriptionTemplatesPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
              paginationSettings.prescriptionTemplates.currentPage = newPage;
              renderPrescriptionTemplates(templates, true);
            }, paginEl);
          }


          // 渲染診斷模板
          function renderDiagnosisTemplates(list, pageChange = false) {
            const container = document.getElementById('diagnosisTemplatesContainer');
            container.innerHTML = '';
            // 取得要顯示的診斷模板列表；若傳入特定列表則使用之，否則使用全域列表。
            const templates = Array.isArray(list) ? list : diagnosisTemplates;
            // 過濾掉尚未儲存的模板
            const displayTemplates = Array.isArray(templates) ? templates.filter(t => !t.isNew) : [];
            // 更新診斷模板總數至標籤顯示
            try {
              const totalCount = Array.isArray(diagnosisTemplates)
                ? diagnosisTemplates.filter(t => t && !t.isNew).length
                : 0;
              const countElem = document.getElementById('diagnosisCount');
              if (countElem) {
                // Update the displayed total count
                const newCount = String(totalCount);
                countElem.textContent = newCount;
                /*
                 * Refresh the i18n metadata for this element. Without updating
                 * dataset.originalText the translation system will revert this
                 * count back to its initial value (often 1) whenever the
                 * language is toggled. Setting dataset.originalText to the
                 * current count ensures that language switching preserves the
                 * correct value. Resetting dataset.lastLang forces the
                 * translation function to reprocess this element when the
                 * language changes, thereby using the updated originalText.
                 */
                try {
                  if (countElem.dataset) {
                    countElem.dataset.originalText = newCount;
                    countElem.dataset.lastLang = '';
                  }
                } catch (_err) {}
              }
            } catch (_e) {}
            // 分頁：非頁面跳轉時重置頁數
            if (!pageChange) {
              paginationSettings.diagnosisTemplates.currentPage = 1;
            }
            const totalItems = displayTemplates.length;
            const itemsPerPage = paginationSettings.diagnosisTemplates.itemsPerPage;
            let currentPage = paginationSettings.diagnosisTemplates.currentPage;
            const totalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 1;
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.diagnosisTemplates.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = displayTemplates.slice(startIdx, endIdx);
            // 若無資料顯示提示並隱藏分頁
            if (!pageItems || pageItems.length === 0) {
              container.innerHTML = '<div class="text-center text-gray-500 py-8">暫無診斷模板</div>';
              const paginEl = ensurePaginationContainer('diagnosisTemplatesContainer', 'diagnosisTemplatesPagination');
              if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
              }
              return;
            }
            // 渲染當前頁資料
            pageItems.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-orange-200';
              // Build display content for diagnosis template fields.
              // 所有欄位皆為使用者可輸入內容，逐行跳脫後再以 <br> 保留換行
              const escLines = (v) => String(v == null ? '' : v).split('\n')
                .map(l => window.escapeHtml(l)).join('<br>');
              let contentHtml = '';
              if (item.chiefComplaint || item.currentHistory || item.tongue || item.pulse || item.tcmDiagnosis || item.syndromeDiagnosis) {
                const parts = [];
                if (item.chiefComplaint) {
                  parts.push('<p class="mb-2"><strong>主訴：</strong>' + escLines(item.chiefComplaint) + '</p>');
                }
                if (item.currentHistory) {
                  parts.push('<p class="mb-2"><strong>現病史：</strong>' + escLines(item.currentHistory) + '</p>');
                }
                if (item.tongue) {
                  parts.push('<p class="mb-2"><strong>舌象：</strong>' + escLines(item.tongue) + '</p>');
                }
                if (item.pulse) {
                  parts.push('<p class="mb-2"><strong>脈象：</strong>' + escLines(item.pulse) + '</p>');
                }
                if (item.tcmDiagnosis) {
                  parts.push('<p class="mb-2"><strong>中醫診斷：</strong>' + escLines(item.tcmDiagnosis) + '</p>');
                }
                if (item.syndromeDiagnosis) {
                  parts.push('<p class="mb-2"><strong>證型診斷：</strong>' + escLines(item.syndromeDiagnosis) + '</p>');
                }
                contentHtml = parts.join('');
              } else if (item.content) {
                contentHtml = String(item.content).split('\n')
                  .map(p => '<p class="mb-2">' + window.escapeHtml(p) + '</p>').join('');
              }
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-orange-800">${window.escapeHtml(item.name || '')}</h3>
                    <div class="flex gap-2 mt-1">
                      <span class="text-sm bg-orange-100 text-orange-700 px-2 py-1 rounded">${window.escapeHtml(item.category || '')}</span>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    
                  </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg text-gray-700">
                  ${contentHtml}
                </div>
              `;
              container.appendChild(card);
            });
            // 分頁控制
            const paginEl = ensurePaginationContainer('diagnosisTemplatesContainer', 'diagnosisTemplatesPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
              paginationSettings.diagnosisTemplates.currentPage = newPage;
              renderDiagnosisTemplates(templates, true);
            }, paginEl);
          }

          

          /**
           * 初始化模板庫搜尋功能，綁定搜尋和分類變更事件。
           * 根據輸入的名稱關鍵字和選擇的分類篩選醫囑或診斷模板，並重新渲染列表。
           * 使用者輸入或選擇變更時即時觸發。
           */
          function setupTemplateLibrarySearch() {
            try {
              // 醫囑模板搜尋與分類
              const pInput = document.getElementById('prescriptionTemplateSearch');
              const pCategory = document.getElementById('prescriptionTemplateCategoryFilter');
              /**
               * 依據搜尋字串和分類篩選醫囑模板。
               * 以前僅比對模板名稱，現在改為將模板的所有主要欄位合併後進行全文搜尋，
               * 以便使用者能透過內容關鍵字快速找到相關醫囑模板。
               */
              const filterPrescriptions = function() {
                const term = pInput ? pInput.value.trim().toLowerCase() : '';
                const cat = pCategory ? pCategory.value : '';
                let filtered = Array.isArray(prescriptionTemplates) ? prescriptionTemplates.filter(item => {
                  // 全文搜尋：將所有值（字串/數值/陣列）串接並轉小寫
                  if (!term) return true;
                  try {
                    let combined = '';
                    Object.keys(item).forEach(key => {
                      if (['id', 'isNew', 'lastModified'].includes(key)) return;
                      const v = item[key];
                      if (!v) return;
                      if (Array.isArray(v)) {
                        combined += ' ' + v.join(' ');
                      } else if (typeof v === 'string' || typeof v === 'number') {
                        combined += ' ' + String(v);
                      }
                    });
                    combined = combined.toLowerCase();
                    return combined.includes(term);
                  } catch (_e) {
                    return false;
                  }
                }) : [];
                // 若選擇非全部類別，則依據類別進一步篩選
                if (cat && cat !== '全部類別' && cat !== '全部分類') {
                  filtered = filtered.filter(item => item.category === cat);
                }
                // 搜尋或分類變更時將頁碼重置為 1
                paginationSettings.prescriptionTemplates.currentPage = 1;
                renderPrescriptionTemplates(filtered);
              };
              if (pInput) {
                pInput.addEventListener('input', filterPrescriptions);
              }
              if (pCategory) {
                pCategory.addEventListener('change', filterPrescriptions);
              }

              // 診斷模板搜尋與分類
              const dInput = document.getElementById('diagnosisTemplateSearch');
              const dCategory = document.getElementById('diagnosisTemplateCategoryFilter');
              /**
               * 依據搜尋字串和分類篩選診斷模板。
               * 與醫囑模板類似，將模板的主要內容（包含主訴、現病史、舌象、脈象、
               * 中醫診斷、證型診斷及一般 content 欄位）合併為一段文字進行全文搜尋。
               */
              const filterDiagnosis = function() {
                const term = dInput ? dInput.value.trim().toLowerCase() : '';
                const cat = dCategory ? dCategory.value : '';
                let filtered = Array.isArray(diagnosisTemplates) ? diagnosisTemplates.filter(item => {
                  if (!term) return true;
                  try {
                    let combined = '';
                    Object.keys(item).forEach(key => {
                      if (['id', 'isNew', 'lastModified'].includes(key)) return;
                      const v = item[key];
                      if (!v) return;
                      if (Array.isArray(v)) {
                        combined += ' ' + v.join(' ');
                      } else if (typeof v === 'string' || typeof v === 'number') {
                        combined += ' ' + String(v);
                      }
                    });
                    combined = combined.toLowerCase();
                    return combined.includes(term);
                  } catch (_e) {
                    return false;
                  }
                }) : [];
                if (cat && cat !== '全部科別' && cat !== '全部分類') {
                  filtered = filtered.filter(item => item.category === cat);
                }
                // 搜尋或分類變更時重置頁碼
                paginationSettings.diagnosisTemplates.currentPage = 1;
                renderDiagnosisTemplates(filtered);
              };
              if (dInput) {
                dInput.addEventListener('input', filterDiagnosis);
              }
              if (dCategory) {
                dCategory.addEventListener('change', filterDiagnosis);
              }
            } catch (e) {
              console.error('初始化模板庫搜尋功能失敗:', e);
            }
          }

          // 切換個人設置標籤
          function switchPersonalTab(tabId) {
            const tabContents = document.querySelectorAll('.personal-tab-content');
            tabContents.forEach(content => content.classList.add('hidden'));
            if (tabId === 'herbs') {
              document.getElementById('herbsContent').classList.remove('hidden');
            } else if (tabId === 'acupoints') {
              document.getElementById('acupointsContent').classList.remove('hidden');
            } else if (tabId === 'diagnosisSettings') {
              document.getElementById('diagnosisSettingsContent').classList.remove('hidden');
              if (typeof renderDiagnosisSettingsForm === 'function') {
                renderDiagnosisSettingsForm(true);
              }
            }
            // 統一保留底部邊框 2px（非 active 以透明色填充），避免切換時高度差 2px 造成版面移位
            const tabButtons = ['herbsTab', 'acupointsTab', 'diagnosisSettingsTab'];
            tabButtons.forEach(buttonId => {
              const button = document.getElementById(buttonId);
              if (buttonId === tabId + 'Tab') {
                button.className = 'px-6 py-3 text-amber-700 border-b-2 border-amber-500 font-medium';
              } else {
                button.className = 'px-6 py-3 text-gray-500 hover:text-amber-700 border-b-2 border-transparent font-medium';
              }
            });
          }

          // 切換模板庫標籤
          function switchTemplateTab(tabId) {
            const tabContents = document.querySelectorAll('.template-tab-content');
            tabContents.forEach(content => content.classList.add('hidden'));
            if (tabId === 'prescriptions') {
              document.getElementById('prescriptionsContent').classList.remove('hidden');
            } else if (tabId === 'diagnosis') {
              document.getElementById('diagnosisContent').classList.remove('hidden');
            }
            // 統一保留底部邊框 2px（非 active 以透明色填充），避免切換時高度差 2px 造成版面移位
            const tabButtons = ['prescriptionsTab', 'diagnosisTab'];
            tabButtons.forEach(buttonId => {
              const button = document.getElementById(buttonId);
              if (buttonId === tabId + 'Tab') {
                button.className = 'px-6 py-3 text-amber-700 border-b-2 border-amber-500 font-medium';
              } else {
                button.className = 'px-6 py-3 text-gray-500 hover:text-amber-700 border-b-2 border-transparent font-medium';
              }
            });

            // 每次切換模板標籤時更新分類下拉選單，
            // 以便立即反映新增或刪除後的分類
            if (typeof refreshTemplateCategoryFilters === 'function') {
              try {
                refreshTemplateCategoryFilters();
              } catch (_e) {}
            }
          }

          // 顯示分類管理彈窗
          function showCategoryModal(type) {
            const modal = document.getElementById('categoryModal');
            const titleEl = document.getElementById('categoryModalTitle');
            const listEl = document.getElementById('categoryList');
            const titles = {
              herbs: '管理中藥分類',
              acupoints: '管理穴位分類',
              prescriptions: '管理醫囑分類',
              diagnosis: '管理診斷分類'
            };
            titleEl.textContent = titles[type] || '管理分類';
            modal.classList.remove('hidden');
            modal.dataset.type = type;
            // 渲染分類列表
            listEl.innerHTML = '';
            // 為 herbs 和 acupoints 選擇來源：若全域 categories 中有值則使用，否則使用個人分類
            let sourceList = [];
            try {
              if (type === 'herbs') {
                if (Array.isArray(categories.herbs) && categories.herbs.length > 0) {
                  sourceList = categories.herbs;
                } else if (Array.isArray(herbComboCategories) && herbComboCategories.length > 0) {
                  sourceList = herbComboCategories;
                }
              } else if (type === 'acupoints') {
                if (Array.isArray(categories.acupoints) && categories.acupoints.length > 0) {
                  sourceList = categories.acupoints;
                } else if (Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0) {
                  sourceList = acupointComboCategories;
                }
              } else {
                // 其他分類（prescriptions, diagnosis）直接讀取全域 categories
                if (categories[type] && Array.isArray(categories[type])) {
                  sourceList = categories[type];
                }
              }
            } catch (_e) {
              // 若出現錯誤則保持空列表
            }
            // fallback: 若來源列表仍為空，嘗試使用 categories[type]
            if ((!sourceList || sourceList.length === 0) && categories[type] && Array.isArray(categories[type])) {
              sourceList = categories[type];
            }
            sourceList.forEach((cat, idx) => {
              const div = document.createElement('div');
              div.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg';
              // 分類名稱為可輸入內容，以 textContent 渲染；按鈕事件直接綁定
              const span = document.createElement('span');
              span.className = 'text-gray-700';
              span.textContent = String(cat == null ? '' : cat);
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'text-red-600 hover:text-red-800 text-sm';
              btn.textContent = '刪除';
              btn.addEventListener('click', () => { removeCategory(type, idx); });
              div.appendChild(span);
              div.appendChild(btn);
              listEl.appendChild(div);
            });
          }

          function hideCategoryModal() {
            document.getElementById('categoryModal').classList.add('hidden');
            document.getElementById('newCategoryInput').value = '';
          }

          function addCategory() {
            const input = document.getElementById('newCategoryInput');
            const type = document.getElementById('categoryModal').dataset.type;
            const newCategory = input.value.trim();
            // 將分類名稱統一轉為小寫並移除空白，用於檢查是否重複
            const normalizedNew = newCategory.replace(/\s+/g, '').toLowerCase();
            const hasDup = Array.isArray(categories[type]) && categories[type].some(cat => {
              return String(cat).replace(/\s+/g, '').toLowerCase() === normalizedNew;
            });
            if (newCategory && !hasDup) {
              // 推入未處理過的分類名稱，以保留使用者輸入的原始格式
              categories[type].push(newCategory);
              // 如為醫囑或診斷分類，刷新模板分類篩選下拉選單
              if (type === 'prescriptions' || type === 'diagnosis') {
                if (typeof refreshTemplateCategoryFilters === 'function') {
                  try {
                    refreshTemplateCategoryFilters();
                  } catch (_e) {}
                }
              }
              // 若修改的是中藥或穴位分類，更新個人慣用分類
              if (typeof refreshComboCategories === 'function') {
                refreshComboCategories(type);
              }
              showCategoryModal(type);
              input.value = '';
              // 將更新後的分類儲存至 Firebase 或本地
              if (typeof saveCategoriesToFirebase === 'function') {
                try {
                  saveCategoriesToFirebase().catch(err => console.error('保存分類資料失敗:', err));
                } catch (_e) {}
              }
              // 立即在 localStorage 中保存分類，避免非同步或 Firebase 不可用時資料遺失
              if (typeof persistCategoriesLocally === 'function') {
                try {
                  persistCategoriesLocally();
                } catch (_e) {}
              }
              // 如屬 herbs 或 acupoints，同步保存個人設定中的分類資料
              if ((type === 'herbs' || type === 'acupoints') && typeof updatePersonalSettings === 'function') {
                try {
                  updatePersonalSettings().catch(err => console.error('更新個人設置失敗:', err));
                } catch (_e) {}
              }
            }
          }

          async function removeCategory(type, index) {
            // 刪除此分類確認訊息支援中英文
            {
              const lang = localStorage.getItem('lang') || 'zh';
              const zhMsg = '確定要刪除此分類嗎？';
              const enMsg = 'Are you sure you want to delete this category?';
              const confirmed = await showConfirmation(lang === 'en' ? enMsg : zhMsg, 'warning');
              if (!confirmed) {
                return;
              }
            }
            // 先從全域分類中移除目標分類並取得被移除的名稱
            let removedArr = [];
            try {
              removedArr = categories[type].splice(index, 1);
            } catch (_e) {
              removedArr = [];
              const removed = Array.isArray(removedArr) ? removedArr[0] : undefined;
              // 若修改的是中藥或穴位分類，則需同步更新個人慣用分類，移除已刪除的分類
              try {
                if (type === 'herbs' && Array.isArray(herbComboCategories)) {
                  if (removed !== undefined) {
                    herbComboCategories = herbComboCategories.filter(cat => cat !== removed);
                    window.herbComboCategories = herbComboCategories;
                  }
                } else if (type === 'acupoints' && Array.isArray(acupointComboCategories)) {
                  if (removed !== undefined) {
                    acupointComboCategories = acupointComboCategories.filter(cat => cat !== removed);
                    window.acupointComboCategories = acupointComboCategories;
                  }
                }
              } catch (_e) {}
              // 更新搜尋與分類選單，使 UI 立即反映最新的分類
              try {
                if (typeof refreshComboCategories === 'function') {
                  refreshComboCategories(type);
                }
                if (typeof setupPersonalComboSearchAndFilter === 'function') {
                  setupPersonalComboSearchAndFilter();
                }
              } catch (_e) {}
              // 若刪除的是醫囑或診斷分類，刷新模板分類篩選下拉選單
              if (type === 'prescriptions' || type === 'diagnosis') {
                if (typeof refreshTemplateCategoryFilters === 'function') {
                  try {
                    refreshTemplateCategoryFilters();
                  } catch (_e) {}
                }
              }
              // 重新渲染分類管理彈窗
              showCategoryModal(type);
              // 將更新後的分類儲存至 Firebase 或本地
              if (typeof saveCategoriesToFirebase === 'function') {
                try {
                  saveCategoriesToFirebase().catch(err => console.error('保存分類資料失敗:', err));
                } catch (_e) {}
              }
              // 立即在 localStorage 中保存分類，避免非同步或 Firebase 不可用時資料遺失
              if (typeof persistCategoriesLocally === 'function') {
                try {
                  persistCategoriesLocally();
                } catch (_e) {}
              }
              // 如屬 herbs 或 acupoints，同步保存個人設定中的分類資料
              if ((type === 'herbs' || type === 'acupoints') && typeof updatePersonalSettings === 'function') {
                try {
                  updatePersonalSettings().catch(err => console.error('更新個人設置失敗:', err));
                } catch (_e) {}
              }
            }
          }

          // 顯示編輯彈窗
          function showEditModal(itemType, title) {
            const modal = document.getElementById('editModal');
            const modalTitle = document.getElementById('editModalTitle');
            const modalContent = document.getElementById('editModalContent');
            // 編輯視窗所有插值（input/textarea 值、option、自訂屬性）皆為
            // 使用者可輸入內容，統一以 esc 跳脫，避免屬性截斷與 Stored XSS
            const esc = (v) => window.escapeHtml(v);
            // 分類 <option> 清單：value 與標題文字都跳脫，selected 比對用原始值
            const optionsHtml = (cats, selected) => (Array.isArray(cats) ? cats : [])
              .map(cat => '<option value="' + esc(cat) + '"' + (cat === selected ? ' selected' : '') + '>' + esc(cat) + '</option>')
              .join('');
            // 將當前編輯類型存於 modal dataset 中，以便保存時使用
            modal.dataset.editType = itemType;
            // 根據 itemType 尋找對應的資料陣列與顯示名稱
            let item = null;
            const typeNames = {
              herb: '藥方組合',
              acupoint: '穴位組合',
              prescription: '醫囑模板',
              diagnosis: '診斷模板'
            };
            if (itemType === 'herb') {
              item = herbCombinations.find(h => h.name === title);
            } else if (itemType === 'acupoint') {
              item = acupointCombinations.find(a => a.name === title);
            } else if (itemType === 'prescription') {
              // 當標題為空時，優先尋找標記為新建的項目，避免取錯對象
              if (title && title.trim()) {
                item = prescriptionTemplates.find(p => p.name === title);
              } else {
                item = prescriptionTemplates.find(p => p.isNew);
                // fallback：若仍找不到，則從後往前尋找名稱為空白的項目
                if (!item) {
                  for (let i = prescriptionTemplates.length - 1; i >= 0; i--) {
                    const candidate = prescriptionTemplates[i];
                    if (!candidate.name) {
                      item = candidate;
                      break;
                    }
                  }
                }
              }
            } else if (itemType === 'diagnosis') {
              if (title && title.trim()) {
                item = diagnosisTemplates.find(d => d.name === title);
              } else {
                item = diagnosisTemplates.find(d => d.isNew);
                if (!item) {
                  for (let i = diagnosisTemplates.length - 1; i >= 0; i--) {
                    const candidate = diagnosisTemplates[i];
                    if (!candidate.name) {
                      item = candidate;
                      break;
                    }
                  }
                }
              }
            }
            // 若找不到項目則返回，不顯示編輯窗
            if (!item) return;
            // 設定當前編輯項目 id 於 dataset 中
            modal.dataset.itemId = item.id;
            // 標題顯示判斷：若 title 為空，表示新建
            if (title && title.trim()) {
              modalTitle.textContent = '編輯' + title;
            } else {
              modalTitle.textContent = '新增' + (typeNames[itemType] || '項目');
            }
            // 標記當前是否為新建，用於取消時清除
            if (item && item.isNew) {
              modal.dataset.isNew = 'true';
            } else {
              // 若不是新建，確保標記被清除
              delete modal.dataset.isNew;
            }
            // 顯示 modal
            modal.classList.remove('hidden');
            // 若為穴位組合，使用搜尋介面及提示框顯示完整資料。此邏輯將在此返回，避免進入舊的穴位分支。
            if (itemType === 'acupoint') {
              // 建立已存在穴位行的 HTML，每行包含提示資訊、名稱與刪除按鈕
              const acupointRowsHtml = Array.isArray(item.points)
                ? item.points.map(pt => {
                    const nameVal = (pt && pt.name) ? pt.name : '';
                    const tooltipContent = getAcupointTooltipContent(nameVal);
                    const encoded = tooltipContent ? encodeURIComponent(tooltipContent) : '';
                    const nameAttr = nameVal ? (' data-acupoint-name="' + esc(nameVal) + '"') : '';
                    let tooltipAttr = '';
                    if (tooltipContent) {
                      // 將鼠標提示字串中的單引號正確跳脫，使用 data-tooltip 屬性
                      tooltipAttr = ' data-tooltip="' + encoded + '" onmouseenter="showTooltip(event, this.getAttribute(\'data-tooltip\'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"';
                    }
                    return '<div class="flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded"' + nameAttr + tooltipAttr + '>' +
                      '<span class="flex-1 text-blue-800">' + esc(nameVal) + '</span>' +
                      '<button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="removeParentElement(this)">刪除</button>' +
                      '</div>';
                  }).join('')
                : '';
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">組合名稱 *</label>
                    <input type="text" id="acupointNameInput" value="${esc(item.name || '')}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">分類</label>
                    <select id="acupointCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                      ${optionsHtml((Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0 ? acupointComboCategories : categories.acupoints), item.category)}
                    </select>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">搜尋穴位</label>
                    <input type="text" id="acupointPointSearch" placeholder="搜尋穴位名稱、定位、功能或經絡..." class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" oninput="searchAcupointForCombo()">
                    <div id="acupointPointSearchResults" class="hidden">
                      <div class="bg-white border border-blue-200 rounded max-h-40 overflow-y-auto">
                        <div id="acupointPointSearchList" class="grid grid-cols-1 md:grid-cols-2 gap-2 p-2"></div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">穴位</label>
                    <div id="acupointPoints" class="space-y-2">${acupointRowsHtml}</div>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">針法</label>
                    <input type="text" id="acupointTechniqueInput" value="${esc(item.technique || '')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                </div>
              `;
              return;
            }
            // 根據不同類型渲染編輯內容
            if (itemType === 'herb') {
              // 使用綠色長方格顯示既有藥材，並提供搜尋功能新增藥材
              // 每個藥材行包含名稱（不可編輯）、劑量輸入框、單位與刪除按鈕
              const herbIngredientsHtml = Array.isArray(item.ingredients)
                ? item.ingredients.map(ing => {
                    const nameVal = (ing && ing.name) ? ing.name : '';
                    const dosageVal = (ing && ing.dosage) ? ing.dosage : '';
                    // 取得提示內容並進行 URI 編碼供屬性使用
                    const tooltipContent = getHerbTooltipContent(nameVal);
                    const encoded = tooltipContent ? encodeURIComponent(tooltipContent) : '';
                    // 屬性字串：若存在名稱則添加 data-herb-name，若存在 tooltip 則添加相關屬性與事件
                    const nameAttr = nameVal ? (' data-herb-name="' + esc(nameVal) + '"') : '';
                    let tooltipAttr = '';
                    if (tooltipContent) {
                      tooltipAttr = ' data-tooltip="' + encoded + '" onmouseenter="showTooltip(event, this.getAttribute(\'data-tooltip\'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"';
                    }
                    return '<div class="flex items-center gap-2 p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded"' + nameAttr + tooltipAttr + '>' +
                      // 名稱以 span 顯示，不可編輯
                      '<span class="flex-1 text-green-800">' + esc(nameVal) + '</span>' +
                      // 劑量輸入欄
                      '<input type="number" value="' + esc(dosageVal || '') + '" placeholder="" class="w-20 px-2 py-1 border border-gray-300 rounded">' +
                      '<span class="text-sm text-gray-700">克</span>' +
                    '<button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="removeParentElement(this)">刪除</button>' +
                      '</div>';
                  }).join('')
                : '';
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">組合名稱 *</label>
                    <input type="text" id="herbNameInput" value="${esc(item.name || '')}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">分類</label>
                    <select id="herbCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                      ${optionsHtml((Array.isArray(herbComboCategories) && herbComboCategories.length > 0 ? herbComboCategories : categories.herbs), item.category)}
                    </select>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">適應症描述</label>
                    <textarea id="herbDescriptionTextarea" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" rows="3">${esc(item.description || '')}</textarea>
                  </div>
                  <!-- 先顯示搜尋欄，再列出已添加的藥材列表 -->
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">搜尋藥材或方劑</label>
                    <input type="text" id="herbIngredientSearch" placeholder="搜尋中藥材、方劑名稱或功能..." class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" oninput="searchHerbForCombo()">
                    <div id="herbIngredientSearchResults" class="hidden">
                      <div class="bg-white border border-green-200 rounded max-h-40 overflow-y-auto">
                        <div id="herbIngredientSearchList" class="grid grid-cols-1 md:grid-cols-2 gap-2 p-2"></div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">藥材</label>
                    <div id="herbIngredients" class="space-y-2">
                      ${herbIngredientsHtml}
                    </div>
                  </div>
                </div>
              `;
            } else if (itemType === 'acupoint') {
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">組合名稱 *</label>
                    <input type="text" id="acupointNameInput" value="${esc(item.name || '')}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">分類</label>
                    <select id="acupointCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                      ${optionsHtml((Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0 ? acupointComboCategories : categories.acupoints), item.category)}
                    </select>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">穴位列表</label>
                    <div id="acupointPoints" class="space-y-2">
${(Array.isArray(item.points) ? item.points : []).map(pt => {
  const nameVal = pt && pt.name ? pt.name : '';
  return '<div class="flex items-center gap-2"><input type="text" value="' + esc(nameVal) + '" placeholder="穴位名稱" class="flex-1 px-2 py-1 border border-gray-300 rounded"><button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="removeParentElement(this)">刪除</button></div>';
}).join('')}
                    </div>
                    <button onclick="addAcupointPointField()" class="mt-2 text-sm text-blue-600 hover:text-blue-800">+ 新增穴位</button>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">針法</label>
                    <input type="text" id="acupointTechniqueInput" value="${esc(item.technique || '')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                </div>
              `;
            } else if (itemType === 'prescription') {
              // 解析複診時間，擷取數量與單位（天、周、月）供預設值使用
              let followNum = '';
              let followUnit = '';
              if (item && item.followUp) {
                const matchFU = String(item.followUp).match(/(\d+)\s*[（(]?([天周月])[^)）]*[)）]?/);
                if (matchFU) {
                  followNum = matchFU[1] || '';
                  followUnit = matchFU[2] || '';
                } else {
                  // 若未包含數字，僅解析單位
                  if (String(item.followUp).includes('天')) followUnit = '天';
                  else if (String(item.followUp).includes('周')) followUnit = '周';
                  else if (String(item.followUp).includes('月')) followUnit = '月';
                }
              }
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">模板名稱 *</label>
                    <input type="text" id="prescriptionNameInput" value="${esc(item.name || '')}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">分類</label>
                      <select id="prescriptionCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                        ${optionsHtml(categories.prescriptions, item.category)}
                      </select>
                    </div>
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">療程時間</label>
                      <input type="text" id="prescriptionDurationInput" value="${esc(item.duration || '')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">複診時間</label>
                      <div class="flex gap-2">
                        <input type="number" id="prescriptionFollowUpNumberInput" value="${esc(followNum)}" min="1" class="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                        <select id="prescriptionFollowUpUnitInput" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                          <option value="天" ${followUnit === '天' ? 'selected' : ''}>天</option>
                          <option value="周" ${followUnit === '周' ? 'selected' : ''}>周</option>
                          <option value="月" ${followUnit === '月' ? 'selected' : ''}>月</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">中藥服用方法</label>
                      <input type="text" id="prescriptionNoteInput" value="${esc(item.note || '')}" placeholder="如：服藥完畢後" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                    </div>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">醫囑內容及注意事項</label>
                    <textarea id="prescriptionContentTextarea" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" rows="5">${esc(item.content || '')}</textarea>
                  </div>
                </div>
              `;
            } else if (itemType === 'diagnosis') {
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">模板名稱 *</label>
                    <input type="text" id="diagnosisNameInput" value="${esc(item.name || '')}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">科別</label>
                    <select id="diagnosisCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      ${optionsHtml(categories.diagnosis, item.category)}
                    </select>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">主訴</label>
                    <textarea id="diagnosisChiefComplaintInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="3">${esc(item.chiefComplaint || '')}</textarea>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">現病史</label>
                    <textarea id="diagnosisCurrentHistoryInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="6">${esc(item.currentHistory || '')}</textarea>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">舌象</label>
                      <textarea id="diagnosisTongueInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="2">${esc(item.tongue || '')}</textarea>
                    </div>
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">脈象</label>
                      <textarea id="diagnosisPulseInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="2">${esc(item.pulse || '')}</textarea>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">中醫診斷</label>
                      <textarea id="diagnosisTcmDiagnosisInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="2">${esc(item.tcmDiagnosis || '')}</textarea>
                    </div>
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">證型診斷</label>
                      <textarea id="diagnosisSyndromeDiagnosisInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="2">${esc(item.syndromeDiagnosis || '')}</textarea>
                    </div>
                  </div>
                </div>
              `;
            }
          }

          function hideEditModal() {
            const modal = document.getElementById('editModal');
            if (!modal) return;
            // 檢查是否為新建項目，如果取消則從陣列中移除
            const isNew = modal.dataset.isNew === 'true';
            const editType = modal.dataset.editType;
            const itemIdStr = modal.dataset.itemId;
            if (isNew && editType && itemIdStr) {
              const itemId = parseInt(itemIdStr, 10);
              if (editType === 'herb') {
                herbCombinations = herbCombinations.filter(h => h.id !== itemId);
                renderHerbCombinations();
              } else if (editType === 'acupoint') {
                acupointCombinations = acupointCombinations.filter(a => a.id !== itemId);
                renderAcupointCombinations();
              } else if (editType === 'prescription') {
                // 如果取消新建的醫囑模板，移除該項
                prescriptionTemplates = prescriptionTemplates.filter(p => p.id !== itemId);
                renderPrescriptionTemplates();
              } else if (editType === 'diagnosis') {
                // 如果取消新建的診斷模板，移除該項
                diagnosisTemplates = diagnosisTemplates.filter(d => d.id !== itemId);
                renderDiagnosisTemplates();
              }
              // 重置 dataset 標記
              delete modal.dataset.isNew;
              // 針對 herb 與 acupoint 保存個人設定
              if (editType === 'herb' || editType === 'acupoint') {
                if (typeof updatePersonalSettings === 'function') {
                  try {
                    updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
                  } catch (_e) {}
                }
              }
            }
            modal.classList.add('hidden');
          }

          async function saveEdit() {
            const modal = document.getElementById('editModal');
            const editType = modal.dataset.editType;
            const itemIdStr = modal.dataset.itemId;
            if (!editType || !itemIdStr) {
              // 若沒有設定類型或 ID，則無法保存
              return;
            }
            const itemId = parseInt(itemIdStr, 10);
            // 根據 editType 找到對應的項目並更新
            if (editType === 'herb') {
              const item = herbCombinations.find(h => h.id === itemId);
              if (!item) return;
              // 檢查名稱必填
              const nameVal = (document.getElementById('herbNameInput').value || '').trim();
              if (!nameVal) {
                // 若名稱為空，提示錯誤並停止保存。改用頂部彈窗提示，不再使用瀏覽器 alert。
                showToast('請輸入組合名稱！', 'error');
                return;
              }
              // 更新資料
              item.name = nameVal;
              item.category = document.getElementById('herbCategorySelect').value;
              item.description = document.getElementById('herbDescriptionTextarea').value;
              const ingredientRows = document.querySelectorAll('#herbIngredients > div');
              // 將每一列的資料取出為物件陣列
              const newIngredients = Array.from(ingredientRows).map(row => {
                // 優先使用 dataset.herbName（新設計）；若不存在則退回舊結構
                let name = '';
                let dosage = '';
                if (row.dataset && row.dataset.herbName) {
                  name = row.dataset.herbName;
                  const dosageInput = row.querySelector('input[type="number"]');
                  dosage = dosageInput ? dosageInput.value : '';
                } else {
                  const select = row.querySelector('select');
                  const inputs = row.querySelectorAll('input');
                  if (select) {
                    name = select.value;
                    dosage = inputs[0] ? inputs[0].value : '';
                  } else if (inputs.length >= 2) {
                    name = inputs[0].value;
                    dosage = inputs[1].value;
                  } else if (inputs.length === 1) {
                    name = inputs[0].value;
                  }
                }
                return { name: name, dosage: dosage };
              });
              // 過濾出名稱非空的藥材，用於檢查是否至少新增一項
              const validIngredients = newIngredients.filter(ing => ing && ing.name && String(ing.name).trim() !== '');
              if (validIngredients.length === 0) {
                // 若沒有任何藥材，提示錯誤並中止保存
                showToast('請至少添加一個藥材！', 'error');
                return;
              }
              item.ingredients = newIngredients;
              item.lastModified = new Date().toISOString().split('T')[0];
              // 標記為已保存（非新建），避免取消時被移除
              if (item.isNew) {
                item.isNew = false;
              }
              // 也更新 modal 的 isNew 標記
              modal.dataset.isNew = 'false';
              renderHerbCombinations();
              // Persist changes for personal herb combinations to Firestore
              if (typeof updatePersonalSettings === 'function') {
                try {
                  updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
                } catch (_e) {}
              }
            } else if (editType === 'acupoint') {
              const item = acupointCombinations.find(a => a.id === itemId);
              if (!item) return;
              // 檢查名稱必填
              const acupointNameVal = (document.getElementById('acupointNameInput').value || '').trim();
              if (!acupointNameVal) {
                // 使用統一的右上角提示顯示錯誤信息
                showToast('請輸入組合名稱！', 'error');
                return;
              }
              item.name = acupointNameVal;
              item.category = document.getElementById('acupointCategorySelect').value;
              const pointRows = document.querySelectorAll('#acupointPoints > div');
              // 將每一列的穴位資料取出為物件陣列，支援新舊兩種結構
              const newPoints = Array.from(pointRows).map(row => {
                let name = '';
                // 名稱可以從 dataset.acupointName 或 input 取得。
                if (row.dataset && row.dataset.acupointName) {
                  name = row.dataset.acupointName;
                } else {
                  const inputs = row.querySelectorAll('input');
                  if (inputs.length >= 1) {
                    name = inputs[0].value;
                  }
                }
                // 由於已取消主穴/配穴選擇，仍保留空字串屬性以與舊資料格式相容
                return { name: name, type: '' };
              });
              // 過濾出名稱非空的穴位，用於檢查是否至少新增一項
              const validPoints = newPoints.filter(pt => pt && pt.name && String(pt.name).trim() !== '');
              if (validPoints.length === 0) {
                // 若沒有任何穴位，提示錯誤並中止保存
                showToast('請至少添加一個穴位！', 'error');
                return;
              }
              item.points = newPoints;
              item.technique = document.getElementById('acupointTechniqueInput').value;
              item.lastModified = new Date().toISOString().split('T')[0];
              // 標記為已保存（非新建），避免取消時被移除
              if (item.isNew) {
                item.isNew = false;
              }
              // 更新 modal 的 isNew 標記
              modal.dataset.isNew = 'false';
              renderAcupointCombinations();
              // Persist changes for personal acupoint combinations to Firestore
              if (typeof updatePersonalSettings === 'function') {
                try {
                  updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
                } catch (_e) {}
              }
            } else if (editType === 'prescription') {
              const item = prescriptionTemplates.find(p => p.id === itemId);
              if (!item) return;
              // 檢查模板名稱必填
              const presNameVal = (document.getElementById('prescriptionNameInput').value || '').trim();
              if (!presNameVal) {
                // 使用頂部彈窗提示用戶輸入模板名稱
                showToast('請輸入模板名稱！', 'error');
                return;
              }
              item.name = presNameVal;
              item.category = document.getElementById('prescriptionCategorySelect').value;
              item.duration = document.getElementById('prescriptionDurationInput').value;
              // 取得複診時間的數量與單位，組合為「數量（單位）」的格式
              const fuNumEl = document.getElementById('prescriptionFollowUpNumberInput');
              const fuUnitEl = document.getElementById('prescriptionFollowUpUnitInput');
              const fuNumVal = fuNumEl ? (fuNumEl.value || '').trim() : '';
              const fuUnitVal = fuUnitEl ? fuUnitEl.value : '';
              if (fuNumVal) {
                item.followUp = fuNumVal + '（' + fuUnitVal + '）';
              } else {
                item.followUp = fuUnitVal;
              }
              item.content = document.getElementById('prescriptionContentTextarea').value;
              // 儲存中藥服用方法（note）到模板項。若無輸入則存為空字串。
              const noteVal = document.getElementById('prescriptionNoteInput') ? document.getElementById('prescriptionNoteInput').value : '';
              item.note = noteVal;
              item.lastModified = new Date().toISOString().split('T')[0];
              // 標記為已保存（非新建），避免取消時被移除
              if (item.isNew) {
                item.isNew = false;
              }
              modal.dataset.isNew = 'false';
              // 不再將醫囑模板資料寫入 Firestore；直接重新渲染列表
              renderPrescriptionTemplates();
            } else if (editType === 'diagnosis') {
              const item = diagnosisTemplates.find(d => d.id === itemId);
              if (!item) return;
              // 檢查模板名稱必填
              const diagNameVal = (document.getElementById('diagnosisNameInput').value || '').trim();
              if (!diagNameVal) {
                // 使用頂部彈窗提示用戶輸入診斷模板名稱
                showToast('請輸入模板名稱！', 'error');
                return;
              }
              item.name = diagNameVal;
              item.category = document.getElementById('diagnosisCategorySelect').value;
              // 儲存各診斷欄位內容
              item.chiefComplaint = document.getElementById('diagnosisChiefComplaintInput').value;
              item.currentHistory = document.getElementById('diagnosisCurrentHistoryInput').value;
              item.tongue = document.getElementById('diagnosisTongueInput').value;
              item.pulse = document.getElementById('diagnosisPulseInput').value;
              item.tcmDiagnosis = document.getElementById('diagnosisTcmDiagnosisInput').value;
              item.syndromeDiagnosis = document.getElementById('diagnosisSyndromeDiagnosisInput').value;
              // 移除舊診斷內容欄位，避免混淆（若存在）
              item.content = '';
              item.lastModified = new Date().toISOString().split('T')[0];
              // 標記為已保存（非新建），避免取消時被移除
              if (item.isNew) {
                item.isNew = false;
              }
              modal.dataset.isNew = 'false';
              // 不再將診斷模板資料寫入 Firestore；直接重新渲染列表
              renderDiagnosisTemplates();
            }
            // 保存成功後顯示成功提示，不再使用瀏覽器 alert
            showToast('保存成功！', 'success');
            hideEditModal();
          }


          function addAcupointPointField() {
            const container = document.getElementById('acupointPoints');
            const div = document.createElement('div');
            // 使用 flex 布局讓刪除按鈕置於右側
            div.className = 'flex items-center gap-2';
            // 建立名稱與類型輸入框以及刪除按鈕，刪除按鈕點擊後可移除所在行
    // 調整穴位名稱欄位寬度為一半，避免在手機或小螢幕上過長
    // 只建立穴位名稱輸入框與刪除按鈕，不再顯示主穴/配穴選擇
    div.innerHTML = '<input type="text" placeholder="穴位名稱" class="flex-1 px-2 py-1 border border-gray-300 rounded"><button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="removeParentElement(this)">刪除</button>';
            container.appendChild(div);
          }

          /*
           * 搜索並新增藥材至個人慣用藥方組合。
           * 在編輯藥方時，使用者可以在搜尋欄輸入關鍵字搜尋中藥庫中的藥材，並點擊結果將其加入藥材列表。
           */
          function searchHerbForCombo() {
            const input = document.getElementById('herbIngredientSearch');
            if (!input) return;
            // 綁定鍵盤事件以支援方向鍵選擇與 Enter 選取，避免重複綁定
            try {
              if (!input.dataset.bindKeyDown) {
                input.addEventListener('keydown', handleHerbIngredientSearchKeyDown);
                input.dataset.bindKeyDown = 'true';
              }
            } catch (_e) {
              /* 忽略綁定錯誤 */
            }
            // 每次搜尋前重置選中索引
            herbIngredientSearchSelectionIndex = -1;
            const searchTerm = input.value.trim().toLowerCase();
            const resultsContainer = document.getElementById('herbIngredientSearchResults');
            const resultsList = document.getElementById('herbIngredientSearchList');
            if (!resultsContainer || !resultsList) return;
            if (searchTerm.length < 1) {
              // 搜尋字串為空時，重置索引
              herbIngredientSearchSelectionIndex = -1;
              resultsContainer.classList.add('hidden');
              // 當搜尋字串為空時，同步隱藏任何提示框
              if (typeof hideTooltip === 'function') {
                hideTooltip();
              }
              return;
            }
            // 搜索並根據匹配程度排序 herbLibrary 中的中藥材與方劑（名稱、別名、英文名或功效）
            let matched = (Array.isArray(herbLibrary) ? herbLibrary : [])
              .filter(item => item && (item.type === 'herb' || item.type === 'formula') && (
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.alias && item.alias.toLowerCase().includes(searchTerm)) ||
                (item.englishName && item.englishName.toLowerCase().includes(searchTerm)) ||
                (item.effects && item.effects.toLowerCase().includes(searchTerm))
              ))
              .map(item => {
                const ln = item.name ? item.name.toLowerCase() : '';
                const la = item.alias ? item.alias.toLowerCase() : '';
                const en = item.englishName ? item.englishName.toLowerCase() : '';
                const le = item.effects ? item.effects.toLowerCase() : '';
                let score = Infinity;
                if (ln.includes(searchTerm)) {
                  score = ln.indexOf(searchTerm);
                } else if (la.includes(searchTerm)) {
                  score = 100 + la.indexOf(searchTerm);
                } else if (en.includes(searchTerm)) {
                  score = 200 + en.indexOf(searchTerm);
                } else if (le.includes(searchTerm)) {
                  score = 300 + le.indexOf(searchTerm);
                }
                return { item, score };
              })
              .sort((a, b) => a.score - b.score)
              .map(obj => obj.item);
            // 只取前 10 筆
            matched = matched.slice(0, 10);
            if (matched.length === 0) {
              resultsList.innerHTML = '<div class="p-2 text-center text-gray-500 text-sm">找不到符合條件的藥材</div>';
              resultsContainer.classList.remove('hidden');
              // 沒有符合項目時，隱藏提示框
              if (typeof hideTooltip === 'function') {
                hideTooltip();
              }
              return;
            }
            // 顯示搜尋結果：移除劑量顯示並使用 tooltip 顯示詳細資料
            resultsList.innerHTML = matched.map(item => {
              // 構建詳細資訊內容
              const details = [];
              details.push('名稱：' + (item.name || ''));
              if (item.alias) details.push('別名：' + item.alias);
              if (item.type === 'herb') {
                if (item.nature) details.push('性味：' + item.nature);
                if (item.meridian) details.push('歸經：' + item.meridian);
              }
              if (item.effects) details.push('功效：' + item.effects);
              if (item.indications) details.push('主治：' + item.indications);
              if (item.type === 'formula') {
                if (item.composition) details.push('組成：' + item.composition.replace(/\n/g, '、'));
                if (item.usage) details.push('用法：' + item.usage);
              }
              if (item.cautions) details.push('注意：' + item.cautions);
              const encoded = encodeURIComponent(details.join('\n'));
              // 名稱以 data 屬性傳遞（經跳脫），點擊事件於渲染後統一綁定，
              // 避免名稱含引號時截斷 inline onclick 屬性造成注入
              return `<div class="p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded cursor-pointer text-center text-sm" data-tooltip="${encoded}" data-add-herb-name="${window.escapeHtml(item.name || '')}" onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()">${window.escapeHtml(item.name)}</div>`;
            }).join('');
            resultsList.querySelectorAll('[data-add-herb-name]').forEach(el => {
              el.addEventListener('click', function() {
                addHerbToCombo(this.getAttribute('data-add-herb-name'), '');
              });
            });
            resultsContainer.classList.remove('hidden');
            prescriptionSearchSelectionIndex = -1;
        }

          /**
           * 將指定藥材名稱與劑量加入目前編輯的藥材列表。
           * 新增後會清空搜尋欄並隱藏搜尋結果。
           * @param {string} name 藥材名稱
           * @param {string} dosage 預設劑量
           */
          function addHerbToCombo(name, dosage) {
            const container = document.getElementById('herbIngredients');
            if (!container) return;
            const normalizedName = String(name || '').trim();
            const isDuplicate = Array.from(container.children).some(row => {
              const existingName = String(
                (row.dataset && row.dataset.herbName) ||
                (row.querySelector('span') ? row.querySelector('span').textContent : '') ||
                ''
              ).trim();
              return existingName !== '' && existingName === normalizedName;
            });
            if (isDuplicate) {
              showToast(`${normalizedName} 已經在此藥方中！`, 'warning');
              return;
            }
            // 建立新的一行，並使用綠色背景與邊框樣式
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded';
            // 儲存藥材名稱於 dataset，方便後續保存時讀取
            if (name) {
              div.dataset.herbName = name;
            }
            // 設定提示內容（若查詢不到則不設定）
            const tooltipContent = getHerbTooltipContent(name || '');
            if (tooltipContent) {
              const encoded = encodeURIComponent(tooltipContent);
              div.setAttribute('data-tooltip', encoded);
              div.addEventListener('mouseenter', function(e) {
                showTooltip(e, this.getAttribute('data-tooltip'));
              });
              div.addEventListener('mousemove', function(e) {
                moveTooltip(e);
              });
              div.addEventListener('mouseleave', function() {
                hideTooltip();
              });
            }
            // 名稱以 span 顯示（不可編輯）
            const nameSpan = document.createElement('span');
            nameSpan.className = 'flex-1 text-green-800';
            nameSpan.textContent = name || '';
            div.appendChild(nameSpan);
            // 劑量輸入欄
            const dosageInput = document.createElement('input');
            dosageInput.type = 'number';
            dosageInput.value = dosage || '';
            dosageInput.placeholder = '';
            dosageInput.className = 'w-20 px-2 py-1 border border-gray-300 rounded';
            div.appendChild(dosageInput);
            // 單位
            const unitSpan = document.createElement('span');
            unitSpan.textContent = '克';
            unitSpan.className = 'text-sm text-gray-700';
            div.appendChild(unitSpan);
            // 刪除按鈕
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = '刪除';
            deleteBtn.className = 'text-red-500 hover:text-red-700 text-sm';
            deleteBtn.addEventListener('click', function() {
              if (div && div.parentElement) {
                div.parentElement.removeChild(div);
              }
            });
            div.appendChild(deleteBtn);
            container.appendChild(div);
            const resultsContainer = document.getElementById('herbIngredientSearchResults');
            if (resultsContainer) {
              resultsContainer.classList.add('hidden');
            }
            const searchInput = document.getElementById('herbIngredientSearch');
            if (searchInput) {
              searchInput.value = '';
            }
            // 新增完藥材後隱藏提示框，以免留下殘影
            if (typeof hideTooltip === 'function') {
              hideTooltip();
            }
          }

          // 將自訂函式掛載至 window，使其可於內嵌事件處理器中被呼叫
          window.searchHerbForCombo = searchHerbForCombo;
          window.addHerbToCombo = addHerbToCombo;

          /*
           * 搜索並新增穴位至個人慣用穴位組合。
           * 在編輯穴位組合時，使用者可以在搜尋欄輸入關鍵字搜尋穴位庫中的穴位，並點擊結果將其加入穴位列表。
           */
          async function searchAcupointForCombo() {
            const input = document.getElementById('acupointPointSearch');
            if (!input) return;
            // 綁定鍵盤事件以支援方向鍵選擇與 Enter 選取，避免重複綁定
            try {
              if (!input.dataset.bindKeyDown) {
                input.addEventListener('keydown', handleAcupointComboSearchKeyDown);
                input.dataset.bindKeyDown = 'true';
              }
            } catch (_e) {
              /* 忽略綁定錯誤 */
            }
            // 每次搜尋前重置選中索引
            acupointComboSearchSelectionIndex = -1;
            const searchTerm = input.value.trim().toLowerCase();
            const resultsContainer = document.getElementById('acupointPointSearchResults');
            const resultsList = document.getElementById('acupointPointSearchList');
            if (!resultsContainer || !resultsList) return;
            // 如果尚未載入穴位庫資料，則嘗試初始化一次。
            // 由於 initAcupointLibrary 返回 promise，這裡使用 await 以確保資料就緒後再進行搜尋。
            try {
              if (!acupointLibraryLoaded || !Array.isArray(acupointLibrary) || acupointLibrary.length === 0) {
                await initAcupointLibrary();
              }
            } catch (_e) {
              // 初始化失敗時不中斷搜尋流程，僅記錄錯誤並繼續。
              console.error('載入穴位庫資料失敗：', _e);
            }
            if (searchTerm.length < 1) {
              // 若輸入為空，隱藏結果容器並隱藏提示框
              resultsContainer.classList.add('hidden');
              if (typeof hideTooltip === 'function') {
                hideTooltip();
              }
              return;
            }
            // 過濾並根據匹配程度排序 acupointLibrary 中的穴位（名稱、經絡、定位、功效、主治或英文名）
            let matched = (Array.isArray(acupointLibrary) ? acupointLibrary : [])
              .filter(item => item && (
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.meridian && item.meridian.toLowerCase().includes(searchTerm)) ||
                (item.location && item.location.toLowerCase().includes(searchTerm)) ||
                (item.functions && (Array.isArray(item.functions) ? item.functions.join(' ').toLowerCase().includes(searchTerm) : String(item.functions).toLowerCase().includes(searchTerm))) ||
                (item.indications && (Array.isArray(item.indications) ? item.indications.join(' ').toLowerCase().includes(searchTerm) : String(item.indications).toLowerCase().includes(searchTerm))) ||
                (item.englishName && item.englishName.toLowerCase().includes(searchTerm))
              ))
              .map(item => {
                const n = item.name ? item.name.toLowerCase() : '';
                const m = item.meridian ? item.meridian.toLowerCase() : '';
                const l = item.location ? item.location.toLowerCase() : '';
                const f = item.functions ? (Array.isArray(item.functions) ? item.functions.join(' ').toLowerCase() : String(item.functions).toLowerCase()) : '';
                const i = item.indications ? (Array.isArray(item.indications) ? item.indications.join(' ').toLowerCase() : String(item.indications).toLowerCase()) : '';
                const e = item.englishName ? item.englishName.toLowerCase() : '';
                let score = Infinity;
                if (n.includes(searchTerm)) {
                  score = n.indexOf(searchTerm);
                } else if (m.includes(searchTerm)) {
                  score = 100 + m.indexOf(searchTerm);
                } else if (l.includes(searchTerm)) {
                  score = 200 + l.indexOf(searchTerm);
                } else if (f.includes(searchTerm)) {
                  score = 300 + f.indexOf(searchTerm);
                } else if (i.includes(searchTerm)) {
                  score = 400 + i.indexOf(searchTerm);
                } else if (e.includes(searchTerm)) {
                  score = 500 + e.indexOf(searchTerm);
                }
                return { item, score };
              })
              .sort((a, b) => a.score - b.score)
              .map(obj => obj.item);
            // 只顯示前十項
            matched = matched.slice(0, 10);
            if (matched.length === 0) {
              resultsList.innerHTML = '<div class="p-2 text-center text-gray-500 text-sm">找不到符合條件的穴位</div>';
              resultsContainer.classList.remove('hidden');
              // 沒有匹配項目時也隱藏提示框
              if (typeof hideTooltip === 'function') {
                hideTooltip();
              }
              return;
            }
            // 顯示搜尋結果，每個結果可點擊加入穴位清單，並顯示 tooltip 詳細資料
            resultsList.innerHTML = matched.map(item => {
              const details = [];
              details.push('名稱：' + (item.name || ''));
              if (item.meridian) details.push('經絡：' + item.meridian);
              if (item.location) details.push('定位：' + item.location);
              if (item.functions) {
                const funcs = Array.isArray(item.functions) ? item.functions.join('、') : String(item.functions);
                details.push('功效：' + funcs);
              }
              if (item.indications) {
                const inds = Array.isArray(item.indications) ? item.indications.join('、') : String(item.indications);
                details.push('主治：' + inds);
              }
              if (item.method) details.push('針法：' + item.method);
              if (item.category) details.push('分類：' + item.category);
              const encoded = encodeURIComponent(details.join('\n'));
              // 名稱以 data 屬性傳遞（經跳脫），點擊事件於渲染後統一綁定，
              // 避免名稱含引號時截斷 inline onclick 屬性造成注入
              return `<div class="p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer text-center text-sm" data-tooltip="${encoded}" data-add-acupoint-name="${window.escapeHtml(item.name || '')}" onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()">${window.escapeHtml(item.name)}</div>`;
            }).join('');
            resultsList.querySelectorAll('[data-add-acupoint-name]').forEach(el => {
              el.addEventListener('click', function() {
                addAcupointToCombo(this.getAttribute('data-add-acupoint-name'));
              });
            });
            resultsContainer.classList.remove('hidden');
          }

          /**
           * 將指定穴位名稱加入目前編輯的穴位列表。
           * 新增後會清空搜尋欄並隱藏搜尋結果。
           * @param {string} name 穴位名稱
           */
          function addAcupointToCombo(name) {
            const container = document.getElementById('acupointPoints');
            if (!container) return;
            // 建立新的一行，使用藍色背景與邊框樣式
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded';
            // 儲存穴位名稱於 dataset，方便後續保存時讀取
            if (name) {
              div.dataset.acupointName = name;
            }
            // 設定提示內容（若查詢不到則不設定）
            const tooltipContent = getAcupointTooltipContent(name || '');
            if (tooltipContent) {
              const encoded = encodeURIComponent(tooltipContent);
              div.setAttribute('data-tooltip', encoded);
              div.addEventListener('mouseenter', function(e) {
                showTooltip(e, this.getAttribute('data-tooltip'));
              });
              div.addEventListener('mousemove', function(e) {
                moveTooltip(e);
              });
              div.addEventListener('mouseleave', function() {
                hideTooltip();
              });
            }
            // 名稱以 span 顯示
            const nameSpan = document.createElement('span');
            nameSpan.className = 'flex-1 text-blue-800';
            nameSpan.textContent = name || '';
            div.appendChild(nameSpan);
    // 不再顯示主穴/配穴選擇，僅顯示名稱與刪除按鈕
            // 刪除按鈕
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = '刪除';
            deleteBtn.className = 'text-red-500 hover:text-red-700 text-sm';
            deleteBtn.addEventListener('click', function() {
              if (div && div.parentElement) {
                div.parentElement.removeChild(div);
              }
            });
            div.appendChild(deleteBtn);
            container.appendChild(div);
            // 清空搜尋欄並隱藏結果
            const resultsContainer = document.getElementById('acupointPointSearchResults');
            if (resultsContainer) {
              resultsContainer.classList.add('hidden');
            }
            const searchInput = document.getElementById('acupointPointSearch');
            if (searchInput) {
              searchInput.value = '';
            }
            // 新增完穴位後隱藏提示框，以免留下殘影
            if (typeof hideTooltip === 'function') {
              hideTooltip();
            }
          }

          /**
           * 取得指定穴位的完整提示內容。
           * 根據 acupointLibrary 中的資料組合名稱、經絡、定位、功效、主治、針法與分類。
           * 如果找不到對應的資料則回傳空字串。
           * @param {string} name 穴位名稱
           * @returns {string} 組合的詳細內容，以換行符分隔
           */
          function getAcupointTooltipContent(name) {
            if (!name || !Array.isArray(acupointLibrary) || acupointLibrary.length === 0) return '';
            const item = acupointLibrary.find(a => a && a.name === name);
            if (!item) return '';
            const details = [];
            details.push('名稱：' + (item.name || ''));
            if (item.meridian) details.push('經絡：' + item.meridian);
            if (item.location) details.push('定位：' + item.location);
            if (item.functions) {
              const funcs = Array.isArray(item.functions) ? item.functions.join('、') : String(item.functions);
              details.push('功效：' + funcs);
            }
          if (item.indications) {
            const inds = Array.isArray(item.indications) ? item.indications.join('、') : String(item.indications);
            details.push('主治：' + inds);
          }
          if (item.method) details.push('針法：' + item.method);
          if (item.category) details.push('分類：' + item.category);
          if (item.internationalCode) details.push('國際代碼：' + item.internationalCode);
          return details.join('\n');
        }

          // 將穴位搜索與新增函式掛載至 window，使其可由行內事件調用
          window.searchAcupointForCombo = searchAcupointForCombo;
          window.addAcupointToCombo = addAcupointToCombo;

  /**
   * 自訂工具提示函式：顯示、移動與隱藏。
   * 此 tooltip 會立即顯示並跟隨滑鼠移動，展示完整的中藥材或方劑資訊。
   * @param {MouseEvent} event 滑鼠事件
   * @param {string} encodedContent encodeURIComponent 處理後的提示內容
   */
  function showTooltip(event, encodedContent) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    if (tooltip.parentElement !== document.body) {
      document.body.appendChild(tooltip);
    }
    tooltip.style.zIndex = '2147483647';
    tooltip.style.position = 'fixed';
    const content = decodeURIComponent(encodedContent || '');
    // 使用 innerText 可以處理換行符號，避免 XSS
    tooltip.innerText = content;
    tooltip.classList.remove('hidden');
    // 設置初始位置，稍微偏移以免遮擋游標
    const offsetX = 10;
    const offsetY = 10;
    // 使用 clientX/clientY 以取得視窗內座標，配合 position:fixed 讓提示靠近游標
    // 若使用 pageX/pageY，當畫面有滾動時會導致位置偏移
    tooltip.style.left = (event.clientX + offsetX) + 'px';
    tooltip.style.top = (event.clientY + offsetY) + 'px';
  }

  function moveTooltip(event) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip || tooltip.classList.contains('hidden')) return;
    tooltip.style.zIndex = '2147483647';
    tooltip.style.position = 'fixed';
    const offsetX = 10;
    const offsetY = 10;
    // 使用 clientX/clientY 以取得視窗內座標，配合 position:fixed 讓提示靠近游標
    tooltip.style.left = (event.clientX + offsetX) + 'px';
    tooltip.style.top = (event.clientY + offsetY) + 'px';
  }

  function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    tooltip.classList.add('hidden');
  }

/**
 * 移除元素所在的父節點，並在移除前隱藏任何殘留的 tooltip。
 * 此函式用於 inline 事件處理器，避免在 HTML 中撰寫多條敘述導致解析錯誤。
 * @param {HTMLElement} el 觸發事件的元素（通常是刪除按鈕本身）
 */
function removeParentElement(el) {
  try {
    // 如果有定義 hideTooltip，則先隱藏提示框
    if (typeof hideTooltip === 'function') {
      hideTooltip();
    }
  } catch (_e) {
    // 忽略任何錯誤
  }
  if (el && el.parentElement) {
    el.parentElement.remove();
  }
}

// 將 removeParentElement 掛載到全域 window，使其可由 inline handler 調用
if (typeof window !== 'undefined' && !window.removeParentElement) {
  window.removeParentElement = removeParentElement;
}

  /**
   * 取得指定中藥材或方劑的完整提示內容。
   * 根據 herbLibrary 中的資料組合名稱、別名、性味、歸經、功效、主治、組成、用法與注意事項。
   * 如果找不到對應的資料則回傳空字串。
   * @param {string} name 藥材或方劑名稱
   * @returns {string} 組合的詳細內容，以換行符分隔
   */
  function getHerbTooltipContent(name) {
    if (!name || !Array.isArray(herbLibrary) || herbLibrary.length === 0) return '';
    // 嘗試在 herbLibrary 中尋找名稱精確匹配的資料
    const item = herbLibrary.find(h => h && h.name === name);
    if (!item) return '';
    const details = [];
    details.push('名稱：' + (item.name || ''));
    if (item.alias) details.push('別名：' + item.alias);
    // 中藥材類型特有屬性
    if (item.type === 'herb') {
      if (item.nature) details.push('性味：' + item.nature);
      if (item.meridian) details.push('歸經：' + item.meridian);
    }
    // 功效與主治
    if (item.effects) details.push('功效：' + item.effects);
    if (item.indications) details.push('主治：' + item.indications);
    // 方劑類型的其他屬性
    if (item.type === 'formula') {
      if (item.composition) details.push('組成：' + item.composition.replace(/\n/g, '、'));
      if (item.usage) details.push('用法：' + item.usage);
    }
    if (item.cautions) details.push('注意：' + item.cautions);
    return details.join('\n');
  }

  // 將 tooltip 函式掛載至 window，供行內事件處理器調用
  window.showTooltip = showTooltip;
  window.moveTooltip = moveTooltip;
  window.hideTooltip = hideTooltip;

  /**
   * 清空穴位搜尋欄，並隱藏搜尋結果。
   * 用於針灸備註區域的穴位快速搜尋。
   */
  function clearAcupointNotesSearch() {
    try {
      const input = document.getElementById('acupointNotesSearch');
      const results = document.getElementById('acupointNotesSearchResults');
      if (input) {
        input.value = '';
      }
      if (results) {
        results.classList.add('hidden');
      }
      // 隱藏提示浮窗
      if (typeof hideTooltip === 'function') {
        hideTooltip();
      }
    } catch (_e) {
      console.error('清空穴位搜索欄時發生錯誤：', _e);
    }
  }

  /**
   * 在針灸備註區域搜尋穴位。
   * 根據輸入的關鍵字於 acupointLibrary 中篩選名稱、經絡、定位、功效或主治。
   * 動態顯示搜尋結果，點擊可加入針灸備註。
   */
  async function searchAcupointForNotes() {
    try {
      const input = document.getElementById('acupointNotesSearch');
      const resultsContainer = document.getElementById('acupointNotesSearchResults');
      const resultsList = document.getElementById('acupointNotesSearchList');
      if (!input || !resultsContainer || !resultsList) return;
      const searchTerm = (input.value || '').trim().toLowerCase();
      // 若尚未載入穴位庫資料，則初始化一次
      try {
        if (!acupointLibraryLoaded || !Array.isArray(acupointLibrary) || acupointLibrary.length === 0) {
          await initAcupointLibrary();
        }
      } catch (_er) {
        console.error('載入穴位庫失敗：', _er);
      }
      if (!searchTerm) {
        resultsContainer.classList.add('hidden');
        // 搜尋欄清空時隱藏提示
        if (typeof hideTooltip === 'function') {
          hideTooltip();
        }
        return;
      }
      // 在穴位庫中過濾符合搜尋字串的項目並依匹配度排序
      let matched = (Array.isArray(acupointLibrary) ? acupointLibrary : [])
        .filter(item => item && (
          (item.name && item.name.toLowerCase().includes(searchTerm)) ||
          (item.meridian && item.meridian.toLowerCase().includes(searchTerm)) ||
          (item.location && item.location.toLowerCase().includes(searchTerm)) ||
          (item.functions && (Array.isArray(item.functions) ? item.functions.join(' ').toLowerCase().includes(searchTerm) : String(item.functions).toLowerCase().includes(searchTerm))) ||
          (item.indications && (Array.isArray(item.indications) ? item.indications.join(' ').toLowerCase().includes(searchTerm) : String(item.indications).toLowerCase().includes(searchTerm))) ||
          (item.englishName && item.englishName.toLowerCase().includes(searchTerm)) ||
          (item.internationalCode && (
            item.internationalCode.toLowerCase().includes(searchTerm) ||
            item.internationalCode.toLowerCase().replace(/[\s-]/g, '').includes(searchTerm.replace(/[\s-]/g, ''))
          ))
        ))
        .map(item => {
          const nameStr = item.name ? item.name.toLowerCase() : '';
          const meridianStr = item.meridian ? item.meridian.toLowerCase() : '';
          const locStr = item.location ? item.location.toLowerCase() : '';
          const funcStr = item.functions ? (Array.isArray(item.functions) ? item.functions.join(' ').toLowerCase() : String(item.functions).toLowerCase()) : '';
          const indStr = item.indications ? (Array.isArray(item.indications) ? item.indications.join(' ').toLowerCase() : String(item.indications).toLowerCase()) : '';
          const engStr = item.englishName ? item.englishName.toLowerCase() : '';
          const codeStr = item.internationalCode ? item.internationalCode.toLowerCase() : '';
          const codeNorm = codeStr ? codeStr.replace(/[\s-]/g, '') : '';
          const termNorm = searchTerm ? searchTerm.replace(/[\s-]/g, '') : '';
          let score = Infinity;
          if (nameStr.includes(searchTerm)) {
            score = nameStr.indexOf(searchTerm);
          } else if (meridianStr.includes(searchTerm)) {
            score = 100 + meridianStr.indexOf(searchTerm);
          } else if (locStr.includes(searchTerm)) {
            score = 200 + locStr.indexOf(searchTerm);
          } else if (funcStr.includes(searchTerm)) {
            score = 300 + funcStr.indexOf(searchTerm);
          } else if (indStr.includes(searchTerm)) {
            score = 400 + indStr.indexOf(searchTerm);
          } else if (engStr.includes(searchTerm)) {
            score = 500 + engStr.indexOf(searchTerm);
          } else if (codeStr.includes(searchTerm)) {
            score = 600 + codeStr.indexOf(searchTerm);
          } else if (termNorm && codeNorm.includes(termNorm)) {
            score = 600 + codeNorm.indexOf(termNorm);
          }
          return { item, score };
        })
        .sort((a, b) => a.score - b.score)
        .map(obj => obj.item);
      // 限制結果數量避免一次載入太多
      matched = matched.slice(0, 10);
      if (!matched || matched.length === 0) {
        resultsList.innerHTML = '<div class="p-2 text-center text-gray-500 text-sm">找不到符合條件的穴位</div>';
        resultsContainer.classList.remove('hidden');
        // 沒有結果時隱藏提示
        if (typeof hideTooltip === 'function') {
          hideTooltip();
        }
        return;
      }
      // 建立結果列表，每個結果可以點擊加入針灸備註
      resultsList.innerHTML = matched.map(item => {
        const safeName = (item.name || '').replace(/'/g, "\\'");
        // 決定顯示名稱：英語介面且有英譯名稱時顯示英譯名稱，否則顯示中文名稱
        let displayName = item.name || '';
        try {
          const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
          if (langSel && langSel.toLowerCase().startsWith('en') && item.englishName) {
            displayName = item.englishName;
          }
        } catch (_e) {
          displayName = item.name || '';
        }
        const details = [];
        details.push('名稱：' + (item.name || ''));
        if (item.meridian) details.push('經絡：' + item.meridian);
        if (item.location) details.push('定位：' + item.location);
        if (item.functions) {
          const funcs = Array.isArray(item.functions) ? item.functions.join('、') : String(item.functions);
          details.push('功效：' + funcs);
        }
        if (item.indications) {
          const inds = Array.isArray(item.indications) ? item.indications.join('、') : String(item.indications);
          details.push('主治：' + inds);
        }
        if (item.method) details.push('針法：' + item.method);
        if (item.category) details.push('分類：' + item.category);
        if (item.internationalCode) details.push('國際代碼：' + item.internationalCode);
        const encoded = encodeURIComponent(details.join('\n'));
        // 使用藍色背景與邊框呈現搜尋結果，每個結果可點擊加入備註
        return `<div class="p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer text-center text-sm" data-tooltip="${encoded}" onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()" onclick="addAcupointToNotes('${safeName}')">${window.escapeHtml(displayName)}</div>`;
      }).join('');
      resultsContainer.classList.remove('hidden');
      acupointNotesSearchSelectionIndex = -1;
    } catch (e) {
      console.error('搜尋穴位時發生錯誤：', e);
    }
  }

  /**
   * 將指定穴位名稱加入針灸備註的方塊列表。
   * 新增後更新 textarea，清除搜尋欄與結果。
   * @param {string} name 穴位名稱
   */
  function addAcupointToNotes(name) {
    try {
      if (!name) return;
      const form = document.getElementById('formAcupunctureNotes');
      if (!form) return;
      // 建立代表穴位的 span 元素
      const span = document.createElement('span');
      // 使用稍大的字體，將原本的 text-xs 改為 text-sm 以增大顯示穴位名稱的字體
      span.className = 'inline-flex items-center justify-center bg-blue-100 border border-blue-200 rounded text-sm text-blue-800 px-1 py-0.5 mr-1 cursor-pointer';
      // 讓此方塊本身不可編輯，避免用戶修改內文字
      span.setAttribute('contenteditable', 'false');
      span.dataset.acupointName = name;
      span.textContent = name;
      // 設定 tooltip 內容
      const tooltipContent = getAcupointTooltipContent(name || '');
      if (tooltipContent) {
        const encoded = encodeURIComponent(tooltipContent);
        span.setAttribute('data-tooltip', encoded);
        span.addEventListener('mouseenter', function(e) { showTooltip(e, this.getAttribute('data-tooltip')); });
        span.addEventListener('mousemove', function(e) { moveTooltip(e); });
        span.addEventListener('mouseleave', function() { hideTooltip(); });
      }
      // 點擊方塊可刪除該項
      span.addEventListener('click', function() {
        const parent = span.parentNode;
        if (parent) {
          // 若方塊後有單獨的空白文字節點，一併刪除，避免留下殘餘空格
          const next = span.nextSibling;
          if (next && next.nodeType === Node.TEXT_NODE && /^\s*$/.test(next.textContent)) {
            parent.removeChild(next);
          }
          parent.removeChild(span);
        }
        if (typeof hideTooltip === 'function') hideTooltip();
        queueConsultationSymptomsDraftSave();
      });
      // 在處理插入前，紀錄當前滾動位置，以便插入後恢復滾動位置
      const scrollXBefore = window.pageXOffset || document.documentElement.scrollLeft || 0;
      const scrollYBefore = window.pageYOffset || document.documentElement.scrollTop || 0;

      // 將焦點設至針灸備註欄，確保游標定位於可編輯區，但避免捲動畫面
      if (typeof form.focus === 'function') {
        try {
          // preventScroll 避免自動捲動畫面
          form.focus({ preventScroll: true });
        } catch (_er) {
          // 若瀏覽器不支援 preventScroll，則改用一般 focus
          form.focus();
        }
      }
      // 取得當前選取範圍
      const sel = window.getSelection();
      let range = null;
      let insertAtEnd = true;
      if (sel && sel.rangeCount > 0) {
        range = sel.getRangeAt(0);
        // 檢查選取範圍是否位於針灸備註欄內
        let container = range.commonAncestorContainer || range.startContainer;
        // 若為文本節點則取其父元素判斷
        if (container && container.nodeType === Node.TEXT_NODE) {
          container = container.parentNode;
        }
        if (container && form.contains(container)) {
          insertAtEnd = false;
        }
      }
      if (insertAtEnd || !range) {
        // 若游標不在備註欄內，或沒有選取範圍，則將 span 插入至最後
        form.appendChild(span);
        // 在方塊之後加上一個空格以區隔後續輸入
        const space = document.createTextNode(' ');
        form.appendChild(space);
        // 將游標移到空格之後
        if (sel) {
          const newRange = document.createRange();
          newRange.setStartAfter(space);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      } else {
        // 在選取位置插入 span 及空格分隔符
        range.deleteContents();
        range.insertNode(span);
        // 在 span 後插入一個空格，以免與後續內容黏在一起
        const space = document.createTextNode(' ');
        span.after(space);
        // 將游標移到空格之後
        if (sel) {
          const newRange = document.createRange();
          newRange.setStartAfter(space);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }
      // 插入後清空搜尋欄並隱藏結果與提示
      clearAcupointNotesSearch();
      // 恢復插入前的滾動位置，以避免畫面移動
      try {
        window.scrollTo({ left: scrollXBefore, top: scrollYBefore, behavior: 'auto' });
      } catch (_e) {
        // 若瀏覽器不支援 scrollTo 的選項寫法，回退到簡單調用
        window.scrollTo(scrollXBefore, scrollYBefore);
      }
      queueConsultationSymptomsDraftSave();
    } catch (err) {
      console.error('新增穴位到針灸備註時發生錯誤：', err);
    }
  }

  /**
   * 初始化針灸備註欄中的已存在穴位方塊，為每個方塊掛載滑鼠提示與刪除事件。
   * 在載入歷史病歷或編輯模式時呼叫此函式，以便方塊仍具備提示與刪除功能。
   */
  function initializeAcupointNotesSpans() {
    try {
      const container = document.getElementById('formAcupunctureNotes');
      if (!container) return;
      // 查找所有具有 data-acupoint-name 屬性的 span，代表穴位方塊
      const spans = container.querySelectorAll('span[data-acupoint-name]');
      spans.forEach(span => {
        // 確保方塊本身不可編輯
        span.setAttribute('contenteditable', 'false');
        const encoded = span.getAttribute('data-tooltip');
        if (encoded) {
          span.addEventListener('mouseenter', function(e) {
            showTooltip(e, encoded);
          });
          span.addEventListener('mousemove', function(e) {
            moveTooltip(e);
          });
          span.addEventListener('mouseleave', function() {
            hideTooltip();
          });
        }
        // 點擊方塊可刪除自身與後方空白
        span.addEventListener('click', function() {
          const parent = span.parentNode;
          if (parent) {
            const next = span.nextSibling;
            if (next && next.nodeType === Node.TEXT_NODE && /^\s*$/.test(next.textContent)) {
              parent.removeChild(next);
            }
            parent.removeChild(span);
          }
          hideTooltip();
        });
      });
    } catch (err) {
      console.error('初始化針灸備註方塊失敗:', err);
    }
  }

  // 將初始化函式掛載至 window，方便外部呼叫
  window.initializeAcupointNotesSpans = initializeAcupointNotesSpans;

  /**
   * 將包含 HTML 標籤的字串轉換為純文字。
   * 用於在病歷查看模式下顯示針灸備註，避免直接顯示方塊。
   * @param {string} html 帶有 HTML 內容的字串
   * @returns {string} 去除標籤後的純文字
   */
  function stripHtmlTags(html) {
    try {
      if (!html) return '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      // 使用 innerText 取得純文字，避免包含 HTML 標籤
      return tmp.innerText || tmp.textContent || '';
    } catch (_err) {
      // 若有錯誤則回傳原始字串，避免程式中斷
      return html;
    }
  }

  // 將 stripHtmlTags 函式掛載到 window 供模板調用
  window.stripHtmlTags = stripHtmlTags;

  // 將自訂函式掛載至 window 物件，以便 HTML 內嵌事件調用
  window.searchAcupointForNotes = searchAcupointForNotes;
  window.addAcupointToNotes = addAcupointToNotes;
  window.clearAcupointNotesSearch = clearAcupointNotesSearch;

          // 初始化
document.addEventListener('DOMContentLoaded', function() {
            // 初始渲染藥方、穴位與模板列表
            renderHerbCombinations();
            renderAcupointCombinations();
            renderPrescriptionTemplates();
            renderDiagnosisTemplates();
            // 在渲染模板後初始化搜尋功能，確保可找到相關元素
            try {
                if (typeof setupTemplateLibrarySearch === 'function') {
                    setupTemplateLibrarySearch();
                }
            } catch (_e) {
                console.error('初始化模板庫搜尋功能失敗:', _e);
            }

            // 監聽針灸備註輸入區的輸入事件，當用鍵盤刪除方塊或編輯內容時隱藏浮窗
            try {
                const acnForm = document.getElementById('formAcupunctureNotes');
                if (acnForm) {
                    acnForm.addEventListener('input', function() {
                        if (typeof hideTooltip === 'function') {
                            hideTooltip();
                        }
                    });
                }
            } catch (_e) {
                console.error('初始化針灸備註輸入區事件失敗:', _e);
            }

            /**
             * 一些彈窗（例如分類管理與編輯彈窗）原本是在個別功能區塊下的容器中定義。
             * 當這些父容器被切換為 hidden 時，彈窗也會隨之被隱藏，導致使用者在其他功能頁無法彈出對話框。
             * 為解決此問題，將這些彈窗節點移動到 body 底下，避免受父層顯示狀態影響。
             */
            // 將需要在診症系統中使用的彈窗節點移動到 body 底下，避免被隱藏區域遮蔽
            // 將需要在診症系統中使用的彈窗節點移動到 body 底下，避免受父容器顯示狀態影響
            // 包含診斷模板與醫囑模板彈窗在內的所有模態框
            [
                'categoryModal',
                'editModal',
                'herbComboModal',
                'acupointComboModal',
                // 新增將診斷模板與醫囑模板彈窗移至 body，避免因父層隱藏而無法顯示
                'diagnosisTemplateModal',
                'prescriptionTemplateModal'
            ].forEach(function(id) {
                const modal = document.getElementById(id);
                if (modal && modal.parentElement !== document.body) {
                    document.body.appendChild(modal);
                }
            });

            // 在添加事件監聽前，先初始化個人常用組合的搜尋與分類篩選介面
            try {
                if (typeof setupPersonalComboSearchAndFilter === 'function') {
                    setupPersonalComboSearchAndFilter();
                }
            } catch (_e) {
                // 若初始化失敗，不影響後續流程
            }

            // 監聽個人慣用藥方與穴位組合的搜尋與分類變更，以即時刷新列表
            try {
                // 搜尋輸入框：對應不同可能的 ID
                const herbSearchIds = ['herbComboSearch', 'searchHerbCombo', 'searchHerbCombination', 'herbComboSearchInput'];
                herbSearchIds.forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('input', function() {
                            renderHerbCombinations();
                        });
                    }
                });
                // 藥方分類下拉選單
                const herbCatIds = ['herbComboCategoryFilter', 'herbComboCategory', 'herbComboCategorySelect'];
                herbCatIds.forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('change', function() {
                            renderHerbCombinations();
                        });
                    }
                });
                // 穴位搜尋輸入
                const acuSearchIds = ['acupointComboSearch', 'searchAcupointCombo', 'acupointComboSearchInput'];
                acuSearchIds.forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('input', function() {
                            renderAcupointCombinations();
                        });
                    }
                });
                // 穴位分類下拉選單
                const acuCatIds = ['acupointComboCategoryFilter', 'acupointComboCategory', 'acupointComboCategorySelect'];
                acuCatIds.forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('change', function() {
                            renderAcupointCombinations();
                        });
                    }
                });
            } catch (e) {
                console.error('初始化搜尋與分類監聽器時發生錯誤:', e);
            }

            (function() {
                function setup(id, list) {
                    const el = document.getElementById(id);
                    if (!el || !Array.isArray(list)) return;
                    const parent = el.parentElement;
                    if (parent) {
                        const style = window.getComputedStyle(parent);
                        if (style.position === 'static' || !style.position) {
                            parent.style.position = 'relative';
                        }
                    }
                    const box = document.createElement('div');
                    box.id = 'autocomplete-' + id;
                    box.className = 'hidden absolute left-0 right-0 bg-white border border-gray-300 rounded shadow max-h-40 overflow-y-auto z-50 text-sm';
                    el.insertAdjacentElement('afterend', box);
                    let sel = -1;
                    const render = function(items) {
                        box.innerHTML = '';
                        items.forEach(function(text, idx) {
                            const item = document.createElement('div');
                            item.className = 'px-3 py-2 hover:bg-blue-50 cursor-pointer';
                            item.textContent = text;
                            item.addEventListener('mousedown', function(e) {
                                e.preventDefault();
                                el.value = text;
                                box.classList.add('hidden');
                            });
                            box.appendChild(item);
                        });
                        if (items.length > 0) {
                            box.classList.remove('hidden');
                            sel = -1;
                        } else {
                            box.classList.add('hidden');
                        }
                    };
                    const filter = function() {
                        const q = (el.value || '').trim();
                        if (!q) {
                            box.classList.add('hidden');
                            return;
                        }
                        const lower = q.toLowerCase();
                        const items = list.filter(function(s) { return String(s).toLowerCase().includes(lower); }).slice(0, 16);
                        render(items);
                    };
                    el.addEventListener('input', debounce(filter, 150));
                    el.addEventListener('keydown', function(e) {
                        if (box.classList.contains('hidden')) return;
                        const items = Array.from(box.children);
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            sel = Math.min(sel + 1, items.length - 1);
                            items.forEach(function(n, i) { n.classList.toggle('bg-blue-100', i === sel); });
                            if (sel >= 0 && items[sel]) { items[sel].scrollIntoView({ block: 'nearest' }); }
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            sel = Math.max(sel - 1, 0);
                            items.forEach(function(n, i) { n.classList.toggle('bg-blue-100', i === sel); });
                            if (sel >= 0 && items[sel]) { items[sel].scrollIntoView({ block: 'nearest' }); }
                        } else if (e.key === 'Enter') {
                            if (sel >= 0 && items[sel]) {
                                e.preventDefault();
                                el.value = items[sel].textContent || '';
                                box.classList.add('hidden');
                            }
                        } else if (e.key === 'Escape') {
                            box.classList.add('hidden');
                        }
                    });
                    document.addEventListener('click', function(e) {
                        if (e.target !== el && !box.contains(e.target)) {
                            box.classList.add('hidden');
                        }
                    });
                }
                (async function() {
                    try {
                        const data = await fetchJsonWithFallback('diagnosisSuggestions.json');
                        const tongue = Array.isArray(data.tongue) ? data.tongue : [];
                        const pulse = Array.isArray(data.pulse) ? data.pulse : [];
                        const tcm = Array.isArray(data.tcmDiagnosis) ? data.tcmDiagnosis : [];
                        const synd = Array.isArray(data.syndrome) ? data.syndrome : [];
                        setup('formTongue', tongue);
                        setup('formPulse', pulse);
                        setup('formDiagnosis', tcm);
                        setup('formSyndrome', synd);
                    } catch (_e) {}
                })();
            })();

            try {
                const pInput = document.getElementById('prescriptionSearch');
                if (pInput) {
                    pInput.addEventListener('keydown', function(e) {
                        const list = document.getElementById('prescriptionSearchList');
                        const container = document.getElementById('prescriptionSearchResults');
                        if (!list || !container || container.classList.contains('hidden')) return;
                        const items = Array.from(list.children);
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            prescriptionSearchSelectionIndex = Math.min(prescriptionSearchSelectionIndex + 1, items.length - 1);
                            items.forEach(function(n, i) { n.classList.toggle('bg-yellow-200', i === prescriptionSearchSelectionIndex); });
                            if (prescriptionSearchSelectionIndex >= 0 && items[prescriptionSearchSelectionIndex]) { items[prescriptionSearchSelectionIndex].scrollIntoView({ block: 'nearest' }); }
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            prescriptionSearchSelectionIndex = Math.max(prescriptionSearchSelectionIndex - 1, 0);
                            items.forEach(function(n, i) { n.classList.toggle('bg-yellow-200', i === prescriptionSearchSelectionIndex); });
                            if (prescriptionSearchSelectionIndex >= 0 && items[prescriptionSearchSelectionIndex]) { items[prescriptionSearchSelectionIndex].scrollIntoView({ block: 'nearest' }); }
                        } else if (e.key === 'Enter') {
                            if (prescriptionSearchSelectionIndex >= 0 && items[prescriptionSearchSelectionIndex]) {
                                e.preventDefault();
                                items[prescriptionSearchSelectionIndex].click();
                                container.classList.add('hidden');
                                prescriptionSearchSelectionIndex = -1;
                            }
                        } else if (e.key === 'Escape') {
                            container.classList.add('hidden');
                            prescriptionSearchSelectionIndex = -1;
                        }
                    });
                }
            } catch (_e) {}

            try {
                const aInput = document.getElementById('acupointNotesSearch');
                if (aInput) {
                    aInput.addEventListener('keydown', function(e) {
                        const list = document.getElementById('acupointNotesSearchList');
                        const container = document.getElementById('acupointNotesSearchResults');
                        if (!list || !container || container.classList.contains('hidden')) return;
                        const items = Array.from(list.children);
                        const applyHighlight = function() {
                            items.forEach(function(n, i) {
                                const isSel = i === acupointNotesSearchSelectionIndex;
                                n.classList.toggle('bg-blue-100', isSel);
                                n.classList.toggle('ring-2', isSel);
                                n.classList.toggle('ring-blue-400', isSel);
                                n.classList.toggle('bg-blue-50', !isSel);
                                if (isSel) { n.scrollIntoView({ block: 'nearest' }); }
                            });
                        };
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            acupointNotesSearchSelectionIndex = Math.min(acupointNotesSearchSelectionIndex + 1, items.length - 1);
                            applyHighlight();
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            acupointNotesSearchSelectionIndex = Math.max(acupointNotesSearchSelectionIndex - 1, 0);
                            applyHighlight();
                        } else if (e.key === 'Enter') {
                            if (acupointNotesSearchSelectionIndex >= 0 && items[acupointNotesSearchSelectionIndex]) {
                                e.preventDefault();
                                items[acupointNotesSearchSelectionIndex].click();
                                container.classList.add('hidden');
                                acupointNotesSearchSelectionIndex = -1;
                            }
                        } else if (e.key === 'Escape') {
                            container.classList.add('hidden');
                            acupointNotesSearchSelectionIndex = -1;
                        }
                    });
                }
            } catch (_e) {}

            
          });

// 全局與登入版權聲明初始化：在 DOMContentLoaded 後插入對應的版權資訊。
document.addEventListener('DOMContentLoaded', function () {
  try {
    // 插入登入頁版權聲明（位於登入按鈕下方）
    const loginPage = document.getElementById('loginPage');
    if (loginPage && !document.getElementById('loginCopyright')) {
      // 尋找登入卡片容器
      let cardContainer = null;
      // 嘗試尋找具有 shadow 樣式的登入卡片
      cardContainer = loginPage.querySelector('.bg-white.rounded-2xl.shadow-2xl');
      // 若未找到，則退而求其次尋找首個白色背景容器
      if (!cardContainer) {
        cardContainer = loginPage.querySelector('.bg-white');
      }
      if (cardContainer) {
        const loginCopy = document.createElement('div');
        loginCopy.id = 'loginCopyright';
        loginCopy.className = 'text-center mt-8 text-xs text-gray-400';
        loginCopy.innerHTML = `
          <div class="border-t border-gray-200 pt-4">
            Copyright © 2025 <span class="text-gray-600 font-medium">名醫診所系統</span>. All rights reserved.
          </div>
        `;
        cardContainer.appendChild(loginCopy);
      }
    }

    // 插入全局版權聲明（頁面底部）
    if (!document.getElementById('globalCopyright')) {
      const globalContainer = document.createElement('div');
      globalContainer.id = 'globalCopyright';
      globalContainer.className = 'max-w-7xl mx-auto px-4 py-4 mt-8';
      globalContainer.innerHTML = `
        <div class="text-center border-t border-gray-200 pt-4">
          <div class="text-xs text-gray-400">
            Copyright © 2025 <span class="text-gray-600 font-medium">名醫診所系統</span>. All rights reserved.
          </div>
        </div>
      `;
      // 預設隱藏，登入頁面顯示時不顯示全局版權
      globalContainer.style.display = 'none';
      document.body.appendChild(globalContainer);
    }

    // 根據目前頁面狀態顯示或隱藏對應版權
    const loginVisible = loginPage && !loginPage.classList.contains('hidden') && window.getComputedStyle(loginPage).display !== 'none';
    const globalCopyright = document.getElementById('globalCopyright');
    const loginCopyright = document.getElementById('loginCopyright');
    if (loginVisible) {
      if (globalCopyright) globalCopyright.style.display = 'none';
      if (loginCopyright) loginCopyright.style.display = '';
    } else {
      if (globalCopyright) globalCopyright.style.display = '';
      if (loginCopyright) loginCopyright.style.display = 'none';
    }
  } catch (e) {
    console.error('初始化版權資訊時發生錯誤', e);
  }
});

/**
 * 顯示主系統頁面底部的版權聲明，隱藏登入頁內的版權。
 */
function showGlobalCopyright() {
  try {
    const globalCopyright = document.getElementById('globalCopyright');
    const loginCopyright = document.getElementById('loginCopyright');
    if (globalCopyright) {
      globalCopyright.style.display = '';
    }
    if (loginCopyright) {
      loginCopyright.style.display = 'none';
    }
  } catch (e) {
    console.error('顯示全局版權時發生錯誤', e);
  }
}

/**
 * 顯示登入頁內的版權聲明，隱藏頁面底部的版權。
 */
function hideGlobalCopyright() {
  try {
    const globalCopyright = document.getElementById('globalCopyright');
    const loginCopyright = document.getElementById('loginCopyright');
    if (globalCopyright) {
      globalCopyright.style.display = 'none';
    }
    if (loginCopyright) {
      loginCopyright.style.display = '';
    }
  } catch (e) {
    console.error('隱藏全局版權時發生錯誤', e);
  }
}

/**
 * 網路狀態檢測與提示。
 *
 * 透過瀏覽器的 online/offline 事件與 Firebase 連線狀態，
 * 在離線時顯示覆蓋層及提示訊息，暫停所有操作。
 * 重新連線後，移除覆蓋層並提示使用者重新操作或自動重試。
 */
(function() {
  // 紀錄當前是否已經處於離線狀態，避免重複提示
  let wasOffline = false;

  /**
   * 顯示網路離線覆蓋層。
   * @param {string} message 顯示的訊息
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
   * 在離線時顯示覆蓋層與提示；在線上時移除覆蓋層並提示。
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
      // 不再顯示恢復彈窗，僅移除覆蓋層
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
})();

/*
 * 全域鍵盤快捷與閒置監控 IIFE
 *
 * 提供按鍵控制：
 *  1. Esc：若有彈窗則關閉彈窗；若無彈窗則切換側邊功能選單（開啟或關閉）。
 *  2. Enter：在彈窗中按下 Enter 會觸發主要操作，例如儲存、確定或確認掛號。
 *  3. ArrowLeft / ArrowRight：當查看病歷或診症記錄彈窗開啟時，使用左右方向鍵切換較舊/較新紀錄。
 *
 * 此 IIFE 亦提供閒置自動登出功能。登入時可調用 startInactivityMonitoring() 開始監控；登出時調用 stopInactivityMonitoring() 停止。
 */
(function() {
  // ======== 全域按鍵處理邏輯 ========
  /**
   * 全域鍵盤事件處理函式
   * @param {KeyboardEvent} ev 
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

    // 處理左右方向鍵：在 keydown 階段根據情境切換頁面。
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      // 只在 keydown 事件處理方向鍵，避免 keypress 重複處理
      if (eventType !== 'keydown') {
        return;
      }
      const direction = key === 'ArrowLeft' ? -1 : 1;
      if (modals.length > 0 && !isEditableInput) {
        // 若有病歷或診症彈窗，優先切換彈窗內容頁
        const activeModal = modals[modals.length - 1];
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
      // 如果沒有彈窗並且目前焦點不在可編輯輸入中，則嘗試在有分頁的列表中換頁
      if (!isEditableInput) {
        try {
          if (typeof navigatePagination === 'function') {
            navigatePagination(direction);
            ev.preventDefault();
            ev.stopPropagation();
          }
        } catch (_e) {
          // 忽略換頁錯誤以避免影響其他操作
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
        // 無彈窗時：Esc 切換側邊欄（關住→打開、打開→關閉）。
        // ev.repeat：按住 Esc 嘅瀏覽器自動重複 keydown 一律忽略，否則每
        // ~30ms 一次重複會不斷開合；冪等＋320ms 反向守衛為雙保險。
        if (ev.repeat) {
          return;
        }
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        if (sidebar.classList.contains('sidebar-open')) {
          if (typeof closeSidebar === 'function') closeSidebar({ bypassGuard: true });
        } else {
          if (typeof openSidebar === 'function') openSidebar({ bypassGuard: true });
        }
        ev.preventDefault();
        ev.stopPropagation();
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
   * 開始閒置監控。在登入後調用。
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
   * 停止閒置監控。在登出後調用。
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
})();

/*
 * 穴位圖選取功能
 *
 * 在針灸備註區域提供一個按鈕，點擊可開啟穴位圖的彈窗，使用者可在圖上選擇穴位。
 * 於彈窗確認後，選取的穴位會以方塊形式添加至針灸備註輸入區。
 */
(function() {
  /**
   * 開啟穴位選擇地圖的彈窗。
   * 會自動初始化穴位庫與座標資料，並在彈窗內顯示可互動的穴位圖。
   * 使用者點擊穴位後可選取或取消，按下確認後將新增選取的穴位至針灸備註。
   */
  async function openAcupointMapForNotes() {
    try {
      // 確保穴位庫已載入
      if (!window.acupointLibraryLoaded || !Array.isArray(window.acupointLibrary) || window.acupointLibrary.length === 0) {
        if (typeof initAcupointLibrary === 'function') {
          try {
            await initAcupointLibrary();
          } catch (_initErr) {
            console.error('載入穴位庫失敗：', _initErr);
          }
        }
      }
      // 套用座標資料（若函式存在）
      try {
        if (typeof window.applyAcupointCoordinates === 'function') {
          window.applyAcupointCoordinates();
        }
      } catch (_cErr) {}
      // 從備註欄收集已存在的穴位名稱
      const existingSpans = document.querySelectorAll('#formAcupunctureNotes span[data-acupoint-name]');
      const existingSet = new Set();
      existingSpans.forEach(span => {
        const n = span && span.dataset ? span.dataset.acupointName : '';
        if (n) existingSet.add(n);
      });
      // 初始化選取名單為已有穴位
      const selectedNames = Array.from(existingSet);
      // 決定介面語言
      let lang = 'zh';
      try {
        const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
        if (langSel) lang = langSel.toLowerCase();
      } catch (_e) {}
      const isEn = lang.startsWith('en');
      const title = isEn ? 'Select Acupoints' : '選擇穴位';
      const confirmText = isEn ? 'Confirm' : '確定';
      const cancelText = isEn ? 'Cancel' : '取消';
      // 開啟彈窗
      await Swal.fire({
        title: title,
        html: '<div id="acupointSelectMapContainer" style="width:100%;height:420px;"></div>',
        width: '80%',
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: cancelText,
        focusConfirm: false,
        didOpen: () => {
          initAcupointSelectionMapForNotes('acupointSelectMapContainer', selectedNames, existingSet);
        },
        preConfirm: () => {
          return selectedNames.slice();
        }
      }).then(result => {
        try {
          if (result && result.value && Array.isArray(result.value)) {
            result.value.forEach(name => {
              if (!existingSet.has(name)) {
                try {
                  if (typeof addAcupointToNotes === 'function') {
                    addAcupointToNotes(name);
                  }
                } catch (_addErr) {
                  console.error('加入穴位到備註失敗：', _addErr);
                }
              }
            });
          }
        } catch (_resErr) {
          console.error('處理穴位選取結果時發生錯誤：', _resErr);
        }
      });
    } catch (err) {
      console.error('開啟穴位圖彈窗失敗：', err);
    }
  }

  /**
   * 初始化穴位選擇地圖，並在圖上添加穴位標記。
   * @param {string} containerId 目標容器的 ID
   * @param {string[]} selectedNames 選取的穴位名稱陣列，會在使用者互動時更新
   * @param {Set<string>} existingSet 已存在於備註中的穴位名稱集合
   */
  function initAcupointSelectionMapForNotes(containerId, selectedNames, existingSet) {
    try {
      const container = document.getElementById(containerId);
      if (!container) return;
      // 載入穴位圖影像
      const img = new Image();
      img.src = 'images/combined_three.png';
      img.onload = function() {
        try {
          const w = img.width;
          const h = img.height;
          // 套用座標資料，以確保所有穴位都具備 x/y 或 multiCoords
          try {
            if (typeof window.applyAcupointCoordinates === 'function') {
              window.applyAcupointCoordinates();
            }
          } catch (_er) {}
          // 建立地圖
          const map = L.map(container, {
            crs: L.CRS.Simple,
            maxZoom: 4,
            zoomControl: true,
            attributionControl: false
          });
          const bounds = [[0, 0], [h, w]];
          L.imageOverlay(img.src, bounds).addTo(map);
          try { map.invalidateSize(); } catch (_e) {}
          const baseZoom = map.getBoundsZoom(bounds);
          const initialZoom = baseZoom - 1;
          if (typeof map.setMinZoom === 'function') {
            map.setMinZoom(initialZoom);
          } else {
            map.options.minZoom = initialZoom;
          }
          if (typeof map.setMaxBounds === 'function') {
            map.setMaxBounds(bounds);
          }
          map.options.maxBoundsViscosity = 1.0;
          map.setView([h / 2, w / 2], initialZoom);
          try {
            setTimeout(function(){ try { map.invalidateSize(); } catch(_e) {} }, 50);
            window.addEventListener('resize', function(){ try { map.invalidateSize(); } catch(_e) {} });
            if (typeof ResizeObserver !== 'undefined') {
              const ro = new ResizeObserver(function(){ try { map.invalidateSize(); } catch(_e) {} });
              ro.observe(container);
            }
          } catch (_e) {}
          
          const defaultStyle = { color: '#2563eb', fillColor: '#2563eb', weight: 0, fillOpacity: 0.85, radius: 4 };
          const selectedStyle = { color: '#dc2626', fillColor: '#dc2626', weight: 0, fillOpacity: 0.85, radius: 5 };
          const library = Array.isArray(window.acupointLibrary) ? window.acupointLibrary : [];
          
          // --- 修改開始：支援多座標顯示 ---
          library.forEach(ac => {
            if (!ac) return;

            // 決定要繪製的座標列表
            let pointsToDraw = [];
            // 優先檢查是否有 multiCoords (由 acupointIntegration.js 產生)
            if (ac.multiCoords && Array.isArray(ac.multiCoords)) {
                pointsToDraw = ac.multiCoords;
            } else if (typeof ac.x === 'number' && typeof ac.y === 'number') {
                // 回退支援單一座標
                pointsToDraw = [{x: ac.x, y: ac.y}];
            }

            // 遍歷所有座標進行繪製
            pointsToDraw.forEach(pt => {
                if (typeof pt.x !== 'number' || typeof pt.y !== 'number') return;

                const lat = h * pt.y;
                const lon = w * pt.x;
                const marker = L.circleMarker([lat, lon], Object.assign({}, defaultStyle));
                
                marker.acName = ac.name || '';
                marker.selected = false;
                
                // 若穴位已在備註中或預設選取，標記為已選
                if (existingSet.has(marker.acName) || selectedNames.includes(marker.acName)) {
                  marker.selected = true;
                  marker.setStyle(selectedStyle);
                }
                marker.addTo(map);
                
                // 切換選取狀態
                marker.on('click', function() {
                  marker.selected = !marker.selected;
                  if (marker.selected) {
                    marker.setStyle(selectedStyle);
                    if (!selectedNames.includes(marker.acName)) {
                      selectedNames.push(marker.acName);
                    }
                  } else {
                    marker.setStyle(defaultStyle);
                    const idx = selectedNames.indexOf(marker.acName);
                    if (idx >= 0) {
                      selectedNames.splice(idx, 1);
                    }
                  }
                  
                  // 同步更新地圖上所有同名穴位的視覺狀態（可選功能，提升體驗）
                  map.eachLayer(function(layer) {
                      if (layer instanceof L.CircleMarker && layer.acName === marker.acName) {
                          layer.selected = marker.selected;
                          layer.setStyle(marker.selected ? selectedStyle : defaultStyle);
                      }
                  });
                });
                
                // 綁定簡易提示或詳細內容
                try {
                  let tooltipContent = '';
                  if (typeof getAcupointTooltipContent === 'function') {
                    tooltipContent = getAcupointTooltipContent(marker.acName) || '';
                  } else {
                    tooltipContent = marker.acName;
                  }
                  const html = String(tooltipContent).replace(/\n/g, '<br>');
                  marker.bindTooltip(html, { direction: 'top', offset: [0, -10], opacity: 0.9 });
                } catch (_tipErr) {
                  // 如果無法取得提示則忽略
                }
            });
          });
          // --- 修改結束 ---

        } catch (innerErr) {
          console.error('初始化穴位選擇地圖時發生錯誤：', innerErr);
        }
      };
      img.onerror = function() {
        console.warn('無法載入穴位圖影像');
      };
    } catch (outerErr) {
      console.error('初始化穴位選擇地圖失敗：', outerErr);
    }
  }
  // 將開啟彈窗的函式掛載至 window，供 HTML 按鈕調用
  if (typeof window !== 'undefined') {
    window.openAcupointMapForNotes = openAcupointMapForNotes;
  }
})();
