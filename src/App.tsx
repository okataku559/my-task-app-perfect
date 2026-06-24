import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc 
} from 'firebase/firestore';
// 画面に表示するアイコン（絵文字のようなもの）を読み込んでいます
import { 
  Play, Pause, CheckSquare, Edit3, CalendarPlus, Plus, 
  Trash2, Clock, AlertCircle, Folder, FileText, Check, LogOut, X, LayoutGrid, List, BarChart3, CheckCircle2
} from 'lucide-react';

// ==========================================
// 1. Firebase（データ保存システム）の初期設定
// ==========================================
// Googleのクラウドデータベースに接続するための、あなたのアプリ専用の「住所と鍵」です。
const firebaseConfig = {
  apiKey: "AIzaSyB_tiGNPzKQ4mrc9wV8cMLCmO4q43ZCLgU",
  authDomain: "my-task-app-cba4e.firebaseapp.com",
  projectId: "my-task-app-cba4e",
  storageBucket: "my-task-app-cba4e.firebasestorage.app",
  messagingSenderId: "274682706708",
  appId: "1:274682706708:web:f9c06794a390b8e5f96001",
  measurementId: "G-ZJKHCMDK8Z"
};
const app = initializeApp(firebaseConfig); // 設定を元にシステムを起動
const auth = getAuth(app);                // ログイン担当システムを起動
const db = getFirestore(app);              // データ保存担当システムを起動
const appId = typeof __app_id !== 'undefined' ? __app_id : 'my-task-app';

// ==========================================
// 2. アプリ内で使う固定の文字や色の設定
// ==========================================
const CATEGORIES = { work: '仕事', side_job: '副業', private: 'プライベート' };
const PRIORITIES = { high: '高', medium: '中', low: '低' };
// 重要度やカテゴリに応じた色（Tailwind CSSのクラス名）を指定しています
const PRIORITY_COLORS = { high: 'bg-red-100 text-red-800', medium: 'bg-yellow-100 text-yellow-800', low: 'bg-blue-100 text-blue-800' };
const CATEGORY_COLORS = { work: 'bg-indigo-100 text-indigo-800', side_job: 'bg-emerald-100 text-emerald-800', private: 'bg-purple-100 text-purple-800' };

