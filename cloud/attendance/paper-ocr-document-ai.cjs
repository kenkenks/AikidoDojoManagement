'use strict';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 18 * 1000 * 1000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,255}$/;

function fail(code, status = 400) {
  const error = new Error(code); error.code = code; error.status = status; throw error;
}
function dimensions(buffer, mime) {
  if (mime === 'image/png' && buffer.length >= 24 && buffer.subarray(1, 4).toString() === 'PNG') {
    return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
  }
  if (mime === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8) {
    for (let i=2;i+9<buffer.length;) {
      if (buffer[i] !== 0xff) { i++; continue; }
      const marker=buffer[i+1],length=buffer.readUInt16BE(i+2);
      if (length < 2) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return {height:buffer.readUInt16BE(i+5),width:buffer.readUInt16BE(i+7)};
      i+=2+length;
    }
  }
  fail('INVALID_PAPER_OCR_IMAGE');
}
function anchoredText(document, layout) {
  const text=String(document.text||'');
  return (layout?.textAnchor?.textSegments||[]).map(segment=>text.slice(Number(segment.startIndex||0),Number(segment.endIndex||0))).join('');
}
function normalizedPolygon(layout) {
  return (layout?.boundingPoly?.normalizedVertices||[]).map(point=>({x:Number(Number(point.x||0).toFixed(6)),y:Number(Number(point.y||0).toFixed(6))})).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));
}
function dateLike(value) {
  const text=String(value||'').normalize('NFKC').replace(/[／]/g,'/').trim();
  return /\d/.test(text)&&/^[0-9/\.\-年月日\s]{2,24}$/.test(text)?text:'';
}
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key=>!['mime_type','image_base64'].includes(key))) fail('INVALID_PAPER_OCR_INPUT');
  if (!['image/jpeg','image/png'].includes(input.mime_type) || typeof input.image_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.image_base64)) fail('INVALID_PAPER_OCR_INPUT');
  const buffer=Buffer.from(input.image_base64,'base64');
  if (!buffer.length || buffer.length>MAX_IMAGE_BYTES || buffer.toString('base64')!==input.image_base64) fail('PAPER_OCR_IMAGE_TOO_LARGE',413);
  const size=dimensions(buffer,input.mime_type);
  if (!size.width||!size.height||size.width*size.height>MAX_PIXELS) fail('PAPER_OCR_IMAGE_TOO_LARGE',413);
  return {buffer,size,mimeType:input.mime_type};
}
function createPaperOcrDocumentAi(options={}) {
  const processor=String(options.processor||''),version=String(options.version||'');
  const getAccessToken=options.getAccessToken,fetchImpl=options.fetchImpl||globalThis.fetch;
  if (!/^projects\/\d+\/locations\/[a-z0-9-]+\/processors\/[a-f0-9]+$/.test(processor)||!ID.test(version)||typeof getAccessToken!=='function'||typeof fetchImpl!=='function') throw new Error('PAPER_OCR_CONFIGURATION_REQUIRED');
  const location=processor.split('/')[3],resource=`${processor}/processorVersions/${version}`;
  return async function readPaperOcr(input) {
    const started=Date.now(),{buffer,size,mimeType}=validate(input);
    // Drop the received Base64 reference before creating the upstream request.
    // This bounds peak memory to the decoded buffer plus one outbound encoding.
    input.image_base64='';
    const token=await getAccessToken(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetchImpl(`https://${location}-documentai.googleapis.com/v1/${resource}:process`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({rawDocument:{mimeType,content:buffer.toString('base64')}}),signal:controller.signal});
      if (!response.ok) fail('PAPER_OCR_UPSTREAM_FAILED',503);
      const payload=await response.json(),document=payload?.document||{},pages=Array.isArray(document.pages)?document.pages:[],candidates=[];
      for (const page of pages) for (const tokenRow of page.tokens||[]) {
        const text=dateLike(anchoredText(document,tokenRow.layout)); if (!text) continue;
        const polygon=normalizedPolygon(tokenRow.layout); if (polygon.length<3) continue;
        candidates.push({text,confidence:Number(Number(tokenRow.layout?.confidence||0).toFixed(4)),polygon});
      }
      return {ok:true,elapsed_ms:Date.now()-started,image_width:size.width,image_height:size.height,page_count:pages.length,candidates};
    } catch (error) {
      if (error?.code) throw error;
      fail('PAPER_OCR_UPSTREAM_FAILED',503);
    } finally { clearTimeout(timer); }
  };
}

module.exports={createPaperOcrDocumentAi,validatePaperOcrInput:validate,MAX_IMAGE_BYTES};
