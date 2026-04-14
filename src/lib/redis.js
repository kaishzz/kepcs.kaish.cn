const Redis = require("ioredis");
const { env } = require("../config/env");

let redis = null;
let connectPromise = null;

if (env.redis?.enabled) {
  redis = new Redis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    db: env.redis.db,
    lazyConnect: true,
    connectTimeout: 10000,
    keepAlive: 10000,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy(times) {
      return Math.min(times * 200, 2000);
    },
  });

  redis.on("error", (error) => {
    console.error("Redis error:", error.message);
  });
}

async function ensureRedisConnected() {
  if (!redis) {
    return null;
  }

  if (redis.status === "ready") {
    return redis;
  }

  if (connectPromise) {
    await connectPromise;
    return redis;
  }

  connectPromise = redis.connect()
    .catch((error) => {
      throw error;
    })
    .finally(() => {
      connectPromise = null;
    });

  await connectPromise;
  return redis;
}

async function getCache(key) {
  const client = await ensureRedisConnected();

  if (!client) {
    return null;
  }

  return client.get(key);
}

async function setCache(key, value, ttlSeconds) {
  const client = await ensureRedisConnected();

  if (!client) {
    return;
  }

  await client.set(key, value, "EX", ttlSeconds);
}

module.exports = {
  async disconnectRedis() {
    if (!redis) {
      return;
    }

    connectPromise = null;

    if (redis.status === "end") {
      return;
    }

    try {
      await redis.quit();
    } catch (_error) {
      redis.disconnect();
    }
  },
  ensureRedisConnected,
  getCache,
  redis,
  setCache,
};
