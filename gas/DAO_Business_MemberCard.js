// カード内容・会員選別は呼出元に維持し、物理操作をCoreへ委譲する。
function daoMemberCardBegin_(headers) {
  return daoCore_().beginMemberCards(headers);
}
function daoMemberCardCreateTemplate_() {
  return daoCore_().createMemberCardTemplate();
}
function daoMemberCardReadMemberValues_() {
  return daoCore_().readMemberCardMemberValues();
}
