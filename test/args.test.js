import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('--allow-crop 은 opts.allowCrop 으로 들어온다', () => {
  const { opts } = parseArgs(['render', '--allow-crop', '--preview']);
  assert.equal(opts.allowCrop, true);
  assert.equal(opts['allow-crop'], undefined);
  assert.equal(opts.preview, true);
});
