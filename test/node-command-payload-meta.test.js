const test = require("node:test");
const assert = require("node:assert/strict");

const {
  attachNodePayloadMeta,
  extractNodePayloadMeta,
  normalizeNotificationChannelKeys,
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
  });
});
