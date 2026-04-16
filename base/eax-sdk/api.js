/**
 * eax-sdk/api.js
 *
 * Backend API calls + ad rendering + purchasing agent integration
 */

import { getConfig, getUserAddress, getActiveAdvertiser, recordImpression } from "./contract.js";

// ── Purchasing Agent helpers ─────────────────────────────────────

/**
 * Returns true if the ad has purchase metadata AND the caller opts in.
 */
function shouldUsePurchaseAgent(ad, options = {}) {
  return !!(options.enablePurchasingAgent && ad.purchaseAmount != null && ad.purchaseAmount > 0);
}

/**
 * Build the purchase intent payload from an ad creative and options.
 */
function buildPurchasePayload(ad, options = {}) {
  return {
    userAddress: options.userAddress || null,
    merchantId: String(ad.advertiserId),
    amount: ad.purchaseAmount,
    currency: ad.purchaseCurrency || "USDC",
    description: `EAX Ad: ${ad.title}`,
    requiresConfirmation: ad.requiresConfirmation || false,
  };
}

/**
 * Submit a purchase preview to the backend purchasing agent.
 * Returns the agent request record (with requestId, decision, status).
 */
async function submitPurchaseIntent(ad, options = {}) {
  const config = getConfig();
  if (!config) throw new Error("Call initEAX() first.");

  const payload = buildPurchasePayload(ad, {
    ...options,
    userAddress: options.userAddress || getUserAddress(),
  });

  const res = await fetch(`${config.backendUrl}/agent/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Purchasing agent error: ${err.error || res.statusText}`);
  }

  return await res.json();
}

/**
 * Confirm a pending purchase intent (after user approves).
 * Returns the captured/completed request record.
 */
async function confirmPurchaseIntent(requestId, options = {}) {
  const config = getConfig();
  if (!config) throw new Error("Call initEAX() first.");

  const res = await fetch(`${config.backendUrl}/agent/purchase/${requestId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options.metadata || {}),
  });

  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Confirm purchase error: ${err.error || res.statusText}`);
  }

  return await res.json();
}

// ── Ad fetching ──────────────────────────────────────────────────

/**
 * Get the matched ad for the current user.
 * Reads activeAdvertiser from the contract, then fetches the creative from backend.
 *
 * @param {string} [userAddress] - defaults to connected wallet
 * @returns {Object|null} Ad creative object or null if no active match
 */
export async function getAd(userAddress) {
  const config = getConfig();
  if (!config) throw new Error("Call initEAX() first");

  const match = await getActiveAdvertiser(userAddress);
  if (!match) return null;

  const res = await fetch(`${config.backendUrl}/getAd/${match.advertiserId}`);
  if (!res.ok) {
    console.warn(`[EAX SDK] No ad creative found for advertiser ${match.advertiserId}`);
    return null;
  }

  return await res.json();
}

// ── Ad rendering ─────────────────────────────────────────────────

/**
 * Render an ad into a DOM container and trigger on-chain impression (payout).
 *
 * @param {HTMLElement} container
 * @param {Object} ad
 * @param {Object} [options]
 * @param {boolean} [options.triggerImpression=true]
 * @param {boolean} [options.interactive=false]
 * @param {boolean} [options.enablePurchasingAgent=false] - Intercept CTA clicks via purchasing agent
 * @param {Function} [options.onImpressionRecorded]
 * @param {Function} [options.onPurchaseComplete]
 */
