// i18n.js - basic internationalisation support for the clinic system

/**
 * Translation dictionaries keyed by original Chinese text.  Each property
 * corresponds to a supported language (zh for Chinese, en for English).
 * The keys in each dictionary should match the original Chinese content
 * found in the HTML.  When switching languages the code will replace
 * elements' textContent and placeholders based on the mapping below.  If a
 * translation is not found for a particular string the original text will
 * be left unchanged.
 */
window.translations = {
    zh: {
        // Chinese translations simply map original text to itself.  This
        // dictionary only needs entries for strings that have English
        // translations below – everything else will remain unchanged.
        "+ 新增收費項目": "+ 新增收費項目",
        "+ 新增用戶": "+ 新增用戶",
        "+ 新增病人": "+ 新增病人",
        "+ 新增穴位組合": "+ 新增穴位組合",
        "+ 新增藥方組合": "+ 新增藥方組合",
        "管理分類": "管理分類",
        "一般用戶": "一般用戶",
        "上月": "上月",
        "上週": "上週",
        "不使用問診資料": "不使用問診資料",
        "中藥庫": "中藥庫",
        "中藥服用方法": "中藥服用方法",
        "中藥材": "中藥材",
        "中藥材名稱 *": "中藥材名稱 *",
        "中醫診斷 *": "中醫診斷 *",
        "中醫註冊編號 *": "中醫註冊編號 *",
        "主治": "主治",
        "主要服務": "主要服務",
        "主訴 *": "主訴 *",
        "主訴症狀": "主訴症狀",
        "人": "人",
        "今天": "今天",
        "今年": "今年",
        "佔比": "佔比",
        "使用注意": "使用注意",
        "保存": "保存",
        "保存病歷": "保存病歷",
        "個人設置": "個人設置",
        "停用的帳號將無法登入系統": "停用的帳號將無法登入系統",
        "備註": "備註",
        "儲存": "儲存",
        "內科疾病": "內科疾病",
        "全部": "全部",
        "全部分類": "全部分類",
        "全部用戶": "全部用戶",
        "全部科別": "全部科別",
        "全部醫師": "全部醫師",
        "全部針法": "全部針法",
        "全部類別": "全部類別",
        "其他": "其他",
        "出生日期 *": "出生日期 *",
        "出處": "出處",
        "別名": "別名",
        "到診時間": "到診時間",
        "刷新": "刷新",
        "功效": "功效",
        "匯入備份": "匯入備份",
        "匯出": "匯出",
        "匯出備份": "匯出備份",
        "去年": "去年",
        "取消": "取消",
        "取消診症": "取消診症",
        "名醫診所系統": "名醫診所系統",
        "啟用此收費項目": "啟用此收費項目",
        "啟用此用戶帳號": "啟用此用戶帳號",
        "四肢部": "四肢部",
        "報表類型": "報表類型",
        "天": "天",
        "套票可用次數 *": "套票可用次數 *",
        "套票項目": "套票項目",
        "女": "女",
        "姓名": "姓名",
        "姓名 *": "姓名 *",
        "婦科疾病": "婦科疾病",
        "婦科調理": "婦科調理",
        "完成診症次數": "完成診症次數",
        "密碼": "密碼",
        "實際到診的時間（用於證明書）": "實際到診的時間（用於證明書）",
        "對應 Firebase Authentication 帳號的 UID": "對應 Firebase Authentication 帳號的 UID",
        "尚未載入或無套票": "尚未載入或無套票",
        "已停用": "已停用",
        "常用劑量": "常用劑量",
        "常用穴位組合": "常用穴位組合",
        "常用藥方組合": "常用藥方組合",
        "平均單價": "平均單價",
        "平均消費": "平均消費",
        "平補平瀉": "平補平瀉",
        "年報表": "年報表",
        "年齡": "年齡",
        "年齡：": "年齡：",
        "序號": "序號",
        "建議休息期間": "建議休息期間",
        "建議病人下次回診的時間": "建議病人下次回診的時間",
        "快速選擇": "快速選擇",
        "性別": "性別",
        "性別 *": "性別 *",
        "性別：": "性別：",
        "性味": "性味",
        "您可以匯出診所資料備份（包含所有功能資料，不含模板庫與中藥庫），或匯入之前的備份檔案。實時掛號資料不包含在備份中。": "您可以匯出診所資料備份（包含所有功能資料，不含模板庫與中藥庫），或匯入之前的備份檔案。實時掛號資料不包含在備份中。",
        "感冒類": "感冒類",
        "折扣項目": "折扣項目",
        "折扣項目：輸入0.9表示9折，輸入9會自動轉為9折，或輸入負數表示固定金額折扣": "折扣項目：輸入0.9表示9折，輸入9會自動轉為9折，或輸入負數表示固定金額折扣",
        "掛號列表": "掛號列表",
        "掛號時間": "掛號時間",
        "掛號時間：": "掛號時間：",
        "掛號診症系統": "掛號診症系統",
        "掛號醫師": "掛號醫師",
        "掛號醫師 *": "掛號醫師 *",
        "搜索病人掛號": "搜索病人掛號",
        "操作": "操作",
        "收入佔比": "收入佔比",
        "收入摘要": "收入摘要",
        "收入金額": "收入金額",
        "收費金額 *": "收費金額 *",
        "收費項目": "收費項目",
        "收費項目管理": "收費項目管理",
        "新增": "新增",
        "新增、查看、管理病人資料": "新增、查看、管理病人資料",
        "新增中藥材": "新增中藥材",
        "新增分類": "新增分類",
        "新增收費項目": "新增收費項目",
        "新增方劑": "新增方劑",
        "新增用戶": "新增用戶",
        "新增病人資料": "新增病人資料",
        "方劑": "方劑",
        "方劑名稱 *": "方劑名稱 *",
        "日報表": "日報表",
        "日期": "日期",
        "昨天": "昨天",
        "更新報表": "更新報表",
        "最後登入": "最後登入",
        "月報表": "月報表",
        "有效天數 *": "有效天數 *",
        "有診症的醫師": "有診症的醫師",
        "服務分析": "服務分析",
        "服務類型": "服務類型",
        "服藥天數": "服藥天數",
        "本月": "本月",
        "本週": "本週",
        "模板庫": "模板庫",
        "次/日": "次/日",
        "次數": "次數",
        "歡迎使用名醫診所系統": "歡迎使用名醫診所系統",
        "歸經": "歸經",
        "每日明細": "每日明細",
        "每日次數": "每日次數",
        "每次診症平均": "每次診症平均",
        "治療費": "治療費",
        "注意事項": "注意事項",
        "活躍醫師": "活躍醫師",
        "消化系統": "消化系統",
        "清熱類": "清熱類",
        "清除": "清除",
        "瀉法": "瀉法",
        "狀態": "狀態",
        "現有分類": "現有分類",
        "現病史": "現病史",
        "用戶管理": "用戶管理",
        "用於病假證明書的建議休息期間": "用於病假證明書的建議休息期間",
        "用法": "用法",
        "男": "男",
        "病人姓名": "病人姓名",
        "病人掛號": "病人掛號",
        "病人詳細資料": "病人詳細資料",
        "病人資料管理": "病人資料管理",
        "病人資訊": "病人資訊",
        "病人：": "病人：",
        "病史及備註": "病史及備註",
        "病史及備註：": "病史及備註：",
        "病歷記錄": "病歷記錄",
        "療程": "療程",
        "登入系統": "登入系統",
        "登出": "登出",
        "登出系統": "登出系統",
        "確認掛號": "確認掛號",
        "穴位庫": "穴位庫",
        "管理診所用戶權限": "管理診所用戶權限",
        "簡潔的掛號流程管理": "簡潔的掛號流程管理",
        "系統功能概覽": "系統功能概覽",
        "系統管理": "系統管理",
        "組成 *": "組成 *",
        "結束日期": "結束日期",
        "結束：": "結束：",
        "統計期間收入": "統計期間收入",
        "統計資料、備份匯出": "統計資料、備份匯出",
        "編號": "編號",
        "編輯組合": "編輯組合",
        "總收入": "總收入",
        "總計：": "總計：",
        "總費用：": "總費用：",
        "總金額": "總金額",
        "聯絡地址": "聯絡地址",
        "職位": "職位",
        "職位 *": "職位 *",
        "背腰部": "背腰部",
        "胸腹部": "胸腹部",
        "脈象": "脈象",
        "自訂期間": "自訂期間",
        "自購買日起算": "自購買日起算",
        "舌象": "舌象",
        "若病人已填寫問診，可在此選擇預填資訊": "若病人已填寫問診，可在此選擇預填資訊",
        "藥費": "藥費",
        "處方內容": "處方內容",
        "補法": "補法",
        "補益類": "補益類",
        "複診時間": "複診時間",
        "計費單位": "計費單位",
        "記錄症狀、診斷、開立處方": "記錄症狀、診斷、開立處方",
        "診所中文名稱 *": "診所中文名稱 *",
        "診所中文名稱：": "診所中文名稱：",
        "診所功能": "診所功能",
        "診所地址": "診所地址",
        "診所收入分析與財務統計": "診所收入分析與財務統計",
        "診所營業時間": "診所營業時間",
        "診所用戶管理": "診所用戶管理",
        "診所管理": "診所管理",
        "診所英文名稱": "診所英文名稱",
        "診所英文名稱：": "診所英文名稱：",
        "診所設定": "診所設定",
        "診所資料修改": "診所資料修改",
        "診所電話": "診所電話",
        "診斷模板": "診斷模板",
        "診症人次": "診症人次",
        "診症系統": "診症系統",
        "診症記錄": "診症記錄",
        "診療費": "診療費",
        "註冊編號": "註冊編號",
        "詳細財務報表": "詳細財務報表",
        "請使用上方搜索功能添加中藥材或方劑": "請使用上方搜索功能添加中藥材或方劑",
        "請使用上方搜索功能添加收費項目": "請使用上方搜索功能添加收費項目",
        "請輸入您的電子郵件及密碼登入": "請輸入您的電子郵件及密碼登入",
        "請輸入病人姓名、編號或電話進行搜索": "請輸入病人姓名、編號或電話進行搜索",
        "請選擇...": "請選擇...",
        "請選擇性別": "請選擇性別",
        "請選擇職位": "請選擇職位",
        "請選擇醫師": "請選擇醫師",
        "請選擇開始和結束日期": "請選擇開始和結束日期",
        "請選擇類別": "請選擇類別",
        "請點擊「更新報表」來載入資料": "請點擊「更新報表」來載入資料",
        "請點擊左上角選單按鈕開始使用系統功能": "請點擊左上角選單按鈕開始使用系統功能",
        "證型診斷": "證型診斷",
        "護理師": "護理師",
        "財務報表": "財務報表",
        "資料備份與還原": "資料備份與還原",
        "資料更新時間：": "資料更新時間：",
        "身分證字號 *": "身分證字號 *",
        "週報表": "週報表",
        "過敏史": "過敏史",
        "過敏史：": "過敏史：",
        "選擇問診資料": "選擇問診資料",
        "配合艾灸": "配合艾灸",
        "醫囑及注意事項": "醫囑及注意事項",
        "醫囑模板": "醫囑模板",
        "醫師": "醫師",
        "醫師業績": "醫師業績",
        "醫師篩選": "醫師篩選",
        "醫師職位必須填寫註冊編號": "醫師職位必須填寫註冊編號",
        "金額": "金額",
        "針灸備註": "針灸備註",
        "開始日期": "開始日期",
        "開始：": "開始：",
        "關閉": "關閉",
        "電子郵件": "電子郵件",
        "電話": "電話",
        "電話號碼": "電話號碼",
        "電話號碼 *": "電話號碼 *",
        "項目": "項目",
        "項目名稱 *": "項目名稱 *",
        "項目說明": "項目說明",
        "項目類別 *": "項目類別 *",
        "頭面部": "頭面部",
        "🌿 慣用中藥組合": "🌿 慣用中藥組合",
        "🌿 載入常用藥方": "🌿 載入常用藥方",
        "🎫 病人套票": "🎫 病人套票",
        "💰 載入上次收費": "💰 載入上次收費",
        "💰 選擇收費項目：": "💰 選擇收費項目：",
        "📋 載入上次處方": "📋 載入上次處方",
        "📋 載入醫囑模板": "📋 載入醫囑模板",
        "📋 醫囑模板": "📋 醫囑模板",
        "📍 慣用穴位組合": "📍 慣用穴位組合",
        "📍 載入常用穴位": "📍 載入常用穴位",
        "🔍 搜索中藥庫：": "🔍 搜索中藥庫：",
        "🔍 搜索穴位：": "🔍 搜索穴位：",
        "🔍 診斷模板": "🔍 診斷模板",
        "🔍 載入診斷模板": "🔍 載入診斷模板",
        /* 以下為補充的翻譯鍵，用於補齊介面上尚未翻譯的中文文字 */
        "不含模板庫與中藥庫": "不含模板庫與中藥庫",
        "中藥材名稱": "中藥材名稱",
        "中醫診斷": "中醫診斷",
        "中醫註冊編號": "中醫註冊編號",
        "主訴": "主訴",
        "來載入資料": "來載入資料",
        "備份匯出": "備份匯出",
        "出生日期": "出生日期",
        "包含所有功能資料": "包含所有功能資料",
        "可在此選擇預填資訊": "可在此選擇預填資訊",
        "套票可用次數": "套票可用次數",
        "實時掛號資料不包含在備份中": "實時掛號資料不包含在備份中",
        "實際到診的時間": "實際到診的時間",
        "對應": "對應",
        "帳號的": "帳號的",
        "您可以匯出診所資料備份": "您可以匯出診所資料備份",
        "慣用中藥組合": "慣用中藥組合",
        "慣用穴位組合": "慣用穴位組合",
        "或匯入之前的備份檔案": "或匯入之前的備份檔案",
        "或輸入負數表示固定金額折扣": "或輸入負數表示固定金額折扣",
        "搜索中藥庫": "搜索中藥庫",
        "搜索穴位": "搜索穴位",
        "收費金額": "收費金額",
        "新增病人": "新增病人",
        "新增穴位組合": "新增穴位組合",
        "新增藥方組合": "新增藥方組合",
        "方劑名稱": "方劑名稱",
        "會自動轉為": "會自動轉為",
        "有效天數": "有效天數",
        "查看": "查看",
        "用於證明書": "用於證明書",
        "病人": "病人",
        "病人套票": "病人套票",
        "管理病人資料": "管理病人資料",
        "組成": "組成",
        "結束": "結束",
        "統計資料": "統計資料",
        "編號或電話進行搜索": "編號或電話進行搜索",
        "總計": "總計",
        "總費用": "總費用",
        "若病人已填寫問診": "若病人已填寫問診",
        "表示": "表示",
        "記錄症狀": "記錄症狀",
        "診所中文名稱": "診所中文名稱",
        "診斷": "診斷",
        "請輸入病人姓名": "請輸入病人姓名",
        "請選擇": "請選擇",
        "請點擊": "請點擊",
        "資料更新時間": "資料更新時間",
        "身分證字號": "身分證字號",
        "載入上次收費": "載入上次收費",
        "載入上次處方": "載入上次處方",
        "載入常用穴位": "載入常用穴位",
        "載入常用藥方": "載入常用藥方",
        "載入診斷模板": "載入診斷模板",
        "載入醫囑模板": "載入醫囑模板",
        "輸入": "輸入",
        "選擇收費項目": "選擇收費項目",
        "開始": "開始",
        "開立處方": "開立處方",
        "項目名稱": "項目名稱",
        "項目類別": "項目類別"
    },
    en: {
        "+ 新增收費項目": "+ Add Billing Item",
        "+ 新增用戶": "+ Add User",
        "+ 新增病人": "+ Add Patient",
        "+ 新增穴位組合": "+ Add Acupoint Combo",
        "+ 新增藥方組合": "+ Add Formula Combo",
        "管理分類": "Manage Categories",
        "一般用戶": "General User",
        "上月": "Last Month",
        "上週": "Last Week",
        "不使用問診資料": "Do not use consultation data",
        "中藥庫": "Herbal Library",
        "中藥服用方法": "Herb Usage Method",
        "中藥材": "Chinese Herbs",
        "中藥材名稱 *": "Herb Name *",
        "中醫診斷 *": "TCM Diagnosis *",
        "中醫註冊編號 *": "TCM Registration Number *",
        "主治": "Indications",
        "主要服務": "Main Service",
        "主訴 *": "Chief Complaint *",
        "主訴症狀": "Chief Complaint Symptoms",
        "人": "People",
        "今天": "Today",
        "今年": "This Year",
        "佔比": "Proportion",
        "使用注意": "Usage Notes",
        "保存": "Save",
        "保存病歷": "Save Medical Record",
        "個人設置": "Personal Settings",
        "停用的帳號將無法登入系統": "Disabled accounts will not be able to log in",
        "備註": "Notes",
        "儲存": "Save",
        "內科疾病": "Internal Diseases",
        "全部": "All",
        "全部分類": "All Categories",
        "全部用戶": "All Users",
        "全部科別": "All Departments",
        "全部醫師": "All Doctors",
        "全部針法": "All Needling Methods",
        "全部類別": "All Types",
        "其他": "Others",
        "出生日期 *": "Date of Birth *",
        "出處": "Source",
        "別名": "Alias",
        "到診時間": "Arrival Time",
        "刷新": "Refresh",
        "功效": "Effect",
        "匯入備份": "Import Backup",
        "匯出": "Export",
        "匯出備份": "Export Backup",
        "去年": "Last Year",
        "取消": "Cancel",
        "取消診症": "Cancel Consultation",
        "名醫診所系統": "TCM Clinic System",
        "啟用此收費項目": "Enable this billing item",
        "啟用此用戶帳號": "Enable this user account",
        "四肢部": "Limbs",
        "報表類型": "Report Type",
        "天": "Days",
        "套票可用次數 *": "Package Available Uses *",
        "套票項目": "Package Item",
        "女": "Female",
        "姓名": "Name",
        "姓名 *": "Name *",
        "婦科疾病": "Gynecological Diseases",
        "婦科調理": "Gynecological Treatment",
        "完成診症次數": "Completed Consultations",
        "密碼": "Password",
        "實際到診的時間（用於證明書）": "Actual arrival time (for certificates)",
        "對應 Firebase Authentication 帳號的 UID": "UID corresponding to Firebase Auth account",
        "尚未載入或無套票": "No packages loaded",
        "已停用": "Disabled",
        "常用劑量": "Common Dosage",
        "常用穴位組合": "Common Acupoint Combos",
        "常用藥方組合": "Common Herbal Combos",
        "平均單價": "Average Price",
        "平均消費": "Average Spending",
        "平補平瀉": "Neutral Tonification",
        "年報表": "Annual Report",
        "年齡": "Age",
        "年齡：": "Age:",
        "序號": "No.",
        "建議休息期間": "Recommended rest period",
        "建議病人下次回診的時間": "Recommended next appointment time",
        "快速選擇": "Quick Select",
        "性別": "Gender",
        "性別 *": "Gender *",
        "性別：": "Gender:",
        "性味": "Nature and Taste",
        "您可以匯出診所資料備份（包含所有功能資料，不含模板庫與中藥庫），或匯入之前的備份檔案。實時掛號資料不包含在備份中。": "You can export clinic data backup (including all functional data, excluding template and herb libraries), or import a previous backup. Real‑time registration data is not included in the backup.",
        "感冒類": "Cold Remedies",
        "折扣項目": "Discount Item",
        "折扣項目：輸入0.9表示9折，輸入9會自動轉為9折，或輸入負數表示固定金額折扣": "Discount item: enter 0.9 for 10% off, entering 9 will automatically convert to 10% off, or enter a negative number for a fixed amount discount",
        "掛號列表": "Registration List",
        "掛號時間": "Registration Time",
        "掛號時間：": "Registration Time:",
        "掛號診症系統": "Registration and Consultation System",
        "掛號醫師": "Consulting Doctor",
        "掛號醫師 *": "Consulting Doctor *",
        "搜索病人掛號": "Search patient registrations",
        "操作": "Actions",
        "收入佔比": "Revenue Share",
        "收入摘要": "Revenue Summary",
        "收入金額": "Revenue Amount",
        "收費金額 *": "Charge Amount *",
        "收費項目": "Billing Items",
        "收費項目管理": "Billing Item Management",
        "新增": "Add",
        "新增、查看、管理病人資料": "Add, view, and manage patient data",
        "新增中藥材": "Add Herb",
        "新增分類": "Add Category",
        "新增收費項目": "Add Billing Item",
        "新增方劑": "Add Formula",
        "新增用戶": "Add User",
        "新增病人資料": "Add Patient Data",
        "方劑": "Formula",
        "方劑名稱 *": "Formula Name *",
        "日報表": "Daily Report",
        "日期": "Date",
        "昨天": "Yesterday",
        "更新報表": "Update Report",
        "最後登入": "Last Login",
        "月報表": "Monthly Report",
        "有效天數 *": "Valid Days *",
        "有診症的醫師": "Doctors with Consultations",
        "服務分析": "Service Analysis",
        "服務類型": "Service Type",
        "服藥天數": "Days of Medication",
        "本月": "This Month",
        "本週": "This Week",
        "模板庫": "Template Library",
        "次/日": "Times/Day",
        "次數": "Times",
        "歡迎使用名醫診所系統": "Welcome to TCM Clinic System",
        "歸經": "Meridian Entry",
        "每日明細": "Daily Details",
        "每日次數": "Daily Count",
        "每次診症平均": "Average per Consultation",
        "治療費": "Treatment Fee",
        "注意事項": "Precautions",
        "活躍醫師": "Active Doctors",
        "消化系統": "Digestive System",
        "清熱類": "Heat‑Clearing Category",
        "清除": "Clear",
        "瀉法": "Sedation",
        "狀態": "Status",
        "現有分類": "Existing Categories",
        "現病史": "Current Medical History",
        "用戶管理": "User Management",
        "用於病假證明書的建議休息期間": "Suggested rest period for sick leave certificate",
        "用法": "Usage",
        "男": "Male",
        "病人姓名": "Patient Name",
        "病人掛號": "Patient Registration",
        "病人詳細資料": "Patient Details",
        "病人資料管理": "Patient Management",
        "病人資訊": "Patient Information",
        "病人：": "Patient:",
        "病史及備註": "Medical History & Notes",
        "病史及備註：": "Medical History & Notes:",
        "病歷記錄": "Medical Records",
        "療程": "Treatment Course",
        "登入系統": "Login",
        "登出": "Logout",
        "登出系統": "Logout System",
        "確認掛號": "Confirm Registration",
        "穴位庫": "Acupoint Library",
        "管理診所用戶權限": "Manage clinic user permissions",
        "簡潔的掛號流程管理": "Concise registration process management",
        "系統功能概覽": "System Function Overview",
        "系統管理": "System Management",
        "組成 *": "Composition *",
        "結束日期": "End Date",
        "結束：": "End:",
        "統計期間收入": "Income for the period",
        "統計資料、備份匯出": "Statistics & Backup Export",
        "編號": "ID",
        "編輯組合": "Edit Combo",
        "總收入": "Total Revenue",
        "總計：": "Total:",
        "總費用：": "Total Cost:",
        "總金額": "Total Amount",
        "聯絡地址": "Contact Address",
        "職位": "Position",
        "職位 *": "Position *",
        "背腰部": "Back and Waist",
        "胸腹部": "Chest and Abdomen",
        "脈象": "Pulse",
        "自訂期間": "Custom Period",
        "自購買日起算": "Count from purchase date",
        "舌象": "Tongue",
        "若病人已填寫問診，可在此選擇預填資訊": "If patient has filled out the questionnaire, you can select to auto‑fill information here",
        "藥費": "Medicine Fee",
        "處方內容": "Prescription Content",
        "補法": "Tonification",
        "補益類": "Tonifying Category",
        "複診時間": "Follow‑up Time",
        "計費單位": "Billing Unit",
        "記錄症狀、診斷、開立處方": "Record symptoms, diagnosis, and prescribe",
        "診所中文名稱 *": "Clinic Chinese Name *",
        "診所中文名稱：": "Clinic Chinese Name:",
        "診所功能": "Clinic Functions",
        "診所地址": "Clinic Address",
        "診所收入分析與財務統計": "Clinic Revenue Analysis & Financial Statistics",
        "診所營業時間": "Clinic Operating Hours",
        "診所用戶管理": "Clinic User Management",
        "診所管理": "Clinic Management",
        "診所英文名稱": "Clinic English Name",
        "診所英文名稱：": "Clinic English Name:",
        "診所設定": "Clinic Settings",
        "診所資料修改": "Clinic Data Modification",
        "診所電話": "Clinic Phone",
        "診斷模板": "Diagnosis Templates",
        "診症人次": "Number of Consultations",
        "診症系統": "Consultation System",
        "診症記錄": "Consultation Records",
        "診療費": "Consultation Fee",
        "註冊編號": "Registration Number",
        "詳細財務報表": "Detailed Financial Report",
        "請使用上方搜索功能添加中藥材或方劑": "Please use the search function above to add herbs or formulas",
        "請使用上方搜索功能添加收費項目": "Please use the search function above to add billing items",
        "請輸入您的電子郵件及密碼登入": "Please enter your email and password to log in",
        "請輸入病人姓名、編號或電話進行搜索": "Please enter patient name, ID, or phone number to search",
        "請選擇...": "Please select...",
        "請選擇性別": "Please select gender",
        "請選擇職位": "Please select position",
        "請選擇醫師": "Please select doctor",
        "請選擇開始和結束日期": "Please select start and end dates",
        "請選擇類別": "Please select category",
        "請點擊「更新報表」來載入資料": "Please click 'Update Report' to load data",
        "請點擊左上角選單按鈕開始使用系統功能": "Please click the menu button at the top left to start using system functions",
        "證型診斷": "Pattern Diagnosis",
        "護理師": "Nurse",
        "財務報表": "Financial Report",
        "資料備份與還原": "Data Backup and Restore",
        "資料更新時間：": "Data update time:",
        "身分證字號 *": "ID Card Number *",
        "週報表": "Weekly Report",
        "過敏史": "Allergy History",
        "過敏史：": "Allergy History:",
        "選擇問診資料": "Select consultation data",
        "配合艾灸": "Combined with moxibustion",
        "醫囑及注意事項": "Doctor's advice and precautions",
        "醫囑模板": "Doctor's Advice Templates",
        "醫師": "Doctor",
        "醫師業績": "Doctor Performance",
        "醫師篩選": "Doctor Filter",
        "醫師職位必須填寫註冊編號": "The doctor position must have a registration number",
        "金額": "Amount",
        "針灸備註": "Acupuncture Notes",
        "開始日期": "Start Date",
        "開始：": "Start:",
        "關閉": "Close",
        "電子郵件": "Email",
        "電話": "Phone",
        "電話號碼": "Phone Number",
        "電話號碼 *": "Phone Number *",
        "項目": "Item",
        "項目名稱 *": "Item Name *",
        "項目說明": "Item Description",
        "項目類別 *": "Item Category *",
        "頭面部": "Head and Face",
        "🌿 慣用中藥組合": "🌿 Common Herbal Formulas",
        "🌿 載入常用藥方": "🌿 Load Common Formulas",
        "🎫 病人套票": "🎫 Patient Packages",
        "💰 載入上次收費": "💰 Load Last Billing",
        "💰 選擇收費項目：": "💰 Select Billing Items:",
        "📋 載入上次處方": "📋 Load Last Prescription",
        "📋 載入醫囑模板": "📋 Load Advice Templates",
        "📋 醫囑模板": "📋 Advice Templates",
        "📍 慣用穴位組合": "📍 Common Acupoint Combos",
        "📍 載入常用穴位": "📍 Load Common Points",
        "🔍 搜索中藥庫：": "🔍 Search Herbal Library:",
        "🔍 搜索穴位：": "🔍 Search Acupoints:",
        "🔍 診斷模板": "🔍 Diagnosis Templates",
        "🔍 載入診斷模板": "🔍 Load Diagnosis Templates",
        /* Additional translations to cover previously untranslated visible text */
        "不含模板庫與中藥庫": "Excluding template and herb libraries",
        "中藥材名稱": "Herbal ingredient name",
        "中醫診斷": "TCM diagnosis",
        "中醫註冊編號": "TCM registration number",
        "主訴": "Chief complaint",
        "來載入資料": "Load data",
        "備份匯出": "Export backup",
        "出生日期": "Date of birth",
        "包含所有功能資料": "Includes all functional data",
        "可在此選擇預填資訊": "You may select to prefill information here",
        "套票可用次數": "Package available uses",
        "實時掛號資料不包含在備份中": "Real‑time registration data is not included in backups",
        "實際到診的時間": "Actual arrival time",
        "對應": "Corresponding",
        "帳號的": "Account's",
        "您可以匯出診所資料備份": "You may export clinic data backups",
        "慣用中藥組合": "Common herbal combinations",
        "慣用穴位組合": "Common acupoint combinations",
        "或匯入之前的備份檔案": "or import a previous backup file",
        "或輸入負數表示固定金額折扣": "or enter a negative number for a fixed amount discount",
        "搜索中藥庫": "Search herbal library",
        "搜索穴位": "Search acupoints",
        "收費金額": "Charge amount",
        "新增病人": "Add patient",
        "新增穴位組合": "Add acupoint combination",
        "新增藥方組合": "Add herbal formula combination",
        "方劑名稱": "Formula name",
        "會自動轉為": "will automatically convert to",
        "有效天數": "Valid days",
        "查看": "View",
        "用於證明書": "For certificates",
        "病人": "Patient",
        "病人套票": "Patient packages",
        "管理病人資料": "Manage patient data",
        "組成": "Composition",
        "結束": "End",
        "統計資料": "Statistics",
        "編號或電話進行搜索": "Search by ID or phone",
        "總計": "Total",
        "總費用": "Total cost",
        "若病人已填寫問診": "If patient has filled in consultation",
        "表示": "Indicates",
        "記錄症狀": "Record symptoms",
        "診所中文名稱": "Clinic Chinese name",
        "診斷": "Diagnosis",
        "請輸入病人姓名": "Please enter patient name",
        "請選擇": "Please select",
        "請點擊": "Please click",
        "資料更新時間": "Data update time",
        "身分證字號": "ID card number",
        "載入上次收費": "Load last billing",
        "載入上次處方": "Load last prescription",
        "載入常用穴位": "Load common acupoints",
        "載入常用藥方": "Load common formulas",
        "載入診斷模板": "Load diagnosis template",
        "載入醫囑模板": "Load advice template",
        "輸入": "Input",
        "選擇收費項目": "Select billing item",
        "開始": "Start",
        "開立處方": "Prescribe",
        "項目名稱": "Item name",
        "項目類別": "Item category"
    }
};

