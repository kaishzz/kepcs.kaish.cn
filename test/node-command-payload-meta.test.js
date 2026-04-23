const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_NOTIFICATION_SETTINGS,
  attachNodePayloadMeta,
  extractNodePayloadMeta,
  normalizeNotificationChannelKeys,
  normalizeNotificationSettings,
  sanitizeNodeCommandPayload,
  stripNodePayloadMeta,
} = require("../src/utils/nodeCommandPayloadMeta");

test("notification channel keys are trimmed, filtered, and deduplicated", () => {
  assert.deepEqual(
    normalizeNotificationChannelKeys([" ops ", "", "ops", "alerts"]),
    ["ops", "alerts"],
  );
});

test("payload meta can be attached and stripped without polluting command payload", () => {
  const payload = attachNodePayloadMeta(
    {
      command: "status",
      group: "ALL",
    },
    {
      notificationChannelKeys: ["ops", "alerts"],
      notificationSettings: {
        queued: "never",
        finished: "updated_or_failed",
      },
      sourceScheduleId: "schedule-1",
      sourceScheduleName: "每小时检查更新",
      sourceScheduleSummary: "每 1 小时 00:00 - 23:59",
    },
  );

  assert.deepEqual(stripNodePayloadMeta(payload), {
    command: "status",
    group: "ALL",
  });

  assert.deepEqual(extractNodePayloadMeta(payload), {
    notificationChannelKeys: ["ops", "alerts"],
    notificationSettings: {
      queued: "never",
      finished: "updated_or_failed",
    },
    sourceScheduleId: "schedule-1",
    sourceScheduleName: "每小时检查更新",
    sourceScheduleSummary: "每 1 小时 00:00 - 23:59",
    scheduleConfig: null,
  });
});

test("notification settings fall back to defaults when invalid", () => {
  assert.deepEqual(
    normalizeNotificationSettings({
      queued: "unexpected",
      finished: "invalid",
    }),
    DEFAULT_NOTIFICATION_SETTINGS,
  );
});

test("node command payload sanitization keeps target keys and removes rcon secrets", () => {
  const payload = sanitizeNodeCommandPayload({
    command: "status",
    targetMode: "servers",
    targets: [
      { key: "ze_xl_1", password: "secret-1" },
      { key: "ze_xl_2", password: "secret-2" },
      { key: "", password: "ignored" },
    ],
  });

  assert.deepEqual(payload, {
    command: "status",
    targetMode: "servers",
    targets: [{ key: "ze_xl_1" }, { key: "ze_xl_2" }],
    serverKeys: ["ze_xl_1", "ze_xl_2"],
  });
});

test("node command payload sanitization normalizes startup server selections", () => {
  const payload = sanitizeNodeCommandPayload({
    startServerKeys: [" ze_xl_1 ", "ze_pt_1", "ze_xl_1", ""],
  });

  assert.deepEqual(payload, {
    startServerKeys: ["ze_xl_1", "ze_pt_1"],
  });
});
