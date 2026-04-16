"use client";
import { useEffect, useState } from "react";
import { ethers, BrowserProvider } from "ethers";
import EAXJson from "../contracts/out/EAX.sol/EAX.json";

export default function Home() {
  const [vector, setVector] = useState<number[] | null>(null);
  const [status, setStatus] = useState("Waiting for Chrome Extension...");
  const [txHash, setTxHash] = useState("");
  const [advertiserId, setAdvertiserId] = useState<number | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "EAX_USER_VECTOR_TO_APP") {
        console.log("Received vector from extension:", event.data.vector);
        setVector(event.data.vector);
        setStatus("Intent Vector Received. Ready to Encrypt on-chain.");
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
        setStatus("Error: Metamask / Ethereum wallet not detected. Please install a wallet.");
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
      
      const contractAddress = process.env.NEXT_PUBLIC_EAX_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
      if (contractAddress === "0x0000000000000000000000000000000000000000") {
          setStatus("Error: NEXT_PUBLIC_EAX_CONTRACT_ADDRESS is not set inside your .env.local file.");
          return;
      }

      const contract = new ethers.Contract(contractAddress, EAXJson.abi, signer);
      
      // Phase 1: Submit encrypted match
      setStatus("Confirm encryption match transaction in your wallet.");
      const tx = await contract.matchIntent(encryptedVector);
      setTxHash(tx.hash);
      
      setStatus("Transaction submitted. Computing FHE match on Fhenix CoFHE...");
      const receipt = await tx.wait();

      // Parse MatchSubmitted event to get taskId
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
        setStatus("Error: Could not parse MatchSubmitted event from receipt.");
        return;
      }

      setStatus(`Task #${taskId} created. Reading encrypted handle...`);

      // Read the encrypted winnerIndex handle
      const task = await contract.tasks(taskId);
      const winnerCtHash = task[0]; // bytes32 (euint8 handle)

      // Phase 2: Threshold decryption
      // The CoFHE coprocessor computes FHE operations asynchronously after the tx confirms.
      // We must wait for the result handle to be ready before requesting decryption.
      setStatus("Waiting for CoFHE coprocessor to finish FHE computation...");
      await cofheClient.permits.getOrCreateSelfPermit();

      let winnerResult: any;
      const MAX_RETRIES = 12;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          setStatus(`Requesting threshold decryption (attempt ${attempt}/${MAX_RETRIES})...`);
          winnerResult = await cofheClient.decryptForTx(winnerCtHash).withPermit().execute();
          break; // Success
        } catch (err: any) {
          const is428 = err?.message?.includes("428") || err?.message?.includes("Precondition");
          if (is428 && attempt < MAX_RETRIES) {
            setStatus(`CoFHE still computing (attempt ${attempt}/${MAX_RETRIES}). Retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          throw err; // Non-428 error or final attempt
        }
      }

      if (!winnerResult) throw new Error("Threshold decryption timed out after all retries.");
      const winnerIndex = Number(winnerResult.decryptedValue);

      // Phase 3: Reveal match on-chain (assigns activeAdvertiser, NO payment)
      setStatus(`Decrypted! Winner: Advertiser #${winnerIndex}. Revealing on-chain...`);
      const revealTx = await contract.revealMatch(taskId, winnerIndex, winnerResult.signature);
      await revealTx.wait();

      setAdvertiserId(winnerIndex);
      setStatus(`Ad assigned! Advertiser #${winnerIndex} will be served on any site with EAX SDK. Visit /demo to see your ad and earn ATTN.`);

    } catch (e: any) {
        setStatus("Encryption/Transaction Error: " + (e.reason || e.message));
        console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden flex flex-col justify-center items-center relative">
      {/* Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#10b981] opacity-20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#3b82f6] opacity-20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="z-10 bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 p-10 rounded-3xl shadow-2xl w-full max-w-2xl text-center">
        <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-500 text-transparent bg-clip-text mb-6">
          Encrypted Attention Exchange
        </h1>
        <p className="text-zinc-400 text-lg mb-10 leading-relaxed text-balance">
          Monetize your browsing history without revealing it. Your intent is encrypted locally, processed blindly by advertisers, and you get paid when ads are served.
        </p>

        <div className="bg-zinc-800/50 p-6 rounded-2xl mb-8 border border-zinc-700/50 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-medium">Status</span>
            <span className="bg-zinc-900 px-3 py-1 rounded-full text-sm text-emerald-400 font-mono tracking-wide border border-emerald-900/50 flex items-center gap-2">
              {status.includes("Waiting") ? <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> : null}
              {status}
            </span>
          </div>

          {vector && (
            <div className="flex flex-col text-left mt-4 border-t border-zinc-700/50 pt-4">
              <span className="text-zinc-400 text-sm mb-2">Locally Evaluated Vector</span>
              <div className="flex gap-2 justify-center">
                {vector.map((v, i) => (
                  <div key={i} className={`flex items-center justify-center w-12 h-12 rounded-xl text-xl font-bold ${v === 1 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                    {v}
                  </div>
                ))}
              </div>
            </div>
          )}

          {txHash && (
            <div className="mt-4 break-all bg-emerald-950/30 p-3 rounded-lg border border-emerald-900/30 text-emerald-400 text-sm font-mono text-left">
              Tx: <span>{txHash}</span>
            </div>
          )}

          {advertiserId !== null && (
            <div className="mt-6 flex flex-col items-center p-6 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/30 rounded-2xl">
              <span className="text-emerald-400 text-lg font-bold mb-1">Ad Assigned!</span>
              <span className="text-3xl font-extrabold text-white">Advertiser #{advertiserId}</span>
              <a href="/demo" className="mt-4 text-sm text-cyan-400 hover:text-cyan-300 underline underline-offset-4 transition-colors">
                View your ad & earn ATTN →
              </a>
            </div>
          )}
        </div>

        <button 
          onClick={handleMatch}
          disabled={!vector || !!txHash}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-lg font-bold py-4 rounded-xl shadow-lg hover:shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-400 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0"
        >
          {!vector ? "Awaiting Extension..." : "Encrypt & Match My Attention"}
        </button>
      </div>
      
      <div className="absolute top-6 right-6 z-50 flex gap-3">
        <a href="/demo" className="text-zinc-500 hover:text-cyan-400 transition-colors text-sm font-medium border border-zinc-700/50 rounded-lg px-4 py-2 hover:bg-zinc-800">
            Publisher Demo →
        </a>
        <a href="/advertiser" className="text-zinc-500 hover:text-emerald-400 transition-colors text-sm font-medium border border-zinc-700/50 rounded-lg px-4 py-2 hover:bg-zinc-800">
            Advertiser Portal →
        </a>
      </div>

      <div className="absolute bottom-6 text-zinc-600 text-sm flex gap-4">
        <span>🔒 Fully Homomorphic Encryption</span>
        <span>·</span>
        <span>🧠 Local AI Inference</span>
        <span>·</span>
        <span>📡 Cross-Site Ad Serving</span>
      </div>
    </div>
  );
}
