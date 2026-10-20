(function(root){
  "use strict";
  const scope={
    teacher_id:"",
    location_id:"PAPER_UNKNOWN_LOCATION",
    billing_block_id:"PAPER_UNKNOWN_BILLING_BLOCK",
    attendance_session_id:"PAPER_UNKNOWN_SCOPE",
    location_name:"道場不明",
    billing_block_name:"課金枠不明",
    slots:[
      {slot_id:"PAPER_UNKNOWN_SLOT_1",display_name:"稽古枠不明"},
      {slot_id:"PAPER_UNKNOWN_SLOT_2",display_name:"稽古枠不明"}
    ]
  };
  const masters={
    dojo:{location_id:scope.location_id,display_name:scope.location_name,dojo_name:scope.location_name,status:"有効",notes:"紙の出席記録取込専用"},
    billing_block:{billing_block_id:scope.billing_block_id,location_id:scope.location_id,display_name:scope.billing_block_name,slots_per_charge:2,maximum_training_slots:2,status:"有効",notes:"紙取込専用。skip_billing=trueでのみ利用"},
    training_slots:scope.slots.map((slot,index)=>({slot_id:slot.slot_id,location_id:scope.location_id,display_name:slot.display_name,day_of_week:"",start_time:"",end_time:"",duration_minutes:60,billing_block_id:scope.billing_block_id,attendance_allowed:true,billing_allowed:false,status:"有効",notes:"紙取込の同日"+(index+1)+"回目を識別する内部枠"}))
  };
  const api={scope,masters};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.DOJO_PAPER_ATTENDANCE_SCOPE=api;
})(typeof window!=="undefined"?window:null);
