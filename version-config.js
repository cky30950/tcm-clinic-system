/* ============================================================
 * 系統版本設定檔（可自行修改）
 * ------------------------------------------------------------
 * 想切換版本時，只要修改下面的 APP_VERSION 即可：
 *
 *   'simple'    簡單版：只能使用 1 間診所，且不提供
 *                       視訊診症、會員功能（會員儲值／折扣）、
 *                       病歷附件；相關按鈕與區塊會實際隱藏。
 *
 *   'standard'  普通版：只能使用 1 間診所
 *                       系統管理的「新增診所」「刪除目前診所」
 *                       按鈕會反白，並標示為進階版專屬功能
 *
 *   'advanced'  進階版：最多可建立 5 間診所
 *
 * 各功能開關定義在版本設定的 features 內，可用
 * window.isVersionFeatureEnabled('xxx') 判斷，例如：
 *   videoConsultation   視訊診症
 *   membership          會員功能（會員儲值、會員折扣）
 *   medicalAttachments  病歷附件
 * ============================================================ */

window.APP_VERSION = 'simple';   // ← 在這裡切換版本：'simple'（簡單版）、'standard'（普通版）或 'advanced'（進階版）

window.APP_VERSION_OPTIONS = {
    // 簡單版
    simple: {
        label: '簡單版',
        maxClinics: 1,           // 簡單版僅可使用 1 間診所
        features: {
            videoConsultation: false,  // 不提供視訊診症
            membership: false,         // 不提供會員功能（會員儲值、會員折扣）
            medicalAttachments: false  // 不提供病歷附件
        }
    },

    // 普通版
    standard: {
        label: '普通版',
        maxClinics: 1            // 普通版診所數量上限
        // features: { }         // 範例：videoConsultation: false
    },

    // 進階版
    advanced: {
        label: '進階版',
        maxClinics: 5            // 進階版診所數量上限
        // features: { }         // 範例：videoConsultation: true
    }
};

/* ===== 以下為系統讀取設定用的輔助函式，一般不需修改 ===== */

// 取得目前版本（輸入錯誤值時自動視為普通版）
window.getAppVersion = function () {
    var v = window.APP_VERSION;
    return (v === 'simple' || v === 'advanced' || v === 'standard') ? v : 'standard';
};

// 取得目前版本的完整設定
window.getAppVersionConfig = function () {
    return window.APP_VERSION_OPTIONS[window.getAppVersion()] || window.APP_VERSION_OPTIONS.standard;
};

// 是否為進階版
window.isAdvancedVersion = function () {
    return window.getAppVersion() === 'advanced';
};

// 是否為簡單版
window.isSimpleVersion = function () {
    return window.getAppVersion() === 'simple';
};

// 取得目前版本的診所數量上限
window.getMaxClinics = function () {
    var cfg = window.getAppVersionConfig();
    var n = parseInt(cfg && cfg.maxClinics, 10);
    return (isNaN(n) || n < 1) ? 1 : n;
};

// 判斷某個版本功能開關是否開啟
// （features 裡有明確標示 false 才算關閉；未標示時預設為開啟，
//   以免新增版本設定時漏填開關而誤關功能）
window.isVersionFeatureEnabled = function (featureName) {
    var cfg = window.getAppVersionConfig();
    if (!cfg || !cfg.features) return true;
    return cfg.features[featureName] !== false;
};
