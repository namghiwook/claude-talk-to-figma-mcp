/**
 * ★★ `convert_to_frame` 이 **자식의 «절대» 자리를 지키나**.
 *
 *   ⚠️⚠️ 2026-11-26 에 `ossp/tools/geometry-diff.mjs` 가 **첫 실행에** 잡았다:
 *     ⓐ 페이지 원점의 그룹 → 자식이 `(20,260) → (40,520)` **260.8px** 옮겨졌다
 *     ⓑ `(300,200)` 안의 그룹 → 자식이 `(340,230) → (380,260)` **50px**
 *   까닭: `appendChild` 는 `x`/`y` 를 **숫자 그대로** 두는데 그 수의 «뜻» 이 바뀐다.
 *   GROUP 의 자식 좌표는 **그룹의 부모 기준**, FRAME 의 자식은 **프레임 기준** 이다.
 *
 *   🚫 그런데 `STR-002` 소견은 **사라지고** 검사기는 **PASS** 였다 —
 *     「열쇠가 사라졌다」가 「좋아졌다」가 아닌 바로 그 꼴이다.
 *
 *   ★ 프레임 «자신» 은 안 틀어진다(의심했는데 **재서 거뒀다**). 그래서 그 단정도 둔다 —
 *     고치다가 프레임까지 옮기면 그게 새 결함이 된다.
 */
import * as fs from 'fs';
import * as path from 'path';

const CODE_PATH = path.resolve(process.cwd(), 'src/claude_mcp_plugin/code.js');
if (!fs.existsSync(CODE_PATH)) {
  throw new Error('플러그인 코드를 못 찾았다 — 시험이 «아무것도» 안 재게 된다: ' + CODE_PATH);
}
const CODE = fs.readFileSync(CODE_PATH, 'utf8');

function cut(name: string): string {
  const head = '\nasync function ' + name + '(';
  const i = CODE.indexOf(head);
  if (i < 0) throw new Error('떠낼 함수가 없다: ' + name);
  const j = CODE.indexOf('\n}\n', i);
  if (j < 0) throw new Error('0열에서 닫는 괄호를 못 찾았다: ' + name);
  return CODE.slice(i + 1, j + 2);
}

const SRC = ['getNodeByIdSafe', 'convertToFrame'].map(cut).join('\n\n');

type Fake = any;

/** 흉내 노드. ★ `x`/`y` 는 «부모 기준» 이고 `absoluteTransform` 이 절대 자리를 말한다 */
function node(id: string, name: string, type: string, x: number, y: number, w: number, h: number): Fake {
  const n: Fake = {
    id, name, type, x, y, width: w, height: h, children: [] as Fake[], parent: null,
    fills: [], strokes: [], strokeWeight: 1, effects: [], cornerRadius: 0,
    opacity: 1, rotation: 0, clipsContent: false,
    get absoluteTransform() {
      let ax = this.x, ay = this.y, p = this.parent;
      // ★ GROUP 은 좌표 공간을 «만들지 않는다» — 자식의 x/y 는 그룹의 부모 기준이다
      while (p && p.type !== 'PAGE') {
        if (p.type !== 'GROUP') { ax += p.x; ay += p.y; }
        p = p.parent;
      }
      return [[1, 0, ax], [0, 1, ay]];
    },
    resize(nw: number, nh: number) { this.width = nw; this.height = nh; },
    appendChild(c: Fake) {
      if (c.parent) c.parent.children = c.parent.children.filter((k: Fake) => k !== c);
      this.children.push(c); c.parent = this;          // ⚠️ x/y 는 «그대로» 둔다 — Figma 와 같다
    },
    insertChild(i: number, c: Fake) {
      if (c.parent) c.parent.children = c.parent.children.filter((k: Fake) => k !== c);
      this.children.splice(i, 0, c); c.parent = this;
    },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((k: Fake) => k !== this); this.parent = null; },
  };
  return n;
}

function abs(n: Fake) { const t = n.absoluteTransform; return [t[0][2], t[1][2]]; }

function build(groupLocalX: number, groupLocalY: number, boxX: number, boxY: number) {
  const page = node('page', 'Page', 'PAGE', 0, 0, 2000, 2000);
  const box = node('box', '속상자', 'FRAME', boxX, boxY, 400, 300);
  page.appendChild(box);
  // ★ GROUP 의 자식 x/y 는 «그룹의 부모(box)» 기준이다
  const a = node('a', '속-A', 'RECTANGLE', groupLocalX, groupLocalY, 80, 60);
  const b = node('b', '속-B', 'RECTANGLE', groupLocalX + 120, groupLocalY, 80, 60);
  const g = node('g', '속그룹', 'GROUP', groupLocalX, groupLocalY, 200, 60);
  box.appendChild(g);
  g.appendChild(a); g.appendChild(b);
  return { page, box, g, a, b };
}