// Declare isTranslating early so it is available wherever referenced.
// Using var ensures the declaration is hoisted and accessible before use.
// Track whether a translation is currently being applied to avoid recursive invocation
var isTranslating = false;

// Keep a record of the last language each node was translated into.
// We use a data attribute on each element (data-last-lang) rather than a WeakMap
// to persist the last translated language across DOM updates.  This helps
// prevent repeatedly re‑translating the same node when it hasn't changed
// languages, which can improve performance on pages with large DOMs.


/**
 * Save the original text and placeholder values for each element.  This
 * allows switching languages back and forth by always referencing the
 * original Chinese string as the lookup key.  Only leaf elements (with
 * no child elements) are considered for text replacement to avoid
 * overriding nested HTML structures.
 */
function storeOriginalText() {
    const all = document.querySelectorAll('*');
    all.forEach(el => {
        // Only store text for leaf nodes to prevent replacing content of complex elements
        if (el.children.length === 0) {
            const text = (el.textContent || '').trim();
            if (text) {
                if (!el.dataset.originalText) {
                    el.dataset.originalText = text;
                }
            }
            if (el.getAttribute('placeholder')) {
                const ph = el.getAttribute('placeholder').trim();
                if (ph && !el.dataset.originalPlaceholder) {
                    el.dataset.originalPlaceholder = ph;
                }
            }
        }
    });
}

