const { fetchServerList } = require("./serverListService");
const { listKepcsServers } = require("./serverCatalogService");
const { writeAuditLog } = require("./auditLogService");
const { getServerCatalogPool } = require("../lib/serverCatalogDatabase");
const { executeSourceRconCommand } = require("../utils/sourceRcon");

const DEFAULT_MONITOR_CONFIG = Object.freeze({
  enabled: false,
  checkIntervalSeconds: 10,
});

const monitorState = {
  timer: null,
  running: false,
  started: false,
  idleSinceByServer: new Map(),
  runtime: {
    lastCheckedAt: null,
    lastSwitchAt: null,
    lastError: null,
    lastSummary: {
      inspectedCount: 0,
      eligibleCount: 0,
      switchedCount: 0,
      trackedIdleCount: 0,
    },
    recentSwitches: [],
  },
};

function normalizeBoolean(value) {
  return Boolean(value);
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeMonitorConfigRow(row) {
  return {
    enabled: normalizeBoolean(row?.enabled),
    checkIntervalSeconds: normalizePositiveInt(
      row?.check_interval_seconds ?? row?.checkIntervalSeconds,
      DEFAULT_MONITOR_CONFIG.checkIntervalSeconds,
    ),
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
  };
}

function getMonitorServerKey(row) {
  return `${String(row?.host || "").trim()}:${Number(row?.port) || 0}`;
}

function resetIdleTimer(serverKey) {
  monitorState.idleSinceByServer.delete(serverKey);
}

function pruneIdleTimers(rows) {
  const activeKeys = new Set(rows.map(getMonitorServerKey));

  for (const serverKey of Array.from(monitorState.idleSinceByServer.keys())) {
    if (!activeKeys.has(serverKey)) {
      monitorState.idleSinceByServer.delete(serverKey);
    }
  }
}

function recentSwitchPayloadEntry(entry) {
  return {
    serverId: entry.serverId,
    name: entry.name,
    endpoint: entry.endpoint,
    previousMap: entry.previousMap,
    targetMap: entry.targetMap,
    workshopId: entry.workshopId,
    switchedAt: entry.switchedAt,
  };
}

async function ensureDefaultMapMonitorConfigRow() {
  const pool = getServerCatalogPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS default_map_monitor_config (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      check_interval_seconds INT NOT NULL DEFAULT 10,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(
    `
      INSERT INTO default_map_monitor_config (id, enabled, check_interval_seconds)
      VALUES (1, ?, ?)
      ON DUPLICATE KEY UPDATE id = id
    `,
    [
      DEFAULT_MONITOR_CONFIG.enabled ? 1 : 0,
      DEFAULT_MONITOR_CONFIG.checkIntervalSeconds,
    ],
  );
}

async function getDefaultMapMonitorConfig() {
  await ensureDefaultMapMonitorConfigRow();
  const pool = getServerCatalogPool();
  const [rows] = await pool.query(
    `
      SELECT id, enabled, check_interval_seconds, created_at, updated_at
      FROM default_map_monitor_config
      WHERE id = 1
      LIMIT 1
    `,
  );

  return normalizeMonitorConfigRow(rows[0] || {});
}

async function updateDefaultMapMonitorConfig(payload) {
  await ensureDefaultMapMonitorConfigRow();
  const pool = getServerCatalogPool();
  const nextConfig = {
    enabled: Object.prototype.hasOwnProperty.call(payload, "enabled")
      ? Boolean(payload.enabled)
      : DEFAULT_MONITOR_CONFIG.enabled,
    checkIntervalSeconds: normalizePositiveInt(
      payload.checkIntervalSeconds,
      DEFAULT_MONITOR_CONFIG.checkIntervalSeconds,
    ),
  };

  await pool.execute(
    `
      UPDATE default_map_monitor_config
      SET enabled = ?, check_interval_seconds = ?
      WHERE id = 1
    `,
    [
      nextConfig.enabled ? 1 : 0,
      nextConfig.checkIntervalSeconds,
    ],
  );

  scheduleDefaultMapMonitorRefresh();
  return await getDefaultMapMonitorConfig();
}

function serializeMonitorRuntime() {
  return {
    lastCheckedAt: monitorState.runtime.lastCheckedAt,
    lastSwitchAt: monitorState.runtime.lastSwitchAt,
    lastError: monitorState.runtime.lastError,
    lastSummary: {
      ...monitorState.runtime.lastSummary,
      trackedIdleCount: monitorState.idleSinceByServer.size,
    },
    recentSwitches: monitorState.runtime.recentSwitches.map((item) => ({ ...item })),
  };
}

async function getDefaultMapMonitorStatus() {
  const config = await getDefaultMapMonitorConfig();

  return {
    config,
    runtime: serializeMonitorRuntime(),
  };
}

function findLiveServerStatus(serverListPayload, serverRow) {
  const targetHost = String(serverRow?.host || "").trim();
  const targetPort = Number(serverRow?.port || 0);

  return (serverListPayload?.servers || []).find(
    (item) =>
      String(item?.host || "").trim() === targetHost
      && Number(item?.port || 0) === targetPort,
  ) || null;
}

async function switchServerToDefaultMap(serverRow, currentMap, auditContext) {
  const targetMap = String(serverRow.defaultMap || "").trim();
  const workshopId = String(serverRow.defaultMapId || "").trim();
  const rconPassword = String(serverRow.rconPassword || "").trim();

  if (!targetMap || !workshopId || !rconPassword) {
    throw new Error("缺少默认地图、WorkshopID 或 RCON 密码");
  }

  await executeSourceRconCommand({
    host: serverRow.host,
    port: serverRow.port,
    password: rconPassword,
    command: `host_workshop_map ${workshopId}`,
  });

  const switchedAt = new Date().toISOString();

  monitorState.runtime.lastSwitchAt = switchedAt;
  monitorState.runtime.recentSwitches = [
    recentSwitchPayloadEntry({
      serverId: serverRow.id,
      name: serverRow.name,
      endpoint: `${serverRow.host}:${serverRow.port}`,
      previousMap: currentMap,
      targetMap,
      workshopId,
      switchedAt,
    }),
    ...monitorState.runtime.recentSwitches,
  ].slice(0, 8);

  await writeAuditLog({
    actorSteamId: auditContext?.actorSteamId || "system",
    actorRole: auditContext?.actorRole || "system",
    action: "default_map_monitor.switch",
    targetType: "kepcs-server",
    targetId: String(serverRow.id),
    detail: {
      host: serverRow.host,
      port: serverRow.port,
      previousMap: currentMap,
      targetMap,
      workshopId,
    },
  });
}

async function runDefaultMapMonitorSweep(options = {}) {
  if (monitorState.running) {
    throw new Error("空服巡检正在执行中");
  }

  monitorState.running = true;

  try {
    const config = await getDefaultMapMonitorConfig();

    if (!config.enabled && !options.ignoreEnabled) {
      monitorState.runtime.lastCheckedAt = new Date().toISOString();
      monitorState.runtime.lastError = null;
      monitorState.runtime.lastSummary = {
        inspectedCount: 0,
        eligibleCount: 0,
        switchedCount: 0,
        trackedIdleCount: monitorState.idleSinceByServer.size,
      };

      return {
        config,
        runtime: serializeMonitorRuntime(),
      };
    }

    const serverRows = await listKepcsServers({
      includeSecrets: true,
      activeOnly: true,
    });
    const monitoredRows = serverRows.filter((row) => row.defaultMapMonitorEnabled);
    pruneIdleTimers(monitoredRows);

    const payload = await fetchServerList(true);
    const now = Date.now();
    let switchedCount = 0;
    let eligibleCount = 0;

    if (payload?.lastError) {
      monitorState.runtime.lastCheckedAt = new Date(now).toISOString();
      monitorState.runtime.lastError = String(payload.lastError);
      monitorState.runtime.lastSummary = {
        inspectedCount: monitoredRows.length,
        eligibleCount: 0,
        switchedCount: 0,
        trackedIdleCount: monitorState.idleSinceByServer.size,
      };

      for (const row of monitoredRows) {
        resetIdleTimer(getMonitorServerKey(row));
      }

      return {
        config,
        runtime: serializeMonitorRuntime(),
      };
    }

    for (const row of monitoredRows) {
      const serverKey = getMonitorServerKey(row);
      const targetMap = String(row.defaultMap || "").trim();
      const workshopId = String(row.defaultMapId || "").trim();
      const rconPassword = String(row.rconPassword || "").trim();
      const liveServer = findLiveServerStatus(payload, row);

      if (!liveServer) {
        resetIdleTimer(serverKey);
        continue;
      }

      if (targetMap && workshopId && rconPassword) {
        eligibleCount += 1;
      }

      const currentPlayers = Number(liveServer.currentPlayers || 0);
      const currentMap = String(liveServer.map || "").trim();

      if (currentPlayers > 0) {
        resetIdleTimer(serverKey);
        continue;
      }

      if (!targetMap || !workshopId || !rconPassword) {
        resetIdleTimer(serverKey);
        continue;
      }

      const idleSince = monitorState.idleSinceByServer.get(serverKey) || now;
      monitorState.idleSinceByServer.set(serverKey, idleSince);
      const idleSeconds = Math.floor((now - idleSince) / 1000);

      if (!options.ignoreIdleThreshold && idleSeconds < row.defaultMapIdleThresholdSeconds) {
        continue;
      }

      if (currentMap === targetMap) {
        resetIdleTimer(serverKey);
        continue;
      }

      try {
        await switchServerToDefaultMap(row, currentMap, options.auditContext);
        switchedCount += 1;
      } catch (error) {
        console.warn(
          `[default-map-monitor] failed to switch ${serverKey} from ${currentMap} to ${targetMap}: ${error.message}`,
        );
      } finally {
        resetIdleTimer(serverKey);
      }
    }

    monitorState.runtime.lastCheckedAt = new Date(now).toISOString();
    monitorState.runtime.lastError = null;
    monitorState.runtime.lastSummary = {
      inspectedCount: monitoredRows.length,
      eligibleCount,
      switchedCount,
      trackedIdleCount: monitorState.idleSinceByServer.size,
    };

    return {
      config,
      runtime: serializeMonitorRuntime(),
    };
  } catch (error) {
    monitorState.runtime.lastCheckedAt = new Date().toISOString();
    monitorState.runtime.lastError = error.message;
    throw error;
  } finally {
    monitorState.running = false;
  }
}

function clearMonitorTimer() {
  if (monitorState.timer) {
    clearTimeout(monitorState.timer);
    monitorState.timer = null;
  }
}

async function executeScheduledSweep() {
  try {
    await runDefaultMapMonitorSweep();
  } catch (error) {
    console.error("[default-map-monitor] scheduled sweep failed:", error);
  } finally {
    if (!monitorState.started) {
      return;
    }

    let nextDelayMs = DEFAULT_MONITOR_CONFIG.checkIntervalSeconds * 1000;

    try {
      const config = await getDefaultMapMonitorConfig();
      nextDelayMs = Math.max(1000, config.checkIntervalSeconds * 1000);
    } catch (error) {
      console.error("[default-map-monitor] failed to load next config:", error);
    }

    monitorState.timer = setTimeout(() => {
      monitorState.timer = null;
      void executeScheduledSweep();
    }, nextDelayMs);

    if (typeof monitorState.timer.unref === "function") {
      monitorState.timer.unref();
    }
  }
}

function startDefaultMapMonitor() {
  if (monitorState.started) {
    return () => stopDefaultMapMonitor();
  }

  monitorState.started = true;
  clearMonitorTimer();
  monitorState.timer = setTimeout(() => {
    monitorState.timer = null;
    void executeScheduledSweep();
  }, 1000);

  if (typeof monitorState.timer.unref === "function") {
    monitorState.timer.unref();
  }

  return () => stopDefaultMapMonitor();
}

function scheduleDefaultMapMonitorRefresh() {
  if (!monitorState.started) {
    return;
  }

  clearMonitorTimer();
  monitorState.timer = setTimeout(() => {
    monitorState.timer = null;
    void executeScheduledSweep();
  }, 250);

  if (typeof monitorState.timer.unref === "function") {
    monitorState.timer.unref();
  }
}

function stopDefaultMapMonitor() {
  monitorState.started = false;
  clearMonitorTimer();
  monitorState.running = false;
  monitorState.idleSinceByServer.clear();
}

module.exports = {
  DEFAULT_MONITOR_CONFIG,
  getDefaultMapMonitorConfig,
  getDefaultMapMonitorStatus,
  normalizeMonitorConfigRow,
  runDefaultMapMonitorSweep,
  scheduleDefaultMapMonitorRefresh,
  startDefaultMapMonitor,
  stopDefaultMapMonitor,
  updateDefaultMapMonitorConfig,
};
