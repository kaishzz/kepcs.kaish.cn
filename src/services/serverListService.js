const { env } = require("../config/env");
const { createAxiosClient } = require("../lib/httpClient");
const { createRemoteResourceCache } = require("../lib/remoteResourceCache");
const { withApiKeyAuth } = require("../utils/apiKeyAuth");

const serverListClient = createAxiosClient();
const cacheTtlMs = 4 * 1000;
const serverListCache = createRemoteResourceCache({
  cacheKey: "kepcs:server-list",
  ttlSeconds: Math.ceil(cacheTtlMs / 1000),
  isValid: (value) => Boolean(value) && typeof value === "object" && Array.isArray(value.servers),
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeServer(row) {
  const host = String(row?.host || "").trim();
  const port = toNumber(row?.port, 0);

  return {
    id: String(row?.id ?? `${host}:${port}`),
    shotid: String(row?.shotid || ""),
    mode: String(row?.mode || "unknown"),
    name: String(row?.name || ""),
    serverName: String(row?.server_name || row?.serverName || ""),
    host,
    port,
    map: String(row?.map || ""),
    currentPlayers: toNumber(row?.current_players ?? row?.currentPlayers, 0),
    maxPlayers: toNumber(row?.max_players ?? row?.maxPlayers, 0),
    status: String(row?.status || "unknown"),
    connectUrl: host && port ? `steam://connect/${host}:${port}` : "",
  };
}

async function fetchServerList(forceRefresh = false) {
  try {
    return await serverListCache.read(forceRefresh, async () => {
      const { data } = await serverListClient.get(
        env.serverListApiUrl,
        withApiKeyAuth({}, env.serverListApiKey),
      );

      return {
        updatedAt: String(data?.updated_at || data?.updatedAt || new Date().toISOString()),
        lastError: data?.last_error ?? data?.lastError ?? null,
        servers: Array.isArray(data?.servers) ? data.servers.map(normalizeServer) : [],
      };
    });
  } catch (error) {
    const cachedPayload = serverListCache.getStaleValue();

    if (cachedPayload) {
      return {
        ...cachedPayload,
        lastError: error.message || "server-list-fetch-failed",
      };
    }

    throw error;
  }
}

module.exports = {
  fetchServerList,
};
