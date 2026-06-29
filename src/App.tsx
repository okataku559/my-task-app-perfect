// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc 
} from 'firebase/firestore';

import { 
  Play, Pause, CheckSquare, Edit, CalendarPlus, Plus, 
  Trash2, AlertCircle, Folder, FileText, Check, LogOut, X, Grid, List, BarChart, CheckCircle,
  GripVertical, Repeat // 👈 ドラッグ用のグリップアイコンと、定期タスク用のアイコンを追加しました
} from 'lucide-react';

// ==========================================
// 1. Firebase（データ保存システム）の初期設定
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyB_tiGNPzKQ4mrc9wV8cMLCmO4q43ZCLgU",
  authDomain: "my-task-app-cba4e.firebaseapp.com",
  projectId: "my-task-app-cba4e",
  storageBucket: "my-task-app-cba4e.firebasestorage.app",
  messagingSenderId: "274682706708",
  appId: "1:274682706708:web:f9c06794a390b8e5f96001",
  measurementId: "G-ZJKHCMDK8Z"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'my-task-app';

// ==========================================
// 2. アプリ内で使う固定の文字や色の設定
// ==========================================
const CATEGORIES = { work: '仕事', side_job: '副業', private: 'プライベート' };
const PRIORITIES = { high: '高', medium: '中', low: '低' };
const PRIORITY_COLORS = { high: 'bg-red-100 text-red-800', medium: 'bg-yellow-100 text-yellow-800', low: 'bg-blue-100 text-blue-800' };
const CATEGORY_COLORS = { work: 'bg-indigo-100 text-indigo-800', side_job: 'bg-emerald-100 text-emerald-800', private: 'bg-purple-100 text-purple-800' };

// ==========================================
// 3. メインコンポーネント（アプリの心臓部）
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [activeTab, setActiveTab] = useState('tasks');

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

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // データの取得
  useEffect(() => {
    if (!user) return;
    const tasksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tasks');
    const unsubscribe = onSnapshot(tasksRef, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(tasksData);
    }, (error) => {
      console.error("Firestore Error:", error);
    });
    return () => unsubscribe();
  }, [user]);

  // 【新機能】定期タスク（ルーティン）の自動生成ロジック
  // アプリを開いたときやタスクが更新されたときに、裏側でコッソリ「今日の分のタスク」を作ります
  useEffect(() => {
    if (!user || tasks.length === 0) return;

    // パソコンの時計から、正確な「今日の日付(YYYY-MM-DD)」を作ります
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    const generateRoutineTasks = async () => {
      for (const task of tasks) {
        // 「繰り返し」が設定されていない普通のタスクは無視します
        if (!task.recurrence || task.recurrence === 'none') continue;
        
        // 最後にタスクを複製した日を調べます
        const lastGenDate = task.lastGeneratedDate || task.dueDate || new Date(task.createdAt).toISOString().split('T')[0];
        
        // 既に今日、複製が終わっているなら無視します
        if (lastGenDate >= todayStr) continue;

        let shouldGenerate = false;
        
        // 「毎日」設定の場合は、無条件で今日生成します
        if (task.recurrence === 'daily') {
          shouldGenerate = true;
        } 
        // 「毎週」設定の場合は、最後に生成した日から7日以上経っているか確認します
        else if (task.recurrence === 'weekly') {
          const lastDate = new Date(lastGenDate);
          const diffDays = (today - lastDate) / (1000 * 60 * 60 * 24);
          if (diffDays >= 7) shouldGenerate = true;
        }

        if (shouldGenerate) {
          try {
            // 1. まず元の親タスクに「今日は複製済みだよ」と記録します
            const parentRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id);
            await updateDoc(parentRef, { lastGeneratedDate: todayStr });

            // 2. 今日やるための新しい「子タスク」を作成します
            const newTaskId = crypto.randomUUID();
            const newTaskRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', newTaskId);
            const newTask = {
              ...task,
              id: newTaskId,
              actualMinutes: 0, // 実績時間は0に戻す
              status: 'todo',   // 未完了に戻す
              timerSessionStartTime: null,
              calendarRegistered: false,
              createdAt: Date.now(),
              dueDate: todayStr, // 期日は「今日」！
              recurrence: 'none', // 子タスクがさらに無限増殖しないように、繰り返しはオフにする
            };
            delete newTask.lastGeneratedDate; // 余計なデータを消す
            
            await setDoc(newTaskRef, newTask);
          } catch (err) {
            console.error("Auto generation error:", err);
          }
        }
      }
    };
    generateRoutineTasks();
  }, [tasks, user]); // タスクのデータが変わるたびにチェックします

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
      if (error.code !== 'auth/popup-closed-by-user') {
        alert("ログインに失敗しました。");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (isAuthChecking) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">読み込み中...</div>;
  }

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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-800">My Tasks</h1>
          </div>
          
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
              <BarChart className="w-3.5 h-3.5"/> 予実分析グラフ
            </button>
          </div>

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

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-1/3">
          <TaskForm user={user} tasks={tasks} />
        </div>
        <div className="w-full md:w-2/3">
          {activeTab === 'tasks' ? (
            <TaskList user={user} tasks={tasks} isCompactMode={isCompactMode} setIsCompactMode={setIsCompactMode} />
          ) : (
            <AnalyticsDashboard tasks={tasks} />
          )}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// 4. 新しいタスクを作るフォーム
