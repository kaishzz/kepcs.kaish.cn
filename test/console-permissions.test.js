const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ALL_CONSOLE_PERMISSION_KEYS,
  CONSOLE_EDITABLE_PERMISSION_KEYS,
} = require("../src/constants/consolePermissions");

function readFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

function extractMatches(source, pattern) {
  return Array.from(source.matchAll(pattern), (match) => match[1]).sort();
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

  const usedKeys = Array.from(new Set([...frontendPermissions, ...backendPermissions]));
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
