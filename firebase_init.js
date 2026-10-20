
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  startAfter,
  getDoc,
  runTransaction,
  
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  
  writeBatch,
  FieldPath,
  FieldValue,
  Timestamp,
  documentId as firestoreDocumentId,
  increment as firestoreIncrement,
  serverTimestamp as firestoreServerTimestamp,
  onSnapshot,
  clearIndexedDbPersistence,
  terminate,
  sum,
  average,
  count,
  getAggregateFromServer
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { getDatabase, ref, set, get, update, remove, onValue, off,

        onChildAdded,
        onChildChanged,
        onChildRemoved,

        onDisconnect,
        push,
        serverTimestamp,
        
        query as rtdbQuery,
        orderByChild,
        startAt,
        endAt,
        
        limitToLast } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, signOut, setPersistence,
        browserSessionPersistence, browserLocalPersistence,
        createUserWithEmailAndPassword, updateProfile,
        
        updatePassword, deleteUser as firebaseDeleteUser, EmailAuthProvider, reauthenticateWithCredential,
        
        onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';


import firebaseConfig from './firebaseConfig.js?v=20261001b';

    const app = initializeApp(firebaseConfig);
    
    const db = initializeFirestore(app, {
      // 當網路環境（如部分路由器、ISP 或防火牆）對長時間 QUIC/HTTP3 WebChannel 連線產生 RTO 超時中斷時，
      // 自動偵測並無縫降級為標準 HTTP Long Polling，避免 Listen/channel ERR_QUIC_PROTOCOL_ERROR
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        // 設定 IndexedDB 緩存上限為 200MB（原 20MB），兼顧硬碟容量上限與高快取命中率，避免頻繁 LRU 淘洗
        cacheSizeBytes: 200 * 1024 * 1024,
        tabManager: persistentMultipleTabManager()
      })
    });

    // SDK 大版本升級時清除舊 IndexedDB 快取（格式可能不相容）
    try {
      const EXPECTED_SDK = '12.15.0';
      const savedSdk = localStorage.getItem('fs_sdk_version');
      if (savedSdk !== EXPECTED_SDK) {
        clearIndexedDbPersistence(db).catch(() => {});
        localStorage.setItem('fs_sdk_version', EXPECTED_SDK);
      }
    } catch (_v) {}

    
    const rtdb = getDatabase(app);
    const auth = getAuth(app);




setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error('設置帳號認證持久化模式失敗:', error);
});

    /* ============================================================
     * 備份追蹤：受管集合寫入時自動補上 Firestore 端 updatedAt
     * ------------------------------------------------------------
     * R2 增量備份以 updatedAt 判斷文件變更，時間一律採用 Firestore
     * 伺服器時間（serverTimestamp），不受客戶端時鐘飄移影響。
     * 涵蓋 patients / consultations / users / patientPackages /
     * patientPackageHistory / globalBillingItems / clinics /
     * clinicExpenses / consultationAuditLogs 及
     * clinics/{id}/billingItems；新增、更新、批次寫入都會蓋章，
     * 呼叫端若已明確提供 updatedAt 則保留原值。
     * ============================================================ */
    const BACKUP_TOP_COLLECTIONS = new Set([
      'patients', 'consultations', 'users',
      'patientPackages', 'patientPackageHistory', 'globalBillingItems',
      'clinics', 'clinicExpenses', 'consultationAuditLogs',
      'patientAttachments',
      'patientWalletAccounts', 'patientWalletTransactions'
    ]);

    function isBackupTrackedRef(reference) {
      if (!reference || typeof reference.path !== 'string') return false;
      const parts = reference.path.split('/');
      if (parts.length === 2) return BACKUP_TOP_COLLECTIONS.has(parts[0]);
      if (parts.length === 4) return parts[0] === 'clinics' && parts[2] === 'billingItems';
      return false;
    }

    function getTombstoneInfo(reference) {
      if (!reference || typeof reference.path !== 'string') return null;
      const parts = reference.path.split('/');
      if (parts.length === 2 && BACKUP_TOP_COLLECTIONS.has(parts[0])) {
        return { sourceKey: parts[0], docId: parts[1] };
      }
      if (parts.length === 4 && parts[0] === 'clinics' && parts[2] === 'billingItems') {
        return { sourceKey: "clinics__" + parts[1] + "__billingItems", docId: parts[3] };
      }
      return null;
    }

    function withUpdatedAt(data) {
      if (data && typeof data === 'object' && !Array.isArray(data) && data.updatedAt === undefined) {
        return Object.assign({}, data, { updatedAt: firestoreServerTimestamp() });
      }
      return data;
    }

    const trackedAddDoc = function (reference, data) {
      return addDoc(reference, isBackupTrackedRef(reference) ? withUpdatedAt(data) : data);
    };
    const trackedSetDoc = function (reference, data, options) {
      const finalData = isBackupTrackedRef(reference) ? withUpdatedAt(data) : data;
      return arguments.length >= 3 ? setDoc(reference, finalData, options) : setDoc(reference, finalData);
    };
    const trackedUpdateDoc = function (reference, data) {
      const finalData = isBackupTrackedRef(reference) && data && data.updatedAt === undefined
        ? Object.assign({}, data, { updatedAt: firestoreServerTimestamp() })
        : data;
      return updateDoc(reference, finalData);
    };
    const trackedDeleteDoc = async function (reference) {
      const tomb = getTombstoneInfo(reference);
      if (tomb) {
        try {
          await addDoc(collection(db, 'deletionTombstones'), {
            sourceKey: tomb.sourceKey,
            docId: tomb.docId,
            deletedAt: firestoreServerTimestamp()
          });
        } catch (tErr) {
          console.warn('[backup tombstone] 記錄刪除墓碑失敗:', tErr);
        }
      }
      return deleteDoc(reference);
    };
    const trackedWriteBatch = function (firestoreDb) {
      const batch = writeBatch(firestoreDb);
      const rawSet = batch.set.bind(batch);
      const rawUpdate = batch.update.bind(batch);
      const rawDelete = batch.delete.bind(batch);
      batch.set = function (reference, data, options) {
        const finalData = isBackupTrackedRef(reference) ? withUpdatedAt(data) : data;
        return arguments.length >= 3 ? rawSet(reference, finalData, options) : rawSet(reference, finalData);
      };
      batch.update = function (reference, data) {
        const finalData = isBackupTrackedRef(reference) && data && data.updatedAt === undefined
          ? Object.assign({}, data, { updatedAt: firestoreServerTimestamp() })
          : data;
        return rawUpdate(reference, finalData);
      };
      batch.delete = function (reference) {
        const tomb = getTombstoneInfo(reference);
        if (tomb) {
          try {
            const tombDoc = doc(collection(firestoreDb, 'deletionTombstones'));
            rawSet(tombDoc, {
              sourceKey: tomb.sourceKey,
              docId: tomb.docId,
              deletedAt: firestoreServerTimestamp()
            });
          } catch (tErr) {
            console.warn('[backup tombstone] 批次記錄刪除墓碑失敗:', tErr);
          }
        }
        return rawDelete(reference);
      };
      return batch;
    };


    
    
    window.firebase = {
        
        app,
        db,
        rtdb,
        auth,
        
        collection,
        addDoc: trackedAddDoc,
        getDocs,
        doc,
        updateDoc: trackedUpdateDoc,
        deleteDoc: trackedDeleteDoc,
        setDoc: trackedSetDoc,
        
        writeBatch: trackedWriteBatch,
        
        FieldPath,
        documentId: (() => {
            try {
                if (typeof firestoreDocumentId === 'function') {
                    return firestoreDocumentId();
                }
            } catch (_e) {}
            try {
                if (typeof FieldPath.documentId === 'function') return FieldPath.documentId();
                if (FieldPath.documentId && typeof FieldPath.documentId === 'object') return FieldPath.documentId;
            } catch (_e) {}
            return null;
        })(),
        FieldValue,
        Timestamp,
        increment: firestoreIncrement,

        firestoreQuery: query,
        where,
        orderBy,
        limit,
        startAfter,   
        getDoc,       
        getCountFromServer,
        runTransaction,
        
        onSnapshot,
        clearIndexedDbPersistence,
        terminate,
        sum,
        average,
        count,
        getAggregateFromServer,
        
        ref,
        set,
        get,
        update,
        remove,
        onValue,
        off,

        onChildAdded,
        onChildChanged,
        onChildRemoved,

        onDisconnect,
        push,
        serverTimestamp,
        
        rtdbQuery,
        
        query: rtdbQuery,
        orderByChild,
        startAt,
        endAt,
        
        limitToLast,
        
        signInWithEmailAndPassword,
        signOut,
        createUserWithEmailAndPassword,
        updateProfile,
        
        updatePassword,
        
        deleteAuthUser: firebaseDeleteUser,
        
        EmailAuthProvider,
        reauthenticateWithCredential,
        
        setPersistence,
        browserSessionPersistence,
        browserLocalPersistence,
        
        onAuthStateChanged
    };

    
    window.firebaseConnected = false;
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            window.firebaseConnected = true;
            console.log('雲端認證服務已連接');
            
            window.firebaseStatusInitialized = true;
            
            try {
                window.dispatchEvent(new CustomEvent('firebaseConnectionChanged', {
                    detail: { connected: true }
                }));
            } catch (_e) {
                
            }
        } else {
            window.firebaseConnected = false;
            console.log('雲端認證服務連接中斷');
            
            window.firebaseStatusInitialized = true;
            
            try {
                window.dispatchEvent(new CustomEvent('firebaseConnectionChanged', {
                    detail: { connected: false }
                }));
            } catch (_e) {
                
            }
        }
    });

    console.log('帳號認證模組初始化完成');
    console.log('[auth init] increment 類型:', typeof firestoreIncrement, '| FieldValue 類型:', typeof FieldValue);

    
