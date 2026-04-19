const SCHEDULE_TIMEZONE = "Asia/Shanghai";
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function getShanghaiDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function formatLocalDateString(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function extractDateFromValue(value, fallback) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return formatLocalDateString(getShanghaiDateParts(date));
}

function extractTimeFromValue(value, fallback) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  const parts = getShanghaiDateParts(date);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function normalizeTimeValue(value, fallback = "00:00") {
  const safeValue = String(value || "").trim();
  return TIME_RE.test(safeValue) ? safeValue : fallback;
}

function normalizeDateValue(value, fallback) {
  const safeValue = String(value || "").trim();
  const match = safeValue.match(DATE_RE);

  if (!match) {
    return fallback;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) {
    return fallback;
  }

  return safeValue;
}

function parseTimeToMinutes(value) {
  const [hour, minute] = normalizeTimeValue(value, "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function startOfShanghaiDay(value = new Date()) {
  const localDate = extractDateFromValue(value, "1970-01-01");
  return buildShanghaiDateTime(localDate, "00:00");
}

function addMinutes(value, minutes) {
  return new Date(value.getTime() + Number(minutes || 0) * 60 * 1000);
}

function addDays(value, days) {
  return new Date(value.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);
}

function buildShanghaiDateTime(dateValue, timeValue) {
  const safeDate = normalizeDateValue(dateValue, "1970-01-01");
  const safeTime = normalizeTimeValue(timeValue, "00:00");
  const [year, month, day] = safeDate.split("-").map(Number);
  const [hour, minute] = safeTime.split(":").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) - SHANGHAI_OFFSET_MS,
  );
}

function computeLegacyScheduleNextRunAt(baseDate, intervalMinutes, now = new Date()) {
  const safeIntervalMinutes = Math.max(1, Number(intervalMinutes) || 1);
  let cursor = baseDate instanceof Date ? new Date(baseDate) : new Date(baseDate);
  const nowTime = now.getTime();

  if (Number.isNaN(cursor.getTime())) {
    cursor = new Date(nowTime + safeIntervalMinutes * 60 * 1000);
  }

  while (cursor.getTime() <= nowTime) {
    cursor = new Date(cursor.getTime() + safeIntervalMinutes * 60 * 1000);
  }

  return cursor;
}

function scheduleConfigToLegacyIntervalMinutes(config, fallback = 60) {
  const safeConfig = config && typeof config === "object" && !Array.isArray(config)
    ? config
    : {};

  switch (safeConfig.type) {
    case "daily":
      return 24 * 60;
    case "every_n_days":
      return clampInt(safeConfig.intervalDays, 1, 1, 365) * 24 * 60;
    case "every_n_hours":
      return clampInt(safeConfig.intervalHours, 1, 1, 168) * 60;
    case "interval_minutes":
    default:
      return clampInt(safeConfig.intervalMinutes, clampInt(fallback, 60, 1, 10080), 1, 10080);
  }
}

function normalizeNodeScheduleConfig(value, fallback = {}) {
  const safeValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  const fallbackIntervalMinutes = clampInt(fallback.intervalMinutes, 60, 1, 10080);
  const fallbackDate = normalizeDateValue(
    fallback.anchorDate,
    extractDateFromValue(fallback.nextRunAt, extractDateFromValue(new Date(), "1970-01-01")),
  );
  const fallbackTime = normalizeTimeValue(
    fallback.time,
    extractTimeFromValue(fallback.nextRunAt, "03:00"),
  );
  const type = String(safeValue.type || "").trim();

  switch (type) {
    case "daily":
      return {
        type: "daily",
        time: normalizeTimeValue(safeValue.time, fallbackTime),
        timezone: SCHEDULE_TIMEZONE,
      };
    case "every_n_days":
      return {
        type: "every_n_days",
        intervalDays: clampInt(safeValue.intervalDays, 1, 1, 365),
        anchorDate: normalizeDateValue(safeValue.anchorDate, fallbackDate),
        time: normalizeTimeValue(safeValue.time, fallbackTime),
        timezone: SCHEDULE_TIMEZONE,
      };
    case "every_n_hours":
      return {
        type: "every_n_hours",
        intervalHours: clampInt(safeValue.intervalHours, 1, 1, 168),
        windowStart: normalizeTimeValue(safeValue.windowStart, "00:00"),
        windowEnd: normalizeTimeValue(safeValue.windowEnd, "23:59"),
        timezone: SCHEDULE_TIMEZONE,
      };
    case "interval_minutes":
    default:
      return {
        type: "interval_minutes",
        intervalMinutes: clampInt(
          safeValue.intervalMinutes,
          fallbackIntervalMinutes,
          1,
          10080,
        ),
        timezone: SCHEDULE_TIMEZONE,
      };
  }
}

