const { PrismaClient } = require("@prisma/client");
const { env } = require("../config/env");

const globalForPrisma = globalThis;
const prismaLog = ["warn", "error"];

function createPrismaClient(url) {
  return new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
    log: prismaLog,
  });
}

const payPrisma =
  globalForPrisma.payPrisma ||
  createPrismaClient(env.payDatabaseUrl);

const cdkPrisma =
  globalForPrisma.cdkPrisma ||
  (env.cdkDatabaseUrl === env.payDatabaseUrl
    ? payPrisma
    : createPrismaClient(env.cdkDatabaseUrl));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.payPrisma = payPrisma;
  globalForPrisma.cdkPrisma = cdkPrisma;
}

module.exports = {
  async disconnectPrisma() {
    const clients = Array.from(new Set([payPrisma, cdkPrisma]));
    await Promise.allSettled(clients.map((client) => client.$disconnect()));
  },
  prisma: payPrisma,
  payPrisma,
  cdkPrisma,
};
