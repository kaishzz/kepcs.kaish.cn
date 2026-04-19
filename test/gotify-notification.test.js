const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeGotifyConfig,
  normalizeGotifyChannelKey,
  __testables,
} = require("../src/services/gotifyNotificationService");

test("gotify channel keys are normalized for stable schedule references", () => {
  assert.equal(normalizeGotifyChannelKey("", "OPS Main"), "ops-main");
  assert.equal(normalizeGotifyChannelKey(" Ops_Main "), "ops-main");
});

test("gotify config keeps valid channels and removes invalid or duplicate entries", () => {
  const config = normalizeGotifyConfig({
    channels: [
      {
        key: "ops-main",
        name: "运维主群",
        serverUrl: "https://gotify.kaish.cn/",
        token: "token-a",
        enabled: true,
        priority: 6,
      },
      {
        key: "ops-main",
        name: "重复渠道",
        serverUrl: "https://gotify.kaish.cn",
        token: "token-b",
      },
      {
        key: "missing-token",
        name: "缺少 Token",
        serverUrl: "https://gotify.kaish.cn",
        token: "",
      },
    ],
  });

  assert.equal(config.channels.length, 1);
  assert.deepEqual(config.channels[0], {
    key: "ops-main",
    name: "运维主群",
    serverUrl: "https://gotify.kaish.cn",
    token: "token-a",
    description: "",
    enabled: true,
    priority: 6,
  });
});

test("scheduled queue notification includes basic task context", () => {
  const notification = __testables.buildScheduledQueueNotification({
    schedule: {
      id: "schedule-1",
      nodeId: "node-1",
      name: "每小时检查更新",
      node: { name: "华东节点" },
      commandType: "node.check_update",
      intervalMinutes: 60,
      lastQueuedAt: "2026-04-19T00:00:00.000Z",
      payload: { command: "status" },
      notificationChannelKeys: ["ops-main"],
    },
    command: {
      id: "command-1",
    },
  });

  assert.equal(notification.title, "定时任务已触发 · 每小时检查更新");
  assert.equal(notification.message.includes("节点: 华东节点"), true);
  assert.equal(notification.message.includes("命令 ID: command-1"), true);
});
