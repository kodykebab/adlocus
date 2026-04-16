# 🔬 AdScience — Encrypted Attention Exchange (EAX)

> **Privacy-preserving ad targeting powered by Fully Homomorphic Encryption (FHE) on-chain.**

AdScience is a full-stack, end-to-end privacy-preserving advertising protocol. It classifies user interests **locally** using an in-browser ML model, encrypts the resulting intent vector via **FHE (CoFHE/Fhenix)**, runs **encrypted dot-product matching** on-chain against advertisers, and pays users in `ATTN` tokens when they view a matched ad — all without ever revealing raw browsing data to any server or advertiser.

***CONTRACT ADDRESS 0xd4454243340270f0d6de17744b8e6a894dfe5e5f***


***ERC-20 CONTRACT  0xe68aac9560ece6d54212d74e27c93c4215bf204e***

---

## 📐 System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    MATCH PHASE (Site A — EAX DApp)        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Chrome Extension                                        │
│  ├── History Extraction  (chrome.history API)            │
│  ├── Local ML Inference  (Transformers.js / WASM)        │
│  │   └── Xenova/mobilebert-uncased-mnli (zero-shot)      │
│  └── Intent Vector       [crypto, ai, finance, gaming, dev]
│            │                                             │
│            │ postMessage (content.js bridge)             │
│            ▼                                             │
│  Next.js DApp (localhost:3000)                           │
│  ├── CoFHE SDK encrypt  → euint64[5] ciphertext          │
│  ├── matchIntent() tx   → EAX.sol (Sepolia)              │
│  │   └── FHE dot-product vs. all advertiser vectors      │
│  │   └── Encrypted winner selected (euint8)              │
│  ├── Threshold Network decrypts winner index             │
│  └── revealMatch() tx   → activeAdvertiser[user] = id   │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                SERVE PHASE (Site B — Any Publisher)       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  EAX SDK (eax-sdk)                                       │
│  ├── getActiveAdvertiser()  → reads chain state          │
│  ├── getAd()               → fetches creative from backend│
│  ├── renderAd()            → injects ad into DOM         │
│  └── recordImpression()    → user earns ATTN tokens ✅   │
│                                                          │
│  Ad Creative Backend (localhost:4000 — Express.js)       │
│  ├── POST /registerAd      → stores creative in memory   │
│  └── GET  /getAd/:id       → returns ad creative JSON    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 🗂️ Repository Structure

