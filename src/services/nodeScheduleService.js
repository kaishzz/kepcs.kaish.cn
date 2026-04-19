const { cdkPrisma } = require("../lib/prisma");
const { createNodeCommand, serializeManagedNode } = require("./agentControlService");
const { notifyScheduledCommandQueued } = require("./gotifyNotificationService");
const {
  attachNodePayloadMeta,
  extractNodePayloadMeta,
  stripNodePayloadMeta,
} = require("../utils/nodeCommandPayloadMeta");
const {
  describeNodeScheduleConfig,
  normalizeNodeScheduleConfig,
  resolveNextNodeScheduleRunAt,
  scheduleConfigToLegacyIntervalMinutes,
} = require("../utils/nodeScheduleConfig");

let scheduleTimer = null;
let runningTick = false;

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

function serializeNodeSchedule(row) {
  if (!row) {
    return null;
  }

  const meta = extractNodePayloadMeta(row.payload);
  const scheduleConfig = normalizeNodeScheduleConfig(meta.scheduleConfig, {
    intervalMinutes: row.intervalMinutes,
    nextRunAt: row.nextRunAt,
  });

  return {
    id: row.id,
    nodeId: row.nodeId,
    name: row.name,
    commandType: row.commandType,
    payload: stripNodePayloadMeta(row.payload),
    notificationChannelKeys: meta.notificationChannelKeys,
    intervalMinutes: row.intervalMinutes,
    scheduleConfig,
    scheduleSummary: describeNodeScheduleConfig(scheduleConfig),
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    lastQueuedAt: row.lastQueuedAt ? row.lastQueuedAt.toISOString() : null,
    lastCommandId: row.lastCommandId || null,
    isActive: Boolean(row.isActive),
    createdBySteamId: row.createdBySteamId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    node: row.node ? serializeManagedNode(row.node) : undefined,
  };
}

function computeNextRunAt(baseDate, intervalMinutes, now = new Date(), scheduleConfig = null) {
  return resolveNextNodeScheduleRunAt({
    baseDate,
    intervalMinutes,
    scheduleConfig,
  }, now);
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function resolveScheduleTiming(payload, currentRow = null) {
  const currentMeta = extractNodePayloadMeta(currentRow?.payload);
  const scheduleConfig = normalizeNodeScheduleConfig(
    hasOwn(payload, "scheduleConfig") ? payload.scheduleConfig : currentMeta.scheduleConfig,
    {
      intervalMinutes: hasOwn(payload, "intervalMinutes")
        ? payload.intervalMinutes
        : currentRow?.intervalMinutes,
      nextRunAt: hasOwn(payload, "nextRunAt")
        ? payload.nextRunAt
        : currentRow?.nextRunAt,
      anchorDate: currentMeta.scheduleConfig?.anchorDate,
      time: currentMeta.scheduleConfig?.time,
    },
  );

  const intervalMinutes = scheduleConfigToLegacyIntervalMinutes(
    scheduleConfig,
    currentRow?.intervalMinutes ?? payload.intervalMinutes,
  );

  const baseDate = hasOwn(payload, "nextRunAt")
    ? payload.nextRunAt
    : null;

  const nextRunAt = resolveNextNodeScheduleRunAt({
    scheduleConfig,
    intervalMinutes,
    baseDate,
  });

  return {
    scheduleConfig,
    intervalMinutes,
    nextRunAt,
  };
}

async function listNodeSchedules({ nodeId, isActive } = {}) {
  const rows = await cdkPrisma.nodeCommandSchedule.findMany({
    where: {
      nodeId: nodeId ? String(nodeId) : undefined,
      isActive: typeof isActive === "boolean" ? isActive : undefined,
    },
    orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }, { createdAt: "asc" }],
    include: {
      node: true,
    },
  });

  return rows.map(serializeNodeSchedule);
}

async function createNodeSchedule(payload) {
  const scheduleTiming = resolveScheduleTiming(payload);
  const row = await cdkPrisma.nodeCommandSchedule.create({
    data: {
      nodeId: String(payload.nodeId),
      name: String(payload.name || "").trim(),
      commandType: String(payload.commandType || "").trim(),
      payload: attachNodePayloadMeta(
        sanitizeJsonValue(payload.payload, {}),
        {
          notificationChannelKeys: payload.notificationChannelKeys,
          scheduleConfig: scheduleTiming.scheduleConfig,
        },
      ),
      intervalMinutes: scheduleTiming.intervalMinutes,
      nextRunAt: scheduleTiming.nextRunAt,
      isActive: Boolean(payload.isActive ?? true),
      createdBySteamId: String(payload.createdBySteamId || "").trim(),
    },
    include: {
      node: true,
    },
  });

  return serializeNodeSchedule(row);
}

