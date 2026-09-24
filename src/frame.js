/**
 * 디바이스 목업 프레임을 CSS로 생성한다.
 *
 * SVG 목업 에셋 대신 CSS를 쓰는 이유:
 *   1. 앱 화면을 프레임 안에 픽셀 정확히 앉히는 게 clipPath보다 단순하다
 *   2. 라이선스 문제가 없다 (Apple/삼성 목업 이미지는 재배포 제약이 있다)
 *   3. 새 기기 추가가 devices.js 데이터 한 덩어리로 끝난다
 *
 * devices.js의 frame 수치는 전부 "프레임 폭에 대한 비율"이므로
 * 여기서 W(픽셀)를 곱해 실제 치수로 바꾼다.
 */

/**
 * 소재별 색. 금속 밴드 단면을 실물 목업(shots.so의 iPhone/iPad)에서 픽셀로 재서 옮겼다.
 * 바깥에서 안쪽으로: edge(가장자리 선) → dark(바깥쪽 그늘) → mid(밴드 바탕) → light(안쪽 하이라이트)
 * → groove(유리와 만나는 홈) → glass(베젤).
 * 예전처럼 밴드를 대각선 그라디언트 한 장으로 칠하면 플라스틱 테두리처럼 보인다 — 실물은 둥근 금속
 * 단면이라 안쪽 가장자리에 가는 하이라이트가 서고 바로 안쪽이 어두운 홈이다.
 */
const MATERIALS = {
  titanium: { edge: '#1b1d27', dark: '#2f3546', mid: '#5d6479', light: '#c7cbe5', groove: '#0c101a', glass: '#000000' },
  aluminum: { edge: '#5f6166', dark: '#8e9198', mid: '#b9bcc3', light: '#f1f2f5', groove: '#34363a', glass: '#131313' },
  'matte-black': { edge: '#0b0b0c', dark: '#1d1d20', mid: '#34343a', light: '#83838c', groove: '#050505', glass: '#000000' },
};

/** 밴드 두께 기본값 (프레임 폭 대비). devices.js의 frame.band가 없을 때. */
const DEFAULT_BAND = 0.012;

/** 버튼이 본체 밖으로 튀어나오는 깊이 (프레임 폭 대비). 실물 목업 실측 0.7%. */
const BUTTON_DEPTH = 0.007;

/** 프레임 폭 W(px)에 대한 디바이스 목업 CSS. */
export function frameCSS(device, W) {
  const f = device.frame;
  const bezel = W * f.bezel;
  const band = W * (f.band ?? DEFAULT_BAND);
  const glass = Math.max(0, bezel - band);
  const chin = f.chin;
  const m = MATERIALS[f.material] ?? MATERIALS['matte-black'];

  // 홈버튼 세대는 위아래 베젤이 좌우보다 훨씬 두껍다
  const padTop = chin ? W * chin.top : bezel;
  const padBottom = chin ? W * chin.bottom : bezel;

  /*
   * 밴드는 .device 바탕(mid) + 안쪽 그림자(바깥 그늘·가장자리 선)로 칠하고,
   * 하이라이트·홈·유리는 .screen-clip 바깥 box-shadow 링으로 화면 둘레에 겹친다.
   * 링은 border-radius + spread를 따라가므로 모서리에서도 두께가 일정하다.
   * overflow: hidden은 자기 box-shadow를 자르지 않는다.
   * 홈버튼 세대(chin)는 위아래 유리 폭이 달라 링으로 표현할 수 없어 앞면 전체를 유리색으로 칠한다.
   */
  const rings = chin
    ? ''
    : `box-shadow:
    0 0 0 ${px(glass)} ${m.glass},
    0 0 0 ${px(glass + band * 0.14)} ${m.groove},
    0 0 ${px(band * 0.35)} ${px(glass + band * 0.3)} ${m.light};`;

  return `
.device {
  position: relative;
  width: ${px(W)};
  padding: ${chin ? `${px(padTop - band)} ${px(glass)} ${px(padBottom - band)}` : `${px(padTop)} ${px(bezel)} ${px(padBottom)}`};
  border-radius: ${px(W * f.radius)};
  background: ${chin ? m.glass : m.mid};
  ${chin ? `border: ${px(band)} solid ${m.mid};` : ''}
  --band: ${f.band ?? DEFAULT_BAND};
  box-shadow:
    inset 0 0 0 ${px(Math.max(1, W * 0.0012))} ${m.edge},
    inset 0 0 ${px(band * 0.9)} ${px(band * 0.15)} ${m.dark},
    ${shadowLayers(W)};
}

.screen-clip {
  position: relative;
  overflow: hidden;
  border-radius: ${px(W * f.innerRadius)};
  line-height: 0;
  background: #000;
  ${rings}
}

.screen {
  display: block;
  width: 100%;
  object-fit: cover;
}

/* 유리 반사. 실물 목업에는 거의 없다 — 세게 넣으면 화면이 뿌옇고 싸 보인다 */
.glare {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(118deg, rgba(255,255,255,.035) 0%, rgba(255,255,255,0) 30%);
}
${notchCSS(f.notch, W)}
${homeCSS(chin, W)}
${buttonsCSS(f.buttons, W, m)}
`.trim();
}

