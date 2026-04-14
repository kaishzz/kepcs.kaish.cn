const test = require("node:test");
const assert = require("node:assert/strict");

const { __testables } = require("../src/services/cdkService");

test("CDK batch insert rows include a generated id for createMany", () => {
  const row = __testables.buildCdkInsertRow({
    code: "KEPCS-ABCDE-FGHIJ-KLMNO",
    createdBySteamId: "76561198000000001",
    ownerSteamId: "76561198000000002",
    note: "test note",
    cdkType: "",
    isRedeemable: true,
    sourceProductCode: null,
    sourceOrderNo: null,
    expiresAt: null,
  });

  assert.equal(typeof row.id, "string");
  assert.equal(row.id.length > 0, true);
  assert.equal(row.code, "KEPCS-ABCDE-FGHIJ-KLMNO");
  assert.equal(row.createdBySteamId, "76561198000000001");
  assert.equal(row.ownerSteamId, "76561198000000002");
});
