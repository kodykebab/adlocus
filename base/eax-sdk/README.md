# EAX SDK

The **Encrypted Attention Exchange (EAX)** SDK connects websites to a privacy-preserving ad network powered by Fully Homomorphic Encryption (FHE) on the Fhenix CoFHE network.

With a few lines of code, you can integrate EAX into your website, serve ads targeted using matching algorithms that never see the user's raw data, and automatically pay users `ATTN` tokens for viewing these ads.

## Installation

Inside your project:
```bash
npm install eax-sdk ethers @cofhe/sdk
```
*(Note: `ethers` and `@cofhe/sdk` are peer dependencies.)*

## Quick Start (Publisher Demo)

Using the SDK to serve a privacy-preserving ad to the user:

```javascript
import { initEAX, getAd, renderAd } from "eax-sdk";

// 1. Initialize with your environments
await initEAX({ 
  contractAddress: "0xYourContractBasedOnNetwork...", 
  backendUrl: "http://localhost:4000" 
});

// 2. Fetch the assigned ad (Automatically queries the blockchain to figure out the assigned advertiser, then fetches the ad creative from backend)
const ad = await getAd();

if (ad) {
  // 3. Render the Ad on-screen. This automatically pays out the user their `ATTN` reward on-chain via a `recordImpression` transaction!
  const adSlot = document.getElementById("ad-slot");
  await renderAd(adSlot, ad);
} else {
  console.log("User currently does not have an active matching intent vector generated.");
}
```

---

## Architecture Flow

The SDK abstracts away three major layers of the system:
1. **Extension Communication:** Getting the local ML intent vector securely.
2. **On-Chain FHE Matching:** Encrypting using CoFHE SDK, submitting the transaction (`matchIntent`), evaluating decryption signatures, and executing the `revealMatch`.
3. **Cross-Site Ad Serving:** Querying the `activeAdvertiser`, pulling creatives smoothly, and executing `recordImpression()` to finalize payouts to the user.

---

## API Reference

### `initEAX(config)`
Initializes the EAX SDK. Must be called before any other functionality. Will prompt Metamask request connections.

**Parameters:**
* `config.contractAddress` (string) - Deployed EAX contract.
* `config.backendUrl` (string) - Ad creative storage server URL.

---

### `runMatch()`
Runs the full intent matching pipeline for a user. Generally called by the main EAX central Hub/dApp, rather than third-party publishers. 

1. Listens for the user's intent vector via secure Extension `postMessage`.
2. Encrypts intent via the `CoFHE` ZK pipeline.
3. Submits `matchIntent` transaction on-chain.
4. Uses `CoFHE` coprocessor to perform threshold decryption for the auction winner.
5. Executes `revealMatch` to assign the winner across the network.

**Returns:** `{ advertiserId: number, taskId: string, txHash: string }`

---

### `getAd(userAddress?)`
Fetches the designated active ad creative for a user.

1. Calls the blockchain to check `activeAdvertiser`.
2. Fetches the designated JSON creative from the Backend server.

**Parameters:**
* `userAddress` (string) - Optional. Defaults to the connected wallet.

**Returns:** `Object` (Ad Creative Interface) or `null`.
```json
{
  "advertiserId": 1,
  "title": "Trade Crypto Securely",
  "image": "...",
  "cta": "Start Trading",
  "link": "https://..."
}
```

---

### `renderAd(container, ad, options?)`
Injects an EAX Ad Interface cleanly into any DOM container and securely manages the `recordImpression` logic automatically.

**Parameters:**
* `container` (HTMLElement) - DOM element container.
* `ad` (Object) - Ad creative fetched from `getAd`.
* `options.triggerImpression` (boolean) - Default `true`. Trigger `recordImpression()` on chain to reward the user when served.

**Returns:** `{ txHash: string, payout: number }`

---

### `getActiveAdvertiser(userAddress?)`
Directly checks the blockchain to determine what advertiser ID the user is actively assigned to right now.

**Returns:** `{ advertiserId: number }` or `null`.

---

### `recordImpression()`
Interacts with the Smart Contract to notify that the active intent match was successfully shown. This triggers the on-chain reset, and initiates the `ATTN` token payout from the Advertiser's budget to the User.

**Returns:** `{ txHash: string, payout: number, advertiserId: number }`
