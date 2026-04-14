const mysql = require("mysql2/promise");
const { env } = require("../config/env");

function formatMySqlDateTime(input) {
  const date = input instanceof Date ? input : new Date(input);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid payment time");
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function createDatabaseUrl(databaseName) {
  const url = new URL(env.databaseUrl.replace(/^mysql:\/\//i, "mysql://"));
  url.pathname = `/${databaseName}`;
  return url;
}

const pools = new Map();

function getPool(databaseName = env.officialWhitelistDatabase) {
  const targetDatabase = String(databaseName || env.officialWhitelistDatabase).trim();

  if (pools.has(targetDatabase)) {
    return pools.get(targetDatabase);
  }

  const dbUrl = createDatabaseUrl(targetDatabase);
  const pool = mysql.createPool({
    host: dbUrl.hostname,
    port: Number(dbUrl.port || 3306),
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.replace(/^\//, ""),
    charset: dbUrl.searchParams.get("charset") || "utf8mb4",
    waitForConnections: true,
    connectionLimit: 5,
  });

  pools.set(targetDatabase, pool);
  return pool;
}

async function findPlayerBySteamId(steamId64, databaseName = env.officialWhitelistDatabase) {
  const [rows] = await getPool(databaseName).execute(
    "SELECT UserID, SteamID, JoinTime, Note FROM kep_player_info WHERE SteamID = ? LIMIT 1",
    [String(steamId64)],
  );

  return rows[0] || null;
}

async function insertPlayerWhitelist({
  steamId64,
  qq,
  note,
  joinTime,
  databaseName = env.officialWhitelistDatabase,
}) {
  const finalNote =
    note != null && String(note).trim()
      ? String(note).trim()
      : `qq${String(qq || "").trim()}`;

  const [result] = await getPool(databaseName).execute(
    "INSERT INTO kep_player_info (SteamID, JoinTime, Note) VALUES (?, ?, ?)",
    [String(steamId64), formatMySqlDateTime(joinTime), finalNote],
  );

  return {
    inserted: true,
    insertId: result.insertId,
    note: finalNote,
    databaseName,
  };
}

async function updatePlayerSteamId({
  oldSteamId64,
  newSteamId64,
  databaseName = env.officialWhitelistDatabase,
}) {
  const pool = getPool(databaseName);
  const safeOldSteamId64 = String(oldSteamId64 || "").trim();
  const safeNewSteamId64 = String(newSteamId64 || "").trim();

  const existingOld = await findPlayerBySteamId(safeOldSteamId64, databaseName);

  if (!existingOld) {
    throw new Error("旧 SteamID64 不存在于白名单中");
  }

  const existingNew = await findPlayerBySteamId(safeNewSteamId64, databaseName);

  if (existingNew) {
    throw new Error("新 SteamID64 已存在于白名单中");
  }

  const [result] = await pool.execute(
    "UPDATE kep_player_info SET SteamID = ? WHERE SteamID = ? LIMIT 1",
    [safeNewSteamId64, safeOldSteamId64],
  );

  return {
    updated: Number(result.affectedRows || 0) > 0,
    affectedRows: Number(result.affectedRows || 0),
    databaseName,
    oldSteamId64: safeOldSteamId64,
    newSteamId64: safeNewSteamId64,
  };
}

module.exports = {
  async closeAllPools() {
    const closeTasks = Array.from(pools.values()).map((pool) => pool.end());
    pools.clear();
    await Promise.allSettled(closeTasks);
  },
  findPlayerBySteamId,
  formatMySqlDateTime,
  getPool,
  insertPlayerWhitelist,
  updatePlayerSteamId,
};
