const { cdkPrisma } = require("../lib/prisma");
const { createAxiosClient } = require("../lib/httpClient");
const {
  extractNodePayloadMeta,
  normalizeNotificationChannelKeys,
  stripNodePayloadMeta,
} = require("../utils/nodeCommandPayloadMeta");

const GOTIFY_SETTINGS_KEY = "gotify.notifications.config";
const DEFAULT_GOTIFY_PRIORITY = 5;

function clampPriority(value, fallback = DEFAULT_GOTIFY_PRIORITY) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(10, Math.round(parsed)));
}

function normalizeGotifyChannelKey(value, fallback = "") {
  const source = String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return source.slice(0, 64);
}

function normalizeGotifyServerUrl(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function normalizeGotifyChannel(value, index = 0) {
  const safeValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  const fallbackKey = safeValue.name || `channel-${index + 1}`;

  return {
    key: normalizeGotifyChannelKey(safeValue.key, fallbackKey),
    name: String(safeValue.name || "").trim().slice(0, 64),
    serverUrl: normalizeGotifyServerUrl(safeValue.serverUrl),
    token: String(safeValue.token || "").trim().slice(0, 512),
    description: String(safeValue.description || "").trim().slice(0, 300),
    enabled: safeValue.enabled !== false,
    priority: clampPriority(safeValue.priority),
  };
}

function normalizeGotifyConfig(value) {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (_error) {
      source = {};
    }
  }

  const safeValue =
    source && typeof source === "object" && !Array.isArray(source)
      ? source
      : {};

  const seenKeys = new Set();
  const channels = [];

  for (const [index, item] of (Array.isArray(safeValue.channels) ? safeValue.channels : []).entries()) {
    const normalized = normalizeGotifyChannel(item, index);

    if (!normalized.key || !normalized.name || !normalized.serverUrl || !normalized.token) {
      continue;
    }

    if (seenKeys.has(normalized.key)) {
      continue;
    }

    seenKeys.add(normalized.key);
    channels.push(normalized);
  }

  return { channels };
}

function serializeGotifyChannel(channel, { includeToken = false } = {}) {
  const base = {
    key: channel.key,
    name: channel.name,
    serverUrl: channel.serverUrl,
    description: channel.description,
    enabled: Boolean(channel.enabled),
    priority: clampPriority(channel.priority),
  };

  if (includeToken) {
    return {
      ...base,
      token: channel.token,
    };
  }

  return base;
}

function serializeGotifyConfig(config, { includeToken = false } = {}) {
  const normalized = normalizeGotifyConfig(config);

  return {
    channels: normalized.channels.map((channel) =>
      serializeGotifyChannel(channel, { includeToken })),
  };
}

async function getGotifyConfig() {
  const row = await cdkPrisma.siteSetting.findUnique({
    where: { key: GOTIFY_SETTINGS_KEY },
  });

  return normalizeGotifyConfig(row?.value || null);
}

async function updateGotifyConfig(payload) {
  const config = normalizeGotifyConfig(payload);

  await cdkPrisma.siteSetting.upsert({
    where: { key: GOTIFY_SETTINGS_KEY },
    update: {
      value: JSON.stringify(config),
    },
    create: {
      key: GOTIFY_SETTINGS_KEY,
      value: JSON.stringify(config),
    },
  });

  return config;
}

async function resolveGotifyChannels(channelKeys, { includeDisabled = false } = {}) {
  const requestedKeys = new Set(normalizeNotificationChannelKeys(channelKeys));

  if (!requestedKeys.size) {
    return [];
  }

  const config = await getGotifyConfig();
  return config.channels.filter((channel) =>
    requestedKeys.has(channel.key) && (includeDisabled || channel.enabled),
  );
}

function summarizeJson(value, maxLength = 1200) {
  if (value == null) {
    return "";
  }

  try {
    const serialized = typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);

    if (serialized.length <= maxLength) {
      return serialized;
    }

    return `${serialized.slice(0, maxLength)}...`;
  } catch (_error) {
    return String(value);
  }
}

function formatTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toISOString();
}

