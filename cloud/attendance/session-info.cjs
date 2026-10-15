'use strict';
// Pure SessionInfo calculation. Authorization and HTTP routing belong to the caller.
const normalize = value => String(value == null ? '' : value).trim();
const active = row => ['', '有効', '在籍', 'TRUE'].includes(normalize(row['状態']));
const minutes = value => {
  const m = normalize(value).match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const hhmm = value => normalize(value);
const clockText = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const weekdayMatches = (value, day) => {
  const text = normalize(value).replace(/曜日/g, '');
  return text === day || text.includes(day);
};
const candidatesDTO = list => list.map(({billing_block_id, label, start_time, end_time}) => ({billing_block_id, label, start_time, end_time}));
function createSessionInfo({readSessionMasters, now = () => new Date(), timeZone = 'Asia/Tokyo'}) {
  if (typeof readSessionMasters !== 'function') throw new TypeError('readSessionMasters required');
  return async function getSessionInfo(params = {}) {
    const locationId = normalize(params.location_id);
    const requestedBlockId = normalize(params.billing_block_id);
    if (!locationId) return {ok:false,message:'location_id が必要です。'};
    const {location, billingBlocks, trainingSlots} = await readSessionMasters(locationId);
    if (!location || !active(location)) return {ok:false,message:'有効な道場が見つかりません。'};
    const date = params.at ? new Date(params.at) : now();
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('課金枠判定日時が不正です。');
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone, weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    }).formatToParts(date).map(part => [part.type, part.value]));
    const day = ({Mon:'月',Tue:'火',Wed:'水',Thu:'木',Fri:'金',Sat:'土',Sun:'日'})[dateParts.weekday];
    const current = Number(dateParts.hour) * 60 + Number(dateParts.minute);
    const validSlots = trainingSlots.filter(row => normalize(row.location_id) === locationId && active(row));
    const candidates = billingBlocks.filter(block => normalize(block.location_id) === locationId && active(block) && weekdayMatches(block['曜日'], day))
      .map(block => {
        const id = normalize(block.billing_block_id);
        const slots = validSlots.filter(slot => normalize(slot.billing_block_id) === id);
        if (!slots.length) return null;
        const start = Math.min(...slots.map(slot => minutes(slot['開始時刻'])));
        const end = Math.max(...slots.map(slot => minutes(slot['終了時刻'])));
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        return {billing_block_id:id,label:String(block['表示名'] || id),start_time:clockText(start),end_time:clockText(end),
          is_current:current >= start && current <= end,is_nearby:current >= start - 30 && current <= end};
      }).filter(Boolean).sort((a,b) => minutes(a.start_time) - minutes(b.start_time));
    function build(blockId, inferred) {
      const block = billingBlocks.find(row => normalize(row.billing_block_id) === blockId && normalize(row.location_id) === locationId && active(row));
      if (!block) return {ok:false,message:'道場に対応する有効な課金枠が見つかりません。'};
      const slots = validSlots.filter(row => normalize(row.billing_block_id) === blockId)
        .sort((a,b) => minutes(a['開始時刻']) - minutes(b['開始時刻']))
        .map(row => ({slot_id:normalize(row.slot_id),label:String(row['表示名'] || row.slot_id),start_time:hhmm(row['開始時刻']),
          end_time:hhmm(row['終了時刻']),duration_minutes:Number(row['稽古時間分'] || 60)}));
      if (!slots.length) return {ok:false,message:'稽古枠が登録されていません。'};
      return {ok:true,requires_selection:false,inferred,location_id:locationId,
        location_name:String(location['表示名'] || location['道場名'] || locationId),billing_block_id:blockId,
        billing_block_name:String(block['表示名'] || blockId),slots_per_charge:Number(block['1課金あたり枠数'] || 2),
        slots,billing_block_candidates:candidatesDTO(candidates)};
    }
    if (requestedBlockId) return build(requestedBlockId, false);
    const exact = candidates.filter(x => x.is_current);
    const nearby = candidates.filter(x => x.is_nearby);
    if (exact.length === 1) return build(exact[0].billing_block_id, true);
    if (!exact.length && nearby.length === 1) return build(nearby[0].billing_block_id, true);
    const choices = exact.length > 1 ? exact : (nearby.length ? nearby : candidates);
    return {ok:true,location_id:locationId,location_name:String(location['表示名'] || location['道場名'] || locationId),
      requires_selection:true,billing_block_candidates:candidatesDTO(choices),message:choices.length
        ? '課金枠を自動判定できませんでした。候補から選択してください。' : '本日の課金枠がありません。'};
  };
}
// Bind the existing selector to the authoritative business clock, not client `at`.
function createSystemSessionInfo({readSessionMasters,getSystemContext}) {
  if(typeof getSystemContext!=='function')throw new TypeError('SYSTEM_CONTEXT_REQUIRED');
  const select=createSessionInfo({readSessionMasters});
  return async params=>{
    const context=await getSystemContext();
    if(context?.ok!==true || context.timezone!=='Asia/Tokyo' ||
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(context.system_now || ''))
      throw new Error('SYSTEM_CONTEXT_UNAVAILABLE');
    const iso=context.system_now.replace(' ','T')+'+09:00',date=new Date(iso);
    if(!Number.isFinite(date.getTime()) || new Date(date.getTime()+9*3600000).toISOString().slice(0,19)!==context.system_now.replace(' ','T'))
      throw new Error('SYSTEM_CONTEXT_UNAVAILABLE');
    return select({...params,at:iso});
  };
}
module.exports = {createSessionInfo,createSystemSessionInfo};