```
adscience/
├── base/                          # Monorepo core (backend, contracts, sdk, extension)
│   ├── backend/                   # Express.js ad creative & analytics API server
│   │   └── server.js              # Runs on port 4000; indexes ethers v6 events
│   ├── contracts/                 # Solidity smart contracts (Foundry)
│   │   ├── src/
│   │   │   ├── EAX.sol            # Core FHE matching + impression smart contract
│   │   │   └── MockERC20.sol      # Test ATTN token
│   │   └── script/Deploy.s.sol    # Smart contract deployment script
│   ├── eax-sdk/                   # Publisher-facing JavaScript SDK (npm package)
│   │   └── index.js               # Methods for fetching ad match & claiming payouts
│   └── extension/                 # Chrome Extension (Manifest V3)
│       ├── content.js             # DApp Web3 connection bridge
│       └── scripts/               # Heavy local AI ML pipeline & Transformers.js WASM
│
├── super_new_new_frontend/        # Primary Next.js Modern EAX DApp 
│   ├── app/                       
│   │   ├── page.tsx               # User hub: encrypt & match local intent
│   │   └── advertiser/            # Fully-featured live analytics metrics dashboard
│   ├── components/                # Shared React UI component library
│   └── analytics.md               # Backend analytics architectural specification
│
└── meow/                          # Publisher demo: "Meow" social media platform
    ├── app/                       # Publisher simulation pages
    ├── public/                    # Monochrome platform assets
    └── package.json               # Configured to use eax-sdk for rendering ads and payouts
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity ^0.8.25, Foundry, CoFHE/Fhenix FHE library |
| FHE Encryption | `@fhenixprotocol/cofhe-contracts`, `@cofhe/sdk` |
| Blockchain | Ethereum **Sepolia** testnet (chainId 11155111) |
| Token Standard | ERC-20 (`ATTN` — MockERC20 for testing) |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Wallet | Wagmi v3, Viem v2, Metamask |
| Backend | Node.js + Express.js (in-memory ad store) |
| Chrome Extension | Manifest V3, Transformers.js (WebAssembly) |
| Local ML Model | `Xenova/mobilebert-uncased-mnli` (zero-shot classification) |
| SDK | Vanilla JavaScript (ESM), Ethers.js v6 |

---

## 🔑 Core Concepts

### Interest Categories
The system classifies user browsing history into **5 categories**:
```
[ crypto, ai, finance, gaming, dev ]
```
Each position in the vector holds a score (`0` = no interest, `1` = interested).

### Advertiser Targeting
Each advertiser registers a **5-element targeting vector** alongside a bid and budget:
- `[1, 0, 1, 0, 0]` → targets `crypto` + `finance`
- `[0, 1, 1, 0, 1]` → targets `ai` + `finance` + `dev`
- `[1, 1, 0, 1, 0]` → targets `crypto` + `ai` + `gaming`

### FHE Auction
The on-chain auction computes:
```
score_i  = dot(userVector, advertiserVector_i)    // fully encrypted
value_i  = score_i * bid_i
winner   = argmax(value_i)                        // encrypted comparison
```
The **winner index is encrypted throughout** — not even the contract knows it until threshold decryption.

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| Foundry (`forge`, `cast`) | Latest |
| Metamask | Ethereum Sepolia (chainId `11155111`) |
| Sepolia ETH | From [sepoliafaucet.com](https://sepoliafaucet.com) |
| Chrome | For loading the extension |

---

### Step 1 — Deploy the Smart Contracts

```bash
cd base/contracts
npm install
export PRIVATE_KEY="your_wallet_private_key"
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --broadcast
```

> Copy the **EAX contract address** and **MockERC20 address** from the terminal output.

---

### Step 2 — Configure Environment Variables

Create `base/.env.local`:

```env
NEXT_PUBLIC_EAX_CONTRACT_ADDRESS="<your_deployed_EAX_address>"
NEXT_PUBLIC_ATTN_TOKEN_ADDRESS="<your_deployed_MockERC20_address>"
NEXT_PUBLIC_BACKEND_URL="http://localhost:4000"
```

---

### Step 3 — Start the Backend Ad Server

```bash
cd base/backend
npm install
node server.js
```

Server starts on **port 4000**. Available routes:

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Health check + ad count |
| `POST` | `/registerAd` | Register an ad creative |
| `GET` | `/getAd/:advertiserId` | Fetch creative by ID |
| `GET` | `/ads` | List all registered ads |

---

### Step 4 — Start the Frontend

```bash
cd base
npm install
npm run dev
```

App runs at **[http://localhost:3000](http://localhost:3000)**.

---

### Step 5 — Load the Chrome Extension

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `base/extension/`
4. Pin the **AdScience** extension in your Chrome toolbar

> **First run note:** The extension downloads a ~90 MB WASM ML model on first use. Subsequent runs use the browser cache and are instant.

---

## 🔄 Full End-to-End Workflow

### Phase A — Advertiser Registration

1. Go to `http://localhost:3000/advertiser`
2. Click **Faucet: Get 10,000 Test ATTN** to mint test tokens
3. Select targeting categories (e.g., `CRYPTO` + `AI`)
4. Set **Max Bid** (e.g., `15 ATTN`) and **Total Budget** (e.g., `500 ATTN`)
5. Fill in ad creative: title, image URL, CTA, destination link
6. Click **Register Intent Target + Ad Creative**
7. Confirm **two** Metamask transactions:
   - ERC-20 `approve()` for the budget amount
   - `registerAdvertiser()` on the EAX contract
8. Ad creative is uploaded to the backend via `POST /registerAd`

---

### Phase B — Encrypted Matching

1. Browse websites to populate browser history
2. Open the **AdScience** extension popup
3. Click **Start Analysis** — extension reads `chrome.history`
4. Click **Classify** — local WASM ML model runs zero-shot classification
5. Review detected interest vector, then click **Encrypt & Send**
6. Extension bridges the vector to the DApp via `content.js` → `postMessage`
7. On `http://localhost:3000`, click **Encrypt & Match My Attention**
8. The DApp:
   - Encrypts the vector using CoFHE SDK → `euint64[5]`
   - Submits `matchIntent()` transaction on-chain
   - FHE dot products run entirely on-chain (no plaintext exposure)
   - Threshold network decrypts the winning advertiser index
   - `revealMatch()` stores `activeAdvertiser[user] = winnerId`

---

### Phase C — Ad Serving & Reward

1. Go to `http://localhost:3000/demo` (publisher simulation)
2. SDK reads `activeAdvertiser[user]` from the contract
3. Fetches ad creative from the backend (`GET /getAd/:id`)
4. Ad is rendered in the provided DOM container
5. Click **Confirm Impression → Earn ATTN**
6. `recordImpression()` executes on-chain:
   - Verifies active match exists
   - Deducts the bid amount from the advertiser's on-chain budget
   - Transfers `bid` ATTN tokens to the user's wallet
   - Resets match state (one payout per match cycle)

---

## 📦 EAX SDK — Publisher Integration

Publishers can integrate EAX ad serving into any website with a few lines:

```bash
npm install eax-sdk ethers @cofhe/sdk
```

