import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getDevice } from './devices.js';
import { getLayout } from './layouts.js';
import { buildHTML } from './html.js';
import { checkAll, checkCopyArea, sizeFromBuffer, validateImage } from './quality.js';

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
  // 카피 면적처럼 렌더해야 알 수 있는 경고가 뒤에 붙으므로 출력은 렌더 후 한 번에 한다.
  const warnings = checkAll(cfg, device, cwd);
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
  // 문제 파일은 첫 번째에서 멈추지 않고 전부 모은다 — 하나 고치고 다시 돌려야 다음 게 보이면 번거롭다.
  // 같은 파일을 여러 장이 쓰면 한 번만, 쓰는 장 번호를 함께 보여준다.
  const problems = new Map(); // 절대경로 → { error, screens }
  const load = (source, index) => {
    try {
      // index가 null이면 배경 이미지 — 메시지 문구도 '배경 이미지'로 바꾼다
      return readImage(source, cwd, device, placeholder, (index ?? 0) + 1, index === null ? '배경 이미지' : '앱 화면');
    } catch (err) {
      if (!(err instanceof ScreenImageError)) throw err;
      const key = path.resolve(cwd, source);
      const p = problems.get(key) ?? { error: err, screens: [] };
      // 배경 이미지는 특정 장이 아니라 전체에 쓰이므로 번호 대신 '배경'으로 표시한다
      const label = index === null ? '배경' : index + 1;
      if (!p.screens.includes(label)) p.screens.push(label);
      problems.set(key, p);
      return null;
    }
  };
  const loaded = targets.map(({ screen, index }) => ({
    screen,
    index,
    images: {
      main: load(screen.source, index),
      second: screen.source2 ? load(screen.source2, index) : null,
    },
  }));
  // 배경 이미지는 장마다 같으므로 한 번만 읽는다.
  // --placeholder는 "에셋이 아직 없다"는 뜻이라 배경이 없으면 그라디언트로 떨어지고 경고만 남긴다.
  // 깨진 배경 파일은 placeholder여도 problems로 간다 — 앱 화면과 같은 원칙이다.
  let background = null;
  const bgCfg = cfg.theme.background;
  if (bgCfg?.type === 'image') {
    const bgFile = path.resolve(cwd, bgCfg.source ?? '');
    if (placeholder && !fs.existsSync(bgFile)) {
      warnings.push({
        level: 'warn',
        screen: null,
        code: 'bg-missing',
        message: `배경 이미지가 없어 기본 그라디언트로 렌더했습니다: ${bgCfg.source}`,
      });
    } else {
      background = load(bgCfg.source, null);
    }
  }

  if (problems.size === 1) throw [...problems.values()][0].error; // 1개면 원래 문구 그대로
  if (problems.size > 1) throw new Error(imageProblemsMessage([...problems.values()]));

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
        images: { ...images, background },
      });

      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready); // FOUT 상태로 캡처되는 것 방지

      const area = checkCopyArea(cfg, index, await copyAreaRatio(page));
      if (area) warnings.push(area);

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

  if (warnings.length) onWarnings?.(warnings);
  return { results, outDir, canvas, device, preview, warnings };
}

/**
 * 헤드라인·서브카피가 캔버스에서 차지하는 비율.
 *
 * Google Play는 "20%"를 어떻게 재는지 정의하지 않는다. 글자 줄 조각만 감싸는 사각형으로 재면
 * text-wrap: balance가 줄 폭을 좁혀서 7줄짜리 카피도 15%로 나온다 — 너무 관대하다.
 * 카피가 놓인 가로 띠는 좌우 여백까지 앱 화면이 쓸 수 없으므로,
 * 첫 줄 위부터 마지막 줄 아래까지의 높이를 캔버스 높이로 나눈 "띠" 비율로 잰다.
 * 비율이라 --preview 축소 렌더에서도 같은 값이 나온다.
 */
function copyAreaRatio(page) {
  return page.evaluate(() => {
    let top = Infinity, bottom = -Infinity;
    for (const el of document.querySelectorAll('.headline, .subhead')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
    }
    if (bottom < top) return 0; // 카피가 없다
    return (bottom - top) / innerHeight;
  });
}

