# EAX Testing Guide — Base Sepolia + Locus Integration

**Branch**: `ai-purchasing-agent`  
**Network**: Base Sepolia (chainId 84532)  
**Date**: April 2026

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 | Check: `node -v` |
| Foundry (`forge`, `cast`) | Latest | Install: `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| MetaMask | Any | Must support Base Sepolia |
| Chrome | Any | For the extension |
| Base Sepolia ETH | Any amount | Faucet below |

### Get Base Sepolia ETH

Go to **https://www.coinbase.com/faucets/base-ethereum-goerli-faucet** and request test ETH to your MetaMask wallet.

Alternatively: **https://faucet.quicknode.com/base/sepolia**

### Add Base Sepolia to MetaMask

If it isn't already there, add it manually:

- **Network Name**: Base Sepolia
- **RPC URL**: `https://sepolia.base.org`
- **Chain ID**: `84532`
- **Currency Symbol**: `ETH`
- **Block Explorer**: `https://sepolia.basescan.org`

---

## Step 1 — Deploy Smart Contracts to Base Sepolia

```bash
cd base/contracts
npm install
```

Export your private key (the wallet that will deploy and own the contracts):

```bash
export PRIVATE_KEY="0xYOUR_PRIVATE_KEY_HERE"
```

Deploy:

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url base_sepolia \
  --broadcast \
  -vvv
```

> The `base_sepolia` RPC alias is already configured in `foundry.toml`.

**Copy the two addresses printed in the terminal output:**

```
MockERC20 deployed at: 0x...    ← ATTN token
EAX contract deployed at: 0x... ← main contract
```

---

## Step 2 — Configure Environment Variables

You need **two** `.env.local` files — one for each frontend app.

### `base/.env.local`

```env
NEXT_PUBLIC_EAX_CONTRACT_ADDRESS=0x<your_EAX_address>
NEXT_PUBLIC_ATTN_TOKEN_ADDRESS=0x<your_MockERC20_address>
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_EAX_CONTRACT_ADDRESS=0x<your_EAX_address>
NEXT_PUBLIC_ATTN_TOKEN_ADDRESS=0x<your_MockERC20_address>
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

### Backend `.env` (optional — for production Locus)

Create `base/backend/.env`:

```env
# Leave unset (or NODE_ENV=development) to use Mock Locus
NODE_ENV=development

# Set these only when switching to real Locus payments:
# NODE_ENV=production
# LOCUS_API_KEY=claw_xxxxxxxxxxxxx
# LOCUS_API_URL=https://api.paywithlocus.com/api
```

> **Without** `LOCUS_API_KEY`, the backend automatically uses the in-memory Mock Locus client — purchases work end-to-end without real funds.

---

## Step 3 — Start the Backend

```bash
cd base/backend
npm install
node server.js
```

You should see:

```
[Agent] Using MOCK Locus client (development)
[Indexer] Connecting to Base Sepolia...

  ╔══════════════════════════════════════════╗
  ║  EAX Backend on :4000 (Base Sepolia)     ║
  ...
```

Verify it's healthy:

```bash
curl http://localhost:4000/health
# → { "status": "ok", "network": "Base Sepolia", ... }

curl http://localhost:4000/agent/health
# → { "status": "ok", "pendingRequests": 0, ... }
```

---

## Step 4 — Start the Primary Frontend (`base/`)

```bash
cd base
npm install
npm run dev
```

App runs at **http://localhost:3000**

---

## Step 5 — Start the Marketing / Analytics Frontend (`frontend/`)

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Runs at **http://localhost:3001** (or next available port).

---

## Step 6 — Load the Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `base/extension/` folder
4. Pin the **AdScience** extension in your Chrome toolbar

> **First run note:** The extension downloads a ~90 MB WASM ML model. Subsequent runs are instant.

---

## Full End-to-End Workflow

### Phase A — Advertiser Registration

> Go to `http://localhost:3001/advertiser` (newer UI) or `http://localhost:3000/advertiser`

1. Click **💧 Get 10,000 Test ATTN** — confirm the MetaMask transaction
2. Select targeting categories (e.g. CRYPTO + AI)
3. Set **Max Bid** (e.g. `15 ATTN`) and **Total Budget** (e.g. `500 ATTN`)
4. Fill in ad creative: **Title**, optional **Image URL**, **CTA Button**, **Landing Page URL**
5. *(Optional)* Set **Purchase Agent Metadata**:
   - Enter a **Purchase Amount** (e.g. `10.00`)
   - Select **Currency**: USDC or ATTN
   - Toggle **Require user confirmation** if you want an explicit approval dialog regardless of amount
6. Click **Register Intent Target + Ad Creative**
7. Confirm **two** MetaMask transactions:
   - `approve()` — ERC-20 budget approval
   - `registerAdvertiser()` — on-chain registration
8. Note the assigned **Advertiser ID** shown on success

---

### Phase B — Encrypted User Matching

> MetaMask must be on **Base Sepolia** (chainId 84532)

1. Browse some websites (populates `chrome.history`)
2. Click the AdScience extension icon
3. Click **Start Analysis** → extension reads your browser history
4. Click **Classify** → local WASM ML model runs zero-shot classification
5. Review your 5-element interest vector `[crypto, ai, finance, gaming, dev]`
6. Click **Encrypt & Send** → bridges vector to the DApp

On `http://localhost:3000` (or `/app` in the newer frontend):

