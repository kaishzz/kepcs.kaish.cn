const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildApiKeyHeaders,
  stripApiKeyQueryParams,
  withApiKeyAuth,
} = require("../src/utils/apiKeyAuth");

test("API key auth helper adds X-API-Key and Authorization bearer headers", () => {
  const headers = buildApiKeyHeaders("kaish");

  assert.deepEqual(headers, {
    "X-API-Key": "kaish",
    Authorization: "Bearer kaish",
  });
});

test("API key auth helper strips query key params", () => {
  const params = stripApiKeyQueryParams({
    key: "legacy-query-key",
    api_key: "legacy-api-key",
    apiKey: "legacy-camel-key",
    page: 2,
  });

  assert.deepEqual(params, {
    page: 2,
  });
});

test("API key request config keeps headers auth and makes query auth unavailable", () => {
  const config = withApiKeyAuth(
    {
      params: {
        key: "legacy-query-key",
        page: 1,
      },
      headers: {
        Accept: "application/json",
      },
    },
    "kaish",
  );

  assert.deepEqual(config, {
    params: {
      page: 1,
    },
    headers: {
      Accept: "application/json",
      "X-API-Key": "kaish",
      Authorization: "Bearer kaish",
    },
  });
});
