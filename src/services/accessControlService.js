const crypto = require("node:crypto");
const { cdkPool } = require("../lib/cdkDatabase");
const {
  ALL_CONSOLE_PERMISSION_KEYS,
  CONSOLE_BASE_PERMISSION_KEYS,
  CONSOLE_PERMISSION_CATALOG,
  CONSOLE_PERMISSION_SECTIONS,
  CONSOLE_STAFF_PERMISSION_KEYS,
  normalizePermissionList,
} = require("../constants/consolePermissions");

function normalizeSteamId(value) {
  return String(value || "").trim();
}

function sortByText(values, selector) {
  return [...values].sort((left, right) =>
    String(selector(left)).localeCompare(String(selector(right)), "zh-CN"),
  );
}

function buildLookup(items, keySelector) {
  const map = new Map();
  items.forEach((item) => {
    map.set(keySelector(item), item);
  });
  return map;
}

async function listAccessGroups() {
  const [groups, permissions, members] = await Promise.all([
    cdkPool.query(`
      SELECT id, code, name, note, isSystem, createdBySteamId, createdAt, updatedAt
      FROM RoleGroup
      ORDER BY isSystem DESC, createdAt ASC, name ASC
    `),
    cdkPool.query(`
      SELECT groupId, permissionKey
      FROM RoleGroupPermission
      ORDER BY permissionKey ASC
    `),
    cdkPool.query(`
      SELECT groupId, steamId, note, createdAt, updatedAt
      FROM RoleGroupMember
      ORDER BY createdAt ASC, steamId ASC
    `),
  ]);

  const groupRows = groups[0] || [];
  const permissionRows = permissions[0] || [];
  const memberRows = members[0] || [];
  const result = groupRows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    note: row.note || null,
    isSystem: Boolean(row.isSystem),
    createdBySteamId: row.createdBySteamId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    permissions: [],
    members: [],
  }));
  const groupMap = buildLookup(result, (item) => item.id);

  permissionRows.forEach((row) => {
    const target = groupMap.get(row.groupId);
    if (target) {
      target.permissions.push(row.permissionKey);
    }
  });

  memberRows.forEach((row) => {
    const target = groupMap.get(row.groupId);
    if (target) {
      target.members.push({
        steamId: row.steamId,
        note: row.note || null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
  });

  return result.map((group) => ({
    ...group,
    permissions: normalizePermissionList(group.permissions),
    members: sortByText(group.members, (item) => item.steamId),
  }));
}

async function listDirectAccessUsers() {
  const [users, permissions] = await Promise.all([
    cdkPool.query(`
      SELECT steamId, note, createdBySteamId, createdAt, updatedAt
      FROM DirectUserAccess
      ORDER BY createdAt ASC, steamId ASC
    `),
    cdkPool.query(`
      SELECT steamId, permissionKey
      FROM DirectUserPermission
      ORDER BY permissionKey ASC
    `),
  ]);

  const userRows = users[0] || [];
  const permissionRows = permissions[0] || [];
  const result = userRows.map((row) => ({
    steamId: row.steamId,
    note: row.note || null,
    createdBySteamId: row.createdBySteamId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    permissions: [],
  }));
  const userMap = buildLookup(result, (item) => item.steamId);

  permissionRows.forEach((row) => {
    const target = userMap.get(row.steamId);
    if (target) {
      target.permissions.push(row.permissionKey);
    }
  });

  return result.map((user) => ({
    ...user,
    permissions: normalizePermissionList(user.permissions),
  }));
}

async function resolveConsoleAccess(steamId, { isRoot = false } = {}) {
  const normalizedSteamId = normalizeSteamId(steamId);

  if (!normalizedSteamId) {
    return {
      steamId: "",
      role: "user",
      isRoot: false,
      isStaff: false,
      permissions: [...CONSOLE_BASE_PERMISSION_KEYS],
      groupCodes: [],
      groupNames: [],
      groupMemberships: [],
      directPermissions: [],
    };
  }

  if (isRoot) {
    return {
      steamId: normalizedSteamId,
      role: "root",
      isRoot: true,
      isStaff: true,
      permissions: normalizePermissionList(ALL_CONSOLE_PERMISSION_KEYS),
      groupCodes: [],
      groupNames: [],
      groupMemberships: [],
      directPermissions: [],
    };
  }

  const [[groupRows], [directRows]] = await Promise.all([
    cdkPool.query(
      `
        SELECT
          g.id AS groupId,
          g.code AS groupCode,
          g.name AS groupName,
          m.note AS memberNote,
          p.permissionKey AS permissionKey
        FROM RoleGroupMember m
        INNER JOIN RoleGroup g ON g.id = m.groupId
        LEFT JOIN RoleGroupPermission p ON p.groupId = g.id
        WHERE m.steamId = ?
        ORDER BY g.name ASC, p.permissionKey ASC
      `,
      [normalizedSteamId],
    ),
    cdkPool.query(
      `
        SELECT u.note AS userNote, p.permissionKey AS permissionKey
        FROM DirectUserAccess u
        LEFT JOIN DirectUserPermission p ON p.steamId = u.steamId
        WHERE u.steamId = ?
        ORDER BY p.permissionKey ASC
      `,
      [normalizedSteamId],
    ),
  ]);

  const groupMemberships = [];
  const groupLookup = new Map();
  const groupPermissions = [];

  (groupRows || []).forEach((row) => {
    if (!groupLookup.has(row.groupId)) {
      const group = {
        id: row.groupId,
        code: row.groupCode,
        name: row.groupName,
        note: row.memberNote || null,
      };
      groupLookup.set(row.groupId, group);
      groupMemberships.push(group);
    }

    if (row.permissionKey) {
      groupPermissions.push(row.permissionKey);
    }
  });

  const directPermissions = normalizePermissionList(
    (directRows || []).map((row) => row.permissionKey).filter(Boolean),
  );

  const permissions = normalizePermissionList([
    ...CONSOLE_BASE_PERMISSION_KEYS,
    ...groupPermissions,
    ...directPermissions,
  ]);
  const extraPermissions = permissions.filter((permissionKey) =>
    CONSOLE_STAFF_PERMISSION_KEYS.includes(permissionKey),
  );

  return {
    steamId: normalizedSteamId,
    role: extraPermissions.length ? "staff" : "user",
    isRoot: false,
    isStaff: extraPermissions.length > 0,
    permissions,
    groupCodes: groupMemberships.map((item) => item.code),
    groupNames: groupMemberships.map((item) => item.name),
    groupMemberships,
    directPermissions,
  };
}

async function listAccessOverview() {
  const [groups, directUsers] = await Promise.all([
    listAccessGroups(),
    listDirectAccessUsers(),
  ]);

  return {
    catalog: CONSOLE_PERMISSION_CATALOG,
    sections: CONSOLE_PERMISSION_SECTIONS,
    groups,
    directUsers,
  };
}

async function createAccessGroup({ code, name, note, createdBySteamId }) {
  const id = crypto.randomUUID();
  await cdkPool.execute(
    `
      INSERT INTO RoleGroup (id, code, name, note, isSystem, createdBySteamId)
      VALUES (?, ?, ?, ?, 0, ?)
    `,
    [id, String(code), String(name), note || null, String(createdBySteamId)],
  );

  const groups = await listAccessGroups();
  return groups.find((item) => item.id === id) || null;
}

async function updateAccessGroup(groupId, { name, note }) {
  await cdkPool.execute(
    `
      UPDATE RoleGroup
      SET name = ?, note = ?, updatedAt = CURRENT_TIMESTAMP(3)
      WHERE id = ?
    `,
    [String(name), note || null, String(groupId)],
  );

  const groups = await listAccessGroups();
  return groups.find((item) => item.id === String(groupId)) || null;
}

async function replaceAccessGroupPermissions(groupId, permissionKeys) {
  const normalizedPermissions = normalizePermissionList(permissionKeys, { editableOnly: true });
  const connection = await cdkPool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM RoleGroupPermission WHERE groupId = ?", [String(groupId)]);

    for (const permissionKey of normalizedPermissions) {
      await connection.execute(
        `
          INSERT INTO RoleGroupPermission (id, groupId, permissionKey)
          VALUES (?, ?, ?)
        `,
        [crypto.randomUUID(), String(groupId), permissionKey],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const groups = await listAccessGroups();
  return groups.find((item) => item.id === String(groupId)) || null;
}

async function replaceAccessGroupMembers(groupId, members) {
  const connection = await cdkPool.getConnection();
  const normalizedMembers = sortByText(
    (Array.isArray(members) ? members : [])
      .map((item) => ({
        steamId: normalizeSteamId(item?.steamId),
        note: String(item?.note || "").trim() || null,
      }))
      .filter((item) => item.steamId),
    (item) => item.steamId,
  );

  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM RoleGroupMember WHERE groupId = ?", [String(groupId)]);

    for (const member of normalizedMembers) {
      await connection.execute(
        `
          INSERT INTO RoleGroupMember (id, groupId, steamId, note)
          VALUES (?, ?, ?, ?)
        `,
        [crypto.randomUUID(), String(groupId), member.steamId, member.note],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const groups = await listAccessGroups();
  return groups.find((item) => item.id === String(groupId)) || null;
}

async function deleteAccessGroup(groupId) {
  const [rows] = await cdkPool.query(
    "SELECT id, isSystem FROM RoleGroup WHERE id = ? LIMIT 1",
    [String(groupId)],
  );
  const target = rows[0];

  if (!target) {
    throw new Error("Group not found");
  }

  if (target.isSystem) {
    throw new Error("System group cannot be deleted");
  }

  await cdkPool.execute("DELETE FROM RoleGroup WHERE id = ?", [String(groupId)]);
}

async function upsertDirectAccessUser({
  steamId,
  note,
  permissionKeys,
  createdBySteamId,
}) {
  const normalizedSteamId = normalizeSteamId(steamId);
  const normalizedPermissions = normalizePermissionList(permissionKeys, { editableOnly: true });
  const connection = await cdkPool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `
        INSERT INTO DirectUserAccess (steamId, note, createdBySteamId)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          note = VALUES(note),
          createdBySteamId = VALUES(createdBySteamId),
          updatedAt = CURRENT_TIMESTAMP(3)
      `,
      [normalizedSteamId, note || null, String(createdBySteamId)],
    );

    await connection.execute("DELETE FROM DirectUserPermission WHERE steamId = ?", [normalizedSteamId]);

    for (const permissionKey of normalizedPermissions) {
      await connection.execute(
        `
          INSERT INTO DirectUserPermission (id, steamId, permissionKey)
          VALUES (?, ?, ?)
        `,
        [crypto.randomUUID(), normalizedSteamId, permissionKey],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const users = await listDirectAccessUsers();
  return users.find((item) => item.steamId === normalizedSteamId) || null;
}

async function deleteDirectAccessUser(steamId) {
  await cdkPool.execute("DELETE FROM DirectUserAccess WHERE steamId = ?", [normalizeSteamId(steamId)]);
}

module.exports = {
  listAccessGroups,
  listAccessOverview,
  listDirectAccessUsers,
  createAccessGroup,
  updateAccessGroup,
  replaceAccessGroupPermissions,
  replaceAccessGroupMembers,
  deleteAccessGroup,
  upsertDirectAccessUser,
  deleteDirectAccessUser,
  resolveConsoleAccess,
};
