(function(root){
  'use strict';
  const byId=id=>document.getElementById(id);
  let auth=null,client=null,busy=false;
  function baseUrl(){const value=String(root.DOJO_RUNTIME_CONFIG?.apiBaseUrl||'').replace(/\/+$/,'');if(root.DOJO_RUNTIME_CONFIG?.runtime!=='firebase'||!/^https:\/\//.test(value))throw Error('Firebase DEV接続先が未設定です。');return value;}
  async function request(action,input,method){
    await auth.ready;if(!auth.getCurrentUser())throw Error('Firebaseログインが必要です。');
    const url=new URL(baseUrl()+'/api/webconnect'),init={method};
    if(method==='GET'){url.searchParams.set('action',action);for(const [key,value] of Object.entries(input||{}))if(value)url.searchParams.set(key,String(value));}
    else{init.headers={'Content-Type':'application/json'};init.body=JSON.stringify({action,input});}
    const response=await client.request(url.toString(),init);let body={};try{body=await response.json();}catch{}
    if(!response.ok||body.ok!==true){const error=Error(body.error||'確認待ち出席の操作に失敗しました。');error.status=response.status;throw error;}return body;
  }
  function message(value,error=false){const node=byId('pendingAttendanceResult');node.textContent=value;node.className=error?'error':'note';}
  function render(items){const body=byId('pendingAttendanceRows');body.replaceChildren();byId('pendingAttendanceEmpty').hidden=items.length>0;
    for(const item of items){const tr=document.createElement('tr');for(const value of [item.member_name+' ('+item.member_id+')',item.attendance_date,item.duration_minutes+'分',item.slot_id]){const td=document.createElement('td');td.textContent=value;tr.append(td);}const action=document.createElement('td'),button=document.createElement('button');button.type='button';button.textContent='承認';button.disabled=busy;button.onclick=()=>confirm(item.attendance_id);action.append(button);tr.append(action);body.append(tr);}}
  async function load(prefix=''){if(busy)return;busy=true;message('確認待ちの出席を取得しています…');try{const result=await request('attendance_pending_list',{},'GET');render(result.attendance_items||[]);message((prefix?prefix+' ':'')+'確認待ち '+result.count+'件');}catch(error){render([]);message(error.message,true);}finally{busy=false;}}
  async function confirm(attendanceId){if(busy||!root.confirm('この出席を確認済みにしますか？'))return;busy=true;message('承認しています…');try{const result=await request('attendance_pending_confirm',{attendance_id:attendanceId},'POST');busy=false;await load(result.already_confirmed?'すでに承認済みです。':'承認しました。');}catch(error){message(error.message,true);busy=false;}}
  async function init(){
    if(root.DOJO_RUNTIME_CONFIG?.runtime!=='firebase'){message('確認待ち一覧はFirebase DEV版で利用できます。',true);return;}
    auth=root.DOJO_FIREBASE_AUTH.create({runtimeConfig:root.DOJO_RUNTIME_CONFIG});client=root.DOJO_API_CLIENT.create({getCurrentUser:auth.getCurrentUser});
    await auth.ready;const user=auth.getCurrentUser();byId('pendingAttendanceAuth').textContent=user?'認証済み':'未認証';byId('pendingAttendanceLogin').hidden=!!user;byId('pendingAttendanceReload').disabled=!user;
    if(user)await load();else message('一覧の取得にはFirebaseログインが必要です。',true);
  }
  document.addEventListener('DOMContentLoaded',()=>{byId('pendingAttendanceReload').onclick=load;byId('pendingAttendanceLogin').onclick=()=>{location.href='index.html?return_url='+encodeURIComponent(location.pathname+location.search);};init().catch(error=>message(error.message,true));});
})(typeof window!=='undefined'?window:globalThis);