/**
 * Recursively translate a DOM node and its descendants.  This function
 * ensures that the original text and placeholder values are stored on
 * first encounter, and then looks up a translated value from the
 * provided dictionary.  It operates on leaf nodes only (elements
 * without child elements) to avoid altering internal structures.
 * @param {Node} node The DOM node to translate.
 * @param {Object} dict The translation dictionary for the current language.
 */
function translateNode(node, dict, lang) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    // If the element has no child elements, it is a leaf node and can
    // have its textContent and placeholder translated directly.
    if (node.children.length === 0) {
        // Only translate if the node hasn't been translated to this language yet.
        if (node.dataset.lastLang !== lang) {
            const currentText = (node.textContent || '').trim();
            if (currentText) {
                // Preserve the original text if not already stored
                if (!node.dataset.originalText) {
                    node.dataset.originalText = currentText;
                }
                const original = node.dataset.originalText;
                if (dict && Object.prototype.hasOwnProperty.call(dict, original)) {
                    node.textContent = dict[original];
                }
            }
            // Handle placeholder attribute if present
            if (node.hasAttribute('placeholder')) {
                const phVal = node.getAttribute('placeholder').trim();
                if (!node.dataset.originalPlaceholder && phVal) {
                    node.dataset.originalPlaceholder = phVal;
                }
                const originalPh = node.dataset.originalPlaceholder;
                if (originalPh && dict && Object.prototype.hasOwnProperty.call(dict, originalPh)) {
                    node.setAttribute('placeholder', dict[originalPh]);
                }
            }
            // Record the language this node has been translated into
            node.dataset.lastLang = lang;
        }
    }
    // Recursively translate child elements
    Array.from(node.children).forEach(child => translateNode(child, dict, lang));
}

