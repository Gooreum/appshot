import fs from 'node:fs';
import path from 'node:path';
import { getLayout, frameWidthFor } from './layouts.js';

/**
 * 품질 게이트.
 *
 * 스토어 스크린샷이 허접해지는 원인은 대개 취향 문제가 아니라
 * 측정 가능한 다섯 가지 사고다. 렌더 전에 이것들을 잡아 경고한다.
 *
 * 경고일 뿐 중단하지 않는다 — 의도적으로 규칙을 깨는 디자인도 있고,
 * 렌더를 막으면 사용자가 결과를 눈으로 확인할 기회 자체가 사라진다.
 */

/** 한글 18자 / 영문 32자. 이를 넘으면 스토어 목록 썸네일에서 잘린다. */
const HEADLINE_MAX_CJK = 18;
const HEADLINE_MAX_LATIN = 32;
const SUBHEAD_MAX_LINES = 2;
/*
 * WCAG AA는 본문 텍스트에 4.5:1, 큰 텍스트(18pt / 14pt bold 이상)에 3:1을 요구한다.
 * 스토어 스크린샷의 카피는 예외 없이 큰 텍스트다 — 헤드라인이 캔버스 폭의 5.6%면
 * 1290px 규격에서 72px이다. 그래서 3:1이 이 도구에 맞는 기준이고,
 * 4.5:1을 들이대면 통과할 수 있는 배색이 거의 없어 경고가 무의미해진다.
 */
const CONTRAST_MIN = 3.0;
const RATIO_TOLERANCE = 0.03;

const CJK = /[ᄀ-ᇿ㄰-㆏가-힯぀-ヿ一-鿿]/;

export function checkAll(cfg, device, cwd = process.cwd()) {
  const warnings = [];
  const add = (index, code, message) => warnings.push({ level: 'warn', screen: index + 1, code, message });

  cfg.screens.forEach((screen, i) => {
    const layout = getLayout(screen.layout);

    checkHeadline(screen, i, add);
    checkSubhead(screen, cfg, device, i, add);
    checkContrast(screen, cfg, layout, i, add);
    checkSource(screen, cfg, device, layout, cwd, i, add);
  });

  return warnings;
}

// ── 카피 ────────────────────────────────────────────────────────────────

function checkHeadline(screen, i, add) {
  const text = (screen.headline ?? '').trim();
  if (!text) {
    add(i, 'headline-empty', '헤드라인이 비어 있습니다. 첫 장의 헤드라인이 설치율에 가장 큰 영향을 줍니다.');
    return;
  }
  const max = CJK.test(text) ? HEADLINE_MAX_CJK : HEADLINE_MAX_LATIN;
  if (text.length > max) {
    add(i, 'headline-long',
      `헤드라인이 ${text.length}자입니다 (권장 ${max}자 이하). 스토어 목록 썸네일에서 잘릴 수 있습니다.`);
  }
}

function checkSubhead(screen, cfg, device, i, add) {
  const text = (screen.subhead ?? '').trim();
  if (!text) return;

  const lines = estimateLines(text, cfg, device);
  if (lines > SUBHEAD_MAX_LINES) {
    add(i, 'subhead-long',
      `서브카피가 약 ${lines}줄로 예상됩니다 (권장 ${SUBHEAD_MAX_LINES}줄 이하). 디바이스 영역을 침범할 수 있습니다.`);
  }
}

/**
 * 줄 수 추정.
 * 정확한 텍스트 측정은 브라우저가 해야 하지만, 렌더 전에 알려주는 것이
 * 목적이므로 글자 폭 근사로 충분하다. CJK는 약 1em, 라틴은 약 0.55em.
 */
function estimateLines(text, cfg, device) {
  const canvasW = device.canvas.w;
  const available = canvasW * (1 - 0.08 * 2); // base.css의 좌우 안전 여백 8%
  const fontSize = canvasW * (cfg.theme.subhead.size ?? 0.029);
  const emPerChar = CJK.test(text) ? 1.0 : 0.55;
  const perLine = Math.max(1, Math.floor(available / (fontSize * emPerChar)));
  return Math.ceil(text.length / perLine);
}

// ── 대비 ────────────────────────────────────────────────────────────────

