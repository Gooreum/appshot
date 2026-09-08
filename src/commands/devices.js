import { DEVICES, PLATFORMS, listByPlatform, canvasLabel } from '../devices.js';

export async function run({ opts }) {
  const filter = opts.platform;

  if (filter && !Object.hasOwn(PLATFORMS, filter)) {
    console.error(`알 수 없는 플랫폼: '${filter}'`);
    console.error(`  사용 가능: ${Object.keys(PLATFORMS).join(', ')}`);
    return 1;
  }

  const platforms = filter ? [filter] : Object.keys(PLATFORMS);

  if (opts.json) {
    const rows = platforms.flatMap((p) =>
      listByPlatform(p).map(([id, d]) => ({
        id,
        label: d.label,
        platform: d.platform,
        storeSlot: d.storeSlot,
        required: d.required,
        canvas: d.canvas,
        screen: d.screen,
        notch: d.frame.notch.type,
        material: d.frame.material,
      })),
    );
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  console.log('');
  for (const p of platforms) {
    const { label, store } = PLATFORMS[p];
    console.log(`${label} — ${store}`);
    console.log('');
    for (const [id, d] of listByPlatform(p)) {
      const req = d.required ? ' [필수]' : '';
      console.log(`  ${id.padEnd(20)} ${d.label}`);
      console.log(`  ${' '.repeat(20)} ${canvasLabel(d).padEnd(12)} ${d.storeSlot}${req}`);
      console.log('');
    }
  }
  console.log('  [필수] = 스토어 제출 시 반드시 채워야 하는 슬롯');
  console.log("  사용:   appshot init --device <id>\n");
  return 0;
}
