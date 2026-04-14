const test = require("node:test");
const assert = require("node:assert/strict");

const {
  APP_TIMEZONE,
  DEFAULT_IDLE_RESTART_MONITOR_CONFIG,
  isWithinTimeWindow,
  normalizeIdleRestartMonitorConfigRow,
} = require("../src/services/idleRestartMonitorService");

test("normalizeIdleRestartMonitorConfigRow falls back to defaults for invalid values", () => {
  const config = normalizeIdleRestartMonitorConfigRow({
    enabled: 0,
    check_interval_seconds: -10,
  });

  assert.equal(config.enabled, false);
  assert.equal(config.checkIntervalSeconds, DEFAULT_IDLE_RESTART_MONITOR_CONFIG.checkIntervalSeconds);
  assert.equal(config.timezone, APP_TIMEZONE);
});

test("normalizeIdleRestartMonitorConfigRow keeps valid persisted values", () => {
  const config = normalizeIdleRestartMonitorConfigRow({
    enabled: 1,
    check_interval_seconds: 60,
    created_at: "2026-04-12 01:00:00",
    updated_at: "2026-04-12 02:00:00",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.checkIntervalSeconds, 60);
  assert.equal(config.createdAt, "2026-04-12 01:00:00");
  assert.equal(config.updatedAt, "2026-04-12 02:00:00");
});

test("isWithinTimeWindow supports same-day windows in Asia/Shanghai", () => {
  assert.equal(
    isWithinTimeWindow("02:00", "08:00", new Date("2026-04-12T03:00:00+08:00")),
    true,
  );
  assert.equal(
    isWithinTimeWindow("02:00", "08:00", new Date("2026-04-12T09:00:00+08:00")),
    false,
  );
});

test("isWithinTimeWindow supports cross-midnight windows in Asia/Shanghai", () => {
  assert.equal(
    isWithinTimeWindow("23:00", "06:00", new Date("2026-04-12T23:30:00+08:00")),
    true,
  );
  assert.equal(
    isWithinTimeWindow("23:00", "06:00", new Date("2026-04-13T05:30:00+08:00")),
    true,
  );
  assert.equal(
    isWithinTimeWindow("23:00", "06:00", new Date("2026-04-12T12:00:00+08:00")),
    false,
  );
});

test("isWithinTimeWindow treats same start and end as full-day enabled", () => {
  assert.equal(
    isWithinTimeWindow("00:00", "00:00", new Date("2026-04-12T15:00:00+08:00")),
    true,
  );
});
