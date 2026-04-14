const { fetchServerList } = require("./serverListService");
const { createNodeCommand, listManagedNodes } = require("./agentControlService");
const { writeAuditLog } = require("./auditLogService");
const { listKepcsServers } = require("./serverCatalogService");
const { cdkPrisma } = require("../lib/prisma");
const { getServerCatalogPool } = require("../lib/serverCatalogDatabase");

const APP_TIMEZONE = "Asia/Shanghai";
const DEFAULT_IDLE_RESTART_MONITOR_CONFIG = Object.freeze({
  enabled: false,
  checkIntervalSeconds: 30,
});
const DEFAULT_IDLE_RESTART_WINDOW_START = "02:00";
const DEFAULT_IDLE_RESTART_WINDOW_END = "08:00";
const DEFAULT_IDLE_RESTART_THRESHOLD_SECONDS = 300;
const DEFAULT_IDLE_RESTART_COOLDOWN_SECONDS = 1800;

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const monitorState = {
  timer: null,
  running: false,
  started: false,
  idleSinceByServer: new Map(),
  cooldownUntilByServer: new Map(),
  runtime: {
    lastCheckedAt: null,
    lastRestartAt: null,
    lastError: null,
    lastSummary: {
      inspectedCount: 0,
      eligibleCount: 0,
      matchedCount: 0,
      queuedCount: 0,
      windowActiveCount: 0,
      trackedIdleCount: 0,
    },
    windowActive: false,
    recentRestarts: [],
  },
};

