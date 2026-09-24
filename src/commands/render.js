import path from 'node:path';
import { loadConfig } from '../config.js';
import { renderAll } from '../render.js';
import { canvasLabel } from '../devices.js';
import { printWarnings } from '../quality.js';

export async function run({ opts }) {
  const cwd = process.cwd();
  const cfg = loadConfig(cwd);
  console.log('');

  const only = Array.isArray(opts.only) ? opts.only : null;
  const preview = Boolean(opts.preview);

  const { results, outDir, canvas, device } = await renderAll(cfg, {
    preview,
    only,
    placeholder: Boolean(opts.placeholder),
    allowCrop: Boolean(opts['allow-crop']),
    cwd,
    onWarnings: printWarnings,
    onProgress: (r) => {
      const name = path.basename(r.file);
      console.log(`  ${name}  ${r.layout.padEnd(15)} ${kb(r.bytes)}`);
    },
  });

  const spec = `${canvas.w}×${canvas.h}`;
  console.log('');
  console.log(`  ${results.length}장 생성 — ${path.relative(cwd, outDir) || outDir}`);

  if (preview) {
    console.log(`  프리뷰 해상도 ${spec} (제출 규격은 ${canvasLabel(device)})`);
    console.log("  확인이 끝나면 'appshot render'로 제출용 원본을 뽑으세요.\n");
  } else {
    console.log(`  제출 규격 ${spec} — ${device.storeSlot}\n`);
  }

  return 0;
}

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
