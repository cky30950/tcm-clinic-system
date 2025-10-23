/*
 * 模組：穴位庫地圖整合
 * 本檔案定義了穴位座標資料與地圖初始化函式，將其與主系統分離。
 * 引入本檔案後，會定義 window.initAcupointMap()，以及在需要時自動將
 * 指定穴位的座標填入 acupointLibrary。
 */

(function() {
    'use strict';
    /**
     * 座標資料表：以穴位名稱為鍵，對應相對座標 (x, y)。
     * x 表示圖片寬度的百分比 (0~1)，y 表示圖片高度的百分比 (0~1)。
     * 若未提供某穴位的座標，將不在地圖上繪製該點。
     */
    const ACUPOINT_COORDS = {
        // 中府（手太陰肺經的募穴），位於胸外側部。根據實際穴位圖測量，
        // 中府點約落在圖像寬度的 19.8%、高度的 24.9% 處。
        // x 越大越靠右、y 越大越靠下，可視需要微調。
        '中府': { x: 0.1978, y: 0.2491 }
        // 在此加入更多穴位名稱及其對應座標
    };

    /**
     * 將座標資料套用至全域 acupointLibrary。
     * 只有當 acupointLibrary 為陣列且項目沒有 x/y 屬性時才會套用。
     */
    function applyAcupointCoordinates() {
        // 從全域環境取得 acupointLibrary：使用全域變數或 window 屬性
        let library;
        try {
            // 優先使用全球變數 acupointLibrary（LET 宣告），若不存在再取 window.acupointLibrary
            library = typeof acupointLibrary !== 'undefined' ? acupointLibrary : window.acupointLibrary;
        } catch (_err) {
            library = window.acupointLibrary;
        }
        if (Array.isArray(library)) {
            // 將座標資料同步回 window，以便其他腳本可存取
            try {
                if (typeof window !== 'undefined') {
                    window.acupointLibrary = library;
                }
            } catch (_e) {}
            library.forEach(ac => {
                if (ac) {
                    // 取得穴位名稱，並移除括號及其後內容（例如 國際代碼）
                    const rawName = ac.name || '';
                    const key = String(rawName).replace(/\s*\(.*\)$/, '');
                    const coords = ACUPOINT_COORDS[key];
                    if (coords) {
                        // 如果尚未定義 x 或 y，則套用座標；避免覆蓋已有資料
                        if (typeof ac.x !== 'number') {
                            ac.x = coords.x;
                        }
                        if (typeof ac.y !== 'number') {
                            ac.y = coords.y;
                        }
                    }
                }
            });
        }
    }

    /**
     * 初始化穴位地圖。
     * 需在 DOM 存在 id="acupointMap" 的容器及已載入 Leaflet 後調用。
     * 地圖使用 Simple CRS，並根據 acupointLibrary 中的 x/y 座標放置標記。
     */
    window.initAcupointMap = function() {
        try {
            const mapContainer = document.getElementById('acupointMap');
            if (!mapContainer || mapContainer.dataset.initialized) {
                return;
            }
            mapContainer.dataset.initialized = 'true';
            // 準備圖片，載入完成後才建立地圖
            const img = new Image();
            img.src = 'images/combined_three.png';
            img.onload = function() {
                // 套用座標資料
                applyAcupointCoordinates();
                const w = img.width;
                const h = img.height;
                const map = L.map(mapContainer, {
                    crs: L.CRS.Simple,
                    // 不設定 minZoom，初始化後根據圖片尺寸計算
                    maxZoom: 4,
                    zoomControl: false,
                    attributionControl: false
                });
                const bounds = [[0,0],[h,w]];
                L.imageOverlay(img.src, bounds).addTo(map);
                // 計算當前容器下讓圖片恰好塞滿視窗的基礎縮放值
                const baseZoom = map.getBoundsZoom(bounds);
                // 為確保能完整看到圖片，將初始縮放再降低一級；這樣在較窄容器時也能完整顯示整張圖
                const initialZoom = baseZoom - 1;
                // 設定最小縮放等於計算後的初始縮放值，禁止再往下縮
                if (typeof map.setMinZoom === 'function') {
                    map.setMinZoom(initialZoom);
                } else {
                    map.options.minZoom = initialZoom;
                }
                // 設定地圖最大邊界，限制圖片邊界以外的拖動
                if (typeof map.setMaxBounds === 'function') {
                    map.setMaxBounds(bounds);
                }
                // 增加邊界黏滯度，使地圖邊緣更難被拖離
                map.options.maxBoundsViscosity = 1.0;
                // 將地圖視圖移到圖片中心並套用初始縮放，讓頁面載入時就能看到整張圖
                const centerLat = h / 2;
                const centerLon = w / 2;
                map.setView([centerLat, centerLon], initialZoom);
                // 從全域環境取得 acupointLibrary：使用全域變數或 window 屬性
                let library;
                try {
                    library = typeof acupointLibrary !== 'undefined' ? acupointLibrary : window.acupointLibrary;
                } catch (_err) {
                    library = window.acupointLibrary;
                }
                if (Array.isArray(library)) {
                    library.forEach(ac => {
                        if (ac && typeof ac.x === 'number' && typeof ac.y === 'number') {
                            const lat = h * ac.y;
                            const lon = w * ac.x;
                            // 使用 circleMarker 以小圓點表示穴位，避免標記遮住穴位本身
                            const marker = L.circleMarker([lat, lon], {
                                radius: 4,
                                color: '#2563eb',      // 外框顏色（藍色）
                                weight: 0,
                                fillColor: '#2563eb',   // 填充顏色
                                fillOpacity: 0.85
                            }).addTo(map);
                            let content = '';
                            try {
                                if (typeof getAcupointTooltipContent === 'function') {
                                    content = getAcupointTooltipContent(ac.name || '');
                                }
                            } catch (_err) {
                                content = ac.name || '';
                            }
                            if (content) {
                                const html = content.replace(/\n/g, '<br>');
                                // 如果全域定義了 showTooltip 則使用自訂提示框，否則使用 Leaflet 彈窗/提示
                                const hasCustomTooltip = (typeof showTooltip === 'function') && (typeof hideTooltip === 'function') && (typeof moveTooltip === 'function');
                                if (hasCustomTooltip) {
                                    // 綁定滑鼠事件以顯示自訂提示
                                    marker.on('mouseover', function(e) {
                                        // 由於 showTooltip 期望經過 encodeURIComponent 的內容
                                        try {
                                            showTooltip(e.originalEvent, encodeURIComponent(content));
                                        } catch (_ignore) {}
                                    });
                                    marker.on('mousemove', function(e) {
                                        try {
                                            moveTooltip(e.originalEvent);
                                        } catch (_ignore) {}
                                    });
                                    marker.on('mouseout', function() {
                                        try {
                                            hideTooltip();
                                        } catch (_ignore) {}
                                    });
                                } else {
                                    // 若沒有自訂提示框，則使用 Leaflet 的彈窗與工具提示
                                    if (typeof marker.bindPopup === 'function') {
                                        marker.bindPopup(html);
                                    }
                                    if (typeof marker.bindTooltip === 'function') {
                                        marker.bindTooltip(html, { direction: 'top', offset: [0, -10], opacity: 0.9 });
                                    }
                                }
                            }
                        }
                    });
                }

                // 在地圖上顯示滑鼠座標，方便判斷穴位位置
                try {
                    // 確保容器為相對定位，以便絕對定位的座標顯示元素正確對齊
                    if (!mapContainer.style.position) {
                        mapContainer.style.position = 'relative';
                    }
                    const coordDiv = document.createElement('div');
                    coordDiv.id = 'coordinateDisplay';
                    coordDiv.style.position = 'absolute';
                    coordDiv.style.bottom = '8px';
                    coordDiv.style.left = '8px';
                    coordDiv.style.padding = '2px 4px';
                    coordDiv.style.fontSize = '12px';
                    coordDiv.style.background = 'rgba(255, 255, 255, 0.7)';
                    coordDiv.style.borderRadius = '4px';
                    coordDiv.style.pointerEvents = 'none';
                    coordDiv.style.color = '#000';
                    mapContainer.appendChild(coordDiv);
                    // 更新座標顯示函式
                    map.on('mousemove', function(ev) {
                        const lat = ev.latlng.lat;
                        const lon = ev.latlng.lng;
                        // 只在滑鼠位於圖像範圍內時顯示座標
                        if (lat >= 0 && lat <= h && lon >= 0 && lon <= w) {
                            const relX = (lon / w).toFixed(4);
                            const relY = (lat / h).toFixed(4);
                            coordDiv.textContent = 'x: ' + relX + ', y: ' + relY;
                        } else {
                            coordDiv.textContent = '';
                        }
                    });
                    map.on('mouseout', function() {
                        coordDiv.textContent = '';
                    });
                } catch (coordErr) {
                    console.warn('Failed to add coordinate display:', coordErr);
                }
            };
            img.onerror = function() {
                console.warn('Cannot load image for acupoint map');
            };
        } catch (e) {
            console.warn('Failed to initialize acupoint map:', e);
        }
    };
})();