function load(figma: Fake) {
  return new Function('figma', SRC
    + '\nreturn { convertToFrame: convertToFrame };')(figma);
}

function figmaFor(reg: Record<string, Fake>, page: Fake) {
  let made = 0;
  return {
    currentPage: page,
    getNodeByIdAsync: async (id: string) => reg[id] || null,
    createFrame: () => node('made' + made++, 'Frame', 'FRAME', 0, 0, 100, 100),
  } as Fake;
}

describe('convertToFrame — 자식의 «절대» 자리를 지킨다', () => {
  it('★★★★★ 부모가 «원점이 아닌» 그룹: 자식이 안 움직인다 (실측 50px 이 0 이 되어야 한다)', async () => {
    const f = build(40, 30, 300, 200);
    const before = [abs(f.a), abs(f.b)];
    expect(before[0]).toEqual([340, 230]);          // 흉내가 Figma 와 같은지 먼저 본다
    const api = load(figmaFor({ g: f.g }, f.page));
    const res = await api.convertToFrame({ nodeId: 'g' });
    expect(res.childCount).toBe(2);
    expect(abs(f.a)).toEqual(before[0]);            // ★ 이것이 결함이었다 → (380,260) 로 밀렸다
    expect(abs(f.b)).toEqual(before[1]);
  });

  it('★★★★ 페이지 원점의 그룹: 자식이 안 움직인다 (실측 260.8px 이 0 이 되어야 한다)', async () => {
    const f = build(20, 260, 0, 0);
    const before = [abs(f.a), abs(f.b)];
    expect(before[0]).toEqual([20, 260]);
    const api = load(figmaFor({ g: f.g }, f.page));
    await api.convertToFrame({ nodeId: 'g' });
    expect(abs(f.a)).toEqual(before[0]);
    expect(abs(f.b)).toEqual(before[1]);
  });

  it('★★★ 프레임 «자신» 은 그룹 자리에 그대로 선다 — 의심했는데 재서 거뒀다', async () => {
    const f = build(40, 30, 300, 200);
    const gAbs = abs(f.g);
    const api = load(figmaFor({ g: f.g }, f.page));
    const res = await api.convertToFrame({ nodeId: 'g' });
    const made = f.box.children.find((c: Fake) => c.id === res.id);
    expect(made).toBeTruthy();
    expect(abs(made)).toEqual(gAbs);
  });

  it('부모 안의 «순서» 를 지킨다 — 쌓임 순서가 바뀌면 화면이 달라진다', async () => {
    const f = build(40, 30, 300, 200);
    const before = node('before', '앞', 'RECTANGLE', 0, 0, 10, 10);
    f.box.insertChild(0, before);
    const api = load(figmaFor({ g: f.g }, f.page));
    const res = await api.convertToFrame({ nodeId: 'g' });
    expect(f.box.children.map((c: Fake) => c.id)).toEqual(['before', res.id]);
  });

  it('자식이 «없는» 그룹도 터지지 않는다', async () => {
    const page = node('page', 'Page', 'PAGE', 0, 0, 100, 100);
    const g = node('g', '빈그룹', 'GROUP', 10, 10, 0, 0);
    page.appendChild(g);
    const api = load(figmaFor({ g }, page));
    const res = await api.convertToFrame({ nodeId: 'g' });
    expect(res.childCount).toBe(0);
  });

  it('이미 FRAME 이면 전과 같이 던진다 — 고쳐도 옛 behaviour 를 안 깬다', async () => {
    const page = node('page', 'Page', 'PAGE', 0, 0, 100, 100);
    const fr = node('f', '프레임', 'FRAME', 0, 0, 10, 10);
    page.appendChild(fr);
    const api = load(figmaFor({ f: fr }, page));
    await expect(api.convertToFrame({ nodeId: 'f' })).rejects.toThrow(/already a FRAME/);
  });

  it('보정 «까닭» 이 주석에 있다 — 지우면 다음 사람이 되돌린다', () => {
    expect(CODE).toMatch(/absoluteTransform/);
    expect(CODE).toMatch(/숫자 그대로/);
  });
});
