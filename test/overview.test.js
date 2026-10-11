import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverviewHTML, overviewSize, OVERVIEW_FILE } from '../src/overview.js';

const canvas = { w: 1290, h: 2796 };
const slots = [
  { no: 1, layout: 'caption-top', uri: 'data:image/png;base64,AA' },
  { no: 2, layout: 'angled', uri: null },
  { no: 3, layout: 'duo', uri: 'data:image/png;base64,BB' },
];

test('두 줄 × 슬롯 수만큼 칸이 생기고 빈 슬롯은 "렌더 안 됨"으로 표시된다', () => {
  const html = buildOverviewHTML({ slots, canvas });
  assert.equal(html.match(/<figure>/g).length, 6);
  assert.equal(html.match(/렌더 안 됨/g).length, 2);
  for (const label of ['01 · caption-top', '02 · angled', '03 · duo']) {
    assert.equal(html.match(new RegExp(`<figcaption>${label}</figcaption>`, 'g')).length, 1, label);
  }
});

test('칸 폭은 높이 기준으로 캔버스 비율에서 계산한다', () => {
  const html = buildOverviewHTML({ slots, canvas });
  assert.match(html, /width:295px;height:640px/);
  assert.match(html, /width:138px;height:300px/);
});

test('시트 크기 — 세로 기기', () => {
  assert.deepEqual(overviewSize(3, canvas), { w: 3 * 295 + 2 * 24 + 64, h: 32 + 640 + 36 + 48 + 300 + 32 });
});

test('시트 크기 — 가로 기기(Mac)도 높이 기준', () => {
  assert.equal(overviewSize(2, { w: 2880, h: 1800 }).w, 2 * 1024 + 24 + 64);
});

test('레이아웃 라벨은 HTML 이스케이프된다', () => {
  const html = buildOverviewHTML({ slots: [{ no: 1, layout: '<b>', uri: null }], canvas });
  assert.match(html, /01 · &lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
});

test('파일명은 숫자로 시작하지 않아 NN.png 슬롯과 겹치지 않는다', () => {
  assert.doesNotMatch(OVERVIEW_FILE, /^\d/);
});
