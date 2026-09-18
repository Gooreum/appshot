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

/** 스토어별 업로드 가능 최대 장수와, Play 추천 영역 노출에 필요한 최소 장수. */
const MAX_SCREENS = { ios: 10, macos: 10, android: 8 };
const STORE_LABEL = { ios: 'App Store', macos: 'Mac App Store', android: 'Google Play' };
const PLAY_RECOMMEND_MIN = 4;

/** 카피가 이미지에서 차지해도 되는 최대 면적 (Google Play: "not more than 20% of the image"). */
const COPY_AREA_MAX = 0.2;

export function checkAll(cfg, device, cwd = process.cwd()) {
  const warnings = [];
  // index가 null이면 특정 장이 아니라 설정 전체에 대한 경고다
  const add = (index, code, message) =>
    warnings.push({ level: 'warn', screen: index === null ? null : index + 1, code, message });

  const tabletText = cfg.platform === 'android' && device.formFactor === 'tablet';

  cfg.screens.forEach((screen, i) => {
    const layout = getLayout(screen.layout);

    // Play는 태블릿 스크린샷에서 추가 텍스트를 빼라고 권장한다 — 비어 있는 게 정상이다
    if (!tabletText) checkHeadline(screen, i, add);
    checkSubhead(screen, cfg, device, i, add);
    checkContrast(screen, cfg, layout, i, add);
    checkSource(screen, cfg, device, layout, cwd, i, add);
    checkRestricted(screen, cfg, i, add);
  });

  checkCount(cfg, add);
  checkDeviceImagery(cfg, add);
  if (tabletText) checkTabletText(cfg, add);

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
  // base.css의 --u와 같은 기준(짧은 변의 1%)이어야 추정이 맞는다.
  // 세로 기기는 짧은 변이 곧 폭이라 예전 식과 값이 같다.
  const unit = Math.min(device.canvas.w, device.canvas.h);
  const available = device.canvas.w - unit * 0.08 * 2; // base.css의 --safe-x = 8u, 좌우 2번
  const fontSize = unit * (cfg.theme.subhead.size ?? 0.029);
  const emPerChar = CJK.test(text) ? 1.0 : 0.55;
  const perLine = Math.max(1, Math.floor(available / (fontSize * emPerChar)));
  return Math.ceil(text.length / perLine);
}

// ── 스토어 정책 ─────────────────────────────────────────────────────────

/*
 * 스토어가 스크린샷에 쓰지 말라고 명시한 표현.
 *   Google Play: "Best", "#1", "Top", "New", "Discount", "Sale", "Million Downloads",
 *                "download now" / "install now" / "play now" / "try now"
 *   App Store 2.3.7: 스크린샷에 가격을 넣지 말 것
 * stores는 해당 분류를 명시한 스토어다. 오탐을 줄이려고 흔한 일반어("최고 기온",
 * "수상한", "stress-free", "top of")는 걸리지 않게 좁혀 두었다.
 */
const RESTRICTED = [
  {
    kind: '순위·최상급',
    stores: ['ios', 'android'],
    re: /최고의|업계\s?최고|국내\s?최고|1위|넘버\s?원|베스트|수상작|수상\s?경력|어워드|no\.\s?1\b|#\s?1\b|\bbest\b|\bnumber\s+one\b|\baward|\btop[\s-]?(\d+|rated|ranked|charts?|apps?|pick)\b/i,
  },
  {
    kind: '가격·할인',
    stores: ['ios', 'android'],
    re: /무료|공짜|할인|세일|특가|(?<![\w-])free\b(?!-)|\bsale\b|\bdiscount|\d+\s?%\s?(off|할인)|[$₩€£]\s?\d|\d[\d,]*\s?원(?![가-힣])/i,
  },
  {
    kind: '다운로드·사용자 수',
    stores: ['android'],
    re: /\d+\s?(만|억)\s?(명|다운로드|사용자|유저)|다운로드\s?(수|돌파)|million\s+(downloads|users)/i,
  },
  { kind: '신규 표현', stores: ['android'], re: /\bnew\b|신규|신상/i },
  {
    kind: '설치 유도',
    stores: ['android'],
    re: /\b(download|install|play|try|get)\s+(it\s+)?now\b|지금\s?(다운|설치|받|플레이|체험)|(다운로드|다운|설치)\s?(하세요|받으세요|해\s?보세요)/i,
  },
];

const POLICY_SOURCE = {
  ios: 'App Store 심사에서 반려될 수 있습니다',
  android: 'Google Play 스크린샷 정책상 쓰지 말아야 합니다',
};

function checkRestricted(screen, cfg, i, add) {
  const store = cfg.platform === 'android' ? 'android' : 'ios';
  for (const [key, label] of [['headline', '헤드라인'], ['subhead', '서브카피']]) {
    const text = screen[key] ?? '';
    for (const rule of RESTRICTED) {
      if (!rule.stores.includes(store)) continue;
      const m = text.match(rule.re);
      if (!m) continue;
      // 매칭이 어절 중간에서 끝나면("지금 다운"|로드하세요) 어절 끝까지 보여준다
      const rest = text.slice(m.index + m[0].length).match(/^\S*/)[0];
      add(i, `restricted-${rule.kind}`,
        `${label}의 "${(m[0] + rest).trim()}" — ${rule.kind} 표현은 ${POLICY_SOURCE[store]}.`);
    }
  }
}

