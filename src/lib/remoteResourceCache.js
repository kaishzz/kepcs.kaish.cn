const { getCache, setCache } = require("./redis");

function createRemoteResourceCache({
  cacheKey,
  ttlSeconds,
  isValid,
  readCache = getCache,
  writeCache = setCache,
}) {
  const state = {
    expiresAt: 0,
    value: null,
    pending: null,
  };

  function hasFreshMemory(now = Date.now()) {
    return state.value != null && state.expiresAt > now;
  }

  function remember(value, now = Date.now()) {
    state.value = value;
    state.expiresAt = now + ttlSeconds * 1000;
    return value;
  }

  async function read(forceRefresh, loader) {
    const now = Date.now();

    if (!forceRefresh && hasFreshMemory(now)) {
      return state.value;
    }

    if (!forceRefresh && cacheKey) {
      const cached = await readCache(cacheKey);

      if (cached) {
        try {
          const parsed = JSON.parse(cached);

          if (isValid(parsed)) {
            return remember(parsed, now);
          }
        } catch (_error) {
          // Ignore invalid cached payload and refresh from source below.
        }
      }
    }

    if (state.pending) {
      return state.pending;
    }

    state.pending = (async () => {
      const value = await loader();

      if (!isValid(value)) {
        throw new Error("Remote resource returned invalid payload");
      }

      remember(value, Date.now());

      if (cacheKey) {
        await writeCache(cacheKey, JSON.stringify(value), ttlSeconds);
      }

      return value;
    })();

    try {
      return await state.pending;
    } finally {
      state.pending = null;
    }
  }

  function getStaleValue() {
    return state.value;
  }

  return {
    getStaleValue,
    hasFreshMemory,
    read,
  };
}

module.exports = {
  createRemoteResourceCache,
};
