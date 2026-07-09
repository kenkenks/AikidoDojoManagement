// ========================================
// 10_MainStoryRunner.gs
// Main Story Runner
// ========================================
//
// TYPE: RUNNER
// AREA: MAIN_STORY
// TAG: MAIN_STORY
// TAG: RUNNER
// TAG: STORY-MAIN001
//

function runner_story_main001() {

  Logger.log("========== STORY-MAIN001 START ==========");

  const billing = runner_billing_story_001();
  Logger.log("Billing : " + (billing.ok ? "PASS" : "FAIL"));

  const p001 = runner_payment_story_p001();
  Logger.log("P001 : " + (p001.ok ? "PASS" : "FAIL"));

  const p002 = runner_payment_story_p002();
  Logger.log("P002 : " + (p002.ok ? "PASS" : "FAIL"));

  const p004 = runner_payment_story_p004();
  Logger.log("P004 : " + (p004.ok ? "PASS" : "FAIL"));

  const p003 = runner_payment_story_p003();
  Logger.log("P003 : " + (p003.ok ? "PASS" : "FAIL"));

  const ok =
    billing.ok &&
    p001.ok &&
    p002.ok &&
    p004.ok &&
    p003.ok;

  Logger.log("========== STORY-MAIN001 END ==========");

  return {
    ok: ok,
    story: "STORY-MAIN001",
    message: ok
      ? "STORY-MAIN001 PASS"
      : "STORY-MAIN001 FAIL",

    results: {
      billing,
      p001,
      p002,
      p004,
      p003
    }
  };
}