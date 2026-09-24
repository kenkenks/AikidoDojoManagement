//
// ================================
// ユーティリティ機能
// ================================
//

// 会員カード生成
function generateMemberCards() {

  const headers = [
    "member_id",
    "氏名",
    "URL",
    "QR"
  ];

  const access = daoMemberCardBegin_(headers);
  const members = access.readMembers();

  const webAppUrl = ScriptApp.getService().getUrl();

  const rows = [];

  members.forEach(member => {

    if (member["状態"] === "退会") return;

    const memberId = member["member_id"];

    const url =
      webAppUrl +
      "?member_id=" +
      encodeURIComponent(memberId);

    const qrFormula =
      `=IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" & ENCODEURL(C${rows.length + 2}))`;

    rows.push([
      memberId,
      member["氏名"],
      url,
      qrFormula
    ]);
  });

  if (rows.length > 0) {
    access.writeRows(rows);
  }

  Browser.msgBox(`${rows.length}件の会員カードを作成しました。`);
} 

// 会員カードテンプレート
function createMemberCardTemplate() {
  daoMemberCardCreateTemplate_();
  Browser.msgBox("会員カードテンプレートを作成しました。B1に会員IDを入力するとカードが切り替わります。");
}


// 会員会費情報取得
function getMemberInfoForPayment(memberId) {
  const targetMemberId = String(memberId || "").trim();

  const values = daoMemberCardReadMemberValues_();

  const headers = values[0].map(h => String(h).trim());

  const idCol = headers.indexOf("member_id");
  const nameCol = headers.indexOf("氏名");

  if (idCol < 0) {
    return {
      success: false,
      message: "会員ID列が見つかりません",
      headers: headers
    };
  }

  if (nameCol < 0) {
    return {
      success: false,
      message: "氏名列が見つかりません",
      headers: headers
    };
  }

  const sampleIds = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowMemberId = String(row[idCol] || "").trim();

    if (sampleIds.length < 5 && rowMemberId) {
      sampleIds.push(rowMemberId);
    }

    if (rowMemberId === targetMemberId) {
      return {
        success: true,
        memberId: rowMemberId,
        memberName: row[nameCol]
      };
    }
  }

  return {
    success: false,
    message: "会員が見つかりません: " + targetMemberId,
    sampleIds: sampleIds,
    headers: headers
  };
}