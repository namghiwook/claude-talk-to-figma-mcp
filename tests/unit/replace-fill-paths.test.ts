/**
 * ★★ `replace_with_instance` 의 «색 짝짓기» 를 Figma 없이 잰다.
 *
 * 왜 파일로 남기나 — 2026-11-25 에 ds-test 에서 **바탕색이 안 세어지는 결함**이 나왔다.
 * 그 전에도 「색 견주기 13개를 돌려 봤다」고 적었지만 **파일로 남기지 않았다.**
 * ⇒ 아무도 다시 돌리지 않았고, 결함은 실물에서 사람이 눈으로 찾을 때까지 살아 있었다.
 *   「돌려 봤다」는 **한 번뿐이고, 파일로 남긴 시험만 다시 돌아간다.**
 *
 * 떠내기(`cut`)가 실패하면 **시험이 터진다.** 조용히 0개를 시험하면
 * 「없다」와 「안 봤다」가 같은 글자가 되기 때문이다.
 */
import * as fs from 'fs';
import * as path from 'path';

const CODE_PATH = path.resolve(process.cwd(), 'src/claude_mcp_plugin/code.js');

if (!fs.existsSync(CODE_PATH)) {
  throw new Error('플러그인 코드를 못 찾았다 — 시험이 «아무것도» 안 재게 된다: ' + CODE_PATH);
}
const CODE = fs.readFileSync(CODE_PATH, 'utf8');

/**
 * 플러그인 코드는 최상위에서 `figma.*` 를 부르므로 통째로 못 불러온다.
 * ⇒ 함수를 «글자» 로 떠서 세운다. 이 파일의 최상위 함수는 모두 `}` 가 0열에서 닫힌다
 *   (안쪽 닫기는 늘 들여쓰여 있다) — 그 성질에 기댄다.
 */
function cut(name: string): string {
  const head = '\nfunction ' + name + '(';
  const i = CODE.indexOf(head);
  if (i < 0) throw new Error('떠낼 함수가 없다: ' + name);
  const j = CODE.indexOf('\n}\n', i);
  if (j < 0) throw new Error('0열에서 닫는 괄호를 못 찾았다: ' + name);
  return CODE.slice(i + 1, j + 2);
}

const NAMES = ['cttfCollectAll', 'cttfSamePaints', 'cttfCollectTexts', 'cttfPlanReplace'];
const SRC = NAMES.map(cut).join('\n\n');

const FIGMA_MIXED = Symbol('figma.mixed');
const built = new Function(
  'figma',
  SRC + '\nreturn { cttfCollectAll: cttfCollectAll, cttfSamePaints: cttfSamePaints,'
  + ' cttfCollectTexts: cttfCollectTexts, cttfPlanReplace: cttfPlanReplace };'
)({ mixed: FIGMA_MIXED });

const { cttfCollectAll, cttfSamePaints, cttfPlanReplace } = built;

// ── 흉내 노드 ───────────────────────────────────────────────────────────────
let seq = 0;
type Fake = any;

function solid(r: number, g: number, b: number) {
  return [{ type: 'SOLID', visible: true, opacity: 1, color: { r, g, b } }];
}

function box(name: string, fills: any, children: Fake[] = [], type = 'FRAME'): Fake {
  return {
    id: 'n' + ++seq, name, type, fills, children,
    x: 0, y: 0, width: 10, height: 10, visible: true, locked: false,
    constraints: { horizontal: 'MIN', vertical: 'MIN' },
  };
}

/** TEXT 는 `children` 을 **아예 두지 않는다** — `'children' in node` 가 거짓이어야 한다 */
function txt(name: string, chars: string, fills: any): Fake {
  return { id: 'n' + ++seq, name, type: 'TEXT', fills, characters: chars,
    x: 0, y: 0, width: 10, height: 10, visible: true, locked: false };
}

function onPage(node: Fake, parentType = 'PAGE'): Fake {
  node.parent = { id: 'p1', name: 'Screens', type: parentType, children: [node] };
  return node;
}

