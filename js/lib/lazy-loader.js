/* ============================================================
 * lazy-loader.js — 大庫延遲載入器
 * ------------------------------------------------------------
 * 系統啟動時不預先載入所有第三方庫，改為在實際需要時才動態下載。
 * 每個庫只會下載一次（Promise cache），後續請求直接複用。
 *
 * 使用方式：
 *   await window.TCMLazy.load('xlsx');
 *   // 之後即可用 window.XLSX
 *
 * 注意：Leaflet 已改回 system.html <head> 載入（defer），
 *       不在 lazy-loader 管理範圍內。
 * ============================================================ */

(function () {
    'use strict';

    var LOADERS = {};

    function define(name, urls, test) {
        LOADERS[name] = { urls: urls, test: test, promise: null };
    }

    define('xlsx', [
        'js/vendor/xlsx/xlsx.full.min.js?v=20261005a'
    ], function () { return !!window.XLSX; });

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

    /* 插入一個 <script> 或 <link>，回傳 Promise
     * 注意：<link rel=stylesheet>.onload 在 Safari 上不可靠，
     * 所以對 CSS 加 3 秒 timeout fallback（不阻塞後續 JS 載入）*/
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
                el.async = false;
            }
            var done = false;
            var timeout = setTimeout(function () {
                if (!done) {
                    done = true;
                    // CSS 就算 onload 沒觸發也繼續（不阻塞）
                    if (isCss) resolve();
                    else reject(new Error('載入 timeout: ' + url));
                }
            }, isCss ? 3000 : 10000);

            el.onload = function () {
                if (!done) { done = true; clearTimeout(timeout); resolve(); }
            };
            el.onerror = function () {
                if (!done) { done = true; clearTimeout(timeout); reject(new Error('載入失敗: ' + url)); }
            };

            var head = document.head || document.getElementsByTagName('head')[0];
            head.appendChild(el);
        });
    }

    function load(names) {
        if (!names) return Promise.resolve();
        if (!Array.isArray(names)) names = [names];

        var promises = names.map(function (name) {
            var cfg = LOADERS[name];
            if (!cfg) {
                return Promise.reject(new Error('未知的庫: ' + name));
            }
            if (cfg.test()) return Promise.resolve();
            if (cfg.promise) return cfg.promise;

            cfg.promise = cfg.urls.reduce(function (chain, url) {
                return chain.then(function () { return insert(url); });
            }, Promise.resolve()).then(function () {
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
        status: function () {
            var result = {};
            Object.keys(LOADERS).forEach(function (n) {
                var cfg = LOADERS[n];
                result[n] = { loaded: cfg.test(), loading: !!cfg.promise };
            });
            return result;
        }
    };

    /* ── 自動預熱：登入後，在瀏覽器閒時間自動下載大庫 ──────────────────── */
    function autoWarmup() {
        // 檢查登入狀態（Firebase Auth currentUser 存在即表示已登入）
        var hasAuth = false;
        try {
            hasAuth = !!(window.firebase && window.firebase.auth && window.firebase.auth.currentUser);
            // 備援：localStorage['users'] 有資料
            if (!hasAuth && localStorage.getItem('users')) {
                try {
                    var users = JSON.parse(localStorage.getItem('users'));
                    hasAuth = !!(users && Object.keys(users).length > 0);
                } catch (_e) {}
            }
        } catch (_e) { return; }
        if (!hasAuth) return;

        // Network Information API：低速網路（2G/slow-2g）直接跳過預熱，
        // 避免跟頁面資源競爭頻寬造成首屏更慢
        try {
            var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (conn) {
                var eff = conn.effectiveType;
                if (eff === '2g' || eff === 'slow-2g') {
                    console.info('[lazy-loader] 低速網路 (' + eff + ')，跳過自動預熱');
                    return;
                }
            }
        } catch (_e) {}

        var WARMUP_TARGETS = ['xlsx', 'qrcode'];
        var queue = WARMUP_TARGETS.slice();

        function warmupNext() {
            if (queue.length === 0) return;
            var name = queue.shift();
            if (LOADERS[name].test()) { warmupNext(); return; }
            load(name).then(function () {
                scheduleIdle(warmupNext, 3000);
            }).catch(function () {
                console.warn('[lazy-loader] 預熱失敗: ' + name);
                scheduleIdle(warmupNext, 15000);
            });
        }

        function scheduleIdle(fn, delay) {
            var start = function () {
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(fn, { timeout: 10000 });
                } else {
                    setTimeout(fn, delay || 1500);
                }
            };
            if (delay) setTimeout(start, delay); else start();
        }

        // 等 window.load（頁面所有資源載入完成）後再延遲 3 秒開始預熱，
        // 避免跟首屏的 leaflet / tabulator / chart.js 等資源競爭頻寬
        function onLoad() {
            scheduleIdle(warmupNext, 3000);
        }
        if (document.readyState === 'complete') {
            onLoad();
        } else {
            window.addEventListener('load', onLoad, { once: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoWarmup, { once: true });
    } else {
        autoWarmup();
    }
})();
