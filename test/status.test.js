import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanOutput, scanFeatureGraphics, evaluate } from '../src/status.js';
import { defaultConfig } from '../src/config.js';
import { PLACEHOLDER_MARKER } from '../src/placeholder-marker.js';

/** PNG 시그니처 + IHDR만 있는 33바이트 가짜 PNG. sizeFromBuffer가 폭·높이를 읽는 데 충분하다. */
function fakePNG(w, h) {
  const buf = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
}

const IPHONE = [1290, 2796];
const IPAD = [2064, 2752];
const PIXEL = [1080, 1920];
const FEATURE = [1024, 500];

/**
 * 임시 프로젝트. shots: { 'ko/iphone-17-pro-max': [[w,h], ...] }  (index = 배열 순서, null이면 빈 번호)
 * featureGraphics: { ko: [w,h] } — {output}/{locale}/feature-graphic.png
 * markers: { 'ko/iphone-17-pro-max': { '03.png': ['screen'] } | '문자열(그대로 기록)' } — 자리표시자 표시
 */
function project(cfg, shots, { files = {}, mtimeShift = 0, featureGraphics = {}, markers = {} } = {}) {
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

const run = (cwd, cfg, opts = {}) => {
  const outRoot = path.resolve(cwd, cfg.output);
  return evaluate(scanOutput(outRoot), cfg, { cwd, featureGraphics: scanFeatureGraphics(outRoot), ...opts });
};
const codes = (r, level) => r.problems.filter((p) => !level || p.level === level).map((p) => p.code);
const ios = () => defaultConfig({ platform: 'ios' });

test('정상: 규격 해상도 3장이 소스·config보다 새로우면 ok', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] });
  const r = run(cwd, cfg);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.deepEqual(codes(r, 'error'), []);
  assert.equal(r.rows[0].count, 3);
});

test('프리뷰 덮어쓰기: 02만 439×951이면 preview-size', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, [439, 951], IPHONE] });
  const r = run(cwd, cfg);
  assert.equal(r.ok, false);
  const p = r.problems.filter((x) => x.code === 'preview-size');
  assert.equal(p.length, 1);
  assert.equal(p[0].file, '02.png');
  assert.match(p[0].message, /프리뷰가 원본을 덮었습니다/);
});

test('필수 슬롯: en에 5.5"만 있으면 6.9"/6.5" missing-required', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE], 'en/iphone-8-plus': [[1242, 2208]] });
  const r = run(cwd, cfg);
  const m = r.problems.filter((x) => x.code === 'missing-required');
  assert.equal(m.length, 1);
  assert.equal(m[0].locale, 'en');
  assert.match(m[0].message, /6\.9".*또는.*6\.5"/);
});

test('iPad 조건부: iPad 폴더가 있으면 13" 필수, 없으면 --ipad일 때만', () => {
  const cfg = ios();
  const a = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE], 'ko/ipad-air-11': [[1668, 2388]] });
  assert.ok(codes(run(a.cwd, cfg)).includes('missing-required'));
  const b = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE] });
  assert.ok(!codes(run(b.cwd, cfg)).includes('missing-required'));
  assert.ok(codes(run(b.cwd, cfg, { ipad: true })).includes('missing-required'));
});

test('오래된 파일: 소스가 결과보다 나중이면 현재 config 폴더에만 stale', () => {
  const cfg = ios();
  const { cwd, t0 } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE], 'en/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] });
  fs.utimesSync(path.join(cwd, 'screens/02.png'), t0 + 10, t0 + 10);
  const r = run(cwd, cfg);
  const stale = r.problems.filter((x) => x.code === 'stale');
  assert.equal(stale.length, 1);
  assert.equal(stale[0].file, '02.png');
  assert.equal(stale[0].locale, 'ko');
  assert.ok(codes(r).includes('not-current'));
});

test('남은 파일·번호 빠짐: 05.png는 orphan, 02 없음은 gap 에러', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, null, IPHONE, null, IPHONE] });
  const r = run(cwd, cfg);
  const orphan = r.problems.find((x) => x.code === 'orphan');
  assert.equal(orphan.file, '05.png');
  const gap = r.problems.find((x) => x.code === 'gap');
  assert.equal(gap.level, 'error');
  assert.match(gap.message, /02/);
  assert.equal(r.ok, false);
});

