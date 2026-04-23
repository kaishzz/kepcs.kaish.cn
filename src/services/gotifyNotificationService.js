const { cdkPrisma } = require("../lib/prisma");
const { createAxiosClient } = require("../lib/httpClient");
const {
  DEFAULT_NOTIFICATION_SETTINGS,
  extractNodePayloadMeta,
  normalizeNotificationChannelKeys,
  normalizeNotificationSettings,
  stripNodePayloadMeta,
} = require("../utils/nodeCommandPayloadMeta");
const { describeNodeScheduleConfig, normalizeNodeScheduleConfig } = require("../utils/nodeScheduleConfig");

const GOTIFY_SETTINGS_KEY = "gotify.notifications.config";
const DEFAULT_GOTIFY_PRIORITY = 5;
const GOTIFY_TEMPLATE_EVENT_TYPES = Object.freeze([
  "queued",
  "finished",
]);

const DEFAULT_GOTIFY_CHANNEL_TEMPLATES = Object.freeze({
  queued: Object.freeze({
    title: "",
    message: "",
  }),
  finished: Object.freeze({
    title: "",
    message: "",
  }),
});

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

function normalizeGotifyTemplateText(value, maxLength) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeGotifyChannelTemplates(value) {
  const safeValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  const templates = {};
  for (const eventType of GOTIFY_TEMPLATE_EVENT_TYPES) {
    const eventValue =
      safeValue[eventType] && typeof safeValue[eventType] === "object" && !Array.isArray(safeValue[eventType])
        ? safeValue[eventType]
        : {};

    templates[eventType] = {
      title: normalizeGotifyTemplateText(eventValue.title, 320),
      message: normalizeGotifyTemplateText(eventValue.message, 12000),
    };
  }

  return templates;
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
    templates: normalizeGotifyChannelTemplates(safeValue.templates),
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
    templates: normalizeGotifyChannelTemplates(channel.templates),
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

function buildScheduleSummary(schedule) {
  return schedule.scheduleSummary
    || describeNodeScheduleConfig(
      normalizeNodeScheduleConfig(schedule.scheduleConfig, {
        intervalMinutes: schedule.intervalMinutes,
        nextRunAt: schedule.nextRunAt,
      }),
    );
}

function stringifyTemplateValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return summarizeJson(value, 2000);
}

function resolveTemplatePath(context, path) {
  const segments = String(path || "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  let current = context;
  for (const segment of segments) {
    if (current == null) {
      return "";
    }

    current = current[segment];
  }

  return stringifyTemplateValue(current);
}

function renderGotifyTemplate(template, context) {
  const source = String(template || "");
  if (!source.trim()) {
    return "";
  }

  return source.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, path) =>
    resolveTemplatePath(context, path));
}

function normalizeTemplateResult(renderedValue, fallbackValue, maxLength) {
  const rendered = normalizeGotifyTemplateText(renderedValue, maxLength);
  if (rendered) {
    return rendered;
  }

  return normalizeGotifyTemplateText(fallbackValue, maxLength);
}

function renderChannelNotification(channel, {
  templateEventType,
  context,
  title,
  message,
}) {
  const templates = normalizeGotifyChannelTemplates(channel.templates);
  const eventType = GOTIFY_TEMPLATE_EVENT_TYPES.includes(templateEventType)
    ? templateEventType
    : null;
  const eventTemplates = eventType
    ? templates[eventType]
    : DEFAULT_GOTIFY_CHANNEL_TEMPLATES.finished;

  const renderedTitle = eventType
    ? renderGotifyTemplate(eventTemplates.title, context)
    : "";
  const renderedMessage = eventType
    ? renderGotifyTemplate(eventTemplates.message, context)
    : "";

  return {
    title: normalizeTemplateResult(renderedTitle, title, 160),
    message: normalizeTemplateResult(renderedMessage, message, 6000),
  };
}

function buildBaseTemplateContext({
  event,
  channel,
  priority,
  schedule,
  node,
  command,
  payload,
  result,
  errorMessage,
  resultMessage,
  updated,
  validated,
  needsUpdate,
  previousBuildId,
  currentBuildId,
  latestBuildId,
  queuedAt,
  finishedAt,
}) {
  return {
    event,
    channel: channel
      ? {
          key: channel.key,
          name: channel.name,
        }
      : null,
    notification: {
      event,
      priority: clampPriority(priority),
    },
    schedule,
    node,
    command,
    payload,
    payloadJson: summarizeJson(payload),
    result,
    resultJson: summarizeJson(result),
    resultMessage,
    errorMessage: errorMessage || "",
    updated: Boolean(updated),
    validated: Boolean(validated),
    needsUpdate: Boolean(needsUpdate),
    previousBuildId: previousBuildId || "",
    currentBuildId: currentBuildId || "",
    latestBuildId: latestBuildId || "",
    queuedAt: queuedAt || "",
    finishedAt: finishedAt || "",
    scheduleId: schedule?.id || "",
    scheduleName: schedule?.name || "",
    scheduleSummary: schedule?.summary || "",
    nodeId: node?.id || "",
    nodeName: node?.name || "",
    nodeCode: node?.code || "",
    commandId: command?.id || "",
    commandType: command?.type || "",
    commandStatus: command?.status || "",
  };
}

