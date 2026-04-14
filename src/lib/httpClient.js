const axios = require("axios");
const { env } = require("../config/env");

function getAxiosProxyConfig() {
  if (!env.outboundProxy?.enabled) {
    return {};
  }

  return {
    proxy: {
      protocol: env.outboundProxy.protocol,
      host: env.outboundProxy.host,
      port: env.outboundProxy.port,
    },
  };
}

function createAxiosClient(config = {}) {
  return axios.create({
    timeout: 15000,
    ...getAxiosProxyConfig(),
    ...config,
  });
}

module.exports = {
  createAxiosClient,
};
