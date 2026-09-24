/**
 * 프레임 게이트 — 렌더된 PNG가 실제로 "기기처럼" 보이는지 픽셀로 측정한다.
 *
 * deviceFrame: true는 "프레임을 그려라"는 스위치일 뿐, 결과가 기기로 읽히는지는 보장하지 않는다.
 * 실제로 베젤 전체를 금속색으로 칠해 회색 테두리 카드처럼 보이거나, 버튼이 배경에 묻히거나,
 * Dynamic Island가 두 겹으로 찍힌 결과가 경고 하나 없이 통과했다.
 * 그래서 경고가 아니라 **에러**다 — 통과하지 못한 장은 파일로 남기지 않는다.
 *
 * 측정은 CSS 값이 아니라 최종 PNG 픽셀에서 한다. CSS를 읽으면 "내가 쓴 값을 내가 확인"하는
 * 동어반복이 되어, 이번처럼 값은 맞는데 눈에 안 보이는 경우를 잡지 못한다.
 */
import { BAND } from './frame.js';

/** 게이트 실패 코드별 사람이 읽을 설명. */
const MESSAGES = {
  'device-crop': (d) =>
    `기기가 캔버스 밖으로 ${d.pct}% 잘렸습니다. 기기 전체가 보이는 레이아웃(caption-bottom·angled)을 쓰거나, ` +
    `잘린 구성이 의도라면 theme.allowDeviceCrop: true 또는 --allow-crop으로 허용하세요.`,
  'no-glass-bezel': () =>
    '화면 둘레에 검은 유리 베젤이 보이지 않습니다. 금속 테두리만 있으면 기기가 아니라 테두리 두른 카드로 보입니다.',
  'frame-blends': (d) =>
    `기기 테두리가 배경과 거의 같은 색입니다 (색 차이 ${d.dist} < ${d.min}). 배경 색이나 기기 소재를 바꾸세요.`,
  'button-invisible': (d) =>
    `측면 버튼(${d.name})이 배경에 묻혀 보이지 않습니다 (색 차이 ${d.dist} < ${d.min}).`,
  'double-island': () =>
    '앱 화면에 이미 Dynamic Island가 찍혀 있는데 프레임이 섬을 하나 더 그렸습니다 — 섬이 두 겹으로 보입니다.',
};

const CROP_TOLERANCE = 0.01; // 그림자·안티앨리어싱 오차
const BLEND_MIN = 40; // RGB 유클리드 거리. 파랑 그라디언트 위 티타늄이 ~90
const BUTTON_MIN = 28;
const MIN_BUTTON_DEPTH_PX = 3; // 프리뷰처럼 버튼이 3px 미만이면 샘플링이 안티앨리어싱에 먹힌다

/**
 * 한 장을 검사한다. page에는 방금 캡처한 HTML이 그대로 떠 있어야 한다.
 * @returns {Promise<Array<{code: string, detail: object}>>} 비어 있으면 통과
 */
