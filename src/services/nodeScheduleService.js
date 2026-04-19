const { cdkPrisma } = require("../lib/prisma");
const { createNodeCommand, serializeManagedNode } = require("./agentControlService");
const { notifyScheduledCommandQueued } = require("./gotifyNotificationService");
const {
  attachNodePayloadMeta,
  extractNodePayloadMeta,
  stripNodePayloadMeta,
} = require("../utils/nodeCommandPayloadMeta");

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

  return {
    id: row.id,
    nodeId: row.nodeId,
    name: row.name,
    commandType: row.commandType,
    payload: stripNodePayloadMeta(row.payload),
    notificationChannelKeys: meta.notificationChannelKeys,
    intervalMinutes: row.intervalMinutes,
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

function computeNextRunAt(baseDate, intervalMinutes, now = new Date()) {
  const safeIntervalMinutes = Math.max(1, Number(intervalMinutes) || 1);
  let cursor = new Date(baseDate);
  const nowTime = now.getTime();

  if (Number.isNaN(cursor.getTime())) {
    cursor = new Date(nowTime + safeIntervalMinutes * 60 * 1000);
  }

  while (cursor.getTime() <= nowTime) {
    cursor = new Date(cursor.getTime() + safeIntervalMinutes * 60 * 1000);
  }

  return cursor;
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
  const row = await cdkPrisma.nodeCommandSchedule.create({
    data: {
      nodeId: String(payload.nodeId),
      name: String(payload.name || "").trim(),
      commandType: String(payload.commandType || "").trim(),
      payload: attachNodePayloadMeta(
        sanitizeJsonValue(payload.payload, {}),
        {
          notificationChannelKeys: payload.notificationChannelKeys,
        },
      ),
      intervalMinutes: Math.max(1, Number(payload.intervalMinutes) || 1),
      nextRunAt: new Date(payload.nextRunAt),
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
    Object.prototype.hasOwnProperty.call(payload, "payload")
    || Object.prototype.hasOwnProperty.call(payload, "notificationChannelKeys");

  let nextPayload;

  if (shouldUpdatePayload) {
    const existing = await cdkPrisma.nodeCommandSchedule.findUnique({
      where: { id: String(id) },
      select: { payload: true },
    });

    const currentMeta = extractNodePayloadMeta(existing?.payload);
    const basePayload = Object.prototype.hasOwnProperty.call(payload, "payload")
      ? sanitizeJsonValue(payload.payload, {})
      : stripNodePayloadMeta(existing?.payload);

    nextPayload = attachNodePayloadMeta(basePayload, {
      notificationChannelKeys: Object.prototype.hasOwnProperty.call(payload, "notificationChannelKeys")
        ? payload.notificationChannelKeys
        : currentMeta.notificationChannelKeys,
    });
  }

  const row = await cdkPrisma.nodeCommandSchedule.update({
    where: { id: String(id) },
    data: {
      name: Object.prototype.hasOwnProperty.call(payload, "name") ? String(payload.name || "").trim() : undefined,
      commandType: Object.prototype.hasOwnProperty.call(payload, "commandType") ? String(payload.commandType || "").trim() : undefined,
      payload: shouldUpdatePayload ? nextPayload : undefined,
      intervalMinutes: Object.prototype.hasOwnProperty.call(payload, "intervalMinutes") ? Math.max(1, Number(payload.intervalMinutes) || 1) : undefined,
      nextRunAt: Object.prototype.hasOwnProperty.call(payload, "nextRunAt") ? new Date(payload.nextRunAt) : undefined,
      isActive: Object.prototype.hasOwnProperty.call(payload, "isActive") ? Boolean(payload.isActive) : undefined,
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
  const nextRunAt = computeNextRunAt(scheduleRow.nextRunAt, scheduleRow.intervalMinutes, now);
  const scheduleMeta = extractNodePayloadMeta(scheduleRow.payload);

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
