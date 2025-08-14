// Import Firebase functions
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
    import { getDatabase, ref, set, get, child, push, update, remove, onValue, off } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
    import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

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

    // 讓其他腳本可以使用 Firebase
    window.firebase = {
        app, db, rtdb, auth,
        collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, where, orderBy, limit,
        ref, set, get, child, push, update, remove, onValue, off,
        signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
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