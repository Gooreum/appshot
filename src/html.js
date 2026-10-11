import fs from 'node:fs';
import { skillPath } from './paths.js';
import {
  frameCSS, frameHTML, plainCSS, plainHTML, windowCSS, windowHTML, WINDOW_TITLEBAR,
} from './frame.js';
import { getLayout, frameWidthFor, heightPerWidth } from './layouts.js';

/*
 * 템플릿 → 완전한 HTML 문서.
 *
 * 이 모듈은 순수 함수다. 이미지는 이미 data URI로 변환된 상태로 받는다.
 * 파일 I/O는 render.js가 담당한다 — 그래야 브라우저 없이 단위 테스트가 된다.
 *
 * 이미지를 data URI로 인라인하는 것은 선택이 아니라 필수다.
 * Playwright의 setContent()에는 baseURL이 없어서 상대 경로 img가 전부 깨진다.
 */

let baseCSSCache = null;
const baseCSS = () => (baseCSSCache ??= fs.readFileSync(skillPath('templates', 'base.css'), 'utf8'));

const templateCache = new Map();
function template(name) {
  if (!templateCache.has(name)) {
    templateCache.set(name, fs.readFileSync(skillPath('templates', name), 'utf8'));
  }
  return templateCache.get(name);
}

/**
 * 이미지 인자를 { uri, size } 형태로 맞춘다.
 * render는 크기까지 넘기지만, data URI 문자열만 넘기는 호출도 계속 받는다 —
 * 크기는 창 목업의 비율 계산에만 쓰이므로 없으면 기기 화면 비율로 떨어진다.
 */
const asImage = (v) => (typeof v === 'string' ? { uri: v, size: null } : v);

/** 브랜드 폰트의 내부 패밀리 이름. 사용자 입력이 CSS에 들어가지 않도록 고정한다. */
export const BRAND_FONT_FAMILY = 'appshot-brand';

/**
 * fonts: [{ uri, format, weight|null }] — render.js가 파일을 data URI로 읽어 넘긴다.
 * 비어 있으면 출력은 폰트 지원 전과 바이트 단위로 같다.
 */
