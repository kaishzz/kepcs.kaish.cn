const { env } = require("../config/env");
const zhupayProfile = require("../config/zhupayProfile");
const { createAxiosClient } = require("../lib/httpClient");
const { signPayload, verifyPayload } = require("../utils/zhupaySigning");

const client = createAxiosClient({
  baseURL: env.zhupayBaseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  },
});

async function createRemoteOrder(localOrder, clientIp, paymentType) {
  const payload = zhupayProfile.buildCreateOrderPayload({
    order: localOrder,
    env,
    clientIp,
    paymentType,
  });

  const sign = signPayload(payload, env.zhupayMerchantPrivateKeyPath, env.zhupaySignField);
  const formPayload = {
    ...payload,
    [env.zhupaySignField]: sign,
  };

  const response = await client.post(
    env.zhupayCreateOrderPath,
    new URLSearchParams(formPayload).toString(),
  );

  const normalized = zhupayProfile.normalizeCreateOrderResponse(response.data);

  if (!normalized.success) {
    const error = new Error(`Zhupay create order failed: ${normalized.message}`);
    error.details = normalized;
    throw error;
  }

  return normalized;
}

function verifyCallback(payload) {
  const signature = payload[env.zhupaySignField];
  return verifyPayload(
    zhupayProfile.removeSignatureField(payload, env.zhupaySignField),
    signature,
    env.zhupayPlatformPublicKeyPath,
    env.zhupaySignField,
  );
}

function normalizeCallback(payload) {
  return zhupayProfile.normalizeCallbackPayload(payload);
}

module.exports = {
  createRemoteOrder,
  normalizeCallback,
  verifyCallback,
};
