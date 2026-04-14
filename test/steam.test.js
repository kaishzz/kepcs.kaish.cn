const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidSteamId64 } = require("../src/utils/steam");
const { formatFenToYuan, parseYuanToFen } = require("../src/utils/amount");
const { canonicalizePayload } = require("../src/utils/zhupaySigning");
const { parseProviderTimestamp } = require("../src/utils/time");

test("SteamID64 validator accepts a normal 17-digit SteamID64", () => {
  assert.equal(isValidSteamId64("76561198000000000"), true);
});

test("SteamID64 validator rejects non-Steam64 values", () => {
  assert.equal(isValidSteamId64("123"), false);
  assert.equal(isValidSteamId64("76561188000000000"), false);
});

test("amount helpers convert between fen and yuan", () => {
  assert.equal(formatFenToYuan(5000), "50.00");
  assert.equal(parseYuanToFen("50.00"), 5000);
});

test("canonicalizePayload sorts keys and skips sign", () => {
  assert.equal(
    canonicalizePayload(
      {
        amount: "50.00",
        sign: "abc",
        sign_type: "RSA",
        orderNo: "KEPCS001",
      },
      "sign",
    ),
    "amount=50.00&orderNo=KEPCS001",
  );
});

test("parseProviderTimestamp handles unix seconds and milliseconds", () => {
  assert.equal(parseProviderTimestamp("1712059200")?.toISOString(), "2024-04-02T12:00:00.000Z");
  assert.equal(parseProviderTimestamp("1712059200000")?.toISOString(), "2024-04-02T12:00:00.000Z");
});
