const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readWorkspaceFile(...segments) {
  return fs.readFileSync(path.resolve(...segments), "utf8");
}

test("website node command set matches KepAgent supported command catalog", () => {
  const websiteSource = readWorkspaceFile(
    __dirname,
    "..",
    "web",
    "src",
    "components",
    "console",
    "AgentControlPanel.vue",
  );
  const agentSource = readWorkspaceFile(
    __dirname,
    "..",
    "..",
    "..",
    "KepRepository",
    "KepAgent",
    "kepagent",
    "constants.py",
  );
  const commandBlock = agentSource.match(/SUPPORTED_COMMANDS\s*=\s*\(([\s\S]*?)\n\)/);
  assert.ok(commandBlock, "Failed to locate KepAgent SUPPORTED_COMMANDS block");

  const websiteCommands = Array.from(
    new Set(
      Array.from(
        websiteSource.matchAll(/^\s*\|\s*'([^']+)'/gm),
        (match) => match[1],
      ),
    ),
  ).sort();

  const agentCommands = Array.from(
    new Set(
      Array.from(
        commandBlock[1].matchAll(/"([^"]+)"/g),
        (match) => match[1],
      ),
    ),
  ).sort();

  assert.deepEqual(
    websiteCommands,
    agentCommands,
    `Website and KepAgent command sets differ.\nwebsite=${websiteCommands.join(", ")}\nagent=${agentCommands.join(", ")}`,
  );
});