function checkCount(cfg, add) {
  const store = MAX_SCREENS[cfg.platform] ? cfg.platform : 'ios';
  const n = cfg.screens.length;
  if (n > MAX_SCREENS[store]) {
    add(null, 'count-max',
      `스크린샷이 ${n}장입니다. ${STORE_LABEL[store]}는 기기 유형당 최대 ${MAX_SCREENS[store]}장까지 올릴 수 있습니다.`);
  }
  if (store === 'android' && n < PLAY_RECOMMEND_MIN) {
    add(null, 'count-recommend',
      `스크린샷이 ${n}장입니다. Google Play 추천 영역에 노출되려면 ${PLAY_RECOMMEND_MIN}장 이상이 필요합니다.`);
  }
}

function checkDeviceImagery(cfg, add) {
  if (cfg.platform !== 'android' || cfg.theme.deviceFrame === false) return;
  if (cfg.screens.every((s) => s.layout === 'fullbleed')) return; // 기기 요소가 없다
  add(null, 'device-imagery',
    'Google Play는 스크린샷에 기기 이미지를 피하라고 권장합니다 (금방 구식이 되고 일부 사용자를 소외시킨다는 이유). ' +
      'theme.deviceFrame을 false로 두면 화면만 보여줍니다.');
}

function checkTabletText(cfg, add) {
  if (!cfg.screens.some((s) => (s.headline ?? '').trim() || (s.subhead ?? '').trim())) return;
  add(null, 'tablet-text',
    'Google Play는 태블릿·크롬북 스크린샷에서 앱 화면이 아닌 텍스트를 빼라고 권장합니다 (홈 화면에서 잘릴 수 있음). ' +
      'headline/subhead를 비우는 것을 고려하세요.');
}

/**
 * 카피 면적 경고. 줄바꿈 결과는 브라우저만 알기 때문에 렌더 중에 잰 비율을 받는다.
 * Google Play 기준이라 Android에만 적용한다.
 */
export function checkCopyArea(cfg, index, ratio) {
  if (cfg.platform !== 'android' || !(ratio > COPY_AREA_MAX)) return null;
  return {
    level: 'warn',
    screen: index + 1,
    code: 'copy-area',
    message: `카피가 이미지의 ${(ratio * 100).toFixed(0)}%를 차지합니다 (Google Play 기준 ${COPY_AREA_MAX * 100}% 이하). 문구를 줄이세요.`,
  };
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

    // 비율: 앱 화면이 늘어나 보이는 가장 흔한 사고.
    // 맥은 예외다 — 넣는 것이 화면이 아니라 앱 **창**이라 비율이 제각각이고,
    // 창 목업이 그 비율에 맞춰 그려지므로 늘어나지 않는다.
    const expected = device.screen.h / device.screen.w;
    const actual = size.h / size.w;
    const drift = Math.abs(actual - expected) / expected;
    if (cfg.platform !== 'macos' && drift > RATIO_TOLERANCE) {
      add(i, 'source-ratio',
        `${src}의 비율이 ${device.label} 화면과 ${(drift * 100).toFixed(0)}% 다릅니다 ` +
        `(${size.w}×${size.h} vs 기대 ${device.screen.w}×${device.screen.h}). 화면이 늘어나 보일 수 있습니다.`);
    }

    // 해상도: 프레임 렌더 폭보다 작으면 업스케일되어 뭉갠다
    const frameW = frameWidthFor(device, layout, device.canvas, { framed: cfg.theme.deviceFrame !== false });
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
  return sizeFromBuffer(fs.readFileSync(file));
}

export function sizeFromBuffer(buf) {
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

/** 끝맺음 마커를 찾는 범위. 마커 뒤에 패딩·트레일러를 붙이는 도구가 있어 마지막 바이트만 보면 오탐한다. */
const TAIL_WINDOW = 1024;

/**
 * 이미지 내용이 온전한지 검증한다.
 *
 * 확장자는 아무나 붙일 수 있다. 0바이트 파일, 전송 중 잘린 파일, 이름만 .png인 텍스트 파일이
 * 렌더를 그대로 통과해 찌그러진 결과물이 스토어에 올라가는 것보다 여기서 막는 편이 낫다.
 *
 * 문제가 있으면 이유를 담은 Error를 던진다.
 */
export function validateImage(buf) {
  if (buf.length === 0) throw new Error('파일이 비어 있습니다 (0바이트).');

  const isPNG = buf.length > 8 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a';
  const isJPEG = buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8;
  const isWebP = buf.length > 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';

  if (!isPNG && !isJPEG && !isWebP) {
    throw new Error('PNG/JPEG/WebP 형식이 아닙니다 (파일 내용이 이미지가 아님).');
  }

  // 잘린 파일은 헤더가 멀쩡해서 끝부분으로만 잡힌다
  const tail = buf.subarray(-TAIL_WINDOW);
  if (isPNG && tail.indexOf('IEND') === -1) {
    throw new Error('PNG가 손상되었거나 잘렸습니다 (IEND 청크 없음).');
  }
  if (isJPEG && tail.indexOf(Buffer.from([0xff, 0xd9])) === -1) {
    throw new Error('JPEG가 손상되었거나 잘렸습니다 (EOI 마커 없음).');
  }
  if (isWebP && buf.readUInt32LE(4) + 8 > buf.length) {
    throw new Error('WebP가 손상되었거나 잘렸습니다 (RIFF 크기 불일치).');
  }

  if (isWebP) return; // WebP 크기 파싱은 하지 않는다 — 형식·잘림 확인까지만
  const size = sizeFromBuffer(buf);
  if (!size?.w || !size?.h) throw new Error('이미지 크기를 읽을 수 없습니다 (헤더 손상).');
}

/** 경고를 사람이 읽는 형태로 출력한다. */
export function printWarnings(warnings) {
  if (!warnings.length) return;
  console.log(`\n  품질 점검 — ${warnings.length}건`);
  for (const w of warnings) {
    console.log(`    [${w.screen === null ? '전체' : `${w.screen}번`}] ${w.message}`);
  }
  console.log('');
}
