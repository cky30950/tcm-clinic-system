/* ============================================================
 * lazy-loader.js — 大庫延遲載入器
 * ------------------------------------------------------------
 * 系統啟動時不預先載入所有第三方庫，改為在實際需要時才動態下載。
 * 每個庫只會下載一次（Promise cache），後續請求直接複用。
 *
 * 使用方式：
 *   // 在任何 JS 中呼叫：
 *   await window.TCMLazy.load('xlsx');
 *   // 之後即可用 window.XLSX
 * ============================================================ */

(function () {
    'use strict';

    var LOADERS = {};

    function define(name, urls, test) {
        LOADERS[name] = { urls: urls, test: test, promise: null };
    }

    /* 各庫的 test 函數：檢查是否已存在於 window（可能已被其他腳本載入） */

    define('xlsx', [
        'js/vendor/xlsx/xlsx.full.min.js?v=20261005a'
    ], function () { return !!window.XLSX; });

    define('leaflet', [
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    ], function () { return !!window.L; });

    define('chart.js', [
        'https://cdn.jsdelivr.net/npm/chart.js'
    ], function () { return !!window.Chart; });

    define('tabulator', [
        'js/vendor/tabulator/tabulator.min.css?v=20261005a',
        'js/vendor/tabulator/tabulator.min.js?v=20261005a'
    ], function () { return !!window.Tabulator; });

    define('qrcode', [
        'https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@04f46c6a0708418cb7b96fc563eacae0fbf77674/qrcode.min.js'
    ], function () { return !!window.QRCode; });

    define('flatpickr', [
        'js/vendor/flatpickr/flatpickr.min.css?v=20261005a',
        'js/vendor/flatpickr/flatpickr.min.js?v=20261005a',
        'js/vendor/flatpickr/monthSelect.js?v=20261005a'
    ], function () { return !!window.flatpickr; });

    define('tom-select', [
        'js/vendor/tom-select/tom-select.bootstrap5.min.css?v=20261005a',
        'js/vendor/tom-select/tom-select.complete.min.js?v=20261005a'
    ], function () { return !!window.TomSelect; });

    define('notiflix', [
        'js/vendor/notiflix/notiflix.min.css?v=20261005a',
        'js/vendor/notiflix/notiflix.min.js?v=20261005a'
    ], function () { return !!window.Notiflix; });

    define('dompurify', [
        'js/vendor/dompurify/purify.min.js?v=20261005a'
    ], function () { return !!window.DOMPurify; });

    /* 動態插入一個 <script> 或 <link> 標籤，回傳 Promise */
    function insert(url) {
        return new Promise(function (resolve, reject) {
            var isCss = /\.css(\?|$)/i.test(url);
            var el;
            if (isCss) {
                el = document.createElement('link');
                el.rel = 'stylesheet';
                el.href = url;
            } else {
                el = document.createElement('script');
                el.src = url;
                el.async = false; // 保持順序
            }
            el.onload = resolve;
            el.onerror = function () {
                reject(new Error('載入失敗: ' + url));
            };
            var head = document.head || document.getElementsByTagName('head')[0];
            head.appendChild(el);
        });
    }

    /* 主入口：載入指定庫名（可單一或陣列） */
    function load(names) {
        if (!names) return Promise.resolve();
        if (!Array.isArray(names)) names = [names];

        var promises = names.map(function (name) {
            var cfg = LOADERS[name];
            if (!cfg) {
                return Promise.reject(new Error('未知的庫: ' + name));
            }
            // 已載入
            if (cfg.test()) return Promise.resolve();
            // 已在載入中
            if (cfg.promise) return cfg.promise;

            cfg.promise = cfg.urls.reduce(function (chain, url) {
                return chain.then(function () { return insert(url); });
            }, Promise.resolve()).then(function () {
                // 最後等一幀讓瀏覽器執行註冊到 window
                return new Promise(function (r) { setTimeout(r, 10); });
            }).then(function () {
                if (!cfg.test()) {
                    console.warn('[lazy-loader] ' + name + ' 載入後 window 上找不到物件');
                }
                return cfg;
            });

            return cfg.promise;
        });

        return Promise.all(promises);
    }

    window.TCMLazy = {
        load: load,
        /* 方便 debug：列出所有庫的當前狀態 */
        status: function () {
            var result = {};
            Object.keys(LOADERS).forEach(function (n) {
                var cfg = LOADERS[n];
                result[n] = { loaded: cfg.test(), loading: !!cfg.promise };
            });
            return result;
        }
    };

    /* ── 自動預熱：首屏載入完成後，在瀏覽器閒時間自動下載大庫到快取 ─────
     *
     * 策略：首屏只載入必要腳本 → 登入後 requestIdleCallback 一個一個載入
     * 好處：首屏 4G 上少 ~400KB 即時下載 → 登入後幾秒就快取好
     *       用戶真的點到財務報表/穴位圖時，從 SW cache-first 命中幾乎零延遲
     */
    function autoWarmup() {
        // 只有登錄後（localStorage 有 uid）才預熱，遊客不需要
        try {
            var hasAuth = !!(localStorage.getItem('authUserUid') || localStorage.getItem('staffUid'));
            if (!hasAuth) return;
        } catch (e) { return; }

        var WARMUP_TARGETS = ['xlsx', 'chart.js', 'tabulator', 'qrcode', 'leaflet'];
        var queue = WARMUP_TARGETS.slice();

        function warmupNext() {
            if (queue.length === 0) return;
            var name = queue.shift();
            // 已載入就跳過
            if (LOADERS[name].test()) {
                warmupNext();
                return;
            }
            load(name).then(function () {
                // 下一個空閒時間再載下一個
                scheduleIdle(warmupNext, 2000);
            }).catch(function () {
                console.warn('[lazy-loader] 預熱失敗: ' + name);
                scheduleIdle(warmupNext, 10000); // 失敗等久一點再試
            });
        }

        function scheduleIdle(fn, delay) {
            var start = function () {
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(fn, { timeout: 5000 });
                } else {
                    setTimeout(fn, delay || 1000);
                }
            };
            if (delay) setTimeout(start, delay); else start();
        }

        // 登入後 1-2 秒開始預熱
        scheduleIdle(warmupNext, 1500);
    }

    // DOM 就緒後啟動
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoWarmup, { once: true });
    } else {
        autoWarmup();
    }
})();
