import fs from 'node:fs';
import { skillPath } from './paths.js';
import { frameCSS, frameHTML } from './frame.js';
import { getLayout } from './layouts.js';

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

export function buildHTML({ cfg, screen, device, index = 0, total = 1, images = {} }) {
  const layout = getLayout(screen.layout);
  const canvas = cfg.canvasOverride ?? device.canvas;

  if (layout.screens > 1 && !images.second) {
    throw new Error(
      `screens[${index}]는 '${screen.layout}' 레이아웃이라 화면 2장이 필요합니다. source2를 지정하세요.`,
    );
  }
  if (!images.main) {
    throw new Error(`screens[${index}]의 화면 이미지가 없습니다: ${screen.source}`);
  }

  const frameW = Math.round(canvas.w * layout.frameWidth);
  const usesFrame = screen.layout !== 'fullbleed';

  const imgTag = (src) => `<img class="screen" src="${src}" alt="">`;
  const body = render(template(layout.template), {
    headline: screen.headline ?? '',
    subhead: screen.subhead ?? '',
    screenSrc: images.main,
    device: usesFrame ? frameHTML(device, imgTag(images.main)) : '',
    device2: images.second ? frameHTML(device, imgTag(images.second)) : '',
  });

  return `<!doctype html>
<html lang="${cfg.locale ?? 'ko'}">
<head>
<meta charset="utf-8">
<style>
:root {
  --canvas-w: ${canvas.w}px;
  --canvas-h: ${canvas.h}px;
  --font-stack: ${cfg.theme.fontStack};
  --headline-color: ${cfg.theme.headline.color};
  --headline-weight: ${cfg.theme.headline.weight ?? 800};
  --headline-scale: ${(cfg.theme.headline.size ?? 0.056) * 100};
  --subhead-color: ${cfg.theme.subhead.color};
  --subhead-weight: ${cfg.theme.subhead.weight ?? 500};
  --subhead-scale: ${(cfg.theme.subhead.size ?? 0.029) * 100};
}
${baseCSS()}
${backgroundCSS(cfg.theme.background, index, total)}
${usesFrame ? frameCSS(device, frameW) : ''}
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
