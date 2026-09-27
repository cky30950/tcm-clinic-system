/* ============================================================
 * 錢包核心純邏輯單元測試
 * 執行：node --test functions/api/wallet/lib/wallet-core.test.js
 * 覆蓋：bonus-first 拆分、退款比例捨入與多次部分退款夾緊、
 *       累計退款上限、冪等重放、金額欄位把關。
 * ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    WalletError,
    round2,
    requireMoney2,
    splitPayment,
    computeRefund,
    resolveIdempotentReplay
} from './wallet-core.js';

function expectWalletError(fn, status, code) {
    assert.throws(fn, (err) => {
        assert.ok(err instanceof WalletError, '必須是 WalletError');
        assert.equal(err.status, status);
        assert.equal(err.code, code);
        return true;
    });
}

// ── round2 / requireMoney2 ──

test('round2：兩位小數捨入與非數字歸零', () => {
    assert.equal(round2(6.666), 6.67);
    assert.equal(round2(2.344), 2.34);
    assert.equal(round2(NaN), 0);
    assert.equal(round2(undefined), 0);
    assert.equal(round2('6.666'), 6.67);
    // 注意：1.005 因二進位表示為 1.0049999… 會被向下捨為 1，
    // 這是 Math.round(n*100)/100 的既定行為；requireMoney2 已在輸入端
    // 拒收兩位以上小數，金額路徑不會出現這類輸入。
    assert.equal(round2(1.005), 1);
});

test('requireMoney2：拒收超過兩位小數與非數字', () => {
    assert.equal(requireMoney2(100, '金額'), 100);
    assert.equal(requireMoney2('88.8', '金額'), 88.8);
    expectWalletError(() => requireMoney2(100.999, '金額'), 400, 'TOO_MANY_DECIMALS');
    expectWalletError(() => requireMoney2('abc', '金額'), 400, 'INVALID_AMOUNT');
    // 二進位浮點誤差不應誤判
    assert.equal(requireMoney2(1.11 * 3, '金額'), 3.33);
});

// ── splitPayment：bonus-first 拆分 ──

test('扣款拆分：預設先扣贈送額，不足部分由本金補', () => {
    const r = splitPayment(100, 50, 60, true);
    assert.deepEqual(r, {
        fromBalance: 40,
        fromBonus: 60,
        newBalance: 10,
        newBonus: 0
    });
});

test('扣款拆分：deductBonusFirst=false 先扣本金', () => {
    const r = splitPayment(100, 50, 60, false);
    assert.deepEqual(r, {
        fromBalance: 50,
        fromBonus: 50,
        newBalance: 0,
        newBonus: 10
    });
});

test('扣款拆分：金額小於首扣池時全由該池支付', () => {
    const bonusFirst = splitPayment(30, 50, 60, true);
    assert.equal(bonusFirst.fromBonus, 30);
    assert.equal(bonusFirst.fromBalance, 0);

    const balanceFirst = splitPayment(30, 50, 60, false);
    assert.equal(balanceFirst.fromBalance, 30);
    assert.equal(balanceFirst.fromBonus, 0);
});

test('扣款拆分：剛好等於總餘額時兩池歸零', () => {
    for (const flag of [true, false]) {
        const r = splitPayment(110, 50, 60, flag);
        assert.equal(r.fromBalance + r.fromBonus, 110);
        assert.equal(r.newBalance, 0);
        assert.equal(r.newBonus, 0);
    }
});

test('扣款拆分：扣除額永遠等於應付金額（捨入不流失）', () => {
    for (const [amt, bal, bbal] of [
        [0.11, 1.1, 0],
        [10.01, 5.55, 10],
        [33.33, 99.99, 99.99],
        [0.03, 0.01, 0.02]
    ]) {
        for (const flag of [true, false]) {
            const r = splitPayment(amt, bal, bbal, flag);
            assert.equal(round2(r.fromBalance + r.fromBonus), round2(amt),
                `amt=${amt} flag=${flag}`);
            assert.ok(r.fromBalance >= 0 && r.fromBonus >= 0);
            assert.ok(r.fromBalance <= bal + 1e-9);
            assert.ok(r.fromBonus <= bbal + 1e-9);
        }
    }
});

test('扣款拆分：餘額不足擲 INSUFFICIENT_FUNDS（402）', () => {
    expectWalletError(() => splitPayment(101, 50, 50, true), 402, 'INSUFFICIENT_FUNDS');
    expectWalletError(() => splitPayment(0.01, 0, 0, false), 402, 'INSUFFICIENT_FUNDS');
});

// ── computeRefund：比例捨入、多次部分退款、累計上限 ──

test('退款：單一組件全額退', () => {
    const r = computeRefund({
        paidBalance: 100, paidBonus: 0,
        alreadyBalance: 0, alreadyBonus: 0
    });
    assert.equal(r.refundWant, 100);
    assert.equal(r.refundBalance, 100);
    assert.equal(r.refundBonus, 0);
    assert.equal(r.totalRefunded, 100);
});

test('退款：依原付款比例拆分本金/贈額', () => {
    const r = computeRefund({
        paidBalance: 30, paidBonus: 70,
        alreadyBalance: 0, alreadyBonus: 0,
        want: 50
    });
    assert.equal(r.refundBonus, 35);
    assert.equal(r.refundBalance, 15);
});

test('退款：比例捨入分攤後兩者合計必須等於退款額', () => {
    // 30 元付款（本金10/贈額20）退 10：贈額 6.666… → 6.67，本金補 3.33
    const r = computeRefund({
        paidBalance: 10, paidBonus: 20,
        alreadyBalance: 0, alreadyBonus: 0,
        want: 10
    });
    assert.equal(r.refundBonus, 6.67);
    assert.equal(r.refundBalance, 3.33);
    assert.equal(round2(r.refundBonus + r.refundBalance), 10);
});

test('退款：贈送額可退餘額用盡時，差額轉由本金承擔', () => {
    // 原付本金70/贈額30；贈額已全退；本次退30 比例試算給贈額9 但夾緊為0
    const r = computeRefund({
        paidBalance: 70, paidBonus: 30,
        alreadyBalance: 0, alreadyBonus: 30,
        want: 30
    });
    assert.equal(r.refundBonus, 0);
    assert.equal(r.refundBalance, 30);
});

test('退款：本金可退餘額用盡時，差額轉由贈送額承擔', () => {
    // 原付本金10/贈額90；本金已全退；本次退20：比例分配本金2 但剩餘0，
    // 夾緊後贈額回補為20
    const r = computeRefund({
        paidBalance: 10, paidBonus: 90,
        alreadyBalance: 10, alreadyBonus: 0,
        want: 20
    });
    assert.equal(r.refundBalance, 0);
    assert.equal(r.refundBonus, 20);
    assert.equal(round2(r.refundBalance + r.refundBonus), 20);
});

test('退款：模擬多次部分退款，累計永不超過原付款', () => {
    const paidBalance = 33.33;
    const paidBonus = 66.67;
    let alreadyBalance = 0;
    let alreadyBonus = 0;
    const wants = [10, 10, 10, 10, 10];
    for (const want of wants) {
        const r = computeRefund({
            paidBalance, paidBonus,
            alreadyBalance, alreadyBonus,
            want
        });
        alreadyBalance = r.newRefundedBalance;
        alreadyBonus = r.newRefundedBonus;
        assert.ok(r.refundBalance >= 0 && r.refundBonus >= 0);
        assert.equal(round2(r.refundBalance + r.refundBonus), want);
        assert.ok(alreadyBalance <= paidBalance + 1e-9);
        assert.ok(alreadyBonus <= paidBonus + 1e-9);
    }
    // 已退 50，剩餘可退 50
    assert.equal(round2(alreadyBalance + alreadyBonus), 50);
    // 再退 50.01 即超過上限
    expectWalletError(() => computeRefund({
        paidBalance, paidBonus,
        alreadyBalance, alreadyBonus,
        want: 50.01
    }), 400, 'REFUND_EXCEEDS_PAYMENT');
    // 退完最後 50
    const tail = computeRefund({
        paidBalance, paidBonus,
        alreadyBalance, alreadyBonus,
        want: 50
    });
    assert.equal(round2(tail.newRefundedBalance + tail.newRefundedBonus), 100);
});

test('退款：未指定金額＝退還全部剩餘可退額', () => {
    const r = computeRefund({
        paidBalance: 100, paidBonus: 0,
        alreadyBalance: 40, alreadyBonus: 0
    });
    assert.equal(r.refundWant, 60);
    assert.equal(r.refundBalance, 60);
});

test('退款：超過可退額擲 REFUND_EXCEEDS_PAYMENT', () => {
    expectWalletError(() => computeRefund({
        paidBalance: 100, paidBonus: 0,
        alreadyBalance: 80, alreadyBonus: 0,
        want: 20.01
    }), 400, 'REFUND_EXCEEDS_PAYMENT');
});

test('退款：已全額退款擲 REFUND_ALREADY_COMPLETE', () => {
    expectWalletError(() => computeRefund({
        paidBalance: 100, paidBonus: 0,
        alreadyBalance: 100, alreadyBonus: 0
    }), 400, 'REFUND_ALREADY_COMPLETE');
});

test('退款：負數金額擲 INVALID_AMOUNT', () => {
    expectWalletError(() => computeRefund({
        paidBalance: 100, paidBonus: 0,
        alreadyBalance: 0, alreadyBonus: 0,
        want: -1
    }), 400, 'INVALID_AMOUNT');
});

// ── resolveIdempotentReplay：冪等重放 ──

test('冪等：無記錄視為未命中', () => {
    assert.deepEqual(resolveIdempotentReplay(null, 'fp1'), { hit: false });
    assert.deepEqual(resolveIdempotentReplay({}, 'fp1'), { hit: false });
});

test('冪等：指紋一致時回傳首次結果', () => {
    const stored = {
        result: { stringValue: JSON.stringify({ ok: true, chargedAmount: 100 }) },
        fingerprint: { stringValue: 'fp1' }
    };
    const r = resolveIdempotentReplay(stored, 'fp1');
    assert.equal(r.hit, true);
    assert.equal(r.result.chargedAmount, 100);
});

test('冪等：同鍵不同參數（指紋不符）擲 409', () => {
    const stored = {
        result: { stringValue: JSON.stringify({ ok: true }) },
        fingerprint: { stringValue: 'fp1' }
    };
    expectWalletError(() => resolveIdempotentReplay(stored, 'fp2'),
        409, 'IDEMPOTENCY_KEY_CONFLICT');
});

test('冪等：舊記錄無指紋欄位時寬鬆放行（不相撞 409）', () => {
    const stored = { result: { stringValue: JSON.stringify({ ok: true }) } };
    const r = resolveIdempotentReplay(stored, 'fp-new');
    assert.equal(r.hit, true);
    assert.equal(r.result.ok, true);

    // 本次請求未啟用指紋比對亦放行
    const r2 = resolveIdempotentReplay({
        result: { stringValue: '{}' },
        fingerprint: { stringValue: 'fp1' }
    }, '');
    assert.equal(r2.hit, true);
});

test('冪等：結果 JSON 毀損時回兜底結果而非崩潰', () => {
    const stored = {
        result: { stringValue: 'not-json{' },
        fingerprint: { stringValue: 'fp1' }
    };
    const r = resolveIdempotentReplay(stored, 'fp1');
    assert.equal(r.hit, true);
    assert.deepEqual(r.result, { ok: true, idempotent: true });
});