const 초록 = solid(0, 0.784, 0.325);
const 파랑 = solid(0.084, 0.396, 0.753);
const 바탕 = solid(0.97, 0.976, 0.984);
const 빨강 = solid(0.776, 0.157, 0.157);
const 검정 = solid(0.055, 0.102, 0.133);
const 흰색 = solid(1, 1, 1);

/** 컴포넌트 쪽 (뿌리 type 이 COMPONENT 다 — 결함의 뿌리였다) */
function badgeComponent(): Fake {
  return box('Badge', 바탕, [
    txt('label', '알림', 검정),
    box('badge-indicator', 빨강, [txt('count', '3', 흰색)]),
  ], 'COMPONENT');
}

/** 자리 쪽. 레이어 이름이 컴포넌트와 **다르다** — 실무에서 흔하다 */
function siteFrame(rootFill: any, indicatorFill: any, name = '알림 배지'): Fake {
  return onPage(box(name, rootFill, [
    txt('label', '알림', 검정),
    box('badge-indicator', indicatorFill, [txt('count', '3', 흰색)]),
  ]));
}

// ── ① 경로 ─────────────────────────────────────────────────────────────────
describe('cttfCollectAll — 경로', () => {
  it('뿌리 경로는 «빈 문자열» 이고 isRoot 다', () => {
    const all = cttfCollectAll(badgeComponent());
    expect(all[0].path).toBe('');
    expect(all[0].isRoot).toBe(true);
  });

  it('뿌리 경로는 «레이어 이름에 안 기댄다» — 이름이 달라도 같은 경로다', () => {
    const a = cttfCollectAll(box('Badge', 바탕))[0];
    const b = cttfCollectAll(box('알림 배지', 바탕))[0];
    expect(a.path).toBe(b.path);
    expect(a.path).toBe('');
  });

  it('자식은 이름으로, 손자는 «부모/자식» 으로 적는다', () => {
    const paths = cttfCollectAll(badgeComponent()).map((e: any) => e.path);
    expect(paths).toEqual(['', 'label', 'badge-indicator', 'badge-indicator/count']);
  });

  it('자식 경로는 뿌리의 «빈 문자열» 과 겹치지 않는다', () => {
    const all = cttfCollectAll(badgeComponent());
    const empties = all.filter((e: any) => e.path === '');
    expect(empties).toHaveLength(1);
    expect(empties[0].isRoot).toBe(true);
    expect(all.slice(1).every((e: any) => e.isRoot === false)).toBe(true);
  });

  it('이름이 빈 노드는 type 으로 대신 적는다', () => {
    const 이름없음 = box('', 바탕);
    이름없음.name = '';
    const all = cttfCollectAll(box('부모', 바탕, [이름없음]));
    expect(all.map((e: any) => e.path)).toEqual(['', 'FRAME']);
  });
});

// ── ② paint 견주기 ─────────────────────────────────────────────────────────
describe('cttfSamePaints', () => {
  it('같은 solid 는 같다', () => expect(cttfSamePaints(solid(1, 0, 0), solid(1, 0, 0))).toBe(true));
  it('다른 solid 는 다르다', () => expect(cttfSamePaints(solid(1, 0, 0), solid(0, 1, 0))).toBe(false));
  it('수가 다르면 다르다', () => expect(cttfSamePaints(solid(1, 0, 0), [])).toBe(false));
  it('그라디언트는 «같다고 단정하지 않는다»', () => {
    const g = [{ type: 'GRADIENT_LINEAR', visible: true, opacity: 1 }];
    expect(cttfSamePaints(g, g.slice())).toBe(false);
  });
  it('figma.mixed 는 저쪽도 mixed 일 때만 같다', () => {
    expect(cttfSamePaints(FIGMA_MIXED, FIGMA_MIXED)).toBe(true);
    expect(cttfSamePaints(FIGMA_MIXED, solid(1, 0, 0))).toBe(false);
  });
  it('opacity 만 달라도 다르다', () => {
    const a = solid(1, 0, 0); const b = solid(1, 0, 0); b[0].opacity = 0.5;
    expect(cttfSamePaints(a, b)).toBe(false);
  });
});

