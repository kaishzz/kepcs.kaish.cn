const mysql = require("mysql2/promise");
const { env } = require("../config/env");

function escapeIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

function replaceDatabaseName(databaseUrl, databaseName) {
  const url = new URL(databaseUrl.replace(/^mysql:\/\//i, "mysql://"));
  url.pathname = `/${String(databaseName || "").trim()}`;
  return url.toString();
}

async function tableExists(connection, databaseName, tableName) {
  const [rows] = await connection.execute(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.tables
      WHERE table_schema = ? AND table_name = ?
      LIMIT 1
    `,
    [databaseName, tableName],
  );

  return Number(rows?.[0]?.count || 0) > 0;
}

async function columnExists(connection, databaseName, tableName, columnName) {
  const [rows] = await connection.execute(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?
      LIMIT 1
    `,
    [databaseName, tableName, columnName],
  );

  return Number(rows?.[0]?.count || 0) > 0;
}

async function ensureTableColumn(connection, databaseName, tableName, columnName, definitionSql) {
  if (await columnExists(connection, databaseName, tableName, columnName)) {
    return;
  }

  await connection.query(
    `ALTER TABLE ${escapeIdentifier(tableName)} ADD COLUMN ${escapeIdentifier(columnName)} ${definitionSql}`,
  );
}

async function dropTableColumn(connection, databaseName, tableName, columnName) {
  if (!await columnExists(connection, databaseName, tableName, columnName)) {
    return;
  }

  await connection.query(
    `ALTER TABLE ${escapeIdentifier(tableName)} DROP COLUMN ${escapeIdentifier(columnName)}`,
  );
}

async function renameTableColumn(connection, databaseName, tableName, oldColumnName, newColumnName, definitionSql) {
  if (!await columnExists(connection, databaseName, tableName, oldColumnName)) {
    return;
  }

  if (await columnExists(connection, databaseName, tableName, newColumnName)) {
    await dropTableColumn(connection, databaseName, tableName, oldColumnName);
    return;
  }

  await connection.query(
    `ALTER TABLE ${escapeIdentifier(tableName)} CHANGE COLUMN ${escapeIdentifier(oldColumnName)} ${escapeIdentifier(newColumnName)} ${definitionSql}`,
  );
}

function parseMysqlUrl(databaseUrl) {
  const url = new URL(databaseUrl.replace(/^mysql:\/\//i, "mysql://"));

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    charset: url.searchParams.get("charset") || "utf8mb4",
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

async function createConnection(config, database) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    charset: config.charset,
    database,
    multipleStatements: false,
  });
}

async function ensureDatabaseExists(databaseUrl) {
  const config = parseMysqlUrl(databaseUrl);
  const connection = await createConnection(config);

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(config.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }

  return config;
}

async function ensurePayTables(config) {
  const connection = await createConnection(config, config.database);
  const defaultWhitelistDescription = "支付成功后会自动处理开通";

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`Order\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`orderNo\` VARCHAR(191) NOT NULL,
        \`productCode\` VARCHAR(191) NULL,
        \`productType\` VARCHAR(32) NOT NULL DEFAULT 'WHITELIST',
        \`targetDatabase\` VARCHAR(191) NULL,
        \`cdkType\` VARCHAR(64) NULL,
        \`cdkQuantity\` INT NOT NULL DEFAULT 1,
        \`steamId64\` VARCHAR(191) NOT NULL,
        \`qq\` VARCHAR(191) NULL,
        \`email\` VARCHAR(191) NULL,
        \`remark\` VARCHAR(191) NULL,
        \`paymentType\` VARCHAR(191) NOT NULL DEFAULT 'alipay',
        \`subject\` VARCHAR(191) NOT NULL,
        \`amountFen\` INT NOT NULL,
        \`currency\` VARCHAR(191) NOT NULL DEFAULT 'CNY',
        \`status\` ENUM('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
        \`providerName\` VARCHAR(191) NOT NULL DEFAULT 'zhupay',
        \`providerOrderId\` VARCHAR(191) NULL,
        \`providerResponse\` JSON NULL,
        \`paidAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`Order_orderNo_key\` (\`orderNo\`),
        UNIQUE KEY \`Order_providerOrderId_key\` (\`providerOrderId\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`Product\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`productType\` VARCHAR(32) NOT NULL DEFAULT 'WHITELIST',
        \`amountFen\` INT NOT NULL,
        \`targetDatabase\` VARCHAR(191) NOT NULL DEFAULT '',
        \`cdkType\` VARCHAR(64) NOT NULL DEFAULT '',
        \`cdkQuantity\` INT NOT NULL DEFAULT 1,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`Product_code_key\` (\`code\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`PaymentCallback\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`providerName\` VARCHAR(191) NOT NULL DEFAULT 'zhupay',
        \`callbackType\` VARCHAR(191) NOT NULL DEFAULT 'notify',
        \`orderId\` VARCHAR(191) NULL,
        \`signatureValid\` TINYINT(1) NOT NULL,
        \`processed\` TINYINT(1) NOT NULL DEFAULT 0,
        \`rawBody\` JSON NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`PaymentCallback_orderId_idx\` (\`orderId\`),
        CONSTRAINT \`PaymentCallback_orderId_fkey\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`Order\`(\`id\`)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`WhitelistJob\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`orderId\` VARCHAR(191) NOT NULL,
        \`steamId64\` VARCHAR(191) NOT NULL,
        \`qq\` VARCHAR(191) NULL,
        \`status\` ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
        \`notes\` VARCHAR(191) NULL,
        \`processedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`WhitelistJob_orderId_steamId64_key\` (\`orderId\`, \`steamId64\`),
        CONSTRAINT \`WhitelistJob_orderId_fkey\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`Order\`(\`id\`)
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(
      `
        INSERT INTO Product (
          id, code, name, description, productType, amountFen,
          targetDatabase, cdkType, cdkQuantity, isActive, sortOrder
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          productType = VALUES(productType),
          amountFen = VALUES(amountFen),
          targetDatabase = VALUES(targetDatabase),
          cdkType = VALUES(cdkType),
          cdkQuantity = VALUES(cdkQuantity),
          sortOrder = VALUES(sortOrder),
          updatedAt = CURRENT_TIMESTAMP(3)
      `,
      [
        "product-default-kepcs-whitelist-single",
        "kepcs_whitelist_single",
        "开水服白名单（一位）",
        defaultWhitelistDescription,
        "WHITELIST",
        5000,
        env.officialWhitelistDatabase,
        "",
        1,
        0,
        0,
      ],
    );
  } finally {
    await connection.end();
  }
}

async function ensureCdkTables(config) {
  const connection = await createConnection(config, config.database);
  const rootSteamId = env.rootSteamIds[0] || "root";

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`Cdk\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NOT NULL,
        \`status\` ENUM('ACTIVE', 'USED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
        \`createdBySteamId\` VARCHAR(191) NOT NULL,
        \`ownerSteamId\` VARCHAR(191) NOT NULL,
        \`note\` VARCHAR(191) NULL,
        \`cdkType\` VARCHAR(64) NOT NULL DEFAULT '',
        \`isRedeemable\` TINYINT(1) NOT NULL DEFAULT 1,
        \`sourceProductCode\` VARCHAR(64) NULL,
        \`sourceOrderNo\` VARCHAR(191) NULL,
        \`expiresAt\` DATETIME(3) NULL,
        \`usedAt\` DATETIME(3) NULL,
        \`usedBySteamId\` VARCHAR(191) NULL,
        \`redeemedTargetSteamId\` VARCHAR(191) NULL,
        \`redeemedTargetQq\` VARCHAR(191) NULL,
        \`redeemedTargetEmail\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`Cdk_code_key\` (\`code\`),
        UNIQUE KEY \`Cdk_sourceOrderNo_key\` (\`sourceOrderNo\`),
        KEY \`Cdk_ownerSteamId_idx\` (\`ownerSteamId\`),
        KEY \`Cdk_status_idx\` (\`status\`),
        KEY \`Cdk_createdAt_idx\` (\`createdAt\`),
        KEY \`Cdk_updatedAt_idx\` (\`updatedAt\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`AuditLog\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`actorSteamId\` VARCHAR(32) NOT NULL,
        \`actorRole\` VARCHAR(16) NOT NULL,
        \`action\` VARCHAR(64) NOT NULL,
        \`targetType\` VARCHAR(64) NOT NULL,
        \`targetId\` VARCHAR(191) NULL,
        \`detail\` JSON NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`AuditLog_actorSteamId_idx\` (\`actorSteamId\`),
        KEY \`AuditLog_createdAt_idx\` (\`createdAt\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`ServerTrendSnapshot\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`bucketAt\` DATETIME(3) NOT NULL,
        \`xlTotal\` INT NOT NULL DEFAULT 0,
        \`ptTotal\` INT NOT NULL DEFAULT 0,
        \`xlOccupied\` INT NOT NULL DEFAULT 0,
        \`ptOccupied\` INT NOT NULL DEFAULT 0,
        \`onlinePlayers\` INT NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ServerTrendSnapshot_bucketAt_key\` (\`bucketAt\`),
        KEY \`ServerTrendSnapshot_bucketAt_idx\` (\`bucketAt\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (await tableExists(connection, config.database, "ServerTrendSnapshot")) {
      await renameTableColumn(connection, config.database, "ServerTrendSnapshot", "practiceTotal", "xlTotal", "INT NOT NULL DEFAULT 0");
      await renameTableColumn(connection, config.database, "ServerTrendSnapshot", "zeTotal", "ptTotal", "INT NOT NULL DEFAULT 0");
      await renameTableColumn(connection, config.database, "ServerTrendSnapshot", "practiceOccupied", "xlOccupied", "INT NOT NULL DEFAULT 0");
      await renameTableColumn(connection, config.database, "ServerTrendSnapshot", "zeOccupied", "ptOccupied", "INT NOT NULL DEFAULT 0");
      await ensureTableColumn(connection, config.database, "ServerTrendSnapshot", "xlTotal", "INT NOT NULL DEFAULT 0");
      await ensureTableColumn(connection, config.database, "ServerTrendSnapshot", "ptTotal", "INT NOT NULL DEFAULT 0");
      await ensureTableColumn(connection, config.database, "ServerTrendSnapshot", "xlOccupied", "INT NOT NULL DEFAULT 0");
      await ensureTableColumn(connection, config.database, "ServerTrendSnapshot", "ptOccupied", "INT NOT NULL DEFAULT 0");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`SiteSetting\` (
        \`key\` VARCHAR(191) NOT NULL,
        \`value\` LONGTEXT NOT NULL,
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`key\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`ManagedNode\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`host\` VARCHAR(191) NULL,
        \`note\` TEXT NULL,
        \`apiKeyHash\` VARCHAR(64) NOT NULL,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`status\` ENUM('ONLINE', 'OFFLINE', 'DISABLED') NOT NULL DEFAULT 'OFFLINE',
        \`lastSeenAt\` DATETIME(3) NULL,
        \`lastIp\` VARCHAR(64) NULL,
        \`agentVersion\` VARCHAR(64) NULL,
        \`lastHeartbeat\` JSON NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ManagedNode_code_key\` (\`code\`),
        UNIQUE KEY \`ManagedNode_apiKeyHash_key\` (\`apiKeyHash\`),
        KEY \`ManagedNode_isActive_createdAt_idx\` (\`isActive\`, \`createdAt\`),
        KEY \`ManagedNode_lastSeenAt_idx\` (\`lastSeenAt\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`NodeCommand\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`nodeId\` VARCHAR(191) NOT NULL,
        \`commandType\` VARCHAR(64) NOT NULL,
        \`payload\` JSON NULL,
        \`status\` ENUM('PENDING', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
        \`createdBySteamId\` VARCHAR(32) NOT NULL,
        \`createdByRole\` VARCHAR(16) NULL,
        \`claimedAt\` DATETIME(3) NULL,
        \`startedAt\` DATETIME(3) NULL,
        \`finishedAt\` DATETIME(3) NULL,
        \`expiresAt\` DATETIME(3) NULL,
        \`result\` JSON NULL,
        \`errorMessage\` TEXT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`NodeCommand_nodeId_status_createdAt_idx\` (\`nodeId\`, \`status\`, \`createdAt\`),
        KEY \`NodeCommand_expiresAt_idx\` (\`expiresAt\`),
        CONSTRAINT \`NodeCommand_nodeId_fkey\`
          FOREIGN KEY (\`nodeId\`) REFERENCES \`ManagedNode\`(\`id\`)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`RoleGroup\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(64) NOT NULL,
        \`note\` VARCHAR(191) NULL,
        \`isSystem\` TINYINT(1) NOT NULL DEFAULT 0,
        \`createdBySteamId\` VARCHAR(32) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`RoleGroup_code_key\` (\`code\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`RoleGroupPermission\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`groupId\` VARCHAR(191) NOT NULL,
        \`permissionKey\` VARCHAR(96) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`RoleGroupPermission_groupId_permissionKey_key\` (\`groupId\`, \`permissionKey\`),
        KEY \`RoleGroupPermission_permissionKey_idx\` (\`permissionKey\`),
        CONSTRAINT \`RoleGroupPermission_groupId_fkey\`
          FOREIGN KEY (\`groupId\`) REFERENCES \`RoleGroup\`(\`id\`)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`RoleGroupMember\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`groupId\` VARCHAR(191) NOT NULL,
        \`steamId\` VARCHAR(32) NOT NULL,
        \`note\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`RoleGroupMember_groupId_steamId_key\` (\`groupId\`, \`steamId\`),
        KEY \`RoleGroupMember_steamId_idx\` (\`steamId\`),
        CONSTRAINT \`RoleGroupMember_groupId_fkey\`
          FOREIGN KEY (\`groupId\`) REFERENCES \`RoleGroup\`(\`id\`)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`DirectUserAccess\` (
        \`steamId\` VARCHAR(32) NOT NULL,
        \`note\` VARCHAR(191) NULL,
        \`createdBySteamId\` VARCHAR(32) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`steamId\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`DirectUserPermission\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`steamId\` VARCHAR(32) NOT NULL,
        \`permissionKey\` VARCHAR(96) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`DirectUserPermission_steamId_permissionKey_key\` (\`steamId\`, \`permissionKey\`),
        KEY \`DirectUserPermission_permissionKey_idx\` (\`permissionKey\`),
        CONSTRAINT \`DirectUserPermission_steamId_fkey\`
          FOREIGN KEY (\`steamId\`) REFERENCES \`DirectUserAccess\`(\`steamId\`)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`NodeCommandLog\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`nodeId\` VARCHAR(191) NOT NULL,
        \`commandId\` VARCHAR(191) NOT NULL,
        \`level\` VARCHAR(16) NOT NULL DEFAULT 'info',
        \`message\` TEXT NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`NodeCommandLog_commandId_createdAt_idx\` (\`commandId\`, \`createdAt\`),
        KEY \`NodeCommandLog_nodeId_createdAt_idx\` (\`nodeId\`, \`createdAt\`),
        CONSTRAINT \`NodeCommandLog_nodeId_fkey\`
          FOREIGN KEY (\`nodeId\`) REFERENCES \`ManagedNode\`(\`id\`)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT \`NodeCommandLog_commandId_fkey\`
          FOREIGN KEY (\`commandId\`) REFERENCES \`NodeCommand\`(\`id\`)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`NodeCommandSchedule\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`nodeId\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(64) NOT NULL,
        \`commandType\` VARCHAR(64) NOT NULL,
        \`payload\` JSON NULL,
        \`intervalMinutes\` INT NOT NULL,
        \`nextRunAt\` DATETIME(3) NOT NULL,
        \`lastQueuedAt\` DATETIME(3) NULL,
        \`lastCommandId\` VARCHAR(191) NULL,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdBySteamId\` VARCHAR(32) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`NodeCommandSchedule_nodeId_isActive_nextRunAt_idx\` (\`nodeId\`, \`isActive\`, \`nextRunAt\`),
        KEY \`NodeCommandSchedule_isActive_nextRunAt_idx\` (\`isActive\`, \`nextRunAt\`),
        CONSTRAINT \`NodeCommandSchedule_nodeId_fkey\`
          FOREIGN KEY (\`nodeId\`) REFERENCES \`ManagedNode\`(\`id\`)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(
      `
        INSERT INTO RoleGroup (id, code, name, note, isSystem, createdBySteamId)
        VALUES (?, ?, ?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          note = VALUES(note),
          updatedAt = CURRENT_TIMESTAMP(3)
      `,
      [
        "group-seed-admins",
        "seed_admins",
        "默认日志组",
        "由 ADMIN_STEAM_IDS 自动生成",
        rootSteamId,
      ],
    );

    const seedPermissions = [
      "console.logs.audit",
      "console.logs.orders",
    ];

    for (const permissionKey of seedPermissions) {
      await connection.execute(
        `
          INSERT IGNORE INTO RoleGroupPermission (id, groupId, permissionKey)
          VALUES (?, ?, ?)
        `,
        [`${permissionKey}-seed`, "group-seed-admins", permissionKey],
      );
    }

    const adminSeeds = env.adminSteamIds.filter(
      (steamId) => steamId && !env.rootSteamIds.includes(steamId),
    );

    for (const steamId of adminSeeds) {
      await connection.execute(
        `
          INSERT IGNORE INTO RoleGroupMember (id, groupId, steamId, note)
          VALUES (?, ?, ?, ?)
        `,
        [`seed-admin-${steamId}`, "group-seed-admins", steamId, "Seeded from env"],
      );
    }
  } finally {
    await connection.end();
  }
}

async function ensureGameTables(config) {
  const connection = await createConnection(config, config.database);

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`kep_player_info\` (
        \`UserID\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`Name\` VARCHAR(191) NOT NULL DEFAULT '',
        \`SteamID\` VARCHAR(32) NOT NULL,
        \`JoinTime\` DATETIME NOT NULL,
        \`PlayTime\` INT NOT NULL DEFAULT 0,
        \`LastSeen\` DATETIME NULL,
        \`Note\` VARCHAR(255) NULL,
        \`member_openid\` VARCHAR(191) NULL,
        PRIMARY KEY (\`UserID\`),
        UNIQUE KEY \`kep_player_info_SteamID_key\` (\`SteamID\`),
        KEY \`kep_player_info_LastSeen_idx\` (\`LastSeen\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`kep_daily_playtime\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`PlayDate\` DATE NOT NULL,
        \`SteamID\` VARCHAR(32) NOT NULL,
        \`PlayTime\` INT NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`kep_daily_playtime_PlayDate_SteamID_key\` (\`PlayDate\`, \`SteamID\`),
        KEY \`kep_daily_playtime_SteamID_idx\` (\`SteamID\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } finally {
    await connection.end();
  }
}

async function ensureServerCatalogTables(databaseUrl) {
  const config = await ensureDatabaseExists(databaseUrl);
  const connection = await createConnection(config, config.database);

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`servers\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`mode\` VARCHAR(32) NOT NULL DEFAULT '',
        \`name\` VARCHAR(191) NOT NULL,
        \`host\` VARCHAR(191) NOT NULL,
        \`port\` INT NOT NULL,
        \`rcon_pwd\` VARCHAR(100) NULL,
        \`default_map\` VARCHAR(100) NOT NULL DEFAULT '',
        \`default_map_id\` VARCHAR(50) NOT NULL DEFAULT '',
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`default_map_monitor_enabled\` TINYINT(1) NOT NULL DEFAULT 0,
        \`default_map_idle_threshold_seconds\` INT NOT NULL DEFAULT 300,
        \`idle_restart_enabled\` TINYINT(1) NOT NULL DEFAULT 0,
        \`idle_restart_window_start\` CHAR(5) NOT NULL DEFAULT '02:00',
        \`idle_restart_window_end\` CHAR(5) NOT NULL DEFAULT '08:00',
        \`idle_restart_threshold_seconds\` INT NOT NULL DEFAULT 300,
        \`idle_restart_cooldown_seconds\` INT NOT NULL DEFAULT 1800,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`community_servers\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`community\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`host\` VARCHAR(191) NOT NULL,
        \`port\` INT NOT NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (await tableExists(connection, config.database, "servers")) {
      await dropTableColumn(connection, config.database, "servers", "shotid");
      await ensureTableColumn(connection, config.database, "servers", "default_map_monitor_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
      await ensureTableColumn(connection, config.database, "servers", "default_map_idle_threshold_seconds", "INT NOT NULL DEFAULT 300");
      await ensureTableColumn(connection, config.database, "servers", "idle_restart_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
      await ensureTableColumn(connection, config.database, "servers", "idle_restart_window_start", "CHAR(5) NOT NULL DEFAULT '02:00'");
      await ensureTableColumn(connection, config.database, "servers", "idle_restart_window_end", "CHAR(5) NOT NULL DEFAULT '08:00'");
      await ensureTableColumn(connection, config.database, "servers", "idle_restart_threshold_seconds", "INT NOT NULL DEFAULT 300");
      await ensureTableColumn(connection, config.database, "servers", "idle_restart_cooldown_seconds", "INT NOT NULL DEFAULT 1800");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`default_map_monitor_config\` (
        \`id\` TINYINT UNSIGNED NOT NULL,
        \`enabled\` TINYINT(1) NOT NULL DEFAULT 0,
        \`check_interval_seconds\` INT NOT NULL DEFAULT 10,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(
      `
        INSERT INTO default_map_monitor_config (id, enabled, check_interval_seconds)
        VALUES (1, 0, 10)
        ON DUPLICATE KEY UPDATE id = id
      `,
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`idle_restart_monitor_config\` (
        \`id\` TINYINT UNSIGNED NOT NULL,
        \`enabled\` TINYINT(1) NOT NULL DEFAULT 0,
        \`check_interval_seconds\` INT NOT NULL DEFAULT 30,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(
      `
        INSERT INTO idle_restart_monitor_config (id, enabled, check_interval_seconds)
        VALUES (1, 0, 30)
        ON DUPLICATE KEY UPDATE id = id
      `,
    );
  } finally {
    await connection.end();
  }
}

async function ensureDatabases() {
  const payConfig = await ensureDatabaseExists(env.payDatabaseUrl);
  const cdkConfig = await ensureDatabaseExists(env.cdkDatabaseUrl);
  const gameConfig = await ensureDatabaseExists(env.gameDatabaseUrl);

  await ensurePayTables(payConfig);
  await ensureCdkTables(cdkConfig);
  await ensureGameTables(gameConfig);
  await ensureServerCatalogTables(replaceDatabaseName(env.databaseUrl, env.serverCatalogDatabase));
}

module.exports = {
  ensureDatabases,
};
