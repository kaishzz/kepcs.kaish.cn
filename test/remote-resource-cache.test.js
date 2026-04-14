const test = require("node:test");
const assert = require("node:assert/strict");

const { createRemoteResourceCache } = require("../src/lib/remoteResourceCache");

test("remote resource cache prefers fresh memory and avoids duplicate loader calls", async () => {
  let loadCount = 0;
  const cache = createRemoteResourceCache({
    cacheKey: null,
    ttlSeconds: 60,
    isValid: (value) => value && typeof value === "object",
    readCache: async () => null,
    writeCache: async () => {},
  });

  const first = await cache.read(false, async () => {
    loadCount += 1;
    return { value: 1 };
  });

  const second = await cache.read(false, async () => {
    loadCount += 1;
    return { value: 2 };
  });

  assert.deepEqual(first, { value: 1 });
  assert.deepEqual(second, { value: 1 });
  assert.equal(loadCount, 1);
});

test("remote resource cache strips invalid cached payload and refreshes from source", async () => {
  let writeArgs = null;
  const cache = createRemoteResourceCache({
    cacheKey: "demo-cache",
    ttlSeconds: 30,
    isValid: (value) => Array.isArray(value),
    readCache: async () => "{\"broken\":true}",
    writeCache: async (...args) => {
      writeArgs = args;
    },
  });

  const value = await cache.read(false, async () => ["a", "b"]);

  assert.deepEqual(value, ["a", "b"]);
  assert.deepEqual(writeArgs, ["demo-cache", "[\"a\",\"b\"]", 30]);
});

test("remote resource cache collapses concurrent refresh calls into one loader request", async () => {
  let loadCount = 0;
  let releaseLoader;
  const loaderStarted = new Promise((resolve) => {
    releaseLoader = resolve;
  });
  const cache = createRemoteResourceCache({
    cacheKey: null,
    ttlSeconds: 1,
    isValid: (value) => value && typeof value === "object",
    readCache: async () => null,
    writeCache: async () => {},
  });

  const first = cache.read(true, async () => {
    loadCount += 1;
    await loaderStarted;
    return { value: "shared" };
  });
  const second = cache.read(true, async () => {
    loadCount += 1;
    return { value: "unexpected" };
  });

  releaseLoader();

  const results = await Promise.all([first, second]);
  assert.equal(loadCount, 1);
  assert.deepEqual(results, [{ value: "shared" }, { value: "shared" }]);
});
