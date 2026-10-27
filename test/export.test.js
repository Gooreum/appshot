import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanOutput, scanFeatureGraphics, evaluate } from '../src/status.js';
import { planExport, storeLocale } from '../src/export.js';
import { defaultConfig } from '../src/config.js';
import { project, IPHONE, PIXEL, FEATURE } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/appshot.mjs', import.meta.url));
const exportCmd = (cwd, ...args) => spawnSync(process.execPath, [BIN, 'export', ...args], { cwd, encoding: 'utf8' });

/** cwd 기준 상대 경로 목록(정렬) — 폴더가 없으면 [] */
function tree(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath ?? e.path, e.name)))
    .sort();
}

const plan = (cwd, cfg, opts = {}) => {
  const outRoot = path.resolve(cwd, cfg.output);
  const scan = scanOutput(outRoot);
  const featureGraphics = scanFeatureGraphics(outRoot);
  const result = evaluate(scan, cfg, { cwd, featureGraphics });
  return planExport({ scan, featureGraphics, result, platform: cfg.platform, outRoot, cwd, ...opts });
};
const ios = () => defaultConfig({ platform: 'ios' });
const android = () => defaultConfig({ platform: 'android' }); // screens 4장

test('iOS 통과 폴더: _upload에 NN.png만 복사되고 overview.png·_preview는 빠진다', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] }, {
    files: {
      'store-screenshots/ko/iphone-17-pro-max/overview.png': 'x',
      'store-screenshots/_preview/ko/iphone-17-pro-max/01.png': 'x',
    },
  });
  const r = exportCmd(cwd);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(tree(path.join(cwd, 'store-screenshots/_upload')), [
    'ko/iphone-17-pro-max/01.png', 'ko/iphone-17-pro-max/02.png', 'ko/iphone-17-pro-max/03.png',
  ]);
  assert.match(r.stdout, /업로드 폴더 준비 완료: store-screenshots\/_upload \(3장/);
});

test('status 에러가 있으면 종료 코드 1, _upload를 만들지 않는다', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, [1000, 2000], IPHONE] });
  const r = exportCmd(cwd);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /내보내기 중단 — 에러 1건/);
  assert.equal(fs.existsSync(path.join(cwd, 'store-screenshots/_upload')), false);
});

test('출력 폴더가 없으면 종료 코드 1, 파일을 만들지 않는다', () => {
  const cfg = ios();
  const { cwd } = project(cfg, {});
  const r = exportCmd(cwd, '--json');
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.deepEqual(out.copied, []);
  assert.ok(out.problems.some((p) => p.code === 'no-output'));
  assert.equal(fs.existsSync(path.join(cwd, 'store-screenshots')), false);
});

test('경고 항목(알 수 없는 기기 폴더·NN 아닌 파일)은 빼고 복사한다', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE], 'ko/pixel-9': [PIXEL] }, {
    files: { 'store-screenshots/ko/iphone-17-pro-max/notes.txt': 'x' },
  });
  const r = exportCmd(cwd);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /! \[ko\/pixel-9\]/);
  assert.deepEqual(tree(path.join(cwd, 'store-screenshots/_upload')), [
    'ko/iphone-17-pro-max/01.png', 'ko/iphone-17-pro-max/02.png', 'ko/iphone-17-pro-max/03.png',
  ]);
});

test('_upload는 status 스캔에서 빠지고, 재실행하면 지난번에 남은 장이 사라진다', () => {
  const cfg = ios();
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] }, {
    files: { 'store-screenshots/_upload/ko/iphone-17-pro-max/04.png': 'old' },
  });
  const outRoot = path.join(cwd, 'store-screenshots');
  const before = evaluate(scanOutput(outRoot), cfg, { cwd, featureGraphics: scanFeatureGraphics(outRoot) });
  assert.equal(exportCmd(cwd).status, 0);
  const after = evaluate(scanOutput(outRoot), cfg, { cwd, featureGraphics: scanFeatureGraphics(outRoot) });
  assert.deepEqual(after, before);
  assert.equal(after.ok, true, JSON.stringify(after.problems));
  assert.equal(fs.existsSync(path.join(outRoot, '_upload/ko/iphone-17-pro-max/04.png')), false);
});

