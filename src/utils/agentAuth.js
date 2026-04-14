const crypto = require("node:crypto");

function normalizeApiKey(value) {
  return String(value || "").trim();
}

function extractAgentApiKey(headers = {}) {
  const directHeader = normalizeApiKey(headers["x-agent-key"] || headers["X-Agent-Key"]);

  if (directHeader) {
    return directHeader;
  }

  const authorization = normalizeApiKey(headers.authorization || headers.Authorization);

  if (!authorization) {
    return "";
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? normalizeApiKey(match[1]) : "";
}

function hashAgentApiKey(apiKey) {
  return crypto.createHash("sha256").update(normalizeApiKey(apiKey)).digest("hex");
}

function generateAgentApiKey() {
  return `kepcs_agent_${crypto.randomBytes(24).toString("hex")}`;
}

module.exports = {
  extractAgentApiKey,
  generateAgentApiKey,
  hashAgentApiKey,
};
