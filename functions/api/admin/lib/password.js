/* ============================================================
 * 員工帳號密碼強度政策（伺服器端權威把關）
 * ------------------------------------------------------------
 * 舊制僅要求 ≥6 位且無複雜度要求，容易被字典／填充攻擊。
 * 新政策：
 *   1. 長度至少 8 碼；
 *   2. 英文大寫、英文小寫、數字、特殊符號四類中至少符合 3 類；
 *   3. 前後空白不計入長度。
 * 前端 system.js 有相同規則作即時提示，但最終以此處驗證為準。
 * ============================================================ */

export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordStrength(rawPassword) {
    const password = String(rawPassword == null ? '' : rawPassword).trim();
    if (password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, reason: `密碼長度至少 ${MIN_PASSWORD_LENGTH} 碼` };
    }
    let categories = 0;
    if (/[a-z]/.test(password)) categories += 1;
    if (/[A-Z]/.test(password)) categories += 1;
    if (/[0-9]/.test(password)) categories += 1;
    if (/[^A-Za-z0-9]/.test(password)) categories += 1;
    if (categories < 3) {
        return {
            ok: false,
            reason: '密碼須包含英文大寫、英文小寫、數字、特殊符號其中至少 3 類'
        };
    }
    return { ok: true, password };
}
