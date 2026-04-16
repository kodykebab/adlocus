/**
 * mock-locus.js
 * In-memory simulation of the Locus payment API.
 * Drop-in replacement for locus-client.js during development.
 *
 * State is lost on server restart — audit log is the source of truth.
 */

const crypto = require("crypto");

function createMockLocusClient({ defaultBalances = {}, logger } = {}) {
  // walletAddress → { available, reserved, revoked, currency }
  const wallets = new Map();
  // authorizationId → authorization record
  const authorizations = new Map();
  // merchantId → registered (boolean)
  const merchants = new Map();

  function _getOrCreateWallet(address, currency = "USDC") {
    const key = `${address.toLowerCase()}:${currency}`;
    if (!wallets.has(key)) {
      wallets.set(key, {
        available: defaultBalances[currency] ?? 1000,
        reserved: 0,
        revoked: false,
        currency,
      });
    }
    return wallets.get(key);
  }

  async function getBalance(walletAddress, currency = "USDC") {
    const w = _getOrCreateWallet(walletAddress, currency);
    return {
      currency,
      available: w.available,
      reserved: w.reserved,
      total: w.available + w.reserved,
      revoked: w.revoked,
    };
  }

  async function authorizeTransfer(walletAddress, amount, currency = "USDC", metadata = {}) {
    const w = _getOrCreateWallet(walletAddress, currency);

    if (w.revoked) throw new Error(`Wallet ${walletAddress} is revoked.`);
    if (w.available < amount) throw new Error(`Insufficient balance: ${w.available} ${currency} available, need ${amount}.`);

    w.available -= amount;
    w.reserved += amount;

    const authId = `auth-${crypto.randomBytes(6).toString("hex")}`;
    const auth = {
      authorizationId: authId,
      status: "authorized",
      walletAddress,
      amount,
      currency,
      metadata,
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    authorizations.set(authId, auth);

    if (logger) logger("authorize", { authorizationId: authId, amount, currency, status: "authorized" });

    return { ...auth, errors: [] };
  }

  async function captureTransfer(authorizationId, metadata = {}) {
    const auth = authorizations.get(authorizationId);
    if (!auth) throw new Error(`Authorization ${authorizationId} not found.`);
    if (auth.status !== "authorized") throw new Error(`Authorization ${authorizationId} is in status "${auth.status}", not capturable.`);
    if (Date.now() > auth.expiresAt) throw new Error(`Authorization ${authorizationId} has expired.`);

    const w = _getOrCreateWallet(auth.walletAddress, auth.currency);
    w.reserved -= auth.amount; // funds settle (leave wallet)

    auth.status = "captured";
    auth.capturedAt = Date.now();

    if (logger) logger("capture", { authorizationId, amount: auth.amount, status: "captured" });

    return {
      status: "captured",
      authorizationId,
      walletAddress: auth.walletAddress,
      amount: auth.amount,
      currency: auth.currency,
      capturedAt: auth.capturedAt,
      errors: [],
    };
  }

  async function voidTransfer(authorizationId) {
    const auth = authorizations.get(authorizationId);
    if (!auth) throw new Error(`Authorization ${authorizationId} not found.`);
    if (auth.status !== "authorized") throw new Error(`Cannot void authorization in status "${auth.status}".`);

    const w = _getOrCreateWallet(auth.walletAddress, auth.currency);
    w.reserved -= auth.amount;
    w.available += auth.amount; // funds returned

    auth.status = "voided";
    auth.voidedAt = Date.now();

    if (logger) logger("void", { authorizationId, amount: auth.amount, status: "voided" });

    return {
      status: "voided",
      authorizationId,
      amount: auth.amount,
      currency: auth.currency,
      voidedAt: auth.voidedAt,
    };
  }

  async function revokeWallet(walletAddress, reason) {
    const key = `${walletAddress.toLowerCase()}:USDC`;
    const w = wallets.get(key) || _getOrCreateWallet(walletAddress, "USDC");
    w.revoked = true;
    if (logger) logger("revoke_wallet", { walletAddress, reason });
    return { status: "revoked", walletAddress };
  }

  async function restoreWallet(walletAddress, reason) {
    const key = `${walletAddress.toLowerCase()}:USDC`;
    const w = wallets.get(key);
    if (!w) return { status: "not_found", walletAddress };
    w.revoked = false;
    if (logger) logger("restore_wallet", { walletAddress, reason });
    return { status: "restored", walletAddress };
  }

  return { getBalance, authorizeTransfer, captureTransfer, voidTransfer, revokeWallet, restoreWallet };
}

module.exports = { createMockLocusClient };
