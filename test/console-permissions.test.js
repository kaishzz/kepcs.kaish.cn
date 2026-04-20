const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ALL_CONSOLE_PERMISSION_KEYS,
  CONSOLE_EDITABLE_PERMISSION_KEYS,
  normalizePermissionList,
} = require("../src/constants/consolePermissions");

function readFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

function extractMatches(source, pattern) {
  return Array.from(source.matchAll(pattern), (match) => match[1]).sort();
}

function extractQuotedMatchesFromGroups(source, outerPattern) {
  return Array.from(source.matchAll(outerPattern), (match) =>
    extractMatches(match[1], /"([^"]+)"/g),
  ).flat().sort();
}

test("console permission catalog covers frontend and backend usage", () => {
  const frontendSource = readFile("web/src/views/CdkView.vue");
  const backendSource = readFile("src/fastifyApp.js");

  const frontendPermissions = extractMatches(
    frontendSource,
    /hasConsolePermission\('([^']+)'\)/g,
  );
  const backendPermissions = extractMatches(
    backendSource,
    /requirePermission\("([^"]+)"\)/g,
  );
  const backendAnyPermissions = extractQuotedMatchesFromGroups(
    backendSource,
    /requireAnyPermission\((\[[\s\S]*?\])\)/g,
  );
  const backendPermissionArrayConstants = extractQuotedMatchesFromGroups(
    backendSource,
    /const\s+[A-Z_]*PERMISSION_KEYS\s*=\s*(\[[\s\S]*?\]);/g,
  );
  const backendInlinePermissions = extractMatches(
    backendSource,
    /hasPermission\([^,]+,\s*"([^"]+)"\)/g,
  );

  const usedKeys = Array.from(new Set([
    ...frontendPermissions,
    ...backendPermissions,
    ...backendAnyPermissions,
    ...backendPermissionArrayConstants,
    ...backendInlinePermissions,
  ]));
  const catalogKeys = new Set(ALL_CONSOLE_PERMISSION_KEYS);
  const editableKeys = new Set(CONSOLE_EDITABLE_PERMISSION_KEYS);

  const unknownKeys = usedKeys.filter((key) => !catalogKeys.has(key));
  const unusedEditableKeys = Array.from(editableKeys).filter((key) => !usedKeys.includes(key));

  assert.deepEqual(
    unknownKeys,
    [],
    `Unknown console permission keys: ${unknownKeys.join(", ")}`,
  );
  assert.deepEqual(
    unusedEditableKeys,
    [],
    `Editable permission keys are not referenced: ${unusedEditableKeys.join(", ")}`,
  );
});

test("legacy console permissions expand to assignable leaf permissions", () => {
  assert.deepEqual(
    normalizePermissionList(["console.access.manage"]),
    ["console.access.groups", "console.access.users"],
  );

  assert.deepEqual(
    normalizePermissionList(["console.agents.schedules"]),
    [
      "console.agents.notifications.create",
      "console.agents.notifications.manage",
      "console.agents.notifications.test",
      "console.agents.schedules.edit",
      "console.agents.schedules.list",
    ],
  );

  assert.deepEqual(
    normalizePermissionList(["console.products.manage"]),
    ["console.products.create", "console.products.list"],
  );
});
