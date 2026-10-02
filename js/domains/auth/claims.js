/* ============================================================
 * auth/claims.js — Auth claims／帳號索引：後端 admin API 封裝、Auth 帳號生命週期、授權索引同步
 * ------------------------------------------------------------
 * Phase 3 自 system.js 原樣遷入，邏輯零改動；舊全域存取一律經 G。
 * ============================================================ */
import { G } from '../../lib/legacy.js';

const USER_AUTH_INDEX_COLLECTION = 'userAuthIndex';

export async function getAuthorizedUserFromIndex(uid) {
    if (!uid) return null;

    await G.waitForFirebaseDb();

    if (!(window.firebase && window.firebase.getDoc && window.firebase.doc)) {
        return null;
    }

    const indexRef = window.firebase.doc(window.firebase.db, USER_AUTH_INDEX_COLLECTION, String(uid));
    const indexSnap = await window.firebase.getDoc(indexRef);
    if (!indexSnap || !indexSnap.exists()) {
        return null;
    }

    const indexData = indexSnap.data() || {};
    const userId = indexData.userId || indexData.legacyUserId || indexData.id || '';
    if (!userId) {
        return null;
    }

    const userRef = window.firebase.doc(window.firebase.db, 'users', String(userId));
    const userSnap = await window.firebase.getDoc(userRef);
    if (!userSnap || !userSnap.exists()) {
        return null;
    }

    return { id: userSnap.id, ...userSnap.data() };
}

export async function upsertAuthorizedUserIndex(userRecord, uidOverride = '') {
    const uid = uidOverride || (userRecord && userRecord.uid) || '';
    const userId = userRecord && userRecord.id ? String(userRecord.id) : '';

    if (!uid || !userId) return false;

    await G.waitForFirebaseDb();

    if (!(window.firebase && window.firebase.setDoc && window.firebase.doc)) {
        return false;
    }

    const indexRef = window.firebase.doc(window.firebase.db, USER_AUTH_INDEX_COLLECTION, String(uid));
    await window.firebase.setDoc(indexRef, {
        uid: String(uid),
        userId: userId,
        email: userRecord && userRecord.email ? String(userRecord.email).trim() : '',
        active: userRecord ? userRecord.active !== false : true,
        clinicId: userRecord && userRecord.clinicId ? userRecord.clinicId : '',
        username: userRecord && userRecord.username ? userRecord.username : '',
        name: userRecord && userRecord.name ? userRecord.name : '',
        updatedAt: new Date()
    }, { merge: true });

    return true;
}

export async function removeAuthorizedUserIndex(uid) {
    if (!uid) return false;

    await G.waitForFirebaseDb();

    if (!(window.firebase && window.firebase.deleteDoc && window.firebase.doc)) {
        return false;
    }

    const indexRef = window.firebase.doc(window.firebase.db, USER_AUTH_INDEX_COLLECTION, String(uid));
    await window.firebase.deleteDoc(indexRef);
    return true;
}

/* ============================================================
 * Custom Claims 同步（經 Cloudflare Pages Function 以 Service Account 寫入）
 * ------------------------------------------------------------
 * users 文件是授權事實來源；新增/編輯/啟用/停用/刪除用戶後，
 * 由下列函式通知後端把身份同步到 Firebase Auth custom claims 與
 * userAuthIndex 索引。客戶端無權直接寫這兩處（見 firestore.rules）。
 * ============================================================ */

export async function callAdminClaimsApi(path, payload) {
    await G.waitForFirebase();
    const fbUser = window.firebase.auth && window.firebase.auth.currentUser;
    if (!fbUser) throw new Error('未登入，無法同步用戶授權');
    // 強制刷新，確保管理員自身的 admin claims 為最新（例如 bootstrap 後）
    const token = await fbUser.getIdToken(true);
    const res = await fetch('/api/admin/' + path, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
    });
    let data = null;
    try { data = await res.json(); } catch (_e) {}
    if (!res.ok) {
        // 後端錯誤訊息理應是字串；物件型態時先序列化，避免出現 Error: [object Object]
        let message = data && data.message;
        if (message && typeof message === 'object') {
            try { message = JSON.stringify(message); } catch (_e2) { message = ''; }
        }
        message = message ? String(message) : '';
        // 附上 Google 上游原始錯誤（EMAIL_EXISTS／權限不足等），方便診斷
        const upstream = data && data.upstreamMessage ? String(data.upstreamMessage) : '';
        if (upstream && message.indexOf(upstream) === -1) {
            message = message ? (message + '（' + upstream + '）') : upstream;
        }
        throw new Error(message || ('HTTP ' + res.status));
    }
    return data || {};
}

// 由後端以 SA 建立 Auth 帳號（避免 createUserWithEmailAndPassword 搶走管理員工作階段）
export async function createStaffAuthAccount({ email, password, displayName }) {
    const data = await callAdminClaimsApi('accounts/create', { email, password, displayName });
    if (!data || !data.uid) throw new Error('建立帳號時伺服器未回傳 uid');
    return data;
}