// ==========================================
// 3. メインコンポーネント（アプリの心臓部）
// ==========================================
export default function App() {
  // --- 状態管理（アプリが記憶しておくデータ） ---
  const [user, setUser] = useState(null);               // ログインしているユーザーの情報
  const [isAuthChecking, setIsAuthChecking] = useState(true); // ログイン確認中かどうかのフラグ
  const [tasks, setTasks] = useState([]);               // データベースから取得したタスクのリスト
  const [isCompactMode, setIsCompactMode] = useState(false); // 簡易表示モードがONかOFFか
  const [activeTab, setActiveTab] = useState('tasks');   // 現在表示している画面（'tasks' = タスク一覧, 'analytics' = 分析画面）

  // 【機能】ログイン状態を24時間いつでも監視する仕組み
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();

    // ログイン状態が変わる（ログインした・ログアウトした）たびに自動で動く
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);       // ユーザー情報を記憶
      setIsAuthChecking(false);   // 確認が終わったのでロード画面を終了
    });
    return () => unsubscribe();
  }, []);

  // 【機能】データベース（Firestore）からリアルタイムにタスクを取ってくる仕組み
  useEffect(() => {
    if (!user) return; // ログインしていない時は何もしない
    
    // あなたのログインID（uid）専用のデータ保存フォルダを指定
    const tasksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tasks');
    
    // データベースの中身が書き換わるたびに、自動的に最新データを取得して画面を書き換える
    const unsubscribe = onSnapshot(tasksRef, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(tasksData); // 最新のタスクリストを記憶
    }, (error) => {
      console.error("Firestore Error:", error);
    });
    
    return () => unsubscribe();
  }, [user]);

  // 【機能】Googleログインボタンが押された時の処理
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider); // ポップアップ画面を開いてGoogle認証
    } catch (error) {
      console.error("Login failed:", error);
      if (error.code !== 'auth/popup-closed-by-user') {
        alert("ログインに失敗しました。");
      }
    }
  };

  // 【機能】ログアウトボタンが押された時の処理
  const handleLogout = async () => {
    try {
      await signOut(auth); // ログアウトを実行
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // ログイン確認中の待ち時間画面
  if (isAuthChecking) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">読み込み中...</div>;
  }

  // ログインしていない時の画面（ログインを促す）
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-100 p-3 rounded-full">
              <CheckSquare className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">タスク管理アプリ</h1>
          <p className="text-slate-500 text-sm mb-8">あなた専用のタスクをクラウドで管理</p>
          
          <button 
            onClick={handleGoogleLogin} 
            className="w-full bg-white border border-slate-300 text-slate-700 font-semibold p-3 rounded-lg hover:bg-slate-50 transition flex items-center justify-center gap-3 shadow-sm"
          >
            {/* GoogleのGマークを表現する図形データ */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              <path fill="none" d="M1 1h22v22H1z" />
            </svg>
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  // ログイン成功後のメイン画面（ここから下が実際のアプリ画面）
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      {/* 画面最上部のヘッダーバー */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-800">My Tasks</h1>
          </div>
          
          {/* 【重要】新機能：画面切り替え用のタブボタン（タスク一覧 vs 分析ダッシュボード） */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button 
              onClick={() => setActiveTab('tasks')} 
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'tasks' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <List className="w-3.5 h-3.5"/> タスク管理
            </button>
            <button 
              onClick={() => setActiveTab('analytics')} 
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'analytics' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <BarChart3 className="w-3.5 h-3.5"/> 予実分析グラフ
            </button>
          </div>

          {/* ユーザーのプロフィール情報 */}
          <div className="text-sm text-slate-500 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src={user.photoURL || ""} alt="Profile" className="w-6 h-6 rounded-full" />
              <span className="hidden sm:inline-block font-medium">{user.displayName}</span>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition" title="ログアウト">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 画面の中身（メインエリア） */}
      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        {/* 左側：常に表示されるタスク登録フォーム */}
        <div className="w-full md:w-1/3">
          <TaskForm user={user} tasks={tasks} />
        </div>
        
        {/* 右側：タブの選択によって「タスク一覧」か「分析グラフ」が入れ替わります */}
        <div className="w-full md:w-2/3">
          {activeTab === 'tasks' ? (
            // タスク管理タブが選ばれている時
            <TaskList user={user} tasks={tasks} isCompactMode={isCompactMode} setIsCompactMode={setIsCompactMode} />
          ) : (
            // 予実分析グラフタブが選ばれている時（新機能コンポーネントを呼び出し）
            <AnalyticsDashboard tasks={tasks} />
          )}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// 4. 新しいタスクを作るフォーム（左側のパーツ）
// ==========================================
function TaskForm({ user, tasks }) {
  // 入力フォームの文字を記憶する状態リスト
  const [largeTaskName, setLargeTaskName] = useState('');
  const [mediumTaskName, setMediumTaskName] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('work');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);

  // 過去に入力した大タスク・中タスクの名前を自動で集めて、予測候補（オートコンプリート）を作っています
  const uniqueLargeTasks = useMemo(() => [...new Set(tasks.map(t => t.largeTaskName).filter(Boolean))], [tasks]);
  const uniqueMediumTasks = useMemo(() => [...new Set(tasks.map(t => t.mediumTaskName).filter(Boolean))], [tasks]);

  // タスク登録ボタンが押された時の処理
  const handleSubmit = async (e) => {
    e.preventDefault(); // 画面が勝手にリロードされるのを防ぐおまじない
    if (!title.trim() || !user) return; // タイトルが空っぽなら登録しない

    // データベースに送る用の、きれいに整理されたタスクデータ（1セット）
    const newTask = {
      largeTaskName: largeTaskName.trim() || '未分類',
      mediumTaskName: mediumTaskName.trim() || '未分類',
      title: title.trim(),
      category,
      priority,
      dueDate,
      estimatedMinutes: parseInt(estimatedMinutes, 10) || 0,
      actualMinutes: 0,
      status: 'todo',
      timerSessionStartTime: null,
      calendarRegistered: false, // 【新機能】最初はカレンダー未登録なのでfalse
      createdAt: Date.now(),      // 登録した正確な日時（グラフの期間絞り込みで使います）
    };

    try {
      const taskId = crypto.randomUUID(); // ランダムなタスク個別IDを生成
      const taskRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskId);
      await setDoc(taskRef, newTask); // データベースへ保存！
      
      // 次の入力のために文字をリセット
      setTitle('');
      setEstimatedMinutes(30);
    } catch (err) {
      console.error("Add task error:", err);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-24">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-4 border-b pb-2">
        <Plus className="w-5 h-5 text-indigo-500" />
        新しいタスクを登録
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* 大・中・小タスクの入力欄（※以前作ったCSS魔法ルールにより、強制的に白背景・黒文字になります） */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
              <Folder className="w-3 h-3" /> 大タスク (プロジェクト)
            </label>
            <input
              type="text"
              list="largeTasks"
              value={largeTaskName}
              onChange={(e) => setLargeTaskName(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none"
              placeholder="例: 引越し, Webサイト制作"
            />
            <datalist id="largeTasks">
              {uniqueLargeTasks.map(name => <option key={name} value={name} />)}
            </datalist>
          </div>
          
          <div className="pl-4 border-l-2 border-slate-200">
            <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3" /> 中タスク (フェーズ/工程)
            </label>
            <input
              type="text"
              list="mediumTasks"
              value={mediumTaskName}
              onChange={(e) => setMediumTaskName(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none"
              placeholder="例: 荷造り, 要件定義"
            />
            <datalist id="mediumTasks">
              {uniqueMediumTasks.map(name => <option key={name} value={name} />)}
            </datalist>