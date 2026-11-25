/**
 * ★★ `create_component_from_node` 의 «원자성» 과 `get_node_info` 의 `componentKey` 를
 *    Figma 없이 잰다. 둘 다 2026-11-25 에 ①→④ 를 실물로 돌려서 걸린 것이다.
 *
 *   ⓓ-3 전에는 조상을 안 봐서, 컴포넌트 «안» 의 노드를 컴포넌트화하면
 *     만들고 → 페이지에 붙이고 → `insertChild` 에서 터지고 → **되돌리지 않았다.**
 *     찌꺼기가 **원본의 지역 좌표(x10 y7.5)로 캔버스 원점에 얹혀** 실제 화면과 겹쳤다.
 *   ⓓ-2 `exportAsync({format:"JSON_REST_V1"})` 는 인스턴스에 `componentId` 만 싣는다.
 *     읽는 쪽은 `componentKey` 를 보므로 `figma-component-key` 관측이 **0건**이었다.
 *
 * ★ 이 시험의 핵심 단정은 **「무엇을 만들었나」를 센다** — 「터졌다」만 재면
 *   찌꺼기를 남기고 터지는 것과 구별되지 않는다.
 */
import * as fs from 'fs';
import * as path from 'path';

const CODE_PATH = path.resolve(process.cwd(), 'src/claude_mcp_plugin/code.js');
if (!fs.existsSync(CODE_PATH)) {
  throw new Error('플러그인 코드를 못 찾았다 — 시험이 «아무것도» 안 재게 된다: ' + CODE_PATH);
}
const CODE = fs.readFileSync(CODE_PATH, 'utf8');

/** 최상위 함수는 `}` 가 0열에서 닫힌다(안쪽 닫기는 늘 들여쓰여 있다) */
function cut(name: string): string {
  const head = '\nasync function ' + name + '(';
  const i = CODE.indexOf(head);
  if (i < 0) throw new Error('떠낼 함수가 없다: ' + name);
  const j = CODE.indexOf('\n}\n', i);
  if (j < 0) throw new Error('0열에서 닫는 괄호를 못 찾았다: ' + name);
  return CODE.slice(i + 1, j + 2);
}

const NAMES = ['getNodeByIdSafe', 'cttfFillComponentKeys', 'createComponentFromNode'];
const SRC = NAMES.map(cut).join('\n\n');

type Fake = any;

/** 흉내 Figma. ★ 「무엇을 만들었나」를 세려고 createComponent 호출을 기록한다 */
function makeFigma(registry: Record<string, Fake>) {
  const made: Fake[] = [];
  const figma: Fake = {
    mixed: Symbol('mixed'),
    getNodeByIdAsync: async (id: string) => registry[id] || null,
    createComponent: () => {
      const c: Fake = {
        id: 'made' + made.length, name: 'Component', type: 'COMPONENT', key: 'k' + made.length,
        x: 0, y: 0, width: 0, height: 0, children: [], removed: false,
        resize(w: number, h: number) { this.width = w; this.height = h; },
        appendChild(n: Fake) { this.children.push(n); n.parent = this; },
        remove() { this.removed = true; },
      };
      made.push(c);
      return c;
    },
    currentPage: { id: 'page', type: 'PAGE', children: [] as Fake[], appendChild(n: Fake) { this.children.push(n); } },
  };
  return { figma, made };
}

