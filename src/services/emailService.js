const nodemailer = require("nodemailer");
const { env } = require("../config/env");

let transporter = null;

function isEmailEnabled() {
  return Boolean(env.smtp?.enabled);
}

function getTransporter() {
  if (!isEmailEnabled()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }

  return transporter;
}

function buildFromAddress() {
  const fromName = String(env.smtp.fromName || "").trim();
  const fromEmail = String(env.smtp.fromEmail || "").trim();

  if (!fromName) {
    return fromEmail;
  }

  return `"${fromName.replace(/"/g, "")}" <${fromEmail}>`;
}

function formatTime(value) {
  if (!value) {
    return "未记录";
  }

  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}

function buildWhitelistMailContent({
  source,
  orderNo,
  cdkCode,
  steamId64,
  qq,
  email,
  paymentType,
  completedAt,
}) {
  const title = source === "cdk" ? "开水服白名单已通过 CDK 开通" : "开水服白名单已开通";
  const sourceLabel =
    source === "cdk"
      ? "CDK 开通"
      : paymentType === "wxpay"
        ? "线上支付 (微信)"
        : paymentType === "alipay"
          ? "线上支付 (支付宝)"
          : "线上支付";
  const extraLine = source === "cdk" && cdkCode ? `CDK: ${cdkCode}` : orderNo ? `订单号: ${orderNo}` : "";
  const timeText = formatTime(completedAt);

  return {
    subject: title,
    text: [
      "你好, 你的开水服白名单已经处理完成.",
      `开通方式: ${sourceLabel}`,
      `SteamID64: ${steamId64}`,
      `QQ: ${qq || "未填写"}`,
      `Email: ${email}`,
      extraLine,
      `完成时间: ${timeText}`,
      "如果这不是你的操作, 请尽快联系开水处理.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="font-family:Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;line-height:1.7;color:#24112d;">
        <h2 style="margin:0 0 16px;color:#7a2a86;">${title}</h2>
        <p style="margin:0 0 12px;">你好, 你的开水服白名单已经处理完成.</p>
        <div style="padding:14px 16px;border-radius:14px;background:#f8eafd;border:1px solid #efc4f5;">
          <div><strong>开通方式:</strong> ${sourceLabel}</div>
          <div><strong>SteamID64:</strong> ${steamId64}</div>
          <div><strong>QQ:</strong> ${qq || "未填写"}</div>
          <div><strong>Email:</strong> ${email}</div>
          ${extraLine ? `<div><strong>${source === "cdk" ? "CDK" : "订单号"}:</strong> ${source === "cdk" ? cdkCode : orderNo}</div>` : ""}
          <div><strong>完成时间:</strong> ${timeText}</div>
        </div>
        <p style="margin:14px 0 0;">如果这不是你的操作, 请尽快联系开水处理.</p>
      </div>
    `,
  };
}

async function sendWhitelistSuccessEmail(payload) {
  if (!isEmailEnabled()) {
    return { sent: false, skipped: true, reason: "smtp-disabled" };
  }

  const to = String(payload?.email || "").trim();

  if (!to) {
    return { sent: false, skipped: true, reason: "missing-email" };
  }

  const transport = getTransporter();
  const content = buildWhitelistMailContent(payload);

  const message = {
    from: buildFromAddress(),
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  };

  if (String(env.smtp.replyTo || "").trim()) {
    message.replyTo = env.smtp.replyTo;
  }

  await transport.sendMail(message);

  return { sent: true, skipped: false };
}

function dispatchWhitelistSuccessEmail(payload) {
  if (!isEmailEnabled() || !payload?.email) {
    return;
  }

  void sendWhitelistSuccessEmail(payload).catch((error) => {
    console.error("Failed to send whitelist success email:", error.message);
  });
}

module.exports = {
  dispatchWhitelistSuccessEmail,
  isEmailEnabled,
  sendWhitelistSuccessEmail,
};
