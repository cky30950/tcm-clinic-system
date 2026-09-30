/* ============================================================
 * 會員儲值錢包：核心純邏輯
 * ------------------------------------------------------------
 * 金額捨入、扣款拆分、退款拆分、冪等重放判定。
 * 無 Firestore／網路依賴，可直接以 node:test 跑單元測試：
 *   node --test functions/api/wallet/lib/wallet-core.test.js
 * ============================================================ */

export class WalletError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export function round2(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

/**
 * 金額欄位把關：必須為數字且最多兩位小數。
 * round2 會把 100.999 靜默捨成 101.00，客戶端（或腳本）誤傳三位小數
 * 時應明確拒收，避免實際入帳金額與操作人預期不一致。
 * 用 epsilon 容忍二進位浮點誤差（例 1.11*100＝110.999…）。
 * @param {*} rawValue 原始輸入
 * @param {string} label 錯誤訊息用欄位名稱
 * @returns {number}
 */
export function requireMoney2(rawValue, label) {
    const n = Number(rawValue);
    if (!Number.isFinite(n)) {
        throw new WalletError(400, 'INVALID_AMOUNT', `${label}必須為有效數字`);
    }
    const cents = n * 100;
    if (Math.abs(cents - Math.round(cents)) > 1e-6) {
        throw new WalletError(400, 'TOO_MANY_DECIMALS',
            `${label}最多只可兩位小數（最小單位 HK$0.01）`);
    }
    return round2(n);
}

/**
 * 付款扣款拆分（#12）：依診所配置決定本金／贈送額扣款順序。
 * 呼叫端需先通過帳戶存在與狀態檢查；本函式負責餘額充足檢查與拆分。
 *
 * @param {number} amount 本次扣款金額（兩位小數）
 * @param {number} balance 帳戶本金
 * @param {number} bonusBalance 帳戶贈送額
 * @param {boolean} deductBonusFirst true（預設）先扣贈送額；false 先扣本金
 * @returns {{fromBalance:number, fromBonus:number, newBalance:number, newBonus:number}}
 */
export function splitPayment(amount, balance, bonusBalance, deductBonusFirst) {
    const amt = round2(amount);
    const bal = round2(balance);
    const bbal = round2(bonusBalance);
    if (round2(bal + bbal) < amt) {
        throw new WalletError(402, 'INSUFFICIENT_FUNDS',
            `儲值餘額不足（可用 HK$${round2(bal + bbal).toFixed(2)}）`);
    }
    let fromBonus;
    let fromBalance;
    if (deductBonusFirst !== false) {
        fromBonus = round2(Math.min(bbal, amt));
        fromBalance = round2(amt - fromBonus);
    } else {
        fromBalance = round2(Math.min(bal, amt));
        fromBonus = round2(amt - fromBalance);
    }
    return {
        fromBalance,
        fromBonus,
        newBalance: round2(bal - fromBalance),
        newBonus: round2(bbal - fromBonus)
    };
}

/**
 * 部分／全額退款的本金與贈送額拆分（含累計上限把關）。
 *
 * 防超退規則：
 *  - 累計退款（含本次）不得超過原付款總額；
 *  - 按原付款比例分配贈送額，再以各組件「剩餘可退額」夾緊，
 *    避免多次部分退款的捨入誤差累計導致超退。
 *
 * @param {object} input
 * @param {number} input.paidBalance 原付款本金累計
 * @param {number} input.paidBonus 原付款贈送額累計
 * @param {number} input.alreadyBalance 已退本金
 * @param {number} input.alreadyBonus 已退贈送額
 * @param {number} [input.want] 本次欲退金額；未指定或 0＝退還全部剩餘
 * @returns {{totalPaid:number, alreadyTotal:number, remainingTotal:number,
 *            refundWant:number, refundBalance:number, refundBonus:number,
 *            newRefundedBalance:number, newRefundedBonus:number,
 *            totalRefunded:number}}
 */
export function computeRefund(input) {
    const src = input || {};
    const paidBalance = round2(src.paidBalance);
    const paidBonus = round2(src.paidBonus);
    const alreadyBalance = round2(src.alreadyBalance);
    const alreadyBonus = round2(src.alreadyBonus);
    const totalPaid = round2(paidBalance + paidBonus);
    const alreadyTotal = round2(alreadyBalance + alreadyBonus);
    const remainingTotal = round2(totalPaid - alreadyTotal);

    if (remainingTotal <= 0) {
        throw new WalletError(400, 'REFUND_ALREADY_COMPLETE',
            `此診症單的儲值付款 HK$${totalPaid.toFixed(2)} 已全額退款`);
    }
    const want = src.want === undefined || src.want === null
        ? 0
        : round2(src.want);
    if (want < 0) {
        throw new WalletError(400, 'INVALID_AMOUNT', '退款金額必須大於 0');
    }
    // 未指定金額＝退還全部剩餘可退金額
    const refundWant = want > 0 ? want : remainingTotal;
    if (refundWant <= 0) {
        throw new WalletError(400, 'INVALID_AMOUNT', '退款金額必須大於 0');
    }
    if (refundWant > remainingTotal) {
        throw new WalletError(400, 'REFUND_EXCEEDS_PAYMENT',
            `退款金額不可超過尚可退款 HK$${remainingTotal.toFixed(2)}`
            + `（原付款 HK$${totalPaid.toFixed(2)}`
            + `，已退 HK$${alreadyTotal.toFixed(2)}）`);
    }

    // 按原付款比例拆分本金/贈額，並以各組件剩餘可退額夾緊
    const remainBonus = round2(paidBonus - alreadyBonus);
    const remainBalance = round2(paidBalance - alreadyBalance);
    let refundBonus = round2(paidBonus * (refundWant / totalPaid));
    if (refundBonus > remainBonus) refundBonus = remainBonus;
    if (refundBonus < 0) refundBonus = 0;
    let refundBalance = round2(refundWant - refundBonus);
    if (refundBalance > remainBalance) {
        refundBalance = remainBalance;
        refundBonus = round2(refundWant - refundBalance);
    }

    return {
        totalPaid,
        alreadyTotal,
        remainingTotal,
        refundWant,
        refundBalance,
        refundBonus,
        newRefundedBalance: round2(alreadyBalance + refundBalance),
        newRefundedBonus: round2(alreadyBonus + refundBonus),
        totalRefunded: round2(alreadyTotal + refundWant)
    };
}

/**
 * 冪等記錄命中判定（runIdempotentTransaction 交易內使用）。
 *
 * 同一把 idempotencyKey 的請求指紋（金額／病人／診症單雜湊）必須一致；
 * 不一致＝客戶端重複使用鍵但換了參數，回 409。功能上線前建立的舊記錄
 * 沒有指紋欄位，維持寬鬆放行。
 *
 * @param {object|null} idemFields batchGet 取回的冪等文件原始欄位（Firestore 格式）
 * @param {string} fingerprintHash 本次請求指紋 SHA-256；空字串代表不啟用比對
 * @returns {{hit:false}|{hit:true, result:object}}
 */
export function resolveIdempotentReplay(idemFields, fingerprintHash) {
    if (!idemFields || !idemFields.result) {
        return { hit: false };
    }
    const oldFp = idemFields.fingerprint
        ? (idemFields.fingerprint.stringValue || '')
        : '';
    if (fingerprintHash && oldFp && oldFp !== fingerprintHash) {
        throw new WalletError(409, 'IDEMPOTENCY_KEY_CONFLICT',
            '相同的請求識別鍵帶有不同的請求參數，請重新產生 idempotencyKey 後再試');
    }
    try {
        return {
            hit: true,
            result: JSON.parse(idemFields.result.stringValue || '{}')
        };
    } catch (_e) {
        return { hit: true, result: { ok: true, idempotent: true } };
    }
}
