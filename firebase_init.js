// Import Firebase functions
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, where, orderBy, limit, startAfter, enableIndexedDbPersistence, getCountFromServer } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
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
    const db = getFirestore(app);
    const rtdb = getDatabase(app);
    const auth = getAuth(app);

// 將 Auth 的持久化模式設置為「session」，以確保當瀏覽器或分頁關閉時自動登出
// 這會將登入狀態儲存在 sessionStorage 而非預設的 localStorage，
// 一旦使用者關閉該瀏覽器分頁或整個瀏覽器，登入狀態會被清除。
// 若設置失敗，會在控制台輸出錯誤訊息，但不會阻止應用程式繼續運作。
setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error('設置 Firebase Auth 持久化模式失敗:', error);
});

// 啟用 Firestore 離線快取（IndexedDB）。
// 這將在瀏覽器中快取已讀取的文件，離線時可以快速返回資料，減少重複讀取。
// 如果啟用失敗，僅輸出錯誤，不會阻止應用程式繼續運作。
try {
  enableIndexedDbPersistence(db).catch((err) => {
    // 如果多個頁籤開啟或不支援 IndexedDB，啟用快取可能失敗。
    console.warn('啟用 Firestore 離線快取失敗:', err);
  });
} catch (e) {
  console.warn('啟用 Firestore 離線快取時發生例外:', e);
}

    // 讓其他腳本可以使用 Firebase
    window.firebase = {
        app, db, rtdb, auth,
        collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, where, orderBy, limit,
        startAfter,
        // 聚合查詢函式，用於取得集合中的文件總數
        getCountFromServer,
        // 將離線快取相關函式導出以供其他模組使用（若需要）
        enableIndexedDbPersistence,
        ref, set, get, child, push, update, remove, onValue, off,
        signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
        // 讓其他模組可存取持久化相關方法（可選）
        setPersistence, browserSessionPersistence
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