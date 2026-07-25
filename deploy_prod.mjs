import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DEPLOYMENT_ID =
  "AKfycbz_Movz5VBZkf8qHdMkR7kkQRkLkYJAbahN5OPStFT8YXnhCuIGJBCdqjy2PwgWaorUfA";

const scriptRoot = fileURLToPath(new URL(".", import.meta.url));
const comment = process.argv[2]?.trim();
const deploymentId =
  process.env.DOJO_GAS_DEPLOYMENT_ID?.trim() || DEFAULT_DEPLOYMENT_ID;
const gasUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
const logDirectory = join(scriptRoot, "deploy_logs");
const timestamp = formatTimestamp(new Date());
const logPath = join(logDirectory, `deploy-${timestamp}.log`);

if (!comment) {
  console.error('使用方法: node deploy_prod.mjs "デプロイコメント"');
  process.exit(2);
}

const claspDirectory = findClaspDirectory();
mkdirSync(logDirectory, { recursive: true });
writeFileSync(logPath, "", "utf8");

try {
  log("本番デプロイを開始します。");
  log(`claspディレクトリ: ${claspDirectory}`);
  log(`Deployment ID: ${deploymentId}`);
  log(`コメント: ${comment}`);

  log("デプロイ前の履歴:");
  runClasp(["deployments"]);

  log("既存の本番Deployment IDへデプロイします。");
  runClasp(["deploy", "-i", deploymentId, "-d", comment]);

  log("デプロイ後の履歴:");
  runClasp(["deployments"]);

  log("未ログイン相当の匿名疎通を確認します。");
  await testAnonymousWebApp();

  log("PASS: 本番デプロイと匿名疎通が正常です。");
  console.log(`\n診断ログ: ${logPath}`);
} catch (error) {
  log(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  console.error(
    "\n対処: Apps Scriptの「デプロイを管理」で、本番Deployment IDとアクセスできるユーザーを確認してください。",
  );
  console.error(`診断ログ: ${logPath}`);
  process.exitCode = 1;
}

function findClaspDirectory() {
  if (existsSync(join(scriptRoot, ".clasp.json"))) return scriptRoot;

  const gasDirectory = join(scriptRoot, "gas");
  if (existsSync(join(gasDirectory, ".clasp.json"))) return gasDirectory;

  throw new Error(
    ".clasp.json がルートまたは gas ディレクトリに見つかりません。",
  );
}

function runClasp(args) {
  const command = process.platform === "win32" ? "clasp.cmd" : "clasp";
  const result = spawnSync(command, args, {
    cwd: claspDirectory,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`claspを起動できません: ${result.error.message}`);
  }

  for (const line of `${result.stdout || ""}${result.stderr || ""}`
    .split(/\r?\n/)
    .filter(Boolean)) {
    log(line);
  }

  if (result.status !== 0) {
    throw new Error(
      `clasp ${args.join(" ")} が終了コード ${result.status} で失敗しました。`,
    );
  }
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
    response = await fetch(healthUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/javascript, application/json, text/plain, */*",
        "User-Agent": "AikidoDojoManagement-DeployDiagnostic/1.0",
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("匿名疎通が30秒でタイムアウトしました。");
    }
    throw new Error(`匿名HTTP通信に失敗しました: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.text();
  log(
    `匿名疎通: HTTP=${response.status} Content-Type=${response.headers.get("content-type") || ""}`,
  );
  log(`最終URL: ${response.url}`);

  if (/accounts\.google\.com|ServiceLogin/i.test(response.url)) {
    throw new Error(
      "Googleログイン画面へ転送されました。Webアプリのアクセス権が「自分のみ」の可能性があります。",
    );
  }
  if (!response.ok) {
    throw new Error(
      `匿名疎通のHTTPステータスが正常ではありません: ${response.status}`,
    );
  }

  const escapedCallback = callback.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(
    new RegExp(`^\\s*${escapedCallback}\\((.*)\\);?\\s*$`, "s"),
  );
  if (!match) {
    const preview = body.replace(/\s+/g, " ").slice(0, 200);
    log(`応答先頭: ${preview}`);
    throw new Error(
      "system_contextのJSONP応答ではありません。公開範囲またはデプロイ先を確認してください。",
    );
  }

  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    throw new Error("system_contextのJSONP内が正しいJSONではありません。");
  }
  if (payload?.ok !== true) {
    throw new Error("system_contextが ok=true を返しませんでした。");
  }

  log(
    `system_context: ok=true system_now=${payload.system_now} target_month=${payload.target_month}`,
  );
}

function log(message) {
  const line = `[${formatLogTime(new Date())}] ${message}`;
  console.log(line);
  appendFileSync(logPath, `${line}\n`, "utf8");
}

function formatTimestamp(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}

function formatLogTime(date) {
  return [
    date.getFullYear(),
    "-",
    String(date.getMonth() + 1).padStart(2, "0"),
    "-",
    String(date.getDate()).padStart(2, "0"),
    " ",
    String(date.getHours()).padStart(2, "0"),
    ":",
    String(date.getMinutes()).padStart(2, "0"),
    ":",
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}
