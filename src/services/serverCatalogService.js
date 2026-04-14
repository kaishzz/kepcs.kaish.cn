const { getServerCatalogPool } = require("../lib/serverCatalogDatabase");

const DEFAULT_MAP_IDLE_THRESHOLD_SECONDS = 300;
const DEFAULT_IDLE_RESTART_WINDOW_START = "02:00";
const DEFAULT_IDLE_RESTART_WINDOW_END = "08:00";
const DEFAULT_IDLE_RESTART_THRESHOLD_SECONDS = 300;
const DEFAULT_IDLE_RESTART_COOLDOWN_SECONDS = 1800;

const KEPCS_SERVER_SELECT_FIELDS = [
  "id",
  "shotid",
  "mode",
  "name",
  "host",
  "port",
  "rcon_pwd",
  "default_map",
  "default_map_id",
  "is_active",
  "default_map_monitor_enabled",
  "default_map_idle_threshold_seconds",
  "idle_restart_enabled",
  "idle_restart_window_start",
  "idle_restart_window_end",
  "idle_restart_threshold_seconds",
  "idle_restart_cooldown_seconds",
].join(", ");

function normalizeBoolean(value) {
  return Boolean(value);
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTimeValue(value, fallback) {
  const safeValue = String(value || "").trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(safeValue) ? safeValue : fallback;
}

function normalizeKepcsServer(row, { includeSecrets = false } = {}) {
  const normalized = {
    id: String(row?.id ?? ""),
    shotId: String(row?.shotid || row?.shotId || ""),
    mode: String(row?.mode || ""),
    name: String(row?.name || ""),
    host: String(row?.host || ""),
    port: normalizeNumber(row?.port, 0),
    defaultMap: String(row?.default_map || row?.defaultMap || ""),
    defaultMapId: String(row?.default_map_id || row?.defaultMapId || ""),
    hasRconPassword: Boolean(String(row?.rcon_pwd || row?.rconPassword || "").trim()),
    isActive: normalizeBoolean(row?.is_active ?? row?.isActive),
    defaultMapMonitorEnabled: normalizeBoolean(
      row?.default_map_monitor_enabled ?? row?.defaultMapMonitorEnabled,
    ),
    defaultMapIdleThresholdSeconds: normalizePositiveInt(
      row?.default_map_idle_threshold_seconds ?? row?.defaultMapIdleThresholdSeconds,
      DEFAULT_MAP_IDLE_THRESHOLD_SECONDS,
    ),
    idleRestartEnabled: normalizeBoolean(
      row?.idle_restart_enabled ?? row?.idleRestartEnabled,
    ),
    idleRestartWindowStart: normalizeTimeValue(
      row?.idle_restart_window_start ?? row?.idleRestartWindowStart,
      DEFAULT_IDLE_RESTART_WINDOW_START,
    ),
    idleRestartWindowEnd: normalizeTimeValue(
      row?.idle_restart_window_end ?? row?.idleRestartWindowEnd,
      DEFAULT_IDLE_RESTART_WINDOW_END,
    ),
    idleRestartThresholdSeconds: normalizePositiveInt(
      row?.idle_restart_threshold_seconds ?? row?.idleRestartThresholdSeconds,
      DEFAULT_IDLE_RESTART_THRESHOLD_SECONDS,
    ),
    idleRestartCooldownSeconds: normalizePositiveInt(
      row?.idle_restart_cooldown_seconds ?? row?.idleRestartCooldownSeconds,
      DEFAULT_IDLE_RESTART_COOLDOWN_SECONDS,
    ),
  };

  if (includeSecrets) {
    normalized.rconPassword = String(row?.rcon_pwd || row?.rconPassword || "").trim() || null;
  }

  return normalized;
}

function normalizeCommunityServer(row) {
  return {
    id: String(row?.id ?? ""),
    community: String(row?.community || ""),
    name: String(row?.name || ""),
    host: String(row?.host || ""),
    port: normalizeNumber(row?.port, 0),
    sortOrder: normalizeNumber(row?.sort_order ?? row?.sortOrder, 0),
    isActive: normalizeBoolean(row?.is_active ?? row?.isActive),
  };
}

async function findKepcsServerById(id, options = {}) {
  const pool = getServerCatalogPool();
  const [rows] = await pool.execute(
    `
      SELECT ${KEPCS_SERVER_SELECT_FIELDS}
      FROM servers
      WHERE id = ?
      LIMIT 1
    `,
    [Number(id)],
  );

  if (!rows.length) {
    throw new Error("Server not found");
  }

  return normalizeKepcsServer(rows[0], options);
}

async function findCommunityServerById(id) {
  const pool = getServerCatalogPool();
  const [rows] = await pool.execute(
    `
      SELECT id, community, name, host, port, sort_order, is_active
      FROM community_servers
      WHERE id = ?
      LIMIT 1
    `,
    [Number(id)],
  );

  if (!rows.length) {
    throw new Error("Community server not found");
  }

  return normalizeCommunityServer(rows[0]);
}

async function listKepcsServers({ includeSecrets = false, activeOnly = false } = {}) {
  const pool = getServerCatalogPool();
  const conditions = [];
  const values = [];

  if (activeOnly) {
    conditions.push("is_active = 1");
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
      SELECT ${KEPCS_SERVER_SELECT_FIELDS}
      FROM servers
      ${whereClause}
      ORDER BY id ASC
    `,
    values,
  );

  return rows.map((row) => normalizeKepcsServer(row, { includeSecrets }));
}

async function createKepcsServer(payload) {
  const pool = getServerCatalogPool();
  const [result] = await pool.execute(
    `
      INSERT INTO servers (
        shotid,
        name,
        host,
        port,
        mode,
        rcon_pwd,
        default_map,
        default_map_id,
        is_active,
        default_map_monitor_enabled,
        default_map_idle_threshold_seconds,
        idle_restart_enabled,
        idle_restart_window_start,
        idle_restart_window_end,
        idle_restart_threshold_seconds,
        idle_restart_cooldown_seconds
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      String(payload.shotid || "").trim(),
      String(payload.name || "").trim(),
      String(payload.host || "").trim(),
      Number(payload.port),
      String(payload.mode || "").trim(),
      String(payload.rcon_pwd || "").trim() || null,
      String(payload.default_map || "").trim(),
      String(payload.default_map_id || "").trim(),
      payload.is_active ? 1 : 0,
      payload.default_map_monitor_enabled ? 1 : 0,
      normalizePositiveInt(
        payload.default_map_idle_threshold_seconds,
        DEFAULT_MAP_IDLE_THRESHOLD_SECONDS,
      ),
      payload.idle_restart_enabled ? 1 : 0,
      normalizeTimeValue(
        payload.idle_restart_window_start,
        DEFAULT_IDLE_RESTART_WINDOW_START,
      ),
      normalizeTimeValue(
        payload.idle_restart_window_end,
        DEFAULT_IDLE_RESTART_WINDOW_END,
      ),
      normalizePositiveInt(
        payload.idle_restart_threshold_seconds,
        DEFAULT_IDLE_RESTART_THRESHOLD_SECONDS,
      ),
      normalizePositiveInt(
        payload.idle_restart_cooldown_seconds,
        DEFAULT_IDLE_RESTART_COOLDOWN_SECONDS,
      ),
    ],
  );

  return await findKepcsServerById(result.insertId);
}

async function updateKepcsServer(id, payload) {
  const assignments = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, "shotid")) {
    assignments.push("shotid = ?");
    values.push(String(payload.shotid || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "mode")) {
    assignments.push("mode = ?");
    values.push(String(payload.mode || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    assignments.push("name = ?");
    values.push(String(payload.name || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "host")) {
    assignments.push("host = ?");
    values.push(String(payload.host || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "port")) {
    assignments.push("port = ?");
    values.push(Number(payload.port));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "rcon_pwd")) {
    assignments.push("rcon_pwd = ?");
    values.push(String(payload.rcon_pwd || "").trim() || null);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "default_map")) {
    assignments.push("default_map = ?");
    values.push(String(payload.default_map || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "default_map_id")) {
    assignments.push("default_map_id = ?");
    values.push(String(payload.default_map_id || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    assignments.push("is_active = ?");
    values.push(payload.is_active ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "default_map_monitor_enabled")) {
    assignments.push("default_map_monitor_enabled = ?");
    values.push(payload.default_map_monitor_enabled ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "default_map_idle_threshold_seconds")) {
    assignments.push("default_map_idle_threshold_seconds = ?");
    values.push(
      normalizePositiveInt(
        payload.default_map_idle_threshold_seconds,
        DEFAULT_MAP_IDLE_THRESHOLD_SECONDS,
      ),
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, "idle_restart_enabled")) {
    assignments.push("idle_restart_enabled = ?");
    values.push(payload.idle_restart_enabled ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "idle_restart_window_start")) {
    assignments.push("idle_restart_window_start = ?");
    values.push(
      normalizeTimeValue(
        payload.idle_restart_window_start,
        DEFAULT_IDLE_RESTART_WINDOW_START,
      ),
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, "idle_restart_window_end")) {
    assignments.push("idle_restart_window_end = ?");
    values.push(
      normalizeTimeValue(
        payload.idle_restart_window_end,
        DEFAULT_IDLE_RESTART_WINDOW_END,
      ),
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, "idle_restart_threshold_seconds")) {
    assignments.push("idle_restart_threshold_seconds = ?");
    values.push(
      normalizePositiveInt(
        payload.idle_restart_threshold_seconds,
        DEFAULT_IDLE_RESTART_THRESHOLD_SECONDS,
      ),
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, "idle_restart_cooldown_seconds")) {
    assignments.push("idle_restart_cooldown_seconds = ?");
    values.push(
      normalizePositiveInt(
        payload.idle_restart_cooldown_seconds,
        DEFAULT_IDLE_RESTART_COOLDOWN_SECONDS,
      ),
    );
  }

  if (!assignments.length) {
    return await findKepcsServerById(id);
  }

  const pool = getServerCatalogPool();
  const [result] = await pool.execute(
    `
      UPDATE servers
      SET ${assignments.join(", ")}
      WHERE id = ?
      LIMIT 1
    `,
    [...values, Number(id)],
  );

  if (!Number(result.affectedRows || 0)) {
    throw new Error("Server not found");
  }

  return await findKepcsServerById(id);
}

async function deleteKepcsServer(id) {
  const pool = getServerCatalogPool();
  const [result] = await pool.execute(
    `
      DELETE FROM servers
      WHERE id = ?
      LIMIT 1
    `,
    [Number(id)],
  );

  if (!Number(result.affectedRows || 0)) {
    throw new Error("Server not found");
  }
}

async function listCommunityServers() {
  const pool = getServerCatalogPool();
  const [rows] = await pool.query(
    `
      SELECT id, community, name, host, port, sort_order, is_active
      FROM community_servers
      ORDER BY sort_order ASC, id ASC
    `,
  );

  return rows.map(normalizeCommunityServer);
}

async function createCommunityServer(payload) {
  const pool = getServerCatalogPool();
  const [result] = await pool.execute(
    `
      INSERT INTO community_servers (community, name, host, port, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      String(payload.community || "").trim(),
      String(payload.name || "").trim(),
      String(payload.host || "").trim(),
      Number(payload.port),
      Number(payload.sort_order || 0),
      payload.is_active ? 1 : 0,
    ],
  );

  return await findCommunityServerById(result.insertId);
}

async function updateCommunityServer(id, payload) {
  const assignments = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, "community")) {
    assignments.push("community = ?");
    values.push(String(payload.community || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    assignments.push("name = ?");
    values.push(String(payload.name || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "host")) {
    assignments.push("host = ?");
    values.push(String(payload.host || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(payload, "port")) {
    assignments.push("port = ?");
    values.push(Number(payload.port));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    assignments.push("sort_order = ?");
    values.push(Number(payload.sort_order || 0));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    assignments.push("is_active = ?");
    values.push(payload.is_active ? 1 : 0);
  }

  if (!assignments.length) {
    return await findCommunityServerById(id);
  }

  const pool = getServerCatalogPool();
  const [result] = await pool.execute(
    `
      UPDATE community_servers
      SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      LIMIT 1
    `,
    [...values, Number(id)],
  );

  if (!Number(result.affectedRows || 0)) {
    throw new Error("Community server not found");
  }

  return await findCommunityServerById(id);
}

async function deleteCommunityServer(id) {
  const pool = getServerCatalogPool();
  const [result] = await pool.execute(
    `
      DELETE FROM community_servers
      WHERE id = ?
      LIMIT 1
    `,
    [Number(id)],
  );

  if (!Number(result.affectedRows || 0)) {
    throw new Error("Community server not found");
  }
}

module.exports = {
  createCommunityServer,
  createKepcsServer,
  deleteCommunityServer,
  deleteKepcsServer,
  findKepcsServerById,
  listCommunityServers,
  listKepcsServers,
  updateCommunityServer,
  updateKepcsServer,
};
