/*
 * qr_generator.js
 * TASK-QR-002 QR生成共通機能
 *
 * QRの業務データ(URLクエリ)生成と、
 * QR画像サービス(api.qrserver.com)への依存を分離する。
 */
(function (global) {
  "use strict";

  const DEFAULT_BASE_URL = "https://kenkenks.github.io/AikidoDojoManagement/";

  const QR_TYPES = Object.freeze({
    MEMBER_CARD: "MEMBER_CARD",
    PAYMENT_MONTHLY: "PAYMENT_MONTHLY",
    PAYMENT_ONETIME: "PAYMENT_ONETIME",
    DOJO: "DOJO",
    TEACHER: "TEACHER"
  });

  // MEMBER_CARD は現行Google Sheetの実運用URLに合わせる。
  // その他は利用画面が確定するまで設定値として外から上書き可能にする。
  const DEFAULT_ROUTES = Object.freeze({
    MEMBER_CARD: "attendance",
    PAYMENT_MONTHLY: "payment",
    PAYMENT_ONETIME: "payment",
    DOJO: "",
    TEACHER: ""
  });

  function required(value, name) {
    const text = String(value == null ? "" : value).trim();
    if (!text) {
      throw new Error(name + " is required.");
    }
    return text;
  }

  function normalizeBaseUrl(baseUrl) {
    const text = String(baseUrl || DEFAULT_BASE_URL).trim();
    return text.endsWith("/") ? text : text + "/";
  }

  function resolveRoute(qrType, routes) {
    const merged = Object.assign({}, DEFAULT_ROUTES, routes || {});
    if (!Object.prototype.hasOwnProperty.call(merged, qrType)) {
      throw new Error("Unsupported QR type: " + qrType);
    }
    return String(merged[qrType] || "").replace(/^\/+/, "");
  }

  /**
   * QRに埋め込む対象URLを生成する。
   *
   * @param {string} qrType QR_TYPES のいずれか
   * @param {object} params member_id / plan_id / location_id / teacher_id
   * @param {object=} options baseUrl / routes
   * @returns {string}
   */
  function buildQrTargetUrl(qrType, params, options) {
    params = params || {};
    options = options || {};

    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const route = resolveRoute(qrType, options.routes);
    const url = new URL(route, baseUrl);

    switch (qrType) {
      case QR_TYPES.MEMBER_CARD:
        url.searchParams.set("member_id", required(params.member_id, "member_id"));
        break;

      case QR_TYPES.PAYMENT_MONTHLY:
      case QR_TYPES.PAYMENT_ONETIME:
        url.searchParams.set("member_id", required(params.member_id, "member_id"));
        url.searchParams.set("plan_id", required(params.plan_id, "plan_id"));
        break;

      case QR_TYPES.DOJO:
        url.searchParams.set("location_id", required(params.location_id, "location_id"));
        break;

      case QR_TYPES.TEACHER:
        url.searchParams.set("teacher_id", required(params.teacher_id, "teacher_id"));
        break;

      default:
        throw new Error("Unsupported QR type: " + qrType);
    }

    return url.toString();
  }

  /**
   * api.qrserver.com の画像URLを生成する。
   * 将来別サービス/ブラウザ生成へ差し替える場合はここだけ変更する。
   */
  function buildQrImageUrl(targetUrl, options) {
    options = options || {};
    const size = String(options.size || "200x200");
    const serviceUrl =
      String(options.serviceUrl || "https://api.qrserver.com/v1/create-qr-code/");

    const qr = new URL(serviceUrl);
    qr.searchParams.set("size", size);
    qr.searchParams.set("data", required(targetUrl, "targetUrl"));

    // 現行はロゴなし。誤り訂正レベル等を追加するときはここに閉じ込める。
    if (options.ecc) {
      qr.searchParams.set("ecc", String(options.ecc));
    }

    return qr.toString();
  }

  /**
   * HTML側から使いやすいまとめ関数。
   */
  function buildQr(qrType, params, options) {
    options = options || {};
    const targetUrl = buildQrTargetUrl(qrType, params, options);
    const imageUrl = buildQrImageUrl(targetUrl, options.image);
    return {
      type: qrType,
      targetUrl: targetUrl,
      imageUrl: imageUrl
    };
  }

  const api = Object.freeze({
    QR_TYPES,
    DEFAULT_BASE_URL,
    DEFAULT_ROUTES,
    buildQrTargetUrl,
    buildQrImageUrl,
    buildQr
  });

  global.DojoQrGenerator = api;

  // Node runnerでも利用可能にする。ブラウザ側には影響しない。
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
