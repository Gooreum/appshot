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
  /* 접지(contact) / 주광(key) / 환경광(ambient) 3단 그림자 —
     한 겹짜리 그림자는 스티커처럼 보인다 */
  box-shadow:
    0 ${px(W * 0.012)} ${px(W * 0.028)} rgba(0,0,0,.22),
    0 ${px(W * 0.055)} ${px(W * 0.110)} rgba(0,0,0,.28),
    0 ${px(W * 0.160)} ${px(W * 0.300)} rgba(0,0,0,.20);
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
