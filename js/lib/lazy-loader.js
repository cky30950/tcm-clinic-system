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

    define('chartjs', [
        'https://cdn.jsdelivr.net/npm/chart.js'
    ], function () { return !!window.Chart; });

    define('tabulator', [
        'js/vendor/tabulator/tabulator.min.js?v=20261005a'
    ], function () { return !!window.Tabulator; });

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

    /* ── 自動預熱：已停用 — 登入後不自動下載任何大庫，
       避免閒置時默默消耗記憶體與頻寬。需要時以功能點擊觸發即可。
       若未來想恢復，取消以下代碼註解並改 requestIdleCallback。 */
    // function autoWarmup() { ... }
    // if (document.readyState === 'loading') { ... }

    /* 保留 TCMLazy.load() 手動調用入口 */
    window._disableAutoWarmup = true;
})();
