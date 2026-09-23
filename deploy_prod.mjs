import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const [targetName, ...commentParts] = process.argv.slice(2);
const comment = commentParts.join(" ").trim();

if (!targetName || !comment) {
  console.error('使用方法: node deploy_prod.mjs <target> "デプロイコメント"');
  process.exit(2);
}

const profilePath = join(repoRoot, "targets", `${targetName}.json`);
if (!existsSync(profilePath)) throw new Error(`Target profile not found: targets/${targetName}.json`);
const profile = JSON.parse(readFileSync(profilePath, "utf8"));
if (profile.target !== targetName) throw new Error(`Target name mismatch: ${profile.target} != ${targetName}`);
if (profile.runtime !== "gas") throw new Error(`Unsupported runtime: ${profile.runtime}`);
if (!profile.gas?.scriptId) throw new Error(`Target ${targetName}: gas.scriptId is not configured.`);
if (!profile.gas?.deploymentId) throw new Error(`Target ${targetName}: gas.deploymentId is not configured.`);

const deploymentId = profile.gas.deploymentId;
const gasUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
const buildGasDir = join(repoRoot, ".build", targetName, "gas");
const logDirectory = join(repoRoot, "deploy_logs");
const timestamp = formatTimestamp(new Date());
const logPath = join(logDirectory, `deploy-${targetName}-${timestamp}.log`);
mkdirSync(logDirectory, { recursive: true });
writeFileSync(logPath, "", "utf8");

try {
  log(`Target deployを開始します: ${targetName}`);
  runNode([join(repoRoot, "tools", "target.mjs"), "build", targetName], repoRoot);
  log(`Script ID: ${profile.gas.scriptId}`);
  log(`Deployment ID: ${deploymentId}`);
  log(`コメント: ${comment}`);
  log("デプロイ前の履歴:");
  runClasp(["deployments"]);
  log("Target ProfileのDeployment IDへデプロイします。");
  runClasp(["deploy", "-i", deploymentId, "-d", comment]);
  log("デプロイ後の履歴:");
  runClasp(["deployments"]);
  log("未ログイン相当の匿名疎通を確認します。");
  await testAnonymousWebApp();
  log(`PASS: ${targetName} のデプロイと匿名疎通が正常です。`);
  console.log(`\n診断ログ: ${logPath}`);
} catch (error) {
  log(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`診断ログ: ${logPath}`);
  process.exitCode = 1;
}

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8", windowsHide: true });
  emitResult(result, `node ${args.join(" ")}`);
}
function runClasp(args) {
  const command = process.platform === "win32" ? "clasp.cmd" : "clasp";
  const result = spawnSync(command, args, { cwd: buildGasDir, encoding: "utf8", windowsHide: true });
  emitResult(result, `clasp ${args.join(" ")}`);
}
function emitResult(result, label) {
  if (result.error) throw new Error(`${label} を起動できません: ${result.error.message}`);
  for (const line of `${result.stdout || ""}${result.stderr || ""}`.split(/\r?\n/).filter(Boolean)) log(line);
  if (result.status !== 0) throw new Error(`${label} が終了コード ${result.status} で失敗しました。`);
}

async function testAnonymousWebApp() {
  const callback = `deployHealthCheck_${Date.now()}`;
  const healthUrl = new URL(gasUrl);
  healthUrl.searchParams.set("action", "system_context");
  healthUrl.searchParams.set("callback", callback);
  healthUrl.searchParams.set("_ts", String(Date.now()));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(healthUrl, { redirect: "follow", signal: controller.signal, headers: { Accept: "application/javascript, application/json, text/plain, */*", "User-Agent": "AikidoDojoManagement-DeployDiagnostic/1.0" } });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("匿名疎通が30秒でタイムアウトしました。");
    throw new Error(`匿名HTTP通信に失敗しました: ${error.message}`);
  } finally { clearTimeout(timeout); }
  const body = await response.text();
  log(`匿名疎通: HTTP=${response.status} Content-Type=${response.headers.get("content-type") || ""}`);
  log(`最終URL: ${response.url}`);
  if (/accounts\.google\.com|ServiceLogin/i.test(response.url)) throw new Error("Googleログイン画面へ転送されました。Webアプリの公開範囲を確認してください。");
  if (!response.ok) throw new Error(`匿名疎通のHTTPステータスが正常ではありません: ${response.status}`);
  const escapedCallback = callback.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^\\s*${escapedCallback}\\((.*)\\);?\\s*$`, "s"));
  if (!match) throw new Error("system_contextのJSONP応答ではありません。公開範囲またはデプロイ先を確認してください。");
  let payload;
  try { payload = JSON.parse(match[1]); } catch { throw new Error("system_contextのJSONP内が正しいJSONではありません。"); }
  if (payload?.ok !== true) throw new Error("system_contextが ok=true を返しませんでした。");
  log(`system_context: ok=true system_now=${payload.system_now} target_month=${payload.target_month}`);
}
function log(message) { const line = `[${formatLogTime(new Date())}] ${message}`; console.log(line); appendFileSync(logPath, `${line}\n`, "utf8"); }
function formatTimestamp(date) { return [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0"), "-", String(date.getHours()).padStart(2,"0"), String(date.getMinutes()).padStart(2,"0"), String(date.getSeconds()).padStart(2,"0")].join(""); }
function formatLogTime(date) { return [date.getFullYear(), "-", String(date.getMonth()+1).padStart(2,"0"), "-", String(date.getDate()).padStart(2,"0"), " ", String(date.getHours()).padStart(2,"0"), ":", String(date.getMinutes()).padStart(2,"0"), ":", String(date.getSeconds()).padStart(2,"0")].join(""); }
