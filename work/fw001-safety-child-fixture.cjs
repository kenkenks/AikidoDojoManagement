'use strict';
// Offline supervision fixture: no Firebase SDK, credentials or network access.
let behavior,keepalive;
process.on('message',message=>{
  if(message.type==='start'){
    behavior=message.job.behavior;
    if(behavior==='success'){
      process.send({type:'result',result:{ok:true}},()=>process.disconnect());
      process.removeAllListeners('message');
    }else if(behavior==='result_then_hang'){
      process.send({type:'result',result:{ok:true}});setInterval(()=>{},1000);
    }else keepalive=setInterval(()=>{},1000);
  }
  if(message.type==='abort' && behavior==='cooperate'){
    process.send({type:'result',result:{ok:false}},()=>process.disconnect());
    process.removeAllListeners('message');
    clearInterval(keepalive);
    // Remove this fixture's keepalive without terminating the test controller.
    process.exitCode=1;
  }
});
