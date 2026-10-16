import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultConfig, validateConfig, normalizeFontFiles, resolveTargets, scaffold, copyMap } from '../src/config.js';
import { expandConfig } from '../src/expand.js';

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

const IOS_MULTI = { devices: ['iphone-17-pro-max', 'ipad-pro-13'], locales: ['ko', 'en'] };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'appshot-init-'));

test('다중 defaultConfig — 플랫폼마다 검증을 통과하고 스칼라 device/locale이 없다', () => {
  const cases = [
    IOS_MULTI,
    { devices: ['mac-16-10'], locales: ['ko', 'en'] },
    { devices: ['pixel-9-pro-xl', 'galaxy-tab-s10'], locales: ['ko', 'en', 'ja'] },
  ];
  for (const opts of cases) {
    const cfg = defaultConfig(opts);
    assert.deepEqual(validateConfig(cfg), [], opts.devices.join());
    assert.deepEqual(cfg.devices, opts.devices);
    assert.deepEqual(cfg.locales, opts.locales);
    assert.equal(cfg.device, undefined);
    assert.equal(cfg.locale, undefined);
    for (const s of cfg.screens) assert.match(s.source, /^screens\/\{locale\}\/\{device\}\/\d{2}\.png$/);
  }
});

test('다중 defaultConfig — 카피는 로케일 맵, ko/en 외 로케일은 en 문구로 채운다', () => {
  const cfg = defaultConfig({ devices: ['pixel-9'], locales: ['ko', 'en', 'ja'] });
  assert.deepEqual(cfg.screens[0].headline, { ko: '3초 만에 기록', en: 'Log in 3 seconds', ja: 'Log in 3 seconds' });
  for (const s of cfg.screens) {
    for (const v of [s.headline, s.subhead]) {
      assert.deepEqual(Object.keys(v), ['ko', 'en', 'ja']);
      assert.ok(Object.values(v).every((x) => typeof x === 'string' && x));
    }
  }
  assert.equal(cfg.featureGraphic.source, 'screens/{locale}/{device}/01.png');
  assert.equal(cfg.featureGraphic.headline.en, 'Log briefly, organize automatically');
  assert.deepEqual(copyMap('가', 'A', ['en', 'ko']), { en: 'A', ko: '가' });
});

test('단일 defaultConfig는 다중 플래그가 없으면 그대로다 (스칼라 device/locale, 평면 screens/)', () => {
  const cfg = defaultConfig({ platform: 'ios' });
  assert.deepEqual(Object.keys(cfg).slice(0, 3), ['platform', 'device', 'locale']);
  assert.equal(cfg.locale, 'ko');
  assert.equal(cfg.screens[0].source, 'screens/01.png');
  assert.equal(cfg.screens[0].headline, '3초 만에 기록');
  assert.equal(resolveTargets({ platform: 'ios' }), null);
});

test('resolveTargets — 한쪽만 주면 다른 쪽은 1개짜리 배열', () => {
  assert.deepEqual(resolveTargets({ locales: ['ko', 'en'] }), { platform: 'ios', devices: ['iphone-17-pro-max'], locales: ['ko', 'en'] });
  assert.deepEqual(resolveTargets({ platform: 'android', locales: ['en'] }).devices, ['pixel-9-pro-xl']);
  assert.deepEqual(resolveTargets({ device: 'ipad-pro-13', locales: ['ko'] }).devices, ['ipad-pro-13']);
  assert.deepEqual(resolveTargets({ devices: ['pixel-9'] }), { platform: 'android', devices: ['pixel-9'], locales: ['ko'] });
});

test('resolveTargets — 플래그 충돌·플랫폼 혼합·알 수 없는 기기·잘못된 로케일을 거부한다', () => {
  assert.throws(() => resolveTargets({ device: 'pixel-9', devices: ['pixel-9'] }), /둘 중 하나만/);
  assert.throws(() => resolveTargets({ devices: ['iphone-17-pro-max', 'pixel-9'] }), /config를 나누세요/);
  assert.throws(() => resolveTargets({ platform: 'android', devices: ['ipad-pro-13'] }), /--platform android/);
  assert.throws(() => resolveTargets({ devices: ['nope'] }), /알 수 없는 디바이스/);
  assert.throws(() => resolveTargets({ devices: [] }), /쉼표로 구분한 목록/);
  assert.throws(() => resolveTargets({ locales: ['ko', 'ko'] }), /중복/);
  assert.throws(() => resolveTargets({ locales: ['../x'] }), /쓸 수 없는 문자/);
  assert.throws(() => resolveTargets({ locales: ['ko/en'] }), /쓸 수 없는 문자/);
  assert.doesNotThrow(() => resolveTargets({ locales: ['zh-Hant', 'pt_BR'] }));
});

test('scaffold 다중 모드 — 조합마다 폴더를 만들고, 펼친 source 경로의 폴더가 실제로 있다', () => {
  const cwd = tmp();
  const r = scaffold(cwd, IOS_MULTI);
  assert.equal(r.ok, true);
  assert.equal(r.combos.length, 4);
  assert.deepEqual(r.untranslated, []);
  for (const combo of r.combos) {
    const { config, warnings } = expandConfig(r.config, combo);
    assert.deepEqual(warnings, []);
    for (const s of config.screens) assert.ok(fs.statSync(path.dirname(path.join(cwd, s.source))).isDirectory(), s.source);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(r.file, 'utf8')), r.config);
  assert.equal(scaffold(cwd, IOS_MULTI).reason, 'exists');
  assert.equal(scaffold(cwd, { ...IOS_MULTI, force: true }).ok, true);
});

test('scaffold 단일 모드 — 반환값과 폴더가 이전과 같다', () => {
  const cwd = tmp();
  const r = scaffold(cwd, { platform: 'ios' });
  assert.deepEqual(Object.keys(r), ['ok', 'file', 'screensDir', 'config', 'device']);
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'screens')), []);
});
