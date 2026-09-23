import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, targetName] = process.argv.slice(2);

if (!["build", "push"].includes(command) || !targetName) {
  console.error("usage: node tools/target.mjs <build|push> <target>");
  process.exit(2);
}

const profilePath = join(repoRoot, "targets", `${targetName}.json`);
if (!existsSync(profilePath)) throw new Error(`Target profile not found: targets/${targetName}.json`);
const profile = JSON.parse(readFileSync(profilePath, "utf8"));
validateProfile(profile);

const gasSourceDir = resolve(repoRoot, profile.sourceDir || "gas");
const webSourceDir = resolve(repoRoot, profile.webSourceDir || "web/qr");
const outRoot = join(repoRoot, ".build", targetName);
const gasOutDir = join(outRoot, "gas");
const webOutDir = join(outRoot, "web", "qr");
const excludes = (profile.exclude || []).map(globToRegExp);
const webExcludes = (profile.webExclude || []).map(globToRegExp);
const gasUrl = `https://script.google.com/macros/s/${profile.gas.deploymentId}/exec`;

build();
if (command === "push") runClasp(["push"]);

function validateProfile(value) {
  if (value.target !== targetName) throw new Error(`Target name mismatch: ${value.target} != ${targetName}`);
  if (value.runtime !== "gas") throw new Error(`Unsupported runtime: ${value.runtime}`);
  if (!value.gas?.scriptId) throw new Error(`Target ${targetName}: gas.scriptId is not configured.`);
  if (!value.gas?.deploymentId) throw new Error(`Target ${targetName}: gas.deploymentId is not configured.`);
}

function build() {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(gasOutDir, { recursive: true });
  mkdirSync(webOutDir, { recursive: true });

  const copiedGas = [];
  const excludedGas = [];
  for (const file of walk(gasSourceDir)) {
    const rel = normalize(relative(gasSourceDir, file));
    if (rel === ".clasp.json") continue;
    if (excludes.some((pattern) => pattern.test(rel))) {
      excludedGas.push(rel);
      continue;
    }
    copy(file, join(gasOutDir, rel));
    copiedGas.push(rel);
  }

  const excludedWeb = [];
  for (const file of walk(webSourceDir)) {
    const rel = normalize(relative(webSourceDir, file));
    if (webExcludes.some((pattern) => pattern.test(rel))) {
      excludedWeb.push(rel);
      continue;
    }
    copy(file, join(webOutDir, rel));
  }

  writeFileSync(join(gasOutDir, ".clasp.json"), JSON.stringify({ scriptId: profile.gas.scriptId, rootDir: "." }, null, 2) + "\n", "utf8");
  writeFileSync(join(webOutDir, "runtime_config.js"), renderRuntimeConfig(), "utf8");
  writeFileSync(join(outRoot, ".target-build.json"), JSON.stringify({
    target: targetName,
    runtime: profile.runtime,
    gas: { scriptId: profile.gas.scriptId, deploymentId: profile.gas.deploymentId, webAppUrl: gasUrl },
    gasCopiedFiles: copiedGas.length,
    gasExcludedFiles: excludedGas,
    webExcludedFiles: excludedWeb,
    webSourceDir: profile.webSourceDir || "web/qr"
  }, null, 2) + "\n", "utf8");

  console.log(`Target: ${targetName}`);
  console.log(`Output: ${relative(repoRoot, outRoot)}`);
  console.log(`GAS copied: ${copiedGas.length}`);
  console.log(`GAS excluded: ${excludedGas.length}`);
  console.log(`Web excluded: ${excludedWeb.length}`);
  console.log(`Web API: ${gasUrl}`);
  for (const file of excludedGas) console.log(`  - ${file}`);
}

function renderRuntimeConfig() {
  return `(function() {\n  window.DOJO_RUNTIME_CONFIG = Object.freeze(${JSON.stringify({ target: targetName, runtime: profile.runtime, apiBaseUrl: gasUrl }, null, 2)});\n})();\n`;
}

function copy(source, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest);
}

function runClasp(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm execution context not found. Run via: npm run target:push -- <target>");
  }

  const result = spawnSync(
    process.execPath,
    [npmCli, "exec", "--", "clasp", ...args],
    { cwd: gasOutDir, stdio: "inherit", windowsHide: true }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm exec -- clasp ${args.join(" ")} failed: exit ${result.status}`);
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
      if (normalized[i + 2] === "/") { pattern += "(?:.*/)?"; i += 2; }
      else { pattern += ".*"; i += 1; }
    } else if (c === "*") pattern += "[^/]*";
    else pattern += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

function normalize(path) { return path.replaceAll("\\", "/"); }
