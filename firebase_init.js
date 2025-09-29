// Import Firebase functions
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
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
  /* 改用 initializeFirestore/persistentLocalCache 以啟用離線快取。
     enableIndexedDbPersistence 將在未來版本中移除。*/
  initializeFirestore,
  persistentLocalCache,
  // 新增多分頁快取管理器，允許多個分頁共用一個離線快取，避免 "Failed to obtain exclusive access" 錯誤
  persistentMultipleTabManager
  ,
  // 匯入批次寫入函式以支援批次操作
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getDatabase, ref, set, get, update, remove, onValue, off,
        // 新增查詢相關方法，用於在 Realtime Database 上進行條件篩選
        query as rtdbQuery,
        orderByChild,
        startAt,
        endAt } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence, createUserWithEmailAndPassword, updateProfile,
        // 新增更改密碼、刪除帳號、重新驗證等方法
        updatePassword, deleteUser as firebaseDeleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// 匯入外部配置檔案。請將您的 Firebase 設定值放在 firebaseConfig.js 中，並避免將其提交到版本控制。
import firebaseConfig from './firebaseConfig.js';

// 將設定值暴露於全域，以便 Firechat 等需要舊版 Firebase 的模組可重新初始化。
// 這不會洩漏您的金鑰，因為 firebaseConfig 內容僅包含專案識別與 API 金鑰等公開資訊。
// Firechat 將使用此物件呼叫 firebase.initializeApp()。
window.firebaseConfig = firebaseConfig;

    // Initialize Firebase 使用外部配置
    const app = initializeApp(firebaseConfig);
    // 使用 initializeFirestore 搭配 persistentLocalCache 啟用離線快取。
    // 依照新版 SDK 的建議，在初始化 Firestore 時指定 localCache 為 persistentLocalCache()，
    // 以便將文件快取至 IndexedDB，當網路中斷時仍可讀取先前的資料，並在恢復連線後自動同步。
    const db = initializeFirestore(app, {
      // 使用 persistentLocalCache 搭配 persistentMultipleTabManager 以支援多分頁離線快取。
      // 若未指定 tabManager，預設僅允許單一分頁存取 IndexedDB，當多個分頁同時開啟時會造成 exclusivity 錯誤。
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });

    // 注意：不再呼叫 enableIndexedDbPersistence，因為該函式未來將被移除。
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
    // Store the modular Firebase object in a separate property before assigning it to window.firebase.  
    // We assign it to window.firebase below, but in some pages (e.g. Firechat integration) we need to
    // retain access to this modular instance after other scripts (like Firebase v3) override window.firebase.
    const firebaseModular = {
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
        // 批次寫入函式
        writeBatch,
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
        createUserWithEmailAndPassword,
        updateProfile,
        // 新增：密碼重設與帳號刪除相關函式
        updatePassword,
        // 刪除 Firebase Authentication 使用者
        deleteAuthUser: firebaseDeleteUser,
        // 使用電子郵件提供者進行重新驗證
        EmailAuthProvider,
        reauthenticateWithCredential,
        // 持久化設置
        setPersistence,
        browserSessionPersistence
    };

    // Make the modular Firebase object globally accessible. It will be duplicated onto
    // window.firebase after this assignment. If another script later overwrites window.firebase
    // (for example, loading Firebase v3 for Firechat), you can still access the modular APIs via
    // window.firebaseModular.
    window.firebaseModular = firebaseModular;

    // 將 modular API 複製到全域 firebase，供系統其他部分使用。Firechat 將使用 firebaseCompat，因此後續載入 compat
    // SDK 不會覆蓋此 modular 版本，只要我們在其他地方使用 window.firebaseModular 即可避免衝突。
    window.firebase = firebaseModular;

    // 連接狀態監控
    window.firebaseConnected = false;
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            window.firebaseConnected = true;
            console.log('Firebase 已連接');
            // 標記已取得 Firebase 連線狀態
            window.firebaseStatusInitialized = true;
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
            // 標記已取得 Firebase 連線狀態
            window.firebaseStatusInitialized = true;
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

    // 不在初始化時發送 Firebase 連線狀態事件，以避免初始值誤判為離線。
