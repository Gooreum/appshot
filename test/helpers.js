import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLACEHOLDER_MARKER } from '../src/placeholder-marker.js';

// status·export 테스트가 같이 쓰는 가짜 PNG와 임시 프로젝트.

/** PNG 시그니처 + IHDR만 있는 33바이트 가짜 PNG. sizeFromBuffer가 폭·높이를 읽는 데 충분하다. */
export function fakePNG(w, h) {
  const buf = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
}

export const IPHONE = [1290, 2796];
export const IPAD = [2064, 2752];
export const PIXEL = [1080, 1920];
export const FEATURE = [1024, 500];

/**
 * 임시 프로젝트. shots: { 'ko/iphone-17-pro-max': [[w,h], ...] }  (index = 배열 순서, null이면 빈 번호)
 * featureGraphics: { ko: [w,h] } — {output}/{locale}/feature-graphic.png
 * markers: { 'ko/iphone-17-pro-max': { '03.png': ['screen'] } | '문자열(그대로 기록)' } — 자리표시자 표시
 */
export function project(cfg, shots, { files = {}, mtimeShift = 0, featureGraphics = {}, markers = {} } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'appshot-status-'));
  const t0 = Date.now() / 1000 - 1000; // 결과물 기준 시각(초)
  fs.writeFileSync(path.join(cwd, 'appshot.config.json'), JSON.stringify(cfg));
  fs.utimesSync(path.join(cwd, 'appshot.config.json'), t0 - 100, t0 - 100);
  fs.mkdirSync(path.join(cwd, 'screens'), { recursive: true });
  for (const s of cfg.screens) {
    const f = path.join(cwd, s.source);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, fakePNG(100, 200));
    fs.utimesSync(f, t0 - 50, t0 - 50);
  }
  for (const [key, list] of Object.entries(shots)) {
    const dir = path.join(cwd, cfg.output, key);
    fs.mkdirSync(dir, { recursive: true });
    list.forEach((wh, i) => {
      if (!wh) return;
      const f = path.join(dir, `${String(i + 1).padStart(2, '0')}.png`);
      fs.writeFileSync(f, fakePNG(...wh));
      fs.utimesSync(f, t0 + mtimeShift, t0 + mtimeShift);
    });
  }
  for (const [locale, wh] of Object.entries(featureGraphics)) {
    const f = path.join(cwd, cfg.output, locale, 'feature-graphic.png');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, fakePNG(...wh));
    fs.utimesSync(f, t0 + mtimeShift, t0 + mtimeShift);
  }
  for (const [key, m] of Object.entries(markers)) {
    const f = path.join(cwd, cfg.output, key, PLACEHOLDER_MARKER);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof m === 'string' ? m : JSON.stringify({ version: 1, files: m }));
  }
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(cwd, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  return { cwd, t0 };
}
