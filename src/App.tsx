import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, Time } from 'lightweight-charts';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  Activity, 
  Clock,
  Plus,
  Minus,
  LogOut,
  ShieldAlert,
  Users
} from 'lucide-react';
import { format } from 'date-fns';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { ErrorBoundary } from './components/ErrorBoundary';

// Types
type Transaction = {
  id: string;
  uid: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  date: string;
};

type UserProfile = {
  uid: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  balance: number;
  costBasis: number;
  lastUpdate: string;
};

type CandleData = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
};

const APY = 0.02; // 2% Annual Percentage Yield

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const generateInitialData = (currentBalance: number): CandleData[] => {
  const data: CandleData[] = [];
  const now = Math.floor(Date.now() / 1000);
  const currentMinute = now - (now % 60);
  
  let simulatedBalance = currentBalance * Math.pow(1 - (APY / (365*24*60)), 60);
  if (simulatedBalance === 0) simulatedBalance = 10000;
  
  for (let i = 60; i >= 0; i--) {
    const time = (currentMinute - i * 60) as Time;
    const open = simulatedBalance;
    const drift = open * (APY / (365 * 24 * 60));
    const noise = open * (Math.random() * 0.0004 - 0.0002); 
    const close = i === 0 ? currentBalance : open + drift + noise;
    const high = Math.max(open, close) + open * (Math.random() * 0.0002);
    const low = Math.min(open, close) - open * (Math.random() * 0.0002);

    data.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    });
    simulatedBalance = close;
  }
  return data;
};

const CandlestickChart = ({ initialData, latestCandle }: { initialData: CandleData[], latestCandle: CandleData | null }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || initialData.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a', style: 1 },
        horzLines: { color: '#27272a', style: 1 },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#27272a',
      },
      crosshair: {
        mode: 0,
      }
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    series.setData(initialData);

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [initialData]);

  useEffect(() => {
    if (seriesRef.current && latestCandle) {
      seriesRef.current.update(latestCandle);
    }
  }, [latestCandle]);

  return <div ref={chartContainerRef} className="w-full h-full absolute inset-0" />;
};

function Login() {
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 mb-8">
        <TrendingUp className="w-8 h-8 text-emerald-400" />
      </div>
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 mb-2">Vault</h1>
      <p className="text-zinc-400 mb-8">High Yield Savings. Reimagined.</p>
      <button 
        onClick={handleLogin}
        className="bg-zinc-50 hover:bg-zinc-200 text-zinc-950 px-8 py-4 rounded-xl font-semibold transition-colors flex items-center gap-3"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign in with Google
      </button>
    </div>
  );
}

