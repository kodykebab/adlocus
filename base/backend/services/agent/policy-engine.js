/**
 * policy-engine.js
 * Risk evaluation for purchase intents.
 *
 * Decision matrix:
 *   amount < approvalThreshold      → "auto_approve"
 *   amount <= confirmationThreshold → "requires_confirmation"
 *   amount > hardLimit              → "declined"
 *   rate limit exceeded             → "rate_limited"
 *   duplicate within window         → "duplicate"
 */

// In-memory rate limit and duplicate detection state
const rateLimitWindows = new Map(); // walletAddress → [timestamps]
const recentIntents = new Map();    // `${walletAddress}:${merchantId}` → last timestamp

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;       // 1 minute
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;   // 5 minutes

/**
 * Evaluate a purchase intent against policy rules.
 *
 * @param {Object} intent
 * @param {string} intent.userAddress
 * @param {string} intent.merchantId
 * @param {number} intent.amount
 * @param {string} intent.currency
 * @param {Object} thresholds
 * @param {number} thresholds.approvalThreshold
 * @param {number} thresholds.confirmationThreshold
 * @param {number} thresholds.hardLimit
 * @returns {{ decision: string, reason: string }}
 */
function evaluatePurchasePolicy(intent, thresholds) {
  const { userAddress, merchantId, amount } = intent;
  const { approvalThreshold, confirmationThreshold, hardLimit } = thresholds;

  // 1. Hard limit — always decline regardless of other signals
  if (amount > hardLimit) {
    return {
      decision: "declined",
      reason: `Amount $${amount} exceeds hard limit of $${hardLimit}. Manual review required.`,
    };
  }

  // 2. Rate limiting — cap at N attempts per window
  const now = Date.now();
  const key = userAddress.toLowerCase();
  const attempts = (rateLimitWindows.get(key) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  attempts.push(now);
  rateLimitWindows.set(key, attempts);

  if (attempts.length > RATE_LIMIT_COUNT) {
    return {
      decision: "rate_limited",
      reason: `More than ${RATE_LIMIT_COUNT} purchase attempts in last ${RATE_LIMIT_WINDOW_MS / 1000}s. Slow down.`,
    };
  }

  // 3. Duplicate detection — same wallet + merchant within window
  const dupKey = `${key}:${merchantId}`;
  const lastIntent = recentIntents.get(dupKey);
  if (lastIntent && now - lastIntent < DUPLICATE_WINDOW_MS) {
    return {
      decision: "duplicate",
      reason: `Duplicate purchase intent for merchant ${merchantId} within ${DUPLICATE_WINDOW_MS / 60000} minutes.`,
    };
  }
  recentIntents.set(dupKey, now);

  // 4. Approval thresholds
  if (amount <= approvalThreshold) {
    return { decision: "auto_approve", reason: `Amount $${amount} is below auto-approve threshold of $${approvalThreshold}.` };
  }

  if (amount <= confirmationThreshold) {
    return { decision: "requires_confirmation", reason: `Amount $${amount} requires user confirmation (threshold: $${confirmationThreshold}).` };
  }

  return {
    decision: "declined",
    reason: `Amount $${amount} exceeds confirmation threshold of $${confirmationThreshold}. Manual review required.`,
  };
}

module.exports = { evaluatePurchasePolicy };
