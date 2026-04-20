const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Fastify = require("fastify");
const fastifyCookie = require("@fastify/cookie");
const fastifyFormbody = require("@fastify/formbody");
const fastifySecureSession = require("@fastify/secure-session");
const fastifyStatic = require("@fastify/static");
const { z } = require("zod");
const { env } = require("./config/env");
const { normalizePermissionList } = require("./constants/consolePermissions");
const { ensureRedisConnected } = require("./lib/redis");
const {
  clearSessionUser,
  getSessionUser,
  requireAnyPermission,
  requirePermission,
  requireUser,
  setSessionUser,
} = require("./middleware/auth");
const { createFastifyRateLimit } = require("./middleware/rateLimit");
const { extractAgentApiKey } = require("./utils/agentAuth");
const { isValidSteamId64 } = require("./utils/steam");
const { isWithinTolerance, parseProviderTimestamp } = require("./utils/time");
const { attachRemoteOrder, buildStatusPayload, createPendingOrder, fulfillPaidOrder, getOrderByOrderNo, listAdminOrders, markCallbackProcessed, markOrderPaid, queryOrdersByEmail, recordCallback } = require("./services/orderService");
const { PAY_PRODUCT_TYPES, createProduct, getActiveProductByCode, listActiveProducts, listAllProducts, normalizeProductType, updateProduct } = require("./services/productService");
const { listAdminMapChallengeRecords, listMapChallengeLeaderboard, upsertMapChallengeRecord } = require("./services/mapChallengeService");
const { fetchPlayerStats, findPlayerProfile } = require("./services/playerStatsService");
const { fetchSteamProfile } = require("./services/steamProfileService");
const { fetchServerList } = require("./services/serverListService");
const {
  createCommunityServer,
  createKepcsServer,
  deleteCommunityServer,
  deleteKepcsServer,
  findKepcsServerById,
  listCommunityServers,
  listKepcsServers,
  updateCommunityServer,
  updateKepcsServer,
} = require("./services/serverCatalogService");
const {
  getDefaultMapMonitorStatus,
  runDefaultMapMonitorSweep,
  updateDefaultMapMonitorConfig,
} = require("./services/defaultMapMonitorService");
const {
  getIdleRestartMonitorStatus,
  runIdleRestartMonitorSweep,
  updateIdleRestartMonitorConfig,
} = require("./services/idleRestartMonitorService");
const { listServerTrendSnapshots } = require("./services/serverTrendService");
const { createManualWhitelistEntry, enqueueWhitelistWrite, migrateWhitelistSteamId } = require("./services/whitelistService");
const { createRemoteOrder, normalizeCallback, verifyCallback } = require("./services/zhupayService");
const { isSteamIdAlreadyWhitelisted, isSteamIdInRemoteWhitelist, searchRemoteWhitelist } = require("./services/steamWhitelistService");
const {
  createAccessGroup,
  deleteAccessGroup,
  deleteDirectAccessUser,
  listAccessOverview,
  replaceAccessGroupMembers,
  replaceAccessGroupPermissions,
  resolveConsoleAccess,
  updateAccessGroup,
  upsertDirectAccessUser,
} = require("./services/accessControlService");
const { listAuditLogs, writeAuditLog } = require("./services/auditLogService");
const {
  appendNodeCommandLogs,
  claimNextNodeCommand,
  createManagedNode,
  createNodeCommand,
  findManagedNodeByApiKeyFromHeaders,
  findManagedNodeById,
  finishNodeCommand,
  getNodeCommandById,
  listManagedNodes,
  listNodeCommandLogs,
  listNodeCommands,
  markNodeCommandStarted,
  recordManagedNodeHeartbeat,
  requestNodeCommandCancellation,
  rotateManagedNodeApiKey,
  serializeManagedNode,
  updateManagedNode,
} = require("./services/agentControlService");
const {
  createNodeSchedule,
  deleteNodeSchedule,
  listNodeSchedules,
  updateNodeSchedule,
} = require("./services/nodeScheduleService");
const {
  getGotifyConfig,
  normalizeGotifyChannelKey,
  resolveGotifyChannels,
  sendGotifyNotification,
  serializeGotifyConfig,
  updateGotifyConfig,
} = require("./services/gotifyNotificationService");
const { batchDeleteCdks, batchUpdateCdks, createCdks, deleteCdkAdmin, listAllCdks, listUserCdks, redeemCdk, transferCdk, updateCdkAdmin } = require("./services/cdkService");
const { buildSteamLoginUrl, extractSteamIdFromClaimedId, verifySteamCallback } = require("./utils/steamOpenId");
const { normalizeNodeCommandServerKeys, sanitizeNodeCommandPayload } = require("./utils/nodeCommandPayloadMeta");

const publicDir = path.join(process.cwd(), "public");
const webDistDir = path.join(process.cwd(), "dist", "web");
const assetRoot = fs.existsSync(path.join(webDistDir, "index.html")) ? webDistDir : publicDir;
const authCookieName = "kepcs_auth";
const CONSOLE_BASE_PATH = "/console";
const CONSOLE_API_BASE_PATH = "/console/api";
const CONSOLE_AUTH_BASE_PATH = "/console/auth";
const MAX_DB_VARCHAR = 191;
const MAX_QQ_LENGTH = 20;
const MAX_AUDIT_TARGET_ID = 191;

function resolveClientIp(request) {
  const forwardedFor = request.headers["cf-connecting-ip"]
    || request.headers["x-real-ip"]
    || request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || "").split(",")[0].trim();

  return (
    forwardedIp
    || request.ip
    || request.socket?.remoteAddress
    || request.raw?.socket?.remoteAddress
    || "unknown"
  );
}

const ipKey = (request) => resolveClientIp(request);

const createOrderRateLimit = createFastifyRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyPrefix: "pay-create-order",
  keyGenerator: ipKey,
  message: "创建订单过于频繁，请稍后再试。",
});

const orderStatusRateLimit = createFastifyRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: "pay-order-status",
  keyGenerator: ipKey,
  message: "订单状态查询过于频繁，请稍后再试。",
});

const orderSearchRateLimit = createFastifyRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyPrefix: "pay-order-search",
  keyGenerator: ipKey,
  message: "订单查询过于频繁，请稍后再试。",
});

const publicApiRateLimit = createFastifyRateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: "public-api",
  keyGenerator: ipKey,
  message: "公开接口请求过于频繁，请稍后再试。",
});

const authStatusRateLimit = createFastifyRateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "auth-status",
  keyGenerator: ipKey,
  message: "登录状态查询过于频繁，请稍后再试。",
});

const pageRateLimit = createFastifyRateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: "page-view",
  keyGenerator: ipKey,
  message: "页面访问过于频繁，请稍后再试。",
  onLimit: (_request, reply) => reply.code(429).type("text/plain").send("页面访问过于频繁，请稍后再试。"),
});

const steamLoginRateLimit = createFastifyRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  keyPrefix: "steam-login",
  keyGenerator: ipKey,
  onLimit: (_request, reply) => reply.redirect(`${CONSOLE_BASE_PATH}?error=too-many-requests`),
});

const steamCallbackRateLimit = createFastifyRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: "steam-callback",
  keyGenerator: ipKey,
  onLimit: (_request, reply) => reply.redirect(`${CONSOLE_BASE_PATH}?error=too-many-requests`),
});

const userScopedKey = (request) => getSessionUser(request)?.steamId || ipKey(request);

const whitelistSearchRateLimit = createFastifyRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: "cdk-whitelist-search",
  keyGenerator: userScopedKey,
  message: "白名单搜索过于频繁，请稍后再试。",
});

const cdkWriteRateLimit = createFastifyRateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  keyPrefix: "cdk-write",
  keyGenerator: userScopedKey,
  message: "CDK 操作过于频繁，请稍后再试。",
});

const adminWriteRateLimit = createFastifyRateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyPrefix: "cdk-admin-write",
  keyGenerator: userScopedKey,
  message: "管理员操作过于频繁，请稍后再试。",
});

const queryRateLimit = createFastifyRateLimit({
  windowMs: 60 * 1000,
  max: 40,
  keyPrefix: "cdk-query",
  keyGenerator: userScopedKey,
  message: "查询过于频繁，请稍后再试。",
});

const logQueryRateLimit = createFastifyRateLimit({
  windowMs: 60 * 1000,
  max: 25,
  keyPrefix: "cdk-log-query",
  keyGenerator: userScopedKey,
  message: "日志查询过于频繁，请稍后再试。",
});

const agentApiRateLimit = createFastifyRateLimit({
  windowMs: 60 * 1000,
  max: 240,
  keyPrefix: "agent-api",
  keyGenerator: ipKey,
  message: "Agent 请求过于频繁，请稍后再试。",
});

const createOrderSchema = z.object({
  productCode: z.string().trim().min(1).default("kepcs_whitelist_single"),
  steamId64: z.string().trim().optional(),
  qq: z.string().trim().max(MAX_QQ_LENGTH, "QQ号格式不正确").optional(),
  email: z.string().trim().max(MAX_DB_VARCHAR, "邮箱不能超过 191 个字符").optional(),
  remark: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
  paymentType: z.enum(["alipay", "wxpay"]).default("alipay"),
});

const orderQuerySchema = z
  .object({
    email: z.string().trim().max(MAX_DB_VARCHAR, "邮箱不能超过 191 个字符").optional(),
    orderNo: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const email = String(value.email || "").trim();
    const orderNo = String(value.orderNo || "").trim();

    if (!email && !orderNo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请填写邮箱或订单号",
        path: ["email"],
      });
    }

    if (email && !z.string().email().safeParse(email).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "邮箱格式不正确",
        path: ["email"],
      });
    }
  });

const optionalDateSchema = z.union([z.string().trim(), z.null(), z.undefined()]).transform((value, ctx) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "时间格式不正确" });
    return z.NEVER;
  }
  return parsed;
});

const listFilterSchema = z.object({
  status: z.enum(["ALL", "UNUSED", "USED", "EXPIRED", "REVOKED"]).optional().default("ALL"),
  sort: z.enum(["CREATED_DESC", "CREATED_ASC", "EXPIRES_ASC", "EXPIRES_DESC", "UPDATED_DESC"]).optional().default("CREATED_DESC"),
});

const adminFilterSchema = listFilterSchema.extend({
  ownerSteamId: z.string().trim().optional().transform((value) => value || undefined).refine((value) => !value || isValidSteamId64(value), { message: "ownerSteamId 格式不正确" }),
});

const createCdkSchema = z.object({
  count: z.coerce.number().int().min(1).max(50).default(1),
  ownerSteamId: z.string().trim().refine(isValidSteamId64, { message: "ownerSteamId 格式不正确" }),
  note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
  expiresAt: optionalDateSchema,
});

const updateCdkSchema = z.object({
  ownerSteamId: z.string().trim().refine(isValidSteamId64, { message: "ownerSteamId 格式不正确" }).optional(),
  note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
  expiresAt: optionalDateSchema.optional(),
  status: z.enum(["ACTIVE", "USED", "REVOKED"]).optional(),
});

const transferSchema = z.object({
  toSteamId: z.string().trim().refine(isValidSteamId64, { message: "toSteamId 格式不正确" }),
});

const redeemSchema = z.object({
  targetSteamId: z.string().trim().refine(isValidSteamId64, { message: "targetSteamId 格式不正确" }),
  qq: z.string().trim().min(5, "QQ号格式不正确").max(MAX_QQ_LENGTH, "QQ号格式不正确").regex(/^\d+$/, "QQ号格式不正确"),
  email: z.string().trim().max(MAX_DB_VARCHAR, "邮箱不能超过 191 个字符").email("邮箱格式不正确"),
});

const whitelistSearchSchema = z.object({
  q: z.string().trim().min(1).max(32),
});

const logQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  actorSteamId: z.string().trim().optional().transform((value) => value || undefined).refine((value) => !value || isValidSteamId64(value), { message: "actorSteamId 格式不正确" }),
  actorRole: z.string().trim().max(32).optional().transform((value) => value || undefined),
  action: z.string().trim().max(64).optional().transform((value) => value || undefined),
  targetType: z.string().trim().max(32).optional().transform((value) => value || undefined),
});

const adminOrderQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  orderNo: z.string().trim().max(64).optional().transform((value) => value || undefined),
  email: z.string().trim().max(MAX_DB_VARCHAR, "邮箱不能超过 191 个字符").optional().transform((value) => value || undefined),
  steamId64: z.string().trim().optional().transform((value) => value || undefined).refine((value) => !value || isValidSteamId64(value), { message: "steamId64 格式不正确" }),
  status: z.enum(["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"]).optional(),
  productType: z.enum(["WHITELIST", "WHITELIST_CDK", "CUSTOM", "CDK"]).optional(),
});

const accessGroupCreateSchema = z.object({
  code: z.string().trim().min(2, "组编码至少 2 位").max(64, "组编码不能超过 64 位").regex(/^[a-z0-9_]+$/i, "组编码仅支持英文、数字、下划线"),
  name: z.string().trim().min(1, "组名称不能为空").max(64, "组名称不能超过 64 位"),
  note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
});

const accessGroupUpdateSchema = z.object({
  name: z.string().trim().min(1, "组名称不能为空").max(64, "组名称不能超过 64 位"),
  note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
});

const accessGroupPermissionSchema = z.object({
  permissions: z.array(z.string().trim()).max(64).default([]),
});

const accessGroupMemberSchema = z.object({
  members: z.array(z.object({
    steamId: z.string().trim().refine(isValidSteamId64, { message: "SteamID64 格式不正确" }),
    note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
  })).max(200).default([]),
});

