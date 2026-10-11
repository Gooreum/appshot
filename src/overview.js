import fs from 'node:fs';
import path from 'node:path';
import { validateImage } from './quality.js';
import { escapeHTML } from './html.js';

/*
 * 개요 시트 — 세트 전체를 한 장에 모은 PNG.
 *
 * 스토어에서는 장을 옆으로 넘겨 보고, 목록에서는 작은 썸네일로 본다. 사용자는 세트의 단조로움,
 * 카피 길이의 균형, 썸네일에서 헤드라인이 읽히는지를 장 하나씩 열지 않고 여기서 판단한다.
 * 파일명은 숫자로 시작하지 않아 제출 슬롯(NN.png)과 섞이지 않는다. 제출 대상이 아니다.
 */

export const OVERVIEW_FILE = 'overview.png';
const ROW_HEIGHT = 640;   // 넘겨보기 줄
const THUMB_HEIGHT = 300; // 스토어 목록 썸네일 크기
const GAP = 24;
const PAD = 32;
const LABEL_H = 36;

const cellW = (h, canvas) => Math.round((h * canvas.w) / canvas.h);
const pad2 = (n) => String(n).padStart(2, '0');

/** 시트 크기. 두 줄 중 넓은 쪽이 폭이 된다 — 가로 기기(Mac)도 높이 기준으로 맞춘다. */
export function overviewSize(count, canvas) {
  const rowW = (h) => count * cellW(h, canvas) + (count - 1) * GAP + PAD * 2;
  return {
    w: Math.max(rowW(ROW_HEIGHT), rowW(THUMB_HEIGHT)),
    h: PAD + ROW_HEIGHT + LABEL_H + GAP * 2 + THUMB_HEIGHT + PAD,
  };
}

/** slots: [{ no, layout, uri|null }] — 순수 함수, 브라우저 없이 테스트한다. uri가 null이면 빈 칸. */
export function buildOverviewHTML({ slots, canvas }) {
  const row = (h, withLabel) => slots.map((s) => {
    const w = cellW(h, canvas);
    const box = s.uri
      ? `<img src="${s.uri}" style="width:${w}px;height:${h}px">`
      : `<div class="empty" style="width:${w}px;height:${h}px">렌더 안 됨</div>`;
    const label = withLabel ? `<figcaption>${pad2(s.no)} · ${escapeHTML(String(s.layout))}</figcaption>` : '';
    return `<figure>${box}${label}</figure>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#f2f2f5; padding:${PAD}px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }
.row { display:flex; gap:${GAP}px; align-items:flex-start; }
.row + .row { margin-top:${GAP * 2}px; }
img, .empty { display:block; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.15); }
.empty { background:#dcdce4; color:#6b6b73; font-size:14px; display:flex; align-items:center; justify-content:center; }
figcaption { height:${LABEL_H}px; line-height:${LABEL_H}px; font-size:14px; color:#55555c; text-align:center; }
</style></head><body>
<section class="row">${row(ROW_HEIGHT, true)}</section>
<section class="row">${row(THUMB_HEIGHT, false)}</section>
</body></html>`;
}

/**
 * 개요 시트를 outDir/overview.png로 저장하고 경로를 반환한다.
 * 이번 렌더 버퍼(rendered: Map<index, Buffer>)를 우선 쓰고, 없으면 outDir의 기존 NN.png로 채운다 —
 * --only로 일부만 다시 렌더해도 항상 세트 전체(1…N)를 보여주기 위해서다. 전부 없으면 만들지 않는다(null).
 */
export async function renderOverview(page, { outDir, cfg, rendered, canvas }) {
  const slots = cfg.screens.map((screen, i) => {
    const buf = rendered.get(i) ?? readExisting(path.join(outDir, `${pad2(i + 1)}.png`));
    return { no: i + 1, layout: screen.layout, uri: buf ? `data:image/png;base64,${buf.toString('base64')}` : null };
  });
  if (!slots.some((s) => s.uri)) return null;

  const size = overviewSize(slots.length, canvas);
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.setContent(buildOverviewHTML({ slots, canvas }), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(outDir, OVERVIEW_FILE);
  fs.writeFileSync(file, await page.screenshot({ type: 'png' }));
  return file;
}

function readExisting(file) {
  try {
    const buf = fs.readFileSync(file);
    validateImage(buf);
    return buf;
  } catch {
    return null;
  }
}
