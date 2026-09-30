/* ============================================================
 * VideoPresence — 視訊診間「雙方就緒」信號（Realtime Database）
 * ------------------------------------------------------------
 * 目的：Agora 計費從用戶加入頻道即開始（即使只有單人在頻道內，
 * 亦按音頻分鐘計費）。因此雙方在真正加入 Agora 頻道前，先在
 * RTDB 完成就緒廣播，確認對方也在線後才進入頻道。
 *
 * 兩階段信號（雙方等待期間皆不進頻道、完全不計費）：
 *   1) 就緒：{ at, sid, joined:false } — 頁面已開啟、設備已備妥
 *      （病人端在發送就緒信號前會先通過鏡頭／麥克風授權探測）
 *   2) 已加入：雙方就緒後，由「醫師」先 client.join，成功後呼叫
 *      markJoined()，自己的節點改寫 joined:true；病人端以
 *      requirePeerJoined 等待此信號，確認醫師真的已在 Agora 頻道內
 *      才加入。故醫師不來病人可無限免費等，反之亦然；
 *      任一方單獨在頻道的時間僅最後接通的 1~2 秒。
 *
 * 機制（RTDB onDisconnect 經典 presence 模式）：
 *   - 雙方各寫自己的節點（不互相覆寫）：
 *       videoPresence/<頻道名稱>/doctor  = { at, sid, joined }
 *       videoPresence/<頻道名稱>/patient = { at, sid, joined }
 *   - 寫入後立即註冊 onDisconnect().remove()：關分頁、當機、網路
 *     斷掉時由 RTDB 伺服器自動清除節點，因此「節點存在＝在線」，
 *     完全不需要心跳（舊版 Firestore 實作每 5 秒心跳一次，通話中
 *     每人每分鐘 12 次寫入；本實作等待期只寫 1 次、通話中 0 次）。
 *   - 監聽 .info/connected：網路閃斷後 RTDB 自動重連時，重新
 *     註冊 onDisconnect 並重寫自己的節點。
 *   - ready 後取消監聽（雙方皆已進入 Agora，節點僅保留給 onDisconnect
 *     做斷線清理）；leave 時主動 remove 自己的節點。
 *
 * 安全規則（必須在 Firebase Console → Realtime Database → 規則，
 * 合併進「現有」規則樹；病人端無登入，不可要求 auth。RTDB 規則只會
 * 向下加權、無法收緊，故此分支為純增量，不影響既有規則）：
 *   "videoPresence": {
 *     "$channelId": {
 *       ".read": "$channelId.matches(/^tcm-consult-[0-9A-Za-z_-]{1,64}$/)",
 *       "$role": {
 *         ".write": "$channelId.matches(/^tcm-consult-[0-9A-Za-z_-]{1,64}$/)
 *                    && ($role === 'doctor' || $role === 'patient')",
 *         ".validate": "newData.hasChildren(['at','sid','joined'])
 *                       && newData.child('at').isNumber()
 *                       && newData.child('sid').isString()
 *                       && newData.child('joined').isBoolean()"
 *       }
 *     }
 *   }
 *   （serverTimestamp 在規則驗證時已解析為 number；delete／onDisconnect
 *   移除不觸發 .validate。）
 *
 * Firestore 相容橋接（過渡期，確認所有客戶端皆已部署新版後可移除）：
 *   舊版客戶端（快取未更新的 system.html／room.html）只讀寫 Firestore
 *   videoPresence/<頻道>。橋接開啟期間，新版同時：
 *     - 監聽舊 Firestore 文件作為備援就緒來源；
 *     - 等待期每 10 秒鏡像一次心跳到 Firestore（ready 後立即停止，
 *       故通話中不再有 Firestore 寫入），markJoined/leave 各鏡像一次。
 *   移除方式：刪除 FIRESTORE_COMPAT 相關程式區塊，並可一併移除
 *   firestore.rules 內的 videoPresence 規則。
 *
 * 用法：
 *   // 醫師：等病人就緒即先加入，再 markJoined
 *   var p = VideoPresence.waitPeer('doctor', channel);
 *   p.ready.then(function () { return call.join(); })
 *          .then(function () { p.markJoined(); })
 *          .catch(function (err) { 信號不可用時，退回直接加入; });
 *   // 病人：等醫師 joined 才加入（不設 timeoutMs 即無限免費等待）
 *   var p2 = VideoPresence.waitPeer('patient', channel, { requirePeerJoined: true });
 *   p2.ready.then(function () { call.join(); });
 *   // 離開時：p.leave();
 * ============================================================ */