// ==========================================
function TaskForm({ user, tasks }) {
  const [largeTaskName, setLargeTaskName] = useState('');
  const [mediumTaskName, setMediumTaskName] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('work');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [recurrence, setRecurrence] = useState('none'); // 【新機能】繰り返しの設定

  const uniqueLargeTasks = useMemo(() => [...new Set(tasks.map(t => t.largeTaskName).filter(Boolean))], [tasks]);
  const uniqueMediumTasks = useMemo(() => [...new Set(tasks.map(t => t.mediumTaskName).filter(Boolean))], [tasks]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !user) return;

    // 【重要】ドラッグ＆ドロップ用に「一番下に並べるための番号（order）」を付けます
    const nextOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) + 1 : 0;

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
      calendarRegistered: false,
      createdAt: Date.now(),
      order: nextOrder,
      
      // 定期タスク（ルーティン）かどうかの情報を追加
      recurrence: recurrence,
      isRoutine: recurrence !== 'none', // ルーティンとして登録されたらフラグを立てる（分析用）
    };

    try {
      const taskId = crypto.randomUUID();
      const taskRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskId);
      await setDoc(taskRef, newTask);
      
      setTitle('');
      setEstimatedMinutes(30);
      setRecurrence('none'); // 追加後はリセット
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
          </div>
          
          <div className="pl-8 border-l-2 border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              <span className="text-red-500">*</span> 小タスク (作業名)
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none font-medium"
              placeholder="例: 本をダンボールに詰める"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">カテゴリ</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none">
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">重要度</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none">
              {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">期日</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">予測時間 (分)</label>
            <input type="number" min="1" step="1" value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none" />
          </div>
        </div>

        {/* 【新機能】定期タスクの設定 */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
            <Repeat className="w-3 h-3" /> 繰り返し自動追加 (定期タスク)
          </label>
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="w-full p-2 border border-slate-300 bg-slate-50 text-indigo-700 font-bold rounded-md text-sm outline-none">
            <option value="none">設定しない (1回限り)</option>
            <option value="daily">毎日追加する</option>
            <option value="weekly">毎週追加する</option>
          </select>
        </div>

        <button type="submit" className="w-full mt-2 bg-indigo-600 text-white font-medium p-2.5 rounded-lg hover:bg-indigo-700 transition flex justify-center items-center gap-2">
          <Plus className="w-4 h-4" /> タスクを追加
        </button>
      </form>
    </div>
  );
}