function notchCSS(notch, W) {
  if (!notch || notch.type === 'none') {
    return '\n.notch { display: none; }';
  }

  if (notch.type === 'dynamic-island') {
    const h = W * notch.h;
    return `
.notch {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: ${px(W * notch.top)};
  width: ${px(W * notch.w)};
  height: ${px(h)};
  border-radius: ${px(h / 2)};
  background: #000;
  z-index: 3;
}`;
  }

  // 노치 세대 — 화면 상단에 붙어 있고 아래 모서리만 둥글다
  if (notch.type === 'notch') {
    const h = W * notch.h;
    return `
.notch {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  width: ${px(W * notch.w)};
  height: ${px(h)};
  border-radius: 0 0 ${px(h * 0.45)} ${px(h * 0.45)};
  background: #000;
  z-index: 3;
}`;
  }

  if (notch.type === 'punch-hole') {
    const d = W * notch.d;
    return `
.notch {
  position: absolute;
  left: ${notch.x * 100}%;
  transform: translateX(-50%);
  top: ${px(W * notch.top)};
  width: ${px(d)};
  height: ${px(d)};
  border-radius: 50%;
  background: #000;
  z-index: 3;
}`;
  }

  return '\n.notch { display: none; }';
}

function homeCSS(chin, W) {
  if (!chin?.home) return '\n.home { display: none; }';
  const size = W * chin.homeSize;
  const bottomGap = (W * chin.bottom - size) / 2;
  return `
.home {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: ${px(bottomGap)};
  width: ${px(size)};
  height: ${px(size)};
  border-radius: 50%;
  background: linear-gradient(160deg, rgba(255,255,255,.10), rgba(0,0,0,.22));
  box-shadow: inset 0 0 0 ${px(W * 0.0035)} rgba(255,255,255,.22);
}`;
}

/**
 * 측면 버튼. 프레임 밖으로 살짝 나오는 이 디테일이 실루엣을 실물처럼 만든다.
 *
 * 버튼은 이름(아래 GEOM) 또는 기기별 객체 { side, top|start, len }로 준다.
 * top/start는 프레임 높이/폭 대비 시작 위치, len은 프레임 폭 대비 길이다.
 * 실물 목업에서 잰 값은 devices.js에 객체로 둔다 — 기기마다 위치가 달라 이름 하나로는 맞출 수 없다.
 * 색은 밴드와 같은 소재에, 튀어나온 방향으로 edge→mid→light→dark 그라디언트를 줘 둥근 단면을 흉내 낸다.
 * (반투명 검정이었을 때는 배경에 묻히거나 검은 덩어리로 보였다)
 */
const GEOM = {
  'power-right': { side: 'right', top: 0.255, len: 0.105 },
  'volume-right': { side: 'right', top: 0.150, len: 0.070 },
  'volume-left': { side: 'left', top: 0.195, len: 0.115 },
  'action-left': { side: 'left', top: 0.135, len: 0.042 },
  'power-top': { side: 'top', start: 0.14, len: 0.075 },
  'volume-top': { side: 'top', start: 0.26, len: 0.115 },
};