const directAccessUserSchema = z.object({
  steamId: z.string().trim().refine(isValidSteamId64, { message: "SteamID64 格式不正确" }),
  note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
  permissions: z.array(z.string().trim()).max(64).default([]),
});

const directAccessUserUpdateSchema = z.object({
  note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
  permissions: z.array(z.string().trim()).max(64).default([]),
});

const productCreateSchema = z.object({
  code: z.string().trim().min(3, "商品编码至少 3 位").max(64, "商品编码不能超过 64 位").regex(/^[a-z0-9_]+$/i, "商品编码仅支持英文、数字、下划线"),
  name: z.string().trim().min(1, "商品名称不能为空").max(191, "商品名称过长"),
  description: z.string().trim().max(2000, "填写说明过长").optional(),
  productType: z.enum(["WHITELIST", "WHITELIST_CDK", "CUSTOM", "CDK"]).default("CUSTOM"),
  amountFen: z.coerce.number().int().min(1, "价格必须大于 0"),
  targetDatabase: z.string().trim().max(191).optional(),
  cdkType: z.string().trim().max(64).optional(),
  cdkQuantity: z.coerce.number().int().min(1, "CDK 数量至少为 1").max(100, "CDK 数量不能超过 100").optional(),
  isActive: z.coerce.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
}).superRefine((value, ctx) => {
  if (value.productType === PAY_PRODUCT_TYPES.WHITELIST && !String(value.targetDatabase || "").trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "白名单商品必须填写目标数据库",
      path: ["targetDatabase"],
    });
  }

  if (value.productType === PAY_PRODUCT_TYPES.CDK && !String(value.cdkType || "").trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CDK 商品必须填写类型标识",
      path: ["cdkType"],
    });
  }

  if (value.productType === PAY_PRODUCT_TYPES.WHITELIST_CDK && !(Number(value.cdkQuantity) >= 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "开水服白名单 CDK 必须填写发放数量",
      path: ["cdkQuantity"],
    });
  }
});

const productUpdateSchema = z.object({
  name: z.string().trim().min(1, "商品名称不能为空").max(191, "商品名称过长").optional(),
  description: z.string().trim().max(2000, "填写说明过长").optional(),
  productType: z.enum(["WHITELIST", "WHITELIST_CDK", "CUSTOM", "CDK"]).optional(),
  amountFen: z.coerce.number().int().min(1, "价格必须大于 0").optional(),
  targetDatabase: z.string().trim().max(191).optional(),
  cdkType: z.string().trim().max(64).optional(),
  cdkQuantity: z.coerce.number().int().min(1, "CDK 数量至少为 1").max(100, "CDK 数量不能超过 100").optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
}).superRefine((value, ctx) => {
  if (value.productType === PAY_PRODUCT_TYPES.WHITELIST && !String(value.targetDatabase || "").trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "白名单商品必须填写目标数据库",
      path: ["targetDatabase"],
    });
  }

  if (value.productType === PAY_PRODUCT_TYPES.CDK && !String(value.cdkType || "").trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CDK 商品必须填写类型标识",
      path: ["cdkType"],
    });
  }

  if (value.productType === PAY_PRODUCT_TYPES.WHITELIST_CDK && !(Number(value.cdkQuantity) >= 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "开水服白名单 CDK 必须填写发放数量",
      path: ["cdkQuantity"],
    });
  }
});

const batchManageSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(100),
  action: z.enum(["set-note", "set-owner", "set-status", "delete"]),
  note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
  ownerSteamId: z.string().trim().optional().refine((value) => !value || isValidSteamId64(value), { message: "ownerSteamId 格式不正确" }),
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
});

const manualWhitelistCreateSchema = z.object({
  steamId64: z.string().trim().refine(isValidSteamId64, { message: "SteamID64 格式不正确" }),
  qq: z.string().trim().min(5, "QQ号格式不正确").max(MAX_QQ_LENGTH, "QQ号格式不正确").regex(/^\d+$/, "QQ号格式不正确"),
  note: z.string().trim().max(MAX_DB_VARCHAR, "备注不能超过 191 个字符").optional(),
});

const whitelistMigrationSchema = z
  .object({
    oldSteamId64: z.string().trim().refine(isValidSteamId64, { message: "旧 SteamID64 格式不正确" }),
    newSteamId64: z.string().trim().refine(isValidSteamId64, { message: "新 SteamID64 格式不正确" }),
  })
  .superRefine((value, ctx) => {
    if (value.oldSteamId64 === value.newSteamId64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "新旧 SteamID64 不能相同",
        path: ["newSteamId64"],
      });
    }
  });

const playerSearchSchema = z
  .object({
    userId: z.string().trim().optional(),
    steamId64: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const userId = String(value.userId || "").trim();
    const steamId64 = String(value.steamId64 || "").trim();

    if (!userId && !steamId64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请填写 UID 或 SteamID64",
        path: ["userId"],
      });
      return;
    }

    if (userId && !/^\d+$/.test(userId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UID 格式不正确",
        path: ["userId"],
      });
    }

    if (steamId64 && !isValidSteamId64(steamId64)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SteamID64 格式不正确",
        path: ["steamId64"],
      });
    }
  });

const playerStatsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).optional().default(5000),
});

const serverTrendQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(72).optional().default(48),
});

const mapChallengeQuerySchema = z.object({
  mode: z.enum(["ALL", "pass", "survival"]).optional().default("ALL"),
  mapName: z.string().trim().max(255, "地图名称不能超过 255 个字符").optional().transform((value) => value || undefined),
  stage: z.string().trim().max(255, "阶段名称不能超过 255 个字符").optional().transform((value) => value || undefined),
  sortDirection: z.enum(["default", "asc", "desc"]).optional().default("default"),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(500),
});

const adminMapChallengeListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  mode: z.enum(["ALL", "pass", "survival"]).optional().default("ALL"),
  mapName: z.string().trim().max(255, "地图名称不能超过 255 个字符").optional().transform((value) => value || undefined),
  stage: z.string().trim().max(255, "阶段名称不能超过 255 个字符").optional().transform((value) => value || undefined),
  steamId64: z.string().trim().optional().transform((value) => value || undefined).refine((value) => !value || isValidSteamId64(value), { message: "SteamID64 格式不正确" }),
});

const upsertMapChallengeSchema = z
  .object({
    steamId64: z.string().trim().refine((value) => isValidSteamId64(value), { message: "SteamID64 格式不正确" }),
    mapName: z.string().trim().min(1, "请输入地图名称").max(255, "地图名称不能超过 255 个字符"),
    stage: z.string().trim().min(1, "请输入阶段").max(255, "阶段名称不能超过 255 个字符"),
    mode: z.enum(["pass", "survival"]),
    duration: z.coerce.number().int().min(0).max(864000).optional().default(0),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "survival" && !(Number(value.duration) >= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "survival 模式需要填写存活时间",
        path: ["duration"],
      });
    }
  });

const jsonRecordSchema = z.record(z.string(), z.unknown());

const managedNodeCreateSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[a-z0-9_-]+$/i, "节点编码仅支持英文、数字、下划线和中划线").optional(),
  name: z.string().trim().min(1, "节点名称不能为空").max(64, "节点名称不能超过 64 个字符"),
  host: z.string().trim().max(191, "主机地址过长").optional(),
  note: z.string().trim().max(2000, "备注过长").optional(),
  isActive: z.coerce.boolean().optional().default(true),
});

const managedNodeUpdateSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[a-z0-9_-]+$/i, "节点编码仅支持英文、数字、下划线和中划线").optional(),
  name: z.string().trim().min(1, "节点名称不能为空").max(64, "节点名称不能超过 64 个字符").optional(),
  host: z.string().trim().max(191, "主机地址过长").optional(),
  note: z.string().trim().max(2000, "备注过长").optional(),
  isActive: z.coerce.boolean().optional(),
});

const managedNodeCommandCreateSchema = z.object({
  commandType: z.string().trim().min(1, "命令类型不能为空").max(64, "命令类型过长").regex(/^[a-z0-9._:-]+$/i, "命令类型格式不正确"),
  payload: jsonRecordSchema.optional().default({}),
  expiresInSeconds: z.coerce.number().int().min(10).max(86400).optional(),
});

const managedNodeCommandQuerySchema = z.object({
  nodeId: z.string().trim().optional().transform((value) => value || undefined),
  status: z.enum(["PENDING", "CLAIMED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

const activeNodeCommandQuerySchema = z.object({
  nodeId: z.string().trim().optional().transform((value) => value || undefined),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

const nodeCommandLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(500),
});

const nodeScheduleQuerySchema = z.object({
  nodeId: z.string().trim().optional().transform((value) => value || undefined),
  isActive: z
    .union([z.coerce.boolean(), z.undefined(), z.null()])
    .optional()
    .transform((value) => (typeof value === "boolean" ? value : undefined)),
});

const nodeScheduleCreateSchema = z.object({
  nodeId: z.string().trim().min(1, "节点不能为空"),
  name: z.string().trim().min(1, "任务名称不能为空").max(64, "任务名称不能超过 64 个字符"),
  commandType: z.string().trim().min(1, "命令类型不能为空").max(64, "命令类型过长").regex(/^[a-z0-9._:-]+$/i, "命令类型格式不正确"),
  payload: jsonRecordSchema.optional().default({}),
  notificationChannelKeys: z.array(z.string().trim().min(1).max(64)).max(16, "通知渠道不能超过 16 个").optional().default([]),
  scheduleConfig: z.object({
    type: z.enum(["interval_minutes", "daily", "every_n_days", "every_n_hours"]),
    intervalMinutes: z.coerce.number().int().min(1, "执行间隔至少 1 分钟").max(10080, "执行间隔不能超过 10080 分钟").optional(),
    time: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "执行时间格式必须为 HH:mm").optional(),
    intervalDays: z.coerce.number().int().min(1, "执行天数至少 1 天").max(365, "执行天数不能超过 365 天").optional(),
    anchorDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "开始日期格式必须为 YYYY-MM-DD").optional(),
    intervalHours: z.coerce.number().int().min(1, "执行小时至少 1 小时").max(168, "执行小时不能超过 168 小时").optional(),
    windowStart: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "开始时间格式必须为 HH:mm").optional(),
    windowEnd: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "结束时间格式必须为 HH:mm").optional(),
  }).superRefine((value, ctx) => {
    if (value.type === "interval_minutes" && value.intervalMinutes == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请填写分钟间隔",
        path: ["intervalMinutes"],
      });
    }

    if (value.type === "daily" && !value.time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请填写执行时间",
        path: ["time"],
      });
    }

    if (value.type === "every_n_days") {
      if (value.intervalDays == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写天数间隔",
          path: ["intervalDays"],
        });
      }

      if (!value.anchorDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写开始日期",
          path: ["anchorDate"],
        });
      }

      if (!value.time) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写执行时间",
          path: ["time"],
        });
      }
    }

    if (value.type === "every_n_hours") {
      if (value.intervalHours == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写小时间隔",
          path: ["intervalHours"],
        });
      }

      if (!value.windowStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写开始时间",
          path: ["windowStart"],
        });
      }

      if (!value.windowEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写结束时间",
          path: ["windowEnd"],
        });
      }
    }
  }).optional(),
  intervalMinutes: z.coerce.number().int().min(1, "执行间隔至少 1 分钟").max(10080, "执行间隔不能超过 10080 分钟").optional(),
  nextRunAt: z.string().trim().min(1, "下次执行时间不能为空").optional(),
  isActive: z.coerce.boolean().optional().default(true),
});

const nodeScheduleUpdateSchema = z.object({
  name: z.string().trim().min(1, "任务名称不能为空").max(64, "任务名称不能超过 64 个字符").optional(),
  commandType: z.string().trim().min(1, "命令类型不能为空").max(64, "命令类型过长").regex(/^[a-z0-9._:-]+$/i, "命令类型格式不正确").optional(),
  payload: jsonRecordSchema.optional(),
  notificationChannelKeys: z.array(z.string().trim().min(1).max(64)).max(16, "通知渠道不能超过 16 个").optional(),
  scheduleConfig: z.object({
    type: z.enum(["interval_minutes", "daily", "every_n_days", "every_n_hours"]),
    intervalMinutes: z.coerce.number().int().min(1, "执行间隔至少 1 分钟").max(10080, "执行间隔不能超过 10080 分钟").optional(),
    time: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "执行时间格式必须为 HH:mm").optional(),
    intervalDays: z.coerce.number().int().min(1, "执行天数至少 1 天").max(365, "执行天数不能超过 365 天").optional(),
    anchorDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "开始日期格式必须为 YYYY-MM-DD").optional(),
    intervalHours: z.coerce.number().int().min(1, "执行小时至少 1 小时").max(168, "执行小时不能超过 168 小时").optional(),
    windowStart: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "开始时间格式必须为 HH:mm").optional(),
    windowEnd: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "结束时间格式必须为 HH:mm").optional(),
  }).superRefine((value, ctx) => {
    if (value.type === "interval_minutes" && value.intervalMinutes == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请填写分钟间隔",
        path: ["intervalMinutes"],
      });
    }

    if (value.type === "daily" && !value.time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请填写执行时间",
        path: ["time"],
      });
    }

    if (value.type === "every_n_days") {
      if (value.intervalDays == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写天数间隔",
          path: ["intervalDays"],
        });
      }

      if (!value.anchorDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写开始日期",
          path: ["anchorDate"],
        });
      }

      if (!value.time) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写执行时间",
          path: ["time"],
        });
      }
    }

    if (value.type === "every_n_hours") {
      if (value.intervalHours == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写小时间隔",
          path: ["intervalHours"],
        });
      }

      if (!value.windowStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写开始时间",
          path: ["windowStart"],
        });
      }

      if (!value.windowEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写结束时间",
          path: ["windowEnd"],
        });
      }
    }
  }).optional(),
  intervalMinutes: z.coerce.number().int().min(1, "执行间隔至少 1 分钟").max(10080, "执行间隔不能超过 10080 分钟").optional(),
  nextRunAt: z.string().trim().min(1, "下次执行时间不能为空").optional(),
  isActive: z.coerce.boolean().optional(),
});

