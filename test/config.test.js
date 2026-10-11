import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, validateConfig, normalizeFontFiles } from '../src/config.js';

const withFont = (fontFile) => {
  const cfg = defaultConfig({ platform: 'ios' });
  cfg.theme.fontFile = fontFile;
  return validateConfig(cfg);
};

test('기본 config는 플랫폼마다 에러가 없다', () => {
  for (const platform of ['ios', 'macos', 'android']) {
    assert.deepEqual(validateConfig(defaultConfig({ platform })), [], platform);
  }
});

test('fontFile 문자열 — 지원 확장자면 통과하고 weight 없는 항목 1개로 정규화된다', () => {
  assert.deepEqual(withFont('fonts/Brand.otf'), []);
  assert.deepEqual(normalizeFontFiles('fonts/Brand.otf'), [{ path: 'fonts/Brand.otf', weight: null }]);
  assert.deepEqual(normalizeFontFiles(undefined), []);
});

test('fontFile 배열 — path/weight가 올바르면 통과한다', () => {
  assert.deepEqual(withFont([{ path: 'a.ttf', weight: 500 }, { path: 'b.woff2', weight: 800 }]), []);
});

test('fontFile 확장자가 지원되지 않으면 사용 가능 목록과 함께 거부한다', () => {
  const errors = withFont('fonts/brand.ttc');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /확장자가 지원되지 않습니다: 'fonts\/brand\.ttc'/);
  assert.match(errors[0], /\.ttf, \.otf, \.woff, \.woff2/);
});

test('fontFile이 빈 배열·빈 문자열이면 거부한다', () => {
  assert.match(withFont([])[0], /빈 배열/);
  assert.match(withFont('')[0], /비어 있습니다/);
});

test('fontFile 배열 원소의 weight 누락·범위 밖·중복을 각각 잡는다', () => {
  assert.match(withFont([{ path: 'a.ttf' }])[0], /weight는 1~1000 사이 정수/);
  assert.match(withFont([{ path: 'a.ttf', weight: 1001 }])[0], /weight는 1~1000 사이 정수/);
  const dup = withFont([{ path: 'a.ttf', weight: 700 }, { path: 'b.ttf', weight: 700 }]);
  assert.equal(dup.length, 1);
  assert.match(dup[0], /weight 700이 중복/);
});

test('fontFile이 문자열도 배열도 아니면 거부한다', () => {
  assert.match(withFont(42)[0], /문자열\(경로\) 또는 \{ path, weight \} 배열/);
});

// ── 다중 config (devices / locales / 카피 맵) ──────────────────────────────

const multi = (patch = {}) => {
  const base = defaultConfig({ platform: 'ios' });
  const cfg = {
    ...base,
    devices: ['iphone-17-pro-max', 'ipad-pro-13'],
    locales: ['ko', 'en'],
    screens: [{ source: 'screens/{locale}/01.png', layout: 'caption-top', headline: { ko: '가', en: 'a' }, subhead: { ko: '나', en: 'b' } }],
    ...patch,
  };
  delete cfg.device;
  delete cfg.locale;
  Object.assign(cfg, patch);
  return cfg;
};

test('devices/locales 배열과 카피 맵이 있는 다중 config는 통과한다', () => {
  assert.deepEqual(validateConfig(multi()), []);
});

test('devices에 다른 플랫폼 기기나 알 수 없는 id가 섞이면 거부한다', () => {
  assert.match(validateConfig(multi({ devices: ['iphone-17-pro-max', 'pixel-9'] }))[0], /'pixel-9'는 android 기기인데 platform은 'ios'/);
  assert.match(validateConfig(multi({ devices: ['nope'] }))[0], /devices에 알 수 없는 기기/);
});

test('배열 형태 오류 — 중복·빈 배열·배열 아님', () => {
  assert.match(validateConfig(multi({ locales: ['ko', 'ko'] }))[0], /locales에 중복 값/);
  assert.match(validateConfig(multi({ devices: [] }))[0], /devices가 빈 배열/);
  assert.match(validateConfig(multi({ devices: 'x' }))[0], /devices는 문자열 배열/);
});

test('headline/subhead는 문자열 또는 값이 전부 문자열인 맵이어야 한다', () => {
  const bad = (headline) => validateConfig(multi({ screens: [{ source: 'a.png', layout: 'caption-top', headline }] }));
  assert.match(bad(42)[0], /headline은 문자열이거나 로케일별 맵/);
  assert.match(bad({ ko: '가', en: 7 })[0], /headline은 문자열이거나 로케일별 맵/);
  assert.match(bad({})[0], /headline은 문자열이거나 로케일별 맵/);
  const sub = validateConfig(multi({ screens: [{ source: 'a.png', layout: 'caption-top', headline: '가', subhead: ['x'] }] }));
  assert.match(sub[0], /subhead는 문자열이거나 로케일별 맵/);
});

test('스칼라 device/locale이 배열에 없으면 거부한다', () => {
  assert.match(validateConfig(multi({ device: 'ipad-air-11' }))[0], /device 'ipad-air-11'가 devices 배열에 없습니다/);
  assert.match(validateConfig(multi({ locale: 'ja' }))[0], /locale 'ja'이 locales 배열에 없습니다/);
});

test('featureGraphic — android 기본값에 들어 있고, 문자열·맵 카피와 source 생략을 받는다', () => {
  const cfg = defaultConfig({ platform: 'android' });
  assert.equal(typeof cfg.featureGraphic.headline, 'string');
  assert.equal(defaultConfig({ platform: 'ios' }).featureGraphic, undefined);
  cfg.featureGraphic = { headline: { ko: '가', en: 'A' } };
  assert.deepEqual(validateConfig(cfg), []);
});

test('featureGraphic — android가 아니면 거부한다', () => {
  const cfg = defaultConfig({ platform: 'ios' });
  cfg.featureGraphic = { headline: '가' };
  const errors = validateConfig(cfg);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /featureGraphic은 platform android에서만/);
});

test('featureGraphic — 객체 아님·headline 누락·subhead 형식·빈 source를 각각 잡는다', () => {
  const withFG = (fg) => validateConfig({ ...defaultConfig({ platform: 'android' }), featureGraphic: fg });
  assert.match(withFG('x')[0], /featureGraphic은 객체/);
  assert.match(withFG({})[0], /featureGraphic\.headline/);
  assert.match(withFG({ headline: '가', subhead: 3 })[0], /featureGraphic\.subhead/);
  assert.match(withFG({ headline: '가', source: '' })[0], /featureGraphic\.source/);
  assert.match(withFG({ headline: '가', source: 1 })[0], /featureGraphic\.source/);
});
