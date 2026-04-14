const { createAxiosClient } = require("../lib/httpClient");

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const client = createAxiosClient({
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
});

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetry(error) {
  const status = error?.response?.status;
  const code = error?.code;

  if ([502, 503, 504].includes(status)) {
    return true;
  }

  return ["ECONNABORTED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(code);
}

function buildSteamLoginUrl({ realm, returnTo }) {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

async function verifySteamCallback(query) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query || {})) {
    if (Array.isArray(value)) {
      params.set(key, value[0]);
    } else if (value != null) {
      params.set(key, String(value));
    }
  }

  params.set("openid.mode", "check_authentication");

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await client.post(STEAM_OPENID_ENDPOINT, params.toString());
      return /is_valid\s*:\s*true/i.test(String(response.data));
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error) || attempt === 2) {
        break;
      }

      await sleep(400 * (attempt + 1));
    }
  }

  throw lastError;
}

function extractSteamIdFromClaimedId(claimedId) {
  const matched = String(claimedId || "").match(/\/openid\/id\/(\d{17,25})$/);
  return matched ? matched[1] : null;
}

module.exports = {
  buildSteamLoginUrl,
  extractSteamIdFromClaimedId,
  verifySteamCallback,
};