const gotifyChannelSchema = z.object({
  key: z.string().trim().max(64, "渠道标识不能超过 64 个字符").optional(),
  name: z.string().trim().min(1, "渠道名称不能为空").max(64, "渠道名称不能超过 64 个字符"),
  serverUrl: z.string().trim().min(1, "Gotify 地址不能为空").max(500, "Gotify 地址过长").url("Gotify 地址格式不正确"),
  token: z.string().trim().min(1, "App Token 不能为空").max(512, "App Token 过长"),
  description: z.string().trim().max(300, "渠道说明不能超过 300 个字符").optional(),
  enabled: z.coerce.boolean().optional().default(true),
  priority: z.coerce.number().int().min(0, "优先级不能小于 0").max(10, "优先级不能超过 10").optional().default(5),
});

const gotifyConfigUpdateSchema = z.object({
  channels: z.array(gotifyChannelSchema).max(32, "通知渠道不能超过 32 个"),
}).superRefine((value, ctx) => {
  const seenKeys = new Set();

  value.channels.forEach((channel, index) => {
    const key = normalizeGotifyChannelKey(channel.key, channel.name || `channel-${index + 1}`);

    if (!key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "渠道标识不能为空",
        path: ["channels", index, "key"],
      });
      return;
    }

    if (seenKeys.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "渠道标识不能重复",
        path: ["channels", index, "key"],
      });
      return;
    }

    seenKeys.add(key);
  });
});

const gotifyTestSchema = z.object({
  channelKeys: z.array(z.string().trim().min(1).max(64)).min(1, "至少选择一个通知渠道").max(16, "通知渠道不能超过 16 个"),
  title: z.string().trim().min(1, "通知标题不能为空").max(160, "通知标题不能超过 160 个字符").optional().default("KEPCS Gotify 测试通知"),
  message: z.string().trim().min(1, "通知内容不能为空").max(4000, "通知内容不能超过 4000 个字符").optional().default("如果你收到了这条消息，说明当前渠道配置可用。"),
  priority: z.coerce.number().int().min(0, "优先级不能小于 0").max(10, "优先级不能超过 10").optional(),
});

const kepcsServerCreateSchema = z.object({
  shotId: z.string().trim().min(1, "ShotID 不能为空").max(64, "ShotID 不能超过 64 个字符"),
  mode: z.string().trim().min(1, "模式不能为空").max(32, "模式不能超过 32 个字符"),
  name: z.string().trim().min(1, "名称不能为空").max(191, "名称不能超过 191 个字符"),
  host: z.string().trim().min(1, "主机地址不能为空").max(191, "主机地址不能超过 191 个字符"),
  port: z.coerce.number().int().min(1, "端口必须大于 0").max(65535, "端口不能超过 65535"),
  defaultMap: z.string().trim().min(1, "默认地图不能为空").max(100, "默认地图不能超过 100 个字符"),
  defaultMapId: z.string().trim().min(1, "WorkshopID 不能为空").max(50, "WorkshopID 不能超过 50 个字符").regex(/^\d+$/, "WorkshopID 格式不正确"),
  rconPassword: z.string().trim().max(100, "RCON 密码不能超过 100 个字符").optional(),
  isActive: z.coerce.boolean().optional().default(true),
});

const kepcsServerUpdateSchema = z.object({
  shotId: z.string().trim().min(1, "ShotID 不能为空").max(64, "ShotID 不能超过 64 个字符").optional(),
  mode: z.string().trim().min(1, "模式不能为空").max(32, "模式不能超过 32 个字符").optional(),
  name: z.string().trim().min(1, "名称不能为空").max(191, "名称不能超过 191 个字符").optional(),
  host: z.string().trim().min(1, "主机地址不能为空").max(191, "主机地址不能超过 191 个字符").optional(),
  port: z.coerce.number().int().min(1, "端口必须大于 0").max(65535, "端口不能超过 65535").optional(),
  defaultMap: z.string().trim().min(1, "默认地图不能为空").max(100, "默认地图不能超过 100 个字符").optional(),
  defaultMapId: z.string().trim().min(1, "WorkshopID 不能为空").max(50, "WorkshopID 不能超过 50 个字符").regex(/^\d+$/, "WorkshopID 格式不正确").optional(),
  rconPassword: z.string().trim().max(100, "RCON 密码不能超过 100 个字符").optional(),
  isActive: z.coerce.boolean().optional(),
});

const communityServerCreateSchema = z.object({
  community: z.string().trim().min(1, "社区标识不能为空").max(64, "社区标识不能超过 64 个字符"),
  name: z.string().trim().min(1, "名称不能为空").max(191, "名称不能超过 191 个字符"),
  host: z.string().trim().min(1, "主机地址不能为空").max(191, "主机地址不能超过 191 个字符"),
  port: z.coerce.number().int().min(1, "端口必须大于 0").max(65535, "端口不能超过 65535"),
  sortOrder: z.coerce.number().int().min(0, "排序不能小于 0").max(9999, "排序不能超过 9999").optional().default(0),
  isActive: z.coerce.boolean().optional().default(true),
});

const communityServerUpdateSchema = z.object({
  community: z.string().trim().min(1, "社区标识不能为空").max(64, "社区标识不能超过 64 个字符").optional(),
  name: z.string().trim().min(1, "名称不能为空").max(191, "名称不能超过 191 个字符").optional(),
  host: z.string().trim().min(1, "主机地址不能为空").max(191, "主机地址不能超过 191 个字符").optional(),
  port: z.coerce.number().int().min(1, "端口必须大于 0").max(65535, "端口不能超过 65535").optional(),
  sortOrder: z.coerce.number().int().min(0, "排序不能小于 0").max(9999, "排序不能超过 9999").optional(),
  isActive: z.coerce.boolean().optional(),
});

const defaultMapMonitorUpdateSchema = z.object({
  enabled: z.coerce.boolean(),
  checkIntervalSeconds: z.coerce.number().int().min(5, "巡检间隔至少 5 秒").max(3600, "巡检间隔不能超过 3600 秒"),
});

const defaultMapMonitorServerUpdateSchema = z.object({
  enabled: z.coerce.boolean(),
  idleThresholdSeconds: z.coerce.number().int().min(30, "空服阈值至少 30 秒").max(86400, "空服阈值不能超过 86400 秒"),
  defaultMap: z.string().trim().min(1, "默认地图不能为空").max(100, "默认地图不能超过 100 个字符").optional(),
  defaultMapId: z.string().trim().min(1, "WorkshopID 不能为空").max(50, "WorkshopID 不能超过 50 个字符").regex(/^\d+$/, "WorkshopID 格式不正确").optional(),
  rconPassword: z.string().trim().max(100, "RCON 密码不能超过 100 个字符").optional(),
});

const idleRestartMonitorUpdateSchema = z.object({
  enabled: z.coerce.boolean(),
  checkIntervalSeconds: z.coerce.number().int().min(5, "巡检间隔至少 5 秒").max(3600, "巡检间隔不能超过 3600 秒"),
});

const idleRestartMonitorServerUpdateSchema = z.object({
  enabled: z.coerce.boolean(),
  windowStart: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "开始时间格式必须为 HH:mm"),
  windowEnd: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "结束时间格式必须为 HH:mm"),
  idleThresholdSeconds: z.coerce.number().int().min(30, "空服阈值至少 30 秒").max(86400, "空服阈值不能超过 86400 秒"),
  restartCooldownSeconds: z.coerce.number().int().min(60, "重启冷却至少 60 秒").max(86400, "重启冷却不能超过 86400 秒"),
});

const serverBatchIdsSchema = z.array(
  z.coerce.number().int().positive("服务器 ID 格式不正确"),
).min(1, "请至少勾选一台服务器")
  .max(200, "单次最多批量修改 200 台服务器");

const defaultMapMonitorBatchUpdateSchema = z.object({
  ids: serverBatchIdsSchema,
  enabled: z.coerce.boolean().optional(),
  idleThresholdSeconds: z.coerce.number().int().min(30, "空服阈值至少 30 秒").max(86400, "空服阈值不能超过 86400 秒").optional(),
  defaultMap: z.string().trim().min(1, "默认地图不能为空").max(100, "默认地图不能超过 100 个字符").optional(),
  defaultMapId: z.string().trim().min(1, "WorkshopID 不能为空").max(50, "WorkshopID 不能超过 50 个字符").regex(/^\d+$/, "WorkshopID 格式不正确").optional(),
  rconPassword: z.string().trim().min(1, "RCON 密码不能为空").max(100, "RCON 密码不能超过 100 个字符").optional(),
}).superRefine((value, ctx) => {
  if (
    value.enabled === undefined
    && value.idleThresholdSeconds === undefined
    && value.defaultMap === undefined
    && value.defaultMapId === undefined
    && value.rconPassword === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "请至少选择一项批量修改内容",
      path: ["ids"],
    });
  }
});

const idleRestartMonitorBatchUpdateSchema = z.object({
  ids: serverBatchIdsSchema,
  enabled: z.coerce.boolean().optional(),
  windowStart: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "开始时间格式必须为 HH:mm").optional(),
  windowEnd: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "结束时间格式必须为 HH:mm").optional(),
  idleThresholdSeconds: z.coerce.number().int().min(30, "空服阈值至少 30 秒").max(86400, "空服阈值不能超过 86400 秒").optional(),
  restartCooldownSeconds: z.coerce.number().int().min(60, "重启冷却至少 60 秒").max(86400, "重启冷却不能超过 86400 秒").optional(),
}).superRefine((value, ctx) => {
  const hasWindowStart = value.windowStart !== undefined;
  const hasWindowEnd = value.windowEnd !== undefined;

  if (hasWindowStart !== hasWindowEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "批量修改时段时必须同时填写开始和结束时间",
      path: [hasWindowStart ? "windowEnd" : "windowStart"],
    });
  }

  if (
    value.enabled === undefined
    && value.windowStart === undefined
    && value.windowEnd === undefined
    && value.idleThresholdSeconds === undefined
    && value.restartCooldownSeconds === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "请至少选择一项批量修改内容",
      path: ["ids"],
    });
  }
});

const agentHeartbeatSchema = z.object({
  agentVersion: z.string().trim().max(64).optional(),
  hostname: z.string().trim().max(191).optional(),
  platform: z.string().trim().max(64).optional(),
  capabilities: z.array(z.string().trim().max(64)).max(128).optional(),
  summary: jsonRecordSchema.optional(),
  stats: jsonRecordSchema.optional(),
  metadata: jsonRecordSchema.optional(),
  servers: z.array(jsonRecordSchema).max(512).optional(),
});

const agentCommandLogsSchema = z.object({
  logs: z.array(z.object({
    level: z.string().trim().max(16).optional(),
    message: z.string().trim().min(1).max(4000),
  })).min(1).max(200),
});

const agentCommandFinishSchema = z.object({
  success: z.coerce.boolean(),
  result: z.unknown().optional(),
  errorMessage: z.string().trim().max(1000).optional(),
  cancelled: z.coerce.boolean().optional().default(false),
});

const commandCancellationSchema = z.object({
  force: z.coerce.boolean().optional().default(false),
  reason: z.string().trim().max(500).optional(),
});

function buildSessionKey(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function sanitizeNextPath(input) {
  const value = String(input || "").trim();
  const isConsolePath =
    value === CONSOLE_BASE_PATH
    || value.startsWith(`${CONSOLE_BASE_PATH}/`)
    || value.startsWith(`${CONSOLE_BASE_PATH}?`);

  if (!value.startsWith("/") || !isConsolePath) {
    return CONSOLE_BASE_PATH;
  }

  return value;
}

function encodeAuthCookie(user) {
  return Buffer.from(
    JSON.stringify({
      steamId: user?.steamId,
      displayName: user?.displayName || "",
      avatarUrl: user?.avatarUrl || "",
      profileUrl: user?.profileUrl || "",
    }),
    "utf8",
  ).toString("base64url");
}

function decodeAuthCookie(request) {
  const raw = request.cookies?.[authCookieName];

  if (!raw || typeof request.unsignCookie !== "function") {
    return null;
  }

  const unsigned = request.unsignCookie(raw);

  if (!unsigned?.valid || !unsigned.value) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(unsigned.value, "base64url").toString("utf8"));
    if (!isValidSteamId64(payload?.steamId)) {
      return null;
    }

    return {
      steamId: payload.steamId,
      displayName: typeof payload.displayName === "string" ? payload.displayName : "",
      avatarUrl: typeof payload.avatarUrl === "string" ? payload.avatarUrl : "",
      profileUrl: typeof payload.profileUrl === "string" ? payload.profileUrl : "",
    };
  } catch (_error) {
    return null;
  }
}

function setAuthCookie(reply, user) {
  reply.setCookie(authCookieName, encodeAuthCookie(user), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    signed: true,
    maxAge: 7 * 24 * 60 * 60,
  });
}