(function () {
    'use strict';

    var PATH_ROOT = 'videoPresence';

    // ── Firestore 相容橋接（過渡期後整段移除）──
    var FIRESTORE_COMPAT_ENABLED = true;
    var FIRESTORE_VERSION = '12.15.0';
    var FIRESTORE_MODULE_URL =
        'https://www.gstatic.com/firebasejs/' + FIRESTORE_VERSION + '/firebase-firestore.js';
    var FS_BRIDGE_HEARTBEAT_MS = 10000; // 僅等待期；ready 後停止
    var FS_FRESH_MS = 20000;            // 舊版客戶端心跳新鮮度門檻

    function getFirebase() {
        return (typeof window !== 'undefined' && window.firebase) ? window.firebase : null;
    }

    function peerRoleOf(role) {
        return role === 'doctor' ? 'patient' : 'doctor';
    }

    // 將 Firestore Timestamp 轉毫秒；無效值（含 serverTimestamp 尚未解析的 null）回 null
    function tsMillis(value) {
        return (value && typeof value.toMillis === 'function') ? value.toMillis() : null;
    }

    /**
     * 廣播自己就緒，並等待對方就緒。
     * @param {string} role 'doctor' | 'patient'
     * @param {string} channel 完整 Agora 頻道名稱（僅含 tcm-consult- 前綴＋數字）
     * @param {object} [opts]
     *   - timeoutMs：超時毫秒（逾時 reject PRESENCE_TIMEOUT）；0／不設為無限等待
     *   - requirePeerJoined：true 時除了對方在線，還必須對方 joined===true
     *     （表示對方已成功 join Agora）才 resolve（病人端使用）
     * @returns {{ready: Promise, leave: Function, markJoined: Function}}
     */
    function waitPeer(role, channel, opts) {
        opts = opts || {};
        var peerRole = peerRoleOf(role);
        var requirePeerJoined = !!opts.requirePeerJoined;
        // 過渡相容：對方在線但遲遲沒有 joined（舊版客戶端快取），
        // 寬限到期後仍放行（退回舊版同步加入行為）
        var joinedGraceMs = typeof opts.requirePeerJoinedGraceMs === 'number'
            ? opts.requirePeerJoinedGraceMs : 30000;

        var settled = false;
        var joinedFlag = false; // 自己是否已成功加入 Agora（markJoined 後為 true）
        var watchdogTimer = null;
        var graceTimer = null;
        var connectTimer = null;
        var rtdb = null;
        var channelRef = null;
        var ownRef = null;
        var connectedRef = null;
        var channelHandler = null;
        var connectedHandler = null;
        var sid = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

        // Firestore 橋接狀態
        var fsDocRef = null;
        var fsUnsubscribe = null;
        var fsServerTimestampFn = null;
        var fsHeartbeatTimer = null;
        var fsBridgeStarted = false;
        var lastOwnFsServerTs = null;

        // RTDB 首次連線逾時：連得上時 .info/connected 幾乎秒回 true；
        // 超過此時間仍未連上（服務故障／規則設定錯誤），比照舊版首次
        // 寫入失敗處理，讓呼叫端退回直接加入，而非永久卡在等待頁
        var CONNECT_GRACE_MS = 15000;

        function clearTimers() {
            if (watchdogTimer) {
                clearTimeout(watchdogTimer);
                watchdogTimer = null;
            }
            if (graceTimer) {
                clearTimeout(graceTimer);
                graceTimer = null;
            }
            if (connectTimer) {
                clearTimeout(connectTimer);
                connectTimer = null;
            }
            if (fsHeartbeatTimer) {
                clearInterval(fsHeartbeatTimer);
                fsHeartbeatTimer = null;
            }
        }

        function detachRtdb() {
            var fb = getFirebase();
            if (fb && typeof fb.off === 'function') {
                if (channelRef && channelHandler) {
                    try { fb.off(channelRef, 'value', channelHandler); } catch (e) { /* ignore */ }
                }
                if (connectedRef && connectedHandler) {
                    try { fb.off(connectedRef, 'value', connectedHandler); } catch (e) { /* ignore */ }
                }
            }
            channelHandler = null;
            connectedHandler = null;
        }

        function stop() {
            clearTimers();
            detachRtdb();
            if (fsUnsubscribe) {
                try { fsUnsubscribe(); } catch (e) { /* ignore */ }
                fsUnsubscribe = null;
            }
        }

        function ownPayload(fb, joined) {
            return { at: fb.serverTimestamp(), sid: sid, joined: !!joined };
        }

        // ── Firestore 相容橋接（過渡期後整段移除）──
        // 鏡像寫入自己的舊版文件欄位（merge，不碰對端欄位）
        function mirrorFirestore(joined) {
            var fb = getFirebase();
            if (!FIRESTORE_COMPAT_ENABLED || !fsDocRef || !fsServerTimestampFn || !fb) return;
            var data = {};
            data[role] = { at: fsServerTimestampFn(), sid: sid, joined: !!joined };
            fb.setDoc(fsDocRef, data, { merge: true }).catch(function (err) {
                console.warn('[VideoPresence] Firestore 鏡像寫入失敗:', err);
            });
        }

        // markJoined 可能早於橋接就緒：已就緒則立即鏡像一次，
        // 否則等待期心跳下一輪也會帶 joinedFlag
        function mirrorFirestoreJoined() {
            if (fsDocRef && fsServerTimestampFn) mirrorFirestore(true);
        }

        // 啟動橋接：定時鏡像（僅等待期）＋監聽舊版文件作為備援就緒來源。
        // onPeer(peerData)：舊版對端心跳新鮮時回調；任何失敗皆不影響 RTDB 主流程。
        function setupFirestoreBridge(onPeer) {
            if (!FIRESTORE_COMPAT_ENABLED || fsBridgeStarted) return;
            fsBridgeStarted = true;
            var fb = getFirebase();
            if (!fb || !fb.db || typeof fb.doc !== 'function'
                || typeof fb.setDoc !== 'function'
                || typeof fb.onSnapshot !== 'function') {
                return;
            }
            import(FIRESTORE_MODULE_URL).then(function (mod) {
                if (settled) return;
                fsServerTimestampFn = mod.serverTimestamp;
                fsDocRef = fb.doc(fb.db, 'videoPresence', String(channel));

                fsHeartbeatTimer = setInterval(function () {
                    if (settled) return;
                    mirrorFirestore(joinedFlag);
                }, FS_BRIDGE_HEARTBEAT_MS);
                mirrorFirestore(false);

                fsUnsubscribe = fb.onSnapshot(
                    fsDocRef,
                    function (snapshot) {
                        if (settled) return;
                        var data = snapshot && typeof snapshot.data === 'function'
                            ? snapshot.data() : null;
                        if (!data) return;
                        var own = data[role] || null;
                        var peer = data[peerRole] || null;
                        var ownTs = tsMillis(own ? own.at : null);
                        var peerTs = tsMillis(peer ? peer.at : null);
                        if (ownTs !== null) lastOwnFsServerTs = ownTs;
                        // 舊版對端持續心跳：其伺服器時間需與自己接近
                        if (peerTs === null || lastOwnFsServerTs === null
                            || peerTs < lastOwnFsServerTs - FS_FRESH_MS) {
                            return;
                        }
                        onPeer(peer || {});
                    },
                    function (err) {
                        console.warn('[VideoPresence] Firestore 橋接監聽失敗:', err);
                    }
                );
            }).catch(function (err) {
                console.warn('[VideoPresence] Firestore 橋接無法使用:', err);
            });
        }

        // 自己已成功加入 Agora 頻道：立刻把 joined:true 寫出，
        // 之後重連重寫也維持 joined:true，直到 leave
        function markJoined() {
            joinedFlag = true;
            var fb = getFirebase();
            if (ownRef && fb && typeof fb.update === 'function') {
                // 只更新 joined，保留 at/sid（at 代表本次上線時間）
                fb.update(ownRef, { joined: true }).catch(function (err) {
                    console.warn('[VideoPresence] joined 信號寫入失敗:', err);
                });
            }
            mirrorFirestoreJoined();
        }

        var ready = new Promise(function (resolve, reject) {
            var fb = getFirebase();
            if (!fb || !fb.rtdb || typeof fb.ref !== 'function'
                || typeof fb.set !== 'function' || typeof fb.onValue !== 'function'
                || typeof fb.onDisconnect !== 'function'
                || typeof fb.serverTimestamp === 'undefined') {
                reject(new Error('FIREBASE_UNAVAILABLE'));
                return;
            }
            rtdb = fb.rtdb;

            // 條件來源可能是 RTDB（新版對端）或 Firestore 橋接（舊版對端），
            // 統一由此判斷是否放行
            function acceptPeer(peer) {
                if (settled || !peer) return;
                if (!requirePeerJoined || peer.joined === true) {
                    succeed();
                } else {
                    armJoinedGraceOnce();
                }
            }

            function armJoinedGraceOnce() {
                if (graceTimer || !joinedGraceMs || joinedGraceMs <= 0) return;
                graceTimer = setTimeout(function () {
                    graceTimer = null;
                    // 對方是舊版客戶端（不會寫 joined）：寬限後放行
                    console.warn('[VideoPresence] 未收到對方 joined 信號，以相容模式放行');
                    succeed();
                }, joinedGraceMs);
            }

            function succeed() {
                if (settled) return;
                settled = true;
                // 條件達成：取消監聽、逾時與橋接心跳。
                // RTDB 節點保留（onDisconnect 仍會在斷線時自動清除），
                // 自己的 joined 狀態也留給稍遲加入的對端核對。
                if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
                if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
                if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
                detachRtdb();
                if (fsUnsubscribe) {
                    try { fsUnsubscribe(); } catch (e) { /* ignore */ }
                    fsUnsubscribe = null;
                }
                if (fsHeartbeatTimer) {
                    clearInterval(fsHeartbeatTimer);
                    fsHeartbeatTimer = null;
                }
                resolve();
            }

            function fail(err) {
                if (settled) return;
                settled = true;
                stop();
                // 主動清除自己的節點，避免對端對著空殼等待；
                // 網路已斷時此 remove 可能失敗，onDisconnect 會補位
                var f = getFirebase();
                if (ownRef && f && typeof f.remove === 'function') {
                    f.remove(ownRef).catch(function () { /* ignore */ });
                }
                reject(err || new Error('PRESENCE_FAILED'));
            }

            try {
                if (opts.timeoutMs && opts.timeoutMs > 0) {
                    watchdogTimer = setTimeout(function () {
                        var err = new Error('PRESENCE_TIMEOUT');
                        err.code = 'PRESENCE_TIMEOUT';
                        fail(err);
                    }, opts.timeoutMs);
                }

                channelRef = fb.ref(rtdb, PATH_ROOT + '/' + String(channel));
                ownRef = fb.ref(rtdb, PATH_ROOT + '/' + String(channel) + '/' + role);
                connectedRef = fb.ref(rtdb, '.info/connected');

                // 首次連線寬限計時：成功收到 connected=true 即解除
                connectTimer = setTimeout(function () {
                    connectTimer = null;
                    var err = new Error('PRESENCE_CONNECT_TIMEOUT');
                    err.code = 'PRESENCE_CONNECT_TIMEOUT';
                    fail(err);
                }, CONNECT_GRACE_MS);

                // 監聽整個頻道節點：對端節點存在即在線（onDisconnect 保證清除）
                channelHandler = fb.onValue(
                    channelRef,
                    function (snap) {
                        if (settled) return;
                        var val = snap && typeof snap.val === 'function' ? snap.val() : null;
                        var peer = val ? val[peerRole] : null;
                        if (!peer) return;
                        acceptPeer(peer);
                    },
                    function (err) {
                        // 權限不足或網路錯誤等：無法使用信號服務，交由呼叫方退回
                        console.warn('[VideoPresence] 就緒狀態監聽失敗:', err);
                        fail(err);
                    }
                );

                // 經典 presence 寫法：每次（重新）連線成功時先註冊
                // onDisconnect，再寫自己的節點
                connectedHandler = fb.onValue(connectedRef, function (snap) {
                    if (snap.val() !== true) return;
                    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
                    fb.onDisconnect(ownRef).remove().then(function () {
                        return fb.set(ownRef, ownPayload(fb, joinedFlag));
                    }).then(function () {
                        // 首次成功上線後再啟動 Firestore 橋接（純備援，失敗不影響主流程）
                        setupFirestoreBridge(acceptPeer);
                    }).catch(function (err) {
                        console.warn('[VideoPresence] 就緒廣播失敗:', err);
                        fail(err);
                    });
                }, function (err) {
                    console.warn('[VideoPresence] 連線狀態監聽失敗:', err);
                    fail(err);
                });
            } catch (err) {
                console.warn('[VideoPresence] 啟動失敗:', err);
                fail(err);
            }
        });

        // 離開／掛斷：停止監聽，並移除自己的 RTDB 節點；
        // onDisconnect 保留註冊（若主動 remove 時網路已斷，由它補位）
        function leave() {
            stop();
            joinedFlag = false;
            var fb = getFirebase();
            if (ownRef && fb && typeof fb.remove === 'function') {
                fb.remove(ownRef).catch(function () { /* ignore */ });
            }
            // Firestore 橋接：留下失效標記供舊版客戶端立即判讀
            if (FIRESTORE_COMPAT_ENABLED && fb && fb.db
                && typeof fb.doc === 'function' && typeof fb.setDoc === 'function') {
                try {
                    var docRef = fb.doc(fb.db, 'videoPresence', String(channel));
                    var data = {};
                    data[role] = { at: 0, joined: false };
                    fb.setDoc(docRef, data, { merge: true }).catch(function () { /* ignore */ });
                } catch (e) { /* ignore */ }
            }
        }

        return { ready: ready, leave: leave, markJoined: markJoined };
    }

    window.VideoPresence = { waitPeer: waitPeer };
})();
