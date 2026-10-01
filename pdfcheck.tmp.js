const fs = require('fs');
const zlib = require('zlib');

const buf = fs.readFileSync('./pdf-preview.pdf');
const raw = buf.toString('latin1');

// Page count from the page tree
const countMatch = raw.match(/\/Count\s+(\d+)/);
console.log('=== structure ===');
console.log('pages (/Count):', countMatch ? countMatch[1] : 'not found');

// Extract and inflate every stream properly
const streams = [];
let idx = 0;
while (true) {
  const s = raw.indexOf('stream', idx);
  if (s === -1) break;
  let dataStart = s + 6;
  if (raw[dataStart] === '\r') dataStart++;
  if (raw[dataStart] === '\n') dataStart++;
  const e = raw.indexOf('endstream', dataStart);
  if (e === -1) break;
  const slice = Buffer.from(raw.slice(dataStart, e), 'latin1');
  try { streams.push(zlib.inflateSync(slice).toString('latin1')); }
  catch { streams.push(slice.toString('latin1')); }
  idx = e + 9;
}

const all = streams.join('\n');
console.log('streams extracted:', streams.length, '| total bytes:', all.length);

// pdfkit writes text as (…) Tj  and (…) TJ  — collect both
const shown = [];
const re = /\(((?:[^()\\]|\\.)*)\)\s*T[jJ]/g;
let m;
while ((m = re.exec(all)) !== null) {
  shown.push(m[1]
    .replace(/\\(\d{3})/g, (mm, d) => String.fromCharCode(parseInt(d, 8)))
    .replace(/\\(.)/g, '$1'));
}
console.log('text runs drawn:', shown.length);

const text = shown.join(' | ');
console.log('');
console.log('=== first 22 text runs (reading order) ===');
shown.slice(0, 22).forEach((t, i) => console.log(`  ${String(i).padStart(2)}: ${t}`));

const checks = {
  'brand header': /SEWRICA\s*CAFE/i.test(text),
  'report title': /Business Report/i.test(text),
  'period start': /2026-09-01/.test(text),
  'period days': /30 days/.test(text),
  'cafe timezone': /\+03:00/.test(text),
  'metric card PAID REVENUE': /PAID REVENUE/i.test(text),
  'metric card OUTSTANDING': /OUTSTANDING/i.test(text),
  'metric card AVG COOKING': /AVG COOKING/i.test(text),
  'section DAILY REVENUE': /DAILY REVENUE/i.test(text),
  'section TOP SELLING ITEMS': /TOP SELLING ITEMS/i.test(text),
  'section SALES BY CATEGORY': /SALES BY CATEGORY/i.test(text),
  'section PAYMENT METHODS': /PAYMENT METHODS/i.test(text),
  'section BUSIEST HOURS': /BUSIEST HOURS/i.test(text),
  'section STAFF PERFORMANCE': /STAFF PERFORMANCE/i.test(text),
  'real chef name': /Selam Bekele/.test(text),
  'real cashier name': /Assefa Girma/.test(text),
  'currency formatted': /ETB/.test(text),
  'thousands separator': /\d,\d{3}/.test(text),
  'confidential footer': /Confidential/i.test(text),
  'page numbering': /Page 1 of \d+/.test(text)
};

console.log('');
console.log('=== content checks ===');
let failed = 0;
for (const [label, ok] of Object.entries(checks)) {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
console.log('');
console.log(failed === 0 ? 'RESULT: all content checks passed' : `RESULT: ${failed} failed`);
