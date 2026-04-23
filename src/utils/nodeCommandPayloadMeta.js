const INTERNAL_NODE_PAYLOAD_META_KEY = "__kepcsMeta";
const { normalizeNodeScheduleConfig } = require("./nodeScheduleConfig");

const NOTIFICATION_QUEUE_MODES = Object.freeze([
  "always",
  "never",
]);

const NOTIFICATION_FINISH_MODES = Object.freeze([
  "always",
  "failure_only",
  "success_only",
  "updated_only",
  "updated_or_failed",
]);

const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  queued: "always",
  finished: "always",
});

function sanitizeJsonRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  try {
    const cloned = JSON.parse(JSON.stringify(value));
    return cloned && typeof cloned === "object" && !Array.isArray(cloned)
      ? cloned
      : {};
  } catch (_error) {
    return {};
  }
}

function normalizeString(value, maxLength = 191) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeNotificationChannelKeys(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeString(value, 64))
        .filter(Boolean),
    ),
  );
}

function normalizeNotificationSettings(value) {
  const safeValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  const queued = NOTIFICATION_QUEUE_MODES.includes(safeValue.queued)
    ? safeValue.queued
    : DEFAULT_NOTIFICATION_SETTINGS.queued;
  const finished = NOTIFICATION_FINISH_MODES.includes(safeValue.finished)
    ? safeValue.finished
    : DEFAULT_NOTIFICATION_SETTINGS.finished;

  return {
    queued,
    finished,
  };
}

function normalizeNodePayloadMeta(value) {
  const meta =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  return {
    notificationChannelKeys: normalizeNotificationChannelKeys(meta.notificationChannelKeys),
    notificationSettings: normalizeNotificationSettings(meta.notificationSettings),
    sourceScheduleId: normalizeString(meta.sourceScheduleId, 191) || null,
    sourceScheduleName: normalizeString(meta.sourceScheduleName, 64) || null,
    sourceScheduleSummary: normalizeString(meta.sourceScheduleSummary, 191) || null,
    scheduleConfig: meta.scheduleConfig ? normalizeNodeScheduleConfig(meta.scheduleConfig) : null,
  };
}

function extractNodePayloadMeta(payload) {
  const safePayload = sanitizeJsonRecord(payload);
  return normalizeNodePayloadMeta(safePayload[INTERNAL_NODE_PAYLOAD_META_KEY]);
}

function stripNodePayloadMeta(payload) {
  const safePayload = sanitizeJsonRecord(payload);
  delete safePayload[INTERNAL_NODE_PAYLOAD_META_KEY];
  return safePayload;
}

function normalizeNodeCommandServerKeys(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeString(value, 64))
        .filter(Boolean),
    ),
  );
}

function sanitizeNodeCommandTargets(targets) {
  return (Array.isArray(targets) ? targets : [])
    .map((target) => {
      if (!target || typeof target !== "object" || Array.isArray(target)) {
        return null;
      }

      const key = normalizeString(target.key, 64);
      if (!key) {
        return null;
      }

      return { key };
    })
    .filter(Boolean);
}

function sanitizeNodeCommandPayload(payload) {
  const safePayload = stripNodePayloadMeta(payload);

  if (Array.isArray(safePayload.serverKeys)) {
    safePayload.serverKeys = normalizeNodeCommandServerKeys(safePayload.serverKeys);
  }

  if (Array.isArray(safePayload.startServerKeys)) {
    const normalizedStartServerKeys = normalizeNodeCommandServerKeys(safePayload.startServerKeys);
    if (normalizedStartServerKeys.length) {
      safePayload.startServerKeys = normalizedStartServerKeys;
    } else {
      delete safePayload.startServerKeys;
    }
  }

  if (Array.isArray(safePayload.targets)) {
    const sanitizedTargets = sanitizeNodeCommandTargets(safePayload.targets);

    if (sanitizedTargets.length) {
      safePayload.targets = sanitizedTargets;

      if (!Array.isArray(safePayload.serverKeys) || !safePayload.serverKeys.length) {
        safePayload.serverKeys = sanitizedTargets.map((target) => target.key);
      }
    } else {
      delete safePayload.targets;
    }
  }

  if (Object.prototype.hasOwnProperty.call(safePayload, "rconPassword")) {
    safePayload.hasRconPassword = Boolean(normalizeString(safePayload.rconPassword, 256));
    delete safePayload.rconPassword;
  }

  return safePayload;
}

function attachNodePayloadMeta(payload, meta) {
  const cleanPayload = stripNodePayloadMeta(payload);
  const normalizedMeta = normalizeNodePayloadMeta(meta);
  const hasNonDefaultNotificationSettings =
    normalizedMeta.notificationSettings.queued !== DEFAULT_NOTIFICATION_SETTINGS.queued
    || normalizedMeta.notificationSettings.finished !== DEFAULT_NOTIFICATION_SETTINGS.finished;

  if (
    !normalizedMeta.notificationChannelKeys.length
    && !hasNonDefaultNotificationSettings
    && !normalizedMeta.sourceScheduleId
    && !normalizedMeta.sourceScheduleName
    && !normalizedMeta.sourceScheduleSummary
    && !normalizedMeta.scheduleConfig
  ) {
    return cleanPayload;
  }

  return {
    ...cleanPayload,
    [INTERNAL_NODE_PAYLOAD_META_KEY]: normalizedMeta,
  };
}

module.exports = {
  DEFAULT_NOTIFICATION_SETTINGS,
  INTERNAL_NODE_PAYLOAD_META_KEY,
  NOTIFICATION_FINISH_MODES,
  NOTIFICATION_QUEUE_MODES,
  attachNodePayloadMeta,
  extractNodePayloadMeta,
  normalizeNotificationChannelKeys,
  normalizeNotificationSettings,
  normalizeNodeCommandServerKeys,
  sanitizeNodeCommandPayload,
  stripNodePayloadMeta,
};
