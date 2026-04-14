const net = require("node:net");

const RCON_PACKET_TYPES = {
  RESPONSE_VALUE: 0,
  EXEC_COMMAND: 2,
  AUTH_RESPONSE: 2,
  AUTH: 3,
};

function normalizePacketBody(value) {
  return String(value == null ? "" : value);
}

function buildRconPacket(id, type, body = "") {
  const normalizedBody = Buffer.from(normalizePacketBody(body), "utf8");
  const size = 4 + 4 + normalizedBody.length + 2;
  const packet = Buffer.alloc(size + 4);

  packet.writeInt32LE(size, 0);
  packet.writeInt32LE(Number(id) | 0, 4);
  packet.writeInt32LE(Number(type) | 0, 8);
  normalizedBody.copy(packet, 12);
  packet.writeInt16LE(0, 12 + normalizedBody.length);

  return packet;
}

function extractRconPackets(buffer) {
  const packets = [];
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const size = buffer.readInt32LE(offset);

    if (size < 10) {
      throw new Error("Invalid RCON packet size");
    }

    const packetEnd = offset + size + 4;

    if (packetEnd > buffer.length) {
      break;
    }

    const id = buffer.readInt32LE(offset + 4);
    const type = buffer.readInt32LE(offset + 8);
    const bodyBuffer = buffer.subarray(offset + 12, packetEnd - 2);

    packets.push({
      id,
      type,
      body: bodyBuffer.toString("utf8"),
    });

    offset = packetEnd;
  }

  return {
    packets,
    rest: buffer.subarray(offset),
  };
}

function createRconRequestId() {
  return Math.max(1, (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) & 0x7fffffff);
}

async function executeSourceRconCommand({
  host,
  port,
  password,
  command,
  timeoutMs = 5000,
  settleDelayMs = 280,
}) {
  const safeHost = String(host || "").trim();
  const safePassword = String(password || "");
  const safeCommand = String(command || "").trim();
  const safePort = Number(port);

  if (!safeHost) {
    throw new Error("RCON host is required");
  }

  if (!Number.isInteger(safePort) || safePort <= 0 || safePort > 65535) {
    throw new Error("RCON port is invalid");
  }

  if (!safePassword) {
    throw new Error("RCON password is required");
  }

  if (!safeCommand) {
    throw new Error("RCON command is required");
  }

  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: safeHost,
      port: safePort,
    });
    const authRequestId = createRconRequestId();
    const commandRequestId = createRconRequestId();
    const commandResponseBodies = [];
    let buffer = Buffer.alloc(0);
    let settled = false;
    let stage = "auth";
    let settleTimer = null;

    const finalize = (error, response = "") => {
      if (settled) {
        return;
      }

      settled = true;

      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }

      socket.destroy();

      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    };

    const armSettleTimer = () => {
      if (settleTimer) {
        clearTimeout(settleTimer);
      }

      settleTimer = setTimeout(() => {
        finalize(null, commandResponseBodies.join("\n").trim());
      }, Math.max(60, Number(settleDelayMs) || 280));
    };

    socket.setTimeout(Math.max(500, Number(timeoutMs) || 5000), () => {
      finalize(new Error(`RCON request timed out for ${safeHost}:${safePort}`));
    });

    socket.once("error", (error) => {
      finalize(new Error(`RCON connection failed: ${error.message}`));
    });

    socket.once("connect", () => {
      socket.write(buildRconPacket(authRequestId, RCON_PACKET_TYPES.AUTH, safePassword));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      let extracted;
      try {
        extracted = extractRconPackets(buffer);
      } catch (error) {
        finalize(error);
        return;
      }

      buffer = extracted.rest;

      for (const packet of extracted.packets) {
        if (stage === "auth") {
          if (packet.type !== RCON_PACKET_TYPES.AUTH_RESPONSE) {
            continue;
          }

          if (packet.id === -1) {
            finalize(new Error(`RCON authentication failed for ${safeHost}:${safePort}`));
            return;
          }

          if (packet.id !== authRequestId) {
            continue;
          }

          stage = "command";
          socket.write(buildRconPacket(commandRequestId, RCON_PACKET_TYPES.EXEC_COMMAND, safeCommand));
          armSettleTimer();
          continue;
        }

        if (packet.id !== commandRequestId) {
          continue;
        }

        if (packet.body) {
          commandResponseBodies.push(packet.body);
        }

        armSettleTimer();
      }
    });
  });
}

module.exports = {
  RCON_PACKET_TYPES,
  buildRconPacket,
  executeSourceRconCommand,
  extractRconPackets,
};