function normalizeBoolean(value) {
  return Boolean(value);
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTimeValue(value, fallback) {
  const safeValue = String(value || "").trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(safeValue) ? safeValue : fallback;
}

function parseTimeToMinutes(value) {
  const [hours, minutes] = normalizeTimeValue(value, "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function currentWindowMinutes(now = new Date()) {
  const parts = timeFormatter.formatToParts(now);
  const hour = Number(parts.find((item) => item.type === "hour")?.value || 0);
  const minute = Number(parts.find((item) => item.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function isWithinTimeWindow(windowStart, windowEnd, now = new Date()) {
  const start = parseTimeToMinutes(windowStart);
  const end = parseTimeToMinutes(windowEnd);
  const current = currentWindowMinutes(now);

  if (start === end) {
    return true;
  }

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function normalizeIdleRestartMonitorConfigRow(row) {
  return {
    enabled: normalizeBoolean(row?.enabled),
    checkIntervalSeconds: normalizePositiveInt(
      row?.check_interval_seconds ?? row?.checkIntervalSeconds,
      DEFAULT_IDLE_RESTART_MONITOR_CONFIG.checkIntervalSeconds,
    ),
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
    timezone: APP_TIMEZONE,
  };
}

function getMonitorServerKey(row) {
  return `${String(row?.host || "").trim()}:${Number(row?.port) || 0}`;
}

function resetIdleTimer(serverKey) {
  monitorState.idleSinceByServer.delete(serverKey);
}

function pruneStateMaps(rows, now = Date.now()) {
  const activeKeys = new Set(rows.map(getMonitorServerKey));

  for (const serverKey of Array.from(monitorState.idleSinceByServer.keys())) {
    if (!activeKeys.has(serverKey)) {
      monitorState.idleSinceByServer.delete(serverKey);
    }
  }

  for (const [serverKey, cooldownUntil] of Array.from(monitorState.cooldownUntilByServer.entries())) {
    if (!activeKeys.has(serverKey) || Number(cooldownUntil) <= now) {
      monitorState.cooldownUntilByServer.delete(serverKey);
    }
  }
}

function recentRestartEntry(entry) {
  return {
    serverId: entry.serverId,
    name: entry.name,
    shotId: entry.shotId,
    endpoint: entry.endpoint,
    nodeId: entry.nodeId,
    nodeName: entry.nodeName,
    serverKey: entry.serverKey,
    restartedAt: entry.restartedAt,
  };
}

async function ensureIdleRestartMonitorConfigRow() {
  const pool = getServerCatalogPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS idle_restart_monitor_config (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      check_interval_seconds INT NOT NULL DEFAULT 30,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(
    `
      INSERT INTO idle_restart_monitor_config (id, enabled, check_interval_seconds)
      VALUES (1, ?, ?)
      ON DUPLICATE KEY UPDATE id = id
    `,
    [
      DEFAULT_IDLE_RESTART_MONITOR_CONFIG.enabled ? 1 : 0,
      DEFAULT_IDLE_RESTART_MONITOR_CONFIG.checkIntervalSeconds,
    ],
  );
}

async function getIdleRestartMonitorConfig() {
  await ensureIdleRestartMonitorConfigRow();
  const pool = getServerCatalogPool();
  const [rows] = await pool.query(
    `
      SELECT
        id,
        enabled,
        check_interval_seconds,
        created_at,
        updated_at
      FROM idle_restart_monitor_config
      WHERE id = 1
      LIMIT 1
    `,
  );

  return normalizeIdleRestartMonitorConfigRow(rows[0] || {});
}

async function updateIdleRestartMonitorConfig(payload) {
  await ensureIdleRestartMonitorConfigRow();
  const pool = getServerCatalogPool();
  const nextConfig = {
    enabled: Object.prototype.hasOwnProperty.call(payload, "enabled")
      ? Boolean(payload.enabled)
      : DEFAULT_IDLE_RESTART_MONITOR_CONFIG.enabled,
    checkIntervalSeconds: normalizePositiveInt(
      payload.checkIntervalSeconds,
      DEFAULT_IDLE_RESTART_MONITOR_CONFIG.checkIntervalSeconds,
    ),
  };

  await pool.execute(
    `
      UPDATE idle_restart_monitor_config
      SET
        enabled = ?,
        check_interval_seconds = ?
      WHERE id = 1
    `,
    [
      nextConfig.enabled ? 1 : 0,
      nextConfig.checkIntervalSeconds,
    ],
  );

  scheduleIdleRestartMonitorRefresh();
  return await getIdleRestartMonitorConfig();
}

function serializeMonitorRuntime() {
  return {
    lastCheckedAt: monitorState.runtime.lastCheckedAt,
    lastRestartAt: monitorState.runtime.lastRestartAt,
    lastError: monitorState.runtime.lastError,
    windowActive: Boolean(monitorState.runtime.windowActive),
    lastSummary: {
      ...monitorState.runtime.lastSummary,
      trackedIdleCount: monitorState.idleSinceByServer.size,
    },
    recentRestarts: monitorState.runtime.recentRestarts.map((item) => ({ ...item })),
  };
}

async function getIdleRestartMonitorStatus() {
  const config = await getIdleRestartMonitorConfig();
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

function buildManagedServerIndex(nodes) {
  const byKey = new Map();
  const byPort = new Map();

  for (const node of nodes) {
    const nodeName = String(node?.name || node?.code || "").trim() || "未命名节点";
    const servers = Array.isArray(node?.lastHeartbeat?.servers) ? node.lastHeartbeat.servers : [];

    for (const server of servers) {
      const serverKey = String(server?.key || "").trim();
      const primaryPort = Number(server?.primaryPort || 0);
      const target = {
        nodeId: String(node.id),
        nodeName,
        serverKey,
        primaryPort,
      };

      if (serverKey && !byKey.has(serverKey)) {
        byKey.set(serverKey, target);
      }

      if (primaryPort > 0 && !byPort.has(primaryPort)) {
        byPort.set(primaryPort, target);
      }
    }
  }

  return {
    byKey,
    byPort,
  };
}

function resolveRestartTarget(serverRow, index) {
  const shotId = String(serverRow?.shotId || "").trim();
  if (shotId && index.byKey.has(shotId)) {
    const target = index.byKey.get(shotId);
    return target?.serverKey ? target : null;
  }

  const port = Number(serverRow?.port || 0);
  if (port > 0 && index.byPort.has(port)) {
    const target = index.byPort.get(port);
    return target?.serverKey ? target : null;
  }

  return null;
}

async function loadPendingRestartCommands(nodeIds) {
  if (!nodeIds.length) {
    return new Map();
  }

  const rows = await cdkPrisma.nodeCommand.findMany({
    where: {
      nodeId: {
        in: nodeIds,
      },
      commandType: "docker.restart_server",
      status: {
        in: ["PENDING", "CLAIMED", "RUNNING"],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 500,
  });

  const result = new Map();

  for (const row of rows) {
    const key = String(row?.payload?.key || "").trim();
    if (!key) {
      continue;
    }

    if (!result.has(row.nodeId)) {
      result.set(row.nodeId, new Set());
    }

    result.get(row.nodeId).add(key);
  }

  return result;
}

async function queueRestartCommand(serverRow, target, auditContext) {
  const command = await createNodeCommand({
    nodeId: target.nodeId,
    commandType: "docker.restart_server",
    payload: {
      key: target.serverKey,
    },
    expiresInSeconds: 300,
    createdBySteamId: auditContext?.actorSteamId || "system",
    createdByRole: auditContext?.actorRole || "system",
  });

  const restartedAt = new Date().toISOString();
  monitorState.runtime.lastRestartAt = restartedAt;
  monitorState.runtime.recentRestarts = [
    recentRestartEntry({
      serverId: String(serverRow.id),
      name: serverRow.name,
      shotId: serverRow.shotId,
      endpoint: `${serverRow.host}:${serverRow.port}`,
      nodeId: target.nodeId,
      nodeName: target.nodeName,
      serverKey: target.serverKey,
      restartedAt,
    }),
    ...monitorState.runtime.recentRestarts,
  ].slice(0, 8);

  await writeAuditLog({
    actorSteamId: auditContext?.actorSteamId || "system",
    actorRole: auditContext?.actorRole || "system",
    action: "idle_restart_monitor.restart",
    targetType: "kepcs-server",
    targetId: String(serverRow.id),
    detail: {
      shotId: serverRow.shotId,
      host: serverRow.host,
      port: serverRow.port,
      nodeId: target.nodeId,
      nodeName: target.nodeName,
      serverKey: target.serverKey,
      commandId: command.id,
    },
  });

  return command;
}

async function runIdleRestartMonitorSweep(options = {}) {
  if (monitorState.running) {
    throw new Error("空服重启巡检正在执行中");
  }

  monitorState.running = true;

  try {
    const config = await getIdleRestartMonitorConfig();
    const now = Date.now();

    if (!config.enabled && !options.ignoreEnabled) {
      monitorState.runtime.lastCheckedAt = new Date(now).toISOString();
      monitorState.runtime.lastError = null;
      monitorState.runtime.windowActive = false;
      monitorState.runtime.lastSummary = {
        inspectedCount: 0,
        eligibleCount: 0,
        matchedCount: 0,
        queuedCount: 0,
        windowActiveCount: 0,
        trackedIdleCount: monitorState.idleSinceByServer.size,
      };

      return {
        config,
        runtime: serializeMonitorRuntime(),
      };
    }

    const serverRows = await listKepcsServers({ activeOnly: true });
    const monitoredRows = serverRows.filter((row) => row.idleRestartEnabled);
    pruneStateMaps(monitoredRows, now);

    const serverListPayload = await fetchServerList(true);
    if (serverListPayload?.lastError) {
      monitorState.runtime.lastCheckedAt = new Date(now).toISOString();
      monitorState.runtime.lastError = String(serverListPayload.lastError);
      monitorState.runtime.windowActive = false;
      monitorState.runtime.lastSummary = {
        inspectedCount: monitoredRows.length,
        eligibleCount: 0,
        matchedCount: 0,
        queuedCount: 0,
        windowActiveCount: 0,
        trackedIdleCount: monitorState.idleSinceByServer.size,
      };
      monitorState.idleSinceByServer.clear();

      return {
        config,
        runtime: serializeMonitorRuntime(),
      };
    }

    const nodes = (await listManagedNodes()).filter((node) => node.isActive && node.isOnline);
    const index = buildManagedServerIndex(nodes);
    const pendingByNode = await loadPendingRestartCommands(nodes.map((node) => node.id));

    let eligibleCount = 0;
    let matchedCount = 0;
    let queuedCount = 0;
    let windowActiveCount = 0;

    for (const row of monitoredRows) {
      const serverKey = getMonitorServerKey(row);
      const liveServer = findLiveServerStatus(serverListPayload, row);
      const rowWindowActive = isWithinTimeWindow(
        row.idleRestartWindowStart || DEFAULT_IDLE_RESTART_WINDOW_START,
        row.idleRestartWindowEnd || DEFAULT_IDLE_RESTART_WINDOW_END,
        new Date(now),
      );

      if (!liveServer) {
        resetIdleTimer(serverKey);
        continue;
      }

      if (String(row?.shotId || "").trim()) {
        eligibleCount += 1;
      }

      const restartTarget = resolveRestartTarget(row, index);
      if (restartTarget) {
        matchedCount += 1;
      }

      if (rowWindowActive) {
        windowActiveCount += 1;
      }

      if (!rowWindowActive && !options.ignoreWindow) {
        resetIdleTimer(serverKey);
        continue;
      }

      const currentPlayers = Number(liveServer.currentPlayers || 0);

      if (currentPlayers > 0) {
        resetIdleTimer(serverKey);
        continue;
      }

      if (!restartTarget) {
        resetIdleTimer(serverKey);
        continue;
      }

      let pendingKeys = pendingByNode.get(restartTarget.nodeId);
      if (pendingKeys?.has(restartTarget.serverKey)) {
        resetIdleTimer(serverKey);
        continue;
      }

      const cooldownUntil = Number(monitorState.cooldownUntilByServer.get(serverKey) || 0);
      if (cooldownUntil > now) {
        resetIdleTimer(serverKey);
        continue;
      }

      const idleSince = monitorState.idleSinceByServer.get(serverKey) || now;
      monitorState.idleSinceByServer.set(serverKey, idleSince);
      const idleSeconds = Math.floor((now - idleSince) / 1000);

      if (idleSeconds < row.idleRestartThresholdSeconds) {
        continue;
      }

      try {
        await queueRestartCommand(row, restartTarget, options.auditContext);
        queuedCount += 1;
        if (!pendingKeys) {
          pendingKeys = new Set();
          pendingByNode.set(restartTarget.nodeId, pendingKeys);
        }
        pendingKeys.add(restartTarget.serverKey);
        monitorState.cooldownUntilByServer.set(
          serverKey,
          now + row.idleRestartCooldownSeconds * 1000,
        );
      } catch (error) {
        console.warn(
          `[idle-restart-monitor] failed to queue restart for ${serverKey}: ${error.message}`,
        );
      } finally {
        resetIdleTimer(serverKey);
      }
    }

    monitorState.runtime.lastCheckedAt = new Date(now).toISOString();
    monitorState.runtime.lastError = null;
    monitorState.runtime.windowActive = windowActiveCount > 0;
    monitorState.runtime.lastSummary = {
      inspectedCount: monitoredRows.length,
      eligibleCount,
      matchedCount,
      queuedCount,
      windowActiveCount,
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
    await runIdleRestartMonitorSweep();
  } catch (error) {
    console.error("[idle-restart-monitor] scheduled sweep failed:", error);
  } finally {
    if (!monitorState.started) {
      return;
    }

    let nextDelayMs = DEFAULT_IDLE_RESTART_MONITOR_CONFIG.checkIntervalSeconds * 1000;

    try {
      const config = await getIdleRestartMonitorConfig();
      nextDelayMs = Math.max(1000, config.checkIntervalSeconds * 1000);
    } catch (error) {
      console.error("[idle-restart-monitor] failed to load next config:", error);
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

function startIdleRestartMonitor() {
  if (monitorState.started) {
    return () => stopIdleRestartMonitor();
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

  return () => stopIdleRestartMonitor();
}

function scheduleIdleRestartMonitorRefresh() {
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

function stopIdleRestartMonitor() {
  monitorState.started = false;
  clearMonitorTimer();
  monitorState.running = false;
  monitorState.idleSinceByServer.clear();
  monitorState.cooldownUntilByServer.clear();
}

module.exports = {
  APP_TIMEZONE,
  DEFAULT_IDLE_RESTART_MONITOR_CONFIG,
  getIdleRestartMonitorConfig,
  getIdleRestartMonitorStatus,
  isWithinTimeWindow,
  normalizeIdleRestartMonitorConfigRow,
  runIdleRestartMonitorSweep,
  scheduleIdleRestartMonitorRefresh,
  startIdleRestartMonitor,
  stopIdleRestartMonitor,
  updateIdleRestartMonitorConfig,
};
