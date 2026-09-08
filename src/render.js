import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getDevice } from './devices.js';
import { getLayout } from './layouts.js';
import { buildHTML } from './html.js';
import { checkAll } from './quality.js';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** 프리뷰 축소 비율. 1/3 정도면 레이아웃과 카피 길이를 판단하기에 충분하다. */
const PREVIEW_SCALE = 0.34;

/**
 * config를 읽어 스토어 스크린샷을 배치 생성한다.
 *
 * 규격 정확도의 핵심은 두 줄이다:
 *   viewport         = 디바이스 canvas 그대로
 *   deviceScaleFactor = 1
 *
 * deviceScaleFactor를 지정하지 않으면 환경에 따라 2배 크기로 나오는데,
 * 이것이 스토어 스크린샷 리젝의 가장 흔한 원인이다.
 */
export async function renderAll(cfg, { preview = false, only = null, placeholder = false, cwd = process.cwd(), onProgress, onWarnings } = {}) {
  const device = getDevice(cfg.device);

  // 품질 점검은 렌더를 막지 않는다 — 의도적으로 규칙을 깨는 디자인도 있고,
  // 결과를 눈으로 보기 전에 차단하면 판단할 기회가 사라진다.
  const warnings = checkAll(cfg, device, cwd);
  if (warnings.length) onWarnings?.(warnings);
  const scale = preview ? PREVIEW_SCALE : 1;
  const canvas = preview
    ? { w: Math.round(device.canvas.w * scale), h: Math.round(device.canvas.h * scale) }
    : device.canvas;

  const targets = cfg.screens
    .map((screen, i) => ({ screen, index: i }))
    .filter(({ index }) => !only || only.includes(index + 1));

  if (targets.length === 0) {
    throw new Error(`--only 조건에 맞는 스크린이 없습니다. screens는 1~${cfg.screens.length}번입니다.`);
  }

  // 이미지는 브라우저를 띄우기 전에 전부 읽는다 —
  // 파일이 없으면 브라우저를 켜기 전에 실패하는 편이 빠르고 깔끔하다.
  const loaded = targets.map(({ screen, index }) => ({
    screen,
    index,
    images: {
      main: readImage(screen.source, cwd, device, placeholder, index + 1),
      second: screen.source2 ? readImage(screen.source2, cwd, device, placeholder, index + 1) : null,
    },
  }));

  const outDir = path.resolve(cwd, cfg.output, cfg.locale, cfg.device);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  try {
    const page = await browser.newPage({
      viewport: { width: canvas.w, height: canvas.h },
      deviceScaleFactor: 1,
    });

    for (const { screen, index, images } of loaded) {
      getLayout(screen.layout); // 미지원 레이아웃이면 여기서 명확히 실패

      const html = buildHTML({
        cfg: { ...cfg, canvasOverride: canvas },
        screen,
        device,
        index,
        total: cfg.screens.length,
        images,
      });

      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready); // FOUT 상태로 캡처되는 것 방지

      const file = path.join(outDir, `${String(index + 1).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, type: 'png' });

      const stat = fs.statSync(file);
      const result = { file, index: index + 1, layout: screen.layout, bytes: stat.size, canvas };
      results.push(result);
      onProgress?.(result);
    }
  } finally {
    await browser.close(); // 렌더가 중간에 실패해도 좀비 프로세스를 남기지 않는다
  }

  return { results, outDir, canvas, device, preview, warnings };
}

/** 이미지 파일을 data URI로 읽는다. setContent에는 baseURL이 없어 상대 경로가 통하지 않는다. */
function readImage(source, cwd, device, placeholder, screenNo) {
  if (!source) return null;
  const file = path.resolve(cwd, source);

  if (!fs.existsSync(file)) {
    if (placeholder) return placeholderImage(device, screenNo);
    throw new Error(
      `앱 화면을 찾을 수 없습니다: ${source}\n` +
        `  찾은 경로: ${file}\n` +
        `  PNG를 넣거나, 'appshot capture'로 캡처하거나, --placeholder로 자리표시자를 쓰세요.`,
    );
  }

  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    throw new Error(`지원하지 않는 이미지 형식입니다: ${source} (png/jpg/webp만 가능)`);
  }

  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/**
 * 자리표시자 화면.
 * 실제 앱 화면이 아직 없어도 카피와 레이아웃을 먼저 확정할 수 있게 한다.
 */
function placeholderImage(device, screenNo) {
  const { w, h } = device.screen;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
    <defs><pattern id="g" width="${Math.round(w / 12)}" height="${Math.round(w / 12)}" patternUnits="userSpaceOnUse">
      <rect width="100%" height="100%" fill="#f2f2f7"/>
      <path d="M0 0H${Math.round(w / 12)}M0 0V${Math.round(w / 12)}" stroke="#dcdce4" stroke-width="2"/>
    </pattern></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <text x="50%" y="50%" text-anchor="middle" fill="#9a9aa0"
          font-family="-apple-system, sans-serif" font-size="${Math.round(w / 11)}"
          font-weight="600">화면 ${screenNo}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export { PREVIEW_SCALE };
