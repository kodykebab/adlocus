require("dotenv").config();                                                   // base/backend/.env  (Locus key, etc.)
require("dotenv").config({ path: "../../frontend/.env.local" }); // contract addresses
const express = require("express");
const cors = require("cors");
const path = require("path");
const { ethers } = require("ethers");

// ── Purchasing Agent ──────────────────────────────────────────────
const { createAuditLogStore } = require("./services/agent/audit-log");
const { createPurchasingAgentService } = require("./services/agent/index");

const auditLog = createAuditLogStore(
  path.join(__dirname, "audit/purchase-agent.jsonl")
);

// Use real Locus whenever LOCUS_API_KEY is set, mock otherwise
let locusClient;
if (process.env.LOCUS_API_KEY) {
  const { createLocusClient } = require("./services/agent/locus-client");
  locusClient = createLocusClient({
    apiKey: process.env.LOCUS_API_KEY,
    apiUrl: process.env.LOCUS_API_URL || "https://api.paywithlocus.com/api",
    logger: (type, payload) => auditLog.append({ type: `locus:${type}`, ...payload }),
  });
  console.log("[Agent] Using REAL Locus client ✓");
} else {
  const { createMockLocusClient } = require("./services/agent/mock-locus");
  locusClient = createMockLocusClient({
    defaultBalances: { USDC: 10000, ATTN: 10000 },
    logger: (type, payload) => auditLog.append({ type: `locus:${type}`, ...payload }),
  });
  console.log("[Agent] Using MOCK Locus client (set LOCUS_API_KEY to use real Locus)");
}

const purchasingAgent = createPurchasingAgentService({
  locus: locusClient,
  auditLog,
  approvalThreshold: 25,       // Auto-approve under $25
  confirmationThreshold: 250,  // Hold + confirm $25–$250
  hardLimit: 5000,             // Decline over $5000
});

// ── Express App ───────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── In-memory stores ─────────────────────────────────────────────
const ads = new Map();       // advertiserId → ad creative
const matches = [];          // { advertiserId, user, txHash, timestamp }
const impressions = [];      // { advertiserId, user, payout, txHash, timestamp }

// ── Contract setup ───────────────────────────────────────────────
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_EAX_CONTRACT_ADDRESS
  || "0x0000000000000000000000000000000000000000";
const ATTN_ADDRESS = process.env.NEXT_PUBLIC_ATTN_TOKEN_ADDRESS
  || "0x0000000000000000000000000000000000000000";

// Base Sepolia RPC
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const EAX_ABI = [
  "event MatchRevealed(address indexed user, uint8 advertiserId)",
  "event ImpressionRecorded(address indexed user, uint8 advertiserId, uint64 payout)",
  "event AdvertiserRegistered(uint256 indexed id, address indexed addr, uint64 bid)",
  "function advertisers(uint256) view returns (uint64[5] vector, uint64 bid, uint256 balance, address addr, bool active)",
  "function nextAdvertiserId() view returns (uint256)"
];

let provider;
let contract;
let listenersAttached = false;

// ── Historical sync with retry + fallback ────────────────────────
async function startIndexer() {
  if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.log("[Indexer] Contract address not set — skipping chain indexer. Set NEXT_PUBLIC_EAX_CONTRACT_ADDRESS in .env.local");
    return;
  }

  console.log("[Indexer] Connecting to Base Sepolia...");
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL, undefined, {
      staticNetwork: true,
      batchMaxCount: 1
    });
    contract = new ethers.Contract(CONTRACT_ADDRESS, EAX_ABI, provider);

    await Promise.race([
      syncHistorical(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))
    ]);
  } catch (err) {
    console.log(`[Indexer] Historical sync skipped: ${err.message}`);
  }

  attachListeners();
}

async function syncHistorical() {
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - 10000);
  console.log(`[Indexer] Querying events from block ${fromBlock} to ${latestBlock}...`);

  const [matchEvents, impEvents] = await Promise.all([
    contract.queryFilter("MatchRevealed", fromBlock, latestBlock),
    contract.queryFilter("ImpressionRecorded", fromBlock, latestBlock),
  ]);

  for (const ev of matchEvents) {
    matches.push({
      advertiserId: Number(ev.args[1]),
      user: ev.args[0],
      txHash: ev.transactionHash,
      timestamp: Date.now() - 60000
    });
  }
  for (const ev of impEvents) {
    impressions.push({
      advertiserId: Number(ev.args[1]),
      user: ev.args[0],
      payout: Number(ev.args[2]),
      txHash: ev.transactionHash,
      timestamp: Date.now() - 60000
    });
  }

  console.log(`[Indexer] Synced ${matchEvents.length} matches, ${impEvents.length} impressions from chain.`);
}

