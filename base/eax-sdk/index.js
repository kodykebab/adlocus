/**
 * eax-sdk — Privacy-preserving ad exchange SDK
 * 
 * Usage:
 *   import { initEAX, runMatch, getAd, renderAd } from "eax-sdk";
 * 
 *   await initEAX({ contractAddress: "0x...", backendUrl: "http://localhost:4000" });
 *   await runMatch();                      // encrypt + match + reveal
 *   const ad = await getAd();              // fetch matched ad creative
 *   await renderAd(container, ad);         // render + trigger payout
 */

export { initEAX, runMatch, getActiveAdvertiser, recordImpression } from "./contract.js";
export { getAd, renderAd } from "./api.js";
