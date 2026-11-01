import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { AGE_TYPES, CAPPED, LINEAR, MAX_BYTES } from "../src/index.js";
import * as api from "../src/index.js";

const root = new URL("..", import.meta.url);

test("public exports stay limited to the documented surface", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "AGE_TYPES",
    "CAPPED",
    "LINEAR",
    "MAX_BYTES",
    "selectUpdates"
  ]);
  assert.equal(typeof api.selectUpdates, "function");
  assert.equal(LINEAR, "linear");
  assert.equal(CAPPED, "capped");
  assert.deepEqual(AGE_TYPES, ["linear", "capped"]);
  assert.equal(Object.isFrozen(AGE_TYPES), true);
  assert.equal(MAX_BYTES, Number.MAX_SAFE_INTEGER);
  assert.equal(MAX_BYTES, 9007199254740991);
});

test("package metadata names the module and the author", () => {
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(pkg.name, "@aneron/packet-budget");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.author, "Vadim Gubin");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.sideEffects, false);
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.main, "./src/index.js");
  assert.equal(pkg.exports, "./src/index.js");
  assert.equal(pkg.repository.type, "git");
  assert.equal(pkg.repository.url, "git+https://github.com/ANERON-GAMES/packet-budget.git");
  assert.deepEqual(pkg.files, ["src", "LICENSE", "README.md"]);
  assert.equal(pkg.scripts.test, "node --test test/*.test.js");
  assert.equal(pkg.scripts.lint, "eslint .");
  assert.equal(pkg.scripts.format, "prettier --write .");
  assert.equal(pkg.scripts["format:check"], "prettier --check .");
  const license = readFileSync(new URL("LICENSE", root), "utf8");
  assert.equal(license.includes("Copyright (c) 2026 Vadim Gubin"), true);
  assert.equal(license.includes("anerongames"), false);
  const readme = readFileSync(new URL("README.md", root), "utf8");
  for (const heading of [
    "## Purpose",
    "## Install",
    "## Usage",
    "## API",
    "## Design",
    "## License"
  ]) {
    assert.equal(readme.includes(heading), true, heading);
  }
  assert.equal(readme.includes("## Design notes"), false);
  assert.equal(readme.includes("## API reference"), false);
  assert.equal(readme.includes('`packed.selected` is `["update-b", "update-a"]`'), true);
  assert.equal(readme.includes("`packed.bytesUsed` is `84`"), true);
  assert.equal(readme.includes("`packed.remaining` is `16`"), true);
  assert.equal(readme.includes('`packed.deferred[0].id` is `"update-c"`'), true);
  assert.equal(readme.includes("`packed.deferred[0].effectivePriority` is `2`"), true);
  assert.equal(readme.includes("`packed.oversize` is `[]`"), true);
  assert.equal(readme.includes('`aged.selected` is `["update-a", "update-b"]`'), true);
  assert.equal(readme.includes("`aged.bytesUsed` is `28`"), true);
  assert.equal(readme.includes("`aged.remaining` is `12`"), true);
  assert.equal(readme.includes('`starved.selected` is `["update-a"]`'), true);
  assert.equal(readme.includes('`starved.deferred[0].id` is `"update-b"`'), true);
  assert.equal(readme.includes("`starved.deferred[0].effectivePriority` is `5`"), true);
  assert.equal(readme.includes("`starved.bytesUsed` is `16`"), true);
  assert.equal(readme.includes("`starved.remaining` is `4`"), true);
  assert.equal(readme.includes('`capped.selected` is `["update-b"]`'), true);
  assert.equal(readme.includes("`capped.deferred[0].effectivePriority` is `4`"), true);
  assert.equal(readme.includes('`loose.selected` is `["update-a", "update-c"]`'), true);
  assert.equal(readme.includes('`loose.deferred[0].id` is `"update-b"`'), true);
  assert.equal(readme.includes("`loose.bytesUsed` is `38`"), true);
  assert.equal(readme.includes("`loose.remaining` is `2`"), true);
  assert.equal(readme.includes('`held.selected` is `["update-a"]`'), true);
  assert.equal(readme.includes('`held.deferred[0].id` is `"update-b"`'), true);
  assert.equal(readme.includes('`held.deferred[1].id` is `"update-c"`'), true);
  assert.equal(readme.includes("`held.bytesUsed` is `34`"), true);
  assert.equal(readme.includes("`held.remaining` is `6`"), true);
  assert.equal(readme.includes('`wide.oversize` is `["update-a"]`'), true);
  assert.equal(readme.includes('`wide.selected` is `["update-b"]`'), true);
  assert.equal(readme.includes("`wide.bytesUsed` is `25`"), true);
  assert.equal(readme.includes("`wide.remaining` is `25`"), true);
  assert.equal(readme.includes("`wide.deferred` is `[]`"), true);
  assert.equal(readme.includes('`tied.selected` is `["update-a"]`'), true);
  assert.equal(readme.includes('`tied.deferred[0].id` is `"update-b"`'), true);
  assert.equal(readme.includes("`idle.bytesUsed` is `0`"), true);
  assert.equal(readme.includes("`idle.remaining` is `100`"), true);
  assert.equal(readme.includes("`quiet.bytesUsed` is `0`"), true);
  assert.equal(readme.includes("`quiet.remaining` is `20`"), true);
  assert.equal(readme.includes('`quiet.oversize` is `["update-a"]`'), true);
  assert.equal(readme.includes("`grown.deferred[0].effectivePriority` is `2.5`"), true);
  assert.equal(readme.includes('`before.selected` is `["update-a"]`'), true);
  assert.equal(readme.includes("`pending[0].ticks` is `9`"), true);
  assert.equal(readme.includes("`full.remaining` is `0`"), true);
  assert.equal(readme.includes("`full.bytesUsed` is `20`"), true);
  assert.equal(readme.includes("options must be an object"), true);
  assert.equal(readme.includes("effective priority must be finite"), true);
  assert.equal(readme.includes("update ids must be unique"), true);
  assert.equal(readme.includes("age type must be linear or capped"), true);
});

