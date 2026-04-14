const crypto = require("node:crypto");
const { cdkPrisma } = require("../lib/prisma");
const { findPlayerBySteamId, insertPlayerWhitelist } = require("../lib/gameDatabase");
const { isSteamIdInRemoteWhitelist } = require("./steamWhitelistService");
const { dispatchWhitelistSuccessEmail } = require("./emailService");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function generateCdkCode() {
  const raw = crypto.randomBytes(16).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `KEPCS-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}`;
}

function isExpired(cdk) {
  return Boolean(cdk.expiresAt && new Date(cdk.expiresAt).getTime() < Date.now());
}

function formatOrderIssueTime(value) {
  const date = value ? new Date(value) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildWhitelistCdkSourceOrderNo(orderNo, index) {
  return `${String(orderNo || "").trim()}#WLCDK-${index}`;
}

function buildPurchasedWhitelistCdkNote(order, index, total) {
  const suffix = total > 1 ? `, ${index}/${total}` : "";
  return `订单 ${String(order?.orderNo || "").trim()}, ${formatOrderIssueTime(order?.paidAt || order?.createdAt)}${suffix}`;
}

function buildCdkInsertRow({
  code,
  status = "ACTIVE",
  createdBySteamId,
  ownerSteamId,
  note,
  cdkType,
  isRedeemable = true,
  sourceProductCode,
  sourceOrderNo,
  expiresAt,
}) {
  return {
    id: crypto.randomUUID(),
    code: String(code || "").trim(),
    status,
    createdBySteamId: String(createdBySteamId || "").trim(),
    ownerSteamId: String(ownerSteamId || "").trim(),
    note: String(note || "").trim() || null,
    cdkType: String(cdkType || "").trim(),
    isRedeemable: Boolean(isRedeemable),
    sourceProductCode: String(sourceProductCode || "").trim() || null,
    sourceOrderNo: String(sourceOrderNo || "").trim() || null,
    expiresAt: expiresAt || null,
  };
}

function serializeCdk(cdk) {
  return {
    ...cdk,
    cdkType: String(cdk.cdkType || "").trim() || null,
    sourceProductCode: String(cdk.sourceProductCode || "").trim() || null,
    sourceOrderNo: String(cdk.sourceOrderNo || "").trim() || null,
    isRedeemable: Boolean(cdk.isRedeemable),
    isValid: cdk.status === "ACTIVE" && !isExpired(cdk) && Boolean(cdk.isRedeemable),
    isExpired: isExpired(cdk),
  };
}

function buildCdkOrderBy(sort = "CREATED_DESC") {
  if (sort === "CREATED_ASC") {
    return [{ createdAt: "asc" }];
  }

  if (sort === "EXPIRES_ASC") {
    return [{ expiresAt: "asc" }, { createdAt: "desc" }];
  }

  if (sort === "EXPIRES_DESC") {
    return [{ expiresAt: "desc" }, { createdAt: "desc" }];
  }

  if (sort === "UPDATED_DESC") {
    return [{ updatedAt: "desc" }];
  }

  return [{ createdAt: "desc" }];
}

function buildCdkFilters({ status = "ALL", ownerSteamId } = {}) {
  const where = {};
  const now = new Date();

  if (ownerSteamId) {
    where.ownerSteamId = ownerSteamId;
  }

  if (status === "USED") {
    where.status = "USED";
  } else if (status === "REVOKED") {
    where.status = "REVOKED";
  } else if (status === "EXPIRED") {
    where.status = "ACTIVE";
    where.expiresAt = { lt: now };
  } else if (status === "UNUSED") {
    where.status = "ACTIVE";
    where.OR = [{ expiresAt: null }, { expiresAt: { gte: now } }];
  }

  return where;
}

async function generateUniqueCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateCdkCode();
    const existing = await cdkPrisma.cdk.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!existing) {
      return code;
    }
  }

  throw new Error("无法生成唯一 CDK，请重试。");
}

async function listUserCdks(ownerSteamId, filters = {}) {
  const cdks = await cdkPrisma.cdk.findMany({
    where: buildCdkFilters({
      ...filters,
      ownerSteamId,
    }),
    orderBy: buildCdkOrderBy(filters.sort),
  });

  return cdks.map(serializeCdk);
}

async function listAllCdks(filters = {}) {
  const cdks = await cdkPrisma.cdk.findMany({
    where: buildCdkFilters(filters),
    orderBy: buildCdkOrderBy(filters.sort),
  });

  return cdks.map(serializeCdk);
}