export async function renderAd(container, ad, options = {}) {
  const {
    triggerImpression = true,
    interactive = false,
    enablePurchasingAgent = false,
    onImpressionRecorded = null,
    onPurchaseComplete = null,
  } = options;

  if (!container || !ad) {
    console.warn("[EAX SDK] renderAd: missing container or ad");
    return {};
  }

  const uniqueId = Math.random().toString(36).substr(2, 9);
  const btnId = `eax-btn-${uniqueId}`;
  const statusId = `eax-status-${uniqueId}`;
  const purchaseBtnId = `eax-purchase-btn-${uniqueId}`;
  const purchaseStatusId = `eax-purchase-status-${uniqueId}`;

  const hasPurchase = shouldUsePurchaseAgent(ad, { enablePurchasingAgent });

  container.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      font-family: system-ui, -apple-system, sans-serif;
      color: #fff;
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 12px 40px rgba(139,92,246,0.25)'"
       onmouseout="this.style.transform='none';this.style.boxShadow='0 8px 32px rgba(139,92,246,0.15)'">
      ${ad.image ? `<img src="${ad.image}" alt="${ad.title}" style="
        width: 100%;
        border-radius: 12px;
        margin-bottom: 16px;
        object-fit: cover;
        max-height: 200px;
      " />` : ""}
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="
          background: rgba(139, 92, 246, 0.2);
          border: 1px solid rgba(139, 92, 246, 0.4);
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 11px;
          color: #a78bfa;
          letter-spacing: 0.5px;
        ">EAX AD</span>
        <span style="font-size: 11px; color: #666;">Privacy-Preserving</span>
      </div>
      <h3 style="
        margin: 0 0 12px 0;
        font-size: 20px;
        font-weight: 700;
        background: linear-gradient(to right, #a78bfa, #ec4899);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      ">${ad.title}</h3>

      ${hasPurchase ? `
        <!-- Purchase agent CTA (intercepts click) -->
        <button id="${purchaseBtnId}" style="
          display: inline-block;
          background: linear-gradient(to right, #8b5cf6, #ec4899);
          color: #fff;
          padding: 10px 24px;
          border-radius: 10px;
          border: none;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: opacity 0.2s;
        " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">${ad.cta || "Buy Now"} · ${ad.purchaseAmount} ${ad.purchaseCurrency || "USDC"}</button>
        <p id="${purchaseStatusId}" style="margin-top: 8px; font-size: 12px; color: #a78bfa; display: none;"></p>
      ` : `
        <a href="${ad.link}" target="_blank" rel="noopener noreferrer" style="
          display: inline-block;
          background: linear-gradient(to right, #8b5cf6, #ec4899);
          color: #fff;
          padding: 10px 24px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          transition: opacity 0.2s;
        " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">${ad.cta || "Learn More"}</a>
      `}

      ${interactive ? `
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(139, 92, 246, 0.2);">
          <button id="${btnId}" style="
            width: 100%;
            background: rgba(139, 92, 246, 0.1);
            border: 1px solid #8b5cf6;
            color: #a78bfa;
            padding: 12px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(139, 92, 246, 0.2)'" onmouseout="this.style.background='rgba(139, 92, 246, 0.1)'">
            Confirm Impression & Earn ATTN
          </button>
          <p id="${statusId}" style="margin-top: 8px; font-size: 12px; color: #ef4444; text-align: center; display: none;"></p>
        </div>
      ` : `
        <div style="margin-top: 12px; font-size: 11px; color: #555; display: flex; align-items: center; gap: 4px;">
          🔒 Matched via encrypted intent · You earned ATTN for viewing
        </div>
      `}
    </div>
  `;

  // ── Purchase agent CTA handler ───────────────────────────────────
  if (hasPurchase) {
    const purchaseBtn = container.querySelector(`#${purchaseBtnId}`);
    const purchaseStatusEl = container.querySelector(`#${purchaseStatusId}`);

    if (purchaseBtn && purchaseStatusEl) {
      purchaseBtn.addEventListener("click", async () => {
        purchaseBtn.disabled = true;
        purchaseBtn.style.opacity = "0.6";
        purchaseStatusEl.style.display = "block";
        purchaseStatusEl.style.color = "#a78bfa";
        purchaseStatusEl.innerText = "Processing payment...";

        try {
          // Step 1: preview → policy check + reserve
          const preview = await submitPurchaseIntent(ad, { enablePurchasingAgent: true });

          if (preview.decision === "auto_approve" || preview.status === "completed") {
            // Already captured (auto-approve path)
            purchaseStatusEl.style.color = "#10b981";
            purchaseStatusEl.innerText = `✅ Purchase complete! ${ad.purchaseAmount} ${ad.purchaseCurrency || "USDC"} sent.`;
            if (onPurchaseComplete) onPurchaseComplete(preview);
            window.open(ad.link, "_blank", "noopener,noreferrer");
            return;
          }

          if (preview.status === "pending_confirmation") {
            purchaseStatusEl.innerText = `Confirm purchase of ${ad.purchaseAmount} ${ad.purchaseCurrency || "USDC"}?`;

            // Inline confirm button
            const confirmBtn = document.createElement("button");
            confirmBtn.innerText = "Yes, confirm";
            confirmBtn.style.cssText = "margin-top:8px;background:#8b5cf6;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;";
            purchaseStatusEl.after(confirmBtn);

            confirmBtn.addEventListener("click", async () => {
              confirmBtn.remove();
              purchaseStatusEl.innerText = "Confirming...";
              try {
                const confirmed = await confirmPurchaseIntent(preview.requestId);
                purchaseStatusEl.style.color = "#10b981";
                if (confirmed.approvalUrl) {
                  purchaseStatusEl.innerHTML = `⏳ Awaiting human approval. <a href="${confirmed.approvalUrl}" target="_blank" style="color:#a78bfa;">Approve here →</a>`;
                } else {
                  purchaseStatusEl.innerText = `✅ Purchase confirmed! Navigating...`;
                  setTimeout(() => window.open(ad.link, "_blank", "noopener,noreferrer"), 1000);
                }
                if (onPurchaseComplete) onPurchaseComplete(confirmed);
              } catch (err) {
                purchaseStatusEl.style.color = "#ef4444";
                purchaseStatusEl.innerText = `Confirmation failed: ${err.message}`;
                purchaseBtn.disabled = false;
                purchaseBtn.style.opacity = "1";
              }
            });
            return;
          }

          // Declined / rate limited / duplicate
          purchaseStatusEl.style.color = "#ef4444";
          purchaseStatusEl.innerText = `Purchase declined: ${preview.reason}`;
          purchaseBtn.disabled = false;
          purchaseBtn.style.opacity = "1";

        } catch (err) {
          console.warn("[EAX SDK] Purchase agent error:", err.message);
          purchaseStatusEl.style.color = "#ef4444";
          purchaseStatusEl.innerText = `Error: ${err.message}`;
          purchaseBtn.disabled = false;
          purchaseBtn.style.opacity = "1";
        }
      });
    }
  }

  // ── Impression handler ───────────────────────────────────────────
  if (interactive) {
    const btn = container.querySelector(`#${btnId}`);
    const statusEl = container.querySelector(`#${statusId}`);

    if (btn && statusEl) {
      btn.addEventListener("click", async () => {
        btn.innerText = "Processing...";
        btn.style.opacity = "0.7";
        btn.style.pointerEvents = "none";
        statusEl.style.display = "none";

        try {
          const result = await recordImpression();
          btn.style.display = "none";
          statusEl.style.display = "block";
          statusEl.style.color = "#10b981";
          statusEl.innerHTML = `✅ Earned +${result.payout} ATTN`;
          if (onImpressionRecorded) onImpressionRecorded(result);
        } catch (err) {
          console.warn("[EAX SDK] Impression failed:", err.message);
          btn.innerText = "Confirm Impression & Earn ATTN";
          btn.style.opacity = "1";
          btn.style.pointerEvents = "auto";
          statusEl.style.display = "block";
          statusEl.style.color = "#ef4444";
          statusEl.innerText = "Transaction failed or rejected.";
        }
      });
    }
    return { interactive: true };
  }

  // Auto-trigger impression
  if (triggerImpression) {
    try {
      const result = await recordImpression();
      console.log(`[EAX SDK] Auto-impression recorded | Payout: ${result.payout} ATTN`);
      return result;
    } catch (err) {
      console.warn("[EAX SDK] Auto-impression failed:", err.message);
      return {};
    }
  }

  return {};
}
