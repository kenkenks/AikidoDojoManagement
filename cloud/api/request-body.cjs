'use strict';

const STANDARD_JSON_LIMIT = 64 * 1024;
const PAPER_OCR_JSON_LIMIT = 6 * 1024 * 1024;

async function readJsonBody(req, maxBytes = STANDARD_JSON_LIMIT) {
  const declared = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    const error = new Error('BODY_TOO_LARGE'); error.code = 'BODY_TOO_LARGE'; throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // This is authoritative even when Content-Length is absent or understated.
    if (size > maxBytes) {
      const error = new Error('BODY_TOO_LARGE'); error.code = 'BODY_TOO_LARGE'; throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}

module.exports={readJsonBody,STANDARD_JSON_LIMIT,PAPER_OCR_JSON_LIMIT};
