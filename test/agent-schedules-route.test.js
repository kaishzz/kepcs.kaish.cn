const test = require("node:test");
const assert = require("node:assert/strict");

const { Signer } = require("@fastify/cookie/plugin");
const { closeAllPools } = require("../src/lib/gameDatabase");
const { disconnectPrisma } = require("../src/lib/prisma");
const { disconnectRedis } = require("../src/lib/redis");
const { env } = require("../src/config/env");

function encodeAuthCookie(user) {
  return Buffer.from(
    JSON.stringify({
      steamId: user?.steamId,
      displayName: user?.displayName || "",
      avatarUrl: user?.avatarUrl || "",
      profileUrl: user?.profileUrl || "",
    }),
    "utf8",
  ).toString("base64url");
}

test("agent schedule query keeps missing isActive undefined", async (t) => {
  const fastifyAppPath = require.resolve("../src/fastifyApp");
  const nodeScheduleServicePath = require.resolve("../src/services/nodeScheduleService");

  delete require.cache[fastifyAppPath];
  delete require.cache[nodeScheduleServicePath];

  const nodeScheduleService = require(nodeScheduleServicePath);
  const originalListNodeSchedules = nodeScheduleService.listNodeSchedules;
  let receivedPayload = null;

  nodeScheduleService.listNodeSchedules = async (payload) => {
    receivedPayload = payload;

    return [
      {
        id: "schedule-1",
        nodeId: "node-1",
        name: "Schedule 1",
        commandType: "agent.ping",
        payload: {},
        notificationChannelKeys: [],
        intervalMinutes: 60,
        scheduleConfig: null,
        scheduleSummary: "Every 60 minutes",
        nextRunAt: null,
        lastQueuedAt: null,
        lastCommandId: null,
        isActive: true,
        createdBySteamId: env.rootSteamIds[0],
        createdAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
        node: {
          id: "node-1",
          code: "node-1",
          name: "Node 1",
          host: null,
          note: null,
          isActive: true,
          status: "ONLINE",
          isOnline: true,
          lastSeenAt: null,
          lastIp: null,
          agentVersion: null,
          lastHeartbeat: null,
          createdAt: "2026-04-21T00:00:00.000Z",
          updatedAt: "2026-04-21T00:00:00.000Z",
        },
      },
    ];
  };

  const { createFastifyApp } = require(fastifyAppPath);
  const app = await createFastifyApp();

  t.after(async () => {
    nodeScheduleService.listNodeSchedules = originalListNodeSchedules;
    delete require.cache[fastifyAppPath];
    delete require.cache[nodeScheduleServicePath];
    await app.close();
    await Promise.allSettled([
      disconnectRedis(),
      disconnectPrisma(),
      closeAllPools(),
    ]);
  });

  const signer = new Signer(env.sessionSecret, "sha256");
  const cookieValue = signer.sign(
    encodeAuthCookie({
      steamId: env.rootSteamIds[0],
      displayName: "root-test",
    }),
  );

  const response = await app.inject({
    method: "GET",
    url: "/console/api/agent/schedules",
    headers: {
      cookie: `kepcs_auth=${cookieValue}`,
      host: "kepcs.kaish.cn",
    },
  });

  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(receivedPayload?.isActive, undefined);
  assert.equal(body.success, true);
  assert.equal(body.schedules.length, 1);
});
