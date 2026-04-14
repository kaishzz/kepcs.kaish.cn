const { env } = require("../config/env");
const { getPool } = require("../lib/gameDatabase");
const { getFreshTimedEntry, setTimedEntry } = require("../lib/memoryCache");

const leaderboardCache = new Map();
const leaderboardCacheTtlMs = 15 * 1000;
const MAX_LEADERBOARD_CACHE_ENTRIES = 128;

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "pass" || normalized === "survival") {
    return normalized;
  }

  return "ALL";
}

function normalizeSortDirection(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "asc" || normalized === "desc") {
    return normalized;
  }

  return "default";
}

function createCacheKey({ databaseName, mode, mapName, stage, sortDirection, limit }) {
  return [databaseName, mode, mapName || "", stage || "", sortDirection, limit].join(":");
}

function buildWhereClause({ mode, mapName, stage }) {
  const clauses = [];
  const params = [];

  if (mode !== "ALL") {
    clauses.push("c.Mode = ?");
    params.push(mode);
  }

  if (mapName) {
    clauses.push("c.MapName = ?");
    params.push(mapName);
  }

  if (stage) {
    clauses.push("c.Stage = ?");
    params.push(stage);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function getOrderBySql(mode, sortDirection) {
  if (mode === "survival") {
    if (sortDirection === "asc") {
      return "ORDER BY c.Duration ASC, c.UpdatedAt ASC, c.MapName ASC, c.Stage ASC";
    }

    return "ORDER BY c.Duration DESC, c.UpdatedAt DESC, c.MapName ASC, c.Stage ASC";
  }

  if (mode === "pass") {
    if (sortDirection === "desc") {
      return "ORDER BY c.UpdatedAt DESC, c.MapName ASC, c.Stage ASC";
    }

    return "ORDER BY c.UpdatedAt ASC, c.MapName ASC, c.Stage ASC";
  }

  if (sortDirection === "asc") {
    return `
      ORDER BY
        CASE WHEN c.Mode = 'pass' THEN 0 ELSE 1 END ASC,
        CASE WHEN c.Mode = 'pass' THEN c.UpdatedAt END ASC,
        CASE WHEN c.Mode = 'survival' THEN c.Duration END ASC,
        c.UpdatedAt ASC,
        c.MapName ASC,
        c.Stage ASC
    `;
  }

  if (sortDirection === "desc") {
    return `
      ORDER BY
        CASE WHEN c.Mode = 'survival' THEN 0 ELSE 1 END ASC,
        CASE WHEN c.Mode = 'pass' THEN c.UpdatedAt END DESC,
        CASE WHEN c.Mode = 'survival' THEN c.Duration END DESC,
        c.UpdatedAt DESC,
        c.MapName ASC,
        c.Stage ASC
    `;
  }

  return `
    ORDER BY
      CASE WHEN c.Mode = 'pass' THEN 0 ELSE 1 END ASC,
      CASE WHEN c.Mode = 'pass' THEN c.UpdatedAt END ASC,
      CASE WHEN c.Mode = 'survival' THEN c.Duration END DESC,
      c.UpdatedAt DESC,
      c.MapName ASC,
      c.Stage ASC
  `;
}

function normalizeChallengeRow(row) {
  const steamId = String(row.SteamID || "").trim();
  const name = String(row.Name || "").trim();

  return {
    steamId,
    userId: row.UserID == null ? null : Number(row.UserID),
    name: name || `玩家 ${steamId.slice(-4) || "未知"}`,
    mapName: String(row.MapName || "").trim(),
    stage: String(row.Stage || "").trim(),
    mode: normalizeMode(row.Mode),
    duration: Number(row.Duration || 0),
    updatedAt: toIsoString(row.UpdatedAt),
  };
}

async function fetchMapOptions(pool) {
  const [rows] = await pool.query(
    `
      SELECT DISTINCT MapName
      FROM kep_mapchallenge
      ORDER BY MapName ASC
    `,
  );

  return rows
    .map((row) => String(row.MapName || "").trim())
    .filter(Boolean);
}

async function fetchStageOptions(pool, { mode, mapName }) {
  const { whereSql, params } = buildWhereClause({ mode, mapName });
  const [rows] = await pool.execute(
    `
      SELECT DISTINCT c.MapName, c.Stage
      FROM kep_mapchallenge c
      ${whereSql}
      ORDER BY c.MapName ASC, c.Stage ASC
    `,
    params,
  );

  return rows
    .map((row) => ({
      mapName: String(row.MapName || "").trim(),
      stage: String(row.Stage || "").trim(),
    }))
    .filter((row) => row.stage);
}

async function listAdminMapChallengeRecords({
  mode = "ALL",
  mapName,
  stage,
  steamId,
  limit = 100,
  databaseName = env.officialWhitelistDatabase,
} = {}) {
  const safeMode = normalizeMode(mode);
  const safeMapName = String(mapName || "").trim() || undefined;
  const safeStage = String(stage || "").trim() || undefined;
  const safeSteamId = String(steamId || "").trim() || undefined;
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const pool = getPool(databaseName);
  const clauses = [];
  const params = [];

  if (safeMode !== "ALL") {
    clauses.push("c.Mode = ?");
    params.push(safeMode);
  }

  if (safeMapName) {
    clauses.push("c.MapName = ?");
    params.push(safeMapName);
  }

  if (safeStage) {
    clauses.push("c.Stage = ?");
    params.push(safeStage);
  }

  if (safeSteamId) {
    clauses.push("c.SteamID = ?");
    params.push(safeSteamId);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `
      SELECT
        c.SteamID,
        p.UserID,
        p.Name,
        c.MapName,
        c.Stage,
        c.Mode,
        c.Duration,
        c.UpdatedAt
      FROM kep_mapchallenge c
      LEFT JOIN kep_player_info p
        ON p.SteamID = c.SteamID
      ${whereSql}
      ORDER BY c.UpdatedAt DESC, c.MapName ASC, c.Stage ASC
      LIMIT ${safeLimit}
    `,
    params,
  );

  return rows.map(normalizeChallengeRow);
}

async function getMapChallengeRecord({
  steamId,
  mapName,
  stage,
  mode,
  databaseName = env.officialWhitelistDatabase,
}) {
  const pool = getPool(databaseName);
  const [rows] = await pool.execute(
    `
      SELECT
        c.SteamID,
        p.UserID,
        p.Name,
        c.MapName,
        c.Stage,
        c.Mode,
        c.Duration,
        c.UpdatedAt
      FROM kep_mapchallenge c
      LEFT JOIN kep_player_info p
        ON p.SteamID = c.SteamID
      WHERE c.SteamID = ? AND c.MapName = ? AND c.Stage = ? AND c.Mode = ?
      LIMIT 1
    `,
    [String(steamId), String(mapName), String(stage), String(mode)],
  );

  if (!rows.length) {
    return null;
  }

  return normalizeChallengeRow(rows[0]);
}

async function upsertMapChallengeRecord({
  steamId,
  mapName,
  stage,
  mode,
  duration,
  databaseName = env.officialWhitelistDatabase,
} = {}) {
  const safeMode = normalizeMode(mode);
  const safeDuration = safeMode === "survival" ? Math.max(0, Number(duration) || 0) : 0;
  const pool = getPool(databaseName);
  const lookupPayload = {
    steamId,
    mapName,
    stage,
    mode: safeMode,
    databaseName,
  };

  if (safeMode === "pass") {
    const existingRecord = await getMapChallengeRecord(lookupPayload);

    if (existingRecord) {
      return {
        record: existingRecord,
        skipped: true,
        operation: "skipped_existing_pass",
      };
    }
  }

  if (safeMode === "survival") {
    const existingRecord = await getMapChallengeRecord(lookupPayload);

    if (existingRecord && safeDuration <= Number(existingRecord.duration || 0)) {
      return {
        record: existingRecord,
        skipped: true,
        operation: "skipped_lower_survival",
      };
    }

    await pool.execute(
      `
        INSERT INTO kep_mapchallenge (SteamID, MapName, Stage, Mode, Duration, UpdatedAt)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          Duration = VALUES(Duration),
          UpdatedAt = CURRENT_TIMESTAMP
      `,
      [String(steamId), String(mapName), String(stage), safeMode, safeDuration],
    );
  } else {
    await pool.execute(
      `
        INSERT INTO kep_mapchallenge (SteamID, MapName, Stage, Mode, Duration, UpdatedAt)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          UpdatedAt = CURRENT_TIMESTAMP
      `,
      [String(steamId), String(mapName), String(stage), safeMode, 0],
    );
  }

  return {
    record: await getMapChallengeRecord(lookupPayload),
    skipped: false,
    operation: "upserted",
  };
}

async function listMapChallengeLeaderboard({
  mode = "ALL",
  mapName,
  stage,
  sortDirection = "default",
  limit = 500,
  databaseName = env.officialWhitelistDatabase,
} = {}) {
  const safeMode = normalizeMode(mode);
  const safeMapName = String(mapName || "").trim() || undefined;
  const safeStage = String(stage || "").trim() || undefined;
  const safeSortDirection = normalizeSortDirection(sortDirection);
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 500));
  const cacheKey = createCacheKey({
    databaseName,
    mode: safeMode,
    mapName: safeMapName,
    stage: safeStage,
    sortDirection: safeSortDirection,
    limit: safeLimit,
  });
  const cached = getFreshTimedEntry(leaderboardCache, cacheKey);

  if (cached) {
    return cached.value;
  }

  const pool = getPool(databaseName);
  const { whereSql, params } = buildWhereClause({
    mode: safeMode,
    mapName: safeMapName,
    stage: safeStage,
  });
  const orderBySql = getOrderBySql(safeMode, safeSortDirection);

  const [
    mapOptions,
    stageOptions,
    [summaryRows],
    [recordRows],
  ] = await Promise.all([
    fetchMapOptions(pool),
    fetchStageOptions(pool, { mode: safeMode, mapName: safeMapName }),
    pool.execute(
      `
        SELECT
          COUNT(*) AS recordCount,
          COUNT(DISTINCT c.SteamID) AS playerCount,
          COUNT(DISTINCT c.MapName) AS mapCount,
          SUM(CASE WHEN c.Mode = 'pass' THEN 1 ELSE 0 END) AS passCount,
          SUM(CASE WHEN c.Mode = 'survival' THEN 1 ELSE 0 END) AS survivalCount
        FROM kep_mapchallenge c
        ${whereSql}
      `,
      params,
    ),
    pool.execute(
      `
        SELECT
          c.SteamID,
          p.UserID,
          p.Name,
          c.MapName,
          c.Stage,
          c.Mode,
          c.Duration,
          c.UpdatedAt
        FROM kep_mapchallenge c
        LEFT JOIN kep_player_info p
          ON p.SteamID = c.SteamID
        ${whereSql}
        ${orderBySql}
        LIMIT ${safeLimit}
      `,
      params,
    ),
  ]);

  const payload = {
    filters: {
      selectedMode: safeMode,
      selectedMap: safeMapName || "",
      selectedStage: safeStage || "",
      selectedSortDirection: safeSortDirection,
      mapOptions,
      stageOptions,
    },
    summary: {
      recordCount: Number(summaryRows[0]?.recordCount || 0),
      playerCount: Number(summaryRows[0]?.playerCount || 0),
      mapCount: Number(summaryRows[0]?.mapCount || 0),
      passCount: Number(summaryRows[0]?.passCount || 0),
      survivalCount: Number(summaryRows[0]?.survivalCount || 0),
    },
    records: recordRows.map(normalizeChallengeRow),
  };

  setTimedEntry(leaderboardCache, cacheKey, payload, leaderboardCacheTtlMs, {
    maxEntries: MAX_LEADERBOARD_CACHE_ENTRIES,
  });

  return payload;
}

module.exports = {
  getMapChallengeRecord,
  listAdminMapChallengeRecords,
  listMapChallengeLeaderboard,
  upsertMapChallengeRecord,
};