function clearAuthCookie(reply) {
  reply.clearCookie(authCookieName, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
  });
}

function buildAuditTargetIdSummary(prefix, values) {
  const normalizedValues = Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [String(values || "").trim()].filter(Boolean);

  if (!normalizedValues.length) {
    return null;
  }

  const singleValue = normalizedValues[0];

  if (normalizedValues.length === 1 && singleValue.length <= MAX_AUDIT_TARGET_ID) {
    return singleValue;
  }

  const summary = `${String(prefix || "items").trim()}:${normalizedValues.length}`;
  return summary.slice(0, MAX_AUDIT_TARGET_ID);
}

function sanitizeServerCatalogAuditDetail(payload = {}) {
  const normalized = { ...payload };

  if (Object.prototype.hasOwnProperty.call(normalized, "rconPassword")) {
    normalized.hasRconPassword = Boolean(String(normalized.rconPassword || "").trim());
    delete normalized.rconPassword;
  }

  return normalized;
}

function sanitizeAgentCommandAuditDetail(payload = {}) {
  return sanitizeNodeCommandPayload(payload);
}

function normalizeRconTargetMode(value) {
  return String(value || "").trim().toLowerCase() === "servers"
    ? "servers"
    : "group";
}

async function resolveNodeRconCommandPayload(nodeId, payload = {}) {
  const node = await findManagedNodeById(nodeId);

  if (!node) {
    throw new Error("Node not found");
  }

  const command = String(payload.command || "").trim();
  if (!command) {
    throw new Error("请填写 RCON 指令");
  }

  const heartbeatServers = Array.isArray(node.lastHeartbeat?.servers)
    ? node.lastHeartbeat.servers
    : [];

  if (!heartbeatServers.length) {
    throw new Error("当前节点还没有同步服务器列表, 请先执行一次同步容器列表");
  }

  const heartbeatByKey = new Map(
    heartbeatServers
      .map((server) => [String(server?.key || "").trim(), server])
      .filter(([key]) => key),
  );

  const targetMode = normalizeRconTargetMode(payload.targetMode);
  const group = String(payload.group || "ALL").trim() || "ALL";

  let targetServers = [];

  if (targetMode === "servers") {
    const serverKeys = normalizeNodeCommandServerKeys([
      ...(Array.isArray(payload.serverKeys) ? payload.serverKeys : []),
      ...(Array.isArray(payload.targets) ? payload.targets.map((target) => target?.key) : []),
    ]);

    if (!serverKeys.length) {
      throw new Error("请至少选择一台服务器");
    }

    const missingKeys = serverKeys.filter((key) => !heartbeatByKey.has(key));
    if (missingKeys.length) {
      throw new Error(`以下服务器未出现在当前节点心跳中: ${missingKeys.join(", ")}`);
    }

    targetServers = serverKeys.map((key) => heartbeatByKey.get(key));
  } else {
    targetServers = group === "ALL"
      ? heartbeatServers
      : heartbeatServers.filter((server) => Array.isArray(server?.groups) && server.groups.includes(group));

    if (!targetServers.length) {
      throw new Error(group === "ALL"
        ? "当前节点没有可执行 RCON 的服务器"
        : `分组 ${group} 下没有可执行 RCON 的服务器`);
    }
  }

  const targetServerKeys = normalizeNodeCommandServerKeys(targetServers.map((server) => server?.key));
  const catalogServers = await listKepcsServers({ includeSecrets: true });
  const catalogByShotId = new Map(
    catalogServers
      .map((server) => [String(server?.shotId || "").trim(), server])
      .filter(([shotId]) => shotId),
  );

  const missingCatalogKeys = [];
  const missingPasswordKeys = [];
  const targets = [];

  for (const serverKey of targetServerKeys) {
    const catalogServer = catalogByShotId.get(serverKey);
    if (!catalogServer) {
      missingCatalogKeys.push(serverKey);
      continue;
    }

    const password = String(catalogServer.rconPassword || "").trim();
    if (!password) {
      missingPasswordKeys.push(serverKey);
      continue;
    }

    targets.push({
      key: serverKey,
      password,
    });
  }

  if (missingCatalogKeys.length) {
    throw new Error(`以下服务器未在官网服务器目录中找到: ${missingCatalogKeys.join(", ")}`);
  }

  if (missingPasswordKeys.length) {
    throw new Error(`以下服务器未配置 RCON 密码: ${missingPasswordKeys.join(", ")}`);
  }

  return {
    command,
    targetMode,
    ...(targetMode === "group" ? { group } : {}),
    serverKeys: targetServerKeys,
    targets,
  };
}

function assertDefaultMapMonitorServerConfig(server) {
  const defaultMap = String(server?.defaultMap || "").trim();
  const defaultMapId = String(server?.defaultMapId || "").trim();
  const rconPassword = String(server?.rconPassword || "").trim();

  if (!defaultMap || !defaultMapId || !rconPassword) {
    throw new Error("启用空服自动换图前，请先补齐默认地图、WorkshopID 和 RCON 密码");
  }
}

function assertIdleRestartMonitorServerConfig(server) {
  const shotId = String(server?.shotId || "").trim();

  if (!shotId) {
    throw new Error("启用空服自动重启前，请先为该服务器填写 ShotID");
  }
}

function uniqueServerIds(ids) {
  return Array.from(new Set((ids || []).map((value) => String(value))));
}

function buildDefaultMapMonitorNextServer(currentServer, payload) {
  return {
    ...currentServer,
    defaultMapMonitorEnabled: payload.enabled ?? currentServer.defaultMapMonitorEnabled,
    defaultMapIdleThresholdSeconds:
      payload.idleThresholdSeconds ?? currentServer.defaultMapIdleThresholdSeconds,
    defaultMap: Object.prototype.hasOwnProperty.call(payload, "defaultMap")
      ? payload.defaultMap
      : currentServer.defaultMap,
    defaultMapId: Object.prototype.hasOwnProperty.call(payload, "defaultMapId")
      ? payload.defaultMapId
      : currentServer.defaultMapId,
    rconPassword: payload.rconPassword
      ? payload.rconPassword
      : currentServer.rconPassword,
  };
}

function buildDefaultMapMonitorServerPatch(payload) {
  return {
    ...(payload.enabled !== undefined ? { default_map_monitor_enabled: payload.enabled } : {}),
    ...(payload.idleThresholdSeconds !== undefined ? { default_map_idle_threshold_seconds: payload.idleThresholdSeconds } : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, "defaultMap") ? { default_map: payload.defaultMap } : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, "defaultMapId") ? { default_map_id: payload.defaultMapId } : {}),
    ...(payload.rconPassword ? { rcon_pwd: payload.rconPassword } : {}),
  };
}

async function updateDefaultMapMonitorServers(ids, payload) {
  const targetIds = uniqueServerIds(ids);
  const currentServers = await Promise.all(
    targetIds.map((id) => findKepcsServerById(id, { includeSecrets: true })),
  );
  const nextServers = currentServers.map((server) => buildDefaultMapMonitorNextServer(server, payload));

  nextServers.forEach((server) => {
    if (server.defaultMapMonitorEnabled) {
      assertDefaultMapMonitorServerConfig(server);
    }
  });

  const nextPayload = buildDefaultMapMonitorServerPatch(payload);
  return Promise.all(targetIds.map((id) => updateKepcsServer(id, nextPayload)));
}

function buildIdleRestartMonitorNextServer(currentServer, payload) {
  return {
    ...currentServer,
    idleRestartEnabled: payload.enabled ?? currentServer.idleRestartEnabled,
    idleRestartWindowStart: payload.windowStart ?? currentServer.idleRestartWindowStart,
    idleRestartWindowEnd: payload.windowEnd ?? currentServer.idleRestartWindowEnd,
    idleRestartThresholdSeconds:
      payload.idleThresholdSeconds ?? currentServer.idleRestartThresholdSeconds,
    idleRestartCooldownSeconds:
      payload.restartCooldownSeconds ?? currentServer.idleRestartCooldownSeconds,
  };
}

function buildIdleRestartMonitorServerPatch(payload) {
  return {
    ...(payload.enabled !== undefined ? { idle_restart_enabled: payload.enabled } : {}),
    ...(payload.windowStart !== undefined ? { idle_restart_window_start: payload.windowStart } : {}),
    ...(payload.windowEnd !== undefined ? { idle_restart_window_end: payload.windowEnd } : {}),
    ...(payload.idleThresholdSeconds !== undefined ? { idle_restart_threshold_seconds: payload.idleThresholdSeconds } : {}),
    ...(payload.restartCooldownSeconds !== undefined ? { idle_restart_cooldown_seconds: payload.restartCooldownSeconds } : {}),
  };
}

async function updateIdleRestartMonitorServers(ids, payload) {
  const targetIds = uniqueServerIds(ids);
  const currentServers = await Promise.all(
    targetIds.map((id) => findKepcsServerById(id, { includeSecrets: true })),
  );
  const nextServers = currentServers.map((server) => buildIdleRestartMonitorNextServer(server, payload));

  nextServers.forEach((server) => {
    if (server.idleRestartEnabled) {
      assertIdleRestartMonitorServerConfig(server);
    }
  });

  const nextPayload = buildIdleRestartMonitorServerPatch(payload);
  return Promise.all(targetIds.map((id) => updateKepcsServer(id, nextPayload)));
}

async function buildSessionUser(steamId, fallback = {}, options = {}) {
  const { hydrateProfile = false } = options;
  const access = await resolveConsoleAccess(steamId, {
    isRoot: env.rootSteamIds.includes(steamId),
  });
  let displayName = String(fallback.displayName || "").trim();
  let avatarUrl = String(fallback.avatarUrl || "").trim();
  let profileUrl = String(fallback.profileUrl || "").trim();

  if (hydrateProfile && (!displayName || !avatarUrl || !profileUrl)) {
    try {
      const profile = await fetchSteamProfile(steamId);
      displayName = displayName || profile.displayName;
      avatarUrl = avatarUrl || profile.avatarUrl || "";
      profileUrl = profileUrl || profile.profileUrl || "";
    } catch (_error) {
      profileUrl = profileUrl || `https://steamcommunity.com/profiles/${steamId}`;
    }
  }

  const displayRoleName =
    access.role === "root"
      ? "超级管理员"
      : access.isStaff
        ? (access.groupNames[0] || "控制台成员")
        : "白名单玩家";

  return {
    steamId,
    role: access.role,
    isRoot: access.isRoot,
    isStaff: access.isStaff,
    permissions: access.permissions,
    groupCodes: access.groupCodes,
    groupNames: access.groupNames,
    displayRoleName,
    displayName: displayName || steamId,
    avatarUrl: avatarUrl || null,
    profileUrl: profileUrl || `https://steamcommunity.com/profiles/${steamId}`,
  };
}

async function ensureWhitelistedSessionUser(request, reply) {
  let user = getSessionUser(request);

  if (!user?.steamId) {
    user = decodeAuthCookie(request);
  }

  if (!user?.steamId) {
    return null;
  }

  if (!(await isSteamIdInRemoteWhitelist(user.steamId))) {
    clearSessionUser(request);
    clearAuthCookie(reply);
    return null;
  }

  return user;
}

function sendValidationError(reply, error, fallback = "请求参数错误") {
  return reply.code(400).send({
    success: false,
    message: error.issues?.[0]?.message || fallback,
  });
}

function sendConflictError(reply, message) {
  return reply.code(409).send({
    success: false,
    message,
  });
}

function sendNotFoundError(reply, message) {
  return reply.code(404).send({
    success: false,
    message,
  });
}

function isPrismaUniqueError(error) {
  return error && typeof error === "object" && error.code === "P2002";
}

function sendSpa(reply) {
  if (assetRoot === webDistDir) {
    return reply.sendFile("index.html");
  }

  return reply.sendFile("index.html", publicDir);
}

function isValidQq(value) {
  return /^[1-9]\d{4,19}$/.test(String(value || "").trim());
}

function isValidEmail(value) {
  const normalized = String(value || "").trim();
  return normalized.length <= MAX_DB_VARCHAR && z.string().email().safeParse(normalized).success;
}

async function requireAgentNode(request, reply) {
  const apiKey = extractAgentApiKey(request.headers || {});

  if (!apiKey) {
    return reply.code(401).send({
      success: false,
      message: "缺少 Agent API Key",
    });
  }

  const node = await findManagedNodeByApiKeyFromHeaders(request.headers || {});

  if (!node) {
    return reply.code(403).send({
      success: false,
      message: "Agent 鉴权失败",
    });
  }

  if (!node.isActive) {
    return reply.code(403).send({
      success: false,
      message: "当前节点已被禁用",
    });
  }

  request.agentNode = node;
}

async function validateOrderPayloadByProduct(payload, product) {
  const productType = normalizeProductType(product?.productType);
  const steamId64 = String(payload.steamId64 || "").trim();
  const qq = String(payload.qq || "").trim();
  const email = String(payload.email || "").trim();
  const remark = String(payload.remark || "").trim();

  if (productType === PAY_PRODUCT_TYPES.WHITELIST) {
    if (!isValidSteamId64(steamId64)) {
      return "SteamID64 格式不正确";
    }

    if (!isValidQq(qq)) {
      return "QQ号格式不正确";
    }

    if (!isValidEmail(email)) {
      return "邮箱格式不正确";
    }
  }

  if (productType === PAY_PRODUCT_TYPES.CUSTOM) {
    if (!remark) {
      return "请填写备注信息";
    }
  }

  if (
    productType === PAY_PRODUCT_TYPES.CDK
    || productType === PAY_PRODUCT_TYPES.WHITELIST_CDK
  ) {
    if (!isValidSteamId64(steamId64)) {
      return productType === PAY_PRODUCT_TYPES.WHITELIST_CDK
        ? "开水服白名单 CDK 必须填写有效的 SteamID64"
        : "CDK 商品必须填写有效的 SteamID64";
    }

    if (!(await isSteamIdInRemoteWhitelist(steamId64))) {
      return "该 SteamID64 不在开水服白名单中";
    }
  }

  if (email && !isValidEmail(email)) {
    return "邮箱格式不正确";
  }

  return null;
}

