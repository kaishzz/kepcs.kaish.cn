const test = require("node:test");
const assert = require("node:assert/strict");

const { serializeNodeCommand } = require("../src/services/agentControlService");

test("serializeNodeCommand keeps rcon target passwords for agent-facing payloads only", () => {
  const now = new Date("2026-04-19T16:40:24.000Z");
  const row = {
    id: "command-1",
    nodeId: "node-1",
    commandType: "node.rcon_command",
    payload: {
      command: "status",
      targetMode: "servers",
      targets: [
        { key: "ze_xl_1", password: "secret-1" },
      ],
    },
    status: "PENDING",
    createdBySteamId: "76561198000000000",
    createdByRole: "admin",
    claimedAt: null,
    startedAt: null,
    finishedAt: null,
    expiresAt: null,
    result: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };

  assert.deepEqual(serializeNodeCommand(row).payload, {
    command: "status",
    targetMode: "servers",
    targets: [{ key: "ze_xl_1" }],
    serverKeys: ["ze_xl_1"],
  });

  assert.deepEqual(serializeNodeCommand(row, { includeSecrets: true }).payload, {
    command: "status",
    targetMode: "servers",
    targets: [{ key: "ze_xl_1", password: "secret-1" }],
  });
});
