import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLACEHOLDER_MARKER, markFile, readMarker } from '../src/placeholder-marker.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'appshot-marker-'));

test('markFile: 기록 → 읽기 → 제거, 마지막 항목이 빠지면 표시 파일을 지운다', () => {
  const dir = tmp();
  assert.deepEqual(readMarker(dir), {});
  markFile(dir, '03.png', ['screen']);
  markFile(dir, '05.png', ['screen', 'font']);
  assert.deepEqual(readMarker(dir), { '03.png': ['screen'], '05.png': ['screen', 'font'] });
  markFile(dir, '03.png', []);
  assert.deepEqual(readMarker(dir), { '05.png': ['screen', 'font'] });
  markFile(dir, '05.png', null);
  assert.equal(fs.existsSync(path.join(dir, PLACEHOLDER_MARKER)), false);
  markFile(dir, '01.png', null); // 표시가 없을 때 지워도 아무 일 없다
  assert.equal(fs.existsSync(path.join(dir, PLACEHOLDER_MARKER)), false);
});

test('깨진 표시: 읽으면 전부 가짜, 다음 기록은 폴더의 다른 결과물을 corrupt로 남긴다', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, PLACEHOLDER_MARKER), '{oops');
  assert.deepEqual(readMarker(dir), { '*': ['corrupt'] });
  for (const n of ['01.png', '02.png', 'overview.png']) fs.writeFileSync(path.join(dir, n), 'x');
  markFile(dir, '01.png', null);
  assert.deepEqual(readMarker(dir), { '02.png': ['corrupt'] });
});