// users 文件變更後同步 claims；forceRevoke 用於停用（即時撤銷 refresh token）
export async function syncStaffClaims(user, options) {
    const uid = user && user.uid ? String(user.uid) : '';
    const userId = user && user.id ? String(user.id) : '';
    if (!uid || !userId) {
        console.warn('同步 claims 跳過：缺少 uid/userId', user);
        return { ok: false, skipped: true };
    }
    const forceRevoke = !!(options && options.forceRevoke);
    return callAdminClaimsApi('claims/sync', { targetUid: uid, userId, forceRevoke });
}

// 刪除用戶後，一併移除授權索引並刪除 Auth 帳號
export async function deleteStaffAuthAccount(uid) {
    if (!uid) return { ok: false, skipped: true };
    return callAdminClaimsApi('claims/delete', { targetUid: String(uid) });
}

// 封存（離職）／復職：停用或重新啟用 Auth 帳號（帳號保留，不作硬刪除）
// 管理員傳入目標 uid/userId；員工自我封存時 uid 為本人，後端會自行解析 userId
export async function archiveStaffAuthAccount(uid, userId, archived, reason = '') {
    if (!uid) return { ok: false, skipped: true };
    return callAdminClaimsApi('claims/archive', {
        targetUid: String(uid),
        userId: userId ? String(userId) : '',
        archived: archived !== false,
        reason: reason || ''
    });
}

// 一次性批量同步所有現有用戶（首次部署/修復用）；回傳 {synced, orphaned, ...}
export async function bootstrapAllUserClaims() {
    return callAdminClaimsApi('claims/bootstrap', {});
}
window.adminClaimsBootstrap = bootstrapAllUserClaims;

export async function fetchLegacyAuthorizedUserByUidOrEmail(uid, email) {
    await G.waitForFirebaseDb();
    const colRef = window.firebase.collection(window.firebase.db, 'users');

    if (uid) {
        const q1 = window.firebase.firestoreQuery(
            colRef,
            window.firebase.where('uid', '==', uid),
            window.firebase.limit(1)
        );
        const snap1 = await window.firebase.getDocs(q1);
        if (snap1 && !snap1.empty) {
            const docSnap = snap1.docs[0];
            return { id: docSnap.id, ...docSnap.data() };
        }
    }

    if (email) {
        const q2 = window.firebase.firestoreQuery(
            colRef,
            window.firebase.where('email', '==', email),
            window.firebase.limit(1)
        );
        const snap2 = await window.firebase.getDocs(q2);
        if (snap2 && !snap2.empty) {
            const docSnap = snap2.docs[0];
            return { id: docSnap.id, ...docSnap.data() };
        }
    }

    return null;
}

// 登入時查詢 users／userAuthIndex 的暫時性錯誤代碼。
// 注意：permission-denied 不在此列——依 firestore.rules，users 集合僅活躍
// 員工可讀，未授權帳號查詢本來就會被規則拒絕，屬於「確定性拒絕」，
// 應照原流程視為未授權；網路/逾時/實例已終止等才需要讓使用者重試。
const TRANSIENT_USER_LOOKUP_CODES = new Set([
    'unavailable',          // 網路中斷或服務暫時不可用
    'deadline-exceeded',    // 要求逾時
    'unauthenticated',      // 工作階段中途失效
    'resource-exhausted',   // 配額/流量暫時用盡
    'cancelled',            // 要求被取消（例如切換分頁）
    'internal',             // 伺服器暫時性內部錯誤
    'failed-precondition'   // Firestore 實例已被 terminate（未登入守衛清掃中）
]);
function isTransientUserLookupError(error) {
    const code = error && error.code ? String(error.code) : '';
    return TRANSIENT_USER_LOOKUP_CODES.has(code);
}

export async function fetchAuthorizedUserByUidOrEmail(uid, email) {
    try {
        if (uid) {
            const indexedUser = await getAuthorizedUserFromIndex(uid);
            if (indexedUser) {
                return indexedUser;
            }
        }

        const legacyUser = await fetchLegacyAuthorizedUserByUidOrEmail(uid, email);
        if (!legacyUser) {
            return null;
        }

        let hydratedUser = legacyUser;

        if (uid && (!legacyUser.uid || legacyUser.uid !== uid)) {
            try {
                await window.firebase.updateDoc(
                    window.firebase.doc(window.firebase.db, 'users', String(legacyUser.id)),
                    {
                        uid: uid,
                        updatedAt: new Date(),
                        updatedBy: G.currentUser || 'system'
                    }
                );
                hydratedUser = { ...legacyUser, uid: uid };
            } catch (syncErr) {
                console.warn('補寫授權用戶 UID 失敗:', syncErr);
            }
        }

        if (uid) {
            try {
                await upsertAuthorizedUserIndex(hydratedUser, uid);
            } catch (indexErr) {
                console.warn('建立授權用戶索引失敗:', indexErr);
            }
        }

        return hydratedUser;
    } catch (error) {
        console.error('查詢授權用戶資料失敗:', error);
        // 暫時性錯誤（網路／逾時／Firestore 重整中）向上拋，由登入流程提示重試；
        // 只有規則面的確定性拒絕（permission-denied＝查無授權）才回 null。
        if (isTransientUserLookupError(error)) throw error;
        return null;
    }
}
