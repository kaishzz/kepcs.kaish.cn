const { cdkPrisma } = require("../lib/prisma");
const { fetchServerList } = require("./serverListService");

const SAMPLE_INTERVAL_MINUTES = 5;
const SAMPLE_INTERVAL_MS = SAMPLE_INTERVAL_MINUTES * 60 * 1000;
const SNAPSHOT_RETENTION_HOURS = 7 * 24;

let collectorTimer = null;
let collectPromise = null;

function floorToBucket(date = new Date()) {
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const bucketTime = Math.floor(timestamp / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS;
  return new Date(bucketTime);
}

function summarizeServerList(payload) {
  const servers = Array.isArray(payload?.servers) ? payload.servers : [];
  const xlServers = servers.filter((server) => String(server?.mode || "").trim() === "ze_xl");
  const ptServers = servers.filter((server) => String(server?.mode || "").trim() === "ze_pt");

  return {
    xlTotal: xlServers.length,
    ptTotal: ptServers.length,
    xlOccupied: xlServers.filter((server) => Number(server?.currentPlayers || 0) > 0).length,
    ptOccupied: ptServers.filter((server) => Number(server?.currentPlayers || 0) > 0).length,
    onlinePlayers: servers.reduce((sum, server) => sum + Number(server?.currentPlayers || 0), 0),
  };
}

async function pruneExpiredSnapshots() {
  const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_HOURS * 60 * 60 * 1000);

  await cdkPrisma.serverTrendSnapshot.deleteMany({
    where: {
      bucketAt: {
        lt: cutoff,
      },
    },
  });
}

async function collectServerTrendSnapshot({ forceRefresh = true } = {}) {
  if (collectPromise) {
    return collectPromise;
  }

  collectPromise = (async () => {
    const payload = await fetchServerList(forceRefresh);
    const snapshot = summarizeServerList(payload);
    const bucketAt = floorToBucket();

    const saved = await cdkPrisma.serverTrendSnapshot.upsert({
      where: { bucketAt },
      update: snapshot,
      create: {
        bucketAt,
        ...snapshot,
      },
    });

    await pruneExpiredSnapshots();
    return saved;
  })();

  try {
    return await collectPromise;
  } finally {
    collectPromise = null;
  }
}

async function ensureRecentServerTrendSnapshot() {
  const latest = await cdkPrisma.serverTrendSnapshot.findFirst({
    orderBy: {
      bucketAt: "desc",
    },
  });

  if (!latest) {
    try {
      await collectServerTrendSnapshot({ forceRefresh: true });
    } catch (_error) {
      return null;
    }

    return null;
  }

  if (Date.now() - latest.bucketAt.getTime() > SAMPLE_INTERVAL_MS * 2) {
    try {
      await collectServerTrendSnapshot({ forceRefresh: true });
    } catch (_error) {
      return latest;
    }
  }

  return latest;
}

async function listServerTrendSnapshots({ hours = 48 } = {}) {
  const safeHours = Math.max(1, Math.min(72, Number(hours) || 48));
  await ensureRecentServerTrendSnapshot();

  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);
  const rows = await cdkPrisma.serverTrendSnapshot.findMany({
    where: {
      bucketAt: {
        gte: since,
      },
    },
    orderBy: {
      bucketAt: "asc",
    },
  });

  return {
    hours: safeHours,
    sampleMinutes: SAMPLE_INTERVAL_MINUTES,
    points: rows.map((row) => ({
      bucketAt: row.bucketAt.toISOString(),
      xlTotal: row.xlTotal,
      ptTotal: row.ptTotal,
      xlOccupied: row.xlOccupied,
      ptOccupied: row.ptOccupied,
      onlinePlayers: row.onlinePlayers,
    })),
  };
}

function startServerTrendCollector() {
  if (collectorTimer) {
    return () => stopServerTrendCollector();
  }

  void collectServerTrendSnapshot({ forceRefresh: true }).catch((error) => {
    console.warn("Initial server trend collection failed:", error?.message || error);
  });

  collectorTimer = setInterval(() => {
    void collectServerTrendSnapshot({ forceRefresh: true }).catch((error) => {
      console.warn("Server trend collection failed:", error?.message || error);
    });
  }, SAMPLE_INTERVAL_MS);

  if (typeof collectorTimer.unref === "function") {
    collectorTimer.unref();
  }

  return () => stopServerTrendCollector();
}

function stopServerTrendCollector() {
  if (!collectorTimer) {
    return;
  }

  clearInterval(collectorTimer);
  collectorTimer = null;
}

module.exports = {
  collectServerTrendSnapshot,
  listServerTrendSnapshots,
  startServerTrendCollector,
  stopServerTrendCollector,
};
