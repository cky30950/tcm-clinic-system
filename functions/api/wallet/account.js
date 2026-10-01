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
        // 可選筆數限制（病人詳情面板只需最近 10 筆）；預設 50，上限 50
        const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '', 10);
        const txLimit = Number.isFinite(parsedLimit)
            ? Math.min(50, Math.max(1, parsedLimit))
            : 50;
        const account = await client.getDocument(
            `patientWalletAccounts/${
                encodeURIComponent(walletAccountDocId(clinicId, patientId))}`
        );

        // 慣用路徑：以 (patientId, clinicId, at DESC) 複合索引在伺服器端
        // 過濾診所並直接 limit，每次只讀 txLimit 筆（舊路徑固定讀 300 筆
        // 再客戶端過濾，跨診所病人會放大 6-30 倍讀取）。
        const queryTxPage = async (limit) => client.queryCollection({
            collectionId: 'patientWalletTransactions',
            where: {
                compositeFilter: {
                    op: 'AND',
                    filters: [
                        {
                            fieldFilter: {
                                field: { fieldPath: 'patientId' },
                                op: 'EQUAL',
                                value: { stringValue: patientId }
                            }
                        },
                        {
                            fieldFilter: {
                                field: { fieldPath: 'clinicId' },
                                op: 'EQUAL',
                                value: { stringValue: String(clinicId) }
                            }
                        }
                    ]
                }
            },
            orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }],
            limit
        });

        let txDocs = null;
        try {
            const txRes = await queryTxPage(txLimit);
            txDocs = txRes.docs;
        } catch (error) {
            // 主路徑只是讀取優化，任何失敗都不應令錢包畫面故障：
            // 一律退回舊路徑（讀最近 300 筆再客戶端過濾，即本次優化前嘅行為）。
            // 常見原因是複合索引尚未部署（firestore.indexes.json 需 deploy 或於
            // Console 建立），Firestore 回 FAILED_PRECONDITION；索引建立空窗期就靠此 fallback。
            const firestoreStatus = String((error && error.firestoreStatus) || '').toUpperCase();
            const msg = String((error && error.message) || error).toLowerCase();
            const missingIndex = firestoreStatus === 'FAILED_PRECONDITION'
                || msg.includes('index')
                || msg.includes('failed_precondition');
            if (missingIndex) {
                console.warn('錢包流水複合索引未就緒，暫用舊查詢路徑（300 筆客戶端過濾）');
            } else {
                // 非缺索引錯誤（例如查詢結構問題）也要在日志留下完整證據，方便修正
                console.warn('錢包流水複合查詢發生非預期錯誤，暫用舊查詢路徑:', error);
            }
            const fallbackRes = await client.queryCollection({
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
            txDocs = (fallbackRes.docs || []).filter((tx) => {
                const d = tx && tx.data;
                return d && String(d.clinicId || '') === String(clinicId);
            }).slice(0, txLimit);
        }

        // 防衛性過濾（正常路徑伺服器已過濾，保留下來成本為零）
        const transactions = (txDocs || [])
            .map((d) => Object.assign({ id: d.id }, d.data))
            .filter((tx) => tx && String(tx.clinicId || '') === String(clinicId))
            .slice(0, txLimit);

        return jsonResponse({
            clinicId,
            account: account ? account.data : null,
            transactions
        });
    } catch (error) {
        return toErrorResponse(error);
    }
}
