const { payPrisma } = require("../lib/prisma");

const PAY_PRODUCT_TYPES = {
  WHITELIST: "WHITELIST",
  WHITELIST_CDK: "WHITELIST_CDK",
  CUSTOM: "CUSTOM",
  CDK: "CDK",
};

function normalizeProductType(value) {
  const type = String(value || "").trim().toUpperCase();
  return Object.values(PAY_PRODUCT_TYPES).includes(type) ? type : PAY_PRODUCT_TYPES.WHITELIST;
}

function serializeProduct(product) {
  if (!product) {
    return null;
  }

  return {
    ...product,
    description: String(product.description || "").trim() || null,
    productType: normalizeProductType(product.productType),
    targetDatabase: String(product.targetDatabase || "").trim() || null,
    cdkType: String(product.cdkType || "").trim() || null,
    cdkQuantity: Number(product.cdkQuantity) > 0 ? Number(product.cdkQuantity) : 1,
    amountYuan: (Number(product.amountFen) / 100).toFixed(2),
  };
}

function normalizeCreatePayload(payload) {
  const productType = normalizeProductType(payload.productType);

  return {
    code: String(payload.code).trim(),
    name: String(payload.name).trim(),
    description: String(payload.description || "").trim(),
    productType,
    amountFen: Number(payload.amountFen),
    targetDatabase:
      productType === PAY_PRODUCT_TYPES.WHITELIST
        ? String(payload.targetDatabase || "").trim()
        : "",
    cdkType:
      productType === PAY_PRODUCT_TYPES.CDK
        ? String(payload.cdkType || "").trim()
        : "",
    cdkQuantity:
      productType === PAY_PRODUCT_TYPES.WHITELIST_CDK
        ? Math.max(1, Number(payload.cdkQuantity) || 1)
        : 1,
    isActive: Boolean(payload.isActive),
    sortOrder: Number(payload.sortOrder) || 0,
  };
}

function normalizeUpdatePayload(payload) {
  const data = {};
  const nextType = Object.prototype.hasOwnProperty.call(payload, "productType")
    ? normalizeProductType(payload.productType)
    : null;

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    data.name = String(payload.name).trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    data.description = String(payload.description || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, "productType")) {
    data.productType = nextType;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "amountFen")) {
    data.amountFen = Number(payload.amountFen);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "targetDatabase")) {
    data.targetDatabase =
      (nextType || payload.productType || null) === PAY_PRODUCT_TYPES.WHITELIST
        ? String(payload.targetDatabase || "").trim()
        : "";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "cdkType")) {
    data.cdkType =
      (nextType || payload.productType || null) === PAY_PRODUCT_TYPES.CDK
        ? String(payload.cdkType || "").trim()
        : "";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "cdkQuantity")) {
    data.cdkQuantity =
      (nextType || payload.productType || null) === PAY_PRODUCT_TYPES.WHITELIST_CDK
        ? Math.max(1, Number(payload.cdkQuantity) || 1)
        : 1;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "isActive")) {
    data.isActive = Boolean(payload.isActive);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sortOrder")) {
    data.sortOrder = Number(payload.sortOrder) || 0;
  }

  if (nextType === PAY_PRODUCT_TYPES.WHITELIST && !Object.prototype.hasOwnProperty.call(data, "targetDatabase")) {
    data.targetDatabase = String(payload.targetDatabase || "").trim();
  }

  if (nextType === PAY_PRODUCT_TYPES.CDK && !Object.prototype.hasOwnProperty.call(data, "cdkType")) {
    data.cdkType = String(payload.cdkType || "").trim();
  }

  if (nextType === PAY_PRODUCT_TYPES.CUSTOM) {
    data.targetDatabase = "";
    data.cdkType = "";
    data.cdkQuantity = 1;
  }

  if (nextType === PAY_PRODUCT_TYPES.WHITELIST) {
    data.cdkType = "";
    data.cdkQuantity = 1;
  }

  if (nextType === PAY_PRODUCT_TYPES.WHITELIST_CDK) {
    data.targetDatabase = "";
    data.cdkType = "";
    if (!Object.prototype.hasOwnProperty.call(data, "cdkQuantity")) {
      data.cdkQuantity = Math.max(1, Number(payload.cdkQuantity) || 1);
    }
  }

  if (nextType === PAY_PRODUCT_TYPES.CDK) {
    data.targetDatabase = "";
    data.cdkQuantity = 1;
  }

  return data;
}

async function listAllProducts() {
  const products = await payPrisma.product.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return products.map(serializeProduct);
}

async function listActiveProducts() {
  const products = await payPrisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return products.map(serializeProduct);
}

async function getActiveProductByCode(code) {
  const product = await payPrisma.product.findFirst({
    where: {
      code: String(code || "").trim(),
      isActive: true,
    },
  });

  return serializeProduct(product);
}

async function createProduct(payload) {
  const product = await payPrisma.product.create({
    data: normalizeCreatePayload(payload),
  });

  return serializeProduct(product);
}

async function updateProduct(id, payload) {
  const product = await payPrisma.product.update({
    where: { id: String(id) },
    data: normalizeUpdatePayload(payload),
  });

  return serializeProduct(product);
}

module.exports = {
  PAY_PRODUCT_TYPES,
  createProduct,
  getActiveProductByCode,
  listActiveProducts,
  listAllProducts,
  normalizeProductType,
  serializeProduct,
  updateProduct,
};
