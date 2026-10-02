/* ============================================================
 * bus.js — ESM 模組間／新舊碼間的事件匯流排（window 事件薄封裝）
 * ------------------------------------------------------------
 * 跨層廣播一律走 CustomEvent，沿用既有 firebaseConnectionChanged
 * 模式，避免模組直接互相持有引用。
 * ============================================================ */

export function on(type, handler, options) {
    window.addEventListener(type, handler, options);
    return () => window.removeEventListener(type, handler);
}

export function off(type, handler) {
    window.removeEventListener(type, handler);
}

export function emit(type, detail) {
    window.dispatchEvent(new CustomEvent(type, { detail: detail }));
}
