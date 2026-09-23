import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, targetName] = process.argv.slice(2);

if (!["build", "push"].includes(command) || !targetName) {
  console.error("usage: node tools/target.mjs <build|push> <target>");
  process.exit(2);
}

const profilePath = join(repoRoot, "targets", `${targetName}.json`);
if (!existsSync(profilePath)) {
  throw new Error(`Target profile not found: targets/${targetName}.json`);
}

const profile = JSON.parse(readFileSync(profilePath, "utf8"));
if (profile.target !== targetName) {
  throw new Error(`Target name mismatch: ${profile.target} != ${targetName}`);
}
if (profile.runtime !== "gas") {
  throw new Error(`Unsupported runtime: ${profile.runtime}`);
}

const sourceDir = resolve(repoRoot, profile.sourceDir || "gas");
const outDir = join(repoRoot, ".build", targetName);
const excludes = (profile.exclude || []).map(globToRegExp);

build();

if (command === "push") {
  prepareClasp();
  runClasp(["push"]);
}

function build() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const copied = [];
  const excluded = [];

  for (const file of walk(sourceDir)) {
    const rel = normalize(relative(sourceDir, file));
    if (rel === ".clasp.json") continue;

    if (excludes.some((pattern) => pattern.test(rel))) {
      excluded.push(rel);
      continue;
    }

    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(file, dest);
    copied.push(rel);
  }

  writeFileSync(
    join(outDir, ".target-build.json"),
    JSON.stringify({
      target: targetName,
      runtime: profile.runtime,
      sourceDir: profile.sourceDir || "gas",
      copiedFiles: copied.length,
      excludedFiles: excluded
    }, null, 2) + "\n",
    "utf8"
  );

  console.log(`Target: ${targetName}`);
  console.log(`Output: ${relative(repoRoot, outDir)}`);
  console.log(`Copied: ${copied.length}`);
  console.log(`Excluded: ${excluded.length}`);
  for (const file of excluded) console.log(`  - ${file}`);
}

function prepareClasp() {
  const candidates = [
    join(sourceDir, ".clasp.json"),
    join(repoRoot, ".clasp.json")
  ];
  const claspSource = candidates.find(existsSync);
  if (!claspSource) {
    throw new Error(".clasp.json not found in gas/ or repository root.");
  }
  cpSync(claspSource, join(outDir, ".clasp.json"));
}

function runClasp(args) {
  const executable = process.platform === "win32" ? "clasp.cmd" : "clasp";
  const result = spawnSync(executable, args, {
    cwd: outDir,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`clasp ${args.join(" ")} failed: exit ${result.status}`);
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

function globToRegExp(glob) {
  const normalized = normalize(glob);
  let pattern = "";
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === "*" && normalized[i + 1] === "*") {
      if (normalized[i + 2] === "/") {
        pattern += "(?:.*/)?";
        i += 2;
      } else {
        pattern += ".*";
        i += 1;
      }
    } else if (c === "*") {
      pattern += "[^/]*";
    } else {
      pattern += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

function normalize(path) {
  return path.replaceAll("\\", "/");
}
