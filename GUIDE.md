# EAX — Encrypted Attention Exchange

**Network:** Base Sepolia (chainId 84532)  
**Contracts (live):**
- EAX: [`0x5277536D859564A314B0Eb6d74d4A9dEC9817F3D`](https://sepolia.basescan.org/address/0x5277536D859564A314B0Eb6d74d4A9dEC9817F3D)
- ATTN Token: [`0x45d489217D4bd41F659719cdFa5ba66b24a0524D`](https://sepolia.basescan.org/address/0x45d489217D4bd41F659719cdFa5ba66b24a0524D)

---

## What is EAX?

EAX is a privacy-first ad protocol. The Chrome extension uses local AI to classify a user's interest vector from browsing history. That vector is encrypted on-chain via FHE (Fully Homomorphic Encryption) using [CoFHE](https://cofhe.io), matched against advertiser targets, and the winning ad is served — without ever revealing the user's browsing data. Users earn **ATTN tokens** for each matched impression. The **Locus purchasing agent** enables AI-driven e-commerce: when a user clicks a CTA, the purchasing agent handles payment via Locus rails on Base.

---

## Project Structure

```
adlocus/
├── frontend/    ← Primary frontend (Next.js 16, TailwindCSS v4)
│   ├── app/
│   │   ├── page.tsx           ← EAX landing page
│   │   ├── app/page.tsx       ← User intent hub (encrypt + match)
│   │   ├── advertiser/page.tsx← Advertiser portal (register + analytics + Locus metadata)
│   │   └── demo/page.tsx      ← Publisher demo (serve ads + earn ATTN + Locus purchase)
│   └── config/wagmi.ts        ← Base Sepolia wagmi config
│
├── base/
│   ├── backend/
│   │   ├── server.js          ← Express API (port 4000)
│   │   ├── .env               ← LOCUS_API_KEY (gitignored)
│   │   └── services/agent/    ← Purchasing agent service
│   │       ├── index.js       ← Core orchestration
│   │       ├── policy-engine.js
│   │       ├── locus-client.js← Real Locus REST client (production)
│   │       ├── mock-locus.js  ← In-memory mock (development)
│   │       └── audit-log.js   ← JSONL audit trail
│   ├── contracts/
│   │   ├── src/EAX.sol        ← Core FHE auction contract
│   │   ├── src/MockERC20.sol  ← ATTN test token
│   │   └── script/Deploy.s.sol← Foundry deploy script
│   ├── eax-sdk/
│   │   ├── contract.js        ← CoFHE encrypt + match + impression
│   │   └── api.js             ← Ad serving + purchase agent integration
│   ├── extension/             ← Chrome Extension (Manifest V3)
│   └── app/                   ← Secondary/legacy Next.js app
│
└── meow/                      ← "Meow" publisher demo website
```

---

## Quick Start

### 1. Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| Foundry | Latest — `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Chrome | Any (for the extension) |
| MetaMask | Any — add **Base Sepolia** (chainId 84532, RPC: `https://sepolia.base.org`) |

**Get Base Sepolia ETH:** https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

---

### 2. Environment Setup

The contracts are already deployed. Create these two files:

**`frontend/.env.local`**
```env
NEXT_PUBLIC_EAX_CONTRACT_ADDRESS=0x5277536D859564A314B0Eb6d74d4A9dEC9817F3D
NEXT_PUBLIC_ATTN_TOKEN_ADDRESS=0x45d489217D4bd41F659719cdFa5ba66b24a0524D
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

**`base/backend/.env`**
```env
LOCUS_API_KEY=claw_dev_YOUR_KEY
LOCUS_API_URL=https://api.paywithlocus.com/api
```

> When `LOCUS_API_KEY` is present, the backend uses the **real Locus client**. Without it, it falls back to an in-memory mock.

---

### 3. Start the Backend

```bash
cd base/backend
npm install      # first time only
node server.js
```

Expected output:
```
[Agent] Using REAL Locus client ✓
[Indexer] Connecting to Base Sepolia...
[Indexer] Starting poll-based listener (4s) on 0x52775...

  ╔══════════════════════════════════════════╗
  ║  EAX Backend on :4000 (Base Sepolia)     ║
  ...
```

Check it's running:
```bash
curl http://localhost:4000/health
curl http://localhost:4000/agent/health
```

---

### 4. Start the Frontend

```bash
cd frontend
npm install      # first time only
npm run dev
```

Open **http://localhost:3000**

---

### 5. Load the Chrome Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `base/extension/`
4. Pin the **AdScience** extension to your toolbar

> The extension downloads a ~90 MB WASM model on first run. Subsequent starts are instant.

---

## Full User Flow

### A — Advertiser Registration (`/advertiser`)

1. Click **💧 Get 10,000 Test ATTN** → confirm MetaMask transaction
2. Select interest categories to target (e.g. CRYPTO + AI)
3. Set Max Bid (e.g. `15 ATTN`) and Total Budget (e.g. `500 ATTN`)
4. Fill in Ad Creative: Title, Image URL (optional), CTA button text, Landing page URL
5. *(Optional)* Fill **Purchase Agent Metadata** to enable Locus payments:
   - **Purchase Amount** — e.g. `10.00`
   - **Currency** — USDC or ATTN
   - **Require user confirmation** toggle
6. Click **Register** → approve 2 MetaMask transactions:
   - `approve()` ERC-20 budget approval
   - `registerAdvertiser()` on-chain registration
7. Note your **Advertiser ID** (shown on success)

---

### B — User Intent Matching (`/app`)

> Make sure MetaMask is on **Base Sepolia**.

1. Browse some websites (populates Chrome history)
2. Click the **AdScience** extension icon → **Start Analysis**
3. Click **Classify** — local ML runs zero-shot classification
4. Review your 5-element vector: `[crypto, ai, finance, gaming, dev]`
5. Click **Encrypt & Send** — bridges vector to the DApp
6. On `/app`, click **Encrypt & Match My Attention**
7. Confirm `matchIntent()` in MetaMask — CoFHE FHE runs on-chain
8. Wait up to ~60s for the decryption (app retries automatically)
9. Confirm `revealMatch()` in MetaMask
10. Note your matched **Advertiser #ID**

---

### C — Publisher Ad Serving (`/demo`)

1. Visit `/demo` — the SDK reads `activeAdvertiser[wallet]` from chain
2. Fetches the ad creative from `/getAd/:id`
3. Ad is displayed in the slot
4. Click **Confirm Impression → Earn ATTN**
5. Confirm `recordImpression()` in MetaMask → ATTN paid to your wallet

---

### D — Locus Purchase Agent (`/demo` — ads with purchase metadata)

When an ad has `purchaseAmount > 0`:

1. CTA shows: **"Buy Now · 10.00 USDC"**
2. User clicks → backend runs policy check:
   - **< $25** → auto-approved, captured immediately, user redirected
   - **$25–$250** → confirmation dialog appears → user clicks **"Yes, confirm purchase"**
   - **> $5000** → declined
3. Audit log written to `base/backend/audit/purchase-agent.jsonl`

View audit log:
```bash
curl http://localhost:4000/agent/audit
```

---

## Redeploying Contracts

If you need to redeploy (e.g. contract changes):

```bash
export PRIVATE_KEY="0xYOUR_PRIVATE_KEY"
cd base/contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url base_sepolia \
  --broadcast \
  -vvv
```

Update both `.env.local` files with the new addresses.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server + indexer status |
| GET | `/analytics?advertiserId=N` | Advertiser metrics |
| POST | `/registerAd` | Store ad creative + purchase metadata |
| GET | `/getAd/:id` | Fetch ad creative |
| GET | `/ads` | List all registered ads |
| POST | `/agent/purchase` | Preview + reserve funds via Locus |
| POST | `/agent/purchase/:id/confirm` | Capture after user confirms |
| GET | `/agent/purchase/:id` | Get purchase request status |
| POST | `/agent/wallets/:addr/revoke` | Block a wallet |
| POST | `/agent/wallets/:addr/restore` | Restore a wallet |
| GET | `/agent/health` | Purchasing agent status |
| GET | `/agent/audit` | Recent audit log (newest first) |

---

## Switching to Production Locus

1. Get your production API key at https://paywithlocus.com/onboarding.md
2. Update `base/backend/.env`:
   ```env
   LOCUS_API_KEY=claw_PRODUCTION_KEY
   ```
3. Restart `node server.js` — no code changes required

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| MetaMask on wrong network | Switch to Base Sepolia (chainId 84532) — the `/app` page shows a prompt |
| Backend `filter not found` errors | Already fixed — uses `setInterval` polling, not eth_newFilter |
| No ad on `/demo` | Complete Phase A (register) + Phase B (match) first |
| CoFHE 428 error | Normal — coprocessor is computing. App retries up to 12× automatically |
| `matchIntent` reverts | Confirm vector length is 5 and wallet is on Base Sepolia |
| Extension shows no domains | Browse a few websites first, then re-open the extension |
| Agent purchase declined | Run `curl http://localhost:4000/agent/audit` to see reason |