function checkContrast(screen, cfg, layout, i, add) {
  // 풀블리드는 배경이 앱 화면이다 — 그라디언트와 비교하면 오탐만 난다
  if (screen.layout === 'fullbleed') return;

  const bg = cfg.theme.background;
  if (!bg || bg.type === 'image') return;

  const stops = [bg.from, bg.to].filter(Boolean).map(parseColor).filter(Boolean);
  if (!stops.length) return;

  for (const [key, label] of [['headline', '헤드라인'], ['subhead', '서브카피']]) {
    if (key === 'subhead' && !(screen.subhead ?? '').trim()) continue;

    const fg = parseColor(cfg.theme[key]?.color);
    if (!fg) continue;

    let worst = Infinity;
    let worstStop = null;
    for (const stop of stops) {
      const ratio = contrastRatio(flatten(fg, stop), stop);
      if (ratio < worst) {
        worst = ratio;
        worstStop = stop;
      }
    }

    if (worst < CONTRAST_MIN) {
      add(i, `contrast-${key}`,
        `${label} 대비가 ${worst.toFixed(2)}:1 입니다 (WCAG AA 큰 텍스트 기준 ${CONTRAST_MIN}:1). ` +
        `배경 ${toHex(worstStop)} 위에서 읽기 어렵습니다.`);
    }
  }
}

/** '#RGB' / '#RRGGBB' / 'rgb()' / 'rgba()' 를 {r,g,b,a}로. */
export function parseColor(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();

  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/[,/]/).map((p) => Number.parseFloat(p.trim()));
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
  }

  return null;
}

/** 반투명 전경색을 배경 위에 합성한다. rgba 서브카피의 실제 대비를 보려면 필요하다. */
function flatten(fg, bg) {
  const a = fg.a ?? 1;
  if (a >= 1) return fg;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

export function relativeLuminance({ r, g, b }) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (c) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

// ── 소스 이미지 ─────────────────────────────────────────────────────────

function checkSource(screen, cfg, device, layout, cwd, i, add) {
  for (const key of ['source', 'source2']) {
    const src = screen[key];
    if (!src) continue;

    const file = path.resolve(cwd, src);
    if (!fs.existsSync(file)) continue; // 존재 여부는 render가 더 명확히 알려준다

    const size = imageSize(file);
    if (!size) continue;

    // 비율: 앱 화면이 늘어나 보이는 가장 흔한 사고
    const expected = device.screen.h / device.screen.w;
    const actual = size.h / size.w;
    const drift = Math.abs(actual - expected) / expected;
    if (drift > RATIO_TOLERANCE) {
      add(i, 'source-ratio',
        `${src}의 비율이 ${device.label} 화면과 ${(drift * 100).toFixed(0)}% 다릅니다 ` +
        `(${size.w}×${size.h} vs 기대 ${device.screen.w}×${device.screen.h}). 화면이 늘어나 보일 수 있습니다.`);
    }

    // 해상도: 프레임 렌더 폭보다 작으면 업스케일되어 뭉갠다
    const frameW = frameWidthFor(device, layout, device.canvas);
    if (size.w < frameW) {
      add(i, 'source-lowres',
        `${src}의 폭이 ${size.w}px으로 렌더 폭 ${frameW}px보다 작습니다. 확대되어 흐려집니다.`);
    }
  }
}

/**
 * 이미지 헤더에서 크기를 읽는다.
 * 이것 때문에 이미지 디코딩 라이브러리를 들일 이유는 없다 — 헤더면 충분하다.
 */
export function imageSize(file) {
  const buf = fs.readFileSync(file);

  // PNG: 8바이트 시그니처 + IHDR 길이/타입(8) → 오프셋 16부터 width, height
  if (buf.length > 24 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }

  // JPEG: SOF0~SOF15 마커를 훑는다 (DHT/DRI 등은 건너뛴다)
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      // SOF0-3, SOF5-7, SOF9-11, SOF13-15 (DHT 0xC4, JPG 0xC8, DAC 0xCC 제외)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
  }

  return null; // webp 등은 판정하지 않는다 — 모르면 경고하지 않는 편이 낫다
}

/** 경고를 사람이 읽는 형태로 출력한다. */
export function printWarnings(warnings) {
  if (!warnings.length) return;
  console.log(`\n  품질 점검 — ${warnings.length}건`);
  for (const w of warnings) {
    console.log(`    [${w.screen}번] ${w.message}`);
  }
  console.log('');
}
