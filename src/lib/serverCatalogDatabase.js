const { env } = require("../config/env");
const { getPool } = require("./gameDatabase");

function getServerCatalogPool() {
  return getPool(env.serverCatalogDatabase);
}

module.exports = {
  getServerCatalogPool,
};
