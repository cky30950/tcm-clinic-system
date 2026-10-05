/* ============================================================
 * vendor-enhance.js — 第三方 UI 插件自動增強層（無 build 架構）
 * ------------------------------------------------------------
 * flatpickr 4.6.13：[data-fp="date|datetime|time|month"] 自動初始化
 * Tom Select 2.6.x：[data-tom-select] 長下拉自動變可搜尋
 *
 * 設計原則（配合本專案慣例）：
 *  - 以 data-* 宣告式標記取用，不寫 inline on*
 *  - MutationObserver 在元素插入 DOM 當下立即增強（同按鈕標準化模式）
 *  - 隱藏的原始 <input>/<select> 保留原值格式（YYYY-MM-DD / HH:mm /
 *    YYYY-MM-DDTHH:mm / YYYY-MM），所有現有 .value 讀寫與 change 監聽
 *    不需改動；並以 value setter 鉤子接住「JS 程式化設值」
 *  - 插件缺失（如離線且無快取）時 fail-open：保留瀏覽器原生控制項
 * ============================================================ */
(function () {
    'use strict';

    /* ---------- 共用：外掛隔離樣式（只作用於 .ts-/.flatpickr/.tabulator） ---------- */
    function injectVendorStyle() {
        if (document.getElementById('tcm-vendor-style')) return;
        const css = `
/* Tom Select：配合 Tailwind/daisyUI 介面 */
.ts-wrapper.single .ts-control{
  min-height:34px;border-radius:0.5rem;border-color:#d1d5db;background:#fff;
  font-size:0.875rem;box-shadow:none;display:flex;align-items:center;
}
.ts-wrapper.single.focus .ts-control,
.ts-wrapper.single.input-active .ts-control{box-shadow:0 0 0 2px rgba(16,185,129,.25);border-color:transparent;}
.ts-wrapper.multi .ts-control{border-radius:0.5rem;border-color:#d1d5db;font-size:0.875rem;}
.ts-wrapper{width:100%;}
.ts-dropdown{z-index:3000;border-radius:0.5rem;border-color:#d1d5db;font-size:0.875rem;box-shadow:0 10px 25px -8px rgba(0,0,0,.25);}
.ts-dropdown .option{padding:6px 12px;}
.ts-dropdown .active{background:#ecfdf5;color:#065f46;}
.ts-dropdown .selected{background:#d1fae5;color:#064e3b;}
.ts-wrapper .ts-control > input{font-size:0.875rem;color:#1f2937;}
.ts-wrapper .ts-control > .item{color:#1f2937;}
.form-select.ts-hidden + .ts-wrapper .ts-control{min-height:38px;}

/* flatpickr：彈層須高於全站 modal（最高 z-[2100]） */
.flatpickr-calendar.open{z-index:3000 !important;}
.flatpickr-months .flatpickr-month,
.flatpickr-current-month .flatpickr-monthDropdown-months,
.flatpickr-weekdays,.flatpickr-days{font-family:inherit;}

/* Tabulator：錢包交易試算表試點（其餘頁面不套用排版） */
#walletTxGrid{tabulator:unset;}
#walletTxGrid .tabulator{font-size:0.8125rem;border:1px solid #e5e7eb;border-radius:0.5rem;background:#fff;}
#walletTxGrid .tabulator-header{background:#f9fafb;color:#4b5563;font-weight:600;border-bottom:1px solid #e5e7eb;}
#walletTxGrid .tabulator-header .tabulator-col{border-right:1px solid #f3f4f6;height:38px;}
#walletTxGrid .tabulator-row{min-height:34px;border-bottom:1px solid #f3f4f6;}
#walletTxGrid .tabulator-row.tabulator-selected{background:#f0fdfa;}
#walletTxGrid .tabulator-row:hover{background:#f9fafb !important;}
#walletTxGrid .tabulator-header-filter input{
  border:1px solid #d1d5db;border-radius:0.375rem;padding:3px 8px;font-size:0.75rem;width:100%;
}
#walletTxGrid .tabulator-paginator{font-size:0.75rem;color:#6b7280;padding:6px;}

/* Notiflix：3.2.8 訊息採純文字插入，換行靠 \n + pre-line 呈現（見 system.js showToast） */
.notiflix-notify .nx-message{white-space:pre-line;word-break:break-word;}
`;
        const style = document.createElement('style');
        style.id = 'tcm-vendor-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- flatpickr ---------- */

    // flatpickr 無 zh_tw 語系，此處內建繁體中文（港式）
    const FP_ZH_HANT = {
        weekdays: {
            shorthand: ['日', '一', '二', '三', '四', '五', '六'],
            longhand: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
        },
        months: {
            shorthand: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
            longhand: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
        },
        daysInMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
        firstDayOfWeek: 0,
        ordinal: function () { return ''; },
        rangeSeparator: ' 至 ',
        weekAbbreviation: '週',
        scrollTitle: '滾動切換',
        toggleTitle: '點擊切換',
        amPM: ['上午', '下午'],
        yearAgo: '年前'
    };

    // 抓住 HTMLInputElement 原生 value descriptor，供程式化設值鉤子使用
    const nativeValueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    function fpBaseConfig(el) {
        return {
            locale: FP_ZH_HANT,
            allowInput: true,
            // 原生 min/max 屬性（如掛號日不得早於今日）映射給 flatpickr
            minDate: el.min || undefined,
            maxDate: el.max || undefined
        };
    }

    // 程式碼對 el.value = x 指派後，flatpickr 內部狀態須同步，
    // 否則日曆開啟時仍顯示舊值（編輯病歷／setQuickDate／form.reset 場景）
    function installValueSyncHook(el) {
        if (el.__fpValueHooked) return;
        Object.defineProperty(el, 'value', {
            configurable: true,
            get: function () { return nativeValueDesc.get.call(el); },
            set: function (v) {
                nativeValueDesc.set.call(el, v);
                const fp = el._flatpickr;
                if (fp && !el.__fpSyncing) {
                    el.__fpSyncing = true;
                    try {
                        fp.setDate(v, false);
                    } catch (_e) { /* 無法解析時保持輸入值，不阻礙表單 */ }
                    el.__fpSyncing = false;
                }
            }
        });
        el.__fpValueHooked = true;
    }

    function enhanceFlatpickr(el) {
        if (el.__fpInit || !window.flatpickr) return;
        const kind = el.getAttribute('data-fp') || 'date';
        // monthSelect 插件為獨立檔案，缺失時月份欄位退回原生 month 控制項
        if (kind === 'month' && typeof window.monthSelectPlugin !== 'function') return;
        const cfg = fpBaseConfig(el);
        try {
            if (kind === 'date') {
                cfg.dateFormat = 'Y-m-d';
            } else if (kind === 'datetime') {
                cfg.enableTime = true;
                cfg.time_24hr = true;
                cfg.dateFormat = 'Y-m-d\\TH:i'; // 與原生 datetime-local 值格式一致
                cfg.minuteIncrement = 1;
            } else if (kind === 'time') {
                cfg.enableTime = true;
                cfg.noCalendar = true;
                cfg.time_24hr = true;
                cfg.dateFormat = 'H:i';
                cfg.minuteIncrement = 1;
                cfg.allowInput = false;
            } else if (kind === 'month') {
                cfg.dateFormat = 'Y-m';
                cfg.plugins = [window.monthSelectPlugin({
                    shorthand: false,
                    dateFormat: 'Y-m',
                    altFormat: 'Y-m'
                })];
            } else {
                return;
            }
            // 統一轉成 text 輸入，避免瀏覽器原生日曆與 flatpickr 雙重彈出
            el.setAttribute('data-fp-original-type', el.type || 'text');
            el.type = 'text';
            const fp = window.flatpickr(el, cfg);
            installValueSyncHook(el);
            // 若欄位帶既有 value（HTML 屬性或先前指派），初始化時同步一次
            if (el.value) {
                try { fp.setDate(el.value, false); } catch (_e) {}
            }
            el.__fpInit = true;
        } catch (_e) {
            // 單一欄位初始化失敗不影響其他欄位
        }
    }

    /* ---------- Tom Select ---------- */

    function enhanceTomSelect(el) {
        if (el.__tsInit || !window.TomSelect) return;
        try {
            // eslint-disable-next-line no-new
            new window.TomSelect(el, {
                selectOnTab: true,
                maxOptions: null,
                dropdownDirection: 'auto',
                controlInputAriaLabel: el.getAttribute('aria-label') || '可搜尋下拉選單',
                plugins: { clear_button: { title: '清除' } },
                render: {
                    // 搜尋詞為使用者輸入，插入 HTML 前必須跳脫（XSS 防護慣例）
                    no_results: function (data) {
                        const q = String((data && data.input) || '').replace(/[&<>"']/g, function (c) {
                            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
                        });
                        return '<div class="no-results px-3 py-2 text-gray-400">找不到「' + q + '」</div>';
                    }
                }
            });
            el.__tsInit = true;
        } catch (_e) {
            /* 失敗則保留原生 select */
        }
    }

    /* ---------- 觀察器：元素加入時立即增強 ---------- */

    const pendingNodes = [];
    let scanScheduled = false;
    function scan(root) {
        if (!root || root.nodeType !== 1 && root.nodeType !== 9) return;
        const scope = root.querySelectorAll ? root : document;
        scope.querySelectorAll('[data-fp]:not([data-fp-init])').forEach(function (el) {
            el.setAttribute('data-fp-init', '1');
            enhanceFlatpickr(el);
        });
        scope.querySelectorAll('[data-tom-select]:not([data-ts-init])').forEach(function (el) {
            el.setAttribute('data-ts-init', '1');
            enhanceTomSelect(el);
        });
    }
    function scheduleScan(root) {
        pendingNodes.push(root);
        if (scanScheduled) return;
        scanScheduled = true;
        // 微工作批次：同週期大量插入（分頁表格重建）只掃一次
        Promise.resolve().then(function () {
            scanScheduled = false;
            const nodes = pendingNodes.splice(0);
            nodes.forEach(scan);
        });
    }

    /* ---------- 對外工具函式 ---------- */

    function resolveEl(elOrId) {
        return typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    }

    // 動態重建 <option> 後呼叫（Tom Select 預設不監聽底層 select 的選項變動）
    window.syncTomSelect = function (elOrId) {
        const el = resolveEl(elOrId);
        const ts = el && el.tomselect;
        if (ts) {
            try { ts.sync(); } catch (_e) {}
        }
    };

    // 程式化設定選值（編輯排班等場景）：同時更新底層 select 與 Tom Select 顯示
    window.setTomSelectValue = function (elOrId, value, silent) {
        const el = resolveEl(elOrId);
        if (!el) return;
        el.value = value == null ? '' : String(value);
        const ts = el.tomselect;
        if (ts) {
            try { ts.setValue(el.value, silent !== false); } catch (_e) {}
        }
    };

    // 動態修改 min/max 日期限制（掛號日期 picker 每次進入都重設今日下限）
    window.setFlatpickrBounds = function (elOrId, min, max) {
        const el = resolveEl(elOrId);
        const fp = el && el._flatpickr;
        if (!fp) return;
        try {
            fp.set('minDate', min || undefined);
            fp.set('maxDate', max || undefined);
        } catch (_e) {}
    };

    /* ---------- 啟動 ---------- */

    function boot() {
        injectVendorStyle();
        scan(document);
        const observer = new MutationObserver(function (mutations) {
            for (const m of mutations) {
                m.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) scheduleScan(node);
                });
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
