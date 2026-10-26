import fs from 'node:fs';
import path from 'node:path';

/*
 * 자리표시자 표시 — 렌더 결과 PNG 옆에 "이 파일은 진짜가 아니다"를 남긴다.
 *
 * --placeholder는 없는 파일만 대체하므로 한 세트에 실제·가짜 장이 섞인다. 그래서 폴더가 아니라
 * 파일 단위로 기록한다: { version: 1, files: { "03.png": ["screen"] } }
 * 사유: screen(앱 화면 대체), background(배경 이미지 없이 그라디언트), font(브랜드 폰트 없이 시스템 폰트).
 * '.'으로 시작해 status의 unknown-entry 판정에 걸리지 않는다.
 */

export const PLACEHOLDER_MARKER = '.appshot-placeholder.json';
const RESULT_RE = /^(\d{2}\.png|feature-graphic\.png)$/;

/** { 파일명: 사유[] }. 표시가 없으면 {}, 깨졌으면 { '*': ['corrupt'] } — 판정은 안전한 쪽(전부 가짜)으로 한다. */
export function readMarker(dir) {
  const file = path.join(dir, PLACEHOLDER_MARKER);
  if (!fs.existsSync(file)) return {};
  try {
    const files = JSON.parse(fs.readFileSync(file, 'utf8'))?.files;
    if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('files 없음');
    return files;
  } catch {
    return { '*': ['corrupt'] };
  }
}

/** name의 사유를 기록한다. reasons가 비었거나 null이면 항목을 지우고, 남은 항목이 없으면 표시 파일을 지운다. */
export function markFile(dir, name, reasons) {
  const file = path.join(dir, PLACEHOLDER_MARKER);
  const files = readMarker(dir);
  if (files['*']) {
    // 깨진 표시는 폴더의 다른 결과물을 전부 가짜로 풀어 쓴다 — 지워 버리면 가짜가 진짜로 보인다
    delete files['*'];
    for (const other of fs.readdirSync(dir).filter((n) => RESULT_RE.test(n))) files[other] = ['corrupt'];
  }
  if (reasons?.length) files[name] = [...reasons];
  else delete files[name];
  if (Object.keys(files).length) fs.writeFileSync(file, `${JSON.stringify({ version: 1, files }, null, 2)}\n`);
  else fs.rmSync(file, { force: true });
}
