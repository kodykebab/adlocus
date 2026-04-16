# Testing EAX — End-to-End Demo Guide

The EAX (Encrypted Attention Exchange) is a privacy-preserving ad exchange. User interests are classified locally via ML, encrypted via FHE, matched on-chain against advertisers, and ads are served across sites with payout on impression.

## Prerequisites

- **Metamask** on **Ethereum Sepolia** (chainId 11155111)
- **Sepolia ETH** for gas (faucet: `sepoliafaucet.com`)
- **Foundry** installed (`forge`, `cast`)
- **Node.js** v18+

---

## Step 1: Deploy EAX Contract

```bash
cd base/contracts
npm install
export PRIVATE_KEY="your_private_key"
forge script script/Deploy.s.sol:DeployScript --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast
```

Copy the deployed `EAX` contract address **and** the `MockERC20` contract address from the terminal output.

---

## Step 2: Configure Environment

Create `base/.env.local`:

```
NEXT_PUBLIC_EAX_CONTRACT_ADDRESS="<YOUR_DEPLOYED_CONTRACT_ADDRESS>"
NEXT_PUBLIC_ATTN_TOKEN_ADDRESS="<YOUR_DEPLOYED_MOCKERC20_ADDRESS>"
NEXT_PUBLIC_BACKEND_URL="http://localhost:4000"
```

---

## Step 3: Start Backend

```bash
cd base/backend
npm install
node server.js
```

You should see the EAX Ad Server banner on port 4000.

---

## Step 4: Start Frontend

```bash
cd base
npm install ethers @cofhe/sdk viem
npm run dev
```

Keep `http://localhost:3000` open.

---

## Step 5: Load Chrome Extension

1. `chrome://extensions/` → Enable Developer mode
2. Click **Load unpacked** → select `base/extension`
3. Pin the **AdScience** extension

---

## Step 6: Full Workflow

### Phase A — Register an Advertiser + Ad Creative

1. Go to `http://localhost:3000/advertiser`
2. **Important**: Click **Faucet: Get 10,000 Test ATTN** to mint test tokens to your wallet.
3. Select targeting categories (e.g., `CRYPTO` + `AI`)
4. Set Max Bid (e.g., `15` ATTN) and Total Budget (e.g., `500` ATTN). This budget is locked up to pay for impressions.
5. Fill in ad creative:
   - **Title**: "Trade Crypto Securely"
   - **Image URL**: (optional)
   - **CTA**: "Start Trading"
   - **Link**: "https://example.com"
6. Click **Register Intent Target + Ad Creative**
7. Confirm the **two** on-chain txs in Metamask (1 for Token Approve, 1 for Registration)
8. The portal will:
   - Request ERC20 approval for your budget
   - Register targeting vector + deposit budget on-chain
   - Upload ad creative to the backend (POST /registerAd)

### Phase B — Run Encrypted Match

1. Browse some websites to populate `chrome.history`
2. Go to `http://localhost:3000`
3. Click the extension icon → **Start Analysis**
4. The extension classifies your history locally → sends vector to the page
5. Click **Encrypt & Match My Attention**
6. The flow:
   - CoFHE ZK proof encrypts your intent vector
   - `matchIntent()` tx runs FHE dot products on-chain
   - Threshold network decrypts the winner
   - `revealMatch()` assigns `activeAdvertiser[you] = winnerId`
7. You'll see: "Ad assigned! Advertiser #X"

### Phase C — View Ad & Earn (Cross-Site)

1. Go to `http://localhost:3000/demo` (simulates a third-party publisher)
2. The page reads `activeAdvertiser[you]` from the contract
3. Fetches the ad creative from the backend
4. Displays the matched ad
5. Click **Confirm Impression → Earn ATTN**
6. `recordImpression()` executes on-chain:
   - Verifies your active match
   - Transfers the advertiser's bid to your wallet
   - Resets your state (one payout per match)

---

## Architecture

```
MATCH PHASE (Site A — EAX DApp)
────────────────────────────────
Extension → local ML classify → [0,1,1,1,0]
  ↓ postMessage
DApp → CoFHE encrypt → matchIntent() tx
  ↓ threshold decrypt
DApp → revealMatch() → activeAdvertiser[user] = 2

SERVE PHASE (Site B — Any Publisher)
────────────────────────────────
SDK → reads activeAdvertiser[user] from chain
SDK → fetches creative from backend
SDK → renders ad
SDK → recordImpression() → user gets paid ✅
```

## SDK Integration (for publishers)

```js
import { initEAX, getAd, renderAd } from "eax-sdk";

await initEAX({
  contractAddress: "0x...",
  backendUrl: "http://localhost:4000"
});

const ad = await getAd();
await renderAd(document.getElementById("ad-slot"), ad);
```

## Troubleshooting

| Issue | Fix |
|---|---|
| Backend not reachable | Run `node backend/server.js` on port 4000 |
| No ad shown on /demo | Register an advertiser with ad creative first |
| "No active match" | Run a match on the main page first |
| Metamask wrong network | Switch to Ethereum Sepolia (11155111) |
| Contract reverts | Redeploy after contract changes with `forge script` |
