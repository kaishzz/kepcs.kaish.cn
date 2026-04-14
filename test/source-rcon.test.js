const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RCON_PACKET_TYPES,
  buildRconPacket,
  extractRconPackets,
} = require("../src/utils/sourceRcon");

test("buildRconPacket creates a valid Source RCON frame", () => {
  const packet = buildRconPacket(1001, RCON_PACKET_TYPES.AUTH, "demo");

  assert.equal(packet.readInt32LE(0), 14);
  assert.equal(packet.readInt32LE(4), 1001);
  assert.equal(packet.readInt32LE(8), RCON_PACKET_TYPES.AUTH);
  assert.equal(packet.subarray(12, 16).toString("utf8"), "demo");
  assert.equal(packet.readInt16LE(packet.length - 2), 0);
});

test("extractRconPackets decodes concatenated packets and preserves partial tail", () => {
  const first = buildRconPacket(1, RCON_PACKET_TYPES.AUTH, "one");
  const second = buildRconPacket(2, RCON_PACKET_TYPES.EXEC_COMMAND, "status");
  const partial = second.subarray(0, second.length - 3);
  const combined = Buffer.concat([first, partial]);
  const extracted = extractRconPackets(combined);

  assert.equal(extracted.packets.length, 1);
  assert.deepEqual(extracted.packets[0], {
    id: 1,
    type: RCON_PACKET_TYPES.AUTH,
    body: "one",
  });
  assert.equal(extracted.rest.equals(partial), true);
});