// ==========================================
// 5. タスク一覧を表示するパーツ
// ==========================================
function TaskList({ user, tasks, isCompactMode, setIsCompactMode }) {
  const [sortBy, setSortBy] = useState('dueDate');
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterLargeTask, setFilterLargeTask] = useState('all');
  
  // ドラッグ＆ドロップで「今どのタスクの上にいるか」を記憶する
  const [dragOverTaskId, setDragOverTaskId] = useState(null);

  const uniqueLargeTasks = useMemo(() => {
    return [...new Set(tasks.map(t => t.largeTaskName).filter(Boolean))];
  }, [tasks]);

  const processedTasks = useMemo(() => {
    let result = [...tasks];

    if (filterStatus === 'active') {
      result = result.filter(t => t.status !== 'completed');
    } else if (filterStatus === 'completed') {
      result = result.filter(t => t.status === 'completed' && !t.calendarRegistered);
    } else if (filterStatus === 'registered') {
      result = result.filter(t => t.calendarRegistered === true);
    }

    if (filterLargeTask !== 'all') {
      result = result.filter(t => t.largeTaskName === filterLargeTask);
    }

    result.sort((a, b) => {
      // 並び替えが「手動（カスタム）」の場合は、order番号で並べます
      if (sortBy === 'manual') {
        return (a.order || 0) - (b.order || 0);
      }
      // それ以外は従来のルール
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      } else if (sortBy === 'priority') {
        const pScore = { high: 3, medium: 2, low: 1 };
        return pScore[b.priority] - pScore[a.priority];
      } else {
        return b.createdAt - a.createdAt; 
      }
    });
    return result;
  }, [tasks, sortBy, filterStatus, filterLargeTask]);

  // 【新機能】ドラッグ＆ドロップでタスクの順番を入れ替える機能
  const handleReorder = async (sourceId, targetId) => {
    if (sourceId === targetId) return;

    // 現在画面に出ている順番を取得
    const sourceIdx = processedTasks.findIndex(t => t.id === sourceId);
    const targetIdx = processedTasks.findIndex(t => t.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    // 順番を入れ替えた新しいリストを作る
    const newTasks = [...processedTasks];
    const [moved] = newTasks.splice(sourceIdx, 1);
    newTasks.splice(targetIdx, 0, moved);

    // ドラッグした瞬間に、自動で「手動並び替え」モードに切り替えます
    setSortBy('manual');

    // 入れ替わったすべてのタスクに、新しい「出席番号(order)」をふり直してデータベースに保存
    newTasks.forEach(async (t, index) => {
      const taskRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', t.id);
      await updateDoc(taskRef, { order: index });
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row gap-4 xl:items-center justify-between">
        
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterStatus('active')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${filterStatus === 'active' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>未完了</button>
          <button onClick={() => setFilterStatus('completed')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${filterStatus === 'completed' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>完了済<span className="hidden sm:inline">(未登録)</span></button>
          <button onClick={() => setFilterStatus('registered')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${filterStatus === 'registered' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>カレンダー登録済</button>
          <button onClick={() => setFilterStatus('all')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${filterStatus === 'all' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>すべて</button>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {uniqueLargeTasks.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">プロジェクト:</span>
              <select 
                value={filterLargeTask} 
                onChange={(e) => setFilterLargeTask(e.target.value)} 
                className="bg-slate-50 border border-slate-200 text-slate-700 font-medium rounded p-1 outline-none max-w-[140px] truncate"
              >
                <option value="all">すべて</option>
                {uniqueLargeTasks.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <input 
              type="checkbox" 
              checked={isCompactMode} 
              onChange={(e) => setIsCompactMode(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="font-medium text-xs flex items-center gap-1">
              {isCompactMode ? <List className="w-3.5 h-3.5"/> : <Grid className="w-3.5 h-3.5"/>}
              簡易表示
            </span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">並び替え:</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 outline-none">
              <option value="manual">✋ 手動 (カスタム)</option>
              <option value="dueDate">期日が近い順</option>
              <option value="priority">重要度が高い順</option>
              <option value="createdAt">登録が新しい順</option>
            </select>
          </div>
        </div>
      </div>

      <div className={isCompactMode ? "space-y-2" : "space-y-4"}>
        {processedTasks.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-300">
            条件に一致するタスクがありません。
          </div>
        ) : (
          processedTasks.map(task => (
            // DND（ドラッグ＆ドロップ）用に、カードの上に重なった時の情報を渡します
            <div 
              key={task.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('taskId', task.id);
              }}
              onDragOver={(e) => {
                e.preventDefault(); // これがないとドロップできません
                if (dragOverTaskId !== task.id) setDragOverTaskId(task.id);
              }}
              onDragLeave={() => setDragOverTaskId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTaskId(null);
                const sourceId = e.dataTransfer.getData('taskId');
                handleReorder(sourceId, task.id);
              }}
              className={`transition-all duration-200 ${dragOverTaskId === task.id ? 'opacity-50 scale-95' : ''}`}
            >
              <TaskItem task={task} user={user} isCompact={isCompactMode} allTasks={tasks} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==========================================
// 6. 個別のタスクカード
// ==========================================
function TaskItem({ task, user, isCompact, allTasks }) {
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editLarge, setEditLarge] = useState(task.largeTaskName);
  const [editMedium, setEditMedium] = useState(task.mediumTaskName);
  const [editCategory, setEditCategory] = useState(task.category);
  const [editPriority, setEditPriority] = useState(task.priority);
  const [editDueDate, setEditDueDate] = useState(task.dueDate || '');
  const [editEstimated, setEditEstimated] = useState(task.estimatedMinutes);

  const [isEditingTime, setIsEditingTime] = useState(false);
  const [manualTime, setManualTime] = useState(task.actualMinutes);
  const [liveElapsedMinutes, setLiveElapsedMinutes] = useState(0);

  const uniqueLargeTasks = useMemo(() => [...new Set(allTasks.map(t => t.largeTaskName).filter(Boolean))], [allTasks]);
  const uniqueMediumTasks = useMemo(() => [...new Set(allTasks.map(t => t.mediumTaskName).filter(Boolean))], [allTasks]);

  // 今日の日付を取得（アラート機能用）
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const isCompleted = task.status === 'completed';

  // 【新機能】期日アラートの判定
  const isOverdue = task.dueDate && task.dueDate < todayStr && !isCompleted; // 期限切れ（過去）
  const isToday = task.dueDate === todayStr && !isCompleted;               // 期限が今日

  // アラートによる枠や背景の色の切り替えルール
  let cardBorderColor = "border-slate-200 hover:border-slate-300";
  let cardBgColor = "bg-white";
  if (isCompleted) {
    cardBorderColor = "border-slate-200";
    cardBgColor = "bg-slate-50 opacity-75";
  } else if (isOverdue) {
    cardBorderColor = "border-red-400"; // 期限切れは赤！
    cardBgColor = "bg-red-50/50";
  } else if (isToday) {
    cardBorderColor = "border-amber-400"; // 今日はオレンジ！
    cardBgColor = "bg-amber-50/50";
  }

  useEffect(() => {
    let interval;
    if (task.status === 'in_progress' && task.timerSessionStartTime) {
      interval = setInterval(() => {
        const ms = Date.now() - task.timerSessionStartTime;
        setLiveElapsedMinutes(Math.floor(ms / 60000));
      }, 1000);
    } else {
      setLiveElapsedMinutes(0);
    }
    return () => clearInterval(interval);
  }, [task.status, task.timerSessionStartTime]);

  const totalActualMinutes = task.actualMinutes + liveElapsedMinutes;

  const updateTask = async (updates) => {
    if (!user) return;
    const taskRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id);
    await updateDoc(taskRef, updates);
  };

  const handleStart = () => updateTask({ status: 'in_progress', timerSessionStartTime: Date.now() });
  
  const handlePause = () => {
    if (task.timerSessionStartTime) {
      const ms = Date.now() - task.timerSessionStartTime;
      updateTask({
        status: 'paused',
        actualMinutes: task.actualMinutes + Math.floor(ms / 60000),
        timerSessionStartTime: null
      });
    }
  };

  const handleComplete = () => {
    let finalActualMins = task.actualMinutes;
    if (task.status === 'in_progress' && task.timerSessionStartTime) {
      finalActualMins += Math.floor((Date.now() - task.timerSessionStartTime) / 60000);
    }
    updateTask({ status: 'completed', actualMinutes: finalActualMins, timerSessionStartTime: null });
  };

  const handleDelete = async () => {
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id));
  };

  const handleManualTimeSave = () => {
    updateTask({
      actualMinutes: parseInt(manualTime, 10) || 0,
      timerSessionStartTime: null,
      status: task.status === 'in_progress' ? 'paused' : task.status
    });
    setIsEditingTime(false);
  };

  const handleSaveTaskEdit = async () => {
    if (!editTitle.trim()) return;
    await updateTask({
      title: editTitle.trim(),
      largeTaskName: editLarge.trim() || '未分類',
      mediumTaskName: editMedium.trim() || '未分類',
      category: editCategory,
      priority: editPriority,
      dueDate: editDueDate,
      estimatedMinutes: parseInt(editEstimated, 10) || 0
    });
    setIsEditingTask(false);
  };

  const handleCalendarRegister = async () => {
    window.open(getCalendarUrl(), '_blank');
    await updateTask({ calendarRegistered: true });
  };

  const getCalendarUrl = () => {
    const titleText = encodeURIComponent(`[タスク完了] ${task.title}`);
    const details = encodeURIComponent(
      `プロジェクト: ${task.largeTaskName} > ${task.mediumTaskName}\n` +
      `予測時間: ${task.estimatedMinutes}分\n` +
      `実績時間: ${task.actualMinutes}分`
    );
    const end = new Date();
    const start = new Date(end.getTime() - (task.actualMinutes > 0 ? task.actualMinutes : 1) * 60000);
    const fmt = (d) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titleText}&details=${details}&dates=${fmt(start)}/${fmt(end)}`;
  };

  // ------------------------------------------
  // パターンA：編集モード
  // ------------------------------------------
  if (isEditingTask) {
    return (
      <div className="bg-white rounded-xl shadow-md border-2 border-indigo-400 p-4 space-y-3">
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Edit className="w-3.5 h-3.5"/> タスク内容を修正</span>
          <button onClick={() => setIsEditingTask(false)} className="text-slate-400 hover:text-slate-600 font-bold"><X className="w-4 h-4"/></button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-0.5">大タスク</label>
            <input type="text" list={`edit-large-${task.id}`} value={editLarge} onChange={(e)=>setEditLarge(e.target.value)} className="w-full p-1.5 border rounded" />
            <datalist id={`edit-large-${task.id}`}>{uniqueLargeTasks.map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-0.5">中タスク</label>
            <input type="text" list={`edit-medium-${task.id}`} value={editMedium} onChange={(e)=>setEditMedium(e.target.value)} className="w-full p-1.5 border rounded" />
            <datalist id={`edit-medium-${task.id}`}>{uniqueMediumTasks.map(n => <option key={n} value={n} />)}</datalist>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-700 font-semibold mb-0.5">小タスク (作業名)</label>
          <input type="text" value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} className="w-full p-2 border rounded text-sm font-medium" />
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-0.5">カテゴリ</label>
            <select value={editCategory} onChange={(e)=>setEditCategory(e.target.value)} className="w-full p-1.5 border rounded">
              {Object.entries(CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-0.5">重要度</label>
            <select value={editPriority} onChange={(e)=>setEditPriority(e.target.value)} className="w-full p-1.5 border rounded">
              {Object.entries(PRIORITIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-0.5">期日</label>
            <input type="date" value={editDueDate} onChange={(e)=>setEditDueDate(e.target.value)} className="w-full p-1 border rounded" />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-0.5">予測 (分)</label>
            <input type="number" value={editEstimated} onChange={(e)=>setEditEstimated(e.target.value)} className="w-full p-1.5 border rounded" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setIsEditingTask(false)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded text-xs font-medium hover:bg-slate-200">キャンセル</button>
          <button onClick={handleSaveTaskEdit} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 flex items-center gap-1 shadow-sm"><Check className="w-3.5 h-3.5"/> 変更を保存</button>
        </div>
      </div>
    );
  }

  // ------------------------------------------
  // パターンB：簡易表示モード
  // ------------------------------------------
  if (isCompact) {
    return (
      <div className={`rounded-lg shadow-sm border px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm transition-all ${cardBorderColor} ${cardBgColor}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          
          {/* ドラッグ用のグリップアイコン */}
          <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-500 px-1">
            <GripVertical className="w-4 h-4" />
          </div>

          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
            {PRIORITIES[task.priority]}
          </span>
          <div className="truncate flex-1">
            <span className={`font-bold ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
              {task.title}
            </span>
            <span className="text-[11px] text-slate-400 ml-2 hidden lg:inline-block">
              ({task.largeTaskName} &gt; {task.mediumTaskName})
            </span>
          </div>
          
          {/* 期日の表示（アラート状態によって色を変えます） */}
          {task.dueDate && (
            <span className={`text-[11px] shrink-0 px-1.5 py-0.5 rounded font-medium flex items-center gap-1
              ${isOverdue ? 'bg-red-100 text-red-700' : isToday ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}
            `}>
              {isOverdue || isToday ? <AlertCircle className="w-3 h-3" /> : '⏰'} {task.dueDate}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            <span>{totalActualMinutes}</span>/<span className="text-slate-400">{task.estimatedMinutes}分</span>
          </div>

          <div className="flex items-center gap-1">
            {!isCompleted && (
              <>
                {task.status !== 'in_progress' ? (
                  <button onClick={handleStart} className="p-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition" title="スタート"><Play className="w-3.5 h-3.5" /></button>
                ) : (
                  <button onClick={handlePause} className="p-1 bg-amber-50 text-amber-600 rounded hover:bg-amber-100 animate-pulse" title="一時停止"><Pause className="w-3.5 h-3.5" /></button>
                )}
                <button onClick={handleComplete} className="p-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition" title="完了"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setIsEditingTask(true)} className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-50" title="修正変更"><Edit className="w-3.5 h-3.5"/></button>
              </>
            )}
            
            {isCompleted && (
              task.calendarRegistered ? (
                <span className="p-1 bg-slate-100 text-slate-400 rounded cursor-not-allowed" title="カレンダーに登録済み"><CheckCircle className="w-4 h-4 text-emerald-500"/></span>
              ) : (
                <button onClick={handleCalendarRegister} className="p-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition" title="カレンダー登録"><CalendarPlus className="w-3.5 h-3.5" /></button>
              )
            )}
            <button onClick={handleDelete} className="p-1 text-slate-300 hover:text-red-500 rounded transition" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------
  // パターンC：通常表示モード
  // ------------------------------------------
  return (
    <div className={`rounded-xl shadow-sm border transition-all duration-300 ${cardBorderColor} ${cardBgColor}`}>
      
      {/* 💳 カード上部のヘッダー部分 */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100/50 bg-white/50 rounded-t-xl">
        <div className="flex items-center gap-3">
          {/* ドラッグ用のグリップアイコン */}
          <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-500">
            <GripVertical className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium bg-slate-100/80 w-fit px-2 py-1 rounded">
            <Folder className="w-3 h-3" />
            <span>{task.largeTaskName}</span>
            <span className="text-slate-300">&gt;</span>
            <FileText className="w-3 h-3" />
            <span>{task.mediumTaskName}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 定期タスクの目印 */}
          {task.isRoutine && (
            <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
              <Repeat className="w-3 h-3" /> 定期
            </span>
          )}

          {!isCompleted && (
            <button onClick={() => setIsEditingTask(true)} className="text-slate-400 hover:text-indigo-600 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded hover:bg-slate-50 transition">
              <Edit className="w-3 h-3"/> 修正する
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <h3 className={`text-lg font-bold mb-2 ${isCompleted ? 'line-through text-slate-500' : 'text-slate-800'}`}>
              {task.title}
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>{PRIORITIES[task.priority]}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[task.category]}`}>{CATEGORIES[task.category]}</span>
              
              {/* 期日の表示（アラート対応） */}
              {task.dueDate && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1
                  ${isOverdue ? 'bg-red-100 text-red-700' : isToday ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}
                `}>
                  <AlertCircle className="w-3 h-3" /> 期日: {task.dueDate}
                </span>
              )}
            </div>
          </div>

          <button onClick={handleDelete} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="タスク削除">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white/80 rounded-lg p-3 border border-slate-200/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="text-center">
              <p className="text-xs text-slate-500 font-medium">予測</p>
              <p className="text-lg font-bold text-slate-700">{task.estimatedMinutes}<span className="text-xs font-normal text-slate-500 ml-1">分</span></p>
            </div>
            <div className="text-slate-300 text-2xl font-light">/</div>
            <div className="text-center group relative">
              <p className="text-xs text-indigo-500 font-medium flex items-center justify-center gap-1">
                実績
                {!isCompleted && !isEditingTime && (
                  <button onClick={() => { setIsEditingTime(true); setManualTime(totalActualMinutes); }} className="text-slate-400 hover:text-indigo-600 p-0.5 rounded" title="実績時間を直接手書きで修正">
                    <Edit className="w-3 h-3" />
                  </button>
                )}
              </p>
              {isEditingTime ? (
                <div className="flex items-center gap-1">
                  <input type="number" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className="w-16 p-1 text-center border border-indigo-300 rounded text-sm outline-none" />
                  <button onClick={handleManualTimeSave} className="bg-indigo-100 text-indigo-700 p-1 rounded hover:bg-indigo-200"><Check className="w-4 h-4"/></button>
                </div>
              ) : (
                <p className={`text-lg font-bold ${task.status === 'in_progress' ? 'text-indigo-600 animate-pulse' : 'text-slate-700'}`}>
                  {totalActualMinutes}
                  <span className="text-xs font-normal text-slate-500 ml-1">分</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {!isCompleted && (
              <>
                {task.status !== 'in_progress' ? (
                  <button onClick={handleStart} className="flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition shadow-sm"><Play className="w-4 h-4" /> スタート</button>
                ) : (
                  <button onClick={handlePause} className="flex items-center gap-1 bg-amber-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-600 transition shadow-sm"><Pause className="w-4 h-4" /> 一時停止</button>
                )}
                <button onClick={handleComplete} className="flex items-center gap-1 bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-300 transition"><CheckSquare className="w-4 h-4" /> 完了</button>
              </>
            )}

            {isCompleted && (
              task.calendarRegistered ? (
                <button disabled className="flex items-center gap-2 bg-slate-100 text-slate-400 border border-slate-200 px-4 py-2 rounded-lg font-medium cursor-not-allowed">
                  <CheckCircle className="w-4 h-4 text-emerald-500" /> カレンダー登録済
                </button>
              ) : (
                <button onClick={handleCalendarRegister} className="flex items-center gap-2 bg-[#4285F4] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#3367D6] transition shadow-sm">
                  <CalendarPlus className="w-4 h-4" /> カレンダーに登録
                </button>
              )
            )}
          </div>
        </div>
        
        {task.estimatedMinutes > 0 && (
          <div className="mt-3 h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${totalActualMinutes > task.estimatedMinutes ? 'bg-red-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min((totalActualMinutes / task.estimatedMinutes) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 7. 予実分析グラフ・ダッシュボード
// ==========================================
function AnalyticsDashboard({ tasks }) {
  const [timeSpan, setTimeSpan] = useState('all');

  const filteredTasks = useMemo(() => {
    const now = Date.now();
    return tasks.filter(task => {
      if (timeSpan === '7days') return (now - task.createdAt) <= 7 * 24 * 60 * 60 * 1000;
      if (timeSpan === '30days') return (now - task.createdAt) <= 30 * 24 * 60 * 60 * 1000;
      return true;
    });
  }, [tasks, timeSpan]);

  const totals = useMemo(() => {
    let est = 0; let act = 0;
    // 【新機能】ルーティン（定期）タスクだけの時間も集計します
    let routineEst = 0; let routineAct = 0;

    filteredTasks.forEach(t => {
      est += t.estimatedMinutes || 0;
      act += t.actualMinutes || 0;
      if (t.isRoutine) {
        routineEst += t.estimatedMinutes || 0;
        routineAct += t.actualMinutes || 0;
      }
    });
    return { estimated: est, actual: act, routineEst, routineAct };
  }, [filteredTasks]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, any> = {
      work: { name: '仕事', est: 0, act: 0, color: 'bg-indigo-500' },
      side_job: { name: '副業', est: 0, act: 0, color: 'bg-emerald-500' },
      private: { name: 'プライベート', est: 0, act: 0, color: 'bg-purple-500' }
    };
    filteredTasks.forEach(t => {
      if (stats[t.category]) {
        stats[t.category].est += t.estimatedMinutes || 0;
        stats[t.category].act += t.actualMinutes || 0;
      }
    });
    return Object.values(stats);
  }, [filteredTasks]);

  const projectStats = useMemo(() => {
    const projects: Record<string, any> = {};
    filteredTasks.forEach(t => {
      const pName = t.largeTaskName || '未分類';
      if (!projects[pName]) {
        projects[pName] = { name: pName, est: 0, act: 0 };
      }
      projects[pName].est += t.estimatedMinutes || 0;
      projects[pName].act += t.actualMinutes || 0;
    });
    return Object.values(projects).sort((a: any, b: any) => b.act - a.act).slice(0, 5);
  }, [filteredTasks]);

  const getWidthPercent = (value, max) => {
    if (!max || value <= 0) return '0%';
    return `${Math.min((value / max) * 100, 100)}%`;
  };

  const maxCategoryTime = Math.max(...categoryStats.map(s => Math.max(s.est, s.act)), 1);
  const maxProjectTime = Math.max(...projectStats.map(s => Math.max(s.est, s.act)), 1);

  return (
    <div className="space-y-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      
      <div className="flex flex-wrap justify-between items-center border-b pb-4 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BarChart className="w-5 h-5 text-indigo-500"/> タイムパフォーマンス分析
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">登録された予測時間と、ストップウォッチの実績時間を比較・分析します</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-medium border">
          <button onClick={() => setTimeSpan('all')} className={`px-3 py-1 rounded transition-all ${timeSpan === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>全期間</button>
          <button onClick={() => setTimeSpan('7days')} className={`px-3 py-1 rounded transition-all ${timeSpan === '7days' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>直近7日間</button>
          <button onClick={() => setTimeSpan('30days')} className={`px-3 py-1 rounded transition-all ${timeSpan === '30days' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>直近30日間</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
          <p className="text-xs text-slate-400 font-bold">総タスク数</p>
          <p className="text-2xl font-black text-slate-700 mt-1">{filteredTasks.length}<span className="text-xs font-normal text-slate-400 ml-1">件</span></p>
        </div>
        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-50 text-center">
          <p className="text-xs text-indigo-400 font-bold">総予測時間</p>
          <p className="text-2xl font-black text-indigo-600 mt-1">{totals.estimated}<span className="text-xs font-normal text-indigo-400 ml-1">分</span></p>
        </div>
        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-50 text-center">
          <p className="text-xs text-emerald-400 font-bold">総実績時間</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{totals.actual}<span className="text-xs font-normal text-emerald-400 ml-1">分</span></p>
        </div>
        
        {/* 【新機能】定期タスクの利用時間を分析するメーター */}
        <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-50 text-center relative overflow-hidden">
          <p className="text-xs text-purple-500 font-bold flex items-center justify-center gap-1"><Repeat className="w-3 h-3"/>定期タスク実績</p>
          <p className="text-2xl font-black text-purple-600 mt-1">{totals.routineAct}<span className="text-xs font-normal text-purple-400 ml-1">分</span></p>
          <div className="absolute bottom-0 left-0 h-1 bg-purple-200 w-full">
            <div className="h-full bg-purple-500" style={{ width: `${totals.actual > 0 ? (totals.routineAct / totals.actual) * 100 : 0}%` }}></div>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-2">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1">■ カテゴリ別 時間消費（予測 vs 実績）</h3>
        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border">
          {categoryStats.map(stat => (
            <div key={stat.name} className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>{stat.name}</span>
                <span>予測: {stat.est}分 / <span className="text-slate-800">実績: {stat.act}分</span></span>
              </div>
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden relative">
                <div className="h-full bg-slate-400 opacity-40 rounded-full transition-all" style={{ width: getWidthPercent(stat.est, maxCategoryTime) }} />
              </div>
              <div className="h-3 w-full bg-slate-200/50 rounded-full overflow-hidden relative">
                <div className={`h-full ${stat.color} rounded-full transition-all`} style={{ width: getWidthPercent(stat.act, maxCategoryTime) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 pt-2">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1">■ プロジェクト別 時間消費（上位5件）</h3>
        {projectStats.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed">まだ完了・計測されたプロジェクトがありません</div>
        ) : (
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border">
            {projectStats.map(stat => (
              <div key={stat.name} className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span className="truncate max-w-[200px]">{stat.name}</span>
                  <span>予測: {stat.est}分 / <span className="text-indigo-600">実績: {stat.act}分</span></span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-300 rounded-full transition-all" style={{ width: getWidthPercent(stat.est, maxProjectTime) }} />
                </div>
                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: getWidthPercent(stat.act, maxProjectTime) }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center gap-4 text-[11px] text-slate-400 font-medium pt-2 border-t">
        <div className="flex items-center gap-1"><div className="w-2.5 h-1.5 bg-slate-300 rounded"/> 予測（目標時間）</div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-indigo-500 rounded"/> 実績（実際の消費時間）</div>
      </div>

    </div>
  );
}