function buttonsCSS(buttons, W, m) {
  if (!buttons?.length) return '\n.btn { display: none; }';

  const depth = W * BUTTON_DEPTH;
  // 버튼의 안쪽 절반은 본체 뒤에 가려진다 — 하이라이트를 보이는 바깥 절반(0~50%) 안에 둔다
  const shade = (dir) =>
    `linear-gradient(${dir}, ${m.edge} 0%, ${m.mid} 14%, ${m.light} 30%, ${m.mid} 44%, ${m.dark} 50%)`;

  const rules = buttons
    .map((b, i) => {
      const g = typeof b === 'string' ? GEOM[b] : b;
      if (!g) return '';
      const cls = `.btn-${i}`;
      if (g.side === 'top') {
        return `${cls} {
  position: absolute;
  top: ${px(-depth)};
  left: ${g.start * 100}%;
  width: ${px(W * g.len)};
  height: ${px(depth * 2)};
  border-radius: ${px(depth)} ${px(depth)} 0 0;
  background: ${shade('to bottom')};
  z-index: -1;
}`;
      }
      const isLeft = g.side === 'left';
      return `${cls} {
  position: absolute;
  ${isLeft ? 'left' : 'right'}: ${px(-depth)};
  top: ${g.top * 100}%;
  width: ${px(depth * 2)};
  height: ${px(W * g.len)};
  border-radius: ${isLeft ? `${px(depth)} 0 0 ${px(depth)}` : `0 ${px(depth)} ${px(depth)} 0`};
  background: ${shade(isLeft ? 'to right' : 'to left')};
  z-index: -1;
}`;
    })
    .filter(Boolean);

  return `\n${rules.join('\n')}`;
}

/**
 * 접지(contact) / 주광(key) / 환경광(ambient) 3단 그림자 —
 * 한 겹짜리 그림자는 스티커처럼 보인다.
 */
function shadowLayers(W) {
  return `0 ${px(W * 0.012)} ${px(W * 0.028)} rgba(0,0,0,.22),
    0 ${px(W * 0.055)} ${px(W * 0.110)} rgba(0,0,0,.28),
    0 ${px(W * 0.160)} ${px(W * 0.300)} rgba(0,0,0,.20)`;
}

function shadowCSS(W) {
  return `box-shadow:\n    ${shadowLayers(W)};`;
}

/**
 * 프레임 없는 카드의 **기본** 모서리 반경 (카드 폭 대비).
 *
 * 폰 카드 기준이다 — 기기 화면 곡률보다 작게 둬서 폰처럼 보이지 않게 한다.
 * 데스크톱 창처럼 다른 값이 맞는 기기는 `frame.plainRadius`로 따로 준다.
 * (맥에 이 값을 그대로 쓰면 1843px 렌더에서 92px이 되어 실제 창보다 5배 둥글었다.)
 */
const PLAIN_RADIUS = 0.05;

/**
 * 기기 없이 앱 화면만 둥근 카드로 보여주는 CSS.
 *
 * Google Play는 폰 스크린샷에 기기 이미지를 피하라고 권장한다
 * ("can become obsolete quickly or alienate some users").
 * 클래스명을 .device로 유지해서 레이아웃 템플릿의 회전·겹침 규칙을 그대로 쓴다.
 *
 * **여기서 `border-radius`는 모양이 아니라 그림자 모양을 정한다.** 창 캡처는 이미
 * 자기 모서리가 파여 있고 그 바깥이 투명이라, 화면에 보이는 실루엣은 소스가 만든다.
 * 이 반경은 `.device`의 `box-shadow`가 따라가는 윤곽일 뿐이다.
 */