function attachListeners() {
  if (listenersAttached || !contract) return;
  listenersAttached = true;

  console.log(`[Indexer] Starting poll-based listener (4s) on ${CONTRACT_ADDRESS.slice(0, 10)}...`);

  let lastBlock = null;
  const POLL_MS = 4000; // Base Sepolia ~2s blocks

  async function pollNewBlocks() {
    try {
      const currentBlock = await provider.getBlockNumber();

      // First run — just record the starting block, don't backfill
      if (lastBlock === null) {
        lastBlock = currentBlock;
        return;
      }

      // Nothing new since last poll
      if (currentBlock <= lastBlock) return;

      const fromBlock = lastBlock + 1;
      const toBlock   = currentBlock;
      lastBlock = currentBlock;

      const [matchEvents, impEvents] = await Promise.all([
        contract.queryFilter("MatchRevealed",      fromBlock, toBlock),
        contract.queryFilter("ImpressionRecorded", fromBlock, toBlock),
      ]);

      for (const ev of matchEvents) {
        console.log(`[Event] MatchRevealed → adv #${ev.args[1]} (block ${ev.blockNumber})`);
        matches.push({
          advertiserId: Number(ev.args[1]),
          user:         ev.args[0],
          txHash:       ev.transactionHash,
          timestamp:    Date.now(),
        });
      }

      for (const ev of impEvents) {
        console.log(`[Event] ImpressionRecorded → adv #${ev.args[1]}, payout ${ev.args[2]} (block ${ev.blockNumber})`);
        impressions.push({
          advertiserId: Number(ev.args[1]),
          user:         ev.args[0],
          payout:       Number(ev.args[2]),
          txHash:       ev.transactionHash,
          timestamp:    Date.now(),
        });
      }
    } catch (err) {
      // Non-fatal — log and try again next interval
      console.warn(`[Indexer] Poll error: ${err.message}`);
    }
  }

  // Run immediately, then repeat
  pollNewBlocks();
  setInterval(pollNewBlocks, POLL_MS);
}

startIndexer();

// ── Analytics Routes ─────────────────────────────────────────────

app.get("/analytics", (req, res) => {
  const advId = Number(req.query.advertiserId);
  if (isNaN(advId)) return res.status(400).json({ error: "Missing advertiserId" });

  const advMatches = matches.filter(m => m.advertiserId === advId);
  const advImps   = impressions.filter(i => i.advertiserId === advId);

  const totalSpend = advImps.reduce((s, i) => s + i.payout, 0);

  let spendRate = 0;
  if (advImps.length >= 2) {
    const sorted = [...advImps].sort((a, b) => a.timestamp - b.timestamp);
    const windowMs = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
    if (windowMs > 0) spendRate = totalSpend / (windowMs / 60000);
  }

  let avgPayoutInterval = "N/A";
  if (advImps.length >= 2) {
    const sorted = [...advImps].sort((a, b) => a.timestamp - b.timestamp);
    const windowMs = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
    const avgMs = windowMs / (sorted.length - 1);
    const secs = Math.round(avgMs / 1000);
    avgPayoutInterval = secs >= 60 ? `${Math.round(secs / 60)}m` : `${secs}s`;
  }

  const winRate = matches.length > 0 ? advMatches.length / matches.length : 0;
  const ad = ads.get(advId);
  const initialBudget = ad ? ad.budget || 0 : 0;
  const remainingBudget = Math.max(0, initialBudget - totalSpend);

  res.json({
    impressions: advImps.length,
    totalSpend,
    spendRate: Number(spendRate.toFixed(2)),
    avgPayoutInterval,
    winRate: Number(winRate.toFixed(2)),
    remainingBudget,
    matchCount: advMatches.length,
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    network: "Base Sepolia",
    contractAddress: CONTRACT_ADDRESS,
    ads: ads.size,
    matchesLogged: matches.length,
    impressionsLogged: impressions.length,
  });
});