test('Android: 폰 1장은 합계 미달, 3장은 추천 경고만, 9장은 count-max', () => {
  const cfg = defaultConfig({ platform: 'android' });
  cfg.screens = cfg.screens.slice(0, 3);
  const one = project(cfg, { 'ko/pixel-9-pro-xl': [PIXEL] });
  assert.ok(codes(run(one.cwd, cfg), 'error').includes('missing-required'));
  const three = project(cfg, { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL] }, { featureGraphics: { ko: FEATURE } });
  const r3 = run(three.cwd, cfg);
  assert.equal(r3.ok, true, JSON.stringify(r3.problems));
  assert.ok(codes(r3, 'warn').includes('count-recommend'));
  cfg.screens = Array.from({ length: 9 }, (_, i) => ({ ...cfg.screens[0], source: `screens/0${i + 1}.png` }));
  const nine = project(cfg, { 'ko/pixel-9-pro-xl': Array(9).fill(PIXEL) });
  assert.ok(codes(run(nine.cwd, cfg), 'error').includes('count-max'));
});

test('빈 상태: output 폴더가 없거나 _preview만 있으면 no-output', () => {
  const cfg = ios();
  const a = project(cfg, {});
  assert.deepEqual(codes(run(a.cwd, cfg)), ['no-output']);
  const b = project(cfg, { '_preview/ko/iphone-17-pro-max': [[439, 951]] });
  assert.deepEqual(codes(run(b.cwd, cfg)), ['no-output']);
});

test('overview.png와 _preview는 무시하고, 다른 파일은 unknown-entry 경고', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE], '_preview/ko/iphone-17-pro-max': [[439, 951]] },
    { files: { 'store-screenshots/ko/iphone-17-pro-max/overview.png': 'x', 'store-screenshots/ko/iphone-17-pro-max/notes.txt': 'x' } });
  const r = run(cwd, cfg);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  const u = r.problems.filter((x) => x.code === 'unknown-entry');
  assert.equal(u.length, 1);
  assert.equal(u[0].file, 'notes.txt');
});

test('다중 config: devices×locales 조합 중 없는 폴더는 locale-missing', () => {
  const cfg = { ...ios(), devices: ['iphone-17-pro-max', 'ipad-pro-13'], locales: ['ko', 'en'] };
  delete cfg.device; delete cfg.locale;
  const { cwd } = project(cfg, {
    'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE], 'ko/ipad-pro-13': [IPAD, IPAD, IPAD], 'en/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE],
  });
  const r = run(cwd, cfg);
  const lm = r.problems.filter((x) => x.code === 'locale-missing');
  assert.equal(lm.length, 1);
  assert.deepEqual([lm[0].locale, lm[0].device], ['en', 'ipad-pro-13']);
  assert.ok(r.problems.some((x) => x.code === 'missing-required' && x.locale === 'en')); // config가 iPad를 대상으로 하므로 en에도 13" 필수
  assert.ok(!codes(r).includes('not-current'));
});

test('피처 그래픽: Android에서 없으면 missing-feature-graphic 에러, 1024×500이면 ok', () => {
  const cfg = defaultConfig({ platform: 'android' });
  const shots = { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL] };
  const none = run(project(cfg, shots).cwd, cfg);
  assert.equal(none.ok, false);
  const m = none.problems.filter((x) => x.code === 'missing-feature-graphic');
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].level, m[0].locale, m[0].file], ['error', 'ko', 'feature-graphic.png']);
  const row = none.rows.find((r) => r.device === 'feature-graphic');
  assert.deepEqual([row.count, row.errors, row.canvas], [0, 1, '1024×500']);

  const ok = run(project(cfg, shots, { featureGraphics: { ko: FEATURE } }).cwd, cfg);
  assert.equal(ok.ok, true, JSON.stringify(ok.problems));
  assert.equal(ok.rows.find((r) => r.device === 'feature-graphic').count, 1);
});

test('피처 그래픽: 프리뷰 크기는 preview-size, 다른 크기는 size-mismatch', () => {
  const cfg = defaultConfig({ platform: 'android' });
  const shots = { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL] };
  const preview = run(project(cfg, shots, { featureGraphics: { ko: [348, 170] } }).cwd, cfg);
  assert.deepEqual(codes(preview, 'error'), ['preview-size']);
  const wrong = run(project(cfg, shots, { featureGraphics: { ko: [1000, 500] } }).cwd, cfg);
  assert.deepEqual(codes(wrong, 'error'), ['size-mismatch']);
  assert.match(wrong.problems[0].message, /1024×500/);
});

