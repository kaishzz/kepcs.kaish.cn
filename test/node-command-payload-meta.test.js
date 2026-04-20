const test = require("node:test");
const assert = require("node:assert/strict");

const {
  attachNodePayloadMeta,
  extractNodePayloadMeta,
  normalizeNotificationChannelKeys,
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
      sourceScheduleId: "schedule-1",
      sourceScheduleName: "每小时检查更新",
    },
  );

  assert.deepEqual(stripNodePayloadMeta(payload), {
    command: "status",
    group: "ALL",
  });

  assert.deepEqual(extractNodePayloadMeta(payload), {
    notificationChannelKeys: ["ops", "alerts"],
    sourceScheduleId: "schedule-1",
    sourceScheduleName: "每小时检查更新",
    scheduleConfig: null,
  });
});

test("node command payload sanitization keeps target keys and removes rcon secrets", () => {
  const payload = sanitizeNodeCommandPayload({
    command: "status",
    targetMode: "servers",
    targets: [
      { key: "xl1", password: "secret-1" },
      { key: "xl2", password: "secret-2" },
      { key: "", password: "ignored" },
    ],
  });

  assert.deepEqual(payload, {
    command: "status",
    targetMode: "servers",
    targets: [{ key: "xl1" }, { key: "xl2" }],
    serverKeys: ["xl1", "xl2"],
  });
});

test("node command payload sanitization normalizes monitor and startup server selections", () => {
  const payload = sanitizeNodeCommandPayload({
    monitorServerKey: " ks ",
    startServerKeys: [" xl1 ", "pt1", "xl1", ""],
  });

  assert.deepEqual(payload, {
    monitorServerKey: "ks",
    startServerKeys: ["xl1", "pt1"],
  });
});
