const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractAgentApiKey,
  generateAgentApiKey,
  hashAgentApiKey,
} = require("../src/utils/agentAuth");

test("agent auth supports X-Agent-Key header", () => {
  assert.equal(
    extractAgentApiKey({ "x-agent-key": "kepcs_agent_demo" }),
    "kepcs_agent_demo",
  );
});

test("agent auth supports Authorization bearer header", () => {
  assert.equal(
    extractAgentApiKey({ authorization: "Bearer kepcs_agent_demo" }),
    "kepcs_agent_demo",
  );
});

test("agent auth hashing is stable and generated key has expected prefix", () => {
  const generated = generateAgentApiKey();

  assert.equal(generated.startsWith("kepcs_agent_"), true);
  assert.equal(hashAgentApiKey("demo"), hashAgentApiKey("demo"));
  assert.notEqual(hashAgentApiKey("demo"), hashAgentApiKey("demo2"));
});
