const { payPrisma } = require("../lib/prisma");
const { findPlayerBySteamId, insertPlayerWhitelist, updatePlayerSteamId } = require("../lib/gameDatabase");
const { env } = require("../config/env");
const { dispatchWhitelistSuccessEmail } = require("./emailService");

async function enqueueWhitelistWrite(order) {
  const job = await payPrisma.whitelistJob.findUnique({
    where: {
      orderId_steamId64: {
        orderId: order.id,
        steamId64: order.steamId64,
      },
    },
  });

  if (!job) {
    throw new Error(`Whitelist job not found for order ${order.orderNo}`);
  }

  if (job.status === "DONE") {
    return {
      queued: false,
      orderNo: order.orderNo,
      steamId64: order.steamId64,
      message: "Whitelist already synced.",
    };
  }

  try {
    const targetDatabase = order.targetDatabase || order.product?.targetDatabase;

    if (!targetDatabase) {
      throw new Error(`Target database is missing for order ${order.orderNo}`);
    }

    const existingPlayer = await findPlayerBySteamId(order.steamId64, targetDatabase);
    const qq = job.qq || order.qq;

    if (!qq) {
      throw new Error(`QQ is missing for order ${order.orderNo}`);
    }

    if (existingPlayer) {
      await payPrisma.whitelistJob.update({
        where: { id: job.id },
        data: {
          status: "DONE",
          processedAt: new Date(),
          notes: `SteamID already existed. qq${qq}`,
        },
      });

      return {
        queued: false,
        orderNo: order.orderNo,
        steamId64: order.steamId64,
        message: "SteamID already exists in whitelist table.",
      };
    }

    const inserted = await insertPlayerWhitelist({
      steamId64: order.steamId64,
      qq,
      joinTime: order.paidAt || new Date(),
      databaseName: targetDatabase,
    });

    await payPrisma.whitelistJob.update({
      where: { id: job.id },
      data: {
        status: "DONE",
        processedAt: new Date(),
        notes: `Inserted into ${inserted.databaseName}.kep_player_info with ${inserted.note}`,
      },
    });

    dispatchWhitelistSuccessEmail({
      source: "payment",
      orderNo: order.orderNo,
      steamId64: order.steamId64,
      qq,
      email: order.email,
      paymentType: order.paymentType,
      completedAt: order.paidAt || new Date(),
    });

    return {
      queued: false,
      orderNo: order.orderNo,
      steamId64: order.steamId64,
      message: "Whitelist inserted successfully.",
    };
  } catch (error) {
    await payPrisma.whitelistJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        notes: error.message,
      },
    });

    throw error;
  }
}

module.exports = {
  enqueueWhitelistWrite,
  async createManualWhitelistEntry({
    steamId64,
    qq,
    note,
    joinTime = new Date(),
    databaseName = env.officialWhitelistDatabase,
  }) {
    const existingPlayer = await findPlayerBySteamId(steamId64, databaseName);

    if (existingPlayer) {
      throw new Error("该 SteamID64 已存在于白名单中");
    }

    return insertPlayerWhitelist({
      steamId64,
      qq,
      note,
      joinTime,
      databaseName,
    });
  },
  async migrateWhitelistSteamId({
    oldSteamId64,
    newSteamId64,
    databaseName = env.officialWhitelistDatabase,
  }) {
    return updatePlayerSteamId({
      oldSteamId64,
      newSteamId64,
      databaseName,
    });
  },
};
