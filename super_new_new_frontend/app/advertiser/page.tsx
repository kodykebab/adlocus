"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ethers, BrowserProvider } from "ethers";
import EAXJson from "../../contracts/out/EAX.sol/EAX.json";
import MockERC20Json from "../../contracts/out/MockERC20.sol/MockERC20.json";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

interface AnalyticsData {
  impressions: number;
  totalSpend: number;
  spendRate: number;
  avgPayoutInterval: string;
  winRate: number;
  remainingBudget: number;
  matchCount: number;
}

export default function RegisterAdvertiser() {
  const [bid, setBid] = useState<number>(10);
  const [budget, setBudget] = useState<number>(100);
  const [vector, setVector] = useState<number[]>([0, 0, 0, 0, 0]);
  const categories = ["crypto", "ai", "finance", "gaming", "dev"];
  const [txHash, setTxHash] = useState("");
  const [status, setStatus] = useState("Awaiting Configuration");
  const [assignedId, setAssignedId] = useState<number | null>(null);

  const [adTitle, setAdTitle] = useState("");
  const [adImage, setAdImage] = useState("");
  const [adCta, setAdCta] = useState("Learn More");
  const [adLink, setAdLink] = useState("");

  // Analytics state
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");

  // Poll analytics whenever assignedId is set
  useEffect(() => {
    if (assignedId === null) return;
    setAnalyticsError("");

    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/analytics?advertiserId=${assignedId}`);
        if (res.ok) {
          setAnalytics(await res.json());
          setAnalyticsError("");
        } else {
          setAnalyticsError("Backend returned an error.");
        }
      } catch {
        setAnalyticsError("Cannot reach backend at " + BACKEND_URL);
      }
    };

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 3000);
    return () => clearInterval(interval);
  }, [assignedId]);

  const handleLookup = () => {
    const id = parseInt(lookupId);
    if (isNaN(id) || id < 0) {
      setAnalyticsError("Enter a valid advertiser ID (0, 1, 2, ...)");
      return;
    }
    setAssignedId(id);
  };

  const toggleCategory = (index: number) => {
    const newVector = [...vector];
    newVector[index] = newVector[index] === 1 ? 0 : 1;
    setVector(newVector);
  };

  const handleFaucet = async () => {
    setStatus("Requesting 10,000 ATTN from faucet...");
    try {
      if (!window.ethereum) { setStatus("Error: No wallet detected."); return; }
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const tokenAddress = process.env.NEXT_PUBLIC_ATTN_TOKEN_ADDRESS || "";
      if (!tokenAddress) { setStatus("Error: ATTN token address not set."); return; }
      const token = new ethers.Contract(tokenAddress, MockERC20Json.abi, signer);
      const tx = await token.faucet();
      setStatus("Waiting for faucet confirmation...");
      await tx.wait();
      setStatus("✓ Minted 10,000 ATTN test tokens!");
    } catch (e: any) {
      setStatus("Faucet Error: " + (e.reason || e.message));
    }
  };

  const handleRegister = async () => {
    if (vector.every(v => v === 0)) { setStatus("Select at least one category."); return; }
    if (!adTitle || !adLink) { setStatus("Ad title and link are required."); return; }
    setStatus("Initiating registration...");
    try {
      if (!window.ethereum) { setStatus("Error: No wallet detected."); return; }
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contractAddress = process.env.NEXT_PUBLIC_EAX_CONTRACT_ADDRESS || "";
      const tokenAddress = process.env.NEXT_PUBLIC_ATTN_TOKEN_ADDRESS || "";
      if (!contractAddress || !tokenAddress) { setStatus("Error: Contract addresses not set."); return; }

      const token = new ethers.Contract(tokenAddress, MockERC20Json.abi, signer);
      const contract = new ethers.Contract(contractAddress, EAXJson.abi, signer);

      setStatus("Step 1/2 — Approve ATTN spend...");
      const budgetInWei = ethers.parseUnits(budget.toString(), 18);
      const approveTx = await token.approve(contractAddress, budgetInWei);
      await approveTx.wait();
      
      setStatus("Step 2/2 — Register on-chain...");
      const tx = await contract.registerAdvertiser(vector, bid, budget);
      setTxHash(tx.hash);
      setStatus("Confirming...");
      const receipt = await tx.wait();

      const iface = new ethers.Interface(EAXJson.abi);
      let advertiserId: number | undefined;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed?.name === 'AdvertiserRegistered') { advertiserId = Number(parsed.args[0]); break; }
        } catch {}
      }

      if (advertiserId === undefined) { setStatus("Confirmed but could not parse ID."); return; }
      setAssignedId(advertiserId);
      setStatus(`On-chain OK (ID: ${advertiserId}). Uploading creative...`);

      const res = await fetch(`${BACKEND_URL}/registerAd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advertiserId, title: adTitle, image: adImage, cta: adCta, link: adLink, budget }),
      });

      if (!res.ok) { setStatus(`On-chain OK but creative upload failed. Backend running?`); return; }
      setStatus(`✓ Advertiser #${advertiserId} fully registered!`);
    } catch (e: any) {
      setStatus("Error: " + (e.reason || e.message));
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white font-sans">
      {/* Top nav */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-display">EAX</span>
          <span className="text-xs text-white/40 font-mono">protocol</span>
        </Link>
        <div className="flex gap-3">
          <Link href="/demo" className="text-white/50 hover:text-white text-sm transition-colors px-4 py-2 border border-white/10 rounded-lg hover:border-white/25">
            Publisher Demo
          </Link>
          <Link href="/" className="text-white/50 hover:text-white text-sm transition-colors px-4 py-2 border border-white/10 rounded-lg hover:border-white/25">
            ← Home
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-white/40 mb-4">
            <span className="w-8 h-px bg-white/20" />
            For Advertisers
          </span>
          <h1 className="text-5xl lg:text-6xl font-display tracking-tight text-white mb-4">
            Target encrypted
            <br />
            <span className="text-white/50">intent blindly.</span>
          </h1>
          <p className="text-lg text-white/50 leading-relaxed max-w-xl">
            Select categories, set your ATTN bid, upload your ad creative. 
            EAX matches your targeting against encrypted user vectors on-chain.
          </p>
        </div>

        {/* ─── Analytics Lookup ─── */}
        <div className="mb-12 bg-white/[0.02] border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-white/50 uppercase tracking-widest">
              Live Analytics Dashboard
            </span>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-white/40 uppercase tracking-wide mb-2 font-mono">
                Advertiser ID
              </label>
              <input
                type="number"
                min="0"
                placeholder="Enter ID (e.g. 0, 1, 2...)"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                className="w-full bg-black text-white px-4 py-3 rounded-xl border border-white/10 focus:border-white/30 text-sm font-mono focus:outline-none transition-colors"
              />
            </div>
            <button
              onClick={handleLookup}
              className="px-6 py-3 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 transition-all"
            >
              Load Metrics
            </button>
          </div>

          {analyticsError && (
            <p className="mt-3 text-xs text-red-400 font-mono">{analyticsError}</p>
          )}

          {/* Analytics Cards */}
          {assignedId !== null && analytics && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-white/60 font-mono">
                  Advertiser <span className="text-white font-bold">#{assignedId}</span>
                </span>
                <span className="text-xs text-white/30 font-mono">
                  Polling every 3s
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Impressions */}
                <div className="bg-black border border-white/[0.08] rounded-xl p-5 group hover:border-white/20 transition-colors">
                  <div className="text-white/35 text-[10px] font-mono uppercase tracking-widest mb-3">Impressions</div>
                  <div className="text-3xl font-display text-white tabular-nums">
                    {analytics.impressions}
                  </div>
                </div>

                {/* Total Spend */}
                <div className="bg-black border border-white/[0.08] rounded-xl p-5 group hover:border-white/20 transition-colors">
                  <div className="text-white/35 text-[10px] font-mono uppercase tracking-widest mb-3">Total Spend</div>
                  <div className="text-3xl font-display text-white tabular-nums">
                    {analytics.totalSpend.toLocaleString()}
                    <span className="text-sm text-white/25 ml-1">ATTN</span>
                  </div>
                </div>

                {/* Spend Rate */}
                <div className="bg-black border border-white/[0.08] rounded-xl p-5 group hover:border-white/20 transition-colors">
                  <div className="text-white/35 text-[10px] font-mono uppercase tracking-widest mb-3">Spend Rate</div>
                  <div className="text-3xl font-display text-white tabular-nums">
                    {analytics.spendRate}
                    <span className="text-sm text-white/25 ml-1">/ min</span>
                  </div>
                </div>

                {/* Avg Payout Interval */}
                <div className="bg-black border border-white/[0.08] rounded-xl p-5 group hover:border-white/20 transition-colors">
                  <div className="text-white/35 text-[10px] font-mono uppercase tracking-widest mb-3">Payout Interval</div>
                  <div className="text-3xl font-display text-white tabular-nums">
                    {analytics.avgPayoutInterval}
                  </div>
                  <div className="text-[10px] text-white/20 mt-1 font-mono">avg between payouts</div>
                </div>

                {/* Win Rate */}
                <div className="bg-black border border-white/[0.08] rounded-xl p-5 group hover:border-white/20 transition-colors">
                  <div className="text-white/35 text-[10px] font-mono uppercase tracking-widest mb-3">Win Rate</div>
                  <div className="text-3xl font-display text-white tabular-nums">
                    {(analytics.winRate * 100).toFixed(0)}
                    <span className="text-sm text-white/25 ml-1">%</span>
                  </div>
                  <div className="text-[10px] text-white/20 mt-1 font-mono">{analytics.matchCount} matches</div>
                </div>

                {/* Remaining Budget */}
                <div className="bg-black border border-white/[0.08] rounded-xl p-5 group hover:border-white/20 transition-colors">
                  <div className="text-white/35 text-[10px] font-mono uppercase tracking-widest mb-3">Budget Left</div>
                  <div className="text-3xl font-display text-white tabular-nums">
                    {analytics.remainingBudget.toLocaleString()}
                    <span className="text-sm text-white/25 ml-1">ATTN</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {assignedId !== null && !analytics && !analyticsError && (
            <div className="mt-6 text-center py-8">
              <div className="inline-block w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <p className="text-xs text-white/30 mt-3 font-mono">Loading metrics...</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.06] my-12" />

        {/* Status Bar */}
        <div className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-5 py-3 mb-8">
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${status.startsWith("✓") ? "bg-emerald-400" : status.startsWith("Error") ? "bg-red-400" : "bg-white/30 animate-pulse"}`}></span>
            <span className="text-sm text-white/70 font-mono">{status}</span>
          </div>
          {assignedId !== null && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1 rounded-full">
              ID: {assignedId}
            </span>
          )}
        </div>

        {/* Form */}
        <div className="space-y-8">

          {/* ─── Categories ─── */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-4 tracking-wide uppercase">
              Target Interests
            </label>
            <div className="flex flex-wrap gap-3">
              {categories.map((cat, i) => (
                <button 
                  key={cat} 
                  onClick={() => toggleCategory(i)}
                  className={`px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-200 border ${
                    vector[i] === 1 
                      ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.15)]' 
                      : 'bg-white/[0.04] text-white/60 border-white/10 hover:border-white/30 hover:text-white/80'
                  }`}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Bid & Budget ─── */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
              <label className="block text-sm font-medium text-white/60 mb-3 uppercase tracking-wide">Max Bid</label>
              <div className="flex items-baseline gap-2">
                <input 
                  type="number" min="1" value={bid} 
                  onChange={(e) => setBid(parseInt(e.target.value) || 0)}
                  className="bg-transparent text-white font-display text-4xl w-24 focus:outline-none border-b-2 border-white/20 focus:border-white/60 transition-colors text-center"
                />
                <span className="text-white/40 text-sm font-mono">ATTN</span>
              </div>
              <p className="text-xs text-white/30 mt-3">Per impression served</p>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
              <label className="block text-sm font-medium text-white/60 mb-3 uppercase tracking-wide">Total Budget</label>
              <div className="flex items-baseline gap-2">
                <input 
                  type="number" min="1" value={budget} 
                  onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
                  className="bg-transparent text-white font-display text-4xl w-24 focus:outline-none border-b-2 border-white/20 focus:border-white/60 transition-colors text-center"
                />
                <span className="text-white/40 text-sm font-mono">ATTN</span>
              </div>
              <p className="text-xs text-white/30 mt-3">Locked to fund bids</p>
            </div>
          </div>

          {/* Faucet */}
          <button 
            onClick={handleFaucet} 
            className="text-sm text-white/50 hover:text-white border border-white/10 hover:border-white/30 px-5 py-2.5 rounded-lg transition-all hover:bg-white/[0.03]"
          >
            💧 Get 10,000 Test ATTN
          </button>

          {/* ─── Ad Creative ─── */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-4 tracking-wide uppercase">
              Ad Creative
            </label>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Ad Title (e.g. Buy Crypto Today)"
                value={adTitle}
                onChange={(e) => setAdTitle(e.target.value)}
                className="w-full bg-white/[0.04] text-white placeholder:text-white/25 px-5 py-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-white/30 transition-colors text-sm"
              />
              <input
                type="url"
                placeholder="Image URL (optional)"
                value={adImage}
                onChange={(e) => setAdImage(e.target.value)}
                className="w-full bg-white/[0.04] text-white placeholder:text-white/25 px-5 py-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-white/30 transition-colors text-sm"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="CTA Button Text"
                  value={adCta}
                  onChange={(e) => setAdCta(e.target.value)}
                  className="bg-white/[0.04] text-white placeholder:text-white/25 px-5 py-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-white/30 transition-colors text-sm"
                />
                <input
                  type="url"
                  placeholder="Landing Page URL"
                  value={adLink}
                  onChange={(e) => setAdLink(e.target.value)}
                  className="bg-white/[0.04] text-white placeholder:text-white/25 px-5 py-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-white/30 transition-colors text-sm"
                />
              </div>
            </div>
          </div>

          {/* ─── Submit ─── */}
          <button 
            onClick={handleRegister}
            className="w-full bg-white text-black text-base font-bold py-4 rounded-xl hover:bg-white/90 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          >
            Register Intent Target + Ad Creative
          </button>

          {txHash && (
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 font-mono text-xs text-white/50 break-all">
              Tx: <span className="text-white/70">{txHash}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
