import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHTML, buildFeatureGraphicHTML, BRAND_FONT_FAMILY } from '../src/html.js';
import { defaultConfig } from '../src/config.js';
import { getDevice } from '../src/devices.js';

const build = (fonts) => {
  const cfg = defaultConfig({ platform: 'ios' });
  const args = { cfg, screen: cfg.screens[0], device: getDevice(cfg.device), images: { main: 'data:image/png;base64,AA' } };
  return fonts ? buildHTML({ ...args, fonts }) : buildHTML(args);
};

test('fonts 없이 호출하면 @font-face가 없고 폰트 스택은 시스템 스택 그대로다', () => {
  const html = build();
  assert.doesNotMatch(html, /@font-face/);
  assert.match(html, /--font-stack: -apple-system/);
  assert.doesNotMatch(html, new RegExp(BRAND_FONT_FAMILY));
});

test('fonts 2개를 넘기면 weight별 @font-face가 들어가고 브랜드 패밀리가 스택 맨 앞에 붙는다', () => {
  const html = build([
    { uri: 'data:font/ttf;base64,AA', format: 'truetype', weight: 500 },
    { uri: 'data:font/otf;base64,BB', format: 'opentype', weight: 800 },
  ]);
  assert.equal(html.match(/@font-face/g).length, 2);
  assert.match(html, /font-weight: 500;/);
  assert.match(html, /font-weight: 800;/);
  assert.match(html, /src: url\("data:font\/otf;base64,BB"\) format\('opentype'\)/);
  assert.match(html, /--font-stack: 'appshot-brand', -apple-system/);
});

test('weight 없는 단일 파일은 1~1000 전 구간에 매칭된다', () => {
  const html = build([{ uri: 'data:font/woff2;base64,AA', format: 'woff2', weight: null }]);
  assert.match(html, /font-weight: 1 1000;/);
});

const buildFG = ({ main = 'data:image/png;base64,AA', fonts } = {}) => {
  const cfg = defaultConfig({ platform: 'android' });
  return buildFeatureGraphicHTML({
    cfg, device: getDevice(cfg.device), canvas: { w: 1024, h: 500 }, images: { main }, fonts,
  });
};

test('피처 그래픽: 1024×500 캔버스에 테마 변수·카피·기기가 들어간다', () => {
  const html = buildFG();
  assert.match(html, /--canvas-w: 1024px;/);
  assert.match(html, /--canvas-h: 500px;/);
  assert.match(html, /--unit: 5px;/);
  assert.match(html, /--headline-color: #FFFFFF;/);
  assert.match(html, /linear-gradient\(160deg, #4F46E5, #0E7490\)/);
  assert.match(html, /기록은 짧게, 정리는 자동으로/);
  assert.match(html, /class="device device--plain"/); // android 기본은 프레임 없는 카드
  assert.match(html, /<div class="device-area">/);
  assert.doesNotMatch(html, /class="stage stage--feature is-copy-only"/);
});

test('피처 그래픽: source가 없으면 기기 마크업 없이 카피만, 브랜드 폰트도 같은 방식으로 붙는다', () => {
  const html = buildFG({ main: null, fonts: [{ uri: 'data:font/ttf;base64,AA', format: 'truetype', weight: null }] });
  assert.doesNotMatch(html, /class="device/);
  assert.doesNotMatch(html, /<div class="device-area">/);
  assert.match(html, /class="stage stage--feature is-copy-only"/);
  assert.match(html, /--font-stack: 'appshot-brand', -apple-system/);
});
