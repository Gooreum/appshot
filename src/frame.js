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

const MATERIALS = {
  titanium:
    'linear-gradient(145deg,#9A9AA0 0%,#3A3A3C 38%,#7C7C82 52%,#2C2C2E 68%,#6E6E73 100%)',
  aluminum:
    'linear-gradient(145deg,#EDEDF2 0%,#9A9AA0 40%,#D6D6DC 55%,#7C7C82 72%,#C9C9CF 100%)',
  'matte-black':
    'linear-gradient(145deg,#48484A 0%,#1C1C1E 42%,#3A3A3C 58%,#141416 78%,#2C2C2E 100%)',
};

/** 프레임 폭 W(px)에 대한 디바이스 목업 CSS. */
export function frameCSS(device, W) {
  const f = device.frame;
  const bezel = W * f.bezel;
  const chin = f.chin;

  // 홈버튼 세대는 위아래 베젤이 좌우보다 훨씬 두껍다
  const padTop = chin ? W * chin.top : bezel;
  const padBottom = chin ? W * chin.bottom : bezel;

  const material = MATERIALS[f.material] ?? MATERIALS['matte-black'];

  return `
.device {
  position: relative;
  width: ${px(W)};
  padding: ${px(padTop)} ${px(bezel)} ${px(padBottom)};
  border-radius: ${px(W * f.radius)};
  background: ${material};
  ${shadowCSS(W)}
}

/* 프레임 안쪽 미세한 하이라이트 — 금속 테두리의 광택 */
.device::before {
  content: '';
  position: absolute;
  inset: ${px(W * 0.0016)};
  border-radius: ${px(W * f.radius - W * 0.0016)};
  background: linear-gradient(145deg, rgba(255,255,255,.28), rgba(255,255,255,0) 26%,
              rgba(255,255,255,0) 74%, rgba(255,255,255,.14));
  pointer-events: none;
}

.screen-clip {
  position: relative;
  overflow: hidden;
  border-radius: ${px(W * f.innerRadius)};
  line-height: 0;
  background: #000;
}

.screen {
  display: block;
  width: 100%;
  object-fit: cover;
}

/* 유리 반사 — 대각선 하이라이트. 4%를 넘기면 화면 내용이 탁해진다 */
.glare {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(118deg,
    rgba(255,255,255,.10) 0%,
    rgba(255,255,255,0) 34%,
    rgba(255,255,255,0) 66%,
    rgba(255,255,255,.045) 100%);
}
${notchCSS(f.notch, W)}
${homeCSS(chin, W)}
${buttonsCSS(f.buttons, W, f.radius)}
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

/** 측면 버튼. 프레임 밖으로 살짝 나오는 이 디테일이 실루엣을 실물처럼 만든다. */
function buttonsCSS(buttons, W, radius) {
  if (!buttons?.length) return '\n.btn { display: none; }';

  const depth = W * 0.0055;
  const geom = {
    'power-right': { side: 'right', top: 0.255, len: 0.105 },
    'volume-right': { side: 'right', top: 0.150, len: 0.070 },
    'volume-left': { side: 'left', top: 0.195, len: 0.115 },
    'action-left': { side: 'left', top: 0.135, len: 0.042 },
    'power-top': { side: 'top', start: 0.14, len: 0.075 },
    'volume-top': { side: 'top', start: 0.26, len: 0.115 },
  };

  const rules = buttons
    .map((name, i) => {
      const g = geom[name];
      if (!g) return '';
      const cls = `.btn-${name}`;
      if (g.side === 'top') {
        return `${cls} {
  position: absolute;
  top: ${px(-depth)};
  left: ${g.start * 100}%;
  width: ${px(W * g.len)};
  height: ${px(depth * 2)};
  border-radius: ${px(depth)} ${px(depth)} 0 0;
  background: linear-gradient(180deg, rgba(0,0,0,.35), rgba(255,255,255,.10));
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
  background: linear-gradient(${isLeft ? '270deg' : '90deg'}, rgba(0,0,0,.35), rgba(255,255,255,.10));
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
function shadowCSS(W) {
  return `box-shadow:
    0 ${px(W * 0.012)} ${px(W * 0.028)} rgba(0,0,0,.22),
    0 ${px(W * 0.055)} ${px(W * 0.110)} rgba(0,0,0,.28),
    0 ${px(W * 0.160)} ${px(W * 0.300)} rgba(0,0,0,.20);`;
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
 * **반경을 0에 가깝게 두지 않는다.** 창 캡처(`screencapture -o`)는 모서리가 이미 둥글고
 * 그 바깥이 투명인데 `.screen-clip` 배경이 검정이라, CSS 반경이 소스 자체 반경보다
 * 작으면 모서리에 검은 삼각형이 드러난다.
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
  background: #000;
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
  const buttons = (f.buttons ?? []).map((b) => `<span class="btn btn-${b}"></span>`).join('');
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
