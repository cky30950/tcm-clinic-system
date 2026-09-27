/* ============================================================
 * GET /api/wallet/account?patientId=xxx
 * ------------------------------------------------------------
 * 員工查詢病人儲值帳戶與最近 20 筆流水。
 * 員工端一般讀取仍走 SDK（可快取），此端點供跨裝置重新整理、
 * 管理場景使用。
 * ============================================================ */

import { getAccessToken } from '../backup/lib/google-auth.js';
import { FirestoreClient } from '../backup/lib/firestore.js';
import { walletAccountDocId } from './lib/wallet-store.js';
import {
    requireStaff,
    resolveClinicId,
    jsonResponse,
    optionsResponse,
    toErrorResponse
} from './lib/http.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        const claims = await requireStaff(request, env);
        const url = new URL(request.url);
        const patientId = String(url.searchParams.get('patientId') || '').trim();
        if (!/^[A-Za-z0-9_-]{10,40}$/.test(patientId)) {
            return jsonResponse({
                error: 'INVALID_PATIENT',
                message: '病人 ID 格式不正確'
            }, 400);
        }

        const auth = await getAccessToken(env);
        const client = new FirestoreClient(
            auth.token,
            auth.projectId,
            env.FIREBASE_RTDB_URL || ''
        );
        const clinicId = resolveClinicId(claims, url.searchParams);
        const account = await client.getDocument(
            `patientWalletAccounts/${
                encodeURIComponent(walletAccountDocId(clinicId, patientId))}`
        );
        const txRes = await client.queryCollection({
            collectionId: 'patientWalletTransactions',
            where: {
                fieldFilter: {
                    field: { fieldPath: 'patientId' },
                    op: 'EQUAL',
                    value: { stringValue: patientId }
                }
            },
            orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }],
            limit: 300
        });
        // 跨診所病人的最近 300 筆中可能混有大量他診流水，
        // 故取回較大筆數再於本診所內取最近 50 筆（不新增複合索引）。
        const transactions = txRes.docs
            .map((d) => Object.assign({ id: d.id }, d.data))
            .filter((tx) => tx && String(tx.clinicId || '') === String(clinicId))
            .slice(0, 50);

        return jsonResponse({
            clinicId,
            account: account ? account.data : null,
            transactions
        });
    } catch (error) {
        return toErrorResponse(error);
    }
}
