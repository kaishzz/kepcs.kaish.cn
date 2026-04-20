const INTERNAL_NODE_PAYLOAD_META_KEY = "__kepcsMeta";
const { normalizeNodeScheduleConfig } = require("./nodeScheduleConfig");

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

function normalizeNodePayloadMeta(value) {
  const meta =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  return {
    notificationChannelKeys: normalizeNotificationChannelKeys(meta.notificationChannelKeys),
    sourceScheduleId: normalizeString(meta.sourceScheduleId, 191) || null,
    sourceScheduleName: normalizeString(meta.sourceScheduleName, 64) || null,
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

function normalizeNodeCommandMonitorServerKey(value) {
  return normalizeString(value, 64) || null;
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

  if (Object.prototype.hasOwnProperty.call(safePayload, "monitorServerKey")) {
    const monitorServerKey = normalizeNodeCommandMonitorServerKey(safePayload.monitorServerKey);
    if (monitorServerKey) {
      safePayload.monitorServerKey = monitorServerKey;
    } else {
      delete safePayload.monitorServerKey;
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

  if (
    !normalizedMeta.notificationChannelKeys.length
    && !normalizedMeta.sourceScheduleId
    && !normalizedMeta.sourceScheduleName
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
  INTERNAL_NODE_PAYLOAD_META_KEY,
  attachNodePayloadMeta,
  extractNodePayloadMeta,
  normalizeNotificationChannelKeys,
  normalizeNodeCommandMonitorServerKey,
  normalizeNodeCommandServerKeys,
  sanitizeNodeCommandPayload,
  stripNodePayloadMeta,
};
