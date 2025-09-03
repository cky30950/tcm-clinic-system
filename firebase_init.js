// Import Firebase functions
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
// 引入 initializeFirestore 以自訂離線快取大小；引入 memoryLocalCache 用於記憶體快取，
// 並引入 getDocFromServer/getDocsFromServer 以便於關閉離線快取時直接從伺服器讀取。
import {
  initializeFirestore,
  memoryLocalCache,
  collection,
  addDoc,
  // getDoc 和 getDocs 仍然從 Firestore 匯入，但稍後會使用包裝函式改寫為直接從伺服器讀取。
  getDoc,
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
    import { getDatabase, ref, set, get, child, push, update, remove, onValue, off } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

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
// 初始化 Firestore 時採用記憶體型本地快取（memoryLocalCache），避免建立持久化離線快取。
// Firestore Web SDK 預設會使用記憶體快取，此處顯式指定 memoryLocalCache 以便日後設定差異。當結合
// getDocFromServer/getDocsFromServer 使用時，即可儘量避免從本地快取讀取資料。
const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
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
    window.firebase = {
        app, db, rtdb, auth,
        collection, addDoc, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, where, orderBy, limit,
        ref, set, get, child, push, update, remove, onValue, off,
        signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
        // 讓其他模組可存取持久化相關方法（可選）
        setPersistence, browserSessionPersistence,
        // 包裝函式：強制所有讀取操作直接從伺服器取得資料，避免使用本地快取。
        getDoc: (reference) => getDocFromServer(reference),
        getDocs: (queryObj) => getDocsFromServer(queryObj),
        // 同時導出底層的伺服器端讀取函式，以便需要時直接使用
        getDocFromServer,
        getDocsFromServer
    };

    // 連接狀態監控
    window.firebaseConnected = false;
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            window.firebaseConnected = true;
            console.log('Firebase 已連接');
        } else {
            window.firebaseConnected = false;
            console.log('Firebase 連接中斷');
        }
    });

    console.log('Firebase 初始化完成');