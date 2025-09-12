// Import Firebase functions
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, query, where, orderBy, limit, getCountFromServer, startAfter, getDoc,
         /* 用於啟用離線快取 */
         enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getDatabase, ref, set, get, update, remove, onValue, off,
        // 新增查詢相關方法，用於在 Realtime Database 上進行條件篩選
        query as rtdbQuery,
        orderByChild,
        startAt,
        endAt } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

    // 您的 Firebase 配置（請替換成您的實際配置）
const firebaseConfig = {
  apiKey: "AIzaSyCx_BLIWVKZs0vJa5TwL6zoycJexY_5nXU",
  authDomain: "system-1e90a.firebaseapp.com",
  databaseURL: "https://system-1e90a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "system-1e90a",
  storageBucket: "system-1e90a.firebasestorage.app",
  messagingSenderId: "80947900109",
  appId: "1:80947900109:web:b6cd62bb2f1e07971a4384"
};

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    // 啟用 Firestore 離線快取。Web 端預設不會快取離線資料，
    // 需手動呼叫 enableIndexedDbPersistence 來啟用。此功能會將讀取到的文件儲存在 IndexedDB，
    // 讓使用者在網路中斷時仍能存取先前讀取過的資料，並於恢復連線後自動同步。
    enableIndexedDbPersistence(db).catch((error) => {
      // failed-precondition: 可能因為開啟了多個瀏覽器分頁或索引衝突導致無法啟用；
      // unimplemented: 瀏覽器不支援離線快取。
      console.error('啟用 Firestore 離線快取失敗:', error);
    });
    const rtdb = getDatabase(app);
    const auth = getAuth(app);

// 將 Auth 的持久化模式設置為「session」，以確保當瀏覽器或分頁關閉時自動登出
// 這會將登入狀態儲存在 sessionStorage 而非預設的 localStorage，
// 一旦使用者關閉該瀏覽器分頁或整個瀏覽器，登入狀態會被清除。
// 若設置失敗，會在控制台輸出錯誤訊息，但不會阻止應用程式繼續運作。
setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error('設置 Firebase Auth 持久化模式失敗:', error);
});

    // 讓其他腳本可以使用 Firebase
    // 注意：不要覆蓋 Firestore 的 query 方法。為了使用 Realtime Database 的查詢功能，
    // 將其以 rtdbQuery 名稱暴露，避免與 Firestore 的 query 衝突。
    window.firebase = {
        // 基本實例
        app,
        db,
        rtdb,
        auth,
        // Firestore 基本操作函式
        collection,
        addDoc,
        getDocs,
        doc,
        updateDoc,
        deleteDoc,
        setDoc,
        // 將 Firestore 查詢函式以 firestoreQuery 名稱暴露，避免與 Realtime Database 的 query 混淆
        firestoreQuery: query,
        where,
        orderBy,
        limit,
        startAfter,   // Firestore 分頁用
        getDoc,       // 取得單筆 Firestore 文件
        getCountFromServer,
        // Realtime Database 基本操作函式
        ref,
        set,
        get,
        update,
        remove,
        onValue,
        off,
        // Realtime Database 查詢函式，同時將其作為預設的 query 屬性供 RTDB 使用
        rtdbQuery,
        // 為了向下相容，將 query 指向 Realtime Database 的查詢函式
        query: rtdbQuery,
        orderByChild,
        startAt,
        endAt,
        // 驗證函式
        signInWithEmailAndPassword,
        signOut,
        // 持久化設置
        setPersistence,
        browserSessionPersistence
    };

    // 連接狀態監控
    window.firebaseConnected = false;
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            window.firebaseConnected = true;
            console.log('Firebase 已連接');
            // 通知系統 Firebase 連線狀態已變更（connected）
            try {
                window.dispatchEvent(new CustomEvent('firebaseConnectionChanged', {
                    detail: { connected: true }
                }));
            } catch (_e) {
                // 若 dispatch 事件失敗則忽略
            }
        } else {
            window.firebaseConnected = false;
            console.log('Firebase 連接中斷');
            // 通知系統 Firebase 連線狀態已變更（disconnected）
            try {
                window.dispatchEvent(new CustomEvent('firebaseConnectionChanged', {
                    detail: { connected: false }
                }));
            } catch (_e) {
                // 若 dispatch 事件失敗則忽略
            }
        }
    });

    console.log('Firebase 初始化完成');

    // 在初始化後發送一次 Firebase 連線狀態事件，以便 UI 能夠根據當前狀態進行初始化。
    try {
      window.dispatchEvent(new CustomEvent('firebaseConnectionChanged', {
        detail: { connected: window.firebaseConnected }
      }));
    } catch (_e) {
      // 若 dispatch 事件失敗則忽略
    }
