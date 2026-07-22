import fs from "node:fs";
import vm from "node:vm";

const context = {
  Logger: { log: () => {} },
  Session: { getScriptTimeZone: () => "Asia/Tokyo" },
  Utilities: {
    formatDate(value, zone, format) {
      const date = new Date(value);
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      }).formatToParts(date).reduce((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
      if (format === "yyyy-MM") return `${parts.year}-${parts.month}`;
      if (format === "yyyy-MM-dd") return `${parts.year}-${parts.month}-${parts.day}`;
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
    }
  },
  ensureSheetContext: value => value || {},
  normalizeMonth: value => String(value || "").slice(0, 7)
};

vm.createContext(context);
[
  "gas/sup_timeTravel.js",
  "gas/04_Attendance.js",
  "gas/12_MonthlyPilotRunner.js"
].forEach(file => vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file }));

const result = context.runner_story_simulation_902();
if (!result.ok) throw new Error(JSON.stringify(result, null, 2));
if (result.total !== 8 || result.sheet_writes !== 0 || result.settings_writes !== 0) {
  throw new Error("Runner phase or safety result mismatch");
}

const monthEnd = result.steps.find(step => step.phase === "MonthEnd");
const nextMonth = result.steps.find(step => step.phase === "NextMonth");
if (!monthEnd || monthEnd.actual.billed_total !== 25500 || monthEnd.actual.unpaid_total !== 7500) {
  throw new Error("MonthEnd totals mismatch");
}
if (monthEnd.actual.attendance_without_invoice.includes("M_FAMILY_B")) {
  throw new Error("Family billing group was not applied");
}
if (!nextMonth || nextMonth.actual.target_month !== "2026-08" || nextMonth.actual.paid_total !== 0) {
  throw new Error("NextMonth isolation mismatch");
}

console.log(`STORY-902 monthly core runner: OK (${result.total} phases, ${result.elapsed_ms}ms)`);
