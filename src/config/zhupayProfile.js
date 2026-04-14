const { formatFenToYuan } = require("../utils/amount");
const { pickFirstDefined } = require("../utils/objectPath");

const SUCCESS_CODES = new Set(["0", "200", "SUCCESS", "success", "ok", "OK"]);
const PAID_STATUSES = new Set(["1", "SUCCESS", "PAID", "TRADE_SUCCESS"]);

function buildReturnUrl(baseUrl, orderNo) {
  const url = new URL(baseUrl);
  url.searchParams.set("orderNo", orderNo);
  return url.toString();
}

function buildCreateOrderPayload({ order, env, clientIp, paymentType }) {
  const payload = {
    pid: env.zhupayMerchantNo,
    type: paymentType || order.paymentType || env.zhupayPaymentChannel || "alipay",
    out_trade_no: order.orderNo,
    notify_url: env.zhupayNotifyUrl,
    return_url: buildReturnUrl(env.zhupayReturnUrl, order.orderNo),
    name: order.subject,
    money: formatFenToYuan(order.amountFen),
    clientip: clientIp,
    param: order.steamId64,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    sign_type: env.zhupaySignType,
  };

  return {
    ...payload,
    ...env.zhupayCreateExtraFields,
  };
}

function normalizeCreateOrderResponse(rawResponse) {
  const code = pickFirstDefined(rawResponse, ["code", "status", "retCode", "resultCode"]);
  const message =
    pickFirstDefined(rawResponse, ["msg", "message", "retMsg", "resultMsg"]) ||
    "Unknown response from Zhupay";
  const payInfo = pickFirstDefined(rawResponse, [
    "pay_info",
  ]);
  const qrCode = pickFirstDefined(rawResponse, [
    "pay_info",
  ]);
  const providerOrderId = pickFirstDefined(rawResponse, [
    "trade_no",
  ]);
  const payType = pickFirstDefined(rawResponse, ["pay_type"]);
  const normalizedPayInfo = payInfo ? String(payInfo) : null;
  const inferredPaymentUrl =
    normalizedPayInfo && /^https?:\/\//i.test(normalizedPayInfo) ? normalizedPayInfo : null;

  return {
    success: SUCCESS_CODES.has(String(code)),
    code: code == null ? null : String(code),
    message: String(message),
    paymentUrl:
      payType && ["jump", "urlscheme", "html"].includes(String(payType))
        ? String(payInfo || "")
        : inferredPaymentUrl,
    qrCode: payType === "qrcode" ? String(qrCode || "") : null,
    payType: payType ? String(payType) : null,
    payInfo: normalizedPayInfo,
    providerOrderId: providerOrderId ? String(providerOrderId) : null,
    rawResponse,
  };
}

function normalizeCallbackPayload(rawPayload) {
  const orderNo = pickFirstDefined(rawPayload, ["out_trade_no"]);
  const providerOrderId = pickFirstDefined(rawPayload, ["trade_no"]);
  const amount = pickFirstDefined(rawPayload, ["money"]);
  const status = pickFirstDefined(rawPayload, ["trade_status", "status"]);
  const timestamp = pickFirstDefined(rawPayload, ["timestamp", "endtime"]);

  return {
    orderNo: orderNo ? String(orderNo) : null,
    providerOrderId: providerOrderId ? String(providerOrderId) : null,
    amount: amount == null ? null : String(amount),
    status: status == null ? null : String(status),
    isPaid: status == null ? false : PAID_STATUSES.has(String(status)),
    timestamp: timestamp == null ? null : String(timestamp),
    rawPayload,
  };
}

function removeSignatureField(payload, signField) {
  const cleaned = { ...payload };
  delete cleaned[signField];
  return cleaned;
}

module.exports = {
  buildCreateOrderPayload,
  normalizeCreateOrderResponse,
  normalizeCallbackPayload,
  removeSignatureField,
};