test("source files do not contain comments, clocks, timers, or network calls", () => {
  const files = readdirSync(new URL("src/", root)).sort();
  assert.deepEqual(files, ["age.js", "constants.js", "index.js", "plain.js", "select.js"]);
  for (const name of files) {
    const source = readFileSync(new URL("src/" + name, root), "utf8");
    const specifiers = source.match(/from "[^"]+"/g) ?? [];
    assert.equal(specifiers.length > 0 || !source.includes("import "), true, name);
    for (const specifier of specifiers) {
      assert.match(specifier, /^from "\.\/[a-z]+\.js"$/);
    }
    assert.equal(source.includes("node:"), false, name);
    assert.equal(source.includes("require("), false, name);
    assert.equal(source.includes("/*"), false, name);
    assert.equal(source.includes("//"), false, name);
    for (const token of [
      "Date",
      "setTimeout",
      "setInterval",
      "Math.random",
      "process",
      "fetch(",
      "globalThis",
      "queueMicrotask",
      "setImmediate",
      "performance"
    ]) {
      assert.equal(source.includes(token), false, name + " " + token);
    }
  }
});

test("the lockfile resolves only from the npm registry", () => {
  const lockPath = new URL("package-lock.json", root);
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.equal(lock.lockfileVersion >= 2, true);
  const text = readFileSync(lockPath, "utf8");
  assert.equal(text.includes("git+"), false);
  assert.equal(text.includes("github:"), false);
  assert.equal(text.includes("registry.yarnpkg.com"), false);
  let resolved = 0;
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value !== null && typeof value === "object") {
      if (typeof value.resolved === "string") {
        resolved += 1;
        assert.equal(
          value.resolved.startsWith("https://registry.npmjs.org/"),
          true,
          value.resolved
        );
      }
      for (const key of Object.keys(value)) {
        walk(value[key]);
      }
    }
  };
  walk(lock);
  assert.equal(resolved > 0, true);
});

test("ci runs lint, format check, and tests on node 20 and 22", () => {
  const ci = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
  assert.equal(ci.includes("node-version: [20, 22]"), true);
  assert.equal(ci.includes("npm test"), true);
  assert.equal(ci.includes("npm run lint"), true);
  assert.equal(ci.includes("npm run format:check"), true);
  assert.equal(ci.includes("npm ci"), true);
});
