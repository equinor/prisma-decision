import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./release-needed.sh", import.meta.url));

function fixture(t, version, tags = []) {
  const cwd = mkdtempSync(join(tmpdir(), "prisma-infra-release-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", cwd]);
  writeFileSync(
    join(cwd, ".release-please-manifest.json"),
    JSON.stringify({ "prisma-infra": version }),
  );
  const object = execFileSync("git", ["hash-object", "-w", "--stdin"], {
    cwd,
    input: "release fixture",
    encoding: "utf8",
  }).trim();
  for (const tag of tags) {
    execFileSync("git", ["tag", tag, object], { cwd });
  }
  const output = join(cwd, "output");

  return () => {
    writeFileSync(output, "");
    execFileSync("bash", [script], {
      cwd,
      env: { ...process.env, GITHUB_OUTPUT: output },
      stdio: "pipe",
    });
    return readFileSync(output, "utf8").trim();
  };
}

test("importing the snapshot does not deploy production", (t) => {
  assert.equal(fixture(t, "0.2.7")(), "infra-release=false");
});

test("an untagged release keeps requiring deployment on subsequent runs", (t) => {
  const run = fixture(t, "0.2.8");
  assert.equal(run(), "infra-release=true");
  assert.equal(run(), "infra-release=true");
});

test("a published production version does not deploy again", (t) => {
  assert.equal(
    fixture(t, "0.2.8", ["prisma-infra-v0.2.8"])(),
    "infra-release=false",
  );
});

test("a missing infrastructure manifest version fails instead of skipping deployment", (t) => {
  assert.throws(fixture(t, undefined), /Command failed/);
});