async function postGotifyMessage(channel, payload) {
  const client = createAxiosClient();

  await client.post(
    `${channel.serverUrl}/message`,
    payload,
    {
      params: {
        token: channel.token,
      },
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

async function sendGotifyNotification({ channelKeys, title, message, priority, extras }) {
  const channels = await resolveGotifyChannels(channelKeys);

  if (!channels.length) {
    return {
      requested: normalizeNotificationChannelKeys(channelKeys).length,
      delivered: 0,
      failed: 0,
      results: [],
    };
  }

  const settled = await Promise.allSettled(
    channels.map(async (channel) => {
      await postGotifyMessage(channel, {
        title: String(title || "").trim().slice(0, 160),
        message: String(message || "").trim().slice(0, 6000),
        priority: clampPriority(priority, channel.priority),
        ...(extras ? { extras } : {}),
      });

      return {
        key: channel.key,
        success: true,
      };
    }),
  );

  const results = settled.map((item, index) => {
    const channel = channels[index];
    if (item.status === "fulfilled") {
      return {
        key: channel.key,
        success: true,
      };
    }

    return {
      key: channel.key,
      success: false,
      error: item.reason?.response?.data?.error_description
        || item.reason?.response?.data?.error
        || item.reason?.message
        || "Unknown error",
    };
  });

  return {
    requested: channels.length,
    delivered: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results,
  };
}

function buildScheduledQueueNotification({ schedule, command }) {
  const lines = [
    `任务名称: ${schedule.name}`,
    `节点: ${schedule.node?.name || schedule.nodeId}`,
    `命令: ${schedule.commandType}`,
    `命令 ID: ${command.id}`,
    `触发时间: ${formatTimestamp(schedule.lastQueuedAt || new Date())}`,
    `执行间隔: 每 ${schedule.intervalMinutes} 分钟`,
  ];

  const payloadSummary = summarizeJson(stripNodePayloadMeta(schedule.payload || {}));
  if (payloadSummary) {
    lines.push("");
    lines.push("命令参数:");
    lines.push(payloadSummary);
  }

  return {
    title: `定时任务已触发 · ${schedule.name}`,
    message: lines.join("\n"),
    priority: DEFAULT_GOTIFY_PRIORITY,
  };
}

function buildCommandFinishedNotification(commandRow) {
  const meta = extractNodePayloadMeta(commandRow.payload);
  const lines = [
    `任务名称: ${meta.sourceScheduleName || meta.sourceScheduleId || "未命名定时任务"}`,
    `节点: ${commandRow.node?.name || commandRow.nodeId}`,
    `命令: ${commandRow.commandType}`,
    `命令 ID: ${commandRow.id}`,
    `状态: ${commandRow.status}`,
    `完成时间: ${formatTimestamp(commandRow.finishedAt || new Date())}`,
  ];

  if (commandRow.errorMessage) {
    lines.push(`错误: ${commandRow.errorMessage}`);
  }

  const resultSummary = summarizeJson(commandRow.result);
  if (resultSummary) {
    lines.push("");
    lines.push("执行结果:");
    lines.push(resultSummary);
  }

  return {
    title: `${commandRow.status === "FAILED" ? "定时任务执行失败" : "定时任务执行完成"} · ${meta.sourceScheduleName || commandRow.commandType}`,
    message: lines.join("\n"),
    priority: commandRow.status === "FAILED" ? 8 : DEFAULT_GOTIFY_PRIORITY,
  };
}

async function notifyScheduledCommandQueued(schedule, command) {
  const channelKeys = normalizeNotificationChannelKeys(schedule.notificationChannelKeys);
  if (!channelKeys.length) {
    return null;
  }

  const notification = buildScheduledQueueNotification({ schedule, command });
  return sendGotifyNotification({
    channelKeys,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
  });
}

async function notifyScheduledCommandFinished(commandRow) {
  const meta = extractNodePayloadMeta(commandRow.payload);
  if (!meta.notificationChannelKeys.length || !meta.sourceScheduleId) {
    return null;
  }

  const notification = buildCommandFinishedNotification(commandRow);
  return sendGotifyNotification({
    channelKeys: meta.notificationChannelKeys,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
  });
}

module.exports = {
  DEFAULT_GOTIFY_PRIORITY,
  GOTIFY_SETTINGS_KEY,
  getGotifyConfig,
  normalizeGotifyChannelKey,
  normalizeGotifyConfig,
  notifyScheduledCommandFinished,
  notifyScheduledCommandQueued,
  resolveGotifyChannels,
  sendGotifyNotification,
  serializeGotifyConfig,
  updateGotifyConfig,
  __testables: {
    buildCommandFinishedNotification,
    buildScheduledQueueNotification,
    clampPriority,
    formatTimestamp,
    normalizeGotifyServerUrl,
    summarizeJson,
  },
};