export function buildHTML({ cfg, screen, device, index = 0, total = 1, images = {}, fonts = [] }) {
  const layout = getLayout(screen.layout);
  const canvas = cfg.canvasOverride ?? device.canvas;
  images = {
    ...images, // background 등 다른 키를 잃지 않게
    main: images.main ? asImage(images.main) : null,
    second: images.second ? asImage(images.second) : null,
    background: images.background ? asImage(images.background) : null,
  };

  if (layout.screens > 1 && !images.second) {
    throw new Error(
      `screens[${index}]는 '${screen.layout}' 레이아웃이라 화면 2장이 필요합니다. source2를 지정하세요.`,
    );
  }
  if (!images.main) {
    throw new Error(`screens[${index}]의 화면 이미지가 없습니다: ${screen.source}`);
  }

  // 필드가 없으면 기기 프레임 — deviceFrame이 생기기 전에 만든 config와 호환
  const framed = cfg.theme.deviceFrame !== false;
  // 맥은 기기 프레임이 아니라 앱 창으로 감싼다 (devices.js의 frame.chrome)
  const windowed = framed && device.frame.chrome === 'window';
  // 창 목업은 화면 영역을 소스 비율에 맞추므로 폭 역산에도 그 비율을 쓴다 (타이틀바 포함)
  const screenAspect = windowed && images.main?.size ? images.main.size.h / images.main.size.w : null;
  const aspect = screenAspect === null ? null : screenAspect + WINDOW_TITLEBAR;
  const frameW = frameWidthFor(device, layout, canvas, { framed, aspect });
  const usesDevice = screen.layout !== 'fullbleed';

  const imgTag = (img) => `<img class="screen" src="${img.uri}" alt="">`;
  const wrap = (img) =>
    windowed ? windowHTML(imgTag(img)) : framed ? frameHTML(device, imgTag(img)) : plainHTML(imgTag(img));
  const body = render(template(layout.template), {
    headline: screen.headline ?? '',
    subhead: screen.subhead ?? '',
    screenSrc: images.main.uri,
    device: usesDevice ? wrap(images.main) : '',
    device2: images.second ? wrap(images.second) : '',
  });

  return `<!doctype html>
<html lang="${cfg.locale ?? 'ko'}">
<head>
<meta charset="utf-8">
<style>
${fontFaceCSS(fonts)}:root {
${themeVars(cfg, canvas, fonts)}
  --device-w: ${frameW}px;
  --device-hpw: ${heightPerWidth(device, layout, { framed, aspect }).toFixed(5)};
  --screen-aspect: ${screenAspect ? `${images.main.size.w} / ${images.main.size.h}` : '16 / 10'};
}
${baseCSS()}
${backgroundCSS(cfg.theme.background, index, total, images.background)}
${usesDevice ? (windowed ? windowCSS(frameW) : framed ? frameCSS(device, frameW) : plainCSS(device, frameW)) : ''}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** :root의 캔버스·폰트·카피 변수. 스크린샷과 피처 그래픽이 같은 테마로 그려지도록 함께 쓴다. */
function themeVars(cfg, canvas, fonts) {
  return `  --canvas-w: ${canvas.w}px;
  --canvas-h: ${canvas.h}px;
  /* base.css의 --u가 쓰는 기준. 짧은 변의 1% — 가로 규격에서 폭을 쓰면 글자가 커진다 */
  --unit: ${Math.min(canvas.w, canvas.h) / 100}px;
  --font-stack: ${fonts.length ? `'${BRAND_FONT_FAMILY}', ` : ''}${cfg.theme.fontStack};
  --headline-color: ${cfg.theme.headline.color};
  --headline-weight: ${cfg.theme.headline.weight ?? 800};
  --headline-scale: ${(cfg.theme.headline.size ?? 0.056) * 100};
  --subhead-color: ${cfg.theme.subhead.color};
  --subhead-weight: ${cfg.theme.subhead.weight ?? 500};
  --subhead-scale: ${(cfg.theme.subhead.size ?? 0.029) * 100};`;
}

/** 피처 그래픽에서 기기 프레임 폭 (캔버스 폭 대비). 세로 기기라 아래로 넘쳐 잘리는 것이 의도다. */
const FEATURE_DEVICE_WIDTH = 0.27;

/**
 * Play 피처 그래픽 HTML. cfg는 expandConfig로 펼친 단일 config(featureGraphic 카피가 문자열로 확정됨).
 * images.main이 없으면(featureGraphic.source 없음) 기기 없이 카피만 가운데에 둔다.
 * 배경은 장 구분이 없으므로 파노라마 없이 1장짜리로 그린다.
 */
export function buildFeatureGraphicHTML({ cfg, device, canvas, images = {}, fonts = [] }) {
  const fg = cfg.featureGraphic ?? {};
  const main = images.main ? asImage(images.main) : null;
  const background = images.background ? asImage(images.background) : null;
  const framed = cfg.theme.deviceFrame !== false;
  const frameW = Math.round(canvas.w * FEATURE_DEVICE_WIDTH);
  const imgTag = main ? `<img class="screen" src="${main.uri}" alt="">` : '';
  const body = render(template('feature-graphic.html'), {
    stageClass: main ? '' : 'is-copy-only',
    headline: fg.headline ?? '',
    subhead: fg.subhead ?? '',
    device: main ? (framed ? frameHTML(device, imgTag) : plainHTML(imgTag)) : '',
  });

  return `<!doctype html>
<html lang="${cfg.locale ?? 'ko'}">
<head>
<meta charset="utf-8">
<style>
${fontFaceCSS(fonts)}:root {
${themeVars(cfg, canvas, fonts)}
}
${baseCSS()}
${backgroundCSS(cfg.theme.background, 0, 1, background)}
${main ? (framed ? frameCSS(device, frameW) : plainCSS(device, frameW)) : ''}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * 브랜드 폰트 @font-face.
 * 단일 파일(weight 없음)이면 1~1000 전 구간에 매칭시킨다 — 헤드라인 800과 서브카피 500이
 * 같은 파일로 떨어지고 크롬이 가짜 볼드(synthetic bold)를 만들지 않는다. 가변 폰트에도 맞는 값이다.
 */
function fontFaceCSS(fonts) {
  return fonts.map((f) => `@font-face {
  font-family: '${BRAND_FONT_FAMILY}';
  src: url("${f.uri}") format('${f.format}');
  font-weight: ${f.weight ?? '1 1000'};
  font-display: block;
}
`).join('');
}

/**
 * 배경 이미지 위 기본 마스크 세기.
 * 대비를 자동으로 검사할 수 없는 유일한 배경이 사진이라(부분마다 밝기가 다르다),
 * 기본값을 0으로 두면 카피가 묻힌 결과물이 그대로 나간다. 0으로 끌 수는 있다.
 */
const BG_OVERLAY_DEFAULT = 0.28;

/**
 * 배경.
 *
 * panorama가 켜지면 배경 그라디언트를 전체 장수만큼 넓게 그린 뒤
 * 각 장이 그중 자기 구간만 보여준다 — 스토어에서 옆으로 넘길 때
 * 배경이 하나로 이어져 흐르는 인상을 준다.
 */
function backgroundCSS(bg, index, total, bgImage = null) {
  if (!bg) return '.bg { background: #111; }';

  // 이미지 배경. bgImage가 없으면(--placeholder로 파일을 건너뛴 경우) 아래 그라디언트로 떨어진다.
  if (bg.type === 'image' && bgImage) {
    const panorama = bg.panorama && total > 1;
    // 파노라마는 배경을 장수만큼 넓게 깔고 각 장이 자기 구간만 보여준다 (그라디언트와 같은 방식)
    const size = panorama ? `${total * 100}% 100%` : bg.fit === 'contain' ? 'contain' : 'cover';
    const position = panorama ? `${((index / (total - 1)) * 100).toFixed(4)}% 0` : 'center';
    const overlay = bg.overlay ?? BG_OVERLAY_DEFAULT;
    return `.bg {
  background-image: url("${bgImage.uri}");
  background-size: ${size};
  background-position: ${position};
  background-repeat: no-repeat;
  background-color: #111; /* contain으로 남는 여백 */
}${overlay > 0 ? `

/* 가독성 마스크 — 배경 사진은 부분마다 밝기가 달라 카피가 묻히는 사고가 가장 흔하다 */
.bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, ${overlay});
}` : ''}`;
  }

  if (bg.type === 'solid') {
    return `.bg { background: ${bg.from ?? '#111'}; }`;
  }

  const gradient = `linear-gradient(${bg.angle ?? 160}deg, ${bg.from}, ${bg.to})`;

  if (bg.panorama && total > 1) {
    const width = total * 100;
    const position = (index / (total - 1)) * 100;
    return `.bg {
  background-image: ${gradient};
  background-size: ${width}% 100%;
  background-position: ${position.toFixed(4)}% 0;
  background-repeat: no-repeat;
}`;
  }

  return `.bg { background-image: ${gradient}; }`;
}

/**
 * 최소 템플릿 엔진.
 *   {{key}}     — HTML 이스케이프해서 삽입
 *   {{{key}}}   — 그대로 삽입 (이미 만든 마크업)
 *   {{#key}}…{{/key}} — key가 비어있지 않을 때만 블록 출력
 *
 * 사용자가 쓴 카피가 그대로 HTML이 되므로 이스케이프는 타협 대상이 아니다.
 */
export function render(tpl, data) {
  let out = tpl;

  // 조건부 블록을 먼저 처리한다 — 그래야 제거된 블록 안의 토큰이 남지 않는다
  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) =>
    isBlank(data[key]) ? '' : inner,
  );

  out = out.replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => String(data[key] ?? ''));
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHTML(String(data[key] ?? '')));

  return out;
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

export function escapeHTML(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
