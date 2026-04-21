const crypto = require("node:crypto");
const { cdkPrisma } = require("../lib/prisma");
const { notifyScheduledCommandFinished } = require("./gotifyNotificationService");
const { extractAgentApiKey, generateAgentApiKey, hashAgentApiKey } = require("../utils/agentAuth");
const {
  extractNodePayloadMeta,
  sanitizeNodeCommandPayload,
  stripNodePayloadMeta,
} = require("../utils/nodeCommandPayloadMeta");

const MANAGED_NODE_STATUSES = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  DISABLED: "DISABLED",
};

const NODE_COMMAND_STATUSES = {
  PENDING: "PENDING",
  CLAIMED: "CLAIMED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
};

const FINAL_NODE_COMMAND_STATUSES = new Set([
  NODE_COMMAND_STATUSES.SUCCEEDED,
  NODE_COMMAND_STATUSES.FAILED,
  NODE_COMMAND_STATUSES.CANCELLED,
  NODE_COMMAND_STATUSES.EXPIRED,
]);

const ONLINE_WINDOW_MS = 45 * 1000;

function normalizeNodeCode(value, fallback = "") {
  const source = String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (source) {
    return source.slice(0, 32);
  }

  return `node-${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeJsonValue(value, fallback = null) {
  if (value == null) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return fallback;
  }
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeNodeCommandResult(currentValue, nextValue) {
  const current = sanitizeJsonValue(currentValue, null);
  const next = sanitizeJsonValue(nextValue, null);

  if (!isPlainRecord(current) || !isPlainRecord(next)) {
    return next ?? current;
  }

  const currentControl = isPlainRecord(current.control) ? current.control : {};
  const nextControl = isPlainRecord(next.control) ? next.control : {};

  return {
    ...current,
    ...next,
    ...(Object.keys(currentControl).length || Object.keys(nextControl).length
      ? {
          control: {
            ...currentControl,
            ...nextControl,
          },
        }
      : {}),
  };
}

function currentNodeStatus(row, now = Date.now()) {
  if (!row?.isActive) {
    return MANAGED_NODE_STATUSES.DISABLED;
  }

  const lastSeen = row?.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;

  if (!lastSeen || Number.isNaN(lastSeen)) {
    return MANAGED_NODE_STATUSES.OFFLINE;
  }

  return now - lastSeen <= ONLINE_WINDOW_MS
    ? MANAGED_NODE_STATUSES.ONLINE
    : MANAGED_NODE_STATUSES.OFFLINE;
}

function serializeManagedNode(row) {
  if (!row) {
    return null;
  }

  const status = currentNodeStatus(row);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    host: row.host || null,
    note: row.note || null,
    isActive: Boolean(row.isActive),
    status,
    isOnline: status === MANAGED_NODE_STATUSES.ONLINE,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    lastIp: row.lastIp || null,
    agentVersion: row.agentVersion || null,
    lastHeartbeat: row.lastHeartbeat || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeNodeCommand(row, options = {}) {
  if (!row) {
    return null;
  }

  const includeSecrets = Boolean(options.includeSecrets);
  const meta = extractNodePayloadMeta(row.payload);

  return {
    id: row.id,
    nodeId: row.nodeId,
    commandType: row.commandType,
    payload: includeSecrets
      ? stripNodePayloadMeta(row.payload)
      : sanitizeNodeCommandPayload(row.payload),
    status: row.status,
    createdBySteamId: row.createdBySteamId,
    createdByRole: row.createdByRole || null,
    claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    result: row.result || null,
    errorMessage: row.errorMessage || null,
    notificationChannelKeys: meta.notificationChannelKeys,
    sourceScheduleId: meta.sourceScheduleId,
    sourceScheduleName: meta.sourceScheduleName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    node: row.node ? serializeManagedNode(row.node) : undefined,
  };
}

async function findManagedNodeById(id) {
  const row = await cdkPrisma.managedNode.findUnique({
    where: { id: String(id) },
  });

  return row ? serializeManagedNode(row) : null;
}

async function getNodeCommandById(commandId, options = {}) {
  const row = await cdkPrisma.nodeCommand.findUnique({
    where: { id: String(commandId) },
    include: { node: true },
  });

  return row ? serializeNodeCommand(row, options) : null;
}

function serializeNodeCommandLog(row) {
  return {
    id: row.id,
    nodeId: row.nodeId,
    commandId: row.commandId,
    level: row.level,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

async function createManagedNode(payload) {
  const apiKey = generateAgentApiKey();
  const row = await cdkPrisma.managedNode.create({
    data: {
      code: normalizeNodeCode(payload.code, payload.name),
      name: String(payload.name || "").trim(),
      host: String(payload.host || "").trim() || null,
      note: String(payload.note || "").trim() || null,
      apiKeyHash: hashAgentApiKey(apiKey),
      isActive: Boolean(payload.isActive ?? true),
      status: payload.isActive === false ? MANAGED_NODE_STATUSES.DISABLED : MANAGED_NODE_STATUSES.OFFLINE,
    },
  });

  return {
    node: serializeManagedNode(row),
    apiKey,
  };
}

async function updateManagedNode(id, payload) {
  const existing = await cdkPrisma.managedNode.findUnique({
    where: { id: String(id) },
  });

  if (!existing) {
    throw new Error("Node not found");
  }

  const nextIsActive =
    Object.prototype.hasOwnProperty.call(payload, "isActive")
      ? Boolean(payload.isActive)
      : existing.isActive;

  const row = await cdkPrisma.managedNode.update({
    where: { id: String(id) },
    data: {
      code:
        Object.prototype.hasOwnProperty.call(payload, "code")
          ? normalizeNodeCode(payload.code, payload.name || existing.name)
          : undefined,
      name: Object.prototype.hasOwnProperty.call(payload, "name") ? String(payload.name || "").trim() : undefined,
      host: Object.prototype.hasOwnProperty.call(payload, "host") ? String(payload.host || "").trim() || null : undefined,
      note: Object.prototype.hasOwnProperty.call(payload, "note") ? String(payload.note || "").trim() || null : undefined,
      isActive: nextIsActive,
      status: nextIsActive ? currentNodeStatus(existing) : MANAGED_NODE_STATUSES.DISABLED,
    },
  });

  return serializeManagedNode(row);
}

async function rotateManagedNodeApiKey(id) {
  const existing = await cdkPrisma.managedNode.findUnique({
    where: { id: String(id) },
  });

  if (!existing) {
    throw new Error("Node not found");
  }

  const apiKey = generateAgentApiKey();
  const row = await cdkPrisma.managedNode.update({
    where: { id: String(id) },
    data: {
      apiKeyHash: hashAgentApiKey(apiKey),
    },
  });

  return {
    node: serializeManagedNode(row),
    apiKey,
  };
}

async function listManagedNodes() {
  const rows = await cdkPrisma.managedNode.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { createdAt: "asc" }],
  });

  return rows.map(serializeManagedNode);
}

async function findManagedNodeByApiKeyFromHeaders(headers) {
  const apiKey = extractAgentApiKey(headers);

  if (!apiKey) {
    return null;
  }

  const row = await cdkPrisma.managedNode.findUnique({
    where: {
      apiKeyHash: hashAgentApiKey(apiKey),
    },
  });

  return row || null;
}

async function recordManagedNodeHeartbeat(nodeId, payload, ipAddress) {
  const now = new Date();
  const row = await cdkPrisma.managedNode.update({
    where: { id: String(nodeId) },
    data: {
      lastSeenAt: now,
      lastIp: String(ipAddress || "").trim() || null,
      agentVersion: String(payload.agentVersion || "").trim() || null,
      lastHeartbeat: sanitizeJsonValue(
        {
          hostname: String(payload.hostname || "").trim() || null,
          platform: String(payload.platform || "").trim() || null,
          capabilities: Array.isArray(payload.capabilities)
            ? payload.capabilities.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
          summary: sanitizeJsonValue(payload.summary, {}),
          stats: sanitizeJsonValue(payload.stats, {}),
          servers: Array.isArray(payload.servers) ? sanitizeJsonValue(payload.servers, []) : [],
          metadata: sanitizeJsonValue(payload.metadata, {}),
        },
        {},
      ),
      status: MANAGED_NODE_STATUSES.ONLINE,
    },
  });

  return serializeManagedNode(row);
}

async function expirePendingCommands(nodeId) {
  const now = new Date();
  await cdkPrisma.nodeCommand.updateMany({
    where: {
      nodeId: String(nodeId),
      status: NODE_COMMAND_STATUSES.PENDING,
      expiresAt: {
        lt: now,
      },
    },
    data: {
      status: NODE_COMMAND_STATUSES.EXPIRED,
      finishedAt: now,
      errorMessage: "Command expired before claim",
    },
  });
}

async function claimNextNodeCommand(nodeId) {
  await expirePendingCommands(nodeId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = await cdkPrisma.nodeCommand.findFirst({
      where: {
        nodeId: String(nodeId),
        status: NODE_COMMAND_STATUSES.PENDING,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (!next) {
      return null;
    }

    const claimedAt = new Date();
    const updated = await cdkPrisma.nodeCommand.updateMany({
      where: {
        id: next.id,
        status: NODE_COMMAND_STATUSES.PENDING,
      },
      data: {
        status: NODE_COMMAND_STATUSES.CLAIMED,
        claimedAt,
      },
    });

    if (updated.count > 0) {
      const row = await cdkPrisma.nodeCommand.findUnique({
        where: { id: next.id },
      });

      return serializeNodeCommand(row, { includeSecrets: true });
    }
  }

  return null;
}

async function markNodeCommandStarted(nodeId, commandId) {
  const now = new Date();
  await cdkPrisma.nodeCommand.updateMany({
    where: {
      id: String(commandId),
      nodeId: String(nodeId),
      status: {
        in: [NODE_COMMAND_STATUSES.PENDING, NODE_COMMAND_STATUSES.CLAIMED],
      },
    },
    data: {
      status: NODE_COMMAND_STATUSES.RUNNING,
      claimedAt: now,
      startedAt: now,
    },
  });

  const row = await cdkPrisma.nodeCommand.findUnique({
    where: { id: String(commandId) },
  });

  if (!row || row.nodeId !== String(nodeId)) {
    throw new Error("Command not found");
  }

  return serializeNodeCommand(row);
}

async function finishNodeCommand(nodeId, commandId, payload) {
  const now = new Date();
  const existing = await cdkPrisma.nodeCommand.findUnique({
    where: { id: String(commandId) },
    select: {
      nodeId: true,
      result: true,
      startedAt: true,
      claimedAt: true,
    },
  });

  if (!existing || existing.nodeId !== String(nodeId)) {
    throw new Error("Command not found");
  }

  const nextStatus = payload.cancelled
    ? NODE_COMMAND_STATUSES.CANCELLED
    : payload.success
      ? NODE_COMMAND_STATUSES.SUCCEEDED
      : NODE_COMMAND_STATUSES.FAILED;
  const mergedResult = mergeNodeCommandResult(existing.result, payload.result);

  await cdkPrisma.nodeCommand.updateMany({
    where: {
      id: String(commandId),
      nodeId: String(nodeId),
      status: {
        in: [
          NODE_COMMAND_STATUSES.PENDING,
          NODE_COMMAND_STATUSES.CLAIMED,
          NODE_COMMAND_STATUSES.RUNNING,
        ],
      },
    },
    data: {
      status: nextStatus,
      startedAt: existing.startedAt || existing.claimedAt || now,
      finishedAt: now,
      result: mergedResult,
      errorMessage: payload.cancelled
        ? String(payload.errorMessage || "").trim() || "Command cancelled"
        : payload.success
          ? null
          : String(payload.errorMessage || "").trim() || "Command failed",
    },
  });

  const row = await cdkPrisma.nodeCommand.findUnique({
    where: { id: String(commandId) },
    include: { node: true },
  });

  if (!row || row.nodeId !== String(nodeId)) {
    throw new Error("Command not found");
  }

  void notifyScheduledCommandFinished(row).catch((error) => {
    console.error("Failed to send scheduled command finish notification:", error);
  });

  return serializeNodeCommand(row);
}

async function requestNodeCommandCancellation(commandId, payload = {}) {
  const row = await cdkPrisma.nodeCommand.findUnique({
    where: { id: String(commandId) },
    include: { node: true },
  });

  if (!row) {
    throw new Error("Command not found");
  }

  if (FINAL_NODE_COMMAND_STATUSES.has(row.status)) {
    return serializeNodeCommand(row);
  }

  const now = new Date();
  const nextResult = mergeNodeCommandResult(row.result, {
    control: {
      cancellationRequestedAt: now.toISOString(),
      cancellationRequestedBySteamId: String(payload.requestedBySteamId || "").trim() || null,
      cancellationRequestedByRole: String(payload.requestedByRole || "").trim() || null,
      force: Boolean(payload.force),
      reason: String(payload.reason || "").trim() || null,
    },
  });

  if (row.status === NODE_COMMAND_STATUSES.RUNNING) {
    if (payload.force) {
      const cancelled = await cdkPrisma.nodeCommand.update({
        where: { id: String(commandId) },
        data: {
          status: NODE_COMMAND_STATUSES.CANCELLED,
          finishedAt: now,
          result: nextResult,
          errorMessage: String(payload.reason || "").trim() || "Command force cancelled by operator",
        },
        include: { node: true },
      });

      return serializeNodeCommand(cancelled);
    }

    const updated = await cdkPrisma.nodeCommand.update({
      where: { id: String(commandId) },
      data: {
        result: nextResult,
      },
      include: { node: true },
    });

    return serializeNodeCommand(updated);
  }

  const cancelled = await cdkPrisma.nodeCommand.update({
    where: { id: String(commandId) },
    data: {
      status: NODE_COMMAND_STATUSES.CANCELLED,
      finishedAt: now,
      result: nextResult,
      errorMessage: String(payload.reason || "").trim() || "Command cancelled by operator",
    },
    include: { node: true },
  });

  return serializeNodeCommand(cancelled);
}

async function requestNodeCommandCancellationBatch(commandIds, payload = {}) {
  const ids = Array.from(
    new Set(
      (Array.isArray(commandIds) ? commandIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  const commands = [];
  const missingIds = [];

  for (const commandId of ids) {
    try {
      commands.push(await requestNodeCommandCancellation(commandId, payload));
    } catch (error) {
      if (error?.message === "Command not found") {
        missingIds.push(commandId);
        continue;
      }

      throw error;
    }
  }

  return {
    commands,
    missingIds,
    requestedCount: ids.length,
    affectedCount: commands.length,
  };
}

async function appendNodeCommandLogs(nodeId, commandId, logs) {
  const command = await cdkPrisma.nodeCommand.findUnique({
    where: { id: String(commandId) },
  });

  if (!command || command.nodeId !== String(nodeId)) {
    throw new Error("Command not found");
  }

  const rows = logs
    .map((item) => ({
      nodeId: String(nodeId),
      commandId: String(commandId),
      level: String(item.level || "info").trim().slice(0, 16) || "info",
      message: String(item.message || "").trim(),
    }))
    .filter((item) => item.message);

  if (!rows.length) {
    return [];
  }

  await cdkPrisma.nodeCommandLog.createMany({
    data: rows,
  });

  const latestRows = await cdkPrisma.nodeCommandLog.findMany({
    where: {
      commandId: String(commandId),
    },
    orderBy: [{ createdAt: "desc" }],
    take: rows.length,
  });

  return latestRows.reverse().map(serializeNodeCommandLog);
}

async function createNodeCommand(payload) {
  const node = await cdkPrisma.managedNode.findUnique({
    where: { id: String(payload.nodeId) },
  });

  if (!node) {
    throw new Error("Node not found");
  }

  const expiresAt =
    Number(payload.expiresInSeconds) > 0
      ? new Date(Date.now() + Number(payload.expiresInSeconds) * 1000)
      : null;

  const row = await cdkPrisma.nodeCommand.create({
    data: {
      nodeId: String(payload.nodeId),
      commandType: String(payload.commandType || "").trim(),
      payload: sanitizeJsonValue(payload.payload, {}),
      status: NODE_COMMAND_STATUSES.PENDING,
      createdBySteamId: String(payload.createdBySteamId || "").trim(),
      createdByRole: String(payload.createdByRole || "").trim() || null,
      expiresAt,
    },
    include: { node: true },
  });

  return serializeNodeCommand(row);
}

async function listNodeCommands({ nodeId, status, statuses, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const safeStatuses = Array.isArray(statuses)
    ? Array.from(
        new Set(
          statuses
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        ),
      )
    : [];
  const rows = await cdkPrisma.nodeCommand.findMany({
    where: {
      nodeId: nodeId ? String(nodeId) : undefined,
      status: safeStatuses.length
        ? { in: safeStatuses }
        : status
          ? String(status)
          : undefined,
    },
    orderBy: [{ createdAt: "desc" }],
    take: safeLimit,
    include: {
      node: true,
    },
  });

  return rows.map(serializeNodeCommand);
}

async function listNodeCommandLogs(commandId, limit = 500) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 500));
  const rows = await cdkPrisma.nodeCommandLog.findMany({
    where: {
      commandId: String(commandId),
    },
    orderBy: [{ createdAt: "asc" }],
    take: safeLimit,
  });

  return rows.map(serializeNodeCommandLog);
}

module.exports = {
  MANAGED_NODE_STATUSES,
  NODE_COMMAND_STATUSES,
  appendNodeCommandLogs,
  claimNextNodeCommand,
  createManagedNode,
  createNodeCommand,
  findManagedNodeByApiKeyFromHeaders,
  findManagedNodeById,
  finishNodeCommand,
  getNodeCommandById,
  listManagedNodes,
  listNodeCommandLogs,
  listNodeCommands,
  markNodeCommandStarted,
  currentNodeStatus,
  recordManagedNodeHeartbeat,
  requestNodeCommandCancellation,
  requestNodeCommandCancellationBatch,
  rotateManagedNodeApiKey,
  serializeManagedNode,
  serializeNodeCommand,
  updateManagedNode,
};
