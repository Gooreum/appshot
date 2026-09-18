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

export function buildHTML({ cfg, screen, device, index = 0, total = 1, images = {} }) {
  const layout = getLayout(screen.layout);
  const canvas = cfg.canvasOverride ?? device.canvas;
  images = {
    main: images.main ? asImage(images.main) : null,
    second: images.second ? asImage(images.second) : null,
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
:root {
  --canvas-w: ${canvas.w}px;
  --canvas-h: ${canvas.h}px;
  /* base.css의 --u가 쓰는 기준. 짧은 변의 1% — 가로 규격에서 폭을 쓰면 글자가 커진다 */
  --unit: ${Math.min(canvas.w, canvas.h) / 100}px;
  --font-stack: ${cfg.theme.fontStack};
  --headline-color: ${cfg.theme.headline.color};
  --headline-weight: ${cfg.theme.headline.weight ?? 800};
  --headline-scale: ${(cfg.theme.headline.size ?? 0.056) * 100};
  --subhead-color: ${cfg.theme.subhead.color};
  --subhead-weight: ${cfg.theme.subhead.weight ?? 500};
  --subhead-scale: ${(cfg.theme.subhead.size ?? 0.029) * 100};
  --device-w: ${frameW}px;
  --device-hpw: ${heightPerWidth(device, layout, { framed, aspect }).toFixed(5)};
  --screen-aspect: ${screenAspect ? `${images.main.size.w} / ${images.main.size.h}` : '16 / 10'};
}
${baseCSS()}
${backgroundCSS(cfg.theme.background, index, total)}
${usesDevice ? (windowed ? windowCSS(frameW) : framed ? frameCSS(device, frameW) : plainCSS(frameW)) : ''}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * 배경.
 *
 * panorama가 켜지면 배경 그라디언트를 전체 장수만큼 넓게 그린 뒤
 * 각 장이 그중 자기 구간만 보여준다 — 스토어에서 옆으로 넘길 때
 * 배경이 하나로 이어져 흐르는 인상을 준다.
 */
function backgroundCSS(bg, index, total) {
  if (!bg) return '.bg { background: #111; }';

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
