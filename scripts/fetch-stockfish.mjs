#!/usr/bin/env node
/**
 * scripts/fetch-stockfish.mjs — Stockfish 17.1 Lite 엔진 파일을 빌드 전에 준비한다.
 *
 * 배경: 7.3MB WASM 바이너리를 git에 직접 커밋하면 푸시 도구가 전송 제한에 걸리므로,
 * 빌드 시점(unpkg → jsdelivr 폴백)에 내려받아 public/stockfish/에 둔다.
 * Vercel 빌드 환경은 외부 네트워크 접근이 되므로 prebuild 단계에서 실행된다.
 * 이미 파일이 있으면(로컬 개발 등) 다운로드를 건너뛴다.
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';
import { get as getHttp } from 'node:http';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destDir = join(root, 'public', 'stockfish');

const FILES = [
  { name: 'stockfish-17.1-lite-single-03e3232.js', size: 20672 },
  { name: 'stockfish-17.1-lite-single-03e3232.wasm', size: 7280741 },
];

const BASES = [
  'https://unpkg.com/stockfish@17.1.0/src',
  'https://cdn.jsdelivr.net/npm/stockfish@17.1.0/src',
];

function fetchTo(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? get : getHttp;
    const req = client(url, { headers: { 'User-Agent': 'chess-site-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchTo(new URL(res.headers.location, url).toString(), dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }
      const out = createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => resolve());
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error(`timeout: ${url}`));
    });
  });
}

async function main() {
  mkdirSync(destDir, { recursive: true });
  for (const f of FILES) {
    const dest = join(destDir, f.name);
    if (existsSync(dest) && statSync(dest).size === f.size) {
      console.log(`[stockfish] skip (exists): ${f.name}`);
      continue;
    }
    let ok = false;
    let lastErr = null;
    for (const base of BASES) {
      const url = `${base}/${f.name}`;
      try {
        console.log(`[stockfish] downloading: ${url}`);
        await fetchTo(url, dest);
        const got = statSync(dest).size;
        if (got !== f.size) throw new Error(`size mismatch: got ${got}, want ${f.size}`);
        ok = true;
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`[stockfish] failed ${base}: ${e.message}`);
      }
    }
    if (!ok) throw new Error(`[stockfish] cannot fetch ${f.name}: ${lastErr?.message}`);
    console.log(`[stockfish] ok: ${f.name}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
