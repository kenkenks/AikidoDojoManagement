'use strict';

// Step 2 prototype only: sends one image inline to Document AI and keeps the
// response in memory. It never writes the image or OCR response to disk.
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const {applicationDefault} = require('firebase-admin/app');

const imagePath = process.argv[2];
const processor = process.env.DOCUMENT_AI_PROCESSOR || '';
const processorVersion = process.env.DOCUMENT_AI_PROCESSOR_VERSION || '';
if (!imagePath || !processor) {
  console.error('usage: DOCUMENT_AI_PROCESSOR=projects/.../processors/... node work/paper-attendance-ocr-prototype.cjs <image>');
  process.exit(2);
}
if (!/^projects\/\d+\/locations\/[a-z0-9-]+\/processors\/[a-f0-9]+$/.test(processor)) {
  throw new Error('INVALID_DOCUMENT_AI_PROCESSOR');
}

function anchoredText(document, layout) {
  const text = String(document.text || '');
  return (layout?.textAnchor?.textSegments || []).map(segment => {
    const start = Number(segment.startIndex || 0);
    const end = Number(segment.endIndex || start);
    // Document AI offsets address Unicode text, not UTF-8 byte positions.
    return text.slice(start, end);
  }).join('');
}

function center(layout) {
  const points = layout?.boundingPoly?.normalizedVertices || [];
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + Number(point.x || 0), 0) / points.length,
    y: points.reduce((sum, point) => sum + Number(point.y || 0), 0) / points.length
  };
}

function normalizeDigits(value) {
  return String(value || '').normalize('NFKC').replace(/[／]/g, '/').trim();
}

function isDateCandidate(value) {
  const text = normalizeDigits(value);
  return /\d/.test(text) && /^[0-9/.\-年月日\s]{2,14}$/.test(text);
}

function imageBytes() {
  if (process.env.PAPER_GRID_CROP !== '1') return fs.readFileSync(imagePath);
  const python = process.env.PYTHON_EXE || 'python';
  const code = [
    'import io,sys',
    'from PIL import Image,ImageOps,ImageEnhance',
    'im=Image.open(sys.argv[1]).convert("L")',
    // Fixed prototype coordinates for the supplied 4284x5712 photograph.
    'im=im.crop((270,1630,3260,3765))',
    'im=ImageOps.autocontrast(im,cutoff=1)',
    'im=ImageEnhance.Contrast(im).enhance(1.35)',
    'im=im.resize((4485,3203),Image.Resampling.LANCZOS)',
    'b=io.BytesIO();im.save(b,"JPEG",quality=92);sys.stdout.buffer.write(b.getvalue())'
  ].join(';');
  const result = spawnSync(python, ['-c', code, imagePath], {encoding: null, maxBuffer: 24 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout?.length) throw new Error('IMAGE_PREPROCESS_FAILED');
  return result.stdout;
}

async function main() {
  const started = Date.now();
  const credential = applicationDefault();
  const accessToken = (await credential.getAccessToken()).access_token;
  const location = processor.split('/')[3];
  const resource = processorVersion ? `${processor}/processorVersions/${processorVersion}` : processor;
  const request = {
    rawDocument: {mimeType: 'image/jpeg', content: imageBytes().toString('base64')}
  };
  const response = await fetch(`https://${location}-documentai.googleapis.com/v1/${resource}:process`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json'},
    // Keep the request portable across the deployed OCR processor versions.
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    let code = '', detail = '';
    try {
      const apiError = (await response.json())?.error || {};
      code = String(apiError.status || '');
      detail = String(apiError.message || '').replace(/[^A-Za-z0-9 .:_/\-]/g, '').slice(0, 240);
    } catch {}
    const error = new Error(`DOCUMENT_AI_HTTP_${response.status}${/^[A-Z_]+$/.test(code) ? '_'+code : ''}`);
    error.safeDetail = detail;
    throw error;
  }
  const payload = await response.json();
  const document = payload.document || {};
  const pages = Array.isArray(document.pages) ? document.pages : [];
  const candidates = [];
  for (const page of pages) {
    for (const token of page.tokens || []) {
      const raw = anchoredText(document, token.layout);
      if (!isDateCandidate(raw)) continue;
      const point = center(token.layout);
      if (!point) continue;
      candidates.push({
        text: normalizeDigits(raw),
        x: Number(point.x.toFixed(6)),
        y: Number(point.y.toFixed(6)),
        confidence: Number(Number(token.layout?.confidence || 0).toFixed(4))
      });
    }
  }
  console.log(JSON.stringify({
    ok: true,
    elapsed_ms: Date.now() - started,
    page_count: pages.length,
    date_candidate_count: candidates.length,
    date_candidates: candidates
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'OCR_PROTOTYPE_FAILED',detail:error.safeDetail||''}));
  process.exit(1);
});
