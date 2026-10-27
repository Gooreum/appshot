import path from 'node:path';
import { chromium } from 'playwright';
import { CONFIG_NAME, loadConfig } from '../config.js';
import { renderAll, renderFeatureGraphic } from '../render.js';
import { PLATFORMS, canvasLabel, getDevice } from '../devices.js';
import { printWarnings } from '../quality.js';
import { listCombos, defaultCombo, expandConfig } from '../expand.js';
import { OVERVIEW_FILE } from '../overview.js';
import { watchTargets, createWatcher, createRunner } from '../watch.js';

/**
 * render 커맨드.
 * config에 devices/locales 배열이 있으면 --all로 모든 조합을 순회한다. 조합마다 expandConfig로
 * 단일 config를 만들어 기존 renderAll을 그대로 호출한다. 한 조합이 실패해도 나머지는 계속 렌더하고
 * 끝에 실패를 모아 보여준 뒤 exit 1로 끝낸다. --all이 없으면 기본 조합 하나만 렌더한다.
 * Play면 스크린샷 뒤에 렌더한 로케일마다 피처 그래픽을 1장씩 만든다(기기와 무관).
 */
export async function run({ opts }) {
  if (opts.watch) return runWatch(opts);
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
        const tag = r.placeholder.length ? '  (자리표시자 — 제출용 아님)' : '';
        console.log(`  ${path.basename(r.file)}  ${r.canvas.w}×${r.canvas.h}  ${locale}  ${kb(r.bytes)}  — ${path.relative(cwd, r.file)}${tag}`);
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

/**
 * render --watch — config와 참조 파일이 바뀔 때마다 기본 조합을 프리뷰로 다시 렌더한다.
 * 출력은 항상 _preview/ 아래라 제출용 원본은 건드리지 않는다. 브라우저는 한 번만 띄워 재사용하고,
 * 렌더 실패(JSON 깨짐·파일 없음·프레임 게이트)는 출력만 하고 감시를 유지한다 — 다음 저장 때 다시 시도한다.
 * 시작 config가 없거나 깨졌으면 감시할 기준이 없으므로 그대로 던진다(exit 1).
 * Ctrl+C·SIGTERM이 올 때까지 resolve되지 않는다.
 */
async function runWatch(opts) {
  if (opts.all) throw new Error('--watch는 --all과 함께 쓸 수 없습니다. 기본 조합 하나만 감시합니다.');
  const cwd = process.cwd();
  const startCfg = loadConfig(cwd); // 시작 config가 깨졌으면 여기서 exit 1
  const only = Array.isArray(opts.only) ? opts.only : null;

  let browser = null;
  let stopping = false;
  const getBrowser = async () => {
    if (browser?.isConnected()) return browser;
    // 종료 신호는 아래 stop이 처리한다 — Playwright 기본 핸들러는 정리 전에 exit(130)으로 끝내 버린다
    const b = await chromium.launch({ handleSIGINT: false, handleSIGTERM: false });
    // Chromium이 죽으면 다음 렌더 때 다시 띄운다
    b.on('disconnected', () => { if (browser === b) browser = null; });
    browser = b;
    return b;
  };

  let watcher = null;
  let targets = [];
  const runner = createRunner((reasons) => renderOnce(reasons), { debounceMs: 200 });
  const watch = (files) => {
    if (JSON.stringify(files) === JSON.stringify(targets)) return;
    watcher?.close();
    targets = files;
    watcher = createWatcher(files, (file) => runner.trigger(path.relative(cwd, file) || file));
  };

  let first = true;
  async function renderOnce(reasons) {
    const started = Date.now();
    const initial = first;
    first = false;
    const head = initial ? '' : `[${clock()}] ${reasons.join(', ')} 변경 → `;
    const warnings = [];
    try {
      const cfg = loadConfig(cwd);
      const { config, warnings: expandWarnings } = expandConfig(cfg, defaultCombo(cfg));
      warnings.push(...expandWarnings);
      // 렌더가 실패해도 대상 목록은 갱신한다 — 없는 source로 고친 뒤 그 파일을 넣으면 그것도 잡혀야 한다
      watch(watchTargets(config, cwd));

      const r = await renderAll(config, {
        preview: true,
        only,
        placeholder: Boolean(opts.placeholder),
        allowCrop: Boolean(opts.allowCrop),
        overview: !opts.noOverview,
        cwd,
        browser: await getBrowser(),
        onWarnings: (ws) => warnings.push(...ws),
        // 장별 크기 줄은 첫 렌더에서만 보여준다. 이후에는 요약 한 줄과 경고만
        onProgress: initial ? (p) => console.log(`  ${path.basename(p.file)}  ${p.layout.padEnd(15)} ${kb(p.bytes)}`) : undefined,
      });
      // 피처 그래픽 — 일반 render와 같이 --only일 때는 건너뛴다
      const fg = PLATFORMS[cfg.platform]?.featureGraphic && cfg.featureGraphic && !only
        ? await renderFeatureGraphic(config, { preview: true, placeholder: Boolean(opts.placeholder), cwd, browser: await getBrowser() })
        : null;
      if (stopping) return;

      if (initial) {
        printWarnings(warnings);
        if (fg) console.log(`  ${path.basename(fg.file)}  ${fg.canvas.w}×${fg.canvas.h}  ${kb(fg.bytes)}  — ${path.relative(cwd, fg.file)}`);
        printSummary(r, config, cwd, true);
      } else {
        const tag = r.placeholders.length ? ' — 자리표시자 포함' : '';
        console.log(`${head}프리뷰 ${r.results.length}장${fg ? ' + 피처 그래픽' : ''} 다시 렌더 (${secs(started)})${tag}`);
        if (warnings.length) printWarnings(warnings);
        else console.log('');
      }
    } catch (err) {
      if (stopping) return; // 종료 중 브라우저를 닫아 생긴 예외는 무시한다
      console.error(`${initial ? '\n' : ''}${head}✗ ${err.message}`);
      // 프레임 게이트 실패도 그 전에 모인 경고는 보여준다
      if (warnings.length) printWarnings(warnings);
      else console.error('');
    } finally {
      if (initial && !stopping) printWatchBanner(targets, watcher, cwd, opts);
    }
  }

  // 첫 렌더가 config를 다시 읽다 실패해도 감시는 걸려 있어야 한다
  watch(watchTargets(expandConfig(startCfg, defaultCombo(startCfg)).config, cwd));
  runner.trigger('start');
  return new Promise((resolve) => {
    const stop = async () => {
      if (stopping) {
        // 정리 중 두 번째 Ctrl+C — 브라우저만 닫아 보고 바로 끝낸다
        browser?.close().catch(() => {});
        process.exit(130);
      }
      stopping = true;
      watcher?.close();
      runner.close();
      await Promise.race([runner.idle(), new Promise((r) => setTimeout(r, 3000).unref())]);
      await browser?.close().catch(() => {});
      console.log("\n  감시를 종료했습니다. 제출용 원본은 'appshot render'로 뽑으세요.\n");
      resolve(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

function printWatchBanner(targets, watcher, cwd, opts) {
  const others = Math.max(targets.length - 1, 0);
  console.log(`  감시 중 — ${CONFIG_NAME}${others ? ` 외 ${others}개 파일` : ''} (Ctrl+C로 종료)`);
  for (const dir of watcher?.skipped ?? []) console.log(`  감시 제외: ${path.relative(cwd, dir) || dir}/ (폴더 없음)`);
  try {
    const cfg = loadConfig(cwd);
    const { locale, device } = defaultCombo(cfg);
    const dir = path.join(cfg.output, '_preview', locale, device);
    console.log(`  미리보기: ${opts.noOverview ? `${dir}/` : path.join(dir, OVERVIEW_FILE)}\n`);
  } catch {
    console.log('');
  }
}

const clock = () => new Date().toTimeString().slice(0, 8);
const secs = (since) => `${((Date.now() - since) / 1000).toFixed(1)}s`;

function printSummary({ results, outDir, canvas, device, overview, placeholders }, cfg, cwd, preview) {
  const spec = `${canvas.w}×${canvas.h}`;
  console.log('');
  console.log(`  ${results.length}장 생성 — ${path.relative(cwd, outDir) || outDir}`);
  if (overview) console.log(`  개요 시트 — ${path.relative(cwd, overview)} (제출용 아님)`);
  if (placeholders.length) {
    const nums = placeholders.map((p) => String(p.index).padStart(2, '0')).join(', ');
    console.log(`  ⚠ 자리표시자 ${placeholders.length}장(${nums}) — 제출용 아님. 실제 화면·에셋을 넣고 'appshot render'로 재렌더하세요`);
  }
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
