const fs = require("node:fs");
const crypto = require("node:crypto");

const keyCache = new Map();

function readKey(filePath) {
  if (!keyCache.has(filePath)) {
    keyCache.set(filePath, fs.readFileSync(filePath, "utf8"));
  }

  return keyCache.get(filePath);
}

function canonicalizePayload(payload, signField = "sign") {
  return Object.keys(payload)
    .filter((key) => key !== signField && key !== "sign_type")
    .filter((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== "")
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join("&");
}

function signPayload(payload, privateKeyPath, signField = "sign") {
  const privateKey = readKey(privateKeyPath);
  const canonical = canonicalizePayload(payload, signField);
  const signer = crypto.createSign("RSA-SHA256");

  signer.update(canonical, "utf8");
  signer.end();

  return signer.sign(privateKey, "base64");
}

function verifyPayload(payload, signature, publicKeyPath, signField = "sign") {
  if (!signature) {
    return false;
  }

  const publicKey = readKey(publicKeyPath);
  const canonical = canonicalizePayload(payload, signField);
  const verifier = crypto.createVerify("RSA-SHA256");

  verifier.update(canonical, "utf8");
  verifier.end();

  return verifier.verify(publicKey, signature, "base64");
}

module.exports = {
  canonicalizePayload,
  signPayload,
  verifyPayload,
};
