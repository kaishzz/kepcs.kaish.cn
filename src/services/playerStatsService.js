const { env } = require("../config/env");
const { getPool } = require("../lib/gameDatabase");
const { getFreshTimedEntry, setTimedEntry } = require("../lib/memoryCache");

const statsCache = new Map();
const statsCacheTtlMs = 30 * 1000;
const MAX_STATS_CACHE_ENTRIES = 32;

function toShanghaiDateString(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function shiftDate(dateString, offsetDays) {
  const base = new Date(`${dateString}T00:00:00+08:00`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return toShanghaiDateString(base);
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePlayerRow(row) {
  if (!row) {
    return null;
  }

  return {
    userId: Number(row.UserID),
    name: String(row.Name || "").trim() || `玩家 ${row.UserID}`,
    steamId: String(row.SteamID || ""),
    joinTime: toIsoString(row.JoinTime),
    totalPlayTime: Number(row.PlayTime || 0),
    lastSeen: toIsoString(row.LastSeen),
    note: row.Note == null ? null : String(row.Note),
    memberOpenId: row.member_openid == null ? null : String(row.member_openid),
    bindingStatus: row.member_openid ? "已绑定" : "QQ群机器人，未绑定",
    todayPlayTime: Number(row.TodayPlayTime || 0),
  };
}

function normalizeChallengeRow(row) {
  if (!row) {
    return null;
  }

  return {
    mapName: String(row.MapName || "").trim(),
    stage: String(row.Stage || "").trim(),
    mode: String(row.Mode || "").trim().toLowerCase() === "survival" ? "survival" : "pass",
    duration: Number(row.Duration || 0),
    updatedAt: toIsoString(row.UpdatedAt),
  };
}

async function listPlayerChallengeRecords({ steamId, databaseName = env.officialWhitelistDatabase }) {
  const safeSteamId = String(steamId || "").trim();

  if (!safeSteamId) {
    return [];
  }

  const pool = getPool(databaseName);
  const [rows] = await pool.execute(
    `
      SELECT
        MapName,
        Stage,
        Mode,
        Duration,
        UpdatedAt
      FROM kep_mapchallenge
      WHERE SteamID = ?
      ORDER BY UpdatedAt DESC, MapName ASC, Stage ASC
    `,
    [safeSteamId],
  );

  return rows.map(normalizeChallengeRow).filter(Boolean);
}

async function findPlayerProfile({ userId, steamId, databaseName = env.officialWhitelistDatabase }) {
  const pool = getPool(databaseName);
  const todayDate = toShanghaiDateString();
  const whereClauses = [];
  const params = [todayDate];

  if (userId != null) {
    whereClauses.push("p.UserID = ?");
    params.push(Number(userId));
  }

  if (steamId) {
    whereClauses.push("p.SteamID = ?");
    params.push(String(steamId));
  }

  if (!whereClauses.length) {
    return null;
  }

  const [rows] = await pool.execute(
    `
      SELECT
        p.UserID,
        p.Name,
        p.SteamID,
        p.JoinTime,
        p.PlayTime,
        p.LastSeen,
        p.Note,
        p.member_openid,
        COALESCE(d.PlayTime, 0) AS TodayPlayTime
      FROM kep_player_info p
      LEFT JOIN kep_daily_playtime d
        ON d.SteamID = p.SteamID
       AND d.PlayDate = ?
      WHERE ${whereClauses.join(" OR ")}
      LIMIT 1
    `,
    params,
  );

  const player = normalizePlayerRow(rows[0] || null);

  if (!player?.steamId) {
    return null;
  }

  const challengeRecords = await listPlayerChallengeRecords({
    steamId: player.steamId,
    databaseName,
  });

  return {
    ...player,
    challengeRecords,
  };
}

async function fetchPlayerStats({ limit = 5000, databaseName = env.officialWhitelistDatabase } = {}) {
  const pool = getPool(databaseName);
  const todayDate = toShanghaiDateString();
  const startDate = shiftDate(todayDate, -6);
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 5000));
  const cacheKey = `${databaseName}:${safeLimit}`;
  const cached = getFreshTimedEntry(statsCache, cacheKey);

  if (cached) {
    return cached.value;
  }

  const [
    [todayActiveRows],
    [last7Rows],
    [todayTotalRows],
    [totalPlayerRows],
    [trendRows],
    [rankingRows],
  ] = await Promise.all([
    pool.execute(
      "SELECT COUNT(DISTINCT SteamID) AS count FROM kep_daily_playtime WHERE PlayDate = ?",
      [todayDate],
    ),
    pool.execute(
      "SELECT COUNT(DISTINCT SteamID) AS count FROM kep_daily_playtime WHERE PlayDate BETWEEN ? AND ?",
      [startDate, todayDate],
    ),
    pool.execute(
      "SELECT COALESCE(SUM(PlayTime), 0) AS total FROM kep_daily_playtime WHERE PlayDate = ?",
      [todayDate],
    ),
    pool.execute("SELECT COUNT(*) AS count FROM kep_player_info"),
    pool.execute(
      `
        SELECT
          PlayDate,
          COUNT(DISTINCT SteamID) AS ActivePlayers,
          COALESCE(SUM(PlayTime), 0) AS TotalPlayTime
        FROM kep_daily_playtime
        WHERE PlayDate BETWEEN ? AND ?
        GROUP BY PlayDate
        ORDER BY PlayDate ASC
      `,
      [startDate, todayDate],
    ),
    pool.query(
      `
        SELECT
          p.UserID,
          p.Name,
          p.SteamID,
          p.JoinTime,
          p.PlayTime,
          p.LastSeen,
          p.Note,
          p.member_openid,
          d.PlayTime AS TodayPlayTime
        FROM kep_daily_playtime d
        LEFT JOIN kep_player_info p
          ON p.SteamID = d.SteamID
        WHERE d.PlayDate = ?
        ORDER BY d.PlayTime DESC, p.PlayTime DESC, p.LastSeen DESC
        LIMIT ${safeLimit}
      `,
      [todayDate],
    ),
  ]);

  const trendMap = new Map(
    trendRows.map((row) => [
      toShanghaiDateString(row.PlayDate),
      {
        activePlayers: Number(row.ActivePlayers || 0),
        totalPlayTime: Number(row.TotalPlayTime || 0),
      },
    ]),
  );

  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(startDate, index);
    const item = trendMap.get(date) || { activePlayers: 0, totalPlayTime: 0 };

    return {
      date,
      activePlayers: item.activePlayers,
      totalPlayTime: item.totalPlayTime,
    };
  });

  const payload = {
    todayDate,
    todayActivePlayers: Number(todayActiveRows[0]?.count || 0),
    last7DaysActivePlayers: Number(last7Rows[0]?.count || 0),
    totalPlayers: Number(totalPlayerRows[0]?.count || 0),
    todayTotalPlayTime: Number(todayTotalRows[0]?.total || 0),
    trend,
    todayRanking: rankingRows.map(normalizePlayerRow).filter(Boolean),
  };

  setTimedEntry(statsCache, cacheKey, payload, statsCacheTtlMs, {
    maxEntries: MAX_STATS_CACHE_ENTRIES,
  });

  return payload;
}

module.exports = {
  fetchPlayerStats,
  findPlayerProfile,
  toShanghaiDateString,
};