async function createCdks({ count = 1, ownerSteamId, createdBySteamId, note, expiresAt }) {
  if (!(await isSteamIdInRemoteWhitelist(ownerSteamId))) {
    throw createHttpError("接收 CDK 的 SteamID 不在开水服白名单中。");
  }

  const rows = [];

  for (let index = 0; index < count; index += 1) {
    rows.push(buildCdkInsertRow({
      code: await generateUniqueCode(),
      ownerSteamId,
      createdBySteamId,
      note,
      cdkType: "",
      isRedeemable: true,
      sourceProductCode: null,
      sourceOrderNo: null,
      expiresAt,
    }));
  }

  await cdkPrisma.cdk.createMany({
    data: rows,
  });

  const createdCdks = await cdkPrisma.cdk.findMany({
    where: {
      code: {
        in: rows.map((row) => row.code),
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return createdCdks.map(serializeCdk);
}

async function getCdkById(id) {
  const cdk = await cdkPrisma.cdk.findUnique({
    where: { id },
  });

  if (!cdk) {
    throw createHttpError("CDK 不存在。", 404);
  }

  return cdk;
}

async function ensurePurchasedLockedCdkForOrder(order) {
  const sourceOrderNo = String(order?.orderNo || "").trim();

  if (!sourceOrderNo) {
    throw createHttpError("缺少订单号，无法创建 CDK。");
  }

  const existing = await cdkPrisma.cdk.findFirst({
    where: { sourceOrderNo },
  });

  if (existing) {
    return serializeCdk(existing);
  }

  if (!String(order.steamId64 || "").trim()) {
    throw createHttpError("CDK 商品订单缺少 SteamID64。");
  }

  const created = await cdkPrisma.cdk.create({
    data: {
      code: await generateUniqueCode(),
      status: "ACTIVE",
      createdBySteamId: "PAYMENT",
      ownerSteamId: String(order.steamId64).trim(),
      note: String(order.remark || "").trim() || `购买商品: ${order.subject}`,
      cdkType: String(order.cdkType || "").trim(),
      isRedeemable: false,
      sourceProductCode: String(order.productCode || "").trim() || null,
      sourceOrderNo,
      expiresAt: null,
    },
  });

  return serializeCdk(created);
}

async function createPurchasedWhitelistCdksForOrder(order) {
  const baseOrderNo = String(order?.orderNo || "").trim();

  if (!baseOrderNo) {
    throw createHttpError("缺少订单号，无法发放开水服 CDK。");
  }

  const ownerSteamId = String(order?.steamId64 || "").trim();

  if (!ownerSteamId) {
    throw createHttpError("开水服白名单 CDK 订单缺少 SteamID64。");
  }

  if (!(await isSteamIdInRemoteWhitelist(ownerSteamId))) {
    throw createHttpError("该 SteamID64 不在开水服白名单中，无法发放开水服 CDK。");
  }

  const quantity = Math.max(1, Number(order?.cdkQuantity) || 1);
  const sourceOrderPrefix = `${baseOrderNo}#WLCDK-`;
  const existingRows = await cdkPrisma.cdk.findMany({
    where: {
      sourceOrderNo: {
        startsWith: sourceOrderPrefix,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (existingRows.length >= quantity) {
    return existingRows.slice(0, quantity).map(serializeCdk);
  }

  const existingSourceKeys = new Set(
    existingRows
      .map((row) => String(row.sourceOrderNo || "").trim())
      .filter(Boolean),
  );

  const rowsToCreate = [];

  for (let index = 1; index <= quantity; index += 1) {
    const sourceOrderNo = buildWhitelistCdkSourceOrderNo(baseOrderNo, index);

    if (existingSourceKeys.has(sourceOrderNo)) {
      continue;
    }

    rowsToCreate.push(buildCdkInsertRow({
      code: await generateUniqueCode(),
      status: "ACTIVE",
      createdBySteamId: "PAYMENT",
      ownerSteamId,
      note: buildPurchasedWhitelistCdkNote(order, index, quantity),
      cdkType: "",
      isRedeemable: true,
      sourceProductCode: String(order?.productCode || "").trim() || null,
      sourceOrderNo,
      expiresAt: null,
    }));
  }

  if (rowsToCreate.length) {
    await cdkPrisma.cdk.createMany({
      data: rowsToCreate,
    });
  }

  const issuedRows = await cdkPrisma.cdk.findMany({
    where: {
      sourceOrderNo: {
        startsWith: sourceOrderPrefix,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return issuedRows.slice(0, quantity).map(serializeCdk);
}

async function updateCdkAdmin(id, payload) {
  const data = {};

  if (payload.ownerSteamId) {
    if (!(await isSteamIdInRemoteWhitelist(payload.ownerSteamId))) {
      throw createHttpError("新的持有人不在开水服白名单中。");
    }

    data.ownerSteamId = payload.ownerSteamId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "note")) {
    data.note = payload.note || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "isRedeemable")) {
    data.isRedeemable = Boolean(payload.isRedeemable);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "expiresAt")) {
    data.expiresAt = payload.expiresAt || null;
  }

  if (payload.status) {
    data.status = payload.status;

    if (payload.status !== "USED") {
      data.usedAt = null;
      data.usedBySteamId = null;
      data.redeemedTargetSteamId = null;
      data.redeemedTargetQq = null;
      data.redeemedTargetEmail = null;
    }
  }

  const updated = await cdkPrisma.cdk.update({
    where: { id },
    data,
  });

  return serializeCdk(updated);
}

async function deleteCdkAdmin(id) {
  await cdkPrisma.cdk.delete({
    where: { id },
  });
}

async function batchUpdateCdks(ids, payload) {
  const normalizedIds = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));

  if (!normalizedIds.length) {
    throw createHttpError("请选择至少一个 CDK。");
  }

  const data = {};

  if (payload.ownerSteamId) {
    if (!(await isSteamIdInRemoteWhitelist(payload.ownerSteamId))) {
      throw createHttpError("新的持有人不在开水服白名单中。");
    }

    data.ownerSteamId = payload.ownerSteamId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "note")) {
    data.note = payload.note || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "isRedeemable")) {
    data.isRedeemable = Boolean(payload.isRedeemable);
  }

  if (payload.status) {
    data.status = payload.status;

    if (payload.status !== "USED") {
      data.usedAt = null;
      data.usedBySteamId = null;
      data.redeemedTargetSteamId = null;
      data.redeemedTargetQq = null;
      data.redeemedTargetEmail = null;
    }
  }

  await cdkPrisma.cdk.updateMany({
    where: {
      id: {
        in: normalizedIds,
      },
    },
    data,
  });

  const rows = await cdkPrisma.cdk.findMany({
    where: {
      id: {
        in: normalizedIds,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(serializeCdk);
}

async function batchDeleteCdks(ids) {
  const normalizedIds = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));

  if (!normalizedIds.length) {
    throw createHttpError("请选择至少一个 CDK。");
  }

  await cdkPrisma.cdk.deleteMany({
    where: {
      id: {
        in: normalizedIds,
      },
    },
  });
}

async function transferCdk({ id, actorSteamId, toSteamId, canManageAll }) {
  const cdk = await getCdkById(id);

  if (!canManageAll && cdk.ownerSteamId !== actorSteamId) {
    throw createHttpError("你只能转赠自己拥有的 CDK。", 403);
  }

  if (cdk.status !== "ACTIVE" || isExpired(cdk)) {
    throw createHttpError("当前 CDK 不可转赠。");
  }

  if (!cdk.isRedeemable) {
    throw createHttpError("当前 CDK 暂不可转赠。");
  }

  if (!(await isSteamIdInRemoteWhitelist(toSteamId))) {
    throw createHttpError("接收人不在开水服白名单中，无法接收 CDK。");
  }

  const updated = await cdkPrisma.cdk.update({
    where: { id },
    data: {
      ownerSteamId: toSteamId,
    },
  });

  return serializeCdk(updated);
}

async function redeemCdk({ id, actorSteamId, targetSteamId, qq, email, canManageAll }) {
  const cdk = await getCdkById(id);

  if (!canManageAll && cdk.ownerSteamId !== actorSteamId) {
    throw createHttpError("你只能使用自己拥有的 CDK。", 403);
  }

  if (cdk.status !== "ACTIVE") {
    throw createHttpError("当前 CDK 已不可使用。");
  }

  if (isExpired(cdk)) {
    throw createHttpError("当前 CDK 已过期。");
  }

  if (!cdk.isRedeemable) {
    throw createHttpError("当前 CDK 暂不可使用。");
  }

  const existingPlayer = await findPlayerBySteamId(targetSteamId);

  if (existingPlayer) {
    throw createHttpError("目标 SteamID 已存在于名单中。");
  }

  await insertPlayerWhitelist({
    steamId64: targetSteamId,
    note: `qq${qq}, cdk=${cdk.code}`,
    joinTime: new Date(),
  });

  const updated = await cdkPrisma.cdk.update({
    where: { id },
    data: {
      status: "USED",
      usedAt: new Date(),
      usedBySteamId: actorSteamId,
      redeemedTargetSteamId: targetSteamId,
      redeemedTargetQq: qq,
      redeemedTargetEmail: email,
    },
  });

  dispatchWhitelistSuccessEmail({
    source: "cdk",
    cdkCode: cdk.code,
    steamId64: targetSteamId,
    qq,
    email,
    completedAt: updated.usedAt || new Date(),
  });

  return serializeCdk(updated);
}

module.exports = {
  __testables: {
    buildCdkInsertRow,
  },
  batchDeleteCdks,
  batchUpdateCdks,
  createPurchasedWhitelistCdksForOrder,
  createCdks,
  deleteCdkAdmin,
  ensurePurchasedLockedCdkForOrder,
  listAllCdks,
  listUserCdks,
  redeemCdk,
  transferCdk,
  updateCdkAdmin,
};
