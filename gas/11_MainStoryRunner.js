// ========================================
// 11_MainStoryRunner.gs
// Main Story Runner
// ========================================
//
// TYPE: RUNNER
// AREA: MAIN_STORY
// TAG: MAIN_STORY
// TAG: RUNNER
// TAG: STORY-MAIN001
//

// ========================================
// 11_MainStoryRunner.gs
// Main Story Runner
// ========================================
//
// TYPE: RUNNER
// AREA: MAIN_STORY
// TAG: MAIN_STORY
// TAG: RUNNER
// TAG: STORY-MAIN001
//

/**
 * ROLE
 * MainStoryPrepare
 *
 * RESPONSIBILITY
 * STORY-MAIN001の対象範囲だけを初期化する。
 *
 * NOTE
 * 現時点では最小実装。
 * 既存のBusiness Runner側Prepareに任せる。
 */

function runner_story_main001() {
  const startedAt = Date.now();
  const ctx = createSheetContext();

  const story = "STORY-MAIN001";
  const task = "TASK-DEV-015";
  const steps = [];

  function runStep(step, title, fn) {
    const t0 = Date.now();

    try {
      const result = fn();

      steps.push({
        ok: result && result.ok !== false,
        step: step,
        title: title,
        elapsed_ms: Date.now() - t0,
        message: result && result.message ? result.message : "",
        result: result
      });

    } catch (e) {
      steps.push({
        ok: false,
        step: step,
        title: title,
        elapsed_ms: Date.now() - t0,
        message: e.message,
        result: {
          ok: false,
          message: e.message
        }
      });
    }
  }

  runStep("Prepare", "STORY-MAIN001対象データを準備する", function() {
    return mainStoryPrepare_main001_(ctx);
  });

  runStep("Billing", "会費請求を作成する", function() {
    return runner_billing_story_001();
  });

  runStep("Payment Request", "決済エビデンスを作成する", function() {
    return runner_payment_story_p001();
  });

  runStep("Payment Record", "決済コードを記録する", function() {
    return runner_payment_story_p002();
  });

  runStep("Payment Query", "先生画面用一覧を確認する", function() {
    return runner_payment_story_p004();
  });

  runStep("Payment Post", "入金ログへ反映する", function() {
    return runner_payment_story_p003();
  });

  const success = steps.filter(function(step) { return step.ok; }).length;
  const failed = steps.filter(function(step) { return !step.ok; }).length;

  const summary = {
    ok: failed === 0,
    story: story,
    task: task,
    total: steps.length,
    success: success,
    failed: failed,
    elapsed_ms: Date.now() - startedAt,
    steps: steps
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}


function mainStoryPrepare_main001_(ctx) {

    //
    // STORY-MAIN001対象だけ初期化
    //

    return {
        ok: true,
        message: "STORY-MAIN001対象データを初期化しました。"
    };

}