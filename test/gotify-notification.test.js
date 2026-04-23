const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_GOTIFY_CHANNEL_TEMPLATES,
  normalizeGotifyConfig,
  normalizeGotifyChannelKey,
  normalizeGotifyChannelTemplates,
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
      templates: DEFAULT_GOTIFY_CHANNEL_TEMPLATES,
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

test("gotify channel templates are normalized with queued and finished defaults", () => {
  assert.deepEqual(
    normalizeGotifyChannelTemplates({
      queued: {
        title: "已触发 · {{ scheduleName }}",
      },
    }),
    {
      queued: {
        title: "已触发 · {{ scheduleName }}",
        message: "",
      },
      finished: {
        title: "",
        message: "",
      },
    },
  );
});

test("channel templates override fallback notification text when variables are available", () => {
  const rendered = __testables.renderChannelNotification(
    {
      key: "ops-main",
      name: "运维主群",
      templates: {
        queued: {
          title: "触发 · {{ scheduleName }}",
          message: "{{ nodeName }} / {{ commandId }} / {{ scheduleSummary }}",
        },
        finished: {
          title: "",
          message: "",
        },
      },
    },
    {
      templateEventType: "queued",
      context: {
        scheduleName: "每小时检查更新",
        nodeName: "华东节点",
        commandId: "command-1",
        scheduleSummary: "每 1 小时 00:00 - 23:59",
      },
      title: "fallback title",
      message: "fallback message",
    },
  );

  assert.equal(rendered.title, "触发 · 每小时检查更新");
  assert.equal(rendered.message, "华东节点 / command-1 / 每 1 小时 00:00 - 23:59");
});

test("finished notification can be filtered to updated_or_failed", () => {
  assert.equal(__testables.shouldSendFinishedNotification({
    status: "SUCCEEDED",
    result: {
      updated: false,
    },
    payload: {
      __kepcsMeta: {
        sourceScheduleId: "schedule-1",
        notificationChannelKeys: ["ops-main"],
        notificationSettings: {
          queued: "never",
          finished: "updated_or_failed",
        },
      },
    },
  }), false);

  assert.equal(__testables.shouldSendFinishedNotification({
    status: "SUCCEEDED",
    result: {
      updated: true,
    },
    payload: {
      __kepcsMeta: {
        sourceScheduleId: "schedule-1",
        notificationChannelKeys: ["ops-main"],
        notificationSettings: {
          queued: "never",
          finished: "updated_or_failed",
        },
      },
    },
  }), true);

  assert.equal(__testables.shouldSendFinishedNotification({
    status: "FAILED",
    result: null,
    payload: {
      __kepcsMeta: {
        sourceScheduleId: "schedule-1",
        notificationChannelKeys: ["ops-main"],
        notificationSettings: {
          queued: "never",
          finished: "updated_or_failed",
        },
      },
    },
  }), true);
});