export function plainCSS(device, W) {
  const radius = px(W * (device.frame.plainRadius ?? PLAIN_RADIUS));
  return `
.device {
  position: relative;
  width: ${px(W)};
  border-radius: ${radius};
  ${shadowCSS(W)}
}

.screen-clip {
  position: relative;
  overflow: hidden;
  border-radius: ${radius};
  line-height: 0;
  /*
   * **배경을 칠하지 않는다.** 창 캡처(screencapture -o)는 모서리가 스퀘어클(연속 곡률)로
   * 파여 있고 그 바깥이 투명이다. 여기에 색을 깔면 그 투명 영역이 그 색으로 드러난다 —
   * 실제로 #000이었을 때 모서리에 검은 초승달이 생겼다.
   *
   * 원형 border-radius로 그 영역을 덮으려 하면 안 된다. 스퀘어클은 가장자리 쪽으로 더
   * 파고들어서(실측: 대각선 기준 반경 54.6px인데 맨 윗행은 72px부터 불투명) 다 덮으려면
   * 실제 곡률보다 훨씬 둥글게 잡아야 한다. 비워 두면 배경이 그대로 비쳐 그 문제가 없어진다.
   *
   * 기기 프레임(frameCSS)은 반대다 — 거기서는 화면 뒤가 검어야 하므로 #000을 유지한다.
   */
}

.screen {
  display: block;
  width: 100%;
  object-fit: cover;
}`.trim();
}

/**
 * 창 상단 바 높이와 모서리 반경 (창 폭 대비). macOS 타이틀바는 1200pt 창에서 약 28pt다.
 * 창 전체 높이는 "소스 비율 + TITLEBAR"이므로 크기 역산에도 이 값이 필요하다.
 */
export const WINDOW_TITLEBAR = 0.035;
const TITLEBAR = WINDOW_TITLEBAR;
const WINDOW_RADIUS = 0.012;

/**
 * macOS 앱 창 목업 — 신호등 버튼 + 상단 바 + 앱 화면.
 *
 * 화면 영역은 --screen-aspect(실제 소스 비율)를 따른다. 창 캡처는 비율이 제각각이라
 * 16:10으로 고정하면 창 가장자리가 잘리거나 좌우에 빈 띠가 생긴다.
 */
export function windowCSS(W) {
  const bar = W * TITLEBAR;
  const dot = bar * 0.3;
  const radius = px(W * WINDOW_RADIUS);
  return `
.device {
  position: relative;
  width: ${px(W)};
  border-radius: ${radius};
  overflow: hidden;
  background: #E8E8ED;
  ${shadowCSS(W)}
}

.titlebar {
  height: ${px(bar)};
  display: flex;
  align-items: center;
  gap: ${px(dot * 0.7)};
  padding-left: ${px(bar * 0.42)};
  background: linear-gradient(180deg, #F6F6F8, #E4E4E9);
  border-bottom: ${px(Math.max(1, W * 0.0006))} solid rgba(0, 0, 0, 0.12);
}

.dot {
  width: ${px(dot)};
  height: ${px(dot)};
  border-radius: 50%;
}

.dot-close { background: #FF5F57; }
.dot-min { background: #FEBC2E; }
.dot-max { background: #28C840; }

.screen-clip {
  position: relative;
  aspect-ratio: var(--screen-aspect, 16 / 10);
  overflow: hidden;
  line-height: 0;
  background: #000;
}

.screen {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}`.trim();
}

/** 창 목업 마크업. */
export function windowHTML(screenImgTag) {
  return `<div class="device device--window">
  <div class="titlebar">
    <span class="dot dot-close"></span><span class="dot dot-min"></span><span class="dot dot-max"></span>
  </div>
  <div class="screen-clip">
    ${screenImgTag}
  </div>
</div>`;
}

/** 프레임 없는 카드 마크업. */
export function plainHTML(screenImgTag) {
  return `<div class="device device--plain">
  <div class="screen-clip">
    ${screenImgTag}
  </div>
</div>`;
}

/** 프레임 마크업. img 태그 문자열을 받아 화면 자리에 넣는다. */
export function frameHTML(device, screenImgTag) {
  const f = device.frame;
  const buttons = (f.buttons ?? [])
    .map((b, i) => `<span class="btn btn-${i}" data-name="${typeof b === 'string' ? b : `${b.side}-${i}`}"></span>`)
    .join('');
  const home = f.chin?.home ? '<span class="home"></span>' : '';
  return `<div class="device">
  <div class="screen-clip">
    ${screenImgTag}
    <div class="notch"></div>
    <div class="glare"></div>
  </div>
  ${home}${buttons}
</div>`;
}

/** 소수점 3자리로 자른 px 문자열. 서브픽셀 값이 CSS에 그대로 흘러가지 않게. */
const px = (n) => `${Math.round(n * 1000) / 1000}px`;

export { MATERIALS };