async function createFastifyApp() {
  await ensureRedisConnected();

  const app = Fastify({
    trustProxy: env.trustProxy,
    bodyLimit: 16 * 1024,
    logger: false,
  });

  app.register(fastifyCookie, {
    secret: env.sessionSecret,
  });
  app.register(fastifyFormbody);
  app.register(fastifySecureSession, {
    key: buildSessionKey(env.sessionSecret),
    cookie: {
      path: "/",
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    },
  });
  app.register(fastifyStatic, {
    root: assetRoot,
    prefix: `${env.appBasePath || ""}/`,
    decorateReply: true,
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Permitted-Cross-Domain-Policies", "none");
    reply.header("Referrer-Policy", "same-origin");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header("Origin-Agent-Cluster", "?1");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data: https:",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "connect-src 'self' https:",
        "form-action 'self'",
      ].join("; "),
    );

    if (env.nodeEnv === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    if (
      request.url.startsWith("/site/api/") ||
      request.url.startsWith("/pay/api/") ||
      request.url.startsWith(CONSOLE_API_BASE_PATH) ||
      request.url.startsWith(CONSOLE_AUTH_BASE_PATH) ||
      request.url.startsWith("/agent/api/") ||
      request.url.startsWith("/query")
    ) {
      reply.header("Cache-Control", "no-store");
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (
      !request.url.startsWith(CONSOLE_BASE_PATH) &&
      !request.url.startsWith(CONSOLE_API_BASE_PATH) &&
      !request.url.startsWith(CONSOLE_AUTH_BASE_PATH)
    ) {
      return;
    }

    const sessionUser = getSessionUser(request);

    if (sessionUser?.steamId) {
      return;
    }

    const cookieUser = decodeAuthCookie(request);

    if (!cookieUser?.steamId) {
      return;
    }

    const hydratedUser = await buildSessionUser(cookieUser.steamId, cookieUser);
    setSessionUser(request, hydratedUser);
    setAuthCookie(reply, hydratedUser);
  });

  app.get("/pay/api/health", { preHandler: publicApiRateLimit }, async () => ({
    ok: true,
    service: "kepcs-pay",
    now: new Date().toISOString(),
  }));

  app.get("/site/api/server-list", { preHandler: publicApiRateLimit }, async (_request, reply) => {
    const payload = await fetchServerList();
    return reply.send({ success: true, ...payload });
  });

  app.get("/site/api/player-search", { preHandler: [requireUser, queryRateLimit] }, async (request, reply) => {
    try {
      const sessionUser = await ensureWhitelistedSessionUser(request, reply);

      if (!sessionUser?.steamId) {
        return reply.code(403).send({ success: false, message: "当前 Steam 账号不在开水服白名单中。" });
      }

      const payload = playerSearchSchema.parse(request.query || {});
      const player = await findPlayerProfile({
        userId: payload.userId ? Number(payload.userId) : undefined,
        steamId: payload.steamId64,
      });

      if (!player) {
        return reply.code(404).send({ success: false, message: "没有找到对应玩家信息" });
      }

      return reply.send({ success: true, player });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "查询参数错误");
      }

      throw error;
    }
  });

  app.get("/site/api/player-stats", { preHandler: publicApiRateLimit }, async (request, reply) => {
    try {
      const payload = playerStatsSchema.parse(request.query || {});
      const stats = await fetchPlayerStats({ limit: payload.limit });
      return reply.send({ success: true, stats });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "统计参数错误");
      }

      throw error;
    }
  });

  app.get("/site/api/server-trends", { preHandler: publicApiRateLimit }, async (request, reply) => {
    try {
      const payload = serverTrendQuerySchema.parse(request.query || {});
      const trend = await listServerTrendSnapshots({ hours: payload.hours });
      return reply.send({ success: true, trend });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "统计参数错误");
      }

      throw error;
    }
  });

  app.get("/site/api/map-challenge-rankings", { preHandler: publicApiRateLimit }, async (request, reply) => {
    try {
      const payload = mapChallengeQuerySchema.parse(request.query || {});
      const leaderboard = await listMapChallengeLeaderboard(payload);
      return reply.send({ success: true, leaderboard });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "排行榜参数错误");
      }

      throw error;
    }
  });

  app.get("/pay/api/products", { preHandler: publicApiRateLimit }, async (_request, reply) => {
    const products = await listActiveProducts();
    return reply.send({ success: true, products });
  });

  app.post("/pay/api/orders", { preHandler: createOrderRateLimit }, async (request, reply) => {
    try {
      const payload = createOrderSchema.parse(request.body || {});
      const product = await getActiveProductByCode(payload.productCode);

      if (!product) {
        return reply.code(400).send({ success: false, message: "当前商品不可用, 请刷新页面后重试。" });
      }

      const validationMessage = await validateOrderPayloadByProduct(payload, product);

      if (validationMessage) {
        return reply.code(400).send({ success: false, message: validationMessage });
      }

      if (
        product.productType === PAY_PRODUCT_TYPES.WHITELIST &&
        await isSteamIdAlreadyWhitelisted(payload.steamId64, product.targetDatabase)
      ) {
        return reply.code(409).send({ success: false, message: "该 SteamID64 已经存在于白名单中，无需重复购买。" });
      }

      const localOrder = await createPendingOrder({ ...payload, product });
      const remoteOrder = await createRemoteOrder(localOrder, ipKey(request), payload.paymentType);
      await attachRemoteOrder(localOrder.id, remoteOrder);

      return reply.code(201).send({
        success: true,
        order: buildStatusPayload({ ...localOrder, providerResponse: remoteOrder.rawResponse }),
        gateway: { code: remoteOrder.code, message: remoteOrder.message },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "Invalid request");
      }

      if (error.details) {
        return reply.code(502).send({
          success: false,
          message: error.message,
          gateway: error.details,
        });
      }

      throw error;
    }
  });

  app.get("/pay/api/orders/:orderNo", { preHandler: orderStatusRateLimit }, async (request, reply) => {
    const order = await getOrderByOrderNo(request.params.orderNo);

    if (!order) {
      return reply.code(404).send({ success: false, message: "Order not found" });
    }

    return reply.send({ success: true, order: buildStatusPayload(order) });
  });

  app.get("/pay/api/orders", { preHandler: orderSearchRateLimit }, async (request, reply) => {
    try {
      const payload = orderQuerySchema.parse(request.query || {});
      const orders = await queryOrdersByEmail(payload);
      return reply.send({ success: true, orders: orders.map(buildStatusPayload) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "查询参数错误");
      }

      throw error;
    }
  });

  async function handleNotify(request, reply) {
    const callbackPayload = request.method === "GET" ? request.query : request.body;
    const signatureValid = verifyCallback(callbackPayload);
    const normalized = normalizeCallback(callbackPayload);
    const order = normalized.orderNo ? await getOrderByOrderNo(normalized.orderNo) : null;
    const callback = await recordCallback({
      rawBody: callbackPayload,
      signatureValid,
      orderId: order?.id,
    });

    if (!signatureValid) {
      return reply.code(400).type("text/plain").send("invalid-signature");
    }

    if (!order) {
      return reply.code(404).type("text/plain").send("order-not-found");
    }

    if (!normalized.isPaid) {
      await markCallbackProcessed(callback.id);
      return reply.type("text/plain").send(env.zhupayCallbackSuccessResponse);
    }

    if (order.status === "PAID") {
      if (order.productType === PAY_PRODUCT_TYPES.WHITELIST) {
        await enqueueWhitelistWrite(order);
      } else {
        await fulfillPaidOrder(order);
      }
      await markCallbackProcessed(callback.id);
      return reply.type("text/plain").send(env.zhupayCallbackSuccessResponse);
    }

    const paidAt = parseProviderTimestamp(normalized.timestamp);

    if (normalized.timestamp && !paidAt) {
      return reply.code(400).type("text/plain").send("invalid-timestamp");
    }

    if (normalized.timestamp && !isWithinTolerance(paidAt, env.zhupayTimestampToleranceSeconds)) {
      return reply.code(400).type("text/plain").send("timestamp-out-of-range");
    }

    const updatedOrder = await markOrderPaid({
      order,
      callbackId: callback.id,
      providerOrderId: normalized.providerOrderId,
      amountText: normalized.amount,
      paidAt: paidAt || new Date(),
    });

    if (updatedOrder.productType === PAY_PRODUCT_TYPES.WHITELIST) {
      await enqueueWhitelistWrite(updatedOrder);
    } else {
      await fulfillPaidOrder(updatedOrder);
    }
    return reply.type("text/plain").send(env.zhupayCallbackSuccessResponse);
  }

  app.get("/pay/api/notify", handleNotify);
  app.post("/pay/api/notify", handleNotify);

  app.get("/console/api/auth/me", { preHandler: authStatusRateLimit }, async (request, reply) => {
    const user = await ensureWhitelistedSessionUser(request, reply);

    if (!user?.steamId) {
      return reply.send({ success: true, authenticated: false, user: null });
    }

    const sessionUser = await buildSessionUser(user.steamId, user, { hydrateProfile: true });
    setSessionUser(request, sessionUser);
    setAuthCookie(reply, sessionUser);
    return reply.send({ success: true, authenticated: true, user: sessionUser });
  });

  app.get("/console/api/auth/avatar/:steamId", { preHandler: authStatusRateLimit }, async (request, reply) => {
    const steamId = String(request.params?.steamId || "").trim();

    if (!isValidSteamId64(steamId)) {
      return reply.code(400).send({
        success: false,
        message: "steamId 格式不正确",
      });
    }

    try {
      const profile = await fetchSteamProfile(steamId);

      if (profile?.avatarUrl) {
        reply.header("Cache-Control", "public, max-age=600");
        return reply.redirect(profile.avatarUrl);
      }
    } catch (_error) {
      // ignore and fall through
    }

    return reply.code(404).send({
      success: false,
      message: "未找到头像",
    });
  });

  app.get("/console/auth/steam", { preHandler: steamLoginRateLimit }, async (request, reply) => {
    request.session.set("afterLoginRedirect", sanitizeNextPath(request.query.next || CONSOLE_BASE_PATH));
    return reply.redirect(
      buildSteamLoginUrl({
        realm: env.steamOpenIdRealm,
        returnTo: env.steamOpenIdReturnUrl,
      }),
    );
  });

  app.get("/console/auth/steam/callback", { preHandler: steamCallbackRateLimit }, async (request, reply) => {
    try {
      const isValid = await verifySteamCallback(request.query);

      if (!isValid) {
        return reply.redirect(`${CONSOLE_BASE_PATH}?error=steam-verify-failed`);
      }

      const steamId = extractSteamIdFromClaimedId(request.query["openid.claimed_id"]);

      if (!steamId) {
        return reply.redirect(`${CONSOLE_BASE_PATH}?error=steam-id-missing`);
      }

      if (!(await isSteamIdInRemoteWhitelist(steamId))) {
        clearSessionUser(request);
        clearAuthCookie(reply);
        return reply.redirect(`${CONSOLE_BASE_PATH}?error=not-whitelisted`);
      }

      const sessionUser = await buildSessionUser(steamId, {}, { hydrateProfile: true });

      setSessionUser(request, sessionUser);
      setAuthCookie(reply, sessionUser);
      const redirectTo = sanitizeNextPath(request.session.get("afterLoginRedirect") || CONSOLE_BASE_PATH);
      request.session.delete("afterLoginRedirect");

      await writeAuditLog({
        actorSteamId: steamId,
        actorRole: sessionUser.role,
        action: "auth.login",
        targetType: "session",
        targetId: steamId,
        detail: { redirectTo },
      });

      return reply.redirect(redirectTo);
    } catch (error) {
      const status = error?.response?.status;

      if ([502, 503, 504].includes(status) || error?.code) {
        return reply.redirect(`${CONSOLE_BASE_PATH}?error=steam-network-failed`);
      }

      throw error;
    }
  });

  app.post("/console/api/auth/logout", { preHandler: authStatusRateLimit }, async (request, reply) => {
    clearSessionUser(request);
    request.session.delete("afterLoginRedirect");
    clearAuthCookie(reply);
    return reply.send({ success: true });
  });

  app.get("/console/api/cdks/me", { preHandler: [requireUser, queryRateLimit] }, async (request, reply) => {
    try {
      const user = getSessionUser(request);
      const filters = listFilterSchema.parse(request.query || {});
      const cdks = await listUserCdks(user.steamId, filters);
      return reply.send({ success: true, user, cdks });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.get("/console/api/cdks/manage", { preHandler: [requirePermission("console.manage_cdks"), queryRateLimit] }, async (request, reply) => {
    try {
      const filters = adminFilterSchema.parse(request.query || {});
      const cdks = await listAllCdks(filters);
      return reply.send({ success: true, cdks });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.post("/console/api/cdks/manage", { preHandler: [requirePermission("console.manage_cdks"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = createCdkSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const cdks = await createCdks({ ...payload, createdBySteamId: user.steamId });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "cdk.create",
        targetType: "cdk",
        targetId: buildAuditTargetIdSummary("cdk-created", cdks.map((item) => item.id)),
        detail: {
          ...payload,
          createdIds: cdks.map((item) => item.id),
        },
      });

      return reply.code(201).send({ success: true, cdks });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.patch("/console/api/cdks/manage/:id", { preHandler: [requirePermission("console.manage_cdks"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = updateCdkSchema.parse(request.body || {});
      const cdk = await updateCdkAdmin(request.params.id, payload);
      const user = getSessionUser(request);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "cdk.update",
        targetType: "cdk",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, cdk });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.delete("/console/api/cdks/manage/:id", { preHandler: [requirePermission("console.manage_cdks"), adminWriteRateLimit] }, async (request, reply) => {
    const user = getSessionUser(request);
    await deleteCdkAdmin(request.params.id);
    await writeAuditLog({
      actorSteamId: user.steamId,
      actorRole: user.role,
      action: "cdk.delete",
      targetType: "cdk",
      targetId: request.params.id,
      detail: {},
    });
    return reply.send({ success: true });
  });

  app.post("/console/api/cdks/manage/batch", { preHandler: [requirePermission("console.manage_cdks"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = batchManageSchema.parse(request.body || {});
      const user = getSessionUser(request);

      if (payload.action === "delete") {
        await batchDeleteCdks(payload.ids);
      } else {
        const patch = {};

        if (payload.action === "set-note") {
          patch.note = payload.note || "";
        } else if (payload.action === "set-owner") {
          patch.ownerSteamId = payload.ownerSteamId;
        } else if (payload.action === "set-status") {
          patch.status = payload.status;
        }

        await batchUpdateCdks(payload.ids, patch);
      }

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: `cdk.batch.${payload.action}`,
        targetType: "cdk",
        targetId: buildAuditTargetIdSummary(`cdk-batch-${payload.action}`, payload.ids),
        detail: payload,
      });

      return reply.send({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.post("/console/api/cdks/:id/transfer", { preHandler: [requirePermission("console.manage_cdks"), cdkWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = transferSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const cdk = await transferCdk({
        id: request.params.id,
        actorSteamId: user.steamId,
        toSteamId: payload.toSteamId,
        canManageAll: Boolean(user.isRoot),
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "cdk.transfer",
        targetType: "cdk",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, cdk });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.get("/console/api/cdks/whitelist-search", { preHandler: [requireUser, whitelistSearchRateLimit] }, async (request, reply) => {
    try {
      const payload = whitelistSearchSchema.parse(request.query || {});
      const rows = await searchRemoteWhitelist(payload.q);
      return reply.send({ success: true, rows });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.post("/console/api/cdks/:id/redeem", { preHandler: [requireUser, cdkWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = redeemSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const cdk = await redeemCdk({
        id: request.params.id,
        actorSteamId: user.steamId,
        targetSteamId: payload.targetSteamId,
        qq: payload.qq,
        email: payload.email,
        canManageAll: Boolean(user.isRoot),
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "cdk.redeem",
        targetType: "cdk",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, cdk });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.get("/console/api/logs", { preHandler: [requirePermission("console.logs.audit"), logQueryRateLimit] }, async (request, reply) => {
    try {
      const payload = logQuerySchema.parse(request.query || {});
      const logs = await listAuditLogs(payload);
      return reply.send({ success: true, logs });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.get("/console/api/orders", { preHandler: [requirePermission("console.logs.orders"), queryRateLimit] }, async (request, reply) => {
    try {
      const payload = adminOrderQuerySchema.parse(request.query || {});
      const orders = await listAdminOrders(payload);
      return reply.send({ success: true, orders: orders.map(buildStatusPayload) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "查询参数错误");
      }

      throw error;
    }
  });

  app.get("/console/api/access", { preHandler: [requirePermission("console.access.manage"), queryRateLimit] }, async (_request, reply) => {
    const overview = await listAccessOverview();
    return reply.send({ success: true, ...overview });
  });

  app.post("/console/api/access/groups", { preHandler: [requirePermission("console.access.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = accessGroupCreateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const group = await createAccessGroup({
        code: payload.code,
        name: payload.name,
        note: payload.note,
        createdBySteamId: user.steamId,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "access.group.create",
        targetType: "access-group",
        targetId: group?.id || payload.code,
        detail: payload,
      });

      return reply.code(201).send({ success: true, group });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "权限组参数错误");
      }

      if (isPrismaUniqueError(error) || error?.code === "ER_DUP_ENTRY") {
        return sendConflictError(reply, "组编码已存在, 请更换后重试。");
      }

      throw error;
    }
  });

  app.patch("/console/api/access/groups/:id", { preHandler: [requirePermission("console.access.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = accessGroupUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const group = await updateAccessGroup(request.params.id, payload);

      if (!group) {
        return sendNotFoundError(reply, "权限组不存在");
      }

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "access.group.update",
        targetType: "access-group",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, group });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "权限组参数错误");
      }

      throw error;
    }
  });

  app.put("/console/api/access/groups/:id/permissions", { preHandler: [requirePermission("console.access.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = accessGroupPermissionSchema.parse(request.body || {});
      const normalizedPermissions = normalizePermissionList(payload.permissions, { editableOnly: true });
      const user = getSessionUser(request);
      const group = await replaceAccessGroupPermissions(request.params.id, normalizedPermissions);

      if (!group) {
        return sendNotFoundError(reply, "权限组不存在");
      }

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "access.group.permissions",
        targetType: "access-group",
        targetId: request.params.id,
        detail: { permissions: normalizedPermissions },
      });

      return reply.send({ success: true, group });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "权限参数错误");
      }

      throw error;
    }
  });

  app.put("/console/api/access/groups/:id/members", { preHandler: [requirePermission("console.access.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = accessGroupMemberSchema.parse(request.body || {});
      const user = getSessionUser(request);

      for (const member of payload.members) {
        if (!(await isSteamIdInRemoteWhitelist(member.steamId))) {
          return reply.code(400).send({ success: false, message: `${member.steamId} 不在开水服白名单中。` });
        }
      }

      const group = await replaceAccessGroupMembers(request.params.id, payload.members);

      if (!group) {
        return sendNotFoundError(reply, "权限组不存在");
      }

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "access.group.members",
        targetType: "access-group",
        targetId: request.params.id,
        detail: {
          members: payload.members.map((item) => ({
            steamId: item.steamId,
            note: item.note || null,
          })),
        },
      });

      return reply.send({ success: true, group });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "成员参数错误");
      }

      throw error;
    }
  });

  app.delete("/console/api/access/groups/:id", { preHandler: [requirePermission("console.access.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const user = getSessionUser(request);
      await deleteAccessGroup(request.params.id);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "access.group.delete",
        targetType: "access-group",
        targetId: request.params.id,
        detail: {},
      });

      return reply.send({ success: true });
    } catch (error) {
      if (error?.message === "Group not found") {
        return sendNotFoundError(reply, "权限组不存在");
      }

      if (error?.message === "System group cannot be deleted") {
        return sendConflictError(reply, "系统权限组不允许删除。");
      }

      throw error;
    }
  });

  app.post("/console/api/access/users", { preHandler: [requirePermission("console.access.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = directAccessUserSchema.parse(request.body || {});
      const user = getSessionUser(request);

      if (!(await isSteamIdInRemoteWhitelist(payload.steamId))) {
        return reply.code(400).send({ success: false, message: "该 SteamID 不在开水服白名单中。" });
      }

      const directUser = await upsertDirectAccessUser({
        steamId: payload.steamId,
        note: payload.note,
        permissionKeys: payload.permissions,
        createdBySteamId: user.steamId,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "access.user.upsert",
        targetType: "access-user",
        targetId: payload.steamId,
        detail: {
          note: payload.note || null,
          permissions: normalizePermissionList(payload.permissions, { editableOnly: true }),
        },
      });

      return reply.code(201).send({ success: true, user: directUser });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "直授权限参数错误");
      }

      throw error;
    }
  });

  app.patch("/console/api/access/users/:steamId", { preHandler: [requirePermission("console.access.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = directAccessUserUpdateSchema.parse(request.body || {});
      const steamId = String(request.params.steamId || "").trim();
      const user = getSessionUser(request);

      if (!isValidSteamId64(steamId)) {
        return reply.code(400).send({ success: false, message: "SteamID64 格式不正确" });
      }

      if (!(await isSteamIdInRemoteWhitelist(steamId))) {
        return reply.code(400).send({ success: false, message: "该 SteamID 不在开水服白名单中。" });
      }

      const directUser = await upsertDirectAccessUser({
        steamId,
        note: payload.note,
        permissionKeys: payload.permissions,
        createdBySteamId: user.steamId,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "access.user.update",
        targetType: "access-user",
        targetId: steamId,
        detail: {
          note: payload.note || null,
          permissions: normalizePermissionList(payload.permissions, { editableOnly: true }),
        },
      });

      return reply.send({ success: true, user: directUser });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "直授权限参数错误");
      }

      throw error;
    }
  });

  app.delete("/console/api/access/users/:steamId", { preHandler: [requirePermission("console.access.manage"), adminWriteRateLimit] }, async (request, reply) => {
    const user = getSessionUser(request);
    await deleteDirectAccessUser(request.params.steamId);

    await writeAuditLog({
      actorSteamId: user.steamId,
      actorRole: user.role,
      action: "access.user.delete",
      targetType: "access-user",
      targetId: request.params.steamId,
      detail: {},
    });

    return reply.send({ success: true });
  });

  app.get("/console/api/products/manage", { preHandler: [requirePermission("console.products.manage"), queryRateLimit] }, async (_request, reply) => {
    const products = await listAllProducts();
    return reply.send({ success: true, products });
  });

  app.get("/console/api/map-challenges", { preHandler: [requirePermission("console.map_challenges"), queryRateLimit] }, async (request, reply) => {
    try {
      const payload = adminMapChallengeListSchema.parse(request.query || {});
      const rows = await listAdminMapChallengeRecords({
        limit: payload.limit,
        mode: payload.mode,
        mapName: payload.mapName,
        stage: payload.stage,
        steamId: payload.steamId64,
      });
      return reply.send({ success: true, rows });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "查询参数错误");
      }

      throw error;
    }
  });

  app.post("/console/api/map-challenges", { preHandler: [requirePermission("console.map_challenges"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = upsertMapChallengeSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const result = await upsertMapChallengeRecord({
        steamId: payload.steamId64,
        mapName: payload.mapName,
        stage: payload.stage,
        mode: payload.mode,
        duration: payload.duration,
      });

      await writeAuditLog({
        actorSteamId: user?.steamId,
        actorRole: user?.role,
        action: result.skipped ? `map_challenge.${result.operation}` : "map_challenge.upsert",
        targetType: "map_challenge",
        targetId: `${payload.steamId64}:${payload.mapName}:${payload.stage}:${payload.mode}`,
        detail: {
          steamId64: payload.steamId64,
          mapName: payload.mapName,
          stage: payload.stage,
          mode: payload.mode,
          duration: payload.mode === "survival" ? payload.duration : 0,
          skipped: result.skipped,
          operation: result.operation,
        },
      });

      return reply.send({ success: true, ...result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "录入参数错误");
      }

      throw error;
    }
  });

  app.post("/console/api/whitelist/manual", { preHandler: [requirePermission("console.whitelist.manual"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = manualWhitelistCreateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const result = await createManualWhitelistEntry({
        steamId64: payload.steamId64,
        qq: payload.qq,
        note: payload.note,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "whitelist.manual_create",
        targetType: "whitelist",
        targetId: payload.steamId64,
        detail: {
          steamId64: payload.steamId64,
          qq: payload.qq,
          note: payload.note || null,
          databaseName: result.databaseName,
        },
      });

      return reply.code(201).send({ success: true, result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "新增白名单参数错误");
      }

      throw error;
    }
  });

  app.post("/console/api/whitelist/migrate", { preHandler: [requirePermission("console.whitelist.migration"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = whitelistMigrationSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const result = await migrateWhitelistSteamId({
        oldSteamId64: payload.oldSteamId64,
        newSteamId64: payload.newSteamId64,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "whitelist.migrate_steam",
        targetType: "whitelist",
        targetId: payload.oldSteamId64,
        detail: {
          oldSteamId64: payload.oldSteamId64,
          newSteamId64: payload.newSteamId64,
          databaseName: result.databaseName,
          affectedRows: result.affectedRows,
        },
      });

      return reply.send({ success: true, result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "数据迁移参数错误");
      }

      throw error;
    }
  });

  app.post("/console/api/products/manage", { preHandler: [requirePermission("console.products.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = productCreateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const product = await createProduct(payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "product.create",
        targetType: "product",
        targetId: product.id,
        detail: payload,
      });

      return reply.code(201).send({ success: true, product });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.patch("/console/api/products/manage/:id", { preHandler: [requirePermission("console.products.manage"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = productUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const product = await updateProduct(request.params.id, payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "product.update",
        targetType: "product",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, product });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error);
      }

      throw error;
    }
  });

  app.get("/console/api/agent/nodes", { preHandler: [requireAnyPermission(["console.agents.nodes", "console.agents.control", "console.agents.commands", "console.agents.schedules"]), queryRateLimit] }, async (_request, reply) => {
    const nodes = await listManagedNodes();
    return reply.send({ success: true, nodes });
  });

  app.post("/console/api/agent/nodes", { preHandler: [requirePermission("console.agents.nodes"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = managedNodeCreateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const created = await createManagedNode(payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.node.create",
        targetType: "agent-node",
        targetId: created.node.id,
        detail: {
          ...payload,
          apiKeyIssued: true,
        },
      });

      return reply.code(201).send({ success: true, ...created });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "节点参数错误");
      }

      if (isPrismaUniqueError(error)) {
        return sendConflictError(reply, "节点编码已存在, 请更换后重试。");
      }

      throw error;
    }
  });

  app.patch("/console/api/agent/nodes/:id", { preHandler: [requirePermission("console.agents.nodes"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = managedNodeUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const node = await updateManagedNode(request.params.id, payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.node.update",
        targetType: "agent-node",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, node });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "节点参数错误");
      }

      if (error?.message === "Node not found") {
        return sendNotFoundError(reply, "节点不存在");
      }

      if (isPrismaUniqueError(error)) {
        return sendConflictError(reply, "节点编码已存在, 请更换后重试。");
      }

      throw error;
    }
  });

  app.post("/console/api/agent/nodes/:id/rotate-key", { preHandler: [requirePermission("console.agents.nodes"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const user = getSessionUser(request);
      const rotated = await rotateManagedNodeApiKey(request.params.id);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.node.rotate_key",
        targetType: "agent-node",
        targetId: request.params.id,
        detail: { apiKeyIssued: true },
      });

      return reply.send({ success: true, ...rotated });
    } catch (error) {
      if (error?.message === "Node not found") {
        return sendNotFoundError(reply, "节点不存在");
      }

      throw error;
    }
  });

  app.get("/console/api/agent/commands", { preHandler: [requirePermission("console.agents.logs"), queryRateLimit] }, async (request, reply) => {
    try {
      const payload = managedNodeCommandQuerySchema.parse(request.query || {});
      const commands = await listNodeCommands(payload);
      return reply.send({ success: true, commands });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "命令查询参数错误");
      }

      throw error;
    }
  });

  app.get("/console/api/agent/commands/active", { preHandler: [requireAnyPermission(["console.agents.commands", "console.agents.logs"]), queryRateLimit] }, async (request, reply) => {
    try {
      const payload = activeNodeCommandQuerySchema.parse(request.query || {});
      const commands = await listNodeCommands({
        nodeId: payload.nodeId,
        limit: payload.limit,
        statuses: ["PENDING", "CLAIMED", "RUNNING"],
      });
      return reply.send({ success: true, commands });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "进行中命令查询参数错误");
      }

      throw error;
    }
  });

  app.post("/console/api/agent/commands/:id/cancel", { preHandler: [requirePermission("console.agents.commands"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = commandCancellationSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const command = await requestNodeCommandCancellation(request.params.id, {
        ...payload,
        requestedBySteamId: user.steamId,
        requestedByRole: user.role,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: payload.force ? "agent.command.force_cancel" : "agent.command.cancel",
        targetType: "agent-command",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, command });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "命令取消参数错误");
      }

      if (error?.message === "Command not found") {
        return sendNotFoundError(reply, "命令不存在");
      }

      throw error;
    }
  });

  app.get("/console/api/agent/schedules", { preHandler: [requirePermission("console.agents.schedules"), queryRateLimit] }, async (request, reply) => {
    try {
      const payload = nodeScheduleQuerySchema.parse(request.query || {});
      const schedules = await listNodeSchedules(payload);
      return reply.send({ success: true, schedules });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "定时任务查询参数错误");
      }

      throw error;
    }
  });

  app.post("/console/api/agent/schedules", { preHandler: [requirePermission("console.agents.schedules"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = nodeScheduleCreateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const schedule = await createNodeSchedule({
        ...payload,
        createdBySteamId: user.steamId,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.schedule.create",
        targetType: "agent-schedule",
        targetId: schedule.id,
        detail: payload,
      });

      return reply.code(201).send({ success: true, schedule });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "定时任务参数错误");
      }

      throw error;
    }
  });

  app.patch("/console/api/agent/schedules/:id", { preHandler: [requirePermission("console.agents.schedules"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = nodeScheduleUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const schedule = await updateNodeSchedule(request.params.id, payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.schedule.update",
        targetType: "agent-schedule",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, schedule });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "定时任务参数错误");
      }

      if (error?.code === "P2025") {
        return sendNotFoundError(reply, "定时任务不存在");
      }

      throw error;
    }
  });

  app.delete("/console/api/agent/schedules/:id", { preHandler: [requirePermission("console.agents.schedules"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const user = getSessionUser(request);
      await deleteNodeSchedule(request.params.id);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.schedule.delete",
        targetType: "agent-schedule",
        targetId: request.params.id,
      });

      return reply.send({ success: true });
    } catch (error) {
      if (error?.code === "P2025") {
        return sendNotFoundError(reply, "定时任务不存在");
      }

      throw error;
    }
  });

  app.get("/console/api/agent/notifications/gotify", { preHandler: [requirePermission("console.agents.schedules"), queryRateLimit] }, async (_request, reply) => {
    const config = await getGotifyConfig();
    return reply.send({
      success: true,
      config: serializeGotifyConfig(config, { includeToken: true }),
    });
  });

  app.patch("/console/api/agent/notifications/gotify", { preHandler: [requirePermission("console.agents.schedules"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = gotifyConfigUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const config = await updateGotifyConfig(payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.notifications.gotify.update",
        targetType: "agent-notification-gotify",
        targetId: "gotify",
        detail: {
          channelCount: config.channels.length,
          channels: config.channels.map((channel) => ({
            key: channel.key,
            name: channel.name,
            serverUrl: channel.serverUrl,
            enabled: channel.enabled,
            priority: channel.priority,
            hasToken: Boolean(channel.token),
          })),
        },
      });

      return reply.send({
        success: true,
        config: serializeGotifyConfig(config, { includeToken: true }),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "Gotify 渠道参数错误");
      }

      throw error;
    }
  });

  app.post("/console/api/agent/notifications/gotify/test", { preHandler: [requirePermission("console.agents.schedules"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = gotifyTestSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const matchedChannels = await resolveGotifyChannels(payload.channelKeys, { includeDisabled: false });

      if (!matchedChannels.length) {
        return reply.code(400).send({ success: false, message: "未找到可用的通知渠道，请先检查配置或启用状态。" });
      }

      const result = await sendGotifyNotification({
        channelKeys: payload.channelKeys,
        title: payload.title,
        message: payload.message,
        priority: payload.priority,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.notifications.gotify.test",
        targetType: "agent-notification-gotify",
        targetId: "gotify",
        detail: {
          channelKeys: payload.channelKeys,
          delivered: result.delivered,
          failed: result.failed,
        },
      });

      if (result.delivered === 0 && result.failed > 0) {
        const firstError = result.results.find((item) => !item.success)?.error || "测试通知发送失败";
        return reply.code(502).send({ success: false, message: firstError, result });
      }

      return reply.send({ success: true, result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "Gotify 测试参数错误");
      }

      throw error;
    }
  });

  app.get("/console/api/agent/commands/:id/logs", { preHandler: [requirePermission("console.agents.logs"), queryRateLimit] }, async (request, reply) => {
    try {
      const payload = nodeCommandLogQuerySchema.parse(request.query || {});
      const logs = await listNodeCommandLogs(request.params.id, payload.limit);
      return reply.send({ success: true, logs });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "日志查询参数错误");
      }

      throw error;
    }
  });

  app.post("/console/api/agent/nodes/:id/commands", { preHandler: [requirePermission("console.agents.control"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = managedNodeCommandCreateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const normalizedCommandPayload = payload.commandType === "node.rcon_command"
        ? await resolveNodeRconCommandPayload(request.params.id, payload.payload)
        : payload.payload;
      const command = await createNodeCommand({
        nodeId: request.params.id,
        commandType: payload.commandType,
        payload: normalizedCommandPayload,
        expiresInSeconds: payload.expiresInSeconds,
        createdBySteamId: user.steamId,
        createdByRole: user.role,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "agent.command.create",
        targetType: "agent-command",
        targetId: command.id,
        detail: {
          nodeId: request.params.id,
          commandType: payload.commandType,
          payload: sanitizeAgentCommandAuditDetail(normalizedCommandPayload),
          expiresInSeconds: payload.expiresInSeconds || null,
        },
      });

      return reply.code(201).send({ success: true, command });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "命令参数错误");
      }

      if (error?.message === "Node not found") {
        return sendNotFoundError(reply, "节点不存在");
      }

      if (
        error?.message === "请填写 RCON 指令"
        || error?.message === "请至少选择一台服务器"
        || error?.message === "当前节点还没有同步服务器列表, 请先执行一次同步容器列表"
        || String(error?.message || "").includes("以下服务器未出现在当前节点心跳中:")
        || String(error?.message || "").includes("以下服务器未在官网服务器目录中找到:")
        || String(error?.message || "").includes("以下服务器未配置 RCON 密码:")
        || String(error?.message || "").includes("下没有可执行 RCON 的服务器")
        || error?.message === "当前节点没有可执行 RCON 的服务器"
      ) {
        return reply.code(400).send({
          success: false,
          message: error.message,
        });
      }

      throw error;
    }
  });

  app.get("/console/api/server-catalog/kepcs", { preHandler: [requirePermission("console.server_catalog.kepcs"), queryRateLimit] }, async (_request, reply) => {
    const servers = await listKepcsServers();
    return reply.send({ success: true, servers });
  });

  app.get("/console/api/server-catalog/kepcs/default-map-monitor", { preHandler: [requirePermission("console.server_catalog.default_map"), queryRateLimit] }, async (_request, reply) => {
    const status = await getDefaultMapMonitorStatus();
    return reply.send({ success: true, ...status });
  });

  app.get("/console/api/server-catalog/kepcs/default-map-monitor/servers", { preHandler: [requirePermission("console.server_catalog.default_map"), queryRateLimit] }, async (_request, reply) => {
    const servers = await listKepcsServers();
    return reply.send({ success: true, servers });
  });

  app.patch("/console/api/server-catalog/kepcs/default-map-monitor", { preHandler: [requirePermission("console.server_catalog.default_map"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = defaultMapMonitorUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const config = await updateDefaultMapMonitorConfig(payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.default_map_monitor.update",
        targetType: "default-map-monitor",
        targetId: "default-map-monitor",
        detail: payload,
      });

      return reply.send({ success: true, config });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "巡检配置参数错误");
      }

      throw error;
    }
  });

  app.patch("/console/api/server-catalog/kepcs/:id/default-map-monitor", { preHandler: [requirePermission("console.server_catalog.default_map"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = defaultMapMonitorServerUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const [server] = await updateDefaultMapMonitorServers([request.params.id], payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.default_map_monitor.server.update",
        targetType: "kepcs-server",
        targetId: request.params.id,
        detail: {
          enabled: payload.enabled,
          idleThresholdSeconds: payload.idleThresholdSeconds,
          ...(Object.prototype.hasOwnProperty.call(payload, "defaultMap") ? { defaultMap: payload.defaultMap } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, "defaultMapId") ? { defaultMapId: payload.defaultMapId } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, "rconPassword") ? { hasRconPassword: Boolean(String(payload.rconPassword || "").trim()) } : {}),
        },
      });

      return reply.send({ success: true, server });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "单服换图配置参数错误");
      }

      if (error?.message === "Server not found") {
        return sendNotFoundError(reply, "服务器不存在");
      }

      if (error?.message === "启用空服自动换图前，请先补齐默认地图、WorkshopID 和 RCON 密码") {
        return reply.code(400).send({ success: false, message: error.message });
      }

      throw error;
    }
  });

  app.patch("/console/api/server-catalog/kepcs/default-map-monitor/batch", { preHandler: [requirePermission("console.server_catalog.default_map"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = defaultMapMonitorBatchUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const servers = await updateDefaultMapMonitorServers(payload.ids, payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.default_map_monitor.batch_update",
        targetType: "kepcs-server",
        targetId: "batch",
        detail: {
          ids: uniqueServerIds(payload.ids),
          enabled: payload.enabled,
          idleThresholdSeconds: payload.idleThresholdSeconds,
          defaultMap: payload.defaultMap,
          defaultMapId: payload.defaultMapId,
          ...(Object.prototype.hasOwnProperty.call(payload, "rconPassword")
            ? { hasRconPassword: Boolean(String(payload.rconPassword || "").trim()) }
            : {}),
          updatedCount: servers.length,
        },
      });

      return reply.send({ success: true, servers });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "批量换图配置参数错误");
      }

      if (error?.message === "Server not found") {
        return sendNotFoundError(reply, "服务器不存在");
      }

      if (error?.message === "启用空服自动换图前，请先补齐默认地图、WorkshopID 和 RCON 密码") {
        return reply.code(400).send({ success: false, message: error.message });
      }

      throw error;
    }
  });

  app.post("/console/api/server-catalog/kepcs/default-map-monitor/run", { preHandler: [requirePermission("console.server_catalog.default_map"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const user = getSessionUser(request);
      const status = await runDefaultMapMonitorSweep({
        ignoreEnabled: true,
        ignoreIdleThreshold: true,
        auditContext: {
          actorSteamId: user.steamId,
          actorRole: user.role,
        },
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.default_map_monitor.run",
        targetType: "default-map-monitor",
        targetId: "default-map-monitor",
        detail: {
          switchedCount: status.runtime?.lastSummary?.switchedCount || 0,
        },
      });

      return reply.send({ success: true, ...status });
    } catch (error) {
      if (error?.message === "空服巡检正在执行中") {
        return sendConflictError(reply, "空服巡检正在执行中");
      }

      throw error;
    }
  });

  app.get("/console/api/server-catalog/kepcs/idle-restart-monitor", { preHandler: [requirePermission("console.server_catalog.idle_restart"), queryRateLimit] }, async (_request, reply) => {
    const status = await getIdleRestartMonitorStatus();
    return reply.send({ success: true, ...status });
  });

  app.get("/console/api/server-catalog/kepcs/idle-restart-monitor/servers", { preHandler: [requirePermission("console.server_catalog.idle_restart"), queryRateLimit] }, async (_request, reply) => {
    const servers = await listKepcsServers();
    return reply.send({ success: true, servers });
  });

  app.patch("/console/api/server-catalog/kepcs/idle-restart-monitor", { preHandler: [requirePermission("console.server_catalog.idle_restart"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = idleRestartMonitorUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const config = await updateIdleRestartMonitorConfig(payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.idle_restart_monitor.update",
        targetType: "idle-restart-monitor",
        targetId: "idle-restart-monitor",
        detail: payload,
      });

      return reply.send({ success: true, config });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "空服重启配置参数错误");
      }

      throw error;
    }
  });

  app.patch("/console/api/server-catalog/kepcs/:id/idle-restart-monitor", { preHandler: [requirePermission("console.server_catalog.idle_restart"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = idleRestartMonitorServerUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const [server] = await updateIdleRestartMonitorServers([request.params.id], payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.idle_restart_monitor.server.update",
        targetType: "kepcs-server",
        targetId: request.params.id,
        detail: {
          enabled: payload.enabled,
          windowStart: payload.windowStart,
          windowEnd: payload.windowEnd,
          idleThresholdSeconds: payload.idleThresholdSeconds,
          restartCooldownSeconds: payload.restartCooldownSeconds,
        },
      });

      return reply.send({ success: true, server });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "单服重启配置参数错误");
      }

      if (error?.message === "Server not found") {
        return sendNotFoundError(reply, "服务器不存在");
      }

      if (error?.message === "启用空服自动重启前，请先为该服务器填写 ShotID") {
        return reply.code(400).send({ success: false, message: error.message });
      }

      throw error;
    }
  });

  app.patch("/console/api/server-catalog/kepcs/idle-restart-monitor/batch", { preHandler: [requirePermission("console.server_catalog.idle_restart"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = idleRestartMonitorBatchUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const servers = await updateIdleRestartMonitorServers(payload.ids, payload);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.idle_restart_monitor.batch_update",
        targetType: "kepcs-server",
        targetId: "batch",
        detail: {
          ids: uniqueServerIds(payload.ids),
          enabled: payload.enabled,
          windowStart: payload.windowStart,
          windowEnd: payload.windowEnd,
          idleThresholdSeconds: payload.idleThresholdSeconds,
          restartCooldownSeconds: payload.restartCooldownSeconds,
          updatedCount: servers.length,
        },
      });

      return reply.send({ success: true, servers });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "批量重启配置参数错误");
      }

      if (error?.message === "Server not found") {
        return sendNotFoundError(reply, "服务器不存在");
      }

      if (error?.message === "启用空服自动重启前，请先为该服务器填写 ShotID") {
        return reply.code(400).send({ success: false, message: error.message });
      }

      throw error;
    }
  });

  app.post("/console/api/server-catalog/kepcs/idle-restart-monitor/run", { preHandler: [requirePermission("console.server_catalog.idle_restart"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const user = getSessionUser(request);
      const status = await runIdleRestartMonitorSweep({
        ignoreEnabled: true,
        ignoreWindow: true,
        auditContext: {
          actorSteamId: user.steamId,
          actorRole: user.role,
        },
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.idle_restart_monitor.run",
        targetType: "idle-restart-monitor",
        targetId: "idle-restart-monitor",
        detail: {
          queuedCount: status.runtime?.lastSummary?.queuedCount || 0,
        },
      });

      return reply.send({ success: true, ...status });
    } catch (error) {
      if (error?.message === "空服重启巡检正在执行中") {
        return sendConflictError(reply, "空服重启巡检正在执行中");
      }

      throw error;
    }
  });

  app.post("/console/api/server-catalog/kepcs", { preHandler: [requirePermission("console.server_catalog.kepcs"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = kepcsServerCreateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const server = await createKepcsServer({
        shotid: payload.shotId,
        mode: payload.mode,
        name: payload.name,
        host: payload.host,
        port: payload.port,
        rcon_pwd: payload.rconPassword,
        default_map: payload.defaultMap,
        default_map_id: payload.defaultMapId,
        is_active: payload.isActive,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.create",
        targetType: "kepcs-server",
        targetId: server.id,
        detail: sanitizeServerCatalogAuditDetail(payload),
      });

      return reply.code(201).send({ success: true, server });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "服务器参数错误");
      }

      if (error?.message === "Server not found") {
        return sendNotFoundError(reply, "服务器不存在");
      }

      throw error;
    }
  });

  app.patch("/console/api/server-catalog/kepcs/:id", { preHandler: [requirePermission("console.server_catalog.kepcs"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = kepcsServerUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const server = await updateKepcsServer(request.params.id, {
        ...(Object.prototype.hasOwnProperty.call(payload, "shotId") ? { shotid: payload.shotId } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "mode") ? { mode: payload.mode } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "name") ? { name: payload.name } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "host") ? { host: payload.host } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "port") ? { port: payload.port } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "defaultMap") ? { default_map: payload.defaultMap } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "defaultMapId") ? { default_map_id: payload.defaultMapId } : {}),
        ...(payload.rconPassword ? { rcon_pwd: payload.rconPassword } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "isActive") ? { is_active: payload.isActive } : {}),
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.update",
        targetType: "kepcs-server",
        targetId: request.params.id,
        detail: sanitizeServerCatalogAuditDetail(payload),
      });

      return reply.send({ success: true, server });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "服务器参数错误");
      }

      if (error?.message === "Server not found") {
        return sendNotFoundError(reply, "服务器不存在");
      }

      throw error;
    }
  });

  app.delete("/console/api/server-catalog/kepcs/:id", { preHandler: [requirePermission("console.server_catalog.kepcs"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const user = getSessionUser(request);
      await deleteKepcsServer(request.params.id);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.kepcs.delete",
        targetType: "kepcs-server",
        targetId: request.params.id,
      });

      return reply.send({ success: true });
    } catch (error) {
      if (error?.message === "Server not found") {
        return sendNotFoundError(reply, "服务器不存在");
      }

      throw error;
    }
  });

  app.get("/console/api/server-catalog/community", { preHandler: [requirePermission("console.server_catalog.community"), queryRateLimit] }, async (_request, reply) => {
    const servers = await listCommunityServers();
    return reply.send({ success: true, servers });
  });

  app.post("/console/api/server-catalog/community", { preHandler: [requirePermission("console.server_catalog.community"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = communityServerCreateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const server = await createCommunityServer({
        community: payload.community,
        name: payload.name,
        host: payload.host,
        port: payload.port,
        sort_order: payload.sortOrder,
        is_active: payload.isActive,
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.community.create",
        targetType: "community-server",
        targetId: server.id,
        detail: payload,
      });

      return reply.code(201).send({ success: true, server });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "社区服参数错误");
      }

      throw error;
    }
  });

  app.patch("/console/api/server-catalog/community/:id", { preHandler: [requirePermission("console.server_catalog.community"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const payload = communityServerUpdateSchema.parse(request.body || {});
      const user = getSessionUser(request);
      const server = await updateCommunityServer(request.params.id, {
        ...(Object.prototype.hasOwnProperty.call(payload, "community") ? { community: payload.community } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "name") ? { name: payload.name } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "host") ? { host: payload.host } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "port") ? { port: payload.port } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "sortOrder") ? { sort_order: payload.sortOrder } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "isActive") ? { is_active: payload.isActive } : {}),
      });

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.community.update",
        targetType: "community-server",
        targetId: request.params.id,
        detail: payload,
      });

      return reply.send({ success: true, server });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "社区服参数错误");
      }

      if (error?.message === "Community server not found") {
        return sendNotFoundError(reply, "社区服不存在");
      }

      throw error;
    }
  });

  app.delete("/console/api/server-catalog/community/:id", { preHandler: [requirePermission("console.server_catalog.community"), adminWriteRateLimit] }, async (request, reply) => {
    try {
      const user = getSessionUser(request);
      await deleteCommunityServer(request.params.id);

      await writeAuditLog({
        actorSteamId: user.steamId,
        actorRole: user.role,
        action: "server_catalog.community.delete",
        targetType: "community-server",
        targetId: request.params.id,
      });

      return reply.send({ success: true });
    } catch (error) {
      if (error?.message === "Community server not found") {
        return sendNotFoundError(reply, "社区服不存在");
      }

      throw error;
    }
  });

  app.get("/agent/api/me", { preHandler: [agentApiRateLimit, requireAgentNode] }, async (request, reply) => {
    return reply.send({
      success: true,
      node: serializeManagedNode(request.agentNode),
    });
  });

  app.post("/agent/api/heartbeat", { preHandler: [agentApiRateLimit, requireAgentNode] }, async (request, reply) => {
    try {
      const payload = agentHeartbeatSchema.parse(request.body || {});
      const node = await recordManagedNodeHeartbeat(
        request.agentNode.id,
        payload,
        resolveClientIp(request),
      );

      return reply.send({ success: true, node, now: new Date().toISOString() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "心跳参数错误");
      }

      throw error;
    }
  });

  app.post("/agent/api/commands/claim", { preHandler: [agentApiRateLimit, requireAgentNode] }, async (request, reply) => {
    const command = await claimNextNodeCommand(request.agentNode.id);
    return reply.send({ success: true, command });
  });

  app.get("/agent/api/commands/:id", { preHandler: [agentApiRateLimit, requireAgentNode] }, async (request, reply) => {
    const command = await getNodeCommandById(request.params.id, { includeSecrets: true });

    if (!command || command.nodeId !== request.agentNode.id) {
      return sendNotFoundError(reply, "命令不存在");
    }

    return reply.send({ success: true, command });
  });

  app.post("/agent/api/commands/:id/start", { preHandler: [agentApiRateLimit, requireAgentNode] }, async (request, reply) => {
    try {
      const command = await markNodeCommandStarted(request.agentNode.id, request.params.id);
      return reply.send({ success: true, command });
    } catch (error) {
      if (error?.message === "Command not found") {
        return sendNotFoundError(reply, "命令不存在");
      }

      throw error;
    }
  });

  app.post("/agent/api/commands/:id/logs", { preHandler: [agentApiRateLimit, requireAgentNode] }, async (request, reply) => {
    try {
      const payload = agentCommandLogsSchema.parse(request.body || {});
      const logs = await appendNodeCommandLogs(request.agentNode.id, request.params.id, payload.logs);
      return reply.send({ success: true, logs });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "日志参数错误");
      }

      if (error?.message === "Command not found") {
        return sendNotFoundError(reply, "命令不存在");
      }

      throw error;
    }
  });

  app.post("/agent/api/commands/:id/finish", { preHandler: [agentApiRateLimit, requireAgentNode] }, async (request, reply) => {
    try {
      const payload = agentCommandFinishSchema.parse(request.body || {});
      const command = await finishNodeCommand(request.agentNode.id, request.params.id, payload);
      return reply.send({ success: true, command });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(reply, error, "命令结果参数错误");
      }

      if (error?.message === "Command not found") {
        return sendNotFoundError(reply, "命令不存在");
      }

      throw error;
    }
  });

  app.get("/", { preHandler: pageRateLimit }, (_request, reply) => sendSpa(reply));
  app.get("/pay", { preHandler: pageRateLimit }, (_request, reply) => sendSpa(reply));
  app.get("/pay/result", { preHandler: pageRateLimit }, (_request, reply) => sendSpa(reply));
  app.get("/query", { preHandler: pageRateLimit }, (_request, reply) => sendSpa(reply));
  app.get("/player", { preHandler: pageRateLimit }, (_request, reply) => sendSpa(reply));
  app.get("/stats", { preHandler: pageRateLimit }, (_request, reply) => sendSpa(reply));
  app.get(CONSOLE_BASE_PATH, { preHandler: pageRateLimit }, (_request, reply) => sendSpa(reply));

  app.setNotFoundHandler((request, reply) => {
    if (
      request.url.startsWith("/site/api")
      || request.url.startsWith("/pay/api")
      || request.url.startsWith(CONSOLE_API_BASE_PATH)
      || request.url.startsWith(CONSOLE_AUTH_BASE_PATH)
      || request.url.startsWith("/agent/api")
    ) {
      return reply.code(404).send({
        success: false,
        message: `Route not found: ${request.method} ${request.url}`,
      });
    }

    const custom404 = path.join(publicDir, "404.html");

    if (fs.existsSync(custom404)) {
      return reply.type("text/html").send(fs.readFileSync(custom404, "utf8"));
    }

    return reply.code(404).type("text/plain").send("404 Not Found");
  });

  app.setErrorHandler((error, _request, reply) => {
    console.error(error);
    const statusCode = Number(error.statusCode || error.status || 500);
    const isSafeClientError = statusCode >= 400 && statusCode < 500;
    const message =
      env.nodeEnv === "production" && !isSafeClientError
        ? "Internal server error"
        : error.message || "Internal server error";

    reply.code(statusCode).send({
      success: false,
      message,
    });
  });

  return app;
}

module.exports = {
  createFastifyApp,
};
