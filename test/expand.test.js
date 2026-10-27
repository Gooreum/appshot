import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listCombos, defaultCombo, expandConfig } from '../src/expand.js';
import { defaultConfig, validateConfig } from '../src/config.js';

const multi = () => ({
  ...defaultConfig({ platform: 'ios' }),
  device: undefined,
  locale: undefined,
  devices: ['iphone-17-pro-max', 'ipad-pro-13'],
  locales: ['ko', 'en'],
  theme: { ...defaultConfig({ platform: 'ios' }).theme, background: { type: 'image', source: 'bg/{locale}.png' } },
  screens: [
    { source: 'screens/{locale}/{device}/01.png', layout: 'caption-top', headline: { ko: '3초 만에 기록', en: 'Log in 3 seconds' }, subhead: { ko: '복잡한 설정 없이', en: 'No setup needed' } },
    { source: 'screens/{locale}/{device}/02.png', source2: 'screens/{locale}/{device}/03.png', layout: 'duo', headline: { ko: '한눈에' } },
  ],
});

test('단일 config는 조합 1개이고 펼쳐도 입력과 같다', () => {
  const cfg = defaultConfig({ platform: 'ios' });
  assert.deepEqual(listCombos(cfg), [{ locale: 'ko', device: 'iphone-17-pro-max' }]);
  const { config, warnings } = expandConfig(cfg, defaultCombo(cfg));
  assert.deepEqual(config, cfg);
  assert.deepEqual(warnings, []);
});

test('2×2 config는 locales × devices 순서로 조합 4개를 만든다', () => {
  const cfg = multi();
  assert.deepEqual(listCombos(cfg), [
    { locale: 'ko', device: 'iphone-17-pro-max' }, { locale: 'ko', device: 'ipad-pro-13' },
    { locale: 'en', device: 'iphone-17-pro-max' }, { locale: 'en', device: 'ipad-pro-13' },
  ]);
  assert.deepEqual(defaultCombo(cfg), { locale: 'ko', device: 'iphone-17-pro-max' });
});

test('카피 맵은 조합 로케일의 문자열로 확정되고 배열 필드는 사라진다', () => {
  const { config } = expandConfig(multi(), { locale: 'en', device: 'ipad-pro-13' });
  assert.equal(config.screens[0].headline, 'Log in 3 seconds');
  assert.equal(config.screens[0].subhead, 'No setup needed');
  assert.equal(config.locale, 'en');
  assert.equal(config.device, 'ipad-pro-13');
  assert.equal('devices' in config, false);
  assert.equal('locales' in config, false);
  assert.deepEqual(validateConfig(config), []);
});

test('번역이 없으면 기본 로케일 문구로 대체하고 copy-missing 경고를 남긴다', () => {
  const { config, warnings } = expandConfig(multi(), { locale: 'en', device: 'ipad-pro-13' });
  assert.equal(config.screens[1].headline, '한눈에');
  const missing = warnings.filter((w) => w.code === 'copy-missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].screen, 2);
  assert.match(missing[0].message, /headline에 'en' 번역이 없어 'ko' 문구로/);
  assert.deepEqual([missing[0].field, missing[0].fallback], ['headline', 'ko']);
});

test('locales에 없는 키는 copy-unknown-locale 경고', () => {
  const cfg = multi();
  cfg.screens[0].headline = { ko: 'a', 'en-US': 'b' };
  const { warnings } = expandConfig(cfg, { locale: 'ko', device: 'ipad-pro-13' });
  assert.ok(warnings.some((w) => w.code === 'copy-unknown-locale' && /en-US/.test(w.message)));
});

test('{locale}·{device} 토큰을 source / source2 / background.source에서 치환한다', () => {
  const { config } = expandConfig(multi(), { locale: 'en', device: 'ipad-pro-13' });
  assert.equal(config.screens[0].source, 'screens/en/ipad-pro-13/01.png');
  assert.equal(config.screens[1].source2, 'screens/en/ipad-pro-13/03.png');
  assert.equal(config.theme.background.source, 'bg/en.png');
});

test('원본 config는 바뀌지 않는다', () => {
  const cfg = multi();
  const snapshot = JSON.stringify(cfg);
  expandConfig(cfg, { locale: 'en', device: 'ipad-pro-13' });
  assert.equal(JSON.stringify(cfg), snapshot);
});

test('스칼라 device/locale이 배열과 함께 있으면 defaultCombo는 스칼라를 고른다', () => {
  const cfg = { ...multi(), device: 'ipad-pro-13', locale: 'en' };
  assert.deepEqual(defaultCombo(cfg), { locale: 'en', device: 'ipad-pro-13' });
});

test('featureGraphic 카피는 로케일로 확정하고 source의 {locale}을 치환한다, 번역 누락은 전체 경고', () => {
  const cfg = {
    ...defaultConfig({ platform: 'android' }),
    locale: undefined,
    locales: ['ko', 'en'],
    featureGraphic: { headline: { ko: '가볍게', en: 'Light' }, subhead: { ko: '자동 정리' }, source: 'screens/{locale}/01.png' },
  };
  assert.deepEqual(validateConfig(cfg), []);
  const { config, warnings } = expandConfig(cfg, { locale: 'en', device: cfg.device });
  assert.deepEqual(config.featureGraphic, { headline: 'Light', subhead: '자동 정리', source: 'screens/en/01.png' });
  const w = warnings.filter((x) => x.code === 'copy-missing');
  assert.equal(w.length, 1);
  assert.equal(w[0].screen, null);
  assert.match(w[0].message, /featureGraphic\.subhead/);
});
