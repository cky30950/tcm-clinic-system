// acupointMap.js
// 用於在針灸備註搜索欄旁提供穴位圖的功能。
// 此模塊負責顯示穴位圖模態框，提供穴位搜尋與列表，並將選定的穴位加入針灸備註。

(function() {
    // 預先定義部分常用穴位在穴位圖上的相對座標 (x, y 以 0-1 表示相對於圖像寬高)
    // 這些座標是根據穴位圖的大致位置手動估算，若需更精確的位置可根據實際圖像調整。
    const ACUPOINT_POSITIONS = [
        { name: '百會', x: 0.15, y: 0.08 },    // 頭頂
        { name: '大椎', x: 0.50, y: 0.20 },    // 頸椎第七節（背圖）
        { name: '合谷', x: 0.05, y: 0.55 },    // 手背虎口
        { name: '內關', x: 0.07, y: 0.42 },    // 前臂內側
        { name: '曲池', x: 0.06, y: 0.33 },    // 肘部外側
        { name: '太淵', x: 0.08, y: 0.45 },    // 腕橫紋上
        { name: '足三里', x: 0.21, y: 0.74 },  // 膝下胫骨外側
        { name: '三陰交', x: 0.22, y: 0.82 },  // 脛骨內側
        { name: '神門', x: 0.13, y: 0.43 },    // 腕部掌側
        { name: '太衝', x: 0.19, y: 0.92 },    // 足背
        { name: '崑崙', x: 0.88, y: 0.85 },    // 外踝後
        { name: '太溪', x: 0.85, y: 0.83 },    // 內踝後
        { name: '風池', x: 0.52, y: 0.11 }     // 枕骨下
    ];

    /**
     * 在穴位圖上繪製可點擊的穴位標記。
     * 標記根據 ACUPOINT_POSITIONS 定義的位置生成。
     */
    function renderAcupointMarkers() {
        const overlay = document.getElementById('acupointMapOverlay');
        if (!overlay) return;
        // 清空現有標記
        overlay.innerHTML = '';
        // 若沒有穴位資料則返回
        if (!Array.isArray(ACUPOINT_POSITIONS) || ACUPOINT_POSITIONS.length === 0) return;
        ACUPOINT_POSITIONS.forEach(pos => {
            const marker = document.createElement('div');
            // 使用 Tailwind 類別定義標記外觀：小圓點、藍色背景、白色邊框
            marker.className = 'absolute w-3 h-3 bg-blue-500 rounded-full border-2 border-white cursor-pointer';
            // 設置位置：使用 translate(-50%, -50%) 使標記中心對準指定點
            marker.style.left = (pos.x * 100) + '%';
            marker.style.top = (pos.y * 100) + '%';
            marker.style.transform = 'translate(-50%, -50%)';
            // 定義點擊事件：將該穴位加入針灸備註
            marker.addEventListener('click', function() {
                addAcupointFromMap(pos.name);
            });
            // 設置 tooltip：若有取出的穴位詳細資訊
            if (typeof window.getAcupointTooltipContent === 'function') {
                const tip = window.getAcupointTooltipContent(pos.name);
                if (tip) {
                    const encoded = encodeURIComponent(tip);
                    marker.setAttribute('data-tooltip', encoded);
                    marker.addEventListener('mouseenter', function(e) {
                        showTooltip(e, encoded);
                    });
                    marker.addEventListener('mousemove', function(e) {
                        moveTooltip(e);
                    });
                    marker.addEventListener('mouseleave', function() {
                        hideTooltip();
                    });
                }
            }
            overlay.appendChild(marker);
        });
    }
    /**
     * 開啟穴位圖模態框並初始化列表。
     * 會在顯示前確保穴位庫資料已載入。
     */
    async function openAcupointMap() {
        try {
            // 如果尚未載入穴位庫資料，先初始化。
            if (!window.acupointLibraryLoaded || !Array.isArray(window.acupointLibrary) || window.acupointLibrary.length === 0) {
                if (typeof window.initAcupointLibrary === 'function') {
                    await window.initAcupointLibrary();
                }
            }
        } catch (err) {
            console.error('載入穴位庫失敗：', err);
        }
        try {
            // 清空搜尋欄並渲染完整列表
            const searchInput = document.getElementById('acupointMapSearch');
            if (searchInput) {
                searchInput.value = '';
            }
            // 渲染穴位列表
            renderAcupointMapList();
            // 渲染圖上的穴位標記
            renderAcupointMarkers();
            // 顯示模態框
            const modal = document.getElementById('acupointMapModal');
            if (modal) {
                modal.classList.remove('hidden');
            }
        } catch (err) {
            console.error('開啟穴位圖模態框失敗：', err);
        }
    }

    /**
     * 關閉穴位圖模態框。
     */
    function closeAcupointMap() {
        try {
            const modal = document.getElementById('acupointMapModal');
            if (modal) {
                modal.classList.add('hidden');
            }
            // 隱藏 tooltip，以免殘留
            if (typeof window.hideTooltip === 'function') {
                window.hideTooltip();
            }
        } catch (err) {
            console.error('關閉穴位圖模態框失敗：', err);
        }
    }

    /**
     * 渲染穴位列表。可傳入篩選字串 filter 以搜尋指定名稱。
     * @param {string} filter 搜尋關鍵字（小寫）
     */
    function renderAcupointMapList(filter = '') {
        try {
            const listEl = document.getElementById('acupointMapList');
            if (!listEl) return;
            let lib = [];
            try {
                lib = Array.isArray(window.acupointLibrary) ? window.acupointLibrary : [];
            } catch (_err) {
                lib = [];
            }
            let matched = lib;
            const trimmed = (filter || '').toLowerCase().trim();
            if (trimmed) {
                matched = lib.filter(item => {
                    const nameStr = (item.name || '').toLowerCase();
                    const engStr = (item.englishName || '').toLowerCase();
                    return nameStr.includes(trimmed) || engStr.includes(trimmed);
                });
            }
            // 限制列表長度以避免一次載入過多項目
            matched = matched.slice(0, 200);
            if (!matched || matched.length === 0) {
                listEl.innerHTML = '<div class="p-2 text-center text-gray-500 text-sm">找不到符合的穴位</div>';
                return;
            }
            // 動態產生項目 HTML，每項可點擊加入針灸備註
            const rows = matched.map(item => {
                const name = item.name || '';
                // escape 單引號以插入 onclick
                const safeName = name.replace(/'/g, "\\'");
                // 依語言選擇顯示中文或英文名稱
                let displayName = name;
                try {
                    const langSel = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'zh';
                    if (langSel && langSel.toLowerCase().startsWith('en') && item.englishName) {
                        displayName = item.englishName;
                    }
                } catch (_e) {
                    displayName = name;
                }
                // 建立 tooltip 內容
                let tooltipEncoded = '';
                if (typeof window.getAcupointTooltipContent === 'function') {
                    const tooltip = window.getAcupointTooltipContent(name);
                    if (tooltip) {
                        tooltipEncoded = encodeURIComponent(tooltip);
                    }
                }
                // 建立 HTML 字串
                return `<div class="p-2 border border-gray-200 rounded mb-1 cursor-pointer text-sm hover:bg-gray-100"` +
                    (tooltipEncoded ? ` data-tooltip="${tooltipEncoded}" onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"` : '') +
                    ` onclick="addAcupointFromMap('${safeName}')">${window.escapeHtml(displayName)}</div>`;
            }).join('');
            listEl.innerHTML = rows;
        } catch (err) {
            console.error('渲染穴位圖列表失敗：', err);
        }
    }

    /**
     * 搜尋輸入事件處理：根據搜尋欄值更新列表。
     */
    function searchAcupointInMap() {
        try {
            const input = document.getElementById('acupointMapSearch');
            const val = input ? input.value : '';
            renderAcupointMapList((val || '').toLowerCase());
        } catch (err) {
            console.error('搜尋穴位圖列表失敗：', err);
        }
    }

    /**
     * 清空搜尋框並重置列表。
     */
    function clearAcupointMapSearch() {
        try {
            const input = document.getElementById('acupointMapSearch');
            if (input) {
                input.value = '';
            }
            renderAcupointMapList('');
        } catch (err) {
            console.error('清空穴位圖搜尋欄失敗：', err);
        }
    }

    /**
     * 將選定的穴位名稱加入針灸備註，並維持模態框開啟狀態。
     * @param {string} name 選定的穴位名稱
     */
    function addAcupointFromMap(name) {
        try {
            if (!name) return;
            if (typeof window.addAcupointToNotes === 'function') {
                window.addAcupointToNotes(name);
            }
        } catch (err) {
            console.error('從穴位圖新增穴位失敗：', err);
        }
    }

    // 將函式掛載到 window 以供全局調用
    window.openAcupointMap = openAcupointMap;
    window.closeAcupointMap = closeAcupointMap;
    window.renderAcupointMapList = renderAcupointMapList;
    window.searchAcupointInMap = searchAcupointInMap;
    window.clearAcupointMapSearch = clearAcupointMapSearch;
    window.addAcupointFromMap = addAcupointFromMap;
    window.renderAcupointMarkers = renderAcupointMarkers;

    // 在 DOM 就緒時綁定穴位圖按鈕的事件，以避免依賴 inline onclick 被 CSP 阻擋
    if (typeof document !== 'undefined') {
        const attachOpenHandler = () => {
            try {
                const btn = document.getElementById('openAcupointMapButton');
                if (btn) {
                    btn.removeEventListener('click', openAcupointMap);
                    btn.addEventListener('click', openAcupointMap);
                }
            } catch (err) {
                console.error('初始化穴位圖按鈕事件失敗：', err);
            }
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            attachOpenHandler();
        } else {
            document.addEventListener('DOMContentLoaded', attachOpenHandler);
        }
    }
})();