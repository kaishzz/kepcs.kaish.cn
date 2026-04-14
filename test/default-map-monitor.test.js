const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_MONITOR_CONFIG,
  normalizeMonitorConfigRow,
} = require("../src/services/defaultMapMonitorService");

test("normalizeMonitorConfigRow falls back to defaults for invalid values", () => {
  const config = normalizeMonitorConfigRow({
    enabled: 0,
    check_interval_seconds: -5,
  });

  assert.equal(config.enabled, false);
  assert.equal(config.checkIntervalSeconds, DEFAULT_MONITOR_CONFIG.checkIntervalSeconds);
});

test("normalizeMonitorConfigRow keeps valid persisted values", () => {
  const config = normalizeMonitorConfigRow({
    enabled: 1,
    check_interval_seconds: 30,
    created_at: "2026-04-12 12:00:00",
    updated_at: "2026-04-12 12:30:00",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.checkIntervalSeconds, 30);
  assert.equal(config.createdAt, "2026-04-12 12:00:00");
  assert.equal(config.updatedAt, "2026-04-12 12:30:00");
});
