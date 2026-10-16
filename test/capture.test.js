import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveCaptureDir } from '../src/commands/capture.js';
import { parseList } from '../src/commands/init.js';
import { defaultConfig } from '../src/config.js';

const cwd = '/proj';
const multi = defaultConfig({ devices: ['iphone-17-pro-max', 'ipad-pro-13'], locales: ['ko', 'en'] });
const dir = (...p) => path.join(cwd, 'screens', ...p);

test('resolveCaptureDir — 둘 다 없으면 평면 screens/', () => {
  assert.deepEqual(resolveCaptureDir(cwd, multi, {}), { dir: dir(), locale: null, device: null });
  assert.equal(resolveCaptureDir(cwd, null).dir, dir());
});

test('resolveCaptureDir — 둘 다 주면 screens/<locale>/<device>/', () => {
  assert.deepEqual(
    resolveCaptureDir(cwd, multi, { locale: 'ko', device: 'ipad-pro-13' }),
    { dir: dir('ko', 'ipad-pro-13'), locale: 'ko', device: 'ipad-pro-13' },
  );
});

test('resolveCaptureDir — 빠진 축은 config에서 하나로 정해질 때만 채운다', () => {
  const oneDevice = defaultConfig({ devices: ['ipad-pro-13'], locales: ['ko', 'en'] });
  assert.equal(resolveCaptureDir(cwd, oneDevice, { locale: 'en' }).dir, dir('en', 'ipad-pro-13'));
  assert.throws(() => resolveCaptureDir(cwd, oneDevice, { device: 'ipad-pro-13' }), /--locale를 지정하세요 \(ko, en\)/);
  assert.throws(() => resolveCaptureDir(cwd, multi, { locale: 'ko' }), /--device를 지정하세요 \(iphone-17-pro-max, ipad-pro-13\)/);
  // 단일 config도 스칼라 값으로 채운다
  assert.equal(resolveCaptureDir(cwd, defaultConfig({ platform: 'ios' }), { device: 'iphone-17-pro-max' }).dir, dir('ko', 'iphone-17-pro-max'));
});

test('resolveCaptureDir — config 밖의 값은 사용 가능 목록과 함께 거부한다', () => {
  assert.throws(() => resolveCaptureDir(cwd, multi, { locale: 'ja', device: 'ipad-pro-13' }), /'ja'.*사용 가능: ko, en/);
  assert.throws(() => resolveCaptureDir(cwd, multi, { locale: 'ko', device: 'ipad-air-11' }), /사용 가능: iphone-17-pro-max, ipad-pro-13/);
});

test('resolveCaptureDir — 경로 탈출·알 수 없는 기기·값 없는 플래그를 거부한다', () => {
  assert.throws(() => resolveCaptureDir(cwd, null, { locale: '../x', device: 'ipad-pro-13' }), /쓸 수 없는 문자/);
  assert.throws(() => resolveCaptureDir(cwd, null, { locale: 'ko', device: '../../etc' }), /알 수 없는 디바이스/);
  assert.throws(() => resolveCaptureDir(cwd, null, { locale: true, device: 'ipad-pro-13' }), /--locale에 값을 지정하세요/);
  // config에서 채운 값도 경로 조각이므로 같이 검사한다
  const broken = { locales: ['../x'], devices: ['ipad-pro-13'] };
  assert.throws(() => resolveCaptureDir(cwd, broken, { device: 'ipad-pro-13' }), /쓸 수 없는 문자/);
});

test('resolveCaptureDir — config가 없으면 둘 다 필요하다', () => {
  assert.equal(resolveCaptureDir(cwd, null, { locale: 'ko', device: 'pixel-9' }).dir, dir('ko', 'pixel-9'));
  assert.throws(() => resolveCaptureDir(cwd, null, { locale: 'ko' }), /--device도 지정하세요/);
});

test('parseList — 쉼표 목록을 자르고 값 없는 플래그는 빈 배열', () => {
  assert.equal(parseList(undefined), undefined);
  assert.deepEqual(parseList(' ko, en ,,'), ['ko', 'en']);
  assert.deepEqual(parseList(true), []);
});