function describeNodeScheduleConfig(config) {
  const safeConfig = normalizeNodeScheduleConfig(config);

  switch (safeConfig.type) {
    case "daily":
      return `每天 ${safeConfig.time}`;
    case "every_n_days":
      return `每 ${safeConfig.intervalDays} 天 ${safeConfig.time}`;
    case "every_n_hours":
      return `每 ${safeConfig.intervalHours} 小时 ${safeConfig.windowStart} - ${safeConfig.windowEnd}`;
    case "interval_minutes":
    default:
      if (safeConfig.intervalMinutes % 1440 === 0) {
        return `每 ${safeConfig.intervalMinutes / 1440} 天`;
      }

      if (safeConfig.intervalMinutes % 60 === 0) {
        return `每 ${safeConfig.intervalMinutes / 60} 小时`;
      }

      return `每 ${safeConfig.intervalMinutes} 分钟`;
  }
}

function resolveDailyNextRunAt(config, now) {
  const today = extractDateFromValue(now, "1970-01-01");
  let candidate = buildShanghaiDateTime(today, config.time);

  if (candidate.getTime() <= now.getTime()) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

function resolveEveryNDaysNextRunAt(config, now) {
  let candidate = buildShanghaiDateTime(config.anchorDate, config.time);

  while (candidate.getTime() <= now.getTime()) {
    candidate = addDays(candidate, config.intervalDays);
  }

  return candidate;
}

function resolveHourlyWindowBounds(dayStart, config) {
  const startMinutes = parseTimeToMinutes(config.windowStart);
  const endMinutes = parseTimeToMinutes(config.windowEnd);
  const start = addMinutes(dayStart, startMinutes);
  let end = addMinutes(dayStart, endMinutes);

  if (startMinutes === endMinutes) {
    end = addDays(start, 1);
  } else if (endMinutes < startMinutes) {
    end = addDays(end, 1);
  }

  return { start, end };
}

function resolveEveryNHoursNextRunAt(config, now) {
  const intervalMs = config.intervalHours * 60 * 60 * 1000;
  let dayCursor = addDays(startOfShanghaiDay(now), -1);

  for (let index = 0; index < 370; index += 1) {
    const { start, end } = resolveHourlyWindowBounds(dayCursor, config);
    let candidate = new Date(start);

    while (candidate.getTime() <= now.getTime()) {
      candidate = new Date(candidate.getTime() + intervalMs);
    }

    if (candidate.getTime() <= end.getTime()) {
      return candidate;
    }

    dayCursor = addDays(dayCursor, 1);
  }

  return new Date(now.getTime() + intervalMs);
}

function resolveNextNodeScheduleRunAt({ scheduleConfig, intervalMinutes, baseDate }, now = new Date()) {
  const normalizedConfig = normalizeNodeScheduleConfig(scheduleConfig, {
    intervalMinutes,
    nextRunAt: baseDate,
  });

  switch (normalizedConfig.type) {
    case "daily":
      return resolveDailyNextRunAt(normalizedConfig, now);
    case "every_n_days":
      return resolveEveryNDaysNextRunAt(normalizedConfig, now);
    case "every_n_hours":
      return resolveEveryNHoursNextRunAt(normalizedConfig, now);
    case "interval_minutes":
    default:
      return computeLegacyScheduleNextRunAt(baseDate, normalizedConfig.intervalMinutes, now);
  }
}

module.exports = {
  SCHEDULE_TIMEZONE,
  computeLegacyScheduleNextRunAt,
  describeNodeScheduleConfig,
  normalizeNodeScheduleConfig,
  resolveNextNodeScheduleRunAt,
  scheduleConfigToLegacyIntervalMinutes,
  __testables: {
    addDays,
    addMinutes,
    buildShanghaiDateTime,
    extractDateFromValue,
    extractTimeFromValue,
    parseTimeToMinutes,
    resolveHourlyWindowBounds,
    startOfShanghaiDay,
  },
};
