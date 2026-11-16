import { spawnSync } from "node:child_process";

const project = "prisma-api/src/PrismaApi.Api";
const result = spawnSync(
  "dotnet",
  ["user-secrets", "list", "--project", project, "--json"],
  { encoding: "utf8" },
);

if (result.error) {
  console.error(`Unable to inspect API user secrets: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(result.stderr.trim() || "Unable to inspect API user secrets.");
  process.exit(result.status ?? 1);
}

const wrappedJson = result.stdout.match(/\/\/BEGIN\s*([\s\S]*?)\s*\/\/END/);
let secrets;

try {
  secrets = JSON.parse(wrappedJson?.[1] ?? "{}");
} catch {
  console.error("Secret Manager returned an unexpected response.");
  process.exit(1);
}

const missing = ["AzureAd:ClientSecret"].filter(
  (key) => typeof secrets[key] !== "string" || secrets[key].trim() === "",
);

if (missing.length === 0) {
  console.log("API secrets are configured.");
  process.exit(0);
}

console.warn(`Missing API user secret: ${missing.join(", ")}`);
console.warn("The API can start, but every request will fail with a 500.");
console.warn(
  "Set it from Key Vault as described in prisma-api/README.md (.NET user secrets).",
);