function buildScheduledQueueTemplateContext({ schedule, command, channel, priority }) {
  const payload = stripNodePayloadMeta(schedule.payload || {});
  const scheduleSummary = buildScheduleSummary(schedule);
  const queuedAt = formatTimestamp(schedule.lastQueuedAt || command.createdAt || new Date());
  const node = schedule.node || command.node || null;

  return buildBaseTemplateContext({
    event: "queued",
    channel,
    priority,
    schedule: {
      id: schedule.id || "",
      name: String(schedule.name || "").trim(),
      summary: scheduleSummary,
      commandType: String(schedule.commandType || command.commandType || "").trim(),
      nextRunAt: schedule.nextRunAt ? formatTimestamp(schedule.nextRunAt) : "",
      lastQueuedAt: queuedAt,
      notificationChannelKeys: normalizeNotificationChannelKeys(schedule.notificationChannelKeys),
      notificationSettings: normalizeNotificationSettings(schedule.notificationSettings),
      isActive: Boolean(schedule.isActive),
    },
    node: node
      ? {
          id: node.id || schedule.nodeId || command.nodeId || "",
          code: node.code || "",
          name: node.name || schedule.nodeId || command.nodeId || "",
          host: node.host || "",
          status: node.status || "",
          isOnline: typeof node.isOnline === "boolean" ? node.isOnline : null,
        }
      : {
          id: schedule.nodeId || command.nodeId || "",
          code: "",
          name: schedule.nodeId || command.nodeId || "",
          host: "",
          status: "",
          isOnline: null,
        },
    command: {
      id: String(command.id || "").trim(),
      type: String(schedule.commandType || command.commandType || "").trim(),
      status: String(command.status || "").trim(),
      createdAt: command.createdAt ? formatTimestamp(command.createdAt) : queuedAt,
      finishedAt: "",
    },
    payload,
    result: null,
    errorMessage: "",
    resultMessage: "",
    updated: false,
    validated: false,
    needsUpdate: false,
    previousBuildId: "",
    currentBuildId: "",
    latestBuildId: "",
    queuedAt,
    finishedAt: "",
  });
}

