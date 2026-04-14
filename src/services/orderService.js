const crypto = require("node:crypto");
const { payPrisma } = require("../lib/prisma");
const { env } = require("../config/env");
const { normalizeCreateOrderResponse } = require("../config/zhupayProfile");
const { parseYuanToFen } = require("../utils/amount");
const { PAY_PRODUCT_TYPES } = require("./productService");
const { createPurchasedWhitelistCdksForOrder, ensurePurchasedLockedCdkForOrder } = require("./cdkService");

function generateOrderNo() {
  const stamp = Date.now();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `KEPCS${stamp}${suffix}`;
}

async function createPendingOrder({ steamId64, qq, email, remark, paymentType, product }) {
  return payPrisma.order.create({
    data: {
      orderNo: generateOrderNo(),
      productCode: product?.code || null,
      productType: product?.productType || PAY_PRODUCT_TYPES.WHITELIST,
      targetDatabase: product?.targetDatabase || null,
      cdkType: product?.cdkType || null,
      cdkQuantity: Number(product?.cdkQuantity) > 0 ? Number(product.cdkQuantity) : 1,
      steamId64: String(steamId64 || "").trim(),
      qq: String(qq || "").trim() || null,
      email: String(email || "").trim() || null,
      remark: String(remark || "").trim() || null,
      paymentType,
      subject: product?.name || env.orderSubject,
      amountFen: product?.amountFen ?? env.orderPriceFen,
    },
  });
}

async function attachRemoteOrder(orderId, normalizedResponse) {
  return payPrisma.order.update({
    where: { id: orderId },
    data: {
      providerOrderId: normalizedResponse.providerOrderId || undefined,
      providerResponse: normalizedResponse.rawResponse,
    },
  });
}

async function getOrderByOrderNo(orderNo) {
  return payPrisma.order.findUnique({
    where: { orderNo },
  });
}

async function queryOrdersByEmail({ email, orderNo }) {
  const where = {
    ...(email ? { email } : {}),
    ...(orderNo ? { orderNo } : {}),
  };

  return payPrisma.order.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    take: orderNo ? 1 : 10,
  });
}

async function listAdminOrders({ limit = 100, orderNo, email, steamId64, status, productType }) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));

  return payPrisma.order.findMany({
    where: {
      ...(orderNo
        ? {
            orderNo: {
              contains: String(orderNo).trim(),
            },
          }
        : {}),
      ...(email
        ? {
            email: {
              contains: String(email).trim(),
            },
          }
        : {}),
      ...(steamId64 ? { steamId64: String(steamId64).trim() } : {}),
      ...(status ? { status } : {}),
      ...(productType ? { productType } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: safeLimit,
  });
}

function buildStatusPayload(order) {
  const normalizedProvider =
    order.providerResponse && typeof order.providerResponse === "object"
      ? normalizeCreateOrderResponse(order.providerResponse)
      : null;

  return {
    orderNo: order.orderNo,
    productCode: order.productCode,
    productType: order.productType,
    targetDatabase: order.targetDatabase,
    cdkType: order.cdkType,
    cdkQuantity: Number(order.cdkQuantity) > 0 ? Number(order.cdkQuantity) : 1,
    steamId64: order.steamId64,
    subject: order.subject,
    qq: order.qq,
    email: order.email,
    remark: order.remark,
    paymentType: order.paymentType,
    amountFen: order.amountFen,
    status: order.status,
    paidAt: order.paidAt,
    providerOrderId: order.providerOrderId,
    createdAt: order.createdAt,
    paymentUrl: normalizedProvider?.paymentUrl || null,
    qrCode: normalizedProvider?.qrCode || null,
    payType: normalizedProvider?.payType || null,
    payInfo: normalizedProvider?.payInfo || null,
  };
}

async function recordCallback({ rawBody, signatureValid, orderId }) {
  return payPrisma.paymentCallback.create({
    data: {
      orderId,
      signatureValid,
      rawBody,
    },
  });
}

async function markCallbackProcessed(callbackId) {
  return payPrisma.paymentCallback.update({
    where: { id: callbackId },
    data: {
      processed: true,
    },
  });
}

async function markOrderPaid({ order, callbackId, providerOrderId, amountText, paidAt }) {
  const callbackAmountFen = parseYuanToFen(amountText);

  if (callbackAmountFen !== order.amountFen) {
    throw new Error(
      `Callback amount mismatch: expected ${order.amountFen}, received ${callbackAmountFen}`,
    );
  }

  return payPrisma.$transaction(async (tx) => {
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        providerOrderId: providerOrderId || order.providerOrderId || undefined,
        paidAt: paidAt || new Date(),
      },
    });

    await tx.paymentCallback.update({
      where: { id: callbackId },
      data: {
        processed: true,
      },
    });

    if (order.productType === PAY_PRODUCT_TYPES.WHITELIST) {
      await tx.whitelistJob.upsert({
        where: {
          orderId_steamId64: {
            orderId: order.id,
            steamId64: order.steamId64,
          },
        },
        create: {
          orderId: order.id,
          steamId64: order.steamId64,
          qq: order.qq,
          notes: `Pending external whitelist insert. qq${order.qq}`,
        },
        update: {},
      });
    }

    return updatedOrder;
  });
}

async function fulfillPaidOrder(order) {
  if (!order || order.status !== "PAID") {
    return null;
  }

  if (order.productType === PAY_PRODUCT_TYPES.CDK) {
    return ensurePurchasedLockedCdkForOrder(order);
  }

  if (order.productType === PAY_PRODUCT_TYPES.WHITELIST_CDK) {
    return createPurchasedWhitelistCdksForOrder(order);
  }

  return null;
}

module.exports = {
  attachRemoteOrder,
  buildStatusPayload,
  createPendingOrder,
  fulfillPaidOrder,
  getOrderByOrderNo,
  listAdminOrders,
  queryOrdersByEmail,
  markCallbackProcessed,
  markOrderPaid,
  recordCallback,
};
