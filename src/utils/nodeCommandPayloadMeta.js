const INTERNAL_NODE_PAYLOAD_META_KEY = "__kepcsMeta";

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

function attachNodePayloadMeta(payload, meta) {
  const cleanPayload = stripNodePayloadMeta(payload);
  const normalizedMeta = normalizeNodePayloadMeta(meta);

  if (
    !normalizedMeta.notificationChannelKeys.length
    && !normalizedMeta.sourceScheduleId
    && !normalizedMeta.sourceScheduleName
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
  stripNodePayloadMeta,
};
