import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { scanOutput, scanFeatureGraphics, evaluate } from '../status.js';
import { planExport } from '../export.js';
import { printProblems } from './status.js';

/**
 * export 커맨드 — status와 같은 판정을 통과한 출력만 업로드용 폴더로 복사한다.
 * 에러가 하나라도 있으면 파일을 만들지 않고 종료 코드 1. 경고만으로는 멈추지 않는다.
 * _upload/는 appshot 소유라 매번 지우고 새로 만든다. fastlane 이미지 폴더는 기존 이미지가 있으면 --force를 요구하고,
 * --force여도 그 자리의 이미지 파일만 지운다(메타데이터 텍스트는 건드리지 않는다).
 */
const IMAGE_RE = /\.(png|jpe?g)$/i;

export async function run({ opts }) {
  const cwd = process.cwd();
  const cfg = loadConfig(cwd);
  const outRoot = path.resolve(cwd, cfg.output);
  const scan = scanOutput(outRoot);
  const featureGraphics = scanFeatureGraphics(outRoot);
  const result = evaluate(scan, cfg, { cwd, ipad: Boolean(opts.ipad), featureGraphics });
  const fastlane = Boolean(opts.fastlane);

  const problems = [...result.problems];
  const plan = result.ok ? planExport({ scan, featureGraphics, result, platform: cfg.platform, fastlane, outRoot, cwd }) : null;
  if (plan) problems.push(...plan.problems);

  const existing = plan && fastlane ? plan.targets.flatMap(existingImages) : [];
  if (existing.length && !opts.force) {
    const dirs = [...new Set(existing.map((f) => rel(cwd, path.dirname(f))))];
    problems.push({
      level: 'error', code: 'target-exists', locale: null, device: null, file: null,
      message: `fastlane 이미지 폴더에 기존 이미지가 ${existing.length}개 있습니다 (${dirs.join(', ')}) — 바꾸려면 --force`,
    });
  }

  const errors = problems.filter((p) => p.level === 'error').length;
  const warns = problems.filter((p) => p.level === 'warn').length;
  if (errors) return finish(opts, { ok: false, copied: [], problems }, () => {
    printProblems(problems);
    console.log(`\n  내보내기 중단 — 에러 ${errors}건${result.ok ? '' : " ('appshot status'로 확인)"}\n`);
  });

  if (fastlane) existing.forEach((f) => fs.unlinkSync(f));
  else fs.rmSync(plan.root, { recursive: true, force: true });
  for (const { from, to } of plan.copies) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  const copied = plan.copies.map(({ from, to }) => ({ from, to }));
  return finish(opts, { ok: true, copied, problems }, () => {
    printProblems(problems);
    console.log('');
    const groups = new Map();
    for (const c of plan.copies) {
      const key = `${c.locale}/${c.device}`;
      const g = groups.get(key) ?? { ...c, count: 0, dirs: new Set() };
      g.count++;
      g.dirs.add(rel(cwd, path.dirname(c.to)));
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      console.log(`  ${key} ${g.count}장 → ${[...g.dirs].join(', ')}${g.current ? '' : '  (현재 config 대상 아님)'}`);
    }
    console.log(`\n  업로드 폴더 준비 완료: ${rel(cwd, plan.root)} (${copied.length}장, 경고 ${warns}건)\n`);
  });
}

function finish(opts, payload, print) {
  if (opts.json) console.log(JSON.stringify(payload, null, 2));
  else print();
  return payload.ok ? 0 : 1;
}

/** 대상 자리에 이미 있는 이미지 파일. base가 있으면 그 이름(확장자 제외)만. */
function existingImages({ dir, base }) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => IMAGE_RE.test(name) && (!base || path.parse(name).name === base))
    .map((name) => path.join(dir, name));
}

const rel = (cwd, p) => path.relative(cwd, p) || '.';
