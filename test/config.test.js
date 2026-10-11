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
