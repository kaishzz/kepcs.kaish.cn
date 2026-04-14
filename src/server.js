const { createFastifyApp } = require("./fastifyApp");
const { env } = require("./config/env");
const { ensureDatabases } = require("./lib/databaseBootstrap");
const { closeAllPools } = require("./lib/gameDatabase");
const { disconnectPrisma } = require("./lib/prisma");
const { disconnectRedis } = require("./lib/redis");
const { startDefaultMapMonitor } = require("./services/defaultMapMonitorService");
const { startIdleRestartMonitor } = require("./services/idleRestartMonitorService");
const { startServerTrendCollector } = require("./services/serverTrendService");
const { startNodeScheduleRunner } = require("./services/nodeScheduleService");

let appInstance = null;
let stopCollector = null;
let stopNodeScheduleRunner = null;
let stopDefaultMapMonitorRunner = null;
let stopIdleRestartMonitorRunner = null;
let shuttingDown = false;

function isLoopbackHost(host) {
  const value = String(host || "").trim().toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1";
}

function isWeakSessionSecret(secret) {
  const normalized = String(secret || "");
  return normalized.length < 32 || /change-this|please-change|default/i.test(normalized);
}

function assertOperationalReadiness() {
  if (env.nodeEnv !== "production") {
    return;
  }

  if (isWeakSessionSecret(env.sessionSecret)) {
    throw new Error("SESSION_SECRET looks weak. Please replace it with a long random secret before production startup.");
  }

  if (!Array.isArray(env.rootSteamIds) || !env.rootSteamIds.length) {
    throw new Error("ROOT_STEAM_IDS is empty. At least one root SteamID is required before production startup.");
  }
}

function warnOperationalConfig() {
  const secret = String(env.sessionSecret || "");

  if (
    env.nodeEnv === "production" &&
    isWeakSessionSecret(secret)
  ) {
    console.warn(
      "Security warning: SESSION_SECRET looks weak. Please replace it with a long random secret.",
    );
  }

  if (env.nodeEnv === "production" && env.redis?.enabled && !isLoopbackHost(env.redis.host)) {
    console.warn(
      `Operational warning: REDIS_HOST is ${env.redis.host}. Putting Redis close to the app server is recommended for lower latency and more stable rate limiting.`,
    );
  }

  if (env.nodeEnv === "production" && env.outboundProxy?.enabled) {
    console.warn(
      `Operational warning: outbound proxy is enabled (${env.outboundProxy.host}:${env.outboundProxy.port}). Disable it if the production server can access Steam and remote APIs directly.`,
    );
  }

  if (env.nodeEnv === "production" && !String(env.steamWebApiKey || "").trim()) {
    console.warn(
      "Operational warning: STEAM_WEB_API_KEY is empty. Steam avatar and profile display may fall back to slower community scraping.",
    );
  }
}

async function start() {
  try {
    await ensureDatabases();
    assertOperationalReadiness();
    warnOperationalConfig();
    const app = await createFastifyApp();
    appInstance = app;
    stopCollector = startServerTrendCollector();
    stopNodeScheduleRunner = startNodeScheduleRunner();
    stopDefaultMapMonitorRunner = startDefaultMapMonitor();
    stopIdleRestartMonitorRunner = startIdleRestartMonitor();

    await app.listen({
      port: env.port,
      host: "0.0.0.0",
    });

    console.log(
      `KEPCS payment site listening on ${env.appBaseUrl} (port ${env.port}) in ${env.nodeEnv} mode`,
    );
  } catch (error) {
    console.error("Failed to bootstrap databases:", error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`${signal} received, shutting down KEPCS gracefully...`);

  try {
    if (typeof stopCollector === "function") {
      stopCollector();
    }

    if (typeof stopNodeScheduleRunner === "function") {
      stopNodeScheduleRunner();
    }

    if (typeof stopDefaultMapMonitorRunner === "function") {
      stopDefaultMapMonitorRunner();
    }

    if (typeof stopIdleRestartMonitorRunner === "function") {
      stopIdleRestartMonitorRunner();
    }

    await Promise.allSettled([
      appInstance ? appInstance.close() : Promise.resolve(),
      disconnectRedis(),
      disconnectPrisma(),
      closeAllPools(),
    ]);
  } finally {
    process.exit(0);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

start();
