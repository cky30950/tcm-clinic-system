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
        // 範例：中府穴，位置位於圖像寬度 50%、高度 30% 之處
        '中府': { x: 0.5, y: 0.3 }
        // 在此加入更多穴位名稱及其對應座標
    };

    /**
     * 將座標資料套用至全域 acupointLibrary。
     * 只有當 acupointLibrary 為陣列且項目沒有 x/y 屬性時才會套用。
     */
    function applyAcupointCoordinates() {
        const library = window.acupointLibrary;
        if (Array.isArray(library)) {
            library.forEach(ac => {
                if (ac && typeof ac.x !== 'number' && typeof ac.y !== 'number') {
                    const coords = ACUPOINT_COORDS[ac.name];
                    if (coords) {
                        ac.x = coords.x;
                        ac.y = coords.y;
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
                    minZoom: -1,
                    maxZoom: 4,
                    zoomControl: false,
                    attributionControl: false
                });
                const bounds = [[0,0],[h,w]];
                L.imageOverlay(img.src, bounds).addTo(map);
                map.fitBounds(bounds);
                const library = window.acupointLibrary;
                if (Array.isArray(library)) {
                    library.forEach(ac => {
                        if (ac && typeof ac.x === 'number' && typeof ac.y === 'number') {
                            const lat = h * ac.y;
                            const lon = w * ac.x;
                            const marker = L.marker([lat, lon]).addTo(map);
                            let content = '';
                            try {
                                if (typeof getAcupointTooltipContent === 'function') {
                                    content = getAcupointTooltipContent(ac.name || '');
                                }
                            } catch (_err) {
                                content = ac.name || '';
                            }
                            if (content && marker.bindPopup) {
                                marker.bindPopup(content.replace(/\n/g, '<br>'));
                            }
                        }
                    });
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