// ── ③ 되돌이 — 2026-11-25 에 실물에서 걸린 그 결함 ─────────────────────────
describe('cttfPlanReplace — 색 세기 (되돌이 방지)', () => {
  it('★ 바탕색과 손자색을 바꾸면 «색다름 2» 다 — 전에는 1 이라고 했다', () => {
    const plan = cttfPlanReplace(siteFrame(초록, 파랑), badgeComponent());
    expect(plan.fillDiffs.length).toBe(2);
    expect(plan.fillDiffs.map((d: any) => d.label).sort()).toEqual(['(뿌리)', 'badge-indicator']);
  });

  it('★ 뿌리는 FRAME 이고 컴포넌트는 COMPONENT 인데 «짝 못찾음» 이 아니다', () => {
    const plan = cttfPlanReplace(siteFrame(초록, 파랑), badgeComponent());
    expect(plan.fillUnmatched).toEqual([]);
  });

  it('바탕색만 바꿔도 센다 — 가장 흔히 덮어쓰는 칸이다', () => {
    const plan = cttfPlanReplace(siteFrame(초록, 빨강), badgeComponent());
    expect(plan.fillDiffs.map((d: any) => d.label)).toEqual(['(뿌리)']);
    expect(plan.fillUnmatched).toEqual([]);
  });

  it('색을 하나도 안 바꾼 복사본은 «색다름 0 · 짝 못찾음 0» 이다', () => {
    const plan = cttfPlanReplace(siteFrame(바탕, 빨강, 'Badge'), badgeComponent());
    expect(plan.fillDiffs).toEqual([]);
    expect(plan.fillUnmatched).toEqual([]);
  });

  it('이름이 달라도 바탕색 짝은 찾는다 — 뿌리는 이름으로 안 맞춘다', () => {
    const plan = cttfPlanReplace(siteFrame(바탕, 빨강, '전혀 다른 이름'), badgeComponent());
    expect(plan.fillDiffs).toEqual([]);
    expect(plan.fillUnmatched).toEqual([]);
  });

  it('자식은 «타입을 계속 견준다» — TEXT 의 색을 FRAME 에 칠하면 안 된다', () => {
    const comp = box('Badge', 바탕, [box('label', 초록)], 'COMPONENT');  // label 이 FRAME
    const site = onPage(box('Badge', 바탕, [txt('label', '알림', 검정)])); // label 이 TEXT
    const plan = cttfPlanReplace(site, comp);
    expect(plan.fillUnmatched).toEqual(['label']);
    expect(plan.fillDiffs).toEqual([]);
  });

  it('컴포넌트에 없는 칸은 «짝 못찾음» 으로 세고 색다름에 안 넣는다', () => {
    const site = onPage(box('Badge', 바탕, [txt('label', '알림', 검정), box('군더더기', 초록)]));
    const plan = cttfPlanReplace(site, badgeComponent());
    expect(plan.fillUnmatched).toEqual(['군더더기']);
    expect(plan.fillDiffs).toEqual([]);
  });

  it('GROUP 부모면 경고한다 — 경계가 자식에서 파생된다', () => {
    const plan = cttfPlanReplace(siteFrame(바탕, 빨강, 'Badge'), badgeComponent());
    expect(plan.warnings).toEqual([]);
    const g = cttfPlanReplace(onPage(box('Badge', 바탕, [txt('label', '알림', 검정)]), 'GROUP'),
      box('Badge', 바탕, [txt('label', '알림', 검정)], 'COMPONENT'));
    expect(g.warnings.join(' ')).toContain('GROUP');
  });
});

// ── ④ 낸 값에 «경로» 가 실려 있나 ──────────────────────────────────────────
describe('낸 값 — 수만 내면 사람이 판단할 수 없다', () => {
  it('fillDiffPaths · fillUnmatchedPaths 를 자리마다 낸다', () => {
    expect(CODE).toContain('fillDiffPaths:');
    expect(CODE).toContain('fillUnmatchedPaths:');
  });

  it('fillPathsUnmatched 는 «수» 다 — 배열을 그대로 내보내지 않는다', () => {
    expect(CODE).toContain('fillPathsUnmatched: plan.fillUnmatched.length');
  });
});
