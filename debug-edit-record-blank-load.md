# Debug Session: edit-record-blank-load
- **Status**: [OPEN]
- **Issue**: 一開始按「修改病歷」後，收費項目及處方內容同時顯示不了；取消修改後再按修改病歷又正常顯示
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-edit-record-blank-load.ndjson

## Reproduction Steps
1. 本機以靜態伺服器開啟系統（http://localhost:8000/system.html）並登入
2. 進入診症系統，對已完成診症按「修改病歷」
3. 觀察處方內容與收費項目是否空白
4. 按「取消修改」，再按一次「修改病歷」
5. 比對兩次結果

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 非同步回調（loadConsultationSystem 的約診監聽初始回調／庫存監聽初始回調）在載入期間以空白狀態最後重繪，覆蓋已載入內容 | High | Low | Pending |
| B | 舊草稿（multiPrescriptions/billingItemsStructured 為空但文字欄位有內容）通過 stale 檢查（本機時鐘領先等），恢復時把兩個陣列覆蓋成空白 | High | Low | Pending |
| C | 收費載入階段（L1481 updateBillingDisplay 未獨立防護）拋錯，觸發外層 catch (L1505) 呼叫 clearConsultationForm，連帶清空處方 | Medium | Low | Pending |
| D | 冷啟動首次 getDoc 取得的記錄本身缺少 multiPrescriptions/billingItemsStructured（或解析得到空陣列） | Medium | Low | Pending |

## Log Evidence
（待收集）

## Verification Conclusion
（待分析）