async function updateNodeSchedule(id, payload) {
  const shouldUpdatePayload =
    hasOwn(payload, "payload")
    || hasOwn(payload, "notificationChannelKeys")
    || hasOwn(payload, "scheduleConfig")
    || hasOwn(payload, "intervalMinutes")
    || hasOwn(payload, "nextRunAt");

  const shouldUpdateTiming =
    hasOwn(payload, "scheduleConfig")
    || hasOwn(payload, "intervalMinutes")
    || hasOwn(payload, "nextRunAt");

  let currentRow = null;
  let scheduleTiming = null;

  let nextPayload;

  if (shouldUpdatePayload) {
    currentRow = await cdkPrisma.nodeCommandSchedule.findUnique({
      where: { id: String(id) },
      select: {
        payload: true,
        intervalMinutes: true,
        nextRunAt: true,
      },
    });

    const currentMeta = extractNodePayloadMeta(currentRow?.payload);
    scheduleTiming = resolveScheduleTiming(payload, currentRow);

    const basePayload = hasOwn(payload, "payload")
      ? sanitizeJsonValue(payload.payload, {})
      : stripNodePayloadMeta(currentRow?.payload);

    nextPayload = attachNodePayloadMeta(basePayload, {
      notificationChannelKeys: hasOwn(payload, "notificationChannelKeys")
        ? payload.notificationChannelKeys
        : currentMeta.notificationChannelKeys,
      scheduleConfig: scheduleTiming.scheduleConfig,
    });
  } else if (shouldUpdateTiming) {
    currentRow = await cdkPrisma.nodeCommandSchedule.findUnique({
      where: { id: String(id) },
      select: {
        payload: true,
        intervalMinutes: true,
        nextRunAt: true,
      },
    });
    scheduleTiming = resolveScheduleTiming(payload, currentRow);
  }

  const row = await cdkPrisma.nodeCommandSchedule.update({
    where: { id: String(id) },
    data: {
      name: hasOwn(payload, "name") ? String(payload.name || "").trim() : undefined,
      commandType: hasOwn(payload, "commandType") ? String(payload.commandType || "").trim() : undefined,
      payload: shouldUpdatePayload ? nextPayload : undefined,
      intervalMinutes: shouldUpdateTiming ? scheduleTiming.intervalMinutes : undefined,
      nextRunAt: shouldUpdateTiming ? scheduleTiming.nextRunAt : undefined,
      isActive: hasOwn(payload, "isActive") ? Boolean(payload.isActive) : undefined,
    },
    include: {
      node: true,
    },
  });

  return serializeNodeSchedule(row);
}

async function deleteNodeSchedule(id) {
  await cdkPrisma.nodeCommandSchedule.delete({
    where: { id: String(id) },
  });
}

async function queueScheduleRun(scheduleRow) {
  const now = new Date();
  const scheduleMeta = extractNodePayloadMeta(scheduleRow.payload);
  const nextRunAt = computeNextRunAt(
    scheduleRow.nextRunAt,
    scheduleRow.intervalMinutes,
    now,
    scheduleMeta.scheduleConfig,
  );

  const updated = await cdkPrisma.nodeCommandSchedule.updateMany({
    where: {
      id: scheduleRow.id,
      isActive: true,
      nextRunAt: scheduleRow.nextRunAt,
    },
    data: {
      nextRunAt,
      lastQueuedAt: now,
    },
  });

  if (!updated.count) {
    return null;
  }

  const command = await createNodeCommand({
    nodeId: scheduleRow.nodeId,
    commandType: scheduleRow.commandType,
    payload: attachNodePayloadMeta(
      stripNodePayloadMeta(scheduleRow.payload),
      {
        notificationChannelKeys: scheduleMeta.notificationChannelKeys,
        sourceScheduleId: scheduleRow.id,
        sourceScheduleName: scheduleRow.name,
      },
    ),
    expiresInSeconds: 900,
    createdBySteamId: scheduleRow.createdBySteamId,
    createdByRole: "scheduler",
  });

  await cdkPrisma.nodeCommandSchedule.update({
    where: { id: scheduleRow.id },
    data: {
      lastCommandId: command.id,
      lastQueuedAt: now,
    },
  });

  if (scheduleMeta.notificationChannelKeys.length) {
    const schedule = serializeNodeSchedule({
      ...scheduleRow,
      lastQueuedAt: now,
    });

    void notifyScheduledCommandQueued(schedule, command).catch((error) => {
      console.error("Failed to send scheduled queue notification:", error);
    });
  }

  return command;
}

async function runDueNodeSchedules() {
  if (runningTick) {
    return;
  }

  runningTick = true;

  try {
    const now = new Date();
    const rows = await cdkPrisma.nodeCommandSchedule.findMany({
      where: {
        isActive: true,
        nextRunAt: {
          lte: now,
        },
      },
      orderBy: [{ nextRunAt: "asc" }, { createdAt: "asc" }],
      take: 20,
      include: {
        node: true,
      },
    });

    for (const row of rows) {
      try {
        await queueScheduleRun(row);
      } catch (error) {
        console.error("Failed to queue scheduled node command:", error);
      }
    }
  } finally {
    runningTick = false;
  }
}

function startNodeScheduleRunner() {
  if (scheduleTimer) {
    return () => {
      if (scheduleTimer) {
        clearInterval(scheduleTimer);
        scheduleTimer = null;
      }
    };
  }

  void runDueNodeSchedules();
  scheduleTimer = setInterval(() => {
    void runDueNodeSchedules();
  }, 15 * 1000);

  return () => {
    if (scheduleTimer) {
      clearInterval(scheduleTimer);
      scheduleTimer = null;
    }
  };
}

module.exports = {
  computeNextRunAt,
  createNodeSchedule,
  deleteNodeSchedule,
  listNodeSchedules,
  runDueNodeSchedules,
  serializeNodeSchedule,
  startNodeScheduleRunner,
  updateNodeSchedule,
};
