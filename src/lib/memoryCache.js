function pruneTimedEntries(cache, {
  now = Date.now(),
  maxEntries = Infinity,
  getExpiresAt = (entry) => entry?.expiresAt,
} = {}) {
  for (const [key, entry] of cache.entries()) {
    const expiresAt = Number(getExpiresAt(entry) || 0);

    if (expiresAt > 0 && expiresAt <= now) {
      cache.delete(key);
    }
  }

  if (!Number.isFinite(maxEntries) || cache.size <= maxEntries) {
    return;
  }

  const entries = Array.from(cache.entries())
    .map(([key, entry]) => ({
      key,
      expiresAt: Number(getExpiresAt(entry) || Number.MAX_SAFE_INTEGER),
    }))
    .sort((left, right) => left.expiresAt - right.expiresAt);

  for (const item of entries) {
    if (cache.size <= maxEntries) {
      break;
    }

    cache.delete(item.key);
  }
}

function getFreshTimedEntry(cache, key, now = Date.now()) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (Number(entry.expiresAt || 0) <= now) {
    cache.delete(key);
    return null;
  }

  return entry;
}

function setTimedEntry(cache, key, value, ttlMs, {
  now = Date.now(),
  maxEntries = Infinity,
} = {}) {
  const entry = {
    value,
    expiresAt: now + ttlMs,
  };

  cache.set(key, entry);
  pruneTimedEntries(cache, { now, maxEntries });
  return entry;
}

module.exports = {
  getFreshTimedEntry,
  pruneTimedEntries,
  setTimedEntry,
};
