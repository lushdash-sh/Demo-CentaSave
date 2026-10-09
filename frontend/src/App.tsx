import { useState, useEffect } from "react";
import {
  Coffee,
  Zap,
  TrendingUp,
  ShieldCheck,
  Flame,
  Award,
  ExternalLink,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import confetti from "canvas-confetti";

interface SweepEvent {
  txHash: string;
  merchantName: string;
  spendRupees: number;
  savedRupees: number;
  sweptMON: string;
  latencyMs: number;
  blockNumber: number;
}

const BACKEND_URL = "http://localhost:3001";
const DEMO_USER_ADDRESS = "0x1d4E38BE39939c60e8D513d7cb046Cb7179Fa8d1";

export default function App() {
  const [vaultAddress, setVaultAddress] = useState<string>("");
  const [totalSavedMON, setTotalSavedMON] = useState<string>("0.000000");
  const [depositCount, setDepositCount] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [badgeTier, setBadgeTier] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<SweepEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [customSpend, setCustomSpend] = useState<string>("");

  const badgeLabels = [
    { name: "Rookie Saver", color: "text-gray-400" },
    { name: "Tapri Regular ☕", color: "text-amber-400" },
    { name: "Cutting Connoisseur 🥐", color: "text-purple-400" },
    { name: "Chai Sovereign 👑", color: "text-yellow-400" },
  ];

  useEffect(() => {
    async function initVault() {
      try {
        // Load initial vault address & balance
        const res = await fetch(`${BACKEND_URL}/api/get-or-create-vault`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: DEMO_USER_ADDRESS }),
        });
        const data = await res.json();
        setVaultAddress(data.vaultAddress);
        fetchVaultData(data.vaultAddress);

        // Fetch past transaction history so stream isn't empty on refresh
        const historyRes = await fetch(`${BACKEND_URL}/api/history`);
        const history = await historyRes.json();
        if (Array.isArray(history) && history.length > 0) {
          setRecentEvents(history);
        }
      } catch (err) {
        console.error("Failed to load vault:", err);
      }
    }

    initVault();

    // Setup live SSE listener
    const eventSource = new EventSource(`${BACKEND_URL}/api/events`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "SWEEP_EXECUTED") {
          setRecentEvents((prev) => {
            if (prev.some((item) => item.txHash === data.txHash)) return prev;
            return [data, ...prev.slice(0, 9)];
          });
          confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
        }
      } catch {}
    };

    return () => eventSource.close();
  }, []);

  async function fetchVaultData(vAddress: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/vault/${vAddress}`);
      const data = await res.json();
      setTotalSavedMON(parseFloat(data.totalSavedMON).toFixed(6));
      setDepositCount(data.totalDepositsCount);
      setStreak(data.currentStreak);
      setBadgeTier(data.badgeTier);
    } catch (err) {
      console.error(err);
    }
  }

  // Trigger single UPI micro-sweep
  async function triggerPayment(merchantName: string, spendRupees: number) {
    if (!vaultAddress || isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/upi-sweep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress, spendRupees, merchantName }),
      });
      const data = await res.json();

      if (data && data.txHash) {
        setRecentEvents((prev) => {
          if (prev.some((item) => item.txHash === data.txHash)) return prev;
          return [data, ...prev.slice(0, 9)];
        });
        confetti({ particleCount: 35, spread: 70, origin: { y: 0.8 } });
      }

      await fetchVaultData(vaultAddress);
    } catch (err) {
      console.error("Payment failed", err);
    } finally {
      setIsProcessing(false);
    }
  }

  // Stress-Test: Campus Rush
  async function triggerCampusRush() {
    if (!vaultAddress || isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/simulate-rush`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress }),
      });
      const data = await res.json();

      if (data && data.events) {
        setRecentEvents((prev) => [...data.events, ...prev].slice(0, 10));
        confetti({ particleCount: 60, spread: 100, origin: { y: 0.8 } });
      }

      await fetchVaultData(vaultAddress);
    } catch (err) {
      console.error("Campus rush simulation failed", err);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0a12] text-gray-100 flex flex-col font-sans selection:bg-[#836EF9]/30">
      {/* Top Navbar */}
      <header className="border-b border-[#2A2845] bg-[#0F0E17]/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="bg-[#836EF9] text-white p-2 rounded-xl shadow-[0_0_15px_rgba(131,110,249,0.5)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              CentaSave <span className="text-xs px-2 py-0.5 rounded bg-[#836EF9]/20 text-[#836EF9] border border-[#836EF9]/30">MONAD V3</span>
            </h1>
            <p className="text-xs text-gray-400">Sub-second UPI Micro-Savings on Parallel EVM</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-[#181726] border border-[#2A2845] px-3 py-1.5 rounded-lg text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-gray-300">Monad Testnet (10143)</span>
          </div>
          <div className="text-xs font-mono bg-[#836EF9]/10 text-[#836EF9] px-3 py-1.5 rounded-lg border border-[#836EF9]/30">
            Vault: {vaultAddress ? `${vaultAddress.slice(0, 6)}...${vaultAddress.slice(-4)}` : "Deploying..."}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Tapri Terminal */}
        <section className="lg:col-span-5 flex flex-col space-y-6">
          <div className="bg-[#181726] border border-[#2A2845] rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2845]">
              <div className="flex items-center gap-2">
                <Coffee className="w-5 h-5 text-amber-400" />
                <h2 className="font-semibold text-lg">Pune Tapri Point-of-Sale</h2>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20">
                UPI Mock Rail
              </span>
            </div>

            <div className="mt-5 flex flex-col items-center justify-center p-4 bg-[#0F0E17] rounded-xl border border-[#2A2845]">
              <div className="w-36 h-36 bg-white p-2 rounded-lg flex items-center justify-center shadow-md">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=upi://pay?pa=tapri@pune&pn=CentaSaveChai"
                  alt="UPI QR Code"
                  className="w-full h-full"
                />
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">Scan or tap quick-items below</p>
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tapri Orders</label>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isProcessing}
                  onClick={() => triggerPayment("Cutting Chai", 12)}
                  className="flex flex-col p-3 bg-[#0F0E17] hover:bg-[#836EF9]/10 border border-[#2A2845] hover:border-[#836EF9]/50 rounded-xl transition text-left group disabled:opacity-50"
                >
                  <span className="font-medium text-sm group-hover:text-[#836EF9]">☕ Cutting Chai</span>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-400">Pay ₹12</span>
                    <span className="text-xs text-emerald-400 font-mono">+₹3 saved</span>
                  </div>
                </button>

                <button
                  disabled={isProcessing}
                  onClick={() => triggerPayment("Bun Maska", 28)}
                  className="flex flex-col p-3 bg-[#0F0E17] hover:bg-[#836EF9]/10 border border-[#2A2845] hover:border-[#836EF9]/50 rounded-xl transition text-left group disabled:opacity-50"
                >
                  <span className="font-medium text-sm group-hover:text-[#836EF9]">🥐 Bun Maska</span>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-400">Pay ₹28</span>
                    <span className="text-xs text-emerald-400 font-mono">+₹2 saved</span>
                  </div>
                </button>

                <button
                  disabled={isProcessing}
                  onClick={() => triggerPayment("FC Road Poha", 23)}
                  className="flex flex-col p-3 bg-[#0F0E17] hover:bg-[#836EF9]/10 border border-[#2A2845] hover:border-[#836EF9]/50 rounded-xl transition text-left group disabled:opacity-50"
                >
                  <span className="font-medium text-sm group-hover:text-[#836EF9]">🍛 FC Road Poha</span>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-400">Pay ₹23</span>
                    <span className="text-xs text-emerald-400 font-mono">+₹2 saved</span>
                  </div>
                </button>

                <button
                  disabled={isProcessing}
                  onClick={() => triggerPayment("Laptop / Rent", 14423)}
                  className="flex flex-col p-3 bg-[#0F0E17] hover:bg-[#836EF9]/10 border border-[#2A2845] hover:border-[#836EF9]/50 rounded-xl transition text-left group disabled:opacity-50"
                >
                  <span className="font-medium text-sm group-hover:text-[#836EF9]">💻 Large Rent/Fee</span>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-400">Pay ₹14,423</span>
                    <span className="text-xs text-emerald-400 font-mono">+₹7 clamp</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="number"
                placeholder="Enter custom ₹ (e.g. 18)"
                value={customSpend}
                onChange={(e) => setCustomSpend(e.target.value)}
                className="flex-1 bg-[#0F0E17] border border-[#2A2845] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#836EF9]"
              />
              <button
                disabled={!customSpend || isProcessing}
                onClick={() => {
                  triggerPayment("Custom Merchant", Number(customSpend));
                  setCustomSpend("");
                }}
                className="px-4 py-2 bg-[#836EF9] hover:bg-[#6B52ED] disabled:opacity-50 text-white font-medium text-sm rounded-xl transition"
              >
                Pay & Sweep
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-[#2A2845]">
              <button
                disabled={isProcessing}
                onClick={triggerCampusRush}
                className="w-full py-3 bg-gradient-to-r from-[#836EF9] to-indigo-600 hover:from-[#6B52ED] hover:to-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(131,110,249,0.3)] transition"
              >
                <Zap className="w-4 h-4 fill-white" />
                {isProcessing ? "Processing on Monad..." : "Simulate Pune Campus Rush (Parallel EVM)"}
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Live Stream & Vault */}
        <section className="lg:col-span-7 flex flex-col space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#181726] border border-[#2A2845] p-5 rounded-2xl">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Vault Balance</span>
                <TrendingUp className="w-4 h-4 text-[#836EF9]" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-white">
                {totalSavedMON} <span className="text-xs font-sans text-[#836EF9]">MON</span>
              </div>
              <div className="mt-1 text-xs text-emerald-400 font-mono">
                {depositCount} Micro-Deposits
              </div>
            </div>

            <div className="bg-[#181726] border border-[#2A2845] p-5 rounded-2xl">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Saving Streak</span>
                <Flame className="w-4 h-4 text-orange-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-orange-400 flex items-center gap-1 font-mono">
                {streak} <span className="text-xs font-sans text-gray-300">Days</span>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Daily auto-increment
              </div>
            </div>

            <div className="bg-[#181726] border border-[#2A2845] p-5 rounded-2xl">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Tier Status</span>
                <Award className="w-4 h-4 text-yellow-400" />
              </div>
              <div className={`mt-2 text-sm font-semibold truncate ${badgeLabels[badgeTier]?.color || "text-gray-300"}`}>
                {badgeLabels[badgeTier]?.name || "Rookie"}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Tier {badgeTier} of 3
              </div>
            </div>
          </div>

          <div className="bg-[#181726] border border-[#2A2845] rounded-2xl p-6 flex-1 flex flex-col shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2845]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-base">Live Sub-Second Monad Stream</h3>
              </div>
              <span className="text-xs text-gray-400 font-mono">
                {recentEvents.length > 0 ? `${recentEvents.length} Recent Sweeps` : "Ready"}
              </span>
            </div>

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto max-h-[360px] pr-1">
              {recentEvents.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-gray-500 text-sm">
                  <Coffee className="w-8 h-8 mb-2 stroke-1 opacity-50" />
                  Tap an order on the left to fire your first real-time transaction!
                </div>
              ) : (
                recentEvents.map((evt, idx) => (
                  <div
                    key={`${evt.txHash}-${idx}`}
                    className="p-3 bg-[#0F0E17] border border-[#2A2845] rounded-xl flex items-center justify-between hover:border-[#836EF9]/50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#836EF9]/10 text-[#836EF9] flex items-center justify-center font-bold text-xs">
                        ₹
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white flex items-center gap-2">
                          {evt.merchantName}
                          <span className="text-xs text-gray-400 font-normal">
                            (Paid ₹{evt.spendRupees})
                          </span>
                        </div>
                        <div className="text-xs text-emerald-400 font-mono">
                          +{evt.sweptMON} MON swept (₹{evt.savedRupees} change)
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-[11px] font-mono text-purple-400 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                        {evt.latencyMs}ms block finality
                      </span>
                      <a
                        href={`https://testnet.monadexplorer.com/tx/${evt.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 mt-1 underline"
                      >
                        {evt.txHash.slice(0, 8)}... <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer Visualizer */}
      <footer className="border-t border-[#2A2845] bg-[#0F0E17] p-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-sm font-semibold text-white">Why CentaSave is Only Possible on Monad</div>
              <div className="text-xs text-gray-400">Real-time gas expenditure comparison for {depositCount} micro-sweeps</div>
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs">
            <div className="bg-emerald-950/30 border border-emerald-500/30 px-4 py-2 rounded-xl">
              <span className="text-gray-400 block text-[10px]">MONAD GAS SPENT</span>
              <span className="text-emerald-400 font-bold text-sm">
                ${(depositCount * 0.00002).toFixed(5)}
              </span>
            </div>

            <div className="bg-rose-950/30 border border-rose-500/30 px-4 py-2 rounded-xl">
              <span className="text-gray-400 block text-[10px]">ETHEREUM MAINNET GAS</span>
              <span className="text-rose-400 font-bold text-sm">
                ${(depositCount * 4.25).toFixed(2)} <span className="text-[10px] text-rose-500 font-normal">(WIPED OUT)</span>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}