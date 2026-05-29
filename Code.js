function doGet(e) {
  const mode = e.parameter.mode || "member";

  if (mode === "qr_test") {
    return HtmlService
      .createHtmlOutputFromFile("qr_test")
      .setTitle("QR読み取り実験")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutputFromFile("index");
}

function doPost(e) {
  console.log("===== doPost START =====");

  if (e && e.postData) {
    console.log(e.postData.contents);
  } else {
    console.log("postDataなし");
  }

  const data = JSON.parse(e.postData.contents);

  registerAttendance(
    data.member_id,
    data.location_id
  );

  return ContentService
    .createTextOutput(
      JSON.stringify({ ok: true })
    )
    .setMimeType(ContentService.MimeType.JSON);
}