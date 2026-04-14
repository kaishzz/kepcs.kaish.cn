const { redis } = require("../lib/redis");
const { pruneTimedEntries } = require("../lib/memoryCache");

const buckets = new Map();
const MAX_MEMORY_BUCKETS = 5000;

let lastCleanupAt = 0;
let lastRedisFallbackAt = 0;

function normalizeKey(value) {
  return String(value || "anonymous")
    .trim()
    .replace(/^::ffff:/, "")
    .toLowerCase();
}

function getDefaultKey(req) {
  const user =
    typeof req?.session?.get === "function"
      ? req.session.get("user")
      : req?.session?.user;

  return normalizeKey(
    user?.steamId || req.sessionID || req.ip || req.socket?.remoteAddress || req.raw?.socket?.remoteAddress,
  );
}

function cleanupBuckets(now) {
  if (now - lastCleanupAt < 60 * 1000) {
    return;
  }

  lastCleanupAt = now;
  pruneTimedEntries(buckets, {
    now,
    maxEntries: MAX_MEMORY_BUCKETS,
    getExpiresAt: (entry) => entry?.resetAt,
  });
}

async function consumeRedisBucket(key, windowMs) {
  const now = Date.now();
  const script = `
    local current = redis.call("INCR", KEYS[1])
    if current == 1 then
      redis.call("PEXPIRE", KEYS[1], ARGV[1])
    end
    local ttl = redis.call("PTTL", KEYS[1])
    return {current, ttl}
  `;
  const [count, ttl] = await redis.eval(script, 1, key, String(windowMs));
  return {
    count: Number(count),
    ttl: Number(ttl),
    resetAt: now + Number(ttl),
  };
}

async function consumeRedisBucketSafely(key, windowMs) {
  try {
    const bucket = await consumeRedisBucket(key, windowMs);

    if (!Number.isFinite(bucket.ttl) || bucket.ttl <= 0) {
      throw new Error("Invalid Redis TTL");
    }

    return bucket;
  } catch (error) {
    const now = Date.now();

    if (now - lastRedisFallbackAt > 60 * 1000) {
      lastRedisFallbackAt = now;
      console.error("Rate limit Redis unavailable, falling back to memory bucket:", error.message);
    }

    return consumeMemoryBucket(key, windowMs);
  }
}

function consumeMemoryBucket(key, windowMs) {
  const now = Date.now();
  cleanupBuckets(now);

  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const bucket = {
      count: 1,
      resetAt: now + windowMs,
    };
    buckets.set(key, bucket);
    if (buckets.size > MAX_MEMORY_BUCKETS) {
      pruneTimedEntries(buckets, {
        now,
        maxEntries: Math.floor(MAX_MEMORY_BUCKETS * 0.8),
        getExpiresAt: (entry) => entry?.resetAt,
      });
    }
    return bucket;
  }

  current.count += 1;
  buckets.set(key, current);
  return current;
}

async function consumeRateLimit({ keyPrefix = "default", key, windowMs, max }) {
  const normalizedKey = `${keyPrefix}:${normalizeKey(key)}`;
  const bucket = redis
    ? await consumeRedisBucketSafely(normalizedKey, windowMs)
    : consumeMemoryBucket(normalizedKey, windowMs);

  const remaining = Math.max(max - bucket.count, 0);
  const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - Date.now()) / 1000), 1);

  return {
    count: bucket.count,
    remaining,
    retryAfterSeconds,
    limited: bucket.count > max,
  };
}

function createFastifyRateLimit({
  windowMs,
  max,
  keyGenerator = getDefaultKey,
  keyPrefix = "default",
  message = "请求过于频繁，请稍后再试。",
  onLimit,
}) {
  return async function fastifyRateLimit(request, reply) {
    const result = await consumeRateLimit({
      windowMs,
      max,
      keyPrefix,
      key: keyGenerator(request),
    });

    reply.header("X-RateLimit-Limit", String(max));
    reply.header("X-RateLimit-Remaining", String(result.remaining));
    reply.header("X-RateLimit-Reset", String(result.retryAfterSeconds));
    reply.header("RateLimit-Limit", String(max));
    reply.header("RateLimit-Remaining", String(result.remaining));
    reply.header("RateLimit-Reset", String(result.retryAfterSeconds));
    reply.header("RateLimit-Policy", `${max};w=${Math.ceil(windowMs / 1000)}`);

    if (result.limited) {
      reply.header("Retry-After", String(result.retryAfterSeconds));
      reply.header("Cache-Control", "no-store");

      if (typeof onLimit === "function") {
        return onLimit(request, reply, result.retryAfterSeconds);
      }

      return reply.code(429).send({
        success: false,
        message,
      });
    }
  };
}

module.exports = {
  consumeRateLimit,
  createFastifyRateLimit,
};
