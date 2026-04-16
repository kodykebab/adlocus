"use client";
import { useState, useEffect, useRef } from "react";
import { ethers, BrowserProvider } from "ethers";
import EAXJson from "../../contracts/out/EAX.sol/EAX.json";
import Link from "next/link";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function PublisherDemo() {
  const [status, setStatus] = useState("Connecting wallet...");
  const [ad, setAd] = useState<any>(null);
  const [impression, setImpression] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { checkAndServe(); }, []);

  const checkAndServe = async () => {
    try {
      if (!window.ethereum) { setStatus("No wallet detected. Install MetaMask."); setLoading(false); return; }
      const provider = new BrowserProvider(window.ethereum as any);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const contractAddress = process.env.NEXT_PUBLIC_EAX_CONTRACT_ADDRESS || "";
      if (!contractAddress) { setStatus("Contract address not configured."); setLoading(false); return; }

      const contract = new ethers.Contract(contractAddress, EAXJson.abi, signer);
      const hasMatch = await contract.hasActiveMatch(userAddress);
      if (!hasMatch) {
        setStatus("No active ad match found. Run a match first.");
        setLoading(false);
        return;
      }

      const advId = Number(await contract.activeAdvertiser(userAddress));
      setStatus(`Match found — Advertiser #${advId}. Loading ad...`);

      const res = await fetch(`${BACKEND_URL}/getAd/${advId}`);
      if (!res.ok) {
        setStatus(`Advertiser #${advId} has no creative uploaded yet.`);
        setLoading(false);
        return;
      }

      const adData = await res.json();
      setAd(adData);
      setStatus(`Serving ad from Advertiser #${advId}`);
      setLoading(false);
    } catch (e: any) {
      setStatus("Error: " + e.message);
      setLoading(false);
    }
  };

  const handleRecordImpression = async () => {
    try {
      setStatus("Confirm impression in wallet...");
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contractAddress = process.env.NEXT_PUBLIC_EAX_CONTRACT_ADDRESS || "";
      const contract = new ethers.Contract(contractAddress, EAXJson.abi, signer);

      const tx = await contract.recordImpression();
      setStatus("Recording on-chain...");
      const receipt = await tx.wait();

      const iface = new ethers.Interface(EAXJson.abi);
      let payout = 0, advId = 0;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed?.name === "ImpressionRecorded") { advId = Number(parsed.args[1]); payout = Number(parsed.args[2]); break; }
        } catch {}
      }

      setImpression({ txHash: tx.hash, payout, advId });
      setStatus(`✓ Earned ${payout} ATTN!`);
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
          <Link href="/advertiser" className="text-white/50 hover:text-white text-sm transition-colors px-4 py-2 border border-white/10 rounded-lg hover:border-white/25">
            For Advertisers
          </Link>
          <Link href="/" className="text-white/50 hover:text-white text-sm transition-colors px-4 py-2 border border-white/10 rounded-lg hover:border-white/25">
            ← Home
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-white/40 mb-4">
            <span className="w-8 h-px bg-white/20" />
            Publisher Demo
          </span>
          <h1 className="text-5xl lg:text-6xl font-display tracking-tight text-white mb-4">
            Serve ads.
            <br />
            <span className="text-white/50">Earn ATTN.</span>
          </h1>
          <p className="text-lg text-white/50 leading-relaxed max-w-xl">
            This page simulates a publisher website using the EAX SDK. 
            It reads the on-chain match, fetches the ad creative, and records impressions for payout.
          </p>
        </div>

        {/* SDK preview */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-mono text-white/30 bg-white/[0.05] px-2.5 py-1 rounded">integration.js</span>
            <span className="text-xs text-white/20">How this page works</span>
          </div>
          <pre className="text-sm text-white/60 font-mono leading-relaxed overflow-x-auto"><code>{`import { initEAX, getAd, renderAd } from "eax-sdk";

await initEAX({ contractAddress, backendUrl });
const ad = await getAd();     // reads chain + fetches creative
await renderAd(slot, ad);     // renders + triggers payout`}</code></pre>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-5 py-3 mb-8">
          {loading && <span className="w-2 h-2 rounded-full bg-white/40 animate-pulse"></span>}
          <span className={`text-sm font-mono ${status.startsWith("✓") ? "text-emerald-400" : status.startsWith("Error") ? "text-red-400" : "text-white/60"}`}>
            {status}
          </span>
        </div>

        {/* Ad Slot */}
        {ad && !impression && (
          <div className="space-y-6">
            {/* The ad card */}
            <div className="border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-mono text-white/30 uppercase tracking-widest">Ad Slot — EAX SDK</span>
                <span className="text-[11px] text-white/20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Privacy-preserving
                </span>
              </div>
              
              <div className="p-8 flex justify-center">
                <div className="max-w-sm w-full">
                  {ad.image && (
                    <img src={ad.image} alt={ad.title} className="w-full rounded-xl mb-6 object-cover max-h-[200px] border border-white/10" />
                  )}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="bg-white/10 border border-white/15 px-2.5 py-0.5 rounded text-[11px] text-white/60 tracking-wide font-mono">EAX AD</span>
                  </div>
                  <h3 className="text-2xl font-display text-white mb-4">{ad.title}</h3>
                  <a 
                    href={ad.link} target="_blank" rel="noopener noreferrer" 
                    className="inline-block bg-white text-black px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-white/90 transition-colors"
                  >
                    {ad.cta || "Learn More"}
                  </a>
                  <p className="mt-4 text-[11px] text-white/30">🔒 Matched via encrypted intent vectors</p>
                </div>
              </div>
            </div>

            {/* Record impression */}
            <button
              onClick={handleRecordImpression}
              className="w-full bg-white text-black text-base font-bold py-4 rounded-xl hover:bg-white/90 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            >
              Confirm Impression → Earn ATTN
            </button>
            <p className="text-xs text-white/30 text-center">
              Calls <code className="text-white/50">recordImpression()</code> on-chain. You receive the advertiser&apos;s bid in ATTN tokens.
            </p>
          </div>
        )}

        {/* Payout result */}
        {impression && (
          <div className="border border-emerald-500/20 rounded-2xl p-10 text-center bg-emerald-500/[0.03]">
            <span className="text-emerald-400 text-lg font-semibold">Impression Recorded</span>
            <div className="text-6xl font-display text-white mt-4 mb-3">+{impression.payout} ATTN</div>
            <p className="text-white/40 text-sm mb-6">
              Earned for viewing Advertiser #{impression.advId}&apos;s ad
            </p>
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 font-mono text-xs text-emerald-400/70 break-all mb-6">
              Tx: {impression.txHash}
            </div>
            <Link href="/" className="text-white/50 hover:text-white text-sm underline underline-offset-4 transition-colors">
              Back to home →
            </Link>
          </div>
        )}

        {/* No match state */}
        {!ad && !loading && (
          <div className="border border-white/10 rounded-2xl p-12 text-center">
            <div className="text-4xl mb-4">📡</div>
            <h2 className="text-2xl font-display text-white mb-3">No ad to serve</h2>
            <p className="text-white/40 text-sm mb-8 max-w-md mx-auto">
              No active match found for your wallet. Run a match on the main dApp first, then come back here to see the served ad.
            </p>
            <Link 
              href="/app" 
              className="inline-block bg-white text-black px-8 py-3 rounded-xl font-bold text-sm hover:bg-white/90 transition-colors"
            >
              Run a Match First →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