/** 앱 화면 파일 문제. 여러 개를 모아 한 번에 보여주려고 파일·사유를 따로 싣는다. */
class ScreenImageError extends Error {
  constructor(message, { source, reason, kind }) {
    super(message);
    Object.assign(this, { source, reason, kind }); // kind: 'missing' | 'format' | 'broken'
  }
}

/**
 * 목적격 조사. 받침이 있으면 '을', 없으면 '를'.
 * "앱 화면을" / "배경 이미지를" 처럼 대상 이름을 문구에 끼울 때 쓴다.
 */
function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return hasFinal ? '을' : '를';
}

/** 문제가 걸린 자리 표시 — 장 번호는 "1·4번"으로 묶고, 배경 같은 비-장 라벨은 그대로 붙인다. */
function whereLabel(screens) {
  const nums = screens.filter((s) => typeof s === 'number');
  const others = screens.filter((s) => typeof s !== 'number');
  return [...(nums.length ? [`${nums.join('·')}번`] : []), ...others].join('·');
}

/** 문제 파일이 여러 개일 때의 메시지 — 파일마다 한 줄, 쓰는 자리와 사유. */
function imageProblemsMessage(problems) {
  const lines = problems.map(({ error, screens }) => `  ${error.source} (${whereLabel(screens)}) — ${error.reason}`);
  const hint = problems.some((p) => p.error.kind === 'missing')
    ? "\n  없는 화면은 'appshot capture'로 캡처하거나 --placeholder로 자리표시자를 쓰세요."
    : '';
  return (
    `앱 화면 ${problems.length}개에 문제가 있습니다:\n${lines.join('\n')}\n` +
    `  깨진 파일은 다시 만들거나 다른 화면을 지정하세요.${hint}`
  );
}

/** 이미지 파일을 data URI로 읽는다. setContent에는 baseURL이 없어 상대 경로가 통하지 않는다. */
function readImage(source, cwd, device, placeholder, screenNo, what = '앱 화면') {
  if (!source) return null;
  const file = path.resolve(cwd, source);

  if (!fs.existsSync(file)) {
    if (placeholder) return placeholderImage(device, screenNo);
    throw new ScreenImageError(
      `${what}${objectParticle(what)} 찾을 수 없습니다: ${source}\n` +
        `  찾은 경로: ${file}\n` +
        `  PNG를 넣거나, 'appshot capture'로 캡처하거나, --placeholder로 자리표시자를 쓰세요.`,
      { source, reason: '파일을 찾을 수 없습니다.', kind: 'missing' },
    );
  }

  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    throw new ScreenImageError(`지원하지 않는 이미지 형식입니다: ${source} (png/jpg/webp만 가능)`, {
      source,
      reason: '지원하지 않는 확장자입니다 (png/jpg/webp만 가능).',
      kind: 'format',
    });
  }

  // 확장자만 믿지 않는다. 깨진 파일은 --placeholder여도 자리표시자로 덮지 않는다 —
  // "화면이 아직 없다"와 "있는 줄 알았는데 깨졌다"는 다른 사고고, 후자를 덮으면 사용자가 영영 모른다.
  const buf = fs.readFileSync(file);
  try {
    validateImage(buf);
  } catch (err) {
    throw new ScreenImageError(
      `${what}${objectParticle(what)} 읽을 수 없습니다: ${source}\n` +
        `  ${err.message}\n` +
        `  파일을 다시 만들거나 다른 ${what}${objectParticle(what)} 지정하세요.`,
      { source, reason: err.message, kind: 'broken' },
    );
  }

  // size는 창 목업이 화면 영역 비율을 소스에 맞추는 데 쓴다 (읽지 못하면 null)
  return { uri: `data:${mime};base64,${buf.toString('base64')}`, size: sizeFromBuffer(buf) };
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
  // 자리표시자는 기기 화면 비율로 그리므로 size를 따로 넘기지 않아도 된다
  return { uri: `data:image/svg+xml,${encodeURIComponent(svg)}`, size: null };
}

export { PREVIEW_SCALE };
