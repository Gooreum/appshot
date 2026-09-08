import { LAYOUTS } from '../layouts.js';

/** 레이아웃 선택을 눈으로 돕는 ASCII 미리보기. */
const PREVIEW = {
  'caption-top': [
    '┌──────────────┐',
    '│  헤드라인     │',
    '│  서브카피     │',
    '│  ╭────────╮  │',
    '│  │ 앱 화면 │  │',
    '└──┴────────┴──┘',
  ],
  'caption-bottom': [
    '┌──────────────┐',
    '┌──┬────────┬──┐',
    '│  │ 앱 화면 │  │',
    '│  ╰────────╯  │',
    '│  헤드라인     │',
    '└──────────────┘',
  ],
  angled: [
    '┌──────────────┐',
    '│   ╱▔▔▔▔╲     │',
    '│  │ 화면 │    │',
    '│   ╲____╱     │',
    '│  헤드라인     │',
    '└──────────────┘',
  ],
  fullbleed: [
    '┌──────────────┐',
    '│▓▓▓▓▓▓▓▓▓▓▓▓▓▓│',
    '│▓▓ 앱 화면 ▓▓▓│',
    '│░░░░░░░░░░░░░░│',
    '│  헤드라인     │',
    '└──────────────┘',
  ],
  duo: [
    '┌──────────────┐',
    '│  헤드라인     │',
    '│ ╭───╮        │',
    '│ │화1│╭───╮   │',
    '│ ╰───╯│화2│   │',
    '└──────┴───┴───┘',
  ],
};

export async function run({ opts }) {
  if (opts.json) {
    console.log(JSON.stringify(
      Object.entries(LAYOUTS).map(([id, l]) => ({ id, ...l })), null, 2,
    ));
    return 0;
  }

  console.log('\n레이아웃 5종 — 스크린마다 다르게 고를 수 있습니다\n');

  for (const [id, l] of Object.entries(LAYOUTS)) {
    const art = PREVIEW[id] ?? [];
    const head = `  ${id}`;
    console.log(`${head}  ·  ${l.label}${l.screens > 1 ? `  (화면 ${l.screens}장 필요)` : ''}`);
    console.log('');
    for (const line of art) console.log(`    ${line}`);
    console.log('');
    console.log(`    ${l.desc}`);
    console.log('');
  }

  console.log('  파노라마(배경이 여러 장에 걸쳐 이어지는 구성)는 레이아웃이 아니라');
  console.log('  배경 옵션입니다: theme.background.panorama = true\n');
  return 0;
}
