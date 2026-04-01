import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portfolioDir = path.resolve(__dirname, "..");
const introDir = path.resolve(portfolioDir, "..", "소개사이트");
const shipScript = path.resolve(portfolioDir, "..", "_shared", "ship.mjs");

const targets = [
  { label: "TY portfolio", cwd: portfolioDir },
  { label: "Intro site", cwd: introDir },
];

const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  console.log("Usage: npm run deploy:linked");
  console.log("Options:");
  console.log("  --dry-run   Show deployment order without deploying");
  process.exit(0);
}

if (args.has("--dry-run")) {
  for (const target of targets) {
    console.log(`${target.label}: ${target.cwd}`);
  }
  process.exit(0);
}

for (const target of targets) {
  console.log(`\n== Deploying ${target.label} ==`);
  const result = spawnSync("node", [shipScript, "--", "vercel", "--prod", "--yes"], {
    cwd: target.cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nLinked deployment completed.");
