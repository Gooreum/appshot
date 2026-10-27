import path from 'node:path';
import { loadConfig } from '../config.js';
import { scanOutput, scanFeatureGraphics, evaluate } from '../status.js';

/**
 * status 커맨드 — 제출 전 점검. 읽기만 한다.
 * 에러가 하나라도 있으면 "제출 불가"와 종료 코드 1, 없으면 "제출 준비 완료"와 0.
 * 경고만으로는 실패하지 않는다. --json은 에이전트용 원본 결과.
 */
export async function run({ opts }) {
  const cwd = process.cwd();
  const cfg = loadConfig(cwd);
  const outRoot = path.resolve(cwd, cfg.output);
  const result = evaluate(scanOutput(outRoot), cfg, { cwd, ipad: Boolean(opts.ipad), featureGraphics: scanFeatureGraphics(outRoot) });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  console.log('');
  const locales = [...new Set([
    ...result.rows.map((r) => r.locale),
    ...result.problems.filter((p) => p.locale).map((p) => p.locale),
  ])];
  for (const locale of locales) {
    console.log(`  ${locale}`);
    const rows = result.rows.filter((r) => r.locale === locale);
    if (!rows.length) console.log('    (기기 폴더 없음)');
    for (const r of rows) {
      const mark = r.errors ? `✗ 에러 ${r.errors}건` : '✓';
      const note = r.current ? '' : '  (현재 config 대상 아님)';
      console.log(`    ${r.device.padEnd(20)} ${r.slot.padEnd(24)} ${r.canvas.padEnd(11)} ${String(r.count).padStart(2)}장  ${mark}${note}`);
    }
  }

  printProblems(result.problems);

  const errors = result.problems.filter((p) => p.level === 'error').length;
  const warns = result.problems.filter((p) => p.level === 'warn').length;
  console.log('');
  console.log(result.ok ? `  제출 준비 완료 (경고 ${warns}건)\n` : `  제출 불가 — 에러 ${errors}건, 경고 ${warns}건\n`);
  return result.ok ? 0 : 1;
}

const MARK = { error: '✗', warn: '!' };

/** 에러·경고 목록 출력(정보는 뺀다). export도 같은 형식으로 쓴다. */
export function printProblems(problems) {
  const shown = problems.filter((p) => p.level !== 'info');
  if (!shown.length) return;
  console.log('');
  for (const p of shown) {
    const where = [p.locale, p.device, p.file].filter(Boolean).join('/') || '전체';
    console.log(`  ${MARK[p.level]} [${where}] ${p.message}`);
  }
}