function Dashboard({ userProfile }: { userProfile: UserProfile }) {
  const [initialData, setInitialData] = useState<CandleData[]>([]);
  const [latestCandle, setLatestCandle] = useState<CandleData | null>(null);
  const [balance, setBalance] = useState<number>(userProfile.balance);
  const [costBasis, setCostBasis] = useState<number>(userProfile.costBasis);
  const [totalInterest, setTotalInterest] = useState<number>(userProfile.balance - userProfile.costBasis);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const lastSeenProfileBalance = useRef(userProfile.balance);
  
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('');

  useEffect(() => {
    const data = generateInitialData(userProfile.balance);
    const initial = data.slice(0, -1);
    const latest = data[data.length - 1];
    setInitialData(initial);
    setLatestCandle(latest);
    setBalance(userProfile.balance);
    setCostBasis(userProfile.costBasis);
    setTotalInterest(userProfile.balance - userProfile.costBasis);
    lastSeenProfileBalance.current = userProfile.balance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile.uid]);

  useEffect(() => {
    if (userProfile.balance !== lastSeenProfileBalance.current) {
      const diff = userProfile.balance - lastSeenProfileBalance.current;
      lastSeenProfileBalance.current = userProfile.balance;
      
      setBalance(prev => {
        const newBalance = prev + diff;
        
        setLatestCandle(prevCandle => {
          if (!prevCandle) return null;
          return {
            ...prevCandle,
            close: Number(newBalance.toFixed(2)),
            high: Math.max(prevCandle.high, newBalance),
            low: Math.min(prevCandle.low, newBalance)
          };
        });
        
        return newBalance;
      });
      
      setCostBasis(userProfile.costBasis);
      setTotalInterest(userProfile.balance - userProfile.costBasis);
    }
  }, [userProfile.balance, userProfile.costBasis]);

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'), 
      where('uid', '==', userProfile.uid),
      orderBy('date', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: Transaction[] = [];
      snapshot.forEach((doc) => {
        txs.push({ id: doc.id, ...doc.data() } as Transaction);
      });
      setTransactions(txs);
    }, (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'transactions');
      } catch (handledErr) {
        setError(handledErr as Error);
      }
    });
    return () => unsubscribe();
  }, [userProfile.uid]);

  useEffect(() => {
    if (initialData.length === 0) return;
    
    const interval = setInterval(() => {
      setBalance(prev => {
        const interestPerSecond = prev * (APY / (365 * 24 * 60 * 60));
        const noise = prev * (Math.random() * 0.0001 - 0.00005);
        const newBalance = prev + interestPerSecond + noise;
        
        setTotalInterest(curr => curr + interestPerSecond);
        
        setLatestCandle(prevCandle => {
          if (!prevCandle) return null;
          
          const now = Math.floor(Date.now() / 1000);
          const currentMinute = now - (now % 60);
          
          if (currentMinute > (prevCandle.time as number)) {
            return {
              time: currentMinute as Time,
              open: prevCandle.close,
              high: Math.max(prevCandle.close, newBalance),
              low: Math.min(prevCandle.close, newBalance),
              close: Number(newBalance.toFixed(2))
            };
          }
          
          return {
            ...prevCandle,
            close: Number(newBalance.toFixed(2)),
            high: Math.max(prevCandle.high, newBalance),
            low: Math.min(prevCandle.low, newBalance),
          };
        });
        
        return newBalance;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [initialData]);

  const handleTransaction = async (type: 'deposit' | 'withdrawal') => {
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) return;
    if (type === 'withdrawal' && amount > balance) return;

    try {
      const userRef = doc(db, 'users', userProfile.uid);
      const txRef = doc(collection(db, 'transactions'));
      
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User does not exist!");
        
        const currentData = userDoc.data() as UserProfile;
        
        // Calculate new values
        const newBalance = type === 'deposit' ? currentData.balance + amount : currentData.balance - amount;
        const newCostBasis = type === 'deposit' ? currentData.costBasis + amount : currentData.costBasis - amount;
        
        transaction.update(userRef, {
          balance: newBalance,
          costBasis: newCostBasis,
          lastUpdate: new Date().toISOString()
        });
        
        transaction.set(txRef, {
          uid: userProfile.uid,
          type,
          amount,
          date: new Date().toISOString()
        });
      });

      if (type === 'deposit') setIsDepositModalOpen(false);
      if (type === 'withdrawal') setIsWithdrawModalOpen(false);
      setAmountInput('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `users/${userProfile.uid}`);
      } catch (handledErr) {
        setError(handledErr as Error);
      }
    }
  };

  if (error) {
    throw error;
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
      <nav className="border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Vault</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-zinc-400">
            {(userProfile.role === 'admin' || userProfile.email === 'gedeonizabikora37@gmail.com') && (
              <Link to="/admin" className="flex items-center gap-1.5 hover:text-zinc-50 transition-colors">
                <ShieldAlert className="w-4 h-4" />
                Admin
              </Link>
            )}
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              2.00% APY
            </span>
            <button onClick={() => signOut(auth)} className="hover:text-zinc-50 transition-colors flex items-center gap-1.5">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">VLT / USD</h2>
                <span className="flex items-center text-emerald-400 font-mono bg-emerald-400/10 px-2 py-0.5 rounded text-xs border border-emerald-400/20">
                  MARKET OPEN
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <h1 className="text-5xl font-mono tracking-tight font-semibold">
                  {formatCurrency(balance)}
                </h1>
                <span className="flex items-center text-emerald-400 font-mono text-lg">
                  <ArrowUpRight className="w-5 h-5 mr-1" />
                  +{formatCurrency(totalInterest)} ({costBasis > 0 ? ((totalInterest / costBasis) * 100).toFixed(4) : '0.0000'}%)
                </span>
              </div>
            </div>

            <div className="h-[400px] w-full bg-zinc-900/30 border border-zinc-800/50 rounded-2xl relative overflow-hidden flex flex-col">
              <div className="p-4 z-10 flex-none">
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">30D Performance</span>
              </div>
              <div className="flex-1 relative w-full">
                {initialData.length > 0 && <CandlestickChart initialData={initialData} latestCandle={latestCandle} />}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setIsDepositModalOpen(true)}
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-4 rounded-xl transition-colors"
              >
                <Plus className="w-5 h-5" />
                Deposit Funds
              </button>
              <button 
                onClick={() => setIsWithdrawModalOpen(true)}
                className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 font-semibold py-4 rounded-xl transition-colors border border-zinc-700/50"
              >
                <Minus className="w-5 h-5" />
                Withdraw
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    VLT <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Vault Cash</span>
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">Your Position</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg">{formatCurrency(balance)}</p>
                  <p className="text-sm font-mono text-emerald-400 flex items-center justify-end gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +{costBasis > 0 ? ((totalInterest / costBasis) * 100).toFixed(4) : '0.0000'}%
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="text-sm">Shares</span>
                  </div>
                  <span className="font-mono text-zinc-50">{costBasis.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center pb-4 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="text-sm">Avg Cost</span>
                  </div>
                  <span className="font-mono text-zinc-50">$1.00</span>
                </div>
                
                <div className="flex justify-between items-center pb-4 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="text-sm">Total Return</span>
                  </div>
                  <span className="font-mono text-emerald-400">+{formatCurrency(totalInterest)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="text-sm">Current APY</span>
                  </div>
                  <span className="font-mono text-emerald-400">2.00%</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 flex flex-col h-[calc(100%-16rem)] min-h-[400px]">
              <h3 className="text-lg font-medium mb-6">Recent Activity</h3>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                {transactions.length === 0 && (
                  <p className="text-zinc-500 text-sm text-center py-8">No transactions yet.</p>
                )}
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' :
                        tx.type === 'withdrawal' ? 'bg-zinc-800 text-zinc-400' :
                        'bg-blue-500/10 text-blue-400'
                      }`}>
                        {tx.type === 'deposit' ? <ArrowDownRight className="w-5 h-5" /> :
                         tx.type === 'withdrawal' ? <ArrowUpRight className="w-5 h-5" /> :
                         <TrendingUp className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-medium capitalize text-sm">{tx.type}</p>
                        <p className="text-xs text-zinc-500">{format(new Date(tx.date), 'MMM dd, yyyy HH:mm')}</p>
                      </div>
                    </div>
                    <span className={`font-mono text-sm ${
                      tx.type === 'withdrawal' ? 'text-zinc-50' : 'text-emerald-400'
                    }`}>
                      {tx.type === 'withdrawal' ? '-' : '+'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-semibold mb-4">Deposit Funds</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleTransaction('deposit'); }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono">$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0.01"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-8 pr-4 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button 
                    type="button"
                    onClick={() => { setIsDepositModalOpen(false); setAmountInput(''); }}
                    className="flex-1 py-3 rounded-xl font-medium bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 rounded-xl font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors"
                  >
                    Confirm Deposit
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-semibold mb-4">Withdraw Funds</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleTransaction('withdrawal'); }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono">$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0.01"
                      max={balance}
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-8 pr-4 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:border-zinc-500 transition-all"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-2 flex justify-between">
                    <span>Available balance:</span>
                    <span className="font-mono">{formatCurrency(balance)}</span>
                  </p>
                </div>
                <div className="flex gap-3 mt-6">
                  <button 
                    type="button"
                    onClick={() => { setIsWithdrawModalOpen(false); setAmountInput(''); }}
                    className="flex-1 py-3 rounded-xl font-medium bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 rounded-xl font-medium bg-zinc-100 hover:bg-white text-zinc-950 transition-colors"
                  >
                    Confirm Withdraw
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDashboard({ userProfile }: { userProfile: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (userProfile.role !== 'admin' && userProfile.email !== 'gedeonizabikora37@gmail.com') {
      navigate('/');
      return;
    }

    const q = query(collection(db, 'users'), orderBy('balance', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const u: UserProfile[] = [];
      snapshot.forEach((doc) => {
        u.push(doc.data() as UserProfile);
      });
      setUsers(u);
    }, (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'users');
      } catch (handledErr) {
        setError(handledErr as Error);
      }
    });

    return () => unsubscribe();
  }, [userProfile.role, navigate]);

  if (error) {
    throw error;
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const totalPlatformAssets = users.reduce((acc, u) => acc + u.balance, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans">
      <nav className="border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
              <ShieldAlert className="w-5 h-5 text-zinc-400" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Vault Admin</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-zinc-400">
            <Link to="/" className="hover:text-zinc-50 transition-colors">
              Back to App
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6">
            <h3 className="text-zinc-400 text-sm font-medium mb-2">Total Platform Assets</h3>
            <p className="text-3xl font-mono text-emerald-400">{formatCurrency(totalPlatformAssets)}</p>
          </div>
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6">
            <h3 className="text-zinc-400 text-sm font-medium mb-2">Total Users</h3>
            <p className="text-3xl font-mono text-zinc-50">{users.length}</p>
          </div>
        </div>

        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-zinc-800/50 flex items-center gap-2">
            <Users className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-medium">User Directory</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/50 bg-zinc-900/50">
                  <th className="p-4 text-sm font-medium text-zinc-400">User</th>
                  <th className="p-4 text-sm font-medium text-zinc-400">Role</th>
                  <th className="p-4 text-sm font-medium text-zinc-400 text-right">Balance</th>
                  <th className="p-4 text-sm font-medium text-zinc-400 text-right">Cost Basis</th>
                  <th className="p-4 text-sm font-medium text-zinc-400 text-right">Return</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const returnAmt = u.balance - u.costBasis;
                  const returnPct = u.costBasis > 0 ? (returnAmt / u.costBasis) * 100 : 0;
                  return (
                    <tr key={u.uid} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="p-4">
                        <p className="font-medium text-zinc-50">{u.name}</p>
                        <p className="text-sm text-zinc-500">{u.email}</p>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-zinc-50">
                        {formatCurrency(u.balance)}
                      </td>
                      <td className="p-4 text-right font-mono text-zinc-400">
                        {formatCurrency(u.costBasis)}
                      </td>
                      <td className="p-4 text-right font-mono text-emerald-400">
                        +{formatCurrency(returnAmt)} <span className="text-xs">({returnPct.toFixed(2)}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function MainApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            setUserProfile(userSnap.data() as UserProfile);
          } else {
            // Create new user profile
            const isAdminEmail = currentUser.email === 'gedeonizabikora37@gmail.com';
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              name: currentUser.displayName || 'Anonymous',
              role: isAdminEmail ? 'admin' : 'user',
              balance: 0,
              costBasis: 0,
              lastUpdate: new Date().toISOString()
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          }
        } catch (err) {
          try {
            handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
          } catch (handledErr) {
            setError(handledErr as Error);
          }
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen to profile updates
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setUserProfile(doc.data() as UserProfile);
      }
    }, (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      } catch (handledErr) {
        setError(handledErr as Error);
      }
    });
    return () => unsubscribe();
  }, [user]);

  if (error) {
    throw error;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || !userProfile) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard userProfile={userProfile} />} />
        <Route path="/admin" element={<AdminDashboard userProfile={userProfile} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