```javascript
import { initEAX, getAd, renderAd } from "eax-sdk";

// 1. Initialize with deployed contract and backend
await initEAX({
  contractAddress: "0x...",
  backendUrl: "http://localhost:4000"
});

// 2. Fetch the matched ad for the current user
const ad = await getAd();

if (ad) {
  // 3. Render ad and auto-trigger on-chain payout
  const slot = document.getElementById("ad-slot");
  const result = await renderAd(slot, ad);
  console.log(`User earned ${result.payout} ATTN — tx: ${result.txHash}`);
} else {
  console.log("No active match for this user yet.");
}
```

### SDK API Reference

| Function | Description | Returns |
|---|---|---|
| `initEAX(config)` | Initialize SDK with contract address + backend URL. Triggers Metamask connection. | `void` |
| `runMatch()` | Full intent matching pipeline (extension vector → FHE encrypt → on-chain match → reveal). Typically called by the EAX hub, not publishers. | `{ advertiserId, taskId, txHash }` |
| `getAd(userAddress?)` | Reads `activeAdvertiser` from chain, fetches creative from backend. | `AdCreative \| null` |
| `renderAd(container, ad, options?)` | Injects ad into DOM, triggers `recordImpression()` to pay the user. | `{ txHash, payout }` |
| `getActiveAdvertiser(userAddress?)` | Reads active advertiser assignment directly from chain. | `{ advertiserId } \| null` |
| `recordImpression()` | Notifies contract that ad was shown, triggers ATTN payout. | `{ txHash, payout, advertiserId }` |

---

## 📜 Smart Contract Reference — `EAX.sol`

Deployed on **Ethereum Sepolia** via Foundry.

### Key State

```solidity
Advertiser[10] public advertisers;       // Fixed-size advertiser registry
mapping(address => uint8) public activeAdvertiser;  // user → winner ID
mapping(address => bool) public hasActiveMatch;      // pending ad flag
mapping(uint256 => MatchTask) public tasks;          // FHE match tasks
```

### Core Functions

| Function | Visibility | Description |
|---|---|---|
| `registerAdvertiser(vector, bid, budget)` | `external` | Registers advertiser, locks ERC-20 budget |
| `depositFunds(advertiserId, amount)` | `external` | Top up advertiser balance |
| `matchIntent(encVec[])` | `external` | Submit encrypted interest vector, run FHE auction |
| `revealMatch(taskId, winnerIdx, sig)` | `external` | Reveal threshold-decrypted winner, assign ad |
| `recordImpression()` | `external` | Claim ATTN payout after viewing ad |
| `initializeAdvertisers()` | `onlyOwner` | Seed initial demo advertisers |

### Events

```solidity
event AdvertiserRegistered(uint256 indexed id, address indexed addr, uint64 bid);
event MatchSubmitted(uint256 indexed taskId, address indexed user);
event MatchRevealed(address indexed user, uint8 advertiserId);
event ImpressionRecorded(address indexed user, uint8 advertiserId, uint64 payout);
```

---

## 🔒 Privacy Guarantees

| Property | How it's achieved |
|---|---|
| **No raw data to servers** | ML inference runs entirely inside the Chrome extension (local WASM) |
| **No plaintext vector on-chain** | Intent vector is FHE-encrypted before the contract ever sees it |
| **Advertiser vectors never revealed** | Dot products execute in FHE space — only the encrypted winner index is stored |
| **Winner hidden until claim** | `euint8 winnerIndex` is threshold-decrypted only when the user calls `revealMatch` |
| **Cross-site serving without tracking** | Any publisher reads `activeAdvertiser` from chain — no cookies, no fingerprinting |

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| Backend unreachable | Run `node base/backend/server.js` and confirm port 4000 is free |
| No ad on `/demo` | Register at least one advertiser with an ad creative first |
| "No active match" error | Run the match flow on the main page before visiting `/demo` |
| Metamask wrong network | Switch to **Ethereum Sepolia** (chainId `11155111`) |
| Contract reverts | Redeploy after any contract changes using `forge script` |
| Extension shows empty domains | Visit some websites first so `chrome.history` is populated |
| ML model slow on first run | ~90 MB WASM model is downloading; subsequent runs use browser cache |
| `matchIntent` fails | Ensure `encVec.length == 5` and the CoFHE SDK is correctly initialized |

---

## 🧪 Running Tests

```bash
# Smart contract tests (Foundry)
cd base/contracts
forge test -vv
```

---

## 🌐 Pages

| URL | Description |
|---|---|
| `http://localhost:3000` | EAX Hub — encrypt and match your intent vector |
| `http://localhost:3000/advertiser` | Advertiser portal — register targeting + ad creative |
| `http://localhost:3000/demo` | Publisher demo — view matched ad, earn ATTN |

---

## 📝 License

MIT
