import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('--allow-crop 은 opts.allowCrop 으로 들어온다', () => {
  const { opts } = parseArgs(['render', '--allow-crop', '--preview']);
  assert.equal(opts.allowCrop, true);
  assert.equal(opts['allow-crop'], undefined);
  assert.equal(opts.preview, true);
});

test('--all 은 값을 먹지 않는 boolean 플래그다', () => {
  const { opts, positional } = parseArgs(['render', '--all', 'extra', '--preview']);
  assert.equal(opts.all, true);
  assert.deepEqual(positional, ['extra']);
  assert.equal(opts.preview, true);
});

test('--ipad 는 boolean 플래그다', () => {
  assert.equal(parseArgs(['status', '--ipad']).opts.ipad, true);
});

test('--watch 는 값을 먹지 않는 boolean 플래그다', () => {
  const { opts, positional } = parseArgs(['render', '--watch', '1', '--only', '1,3']);
  assert.equal(opts.watch, true);
  assert.deepEqual(positional, ['1']);
  assert.deepEqual(opts.only, [1, 3]);
});