function buildCommandFinishedTemplateContext(commandRow, channel, priority) {
  const meta = extractNodePayloadMeta(commandRow.payload);
  const payload = stripNodePayloadMeta(commandRow.payload || {});
  const result = commandRow.result && typeof commandRow.result === "object" && !Array.isArray(commandRow.result)
    ? commandRow.result
    : commandRow.result;
  const safeResult = result && typeof result === "object" && !Array.isArray(result)
    ? result
    : {};
  const finishedAt = formatTimestamp(commandRow.finishedAt || new Date());

  return buildBaseTemplateContext({
    event: "finished",
    channel,
    priority,
    schedule: {
      id: meta.sourceScheduleId || "",
      name: meta.sourceScheduleName || meta.sourceScheduleId || "",
      summary: meta.sourceScheduleSummary || "",
      commandType: String(commandRow.commandType || "").trim(),
      nextRunAt: "",
      lastQueuedAt: "",
      notificationChannelKeys: meta.notificationChannelKeys,
      notificationSettings: meta.notificationSettings,
      isActive: null,
    },
    node: commandRow.node
      ? {
          id: commandRow.node.id || commandRow.nodeId || "",
          code: commandRow.node.code || "",
          name: commandRow.node.name || commandRow.nodeId || "",
          host: commandRow.node.host || "",
          status: commandRow.node.status || "",
          isOnline: typeof commandRow.node.isOnline === "boolean" ? commandRow.node.isOnline : null,
        }
      : {
          id: commandRow.nodeId || "",
          code: "",
          name: commandRow.nodeId || "",
          host: "",
          status: "",
          isOnline: null,
        },
    command: {
      id: String(commandRow.id || "").trim(),
      type: String(commandRow.commandType || "").trim(),
      status: String(commandRow.status || "").trim(),
      createdAt: commandRow.createdAt ? formatTimestamp(commandRow.createdAt) : "",
      finishedAt,
    },
    payload,
    result,
    errorMessage: commandRow.errorMessage,
    resultMessage: typeof safeResult.message === "string" ? safeResult.message : "",
    updated: safeResult.updated === true,
    validated: safeResult.validated === true,
    needsUpdate: safeResult.needsUpdate === true,
    previousBuildId: safeResult.previousBuildId,
    currentBuildId: safeResult.currentBuildId,
    latestBuildId: safeResult.latestBuildId,
    queuedAt: "",
    finishedAt,
  });
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

async function sendGotifyNotification({
  channelKeys,
  title,
  message,
  priority,
  extras,
  templateEventType = null,
  buildTemplateContext = null,
}) {
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
      const resolvedPriority = clampPriority(priority, channel.priority);
      const templateContext = typeof buildTemplateContext === "function"
        ? buildTemplateContext(channel, resolvedPriority)
        : null;
      const rendered = renderChannelNotification(channel, {
        templateEventType,
        context: templateContext,
        title,
        message,
      });

      await postGotifyMessage(channel, {
        title: rendered.title,
        message: rendered.message,
        priority: resolvedPriority,
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
  const scheduleSummary = buildScheduleSummary(schedule);
  const lines = [
    `任务名称: ${schedule.name}`,
    `节点: ${schedule.node?.name || schedule.nodeId}`,
    `命令: ${schedule.commandType}`,
    `命令 ID: ${command.id}`,
    `触发时间: ${formatTimestamp(schedule.lastQueuedAt || new Date())}`,
    `执行规则: ${scheduleSummary}`,
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

  if (meta.sourceScheduleSummary) {
    lines.push(`执行规则: ${meta.sourceScheduleSummary}`);
  }

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

function isCommandFailureStatus(status) {
  return status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";
}

function hasUpdatedResult(commandRow) {
  return Boolean(
    commandRow?.result
    && typeof commandRow.result === "object"
    && !Array.isArray(commandRow.result)
    && commandRow.result.updated === true,
  );
}

function shouldSendScheduledQueueNotification(schedule) {
  const settings = normalizeNotificationSettings(schedule.notificationSettings);
  return settings.queued === "always";
}

function shouldSendFinishedNotification(commandRow) {
  const meta = extractNodePayloadMeta(commandRow.payload);
  const settings = normalizeNotificationSettings(meta.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS);
  const succeeded = String(commandRow.status || "").trim() === "SUCCEEDED";
  const failed = isCommandFailureStatus(String(commandRow.status || "").trim());
  const updated = hasUpdatedResult(commandRow);

  switch (settings.finished) {
    case "failure_only":
      return failed;
    case "success_only":
      return succeeded;
    case "updated_only":
      return updated;
    case "updated_or_failed":
      return updated || failed;
    case "always":
    default:
      return true;
  }
}

async function notifyScheduledCommandQueued(schedule, command) {
  const channelKeys = normalizeNotificationChannelKeys(schedule.notificationChannelKeys);
  if (!channelKeys.length) {
    return null;
  }

  if (!shouldSendScheduledQueueNotification(schedule)) {
    return {
      skipped: true,
      reason: "queue_condition",
    };
  }

  const notification = buildScheduledQueueNotification({ schedule, command });
  return sendGotifyNotification({
    channelKeys,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    templateEventType: "queued",
    buildTemplateContext: (channel, resolvedPriority) =>
      buildScheduledQueueTemplateContext({
        schedule,
        command,
        channel,
        priority: resolvedPriority,
      }),
  });
}

async function notifyScheduledCommandFinished(commandRow) {
  const meta = extractNodePayloadMeta(commandRow.payload);
  if (!meta.notificationChannelKeys.length || !meta.sourceScheduleId) {
    return null;
  }

  if (!shouldSendFinishedNotification(commandRow)) {
    return {
      skipped: true,
      reason: "finish_condition",
    };
  }

  const notification = buildCommandFinishedNotification(commandRow);
  return sendGotifyNotification({
    channelKeys: meta.notificationChannelKeys,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    templateEventType: "finished",
    buildTemplateContext: (channel, resolvedPriority) =>
      buildCommandFinishedTemplateContext(commandRow, channel, resolvedPriority),
  });
}

module.exports = {
  DEFAULT_GOTIFY_CHANNEL_TEMPLATES,
  DEFAULT_GOTIFY_PRIORITY,
  GOTIFY_SETTINGS_KEY,
  getGotifyConfig,
  normalizeGotifyChannelKey,
  normalizeGotifyConfig,
  normalizeGotifyChannelTemplates,
  notifyScheduledCommandFinished,
  notifyScheduledCommandQueued,
  renderGotifyTemplate,
  resolveGotifyChannels,
  sendGotifyNotification,
  serializeGotifyConfig,
  updateGotifyConfig,
  __testables: {
    buildCommandFinishedNotification,
    buildCommandFinishedTemplateContext,
    buildScheduledQueueNotification,
    buildScheduledQueueTemplateContext,
    clampPriority,
    formatTimestamp,
    hasUpdatedResult,
    normalizeGotifyServerUrl,
    renderChannelNotification,
    shouldSendFinishedNotification,
    shouldSendScheduledQueueNotification,
    summarizeJson,
  },
};
