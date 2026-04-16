"use client";
import { useEffect, useState } from "react";
import { ethers, BrowserProvider } from "ethers";
import EAXJson from "../../contracts/out/EAX.sol/EAX.json";
import Link from "next/link";

export default function AppPage() {
  const [vector, setVector] = useState<number[] | null>(null);
  const [status, setStatus] = useState("Waiting for Chrome Extension...");
  const [txHash, setTxHash] = useState("");
  const [advertiserId, setAdvertiserId] = useState<number | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "EAX_USER_VECTOR_TO_APP") {
        console.log("Received vector from extension:", event.data.vector);
        setVector(event.data.vector);
        setStatus("Intent vector received. Ready to encrypt on-chain.");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleMatch = async () => {
    if (!vector) return;
    setStatus("Initiating fully homomorphic encryption sequence...");

    try {
      if (!window.ethereum) {
        setStatus("Error: No Ethereum wallet detected. Install MetaMask.");
        return;
      }
      
      const provider = new BrowserProvider(window.ethereum as any);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      
      setStatus("Connecting to Ethereum Sepolia CoFHE Network...");
      const { createCofheConfig, createCofheClient } = await import('@cofhe/sdk/web');
      const { chains } = await import('@cofhe/sdk/chains');
      const { Ethers6Adapter } = await import('@cofhe/sdk/adapters');

      const config = createCofheConfig({ supportedChains: [chains.sepolia] });
      const cofheClient = createCofheClient(config);

      const { publicClient, walletClient } = await Ethers6Adapter(provider, signer);
      await cofheClient.connect(publicClient, walletClient);
      
      setStatus("Encrypting vector via CoFHE ZK proof pipeline...");
      const { Encryptable } = await import('@cofhe/sdk');

      const encryptedInputs = await cofheClient.encryptInputs(
        vector.map(val => Encryptable.uint64(BigInt(val)))
      ).execute();

      const encryptedVector = encryptedInputs.map((enc: any) => [
        enc.ctHash,
        enc.securityZone,
        enc.utype,
        enc.signature
      ]);
      
      const contractAddress = process.env.NEXT_PUBLIC_EAX_CONTRACT_ADDRESS || "";
      if (!contractAddress) {
        setStatus("Error: EAX contract address not set in .env.local.");
        return;
      }

      const contract = new ethers.Contract(contractAddress, EAXJson.abi, signer);
      
      setStatus("Confirm encryption match transaction in your wallet.");
      const tx = await contract.matchIntent(encryptedVector);
      setTxHash(tx.hash);
      
      setStatus("Transaction submitted. Computing FHE match on Fhenix CoFHE...");
      const receipt = await tx.wait();

      const iface = new ethers.Interface(EAXJson.abi);
      let taskId: bigint | undefined;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed?.name === 'MatchSubmitted') {
            taskId = parsed.args[0];
            break;
          }
        } catch { /* skip non-EAX logs */ }
      }

      if (taskId === undefined) {
        setStatus("Error: Could not parse MatchSubmitted event.");
        return;
      }

      setStatus(`Task #${taskId} created. Reading encrypted handle...`);

      const task = await contract.tasks(taskId);
      const winnerCtHash = task[0];

      setStatus("Waiting for CoFHE coprocessor to finish FHE computation...");
      await cofheClient.permits.getOrCreateSelfPermit();

      let winnerResult: any;
      const MAX_RETRIES = 12;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          setStatus(`Requesting threshold decryption (attempt ${attempt}/${MAX_RETRIES})...`);
          winnerResult = await cofheClient.decryptForTx(winnerCtHash).withPermit().execute();
          break;
        } catch (err: any) {
          const is428 = err?.message?.includes("428") || err?.message?.includes("Precondition");
          if (is428 && attempt < MAX_RETRIES) {
            setStatus(`CoFHE still computing (${attempt}/${MAX_RETRIES}). Retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          throw err;
        }
      }

      if (!winnerResult) throw new Error("Threshold decryption timed out.");
      const winnerIndex = Number(winnerResult.decryptedValue);

      setStatus(`Decrypted! Winner: Advertiser #${winnerIndex}. Revealing on-chain...`);
      const revealTx = await contract.revealMatch(taskId, winnerIndex, winnerResult.signature);
      await revealTx.wait();

      setAdvertiserId(winnerIndex);
      setStatus(`✓ Ad assigned! Advertiser #${winnerIndex}. Visit /demo to see your ad.`);

    } catch (e: any) {
        setStatus("Error: " + (e.reason || e.message));
        console.error(e);
    }
  };

  const categories = ["crypto", "ai", "finance", "gaming", "dev"];

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
          <Link href="/advertiser" className="text-white/50 hover:text-white text-sm transition-colors px-4 py-2 border border-white/10 rounded-lg hover:border-white/25">
            For Advertisers
          </Link>
          <Link href="/" className="text-white/50 hover:text-white text-sm transition-colors px-4 py-2 border border-white/10 rounded-lg hover:border-white/25">
            ← Home
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-white/40 mb-4">
            <span className="w-8 h-px bg-white/20" />
            Encrypted Attention Exchange
          </span>
          <h1 className="text-5xl lg:text-6xl font-display tracking-tight text-white mb-4">
            Encrypt &
            <br />
            <span className="text-white/50">match your intent.</span>
          </h1>
          <p className="text-lg text-white/50 leading-relaxed max-w-xl">
            Your Chrome extension evaluates browsing intent locally, then this 
            page encrypts it via FHE and matches it against advertiser targets on-chain.
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-5 py-3 mb-8">
          <span className={`w-2 h-2 rounded-full ${
            status.startsWith("✓") ? "bg-emerald-400" : 
            status.startsWith("Error") ? "bg-red-400" : 
            "bg-white/40 animate-pulse"
          }`}></span>
          <span className={`text-sm font-mono ${
            status.startsWith("✓") ? "text-emerald-400" : 
            status.startsWith("Error") ? "text-red-400" : 
            "text-white/60"
          }`}>{status}</span>
        </div>

        {/* Vector display */}
        {vector && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-8">
            <span className="text-sm text-white/40 font-mono block mb-4">Locally Evaluated Intent Vector</span>
            <div className="flex gap-3 justify-center">
              {vector.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className={`flex items-center justify-center w-14 h-14 rounded-xl text-xl font-bold transition-all ${
                    v === 1 
                      ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.15)]' 
                      : 'bg-white/[0.04] text-white/30 border border-white/10'
                  }`}>
                    {v}
                  </div>
                  <span className="text-[11px] text-white/30 font-mono">{categories[i]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tx hash */}
        {txHash && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-8 font-mono text-xs text-white/50 break-all">
            Tx: <span className="text-emerald-400/70">{txHash}</span>
          </div>
        )}

        {/* Result */}
        {advertiserId !== null && (
          <div className="border border-emerald-500/20 rounded-2xl p-8 mb-8 text-center bg-emerald-500/[0.03]">
            <span className="text-emerald-400 text-lg font-semibold">Ad Assigned!</span>
            <div className="text-5xl font-display text-white mt-3 mb-2">Advertiser #{advertiserId}</div>
            <Link href="/demo" className="text-white/50 hover:text-white text-sm underline underline-offset-4 transition-colors">
              View your ad & earn ATTN →
            </Link>
          </div>
        )}

        {/* Action button */}
        <button 
          onClick={handleMatch}
          disabled={!vector || !!txHash}
          className="w-full bg-white text-black text-base font-bold py-4 rounded-xl hover:bg-white/90 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
        >
          {!vector ? "Awaiting Extension..." : "Encrypt & Match My Attention"}
        </button>

        {/* Info bar */}
        <div className="flex items-center justify-center gap-6 mt-8 text-xs text-white/25 font-mono">
          <span>🔒 128-bit FHE</span>
          <span className="w-1 h-1 rounded-full bg-white/10"></span>
          <span>🧠 Local AI</span>
          <span className="w-1 h-1 rounded-full bg-white/10"></span>
          <span>📡 Cross-Site Serving</span>
        </div>
      </div>
    </div>
  );
}