test('--fastlane iOS: screenshots/{ascLocale}/{device}-NN.png, ko는 ko·en은 en-US', () => {
  const cfg = { ...ios(), locale: undefined, locales: ['ko', 'en'] };
  const { cwd } = project(cfg, { 'ko/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE], 'en/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] });
  const r = exportCmd(cwd, '--fastlane');
  assert.equal(r.status, 0, r.stdout);
  const files = tree(path.join(cwd, 'fastlane/screenshots'));
  assert.ok(files.includes('en-US/iphone-17-pro-max-01.png'), files.join('\n'));
  assert.ok(files.includes('ko/iphone-17-pro-max-03.png'));
  assert.equal(files.length, 6);
});

test('--fastlane Android: phoneScreenshots/NN.png와 images/featureGraphic.png', () => {
  const cfg = android();
  const { cwd } = project(cfg, { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL] }, { featureGraphics: { ko: FEATURE } });
  const r = exportCmd(cwd, '--fastlane');
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(tree(path.join(cwd, 'fastlane/metadata/android')), [
    'ko-KR/images/featureGraphic.png',
    'ko-KR/images/phoneScreenshots/01.png', 'ko-KR/images/phoneScreenshots/02.png', 'ko-KR/images/phoneScreenshots/03.png', 'ko-KR/images/phoneScreenshots/04.png',
  ]);
});

test('기본 모드 Android: 피처 그래픽은 _upload/{locale}/feature-graphic.png', () => {
  const cfg = android();
  const { cwd } = project(cfg, { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL] }, { featureGraphics: { ko: FEATURE } });
  const p = plan(cwd, cfg);
  assert.ok(p.copies.some((c) => c.to === path.join(cwd, 'store-screenshots/_upload/ko/feature-graphic.png')));
});

test('--fastlane Android: 폰 폴더가 둘이면 slot-duplicate 에러로 중단한다', () => {
  const cfg = android();
  const { cwd } = project(cfg, { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL], 'ko/pixel-9': [PIXEL, PIXEL] }, { featureGraphics: { ko: FEATURE } });
  const p = plan(cwd, cfg, { fastlane: true });
  assert.ok(p.problems.some((x) => x.level === 'error' && x.code === 'slot-duplicate'));
  const r = exportCmd(cwd, '--fastlane');
  assert.equal(r.status, 1);
  assert.equal(fs.existsSync(path.join(cwd, 'fastlane')), false);
  // 기본 모드는 기기별 폴더라 충돌하지 않는다
  assert.equal(exportCmd(cwd).status, 0);
});

test('--fastlane: 기존 이미지가 있으면 --force 없이 중단, --force면 이미지만 교체하고 title.txt는 남긴다', () => {
  const cfg = android();
  const { cwd } = project(cfg, { 'ko/pixel-9-pro-xl': [PIXEL, PIXEL, PIXEL, PIXEL] }, {
    featureGraphics: { ko: FEATURE },
    files: {
      'fastlane/metadata/android/ko-KR/title.txt': '앱 이름',
      'fastlane/metadata/android/ko-KR/images/phoneScreenshots/09.png': 'old',
    },
  });
  const blocked = exportCmd(cwd, '--fastlane');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /--force/);
  assert.equal(fs.existsSync(path.join(cwd, 'fastlane/metadata/android/ko-KR/images/phoneScreenshots/01.png')), false);

  const forced = exportCmd(cwd, '--fastlane', '--force');
  assert.equal(forced.status, 0, forced.stdout);
  assert.deepEqual(tree(path.join(cwd, 'fastlane/metadata/android/ko-KR')), [
    'images/featureGraphic.png',
    'images/phoneScreenshots/01.png', 'images/phoneScreenshots/02.png', 'images/phoneScreenshots/03.png', 'images/phoneScreenshots/04.png',
    'title.txt',
  ]);
});

test('표에 없는 로케일은 그대로 쓰고 locale-unmapped 경고', () => {
  assert.deepEqual(storeLocale('de', 'asc'), { code: 'de', mapped: false });
  assert.deepEqual(storeLocale('pt-BR', 'play'), { code: 'pt-BR', mapped: true });
  assert.deepEqual(storeLocale('zh', 'play'), { code: 'zh-CN', mapped: true });
  const cfg = { ...ios(), locale: 'de' };
  const { cwd } = project(cfg, { 'de/iphone-17-pro-max': [IPHONE, IPHONE, IPHONE] });
  const p = plan(cwd, cfg, { fastlane: true });
  assert.ok(p.problems.some((x) => x.code === 'locale-unmapped' && x.level === 'warn'));
  assert.ok(p.copies.every((c) => c.to.includes(path.join('fastlane/screenshots/de'))));
});
