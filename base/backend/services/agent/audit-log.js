/**
 * audit-log.js
 * Append-only JSONL audit trail stored at audit/purchase-agent.jsonl
 */

const fs = require("fs");
const path = require("path");

function createAuditLogStore(logPath) {
  // Ensure directory exists
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  function append(entry) {
    const line = JSON.stringify({ ...entry, timestamp: Date.now() }) + "\n";
    fs.appendFileSync(logPath, line, "utf8");
  }

  function readAll() {
    if (!fs.existsSync(logPath)) return [];
    return fs
      .readFileSync(logPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  }

  return { append, readAll };
}

module.exports = { createAuditLogStore };