/**
 * Apply translations based on the currently selected language.  The
 * language code is stored in localStorage under the key 'lang'.  If not
 * present the default language is Chinese ('zh').  For each element
 * containing a data‑original‑text attribute the translation is looked up
 * in the dictionary; if found the textContent is replaced, otherwise the
 * text remains unchanged.  Placeholders are handled similarly.
 */
function applyTranslations() {
    // Guard against recursive invocation when triggered by mutation observer
    if (isTranslating) return;
    isTranslating = true;
    try {
        const lang = localStorage.getItem('lang') || 'zh';
        const dict = window.translations[lang] || {};
        // Translate the entire document body
        translateNode(document.body, dict, lang);
    } finally {
        // Reset flag after translation
        isTranslating = false;
    }
}

/**
 * Change the current language and persist it to localStorage.  This
 * function triggers translation immediately after updating the stored
 * language code.
 * @param {string} lang - the language code ('zh' or 'en')
 */
function setLanguage(lang) {
    localStorage.setItem('lang', lang);
    applyTranslations();
}

// Observe DOM mutations to automatically translate dynamically added
// elements (such as modals or lists that are created after initial
// page load).  Whenever new nodes are added the translations are
// applied.  This helps ensure that dynamic content will also be
// translated without needing to call applyTranslations manually in
// every script.

const observer = new MutationObserver(mutations => {
    // Do not react to mutations while a translation is being applied.
    if (isTranslating) return;
    const lang = localStorage.getItem('lang') || 'zh';
    const dict = window.translations[lang] || {};
    mutations.forEach(m => {
        if (m.addedNodes && m.addedNodes.length > 0) {
            m.addedNodes.forEach(node => {
                // Only translate nodes that are elements
                translateNode(node, dict, lang);
            });
        }
    });
});

// Setup event listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('lang') || 'zh';
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.value = savedLang;
        langSelector.addEventListener('change', () => {
            setLanguage(langSelector.value);
        });
    }
    applyTranslations();
    // Observe only the main system container if present; fallback to body.
    const target = document.getElementById('mainSystem') || document.body;
    observer.observe(target, { childList: true, subtree: true });
});