// ── Ad Creative Routes ────────────────────────────────────────────

app.post("/registerAd", (req, res) => {
  const { advertiserId, title, image, cta, link, budget, purchaseAmount, purchaseCurrency, requiresConfirmation } = req.body;
  if (advertiserId === undefined || !title || !link) {
    return res.status(400).json({ error: "Missing required fields: advertiserId, title, link" });
  }

  ads.set(Number(advertiserId), {
    advertiserId: Number(advertiserId),
    title,
    image: image || "",
    cta: cta || "Learn More",
    link,
    budget: Number(budget) || 0,
    // Purchase agent metadata
    purchaseAmount: purchaseAmount != null ? Number(purchaseAmount) : null,
    purchaseCurrency: purchaseCurrency || "USDC",
    requiresConfirmation: Boolean(requiresConfirmation),
    registeredAt: Date.now(),
  });

  console.log(`[Ad] Registered #${advertiserId}: "${title}" | purchase: ${purchaseAmount ?? "N/A"} ${purchaseCurrency || ""}`);
  res.json({ success: true, advertiserId: Number(advertiserId) });
});

app.get("/getAd/:advertiserId", (req, res) => {
  const id = Number(req.params.advertiserId);
  const ad = ads.get(id);
  if (!ad) return res.status(404).json({ error: "No ad creative found", advertiserId: id });
  res.json(ad);
});

app.get("/ads", (_req, res) => {
  res.json(Array.from(ads.values()));
});

// ── Purchasing Agent Routes ───────────────────────────────────────

// POST /agent/purchase — preview + reserve funds
app.post("/agent/purchase", async (req, res) => {
  try {
    const result = await purchasingAgent.previewPurchase(req.body);
    const httpStatus = result.status === "pending_confirmation" ? 202 : 200;
    res.status(httpStatus).json(result);
  } catch (err) {
    console.error("[Agent] previewPurchase error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /agent/purchase/:requestId/confirm — capture after user approves
app.post("/agent/purchase/:requestId/confirm", async (req, res) => {
  try {
    const result = await purchasingAgent.confirmPurchase(req.params.requestId);
    const httpStatus = result.status === "pending_human_approval" ? 202 : 200;
    res.status(httpStatus).json(result);
  } catch (err) {
    console.error("[Agent] confirmPurchase error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/purchase/:requestId — fetch status
app.get("/agent/purchase/:requestId", (req, res) => {
  const record = purchasingAgent.getRequest(req.params.requestId);
  if (!record) return res.status(404).json({ error: "Request not found" });
  res.json(record);
});

// POST /agent/wallets/:address/revoke — block a wallet
app.post("/agent/wallets/:address/revoke", async (req, res) => {
  try {
    const result = await purchasingAgent.revokePermissions(req.params.address, req.body.reason || "Manual revocation");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /agent/wallets/:address/restore — unblock a wallet
app.post("/agent/wallets/:address/restore", async (req, res) => {
  try {
    const result = await purchasingAgent.restorePermissions(req.params.address, req.body.reason || "Manual restore");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/health — agent status
app.get("/agent/health", async (_req, res) => {
  try {
    res.json(await purchasingAgent.health());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/audit — recent audit log entries
app.get("/agent/audit", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const all = auditLog.readAll();
  res.json(all.slice(-limit).reverse());
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  EAX Backend on :${PORT} (Base Sepolia)     ║`);
  console.log(`  ╠══════════════════════════════════════════╣`);
  console.log(`  ║  GET  /health                            ║`);
  console.log(`  ║  GET  /analytics?advertiserId=X          ║`);
  console.log(`  ║  POST /registerAd                        ║`);
  console.log(`  ║  GET  /getAd/:advertiserId               ║`);
  console.log(`  ╠══════════════════════════════════════════╣`);
  console.log(`  ║  POST /agent/purchase                    ║`);
  console.log(`  ║  POST /agent/purchase/:id/confirm        ║`);
  console.log(`  ║  GET  /agent/purchase/:id                ║`);
  console.log(`  ║  GET  /agent/health                      ║`);
  console.log(`  ║  GET  /agent/audit                       ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});