test('피처 그래픽: source가 결과보다 새로우면 stale, 현재 config가 아닌 로케일은 판정하지 않는다', () => {
  const cfg = defaultConfig({ platform: 'android' });
  const shots = { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL], 'en/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL] };
  const { cwd, t0 } = project(cfg, shots, { featureGraphics: { ko: FEATURE, en: FEATURE } });
  fs.utimesSync(path.join(cwd, cfg.featureGraphic.source), t0 + 10, t0 + 10);
  const r = run(cwd, cfg);
  const stale = r.problems.filter((x) => x.code === 'stale');
  assert.equal(stale.length, 2); // ko의 01.png와 feature-graphic.png
  assert.ok(stale.some((x) => x.file === 'feature-graphic.png' && x.locale === 'ko'));
  assert.ok(!r.problems.some((x) => x.locale === 'en' && x.file === 'feature-graphic.png'));
});

test('피처 그래픽: iOS는 판정하지 않는다', () => {
  const cfg = ios();
  const r = run(project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] }).cwd, cfg);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(!r.rows.some((x) => x.device === 'feature-graphic'));
});

test('자리표시자: 표시가 남은 장은 placeholder-render 에러, 표시가 없으면 ok', () => {
  const cfg = ios();
  const shots = { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] };
  const r = run(project(cfg, shots, { markers: { 'ko/iphone-17-pro-max': { '03.png': ['screen'] } } }).cwd, cfg);
  assert.equal(r.ok, false);
  const p = r.problems.filter((x) => x.code === 'placeholder-render');
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].level, p[0].locale, p[0].file], ['error', 'ko', '03.png']);
  assert.match(p[0].message, /자리표시자 화면/);
  assert.equal(r.rows[0].errors, 1);
  assert.ok(!codes(r).includes('unknown-entry')); // 표시 파일 자체는 경고 대상이 아니다

  const cleared = run(project(cfg, shots, { markers: { 'ko/iphone-17-pro-max': {} } }).cwd, cfg);
  assert.equal(cleared.ok, true, JSON.stringify(cleared.problems));
});

test('자리표시자: config 대상이 아닌 폴더도 판정하고, _preview는 무시한다', () => {
  const cfg = ios();
  const shots = { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE], 'en/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE], '_preview/ko/iphone-17-pro-max': [[439, 951]] };
  const r = run(project(cfg, shots, {
    markers: { 'en/iphone-17-pro-max': { '01.png': ['screen'] }, '_preview/ko/iphone-17-pro-max': { '01.png': ['screen'] } },
  }).cwd, cfg);
  const p = r.problems.filter((x) => x.code === 'placeholder-render');
  assert.equal(p.length, 1);
  assert.equal(p[0].locale, 'en');
});

test('자리표시자: 깨진 표시는 폴더 전체를 에러로, PNG가 없는 항목은 무시한다', () => {
  const cfg = ios();
  const shots = { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] };
  const broken = run(project(cfg, shots, { markers: { 'ko/iphone-17-pro-max': '{not json' } }).cwd, cfg);
  assert.deepEqual(broken.problems.filter((x) => x.code === 'placeholder-render').map((x) => x.file), ['01.png', '02.png', '03.png']);
  assert.match(broken.problems.find((x) => x.code === 'placeholder-render').message, /깨져/);

  const ghost = run(project(cfg, shots, { markers: { 'ko/iphone-17-pro-max': { '07.png': ['screen'] } } }).cwd, cfg);
  assert.equal(ghost.ok, true, JSON.stringify(ghost.problems));
});

test('자리표시자: 피처 그래픽의 배경 대체도 에러', () => {
  const cfg = defaultConfig({ platform: 'android' });
  const shots = { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL] };
  const r = run(project(cfg, shots, { featureGraphics: { ko: FEATURE }, markers: { ko: { 'feature-graphic.png': ['background'] } } }).cwd, cfg);
  const p = r.problems.filter((x) => x.code === 'placeholder-render');
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].locale, p[0].file], ['ko', 'feature-graphic.png']);
  assert.match(p[0].message, /배경 이미지/);
  assert.equal(r.rows.find((x) => x.device === 'feature-graphic').errors, 1);
});
