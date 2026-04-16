/**
 * locus-client.js
 * Real Locus REST API client for production.
 *
 * Swap this in by setting NODE_ENV=production and LOCUS_API_KEY=claw_xxxx.
 * The interface is identical to mock-locus.js — the agent service doesn't care which is injected.
 *
 * API Base: https://api.paywithlocus.com/api
 * Docs:     https://paywithlocus.com/skill.md
 * Onboarding: https://paywithlocus.com/onboarding.md
 */

const axios = require("axios");
const crypto = require("crypto");

function createLocusClient({ apiKey, apiUrl, logger } = {}) {
  if (!apiKey) throw new Error("LOCUS_API_KEY is required to use the real Locus client.");

  const client = axios.create({
    baseURL: apiUrl || "https://api.paywithlocus.com/api",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  // Local map: authorizationId → pending transfer intent
  // Locus doesn't have explicit "authorize" holds — we model it locally
  // and call POST /pay/send on captureTransfer.
  const authorizations = new Map();

  async function getBalance(walletAddress, currency = "USDC") {
    const res = await client.get("/pay/balance");
    const data = res.data.data;
    return {
      currency,
      available: parseFloat(data.balance_usdc || 0),
      reserved: 0, // Locus exposes no reserved amount
      total: parseFloat(data.balance_usdc || 0),
      revoked: false, // handled via dashboard policy controls
    };
  }

  async function authorizeTransfer(walletAddress, amount, currency = "USDC", metadata = {}) {
    const authId = `auth-${crypto.randomBytes(6).toString("hex")}`;
    authorizations.set(authId, {
      walletAddress,
      amount,
      currency,
      metadata,
      status: "authorized",
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    if (logger) logger("authorize", { authorizationId: authId, amount, currency, status: "authorized" });

    return {
      authorizationId: authId,
      status: "authorized",
      walletAddress,
      amount,
      currency,
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000,
      errors: [],
    };
  }

  async function captureTransfer(authorizationId, metadata = {}) {
    const auth = authorizations.get(authorizationId);
    if (!auth) throw new Error(`Authorization ${authorizationId} not found or expired.`);
    if (Date.now() > auth.expiresAt) {
      authorizations.delete(authorizationId);
      throw new Error(`Authorization ${authorizationId} has expired.`);
    }

    let res;
    try {
      res = await client.post("/pay/send", {
        to_address: auth.walletAddress,
        amount: auth.amount,
        memo: metadata.memo || `EAX purchase ${authorizationId}`,
      });
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) {
        if (logger) logger("capture_policy_rejected", { authorizationId, error: err.response.data?.message });
        throw new Error(`Locus policy rejected: ${err.response.data?.message}`);
      }
      if (logger) logger("capture_failed", { authorizationId, error: err.message });
      throw err;
    }

    const txData = res.data.data;

    if (logger) logger("capture", { authorizationId, transactionId: txData.transaction_id, apiStatus: txData.status });

    auth.status = "captured";
    auth.transactionId = txData.transaction_id;
    auth.capturedAt = Date.now();

    return {
      status: txData.status === "PENDING_APPROVAL" ? "pending_human_approval" : "captured",
      authorizationId,
      transactionId: txData.transaction_id,
      walletAddress: auth.walletAddress,
      amount: auth.amount,
      currency: auth.currency,
      capturedAt: auth.capturedAt,
      approvalUrl: txData.approval_url || null, // present when PENDING_APPROVAL
      errors: [],
    };
  }

  async function voidTransfer(authorizationId) {
    const auth = authorizations.get(authorizationId);
    if (!auth) throw new Error(`Authorization ${authorizationId} not found.`);

    // In Locus, a void is simply not calling captureTransfer.
    // We remove it from our local map so it can't be accidentally captured later.
    authorizations.delete(authorizationId);

    if (logger) logger("void", { authorizationId, amount: auth.amount, status: "voided" });

    return {
      status: "voided",
      authorizationId,
      amount: auth.amount,
      currency: auth.currency,
      voidedAt: Date.now(),
    };
  }

  async function revokeWallet(walletAddress, reason) {
    // Locus doesn't support per-wallet revocation via API.
    // Use the Locus dashboard policy controls to block addresses.
    if (logger) logger("revoke_wallet_requested", { walletAddress, reason, note: "Manual action required in Locus dashboard." });
    return { status: "noted", message: "Use Locus dashboard to revoke wallets." };
  }

  async function restoreWallet(walletAddress, reason) {
    if (logger) logger("restore_wallet_requested", { walletAddress, reason, note: "Manual action required in Locus dashboard." });
    return { status: "noted", message: "Use Locus dashboard to restore wallets." };
  }

  /**
   * Optional: poll a transaction until CONFIRMED or FAILED.
   * Useful if you want to await settlement before responding to the frontend.
   */
  async function pollTransaction(transactionId, { maxAttempts = 30, delayMs = 2000 } = {}) {
    for (let i = 0; i < maxAttempts; i++) {
      const res = await client.get(`/pay/transactions/${transactionId}`);
      const tx = res.data.data.transaction;
      if (tx.status === "CONFIRMED") return { status: "confirmed", txHash: tx.tx_hash };
      if (["FAILED", "POLICY_REJECTED", "CANCELLED", "EXPIRED"].includes(tx.status)) {
        return { status: "failed", reason: tx.failure_reason || tx.status };
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return { status: "still_processing", message: "Check Locus dashboard for final status." };
  }

  return { getBalance, authorizeTransfer, captureTransfer, voidTransfer, revokeWallet, restoreWallet, pollTransaction };
}

module.exports = { createLocusClient };