7. Click **Encrypt & Match My Attention**
8. Confirm the `matchIntent()` MetaMask transaction
9. Wait for the CoFHE coprocessor to finish FHE computation (up to ~60s on first use)
10. Confirm the `revealMatch()` MetaMask transaction
11. Note the assigned **Advertiser #{id}**

---

### Phase C — Ad Serving & ATTN Payout

> Go to `http://localhost:3000/demo`

1. SDK reads `activeAdvertiser[user]` from the Base Sepolia contract
2. Fetches ad creative from the backend (`GET /getAd/:id`)
3. Ad is rendered in the slot
4. Click **Confirm Impression → Earn ATTN**
5. Confirm the `recordImpression()` MetaMask transaction
6. ATTN tokens are transferred from the advertiser's locked budget to your wallet

---

### Phase D — Purchasing Agent Flow (Locus)

> Only applies to ads with **Purchase Agent Metadata** set

When a user views a matched ad with a purchase amount configured:

1. The CTA button shows the amount: e.g. **"Buy Now · 10.00 USDC"**
2. User clicks → SDK calls `POST /agent/purchase`
3. Backend runs policy check:
   - **< $25** → auto-approved, funds captured immediately, user redirected
   - **$25–$250** → user sees confirmation dialog → click **"Yes, confirm"** → captured
   - **> $5000** → declined
4. All decisions are logged to `base/backend/audit/purchase-agent.jsonl`

View the audit log:

```bash
curl http://localhost:4000/agent/audit
# Returns last 50 entries (newest first)
```

Or view the raw JSONL file:

```bash
cat base/backend/audit/purchase-agent.jsonl
```

---

## Switching to Real Locus (Production)

1. Sign up at **https://paywithlocus.com/onboarding.md** — get your API key (starts with `claw_`)
2. Test your key:
   ```bash
   curl https://api.paywithlocus.com/api/pay/balance \
     -H "Authorization: Bearer claw_YOUR_KEY"
   ```
3. Update `base/backend/.env`:
   ```env
   NODE_ENV=production
   LOCUS_API_KEY=claw_YOUR_KEY
   LOCUS_API_URL=https://api.paywithlocus.com/api
   ```
4. Restart the backend — you'll see `[Agent] Using REAL Locus client (production)`

---

## Available URLs

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | EAX Hub (base app) — encrypt & match intent |
| `http://localhost:3000/advertiser` | Advertiser portal (base app) |
| `http://localhost:3000/demo` | Publisher demo — view ad & earn ATTN |
| `http://localhost:3001` | Landing / marketing frontend |
| `http://localhost:3001/app` | User intent hub (newer UI) |
| `http://localhost:3001/advertiser` | Advertiser portal (newer UI with analytics + purchase metadata) |
| `http://localhost:4000/health` | Backend health check |
| `http://localhost:4000/agent/health` | Purchasing agent status |
| `http://localhost:4000/agent/audit` | Recent audit log entries |
| `http://localhost:4000/analytics?advertiserId=0` | Advertiser analytics |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| MetaMask wrong network | Switch to **Base Sepolia** (chainId 84532) |
| Backend unreachable | Run `node server.js` in `base/backend/`, confirm port 4000 is free |
| `NEXT_PUBLIC_EAX_CONTRACT_ADDRESS` not set | Add the deployed address to both `.env.local` files |
| No ad on `/demo` | Register at least one advertiser first, then run the match flow |
| "No active match" error | Run Phase B (match) before visiting `/demo` |
| Contract reverts on `registerAdvertiser` | Ensure `approve()` tx was confirmed first; check ATTN balance |
| CoFHE 428 / Precondition error | Wait longer — coprocessor is still computing. The app retries automatically (up to 12 × 5s) |
| Extension shows empty domains | Browse some websites first |
| ML model slow on first run | ~90 MB WASM model is downloading; cached after first use |
| `matchIntent` fails | Ensure vector length == 5 and CoFHE SDK is initialized on Base Sepolia |
| Agent purchase declined | Check `/agent/audit` for reason; common causes: rate limit, insufficient mock balance, hard limit |

---

## Running Contract Tests

```bash
cd base/contracts
forge test -vv
```

---

## Project Structure (Quick Reference)

```
adlocus/
├── base/                          # Primary Next.js app + monorepo core
│   ├── app/                       # User hub + advertiser portal pages
│   ├── backend/
│   │   ├── server.js              # Express API (port 4000)
│   │   ├── audit/                 # purchase-agent.jsonl (created at runtime)
│   │   └── services/agent/
│   │       ├── index.js           # Core purchasing agent service
│   │       ├── policy-engine.js   # Risk scoring + thresholds
│   │       ├── mock-locus.js      # Dev-mode mock payment client
│   │       ├── locus-client.js    # Production Locus REST client
│   │       └── audit-log.js       # JSONL audit trail
│   ├── config/wagmi.ts            # Wagmi: Base Sepolia
│   ├── contracts/                 # Solidity + Foundry (EAX.sol, MockERC20.sol)
│   ├── eax-sdk/
│   │   ├── contract.js            # CoFHE encrypt + match + impression
│   │   └── api.js                 # Ad fetching + rendering + purchase agent
│   └── extension/                 # Chrome Extension (Manifest V3)
│
├── frontend/        # Marketing + analytics frontend (Next.js)
│   ├── app/advertiser/page.tsx    # Advertiser portal with purchase metadata UI
│   ├── app/app/page.tsx           # User intent hub
│   └── config/wagmi.ts            # Wagmi: Base Sepolia
│
└── meow/                          # Publisher demo ("Meow" social platform)
```