export async function checkFrame(page, png, { allowCrop = false } = {}) {
  const b64 = png.toString('base64');
  return page.evaluate(
    async ({ b64, allowCrop, BAND, CROP_TOLERANCE, BLEND_MIN, BUTTON_MIN, MIN_BUTTON_DEPTH_PX }) => {
      const shot = new Image();
      shot.src = `data:image/png;base64,${b64}`;
      await shot.decode();
      const cv = document.createElement('canvas');
      cv.width = shot.width;
      cv.height = shot.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(shot, 0, 0);
      const all = ctx.getImageData(0, 0, cv.width, cv.height).data; // 한 번만 읽는다

      const pixel = (p) => {
        if (!p) return null;
        const x = Math.round(p.x), y = Math.round(p.y);
        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return null;
        const i = (y * cv.width + x) * 4;
        return [all[i], all[i + 1], all[i + 2]];
      };
      const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      const isDark = (c) => c && Math.max(...c) < 40;

      // 기기 로컬 좌표(회전 전) → 화면 좌표. 기준점 3개를 꽂아 브라우저가 계산한 transform을
      // 아핀 변환으로 복원한다 — 점마다 기준점을 꽂으면 섬 스캔처럼 수만 번 샘플할 때 너무 느리다
      const probeAt = (el, lx, ly) => {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;left:${lx}px;top:${ly}px;width:0;height:0;`;
        el.appendChild(probe);
        const r = probe.getBoundingClientRect();
        probe.remove();
        return { x: r.left, y: r.top };
      };
      const mapperFor = (el) => {
        const o = probeAt(el, 0, 0), x = probeAt(el, 100, 0), y = probeAt(el, 0, 100);
        return (lx, ly) => ({
          x: o.x + ((x.x - o.x) * lx + (y.x - o.x) * ly) / 100,
          y: o.y + ((x.y - o.y) * lx + (y.y - o.y) * ly) / 100,
        });
      };

      const failures = [];
      const fail = (code, detail = {}) => failures.push({ code, detail });

      // 가림 판정 — duo처럼 기기가 겹치면 뒤 기기의 샘플 지점이 앞 기기 위에 떨어진다.
      // owner가 기대와 다른 점은 버린다 (기기 위 점은 그 기기, 배경 점은 어떤 기기도 아니어야 한다)
      const owner = (p) => document.elementFromPoint(p.x, p.y)?.closest('.device') ?? null;
      const on = (dev, p) => (p && owner(p) === dev ? p : null);
      const off = (p) => (p && owner(p) === null ? p : null);

      for (const dev of document.querySelectorAll('.device')) {
        // 1) 잘림 — 모든 목업(창·카드 포함)에 적용
        const r = dev.getBoundingClientRect();
        const visW = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
        const visH = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
        const cut = 1 - (visW * visH) / (r.width * r.height);
        if (!allowCrop && cut > CROP_TOLERANCE) fail('device-crop', { pct: Math.round(cut * 100) });

        // 나머지는 실물 기기 프레임에만 해당한다
        if (dev.classList.contains('device--plain') || dev.classList.contains('device--window')) continue;

        const map = mapperFor(dev);
        const at = (_el, lx, ly) => map(lx, ly);
        const W = dev.offsetWidth, H = dev.offsetHeight;
        const clip = dev.querySelector('.screen-clip');
        const cl = clip.offsetLeft, ct = clip.offsetTop;
        const band = W * BAND;
        const hasHome = !!dev.querySelector('.home');

        // 2) 검은 유리 베젤 — 금속 밴드와 화면 사이 중간 지점 (홈버튼 세대는 앞면이 유리 링이 아니라 제외)
        if (!hasHome) {
          const gx = (band + cl) / 2, gy = (band + ct) / 2;
          const pts = [
            at(dev, gx, H / 2), at(dev, W - gx, H / 2),
            at(dev, W * 0.3, gy), at(dev, W * 0.3, H - gy),
          ].map((p) => pixel(on(dev, p))).filter(Boolean);
          if (pts.length && !pts.every(isDark)) fail('no-glass-bezel');
        }

        // 3) 금속 밴드가 배경과 구분되는가 — 좌우 중앙에서 밴드 vs 바깥 배경
        const out = Math.max(W * 0.04, 12);
        let blend = null;
        for (const [bx, ox] of [[band / 2, -out], [W - band / 2, W + out]]) {
          const b = pixel(on(dev, at(dev, bx, H / 2))), o = pixel(off(at(dev, ox, H / 2)));
          if (b && o) blend = Math.max(blend ?? 0, dist(b, o));
        }
        if (blend !== null && blend < BLEND_MIN) fail('frame-blends', { dist: blend, min: BLEND_MIN });

        // 4) 버튼 — 프레임 밖으로 튀어나온 부분 vs 그 바깥 배경
        for (const btn of dev.querySelectorAll('.btn')) {
          if (getComputedStyle(btn).display === 'none') continue;
          const bw = btn.offsetWidth, bh = btn.offsetHeight, bl = btn.offsetLeft, bt = btn.offsetTop;
          const isTop = bh < bw;
          const depth = (isTop ? bh : bw) / 2;
          if (depth < MIN_BUTTON_DEPTH_PX) continue;
          let p, o;
          if (isTop) {
            p = at(dev, bl + bw / 2, bt + bh * 0.25);
            o = at(dev, bl + bw / 2, bt - depth * 3);
          } else if (bl < 0) {
            p = at(dev, bl + bw * 0.25, bt + bh / 2);
            o = at(dev, bl - depth * 3, bt + bh / 2);
          } else {
            p = at(dev, bl + bw * 0.75, bt + bh / 2);
            o = at(dev, bl + bw + depth * 3, bt + bh / 2);
          }
          const pc = pixel(on(dev, p)), oc = pixel(off(o));
          if (pc && oc && dist(pc, oc) < BUTTON_MIN) {
            const name = [...btn.classList].find((c) => c.startsWith('btn-'))?.slice(4) ?? 'button';
            fail('button-invisible', { name, dist: dist(pc, oc), min: BUTTON_MIN });
          }
        }

        // 5) 섬 중복 — 화면 상단 중앙의 검은 덩어리 너비를 행마다 잰다.
        // 섬 하나(알약)는 너비가 위에서부터 단조롭게 커져 최대에 닿는다. 두 겹이면 작은 섬 너비에서
        // 평평하게 머물다가 큰 섬에서 다시 커진다 — 그 "중간 평지"를 찾는다.
        const cw = clip.offsetWidth, ch = clip.offsetHeight;
        const cx = cl + cw / 2;
        const widths = [];
        const islandVisible = !!on(dev, at(dev, cx, ct + ch * 0.03));
        for (let ly = 0; islandVisible && ly < ch * 0.07; ly++) {
          if (!isDark(pixel(at(dev, cx, ct + ly)))) {
            if (widths.length) break; // 덩어리 끝
            continue;
          }
          let w = 0;
          for (const dir of [-1, 1]) {
            for (let dx = 1; dx < cw * 0.3; dx++) {
              if (!isDark(pixel(at(dev, cx + dir * dx, ct + ly)))) break;
              w++;
            }
          }
          widths.push(w + 1);
        }
        if (widths.length >= 6) {
          const max = Math.max(...widths);
          const reach = widths.findIndex((w) => w >= max * 0.9);
          let flat = 0, plateau = false;
          for (let i = 1; i < reach; i++) {
            flat = Math.abs(widths[i] - widths[i - 1]) <= max * 0.015 && widths[i] < max * 0.7 ? flat + 1 : 0;
            if (flat >= 4) plateau = true;
          }
          if (plateau) fail('double-island');
        }
      }

      return failures;
    },
    { b64, allowCrop, BAND, CROP_TOLERANCE, BLEND_MIN, BUTTON_MIN, MIN_BUTTON_DEPTH_PX },
  );
}

/** 게이트 실패를 사람이 읽을 한 줄로. */
export function describeFailure({ code, detail }) {
  return MESSAGES[code]?.(detail) ?? code;
}

/** 게이트에 실패한 장들을 모아 던지는 에러. */
export class FrameGateError extends Error {
  constructor(failed) {
    const lines = failed.flatMap(({ index, failures }) =>
      [...new Set(failures.map(describeFailure))].map((m) => `  ${String(index).padStart(2, '0')}.png — ${m}`),
    );
    super(
      `프레임 게이트 실패 — ${failed.length}장이 기기처럼 보이지 않아 저장하지 않았습니다.\n${lines.join('\n')}`,
    );
    this.failed = failed;
  }
}
