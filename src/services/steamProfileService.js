const { createAxiosClient } = require("../lib/httpClient");
const { env } = require("../config/env");
const { getFreshTimedEntry, setTimedEntry } = require("../lib/memoryCache");

const client = createAxiosClient({
  timeout: 3000,
  headers: {
    Accept: "application/xml, text/xml;q=0.9, */*;q=0.8",
    "User-Agent": "KepCs/1.0",
  },
  responseType: "text",
});
const webApiClient = createAxiosClient({
  timeout: 3000,
  headers: {
    Accept: "application/json",
    "User-Agent": "KepCs/1.0",
  },
});

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PROFILE_CACHE_ENTRIES = 512;
const profileCache = new Map();
const inflightRequests = new Map();

async function fetchSteamProfileFromWebApi(steamId) {
  if (!env.steamWebApiKey) {
    return null;
  }

  const { data } = await webApiClient.get("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/", {
    params: {
      key: env.steamWebApiKey,
      steamids: steamId,
    },
  });

  const player = data?.response?.players?.[0];

  if (!player) {
    return null;
  }

  return {
    displayName: String(player.personaname || steamId),
    avatarUrl: String(player.avatarfull || player.avatarmedium || player.avatar || "").trim() || null,
    profileUrl: String(player.profileurl || `https://steamcommunity.com/profiles/${steamId}`),
  };
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[/i, "")
    .replace(/\]\]>$/i, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readXmlTag(xml, tagName) {
  const matched = String(xml || "").match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return matched ? decodeXml(matched[1].trim()) : "";
}

function readMetaContent(html, propertyName) {
  const matched = String(html || "").match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${propertyName}["'][^>]+content=["']([^"']+)["']`, "i"),
  );
  return matched ? decodeXml(matched[1].trim()) : "";
}

async function fetchSteamProfile(steamId) {
  const cached = getFreshTimedEntry(profileCache, steamId);
  if (cached) {
    return cached.value;
  }

  if (inflightRequests.has(steamId)) {
    return inflightRequests.get(steamId);
  }

  const request = (async () => {
    const profileUrl = `https://steamcommunity.com/profiles/${steamId}`;
    let displayName = String(steamId);
    let avatarUrl = null;

    try {
      const officialProfile = await fetchSteamProfileFromWebApi(steamId);
      if (officialProfile) {
        return officialProfile;
      }
    } catch (_error) {
      // ignore and fall through to community scraping fallback
    }

    try {
      const { data } = await client.get(`${profileUrl}/?xml=1`);
      const xml = String(data || "");

      displayName = readXmlTag(xml, "steamID") || displayName;
      avatarUrl =
        readXmlTag(xml, "avatarFull") ||
        readXmlTag(xml, "avatarMedium") ||
        readXmlTag(xml, "avatarIcon") ||
        null;
    } catch (_error) {
      // ignore and try HTML fallback below
    }

    if (!avatarUrl || !displayName || displayName === String(steamId)) {
      const { data } = await client.get(profileUrl);
      const html = String(data || "");

      displayName =
        readMetaContent(html, "og:title") ||
        readMetaContent(html, "twitter:title") ||
        displayName;
      avatarUrl =
        avatarUrl ||
        readMetaContent(html, "og:image") ||
        readMetaContent(html, "twitter:image") ||
        null;
    }

    const profile = {
      displayName: displayName || String(steamId),
      avatarUrl,
      profileUrl,
    };

    if (profile.avatarUrl || profile.displayName !== String(steamId)) {
      setTimedEntry(profileCache, steamId, profile, CACHE_TTL_MS, {
        maxEntries: MAX_PROFILE_CACHE_ENTRIES,
      });
    }

    return profile;
  })().finally(() => {
    inflightRequests.delete(steamId);
  });

  inflightRequests.set(steamId, request);
  return request;
}

module.exports = {
  fetchSteamProfile,
};
