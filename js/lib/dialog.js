/* ============================================================
 * dialog.js — 輕量對話框輔助庫（取代 SweetAlert2）
 * ------------------------------------------------------------
 * 純 DOM + Tailwind 類別，無第三方依賴。Notiflix 只提供通知／
 * 簡單確認（Confirm.show），不支援 select／date／number 輸入及
 * 內含互動元件的 HTML 彈窗；該等場景使用本輔助庫：
 *
 *   const r = await TCMDialog.confirm({ html, danger, okText, cancelText });
 *   const r = await TCMDialog.alert({ title, html, okText });
 *   const r = await TCMDialog.prompt({ input:'text|number|date|select', ... });
 *   const r = await TCMDialog.open({ title, html, onOpen, getValue, ... });
 *
 * 安全慣例：html 參數與舊 Swal 用法一樣視為「可信 HTML」——
 * 含用戶資料的呼叫端必須先 escapeHtml；prompt 的 select 選項
 * 改用 textContent 賦值，呼叫端傳原始文字即可，不需也不應先 escape。
 * z-index 4000：高於全站 modal（最高 z-[2100]）、低於 Notiflix
 * 通知（4001），使通知可疊在對話框之上。
 * ============================================================ */
(function () {
    'use strict';

    var Z_INDEX = 4000;
    var openCount = 0;

    /* 臨界顏色自帶樣式，不依賴 Tailwind 預編譯覆蓋——
       曾發生 bg-emerald-600 未被編進 css/tailwind.css，
       導致確認鈕白字白底、整顆按鈕隱形（桌面及手機同發）。 */
    function injectDialogStyle() {
        if (document.getElementById('tcm-dialog-style')) return;
        var css =
            '.tcm-btn{display:inline-flex;align-items:center;justify-content:center;' +
            'border-radius:0.375rem;padding:0.5rem 1rem;font-size:1rem;line-height:1.25;' +
            'border:1px solid transparent;cursor:pointer;white-space:nowrap;}' +
            '.tcm-btn-ok{background:#059669;color:#fff;}' +
            '.tcm-btn-ok:hover{background:#047857;}' +
            '.tcm-btn-danger{background:#dc2626;color:#fff;}' +
            '.tcm-btn-danger:hover{background:#b91c1c;}' +
            '.tcm-btn-cancel{background:#fff;color:#374151;border-color:#d1d5db;}' +
            '.tcm-btn-cancel:hover{background:#f3f4f6;}' +
            '.tcm-prompt-input:focus{outline:none;border-color:#10b981;' +
            'box-shadow:0 0 0 2px rgba(16,185,129,.3);}';
        var style = document.createElement('style');
        style.id = 'tcm-dialog-style';
        style.textContent = css;
        document.head.appendChild(style);
    }
    injectDialogStyle();

    function lockBody() {
        openCount++;
        if (openCount === 1) document.body.style.overflow = 'hidden';
    }
    function unlockBody() {
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) document.body.style.overflow = '';
    }

    function isEn() {
        try {
            return String(localStorage.getItem('lang') || 'zh').toLowerCase().indexOf('en') === 0;
        } catch (_e) {
            return false;
        }
    }

    function defaultOk() { return isEn() ? 'OK' : '確定'; }
    function defaultCancel() { return isEn() ? 'Cancel' : '取消'; }

    /* Notiflix Confirm/Report 使用固定外層 ID（NotiflixConfirmWrap /
       NotiflixReportWrap），點擊後先執行按鈕回調、等 300ms 淡出動畫
       結束才移除舊 DOM；期間若再呼叫一次 Confirm/Report（例如刪除
       診所的雙重確認），會因 ID 已存在而被整個靜默丟棄——新彈窗不
       顯示、Promise 永久 pending。回調裡先主動移除外層即可避開。 */
    function dismissNotiflixWrap(id) {
        try {
            var old = document.getElementById(id);
            if (old && old.parentNode) old.parentNode.removeChild(old);
        } catch (_e) {}
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    /* 構造一個對話框。resolve 統一在關閉時觸發，保證只觸發一次 */
    function create(opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var settled = false;
            var finish = function (confirmed) {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKeydown, true);
                try { unlockBody(); } catch (_e) {}
                if (typeof opts.onClose === 'function') {
                    try { opts.onClose(); } catch (_e) {}
                }
                // 先取下輸入值再移除 DOM
                var value;
                if (confirmed && typeof opts.getValue === 'function') {
                    try { value = opts.getValue(body); } catch (_e) {}
                }
                try { overlay.remove(); } catch (_e) {}
                resolve({ isConfirmed: confirmed, value: value });
            };

            var overlay = el('div');
            overlay.className = 'fixed inset-0 flex items-center justify-center p-4';
            overlay.style.cssText = 'z-index:' + Z_INDEX + ';background:rgba(0,0,0,0.5);';

            var panel = el('div', 'w-full ' + (opts.widthClass || 'max-w-md') +
                ' bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden');
            panel.style.maxHeight = '90vh';
            overlay.appendChild(panel);

            // 標題列（含 × 關閉）
            if (opts.title != null && opts.title !== '') {
                var header = el('div', 'flex items-start justify-between gap-3 px-5 pt-4 pb-2');
                var titleNode = el('h3', 'text-lg font-medium text-gray-900 break-words');
                titleNode.textContent = opts.title;
                header.appendChild(titleNode);
                var xBtn = el('button',
                    'shrink-0 -mr-1 -mt-1 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-2xl leading-none',
                    '×');
                xBtn.type = 'button';
                xBtn.style.touchAction = 'manipulation';
                xBtn.addEventListener('click', function () { finish(false); });
                header.appendChild(xBtn);
                panel.appendChild(header);
            }

            var body = el('div', 'px-5 py-3 overflow-y-auto text-sm text-gray-700 tcm-dialog-body');
            // html 視為呼叫端已處理跳脫的可信內容（同 Swal 舊行為）
            body.innerHTML = opts.html || '';
            panel.appendChild(body);

            // 動態輸入項
            var inputEl = null;
            if (opts.input) {
                var wrap = el('div', 'mt-3');
                if (opts.input === 'select') {
                    inputEl = document.createElement('select');
                    inputEl.className = 'tcm-prompt-input w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';
                    var placeholderOpt = el('option', '', opts.placeholder || (isEn() ? 'Please select' : '請選擇'));
                    placeholderOpt.value = '';
                    inputEl.appendChild(placeholderOpt);
                    (opts.options || []).forEach(function (o) {
                        var opt = document.createElement('option');
                        opt.value = String(o.value);
                        // textContent 賦值，選項文字無 XSS 風險
                        opt.textContent = o.label != null ? String(o.label) : String(o.value);
                        inputEl.appendChild(opt);
                    });
                    if (opts.value != null) inputEl.value = String(opts.value);
                } else {
                    inputEl = document.createElement('input');
                    inputEl.type = opts.input === 'number' ? 'number' :
                        (opts.input === 'date' ? 'date' : 'text');
                    inputEl.className = 'tcm-prompt-input w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';
                    if (opts.value != null) inputEl.value = opts.value;
                    if (opts.placeholder) inputEl.placeholder = opts.placeholder;
                    ['min', 'max', 'step'].forEach(function (k) {
                        if (opts[k] != null) inputEl.setAttribute(k, opts[k]);
                    });
                }
                inputEl.style.touchAction = 'manipulation';
                wrap.appendChild(inputEl);
                body.appendChild(wrap);
            }

            // 按鈕列
            var hasOk = opts.okText !== null;
            var hasCancel = opts.cancelText !== null;
            if (hasOk || hasCancel) {
                var footer = el('div', 'flex justify-end gap-2 px-5 py-4 bg-gray-50');
                if (hasCancel) {
                    var cancelBtn = el('button',
                        'tcm-btn tcm-btn-cancel px-4 py-2 rounded-md text-base font-normal',
                        opts.cancelText || defaultCancel());
                    cancelBtn.type = 'button';
                    cancelBtn.style.touchAction = 'manipulation';
                    cancelBtn.addEventListener('click', function () { finish(false); });
                    footer.appendChild(cancelBtn);
                }
                if (hasOk) {
                    var okCls = opts.danger ? 'tcm-btn-danger' : 'tcm-btn-ok';
                    var okBtn = el('button', 'tcm-btn ' + okCls +
                        ' px-4 py-2 rounded-md text-base font-normal',
                        opts.okText || defaultOk());
                    okBtn.type = 'button';
                    okBtn.style.touchAction = 'manipulation';
                    okBtn.addEventListener('click', function () { finish(true); });
                    footer.appendChild(okBtn);
                }
                panel.appendChild(footer);
            }

            // 遮罩點擊＝取消；點面板本身不關閉
            overlay.addEventListener('mousedown', function (ev) {
                if (ev.target === overlay) finish(false);
            });

            function onKeydown(ev) {
                if (ev.key === 'Escape') {
                    ev.stopPropagation();
                    finish(false);
                } else if (ev.key === 'Enter' && inputEl && opts.input !== 'select') {
                    // 日期／number 原生控制項的 Enter 一併視為確認
                    ev.preventDefault();
                    finish(true);
                }
            }
            document.addEventListener('keydown', onKeydown, true);

            try { lockBody(); } catch (_e) {}
            document.body.appendChild(overlay);

            if (inputEl) {
                try { inputEl.focus(); } catch (_e) {}
            }

            if (typeof opts.onOpen === 'function') {
                try { opts.onOpen(body, overlay); } catch (e) { console.error('TCMDialog onOpen 錯誤:', e); }
            }
        });
    }

    var TCMDialog = {
        /* 簡單確認 → { isConfirmed, value:undefined } */
        confirm: function (opts) {
            opts = opts || {};
            if (opts.okText === undefined) opts.okText = defaultOk();
            if (opts.cancelText === undefined) opts.cancelText = defaultCancel();
            return create(opts);
        },
        /* 單按鈕提示 → resolve 在關閉時 */
        alert: function (opts) {
            opts = opts || {};
            opts.cancelText = null;
            if (opts.okText === undefined) opts.okText = defaultOk();
            return create(opts);
        },
        /* 輸入對話框 → { isConfirmed, value }（value 為字串；select 為選中 value） */
        prompt: function (opts) {
            opts = opts || {};
            if (opts.okText === undefined) opts.okText = isEn() ? 'Confirm' : '確定';
            if (opts.cancelText === undefined) opts.cancelText = defaultCancel();
            if (!opts.getValue) {
                opts.getValue = function (body) {
                    var ctrl = body.querySelector('.tcm-prompt-input');
                    return ctrl ? ctrl.value : '';
                };
            }
            return create(opts);
        },
        /* 全自訂 HTML 彈窗（內含互動元件、地圖等） */
        open: function (opts) {
            opts = opts || {};
            return create(opts);
        },

        /* ── Notiflix 簡單確認框（兩顆按鈕）──────────────────────
         * html 為可信 HTML：含用戶資料時呼叫端須先 escapeHtml。
         * 回傳 Promise<boolean>。Notiflix 缺失時退回 window.confirm。 */
        nxConfirm: function (opts) {
            opts = opts || {};
            var nx = window.Notiflix;
            if (nx && nx.Confirm && typeof nx.Confirm.show === 'function') {
                return new Promise(function (resolve) {
                    var options = {
                        plainText: false,
                        width: '340px',
                        borderRadius: '12px',
                        fontFamily: 'inherit',
                        messageFontSize: '14px',
                        messageMaxLength: 10000,
                        buttonsFontSize: '15px',
                        buttonsMaxLength: 100,
                        backOverlayClickToClose: false,
                        okButtonBackground: opts.danger ? '#dc2626' : '#32c682',
                        cancelButtonBackground: '#9ca3af',
                        zindex: 4003
                    };
                    nx.Confirm.show(
                        opts.title || (isEn() ? 'Please confirm' : '請確認'),
                        opts.html || '',
                        opts.okText || defaultOk(),
                        opts.cancelText || defaultCancel(),
                        function () {
                            dismissNotiflixWrap('NotiflixConfirmWrap');
                            resolve(true);
                        },
                        function () {
                            dismissNotiflixWrap('NotiflixConfirmWrap');
                            resolve(false);
                        },
                        options
                    );
                });
            }
            return Promise.resolve(window.confirm(
                (opts.title ? opts.title + '\n' : '') +
                String(opts.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
            ));
        },

        /* ── Notiflix 資訊提示框（單按鈕）─────────────────────────
         * kind: 'info' | 'success' | 'warning' | 'failure'。
         * 回傳 Promise（關閉後 resolve）。缺失時退回 window.alert。 */
        nxAlert: function (opts) {
            opts = opts || {};
            var nx = window.Notiflix;
            var kindMap = { info: 'info', success: 'success', warning: 'warning', error: 'failure', failure: 'failure' };
            var kind = kindMap[opts.kind] || 'info';
            if (nx && nx.Report && typeof nx.Report[kind] === 'function') {
                return new Promise(function (resolve) {
                    nx.Report[kind](
                        opts.title || (isEn() ? 'Information' : '提示'),
                        opts.html || '',
                        opts.okText || defaultOk(),
                        function () {
                            dismissNotiflixWrap('NotiflixReportWrap');
                            resolve();
                        },
                        {
                            plainText: false,
                            width: '360px',
                            borderRadius: '12px',
                            fontFamily: 'inherit',
                            titleMaxLength: 200,
                            messageFontSize: '14px',
                            messageMaxLength: 10000,
                            buttonFontSize: '15px',
                            buttonMaxLength: 100,
                            backOverlayClickToClose: false,
                            zindex: 4003
                        }
                    );
                });
            }
            window.alert(
                (opts.title ? opts.title + '\n' : '') +
                String(opts.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
            );
            return Promise.resolve();
        }
    };

    window.TCMDialog = TCMDialog;
})();
