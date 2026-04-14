const crypto = require("node:crypto");
const { cdkPool } = require("../lib/cdkDatabase");

async function writeAuditLog({
  actorSteamId,
  actorRole,
  action,
  targetType,
  targetId,
  detail,
}) {
  await cdkPool.execute(
    `
      INSERT INTO AuditLog (id, actorSteamId, actorRole, action, targetType, targetId, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      crypto.randomUUID(),
      String(actorSteamId || ""),
      String(actorRole || "user"),
      String(action || ""),
      String(targetType || ""),
      targetId == null ? null : String(targetId),
      JSON.stringify(detail || {}),
    ],
  );
}

async function listAuditLogs({
  limit = 100,
  actorSteamId,
  actorRole,
  action,
  targetType,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const conditions = [];
  const values = [];

  if (actorSteamId) {
    conditions.push("actorSteamId = ?");
    values.push(String(actorSteamId));
  }

  if (actorRole) {
    conditions.push("actorRole = ?");
    values.push(String(actorRole));
  }

  if (action) {
    conditions.push("action LIKE ?");
    values.push(`%${String(action)}%`);
  }

  if (targetType) {
    conditions.push("targetType = ?");
    values.push(String(targetType));
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await cdkPool.query(
    `
      SELECT id, actorSteamId, actorRole, action, targetType, targetId, detail, createdAt
      FROM AuditLog
      ${whereClause}
      ORDER BY createdAt DESC
      LIMIT ?
    `,
    [...values, safeLimit],
  );

  return rows.map((row) => ({
    ...row,
    detail:
      typeof row.detail === "string"
        ? (() => {
            try {
              return JSON.parse(row.detail);
            } catch (_error) {
              return row.detail;
            }
          })()
        : row.detail,
  }));
}

module.exports = {
  listAuditLogs,
  writeAuditLog,
};
