const test = require("node:test");
const assert = require("node:assert/strict");

const {
  describeNodeScheduleConfig,
  normalizeNodeScheduleConfig,
  resolveNextNodeScheduleRunAt,
  scheduleConfigToLegacyIntervalMinutes,
} = require("../src/utils/nodeScheduleConfig");

test("normalizeNodeScheduleConfig falls back to legacy minute interval", () => {
  const config = normalizeNodeScheduleConfig(null, {
    intervalMinutes: 90,
  });

  assert.deepEqual(config, {
    type: "interval_minutes",
    intervalMinutes: 90,
    timezone: "Asia/Shanghai",
  });
});

test("describeNodeScheduleConfig formats fixed daily schedules", () => {
  assert.equal(
    describeNodeScheduleConfig({
      type: "daily",
      time: "03:30",
    }),
    "每天 03:30",
  );
});

test("resolveNextNodeScheduleRunAt supports daily fixed-time schedules", () => {
  const nextRunAt = resolveNextNodeScheduleRunAt(
    {
      scheduleConfig: {
        type: "daily",
        time: "03:30",
      },
    },
    new Date("2026-04-19T18:00:00.000Z"),
  );

  assert.equal(nextRunAt.toISOString(), "2026-04-19T19:30:00.000Z");
});

test("resolveNextNodeScheduleRunAt supports every N days with an anchor date", () => {
  const nextRunAt = resolveNextNodeScheduleRunAt(
    {
      scheduleConfig: {
        type: "every_n_days",
        intervalDays: 2,
        anchorDate: "2026-04-20",
        time: "03:30",
      },
    },
    new Date("2026-04-21T20:00:00.000Z"),
  );

  assert.equal(nextRunAt.toISOString(), "2026-04-23T19:30:00.000Z");
});

test("resolveNextNodeScheduleRunAt supports every N hours within a same-day window", () => {
  const nextRunAt = resolveNextNodeScheduleRunAt(
    {
      scheduleConfig: {
        type: "every_n_hours",
        intervalHours: 2,
        windowStart: "01:30",
        windowEnd: "07:30",
      },
    },
    new Date("2026-04-19T18:00:00.000Z"),
  );

  assert.equal(nextRunAt.toISOString(), "2026-04-19T19:30:00.000Z");
});

test("resolveNextNodeScheduleRunAt supports every N hours across midnight windows", () => {
  const nextRunAt = resolveNextNodeScheduleRunAt(
    {
      scheduleConfig: {
        type: "every_n_hours",
        intervalHours: 2,
        windowStart: "22:00",
        windowEnd: "04:00",
      },
    },
    new Date("2026-04-19T17:00:00.000Z"),
  );

  assert.equal(nextRunAt.toISOString(), "2026-04-19T18:00:00.000Z");
});

test("scheduleConfigToLegacyIntervalMinutes derives a sortable interval for richer schedules", () => {
  assert.equal(
    scheduleConfigToLegacyIntervalMinutes({
      type: "every_n_days",
      intervalDays: 3,
    }),
    4320,
  );
});
