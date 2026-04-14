const path = require("node:path");
const { config } = require("dotenv");
const { z } = require("zod");

config();

function replaceDatabaseName(databaseUrl, databaseName) {
  const url = new URL(databaseUrl.replace(/^mysql:\/\//i, "mysql://"));
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function normalizeBasePath(value) {
  const raw = String(value || "/pay").trim();

  if (!raw || raw === "/") {
    return "";
  }

  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => value === "true");

const jsonObjectFromString = z
  .string()
  .default("{}")
  .transform((value, ctx) => {
    try {
      const parsed = JSON.parse(value);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must be a JSON object string",
      });
      return z.NEVER;
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `invalid JSON: ${error.message}`,
      });
      return z.NEVER;
    }
  });

const stringArrayFromCsv = z
  .string()
  .default("")
  .transform((value) =>
    String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: booleanFromString.default(false),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  APP_BASE_PATH: z.string().default("/pay"),
  CDK_BASE_PATH: z.string().default("/console"),
  PUBLIC_SITE_NAME: z.string().default("KepCs 开水服"),
  SESSION_SECRET: z.string().min(16).default("change-this-session-secret"),
  ROOT_STEAM_IDS: stringArrayFromCsv.default("76561199267457975"),
  ADMIN_STEAM_IDS: stringArrayFromCsv,
  STEAM_WEB_API_KEY: z.string().default(""),
  WHITELIST_API_URL: z.string().url().default("https://kepapi.kaish.cn/api/kepcs/whitelist"),
  WHITELIST_API_KEY: z.string().default("kaish"),
  SERVER_LIST_API_URL: z.string().url().default("https://kepapi.kaish.cn/api/kepcs/serverlist"),
  SERVER_LIST_API_KEY: z.string().default("kaish"),
  OUTBOUND_PROXY_ENABLED: booleanFromString.default(false),
  OUTBOUND_PROXY_PROTOCOL: z.enum(["http", "https"]).default("http"),
  OUTBOUND_PROXY_HOST: z.string().default("127.0.0.1"),
  OUTBOUND_PROXY_PORT: z.coerce.number().int().positive().default(7890),
  SMTP_ENABLED: booleanFromString.default(false),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromString.default(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM_NAME: z.string().default("KepCs 开水服"),
  SMTP_FROM_EMAIL: z.string().default(""),
  SMTP_REPLY_TO: z.string().default(""),
  REDIS_ENABLED: booleanFromString.default(true),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(""),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OFFICIAL_WHITELIST_DATABASE: z.string().default("cs2_kepcore"),
  SERVER_CATALOG_DATABASE: z.string().default("cs2_serverlist"),
  ORDER_PRICE_FEN: z.coerce.number().int().positive().default(5000),
  ORDER_SUBJECT: z.string().default("CS2 开水服白名单 (一位)"),
  ZHUPAY_BASE_URL: z.string().url(),
  ZHUPAY_CREATE_ORDER_PATH: z.string().min(1),
  ZHUPAY_QUERY_ORDER_PATH: z.string().optional(),
  ZHUPAY_API_VERSION: z.string().default("2.0"),
  ZHUPAY_MERCHANT_NO: z.string().min(1),
  ZHUPAY_PAYMENT_CHANNEL: z.string().optional(),
  ZHUPAY_NOTIFY_URL: z.string().url().optional(),
  ZHUPAY_RETURN_URL: z.string().url().optional(),
  ZHUPAY_CREATE_EXTRA_FIELDS: jsonObjectFromString,
  ZHUPAY_SIGN_FIELD: z.string().default("sign"),
  ZHUPAY_SIGN_TYPE: z.string().default("SHA256WithRSA"),
  ZHUPAY_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  ZHUPAY_CALLBACK_SUCCESS_RESPONSE: z.string().default("success"),
  ZHUPAY_MERCHANT_PRIVATE_KEY_PATH: z.string().min(1),
  ZHUPAY_PLATFORM_PUBLIC_KEY_PATH: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Environment validation failed:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

if (data.SMTP_ENABLED) {
  const missing = [];

  if (!String(data.SMTP_HOST || "").trim()) {
    missing.push("SMTP_HOST");
  }

  if (!String(data.SMTP_USER || "").trim()) {
    missing.push("SMTP_USER");
  }

  if (!String(data.SMTP_PASS || "").trim()) {
    missing.push("SMTP_PASS");
  }

  if (!String(data.SMTP_FROM_EMAIL || "").trim()) {
    missing.push("SMTP_FROM_EMAIL");
  }

  if (missing.length) {
    console.error(`Environment validation failed: missing SMTP settings: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const siteBaseUrl = data.APP_BASE_URL.replace(/\/+$/g, "");
const appBasePath = normalizeBasePath(data.APP_BASE_PATH);
const cdkBasePath = normalizeBasePath(data.CDK_BASE_PATH || "/console");
const appBaseUrl = `${siteBaseUrl}${appBasePath}`;
const zhupayNotifyUrl = data.ZHUPAY_NOTIFY_URL || `${appBaseUrl}/api/notify`;
const zhupayReturnUrl = data.ZHUPAY_RETURN_URL || `${appBaseUrl}/result`;
const steamOpenIdRealm = siteBaseUrl;
const cdkBaseUrl = `${siteBaseUrl}${cdkBasePath}`;
const steamOpenIdReturnUrl = `${cdkBaseUrl}/auth/steam/callback`;
const outboundProxy =
  data.OUTBOUND_PROXY_ENABLED
    ? {
        enabled: true,
        protocol: data.OUTBOUND_PROXY_PROTOCOL,
        host: data.OUTBOUND_PROXY_HOST,
        port: data.OUTBOUND_PROXY_PORT,
      }
    : {
        enabled: false,
      };

module.exports = {
  env: {
    nodeEnv: data.NODE_ENV,
    port: data.PORT,
    trustProxy: data.TRUST_PROXY,
    siteBaseUrl,
    appBasePath,
    cdkBasePath,
    appBaseUrl,
    cdkBaseUrl,
    publicSiteName: data.PUBLIC_SITE_NAME,
    sessionSecret: data.SESSION_SECRET,
    rootSteamIds: data.ROOT_STEAM_IDS,
    adminSteamIds: data.ADMIN_STEAM_IDS,
    steamWebApiKey: data.STEAM_WEB_API_KEY,
    whitelistApiUrl: data.WHITELIST_API_URL,
    whitelistApiKey: data.WHITELIST_API_KEY,
    serverListApiUrl: data.SERVER_LIST_API_URL,
    serverListApiKey: data.SERVER_LIST_API_KEY,
    outboundProxy,
    smtp: {
      enabled: data.SMTP_ENABLED,
      host: data.SMTP_HOST,
      port: data.SMTP_PORT,
      secure: data.SMTP_SECURE,
      user: data.SMTP_USER,
      pass: data.SMTP_PASS,
      fromName: data.SMTP_FROM_NAME,
      fromEmail: data.SMTP_FROM_EMAIL,
      replyTo: data.SMTP_REPLY_TO,
    },
    redis: {
      enabled: data.REDIS_ENABLED,
      host: data.REDIS_HOST,
      port: data.REDIS_PORT,
      password: data.REDIS_PASSWORD || undefined,
      db: data.REDIS_DB,
    },
    databaseUrl: data.DATABASE_URL,
    payDatabaseUrl: replaceDatabaseName(data.DATABASE_URL, "kepcs_pay"),
    cdkDatabaseUrl: replaceDatabaseName(data.DATABASE_URL, "kepcs_cdk"),
    gameDatabaseUrl: replaceDatabaseName(data.DATABASE_URL, data.OFFICIAL_WHITELIST_DATABASE),
    officialWhitelistDatabase: data.OFFICIAL_WHITELIST_DATABASE,
    serverCatalogDatabase: data.SERVER_CATALOG_DATABASE,
    orderPriceFen: data.ORDER_PRICE_FEN,
    orderSubject: data.ORDER_SUBJECT,
    zhupayBaseUrl: data.ZHUPAY_BASE_URL,
    zhupayCreateOrderPath: data.ZHUPAY_CREATE_ORDER_PATH,
    zhupayQueryOrderPath: data.ZHUPAY_QUERY_ORDER_PATH,
    zhupayApiVersion: data.ZHUPAY_API_VERSION,
    zhupayMerchantNo: data.ZHUPAY_MERCHANT_NO,
    zhupayPaymentChannel: data.ZHUPAY_PAYMENT_CHANNEL,
    zhupayNotifyUrl,
    zhupayReturnUrl,
    zhupayCreateExtraFields: data.ZHUPAY_CREATE_EXTRA_FIELDS,
    zhupaySignField: data.ZHUPAY_SIGN_FIELD,
    zhupaySignType: data.ZHUPAY_SIGN_TYPE,
    zhupayTimestampToleranceSeconds: data.ZHUPAY_TIMESTAMP_TOLERANCE_SECONDS,
    zhupayCallbackSuccessResponse: data.ZHUPAY_CALLBACK_SUCCESS_RESPONSE,
    zhupayMerchantPrivateKeyPath: path.resolve(data.ZHUPAY_MERCHANT_PRIVATE_KEY_PATH),
    zhupayPlatformPublicKeyPath: path.resolve(data.ZHUPAY_PLATFORM_PUBLIC_KEY_PATH),
    steamOpenIdRealm,
    steamOpenIdReturnUrl,
  },
};
