const { env } = require("../config/env");
const { createAxiosClient } = require("../lib/httpClient");
const { createRemoteResourceCache } = require("../lib/remoteResourceCache");
const { findPlayerBySteamId } = require("../lib/gameDatabase");
const { withApiKeyAuth } = require("../utils/apiKeyAuth");

const client = createAxiosClient();
const remoteWhitelistCache = createRemoteResourceCache({
  cacheKey: "kepcs:remote-whitelist",
  ttlSeconds: 60,
  isValid: (value) => Array.isArray(value),
});

function normalizeSteamId(row) {
  return String(
    row?.SteamID ??
      row?.steamid ??
      row?.steamId ??
      row?.steamID ??
      "",
  ).trim();
}

function normalizeNote(row) {
  return String(
    row?.Note ??
      row?.note ??
      row?.QQ ??
      row?.qq ??
      "",
  ).trim();
}

async function fetchRemoteWhitelistRows() {
  return remoteWhitelistCache.read(false, async () => {
    const response = await client.get(
      env.whitelistApiUrl,
      withApiKeyAuth({}, env.whitelistApiKey),
    );

    if (!Array.isArray(response.data)) {
      throw new Error("Whitelist API did not return an array");
    }

    return response.data;
  });
}

async function isSteamIdInRemoteWhitelist(steamId64) {
  const rows = await fetchRemoteWhitelistRows();
  return rows.some((row) => normalizeSteamId(row) === String(steamId64));
}

async function searchRemoteWhitelist(keyword, limit = 8) {
  const q = String(keyword || "").trim();

  if (!q) {
    return [];
  }

  const rows = await fetchRemoteWhitelistRows();

  return rows
    .map((row) => ({
      steamId: normalizeSteamId(row),
      note: normalizeNote(row),
    }))
    .filter((row) => row.steamId && row.steamId.includes(q))
    .slice(0, limit);
}

async function isSteamIdAlreadyWhitelisted(steamId64, databaseName) {
  const player = await findPlayerBySteamId(steamId64, databaseName);
  return Boolean(player);
}

module.exports = {
  isSteamIdAlreadyWhitelisted,
  isSteamIdInRemoteWhitelist,
  searchRemoteWhitelist,
};
