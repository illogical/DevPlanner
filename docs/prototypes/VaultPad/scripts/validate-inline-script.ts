#!/usr/bin/env bun

const url = process.argv[2] ?? 'http://localhost:17104/editor?path=20-Knowledge/operations/2026-02-28_00-26-00-agentvault-markdown-qmd-handoff-summary.md';
const u = new URL(url);
const base = u.pathname.endsWith('/editor') ? u.pathname.slice(0, -'/editor'.length) : '';
const origin = u.origin;

const htmlRes = await fetch(url);
if (!htmlRes.ok) {
  console.error('failed to fetch editor html', htmlRes.status);
  process.exit(1);
}
const html = await htmlRes.text();
if (!html.includes('src="./client.js"')) {
  console.error('expected module script ./client.js not found');
  process.exit(2);
}

const jsRes = await fetch(`${origin}${base}/client.js`);
if (!jsRes.ok) {
  console.error('failed to fetch client.js', jsRes.status);
  process.exit(3);
}
const script = await jsRes.text();
try {
  new Function(script);
  console.log('client.js syntax OK');
} catch (e) {
  console.error('client.js syntax ERROR:', (e as Error).message);
  process.exit(4);
}
