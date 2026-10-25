'use strict';
const {isProgressAttendanceActive,normalizeProgressDate}=require('./progress-summary.cjs');
const clean=value=>String(value??'').trim();
const DAY=86400000;

function unavailable(reason,details={}){
  return {forecast_status:'UNAVAILABLE',forecast_label:'算出不可',forecast_reason:reason,
    forecast_weeks:null,weekly_training_slots:null,recent_training_days:details.days??0,recent_training_slots:details.slots??0};
}
function estimateProgressForecast({summary,attendanceRows,asOfDate,windowDays=90,minAttendanceDays=3}){
  if(!summary||!Array.isArray(attendanceRows)||!Number.isInteger(windowDays)||windowDays<1||
      !Number.isInteger(minAttendanceDays)||minAttendanceDays<1)throw Error('INVALID_PROGRESS_FORECAST_INPUT');
  const end=normalizeProgressDate(asOfDate);
  if(!end)throw Error('INVALID_PROGRESS_FORECAST_DATE');
  if(!(Number(summary.required_training_count)>0))return unavailable('REQUIRED_UNSET');
  if(!clean(summary.current_rank)||!clean(summary.next_rank))return unavailable('RANK_CONDITION_UNAVAILABLE');
  const remaining=Number(summary.remaining_training_count);
  if(!Number.isFinite(remaining))return unavailable('REQUIRED_UNSET');
  if(remaining<=0)return {forecast_status:'ACHIEVED',forecast_label:'必要枠達成',forecast_reason:'',forecast_weeks:0,
    weekly_training_slots:null,recent_training_days:0,recent_training_slots:0};
  const endMs=Date.parse(end+'T00:00:00Z'),start=new Date(endMs-(windowDays-1)*DAY).toISOString().slice(0,10);
  const keys=new Set(),dates=new Set(),memberId=clean(summary.member_id);
  for(const row of attendanceRows){
    if(!row||clean(row.member_id)!==memberId||!isProgressAttendanceActive(row))continue;
    const d=normalizeProgressDate(row['稽古日']);
    if(!d||d<start||d>end)continue;
    keys.add(d+'|'+(clean(row.slot_id)||'LEGACY_NO_SLOT'));dates.add(d);
  }
  const details={days:dates.size,slots:keys.size};
  if(keys.size===0)return unavailable('ZERO_FREQUENCY',details);
  if(dates.size<minAttendanceDays)return unavailable('HISTORY_INSUFFICIENT',details);
  const weekly=keys.size*7/windowDays,weeks=Math.max(1,Math.ceil(remaining/weekly));
  const label=weeks>8?'約'+Math.max(2,Math.round(weeks/(365.25/12/7)))+'か月後':'約'+weeks+'週間後';
  return {forecast_status:'ESTIMATED',forecast_label:label,forecast_reason:'',forecast_weeks:weeks,
    weekly_training_slots:Number(weekly.toFixed(3)),recent_training_days:dates.size,recent_training_slots:keys.size};
}
module.exports={estimateProgressForecast};