function build(name: string, type: string, children: Fake[] = []): Fake {
  const n: Fake = {
    id: 'n_' + name, name, type, children, x: 10, y: 7.5, width: 26, height: 17,
    clone() { return build(name + '_clone', type); },
    remove() { this.removed = true; },
    insertChild(i: number, c: Fake) { this.children.splice(i, 0, c); c.parent = this; },
    appendChild(c: Fake) { this.children.push(c); c.parent = this; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
  };
  for (const c of children) c.parent = n;
  return n;
}

function load(figma: Fake) {
  return new Function('figma', SRC
    + '\nreturn { getNodeByIdSafe: getNodeByIdSafe, cttfFillComponentKeys: cttfFillComponentKeys,'
    + ' createComponentFromNode: createComponentFromNode };')(figma);
}

// ── ⓓ-3 원자성 ────────────────────────────────────────────────────────────
describe('createComponentFromNode — 조상 검사 (찌꺼기 방지)', () => {
  it('★★★ 조상이 COMPONENT 면 던지고 **아무것도 만들지 않는다**', async () => {
    const txt = build('label', 'TEXT');
    const comp = build('바깥', 'COMPONENT', [txt]);
    const page = build('Screens', 'PAGE', [comp]);
    const { figma, made } = makeFigma({ [txt.id]: txt });
    const api = load(figma);

    await expect(api.createComponentFromNode({ nodeId: txt.id })).rejects.toThrow(/COMPONENT/);
    expect(made).toHaveLength(0);      // ★ 이것이 핵심 — 「터졌다」만으로는 모자라다
    expect(txt.removed).toBeUndefined();
    expect(page.children).toHaveLength(1);
  });

  it('★★ 던지는 말에 «찌꺼기 없음» 이 들어 있다 — 부른 쪽이 치울 필요가 없다고 알아야 한다', async () => {
    const txt = build('label', 'TEXT');
    build('바깥', 'COMPONENT', [txt]);
    const { figma } = makeFigma({ [txt.id]: txt });
    const api = load(figma);
    await expect(api.createComponentFromNode({ nodeId: txt.id })).rejects.toThrow(/찌꺼기 없음/);
  });

  it('조상이 INSTANCE 여도 막는다 — 인스턴스 안도 컴포넌트를 못 넣는다', async () => {
    const txt = build('label', 'TEXT');
    build('어떤 인스턴스', 'INSTANCE', [txt]);
    const { figma, made } = makeFigma({ [txt.id]: txt });
    const api = load(figma);
    await expect(api.createComponentFromNode({ nodeId: txt.id })).rejects.toThrow();
    expect(made).toHaveLength(0);
  });

  it('조상이 COMPONENT_SET 이어도 막는다', async () => {
    const txt = build('label', 'TEXT');
    build('세트', 'COMPONENT_SET', [txt]);
    const { figma, made } = makeFigma({ [txt.id]: txt });
    const api = load(figma);
    await expect(api.createComponentFromNode({ nodeId: txt.id })).rejects.toThrow();
    expect(made).toHaveLength(0);
  });

  it('조상이 평범한 FRAME 이면 «막지 않는다» — 검사가 과하면 쓸 수 없어진다', async () => {
    const txt = build('label', 'TEXT');
    build('btn_submit', 'FRAME', [txt]);
    const { figma, made } = makeFigma({ [txt.id]: txt });
    const api = load(figma);
    const res = await api.createComponentFromNode({ nodeId: txt.id, name: '라벨' });
    expect(made).toHaveLength(1);       // 만들었다
    expect(res.name).toBe('라벨');
    expect(txt.removed).toBe(true);     // 성공한 «뒤에» 원본을 지운다
  });

  it('★★★ insertChild 가 터지면 만든 컴포넌트를 «거둔다»', async () => {
    const txt = build('label', 'TEXT');
    const parent = build('btn', 'FRAME', [txt]);
    parent.insertChild = () => { throw new Error('모르는 실패'); };
    const { figma, made } = makeFigma({ [txt.id]: txt });
    const api = load(figma);
    await expect(api.createComponentFromNode({ nodeId: txt.id })).rejects.toThrow('모르는 실패');
    expect(made).toHaveLength(1);
    expect(made[0].removed).toBe(true); // ★ 남기지 않는다
    expect(txt.removed).toBeUndefined(); // ★ 원본은 살아 있다 — 마지막 보험
  });

  it('없는 노드는 전과 같이 던진다 — 검사를 더해도 옛 behaviour 를 안 깬다', async () => {
    const { figma } = makeFigma({});
    const api = load(figma);
    await expect(api.createComponentFromNode({ nodeId: '9:9' })).rejects.toThrow(/Node not found/);
  });
});

// ── ⓓ-2 componentKey ─────────────────────────────────────────────────────
describe('cttfFillComponentKeys — INSTANCE 에 열쇠를 채운다', () => {
  const docWith = (ids: string[]) => ({
    id: 'root', type: 'FRAME',
    children: ids.map((cid, i) => ({ id: 'i' + i, type: 'INSTANCE', componentId: cid, children: [] })),
  });

  it('★★★ INSTANCE 에 componentKey 를 채운다', async () => {
    const { figma } = makeFigma({ 'c1': { id: 'c1', key: 'KEY1' } });
    const api = load(figma);
    const doc: any = docWith(['c1']);
    await api.cttfFillComponentKeys(doc);
    expect(doc.children[0].componentKey).toBe('KEY1');
  });

  it('★★ 같은 componentId 는 «한 번만» 푼다 — 인스턴스 300개라도 컴포넌트는 몇 개다', async () => {
    let calls = 0;
    const { figma } = makeFigma({});
    figma.getNodeByIdAsync = async (id: string) => { calls++; return { id, key: 'K_' + id }; };
    const api = load(figma);
    const doc: any = docWith(['c1', 'c1', 'c1', 'c2']);
    await api.cttfFillComponentKeys(doc);
    expect(calls).toBe(2);
    expect(doc.children.map((c: any) => c.componentKey)).toEqual(['K_c1', 'K_c1', 'K_c1', 'K_c2']);
  });

  it('★★★ 못 풀면 칸을 «안 만든다» — null 을 넣으면 「열쇠가 없다」로 읽힌다(§1-③)', async () => {
    const { figma } = makeFigma({});   // 아무것도 안 풀린다
    const api = load(figma);
    const doc: any = docWith(['c1']);
    await api.cttfFillComponentKeys(doc);
    expect('componentKey' in doc.children[0]).toBe(false);
  });

  it('푸는 중 터져도 나머지는 채운다', async () => {
    const { figma } = makeFigma({});
    figma.getNodeByIdAsync = async (id: string) => {
      if (id === 'bad') throw new Error('못 읽는다');
      return { id, key: 'K_' + id };
    };
    const api = load(figma);
    const doc: any = docWith(['bad', 'c2']);
    await api.cttfFillComponentKeys(doc);
    expect('componentKey' in doc.children[0]).toBe(false);
    expect(doc.children[1].componentKey).toBe('K_c2');
  });

  it('INSTANCE 가 없으면 «한 번도 묻지 않는다» — 모든 읽기에 얹히는 길이다', async () => {
    let calls = 0;
    const { figma } = makeFigma({});
    figma.getNodeByIdAsync = async () => { calls++; return null; };
    const api = load(figma);
    await api.cttfFillComponentKeys({ id: 'r', type: 'FRAME', children: [{ id: 'a', type: 'TEXT' }] });
    expect(calls).toBe(0);
  });

  it('깊이 박힌 INSTANCE 도 찾는다', async () => {
    const { figma } = makeFigma({ 'c9': { id: 'c9', key: 'DEEP' } });
    const api = load(figma);
    const doc: any = { id: 'r', type: 'FRAME', children: [
      { id: 'a', type: 'FRAME', children: [
        { id: 'b', type: 'FRAME', children: [{ id: 'i', type: 'INSTANCE', componentId: 'c9', children: [] }] },
      ] },
    ] };
    await api.cttfFillComponentKeys(doc);
    expect(doc.children[0].children[0].children[0].componentKey).toBe('DEEP');
  });

  it('getNodeInfo 가 그 함수를 «부른다» — 만들어 놓고 안 부르면 아무 일도 안 난다', () => {
    expect(CODE).toContain('await cttfFillComponentKeys(response.document)');
  });
});
