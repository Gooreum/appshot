import path from 'node:path';
import { loadConfig } from '../config.js';
import { renderAll, renderFeatureGraphic } from '../render.js';
import { PLATFORMS, canvasLabel, getDevice } from '../devices.js';
import { printWarnings } from '../quality.js';
import { listCombos, defaultCombo, expandConfig } from '../expand.js';

/**
 * render 커맨드.
 * config에 devices/locales 배열이 있으면 --all로 모든 조합을 순회한다. 조합마다 expandConfig로
 * 단일 config를 만들어 기존 renderAll을 그대로 호출한다. 한 조합이 실패해도 나머지는 계속 렌더하고
 * 끝에 실패를 모아 보여준 뒤 exit 1로 끝낸다. --all이 없으면 기본 조합 하나만 렌더한다.
 * Play면 스크린샷 뒤에 렌더한 로케일마다 피처 그래픽을 1장씩 만든다(기기와 무관).
 */
export async function run({ opts }) {
  const cwd = process.cwd();
  const cfg = loadConfig(cwd);
  const only = Array.isArray(opts.only) ? opts.only : null;
  const preview = Boolean(opts.preview);
  const all = listCombos(cfg);
  const combos = opts.all ? all : [defaultCombo(cfg)];
  const multi = combos.length > 1;
  const failures = [];
  const done = [];

  for (const combo of combos) {
    const label = `${combo.locale} / ${combo.device}`;
    const { config, warnings: expandWarnings } = expandConfig(cfg, combo);
    console.log(multi ? `\n  ▸ ${label} (${canvasLabel(getDevice(combo.device))})` : '');
    let printed = false;
    try {
      const r = await renderAll(config, {
        preview,
        only,
        placeholder: Boolean(opts.placeholder),
        allowCrop: Boolean(opts.allowCrop),
        overview: !opts.noOverview,
        cwd,
        // 펼치기 경고(번역 누락 등)는 렌더 경고와 한 블록으로 보여준다
        onWarnings: (ws) => { printed = true; printWarnings([...expandWarnings, ...ws], multi ? label : undefined); },
        onProgress: (p) => console.log(`  ${path.basename(p.file)}  ${p.layout.padEnd(15)} ${kb(p.bytes)}`),
      });
      if (!printed && expandWarnings.length) printWarnings(expandWarnings, multi ? label : undefined);
      done.push({ label, ...r });
      printSummary(r, config, cwd, preview);
    } catch (err) {
      if (!multi) throw err; // 단일 조합은 기존처럼 그대로 던진다
      failures.push({ label, message: err.message });
      console.error(`  ✗ ${label}: ${err.message}`);
    }
  }

  // 피처 그래픽 — --only는 특정 장만 고치는 옵션이라 건너뛴다
  const featureDone = [];
  if (PLATFORMS[cfg.platform]?.featureGraphic && !only) {
    if (!cfg.featureGraphic) {
      console.log('  피처 그래픽은 Play 필수입니다 — config에 featureGraphic을 추가하세요.\n');
    }
    for (const locale of cfg.featureGraphic ? [...new Set(combos.map((c) => c.locale))] : []) {
      const label = `${locale} / feature-graphic`;
      const { config, warnings } = expandConfig(cfg, combos.find((c) => c.locale === locale));
      // 장별 경고는 위 조합 렌더에서 이미 보였다. 배경·폰트 경고도 같은 테마라 다시 찍지 않는다
      const own = warnings.filter((w) => w.screen === null);
      if (own.length) printWarnings(own, label);
      try {
        const r = await renderFeatureGraphic(config, { preview, placeholder: Boolean(opts.placeholder), cwd });
        featureDone.push(label);
        console.log(`  ${path.basename(r.file)}  ${r.canvas.w}×${r.canvas.h}  ${locale}  ${kb(r.bytes)}  — ${path.relative(cwd, r.file)}`);
      } catch (err) {
        if (!multi) throw err;
        failures.push({ label, message: err.message });
        console.error(`  ✗ ${label}: ${err.message}`);
      }
    }
    if (featureDone.length) console.log('');
  }

  if (multi) {
    console.log(`\n  ${combos.length}개 조합 중 ${done.length}개 성공 — ${cfg.output}`);
    for (const d of done) console.log(`    ${d.label.replace(' / ', '/').padEnd(32)} ${d.results.length}장`);
    for (const label of featureDone) console.log(`    ${label.replace(' / ', '/').padEnd(32)} 1장`);
    if (failures.length) {
      console.log(`\n  실패 ${failures.length}건:`);
      for (const f of failures) console.log(`    ${f.label} — ${f.message.split('\n')[0]}`);
      console.log('');
      return 1;
    }
    console.log('');
  } else if (all.length > 1) {
    console.log(`  나머지 ${all.length - 1}개 조합은 --all로 렌더하세요.\n`);
  }
  return 0;
}

function printSummary({ results, outDir, canvas, device, overview }, cfg, cwd, preview) {
  const spec = `${canvas.w}×${canvas.h}`;
  console.log('');
  console.log(`  ${results.length}장 생성 — ${path.relative(cwd, outDir) || outDir}`);
  if (overview) console.log(`  개요 시트 — ${path.relative(cwd, overview)} (제출용 아님)`);
  if (preview) {
    const submitDir = path.join(cfg.output, cfg.locale, cfg.device);
    console.log(`  프리뷰 해상도 ${spec} (제출 규격은 ${canvasLabel(device)})`);
    console.log(`  확인이 끝나면 'appshot render'로 제출용 원본을 뽑으세요 (${submitDir}).\n`);
  } else {
    console.log(`  제출 규격 ${spec} — ${device.storeSlot}`);
    console.log("  업로드 전 'appshot status'로 전체 폴더를 점검하세요.\n");
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
