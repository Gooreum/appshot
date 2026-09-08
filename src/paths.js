import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 하네스 격리의 핵심.
 * SKILL_ROOT — 템플릿·에셋 등 스킬이 소유한 리소스를 찾는 기준.
 *              실행 위치(cwd)와 무관하게 항상 이 저장소를 가리킨다.
 * projectRoot() — config를 읽고 결과물을 쓰는 기준. 항상 사용자의 cwd.
 */
export const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export const skillPath = (...seg) => path.join(SKILL_ROOT, ...seg);

export const projectRoot = () => process.cwd();

export const projectPath = (...seg) => path.resolve(projectRoot(), ...seg);
