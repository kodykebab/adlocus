/**
 * index.js — Purchasing Agent Service
 *
 * Orchestrates the full purchase lifecycle:
 *   1. previewPurchase()  — policy check + fund reservation (AUTHORIZE)
 *   2. confirmPurchase()  — fund settlement (CAPTURE)
 *   3. revokePermissions() — block wallet from future purchases
 *
 * The locus client is injected — works with both mock-locus.js (dev) and locus-client.js (prod).
 */

const crypto = require("crypto");
const { evaluatePurchasePolicy } = require("./policy-engine");

function createPurchasingAgentService({
  locus,
  auditLog,
  approvalThreshold = 25,
  confirmationThreshold = 250,
  hardLimit = 5000,
}) {
  if (!locus) throw new Error("PurchasingAgentService requires a locus client.");
  if (!auditLog) throw new Error("PurchasingAgentService requires an auditLog store.");

  // In-memory request store: requestId → request record
  // Upgrade to persistent DB when ready to scale.
  const requests = new Map();

  const thresholds = { approvalThreshold, confirmationThreshold, hardLimit };

  /**
   * Preview a purchase intent. Evaluates policy and reserves funds if approved.
   *
   * @param {Object} intent
   * @param {string} intent.userAddress    - buyer's wallet
   * @param {string} intent.merchantId     - advertiser / merchant ID
   * @param {number} intent.amount         - purchase amount
   * @param {string} intent.currency       - e.g. "USDC" or "ATTN"
   * @param {string} [intent.description]  - human-readable purchase description
   * @param {boolean} [intent.requiresConfirmation] - advertiser-level override
   * @returns {Object} request record with decision and status
   */
  async function previewPurchase(intent) {
    const { userAddress, merchantId, amount, currency = "USDC", description, requiresConfirmation } = intent;

    if (!userAddress || !merchantId || amount == null) {
      throw new Error("previewPurchase requires: userAddress, merchantId, amount");
    }

    const requestId = `req-${crypto.randomBytes(8).toString("hex")}`;

    // --- Policy evaluation ---
    let { decision, reason } = evaluatePurchasePolicy(intent, thresholds);

    // Advertiser-level override: if the ad explicitly requires confirmation, upgrade auto_approve
    if (requiresConfirmation && decision === "auto_approve") {
      decision = "requires_confirmation";
      reason = "Advertiser requires explicit user confirmation.";
    }

    auditLog.append({ type: "preview", requestId, userAddress, merchantId, amount, currency, decision, reason });

    // --- Hard declines — no fund reservation ---
    if (["declined", "rate_limited", "duplicate"].includes(decision)) {
      const record = { requestId, status: "rejected", decision, reason, userAddress, merchantId, amount, currency, createdAt: Date.now() };
      requests.set(requestId, record);
      return record;
    }

    // --- Check balance ---
    let balance;
    try {
      balance = await locus.getBalance(userAddress, currency);
    } catch (err) {
      auditLog.append({ type: "balance_check_failed", requestId, error: err.message });
      throw err;
    }

    if (balance.revoked) {
      const record = { requestId, status: "rejected", decision: "revoked", reason: `Wallet ${userAddress} is revoked.`, userAddress, merchantId, amount, currency, createdAt: Date.now() };
      requests.set(requestId, record);
      auditLog.append({ type: "rejected_revoked", requestId });
      return record;
    }

    if (balance.available < amount) {
      const record = { requestId, status: "rejected", decision: "insufficient_funds", reason: `Insufficient balance: ${balance.available} ${currency} available.`, userAddress, merchantId, amount, currency, createdAt: Date.now() };
      requests.set(requestId, record);
      auditLog.append({ type: "rejected_insufficient_funds", requestId, available: balance.available, required: amount });
      return record;
    }

    // --- Reserve funds ---
    let authorization;
    try {
      authorization = await locus.authorizeTransfer(userAddress, amount, currency, { requestId, merchantId, description });
    } catch (err) {
      auditLog.append({ type: "authorize_failed", requestId, error: err.message });
      throw err;
    }

    auditLog.append({ type: "locus:authorize", requestId, authorizationId: authorization.authorizationId, status: "authorized", amount, currency });

    const record = {
      requestId,
      status: decision === "auto_approve" ? "auto_approved" : "pending_confirmation",
      decision,
      reason,
      userAddress,
      merchantId,
      amount,
      currency,
      description,
      authorizationId: authorization.authorizationId,
      createdAt: Date.now(),
    };
    requests.set(requestId, record);

    // --- Auto-approve: immediately capture ---
    if (decision === "auto_approve") {
      return confirmPurchase(requestId);
    }

    return record;
  }

  /**
   * Confirm a pending purchase. Captures the reserved funds.
   *
   * @param {string} requestId
   * @returns {Object} updated request record
   */
  async function confirmPurchase(requestId) {
    const record = requests.get(requestId);
    if (!record) throw new Error(`Request ${requestId} not found.`);
    if (record.status === "completed") return record;
    if (record.status === "rejected") throw new Error(`Request ${requestId} was rejected: ${record.reason}`);
    if (!record.authorizationId) throw new Error(`Request ${requestId} has no authorization to capture.`);

    auditLog.append({ type: "confirm_attempt", requestId, authorizationId: record.authorizationId });

    let capture;
    try {
      capture = await locus.captureTransfer(record.authorizationId, { requestId });
    } catch (err) {
      // Void the hold so funds are released
      try { await locus.voidTransfer(record.authorizationId); } catch {}
      auditLog.append({ type: "capture_failed", requestId, error: err.message });
      record.status = "failed";
      record.failureReason = err.message;
      return record;
    }

    auditLog.append({ type: "locus:capture", requestId, authorizationId: record.authorizationId, status: capture.status, transactionId: capture.transactionId });

    record.status = capture.status === "pending_human_approval" ? "pending_human_approval" : "completed";
    record.capturedAt = Date.now();
    record.transactionId = capture.transactionId;
    record.approvalUrl = capture.approvalUrl || null;

    return record;
  }

  /**
   * Revoke a wallet — blocks all future purchases from this address.
   *
   * @param {string} walletAddress
   * @param {string} reason
   */
  async function revokePermissions(walletAddress, reason) {
    auditLog.append({ type: "revoke_wallet", walletAddress, reason });
    return locus.revokeWallet(walletAddress, reason);
  }

  /** Restore a previously revoked wallet. */
  async function restorePermissions(walletAddress, reason) {
    auditLog.append({ type: "restore_wallet", walletAddress, reason });
    return locus.restoreWallet(walletAddress, reason);
  }

  /** Get a single request by ID */
  function getRequest(requestId) {
    return requests.get(requestId) || null;
  }

  /** Health status */
  async function health() {
    return {
      status: "ok",
      pendingRequests: [...requests.values()].filter((r) => r.status === "pending_confirmation").length,
      totalRequests: requests.size,
      thresholds,
    };
  }

  return { previewPurchase, confirmPurchase, revokePermissions, restorePermissions, getRequest, health };
}

module.exports = { createPurchasingAgentService };
