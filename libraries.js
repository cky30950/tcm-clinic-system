window.herbLibrary = Array.isArray(window.herbLibrary) ? window.herbLibrary : [];
window.herbInventory = (window.herbInventory && typeof window.herbInventory === 'object')
  ? window.herbInventory
  : {};
window.acupointLibrary = Array.isArray(window.acupointLibrary) ? window.acupointLibrary : [];
window.prescriptionTemplates = Array.isArray(window.prescriptionTemplates) ? window.prescriptionTemplates : [
  {
    id: 1,
    name: '感冒用藥指導模板',
    category: '用藥指導',
    duration: '7天',
    followUp: '3天後',
    content: '服藥方法：每日三次，飯後30分鐘溫服。服藥期間多喝溫開水。避免生冷、油膩、辛辣食物。注意事項：充分休息，避免熬夜。如症狀加重或持續發燒請立即回診。療程安排：建議療程7天，服藥3天後回診評估。',
    note: '',
    lastModified: '2024-02-15'
  }
];
window.diagnosisTemplates = Array.isArray(window.diagnosisTemplates) ? window.diagnosisTemplates : [
  {
    id: 1,
    name: '感冒診斷模板',
    category: '內科',
    content: '症狀描述：患者表現為鼻塞、喉嚨痛、咳嗽等症狀。檢查建議：觀察咽部紅腫狀況，測量體溫。治療建議：建議使用疏風解表類中藥，搭配休息和多喝水。復診安排：3天後回診。',
    lastModified: '2024-01-20'
  }
];
