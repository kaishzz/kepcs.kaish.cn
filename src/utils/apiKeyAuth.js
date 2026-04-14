function stripApiKeyQueryParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return undefined;
  }

  const nextParams = { ...params };
  delete nextParams.key;
  delete nextParams.api_key;
  delete nextParams.apiKey;

  return Object.keys(nextParams).length ? nextParams : undefined;
}

function buildApiKeyHeaders(apiKey, headers = {}) {
  const normalizedKey = String(apiKey || "").trim();
  const nextHeaders = { ...headers };

  if (!normalizedKey) {
    return nextHeaders;
  }

  nextHeaders["X-API-Key"] = normalizedKey;
  nextHeaders.Authorization = `Bearer ${normalizedKey}`;

  return nextHeaders;
}

function withApiKeyAuth(config = {}, apiKey) {
  const nextHeaders = buildApiKeyHeaders(apiKey, config.headers);
  const nextParams = stripApiKeyQueryParams(config.params);

  return {
    ...config,
    headers: nextHeaders,
    ...(nextParams ? { params: nextParams } : {}),
  };
}

module.exports = {
  buildApiKeyHeaders,
  stripApiKeyQueryParams,
  withApiKeyAuth,
};
