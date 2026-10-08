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

if (profile.runtime === "firebase") {
  buildFirebase();
  if (command === "push") pushFirebase();
  process.exit(0);
}

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

function buildFirebase() {
  const builder = join(repoRoot, "tools", "build-time-travel-firestore.mjs");
  const result = spawnSync(process.execPath, [builder], { cwd: repoRoot, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Firebase build failed: exit ${result.status}`);
  const artifactDir = join(repoRoot, ".build", "portable-timetravel-firestore");
  const firebaseOutRoot = join(repoRoot, ".build", targetName);
  const firebaseWebOutDir = join(firebaseOutRoot, "web", "qr");
  const deployRoot = join(repoRoot, ".build", targetName, "cloud-run", "dojo-time-travel-admin");
  rmSync(firebaseOutRoot, { recursive: true, force: true });

  for (const file of walk(resolve(repoRoot, profile.webSourceDir || "web/qr"))) {
    const rel = normalize(relative(resolve(repoRoot, profile.webSourceDir || "web/qr"), file));
    copy(file, join(firebaseWebOutDir, rel));
  }
  writeFileSync(join(firebaseWebOutDir, "runtime_config.js"), renderFirebaseRuntimeConfig(), "utf8");
  writeFileSync(
    join(firebaseOutRoot, "web", "firebase.json"),
    JSON.stringify({
      hosting: {
        site: profile.projectId,
        public: ".",
        ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
        headers: [
          { source: "**/*.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
          { source: "**/*.js", headers: [{ key: "Cache-Control", value: "no-store" }] }
        ]
      }
    }, null, 2) + "\n",
    "utf8"
  );

  for (const name of ["admin-server.cjs", "admin-api.cjs", "target.cjs"]) {
    copy(join(repoRoot, "cloud", "time-travel", name), join(deployRoot, "cloud", "time-travel", name));
  }
  copy(profilePath, join(deployRoot, "targets", `${targetName}.json`));
  copy(
    join(artifactDir, "DojoTimeTravelFirestore.cjs"),
    join(deployRoot, ".build", "portable-timetravel-firestore", "DojoTimeTravelFirestore.cjs")
  );

  const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  rootPackage.scripts = { start: "node cloud/time-travel/admin-server.cjs" };
  writeFileSync(join(deployRoot, "package.json"), JSON.stringify(rootPackage, null, 2) + "\n", "utf8");
  copy(join(repoRoot, "package-lock.json"), join(deployRoot, "package-lock.json"));

  console.log(`Target: ${targetName}`);
  console.log("Output: .build/portable-timetravel-firestore");
  console.log(`Firebase Web artifact: ${normalize(relative(repoRoot, firebaseWebOutDir))}`);
  console.log(`Cloud Run deploy unit: ${normalize(relative(repoRoot, deployRoot))}`);
  console.log(`Firebase project: ${profile.projectId}`);
}

function pushFirebase() {
  // Deploy the existing TimeTrip units; do not create a second Firebase deployment path.
  const firebaseOutRoot = join(repoRoot, ".build", targetName);
  const deployRoot = join(firebaseOutRoot, "cloud-run", "dojo-time-travel-admin");
  const webRoot = join(firebaseOutRoot, "web");
  if (!existsSync(join(deployRoot, "package.json")) || !existsSync(join(webRoot, "firebase.json"))) {
    throw new Error("Firebase deploy artifacts are missing. Run target:build first.");
  }

  // Cloud Run first, then Hosting: a new Web client must not precede its API.
  runFirebaseDeploy("gcloud", [
    "run", "deploy", "dojo-time-travel-admin",
    "--source", normalize(relative(repoRoot, deployRoot)),
    "--project", profile.projectId, "--region", "asia-northeast1",
    "--allow-unauthenticated", "--min", "0", "--max", "1",
    "--cpu", "1", "--memory", "512Mi", "--concurrency", "8"
  ], repoRoot);
  runFirebaseDeploy("firebase", ["deploy", "--only", "hosting", "--project", profile.projectId], webRoot);
}

function runFirebaseDeploy(executable, args, cwd) {
  if (process.env.DOJO_DEPLOY_DRY_RUN === "1") {
    console.log(`[DRY RUN] ${executable} ${args.join(" ")} (cwd: ${normalize(relative(repoRoot, cwd)) || "."})`);
    return;
  }
  const command = process.platform === "win32" ? `${executable}.cmd` : executable;
  const result = spawnSync(command, args, { cwd, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} deployment failed: exit ${result.status}`);
}

function validateProfile(value) {
  if (value.target !== targetName) throw new Error(`Target name mismatch: ${value.target} != ${targetName}`);
  if (value.runtime === "firebase") {
    if (value.mode !== "development") throw new Error(`Target ${targetName}: firebase mode must be development.`);
    if (!value.projectId) throw new Error(`Target ${targetName}: projectId is not configured.`);
    if (!value.apiBaseUrl) throw new Error(`Target ${targetName}: apiBaseUrl is not configured.`);
    for (const key of ["apiKey", "authDomain", "projectId", "appId"]) {
      if (!value.firebaseWeb?.[key]) throw new Error(`Target ${targetName}: firebaseWeb.${key} is not configured.`);
    }
    if (value.firebaseWeb.projectId !== value.projectId) throw new Error(`Target ${targetName}: firebaseWeb.projectId mismatch.`);
    if (value.confirmedDevelopmentProject !== value.projectId) throw new Error(`Target ${targetName}: confirmedDevelopmentProject mismatch.`);
    return;
  }
  if (value.runtime !== "gas") throw new Error(`Unsupported runtime: ${value.runtime}`);
  if (!value.gas?.scriptId) throw new Error(`Target ${targetName}: gas.scriptId is not configured.`);
  if (!value.gas?.deploymentId) throw new Error(`Target ${targetName}: gas.deploymentId is not configured.`);
  if (value.gas.executionApiAccess && (targetName !== "dev-gas" || value.gas.executionApiAccess !== "MYSELF")) {
    throw new Error("Execution API override is restricted to dev-gas / MYSELF.");
  }
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

  if (profile.gas.executionApiAccess) {
    const manifestPath = join(gasOutDir, "appsscript.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.executionApi = { access: profile.gas.executionApiAccess };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }
  const claspConfig = { scriptId: profile.gas.scriptId, rootDir: "." };
  // Cloud側で確認したProject IDをprofileへ保存する。GASの関連付け自体は変更しない。
  if (profile.gas.projectId) claspConfig.projectId = profile.gas.projectId;
  writeFileSync(join(gasOutDir, ".clasp.json"), JSON.stringify(claspConfig, null, 2) + "\n", "utf8");
  writeFileSync(join(webOutDir, "runtime_config.js"), renderRuntimeConfig(), "utf8");
  validateWebRuntimeOrder();
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

function validateWebRuntimeOrder() {
  const errors = [];

  for (const file of walk(webOutDir)) {
    if (!file.toLowerCase().endsWith(".html")) continue;

    const html = readFileSync(file, "utf8");
    const systemContextIndex = html.indexOf('src="system_context.js"');
    if (systemContextIndex < 0) continue;

    const runtimeConfigIndex = html.indexOf('src="runtime_config.js"');
    if (runtimeConfigIndex < 0) {
      errors.push(`${normalize(relative(webOutDir, file))}: runtime_config.js is missing before system_context.js`);
      continue;
    }

    if (runtimeConfigIndex > systemContextIndex) {
      errors.push(`${normalize(relative(webOutDir, file))}: runtime_config.js must be loaded before system_context.js`);
    }
  }

  if (errors.length > 0) {
    throw new Error("Web runtime dependency order is invalid:\\n" + errors.map((x) => `  - ${x}`).join("\\n"));
  }
}

function renderFirebaseRuntimeConfig() {
  const config = {
    target: targetName,
    runtime: profile.runtime,
    apiBaseUrl: profile.apiBaseUrl,
    firebase: {
      apiKey: profile.firebaseWeb.apiKey,
      authDomain: profile.firebaseWeb.authDomain,
      projectId: profile.firebaseWeb.projectId,
      appId: profile.firebaseWeb.appId
    }
  };
  return `(function() {\n  window.DOJO_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n})();\n`;
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
