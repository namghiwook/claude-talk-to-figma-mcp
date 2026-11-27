/**
 * ★★ `/status` 가 「지금 «살아 있는» 채널」을 내주나.
 *
 *   ⚠️⚠️ 2026-11-27 에 잰 것: 9.7일 띄워 둔 서버에 `curl /status` 를 하니
 *     `channels: [7l8f72xr, aunrwhsy, 76lehors]` — **셋 다 이미 죽은 채널**이었고
 *     `pluginCount: 0` 이었다. 「어느 채널로 보내면 되나」를 알 길이 없었다.
 *   ⇒ 사이클마다 사람이 Figma UI 에서 채널 ID 를 읽어 줘야 했다. **우리 빈칸이었다.**
 *
 * ★ 이 시험의 핵심 단정은 셋이다:
 *     ① 빈 채널을 «걷어낸다» — 안 걷으면 죽은 채널이 산 것처럼 보인다
 *     ② 플러그인이 붙은 채널만 `ready` — 에이전트만 있는 채널에 보내면 응답이 없다
 *     ③ 보낼 채널이 «여럿»이면 `readyChannel` 은 **null** (§1-③)
 *        — 하나 골라 주면 부른 쪽이 「정해졌다」고 읽고 **엉뚱한 Figma 파일을 고친다**
 */
import * as fs from 'fs';
import * as path from 'path';
import { liveChannels, summarizeLive } from '../../src/socket-status';

type C = { id: string };

/** 채널 지도를 만든다. `roles` 로 각 클라이언트의 역할을 정한다 */
function build(spec: Record<string, Array<'plugin' | 'agent' | 'unknown'>>) {
  const channels = new Map<string, Set<C>>();
  const pluginClients = new Set<C>();
  const agentClients = new Set<C>();
  let n = 0;
  for (const [name, roles] of Object.entries(spec)) {
    const set = new Set<C>();
    for (const role of roles) {
      const c: C = { id: 'c' + n++ };
      set.add(c);
      if (role === 'plugin') pluginClients.add(c);
      else if (role === 'agent') agentClients.add(c);
    }
    channels.set(name, set);
  }
  return { channels, pluginClients, agentClients };
}

describe('liveChannels — 죽은 채널을 산 것처럼 보이게 하지 않는다', () => {
  it('★★★ 빈 채널은 «안» 내보낸다 — 이게 바로 그 결함이었다', () => {
    const { channels, pluginClients, agentClients } = build({
      '7l8f72xr': [], 'aunrwhsy': [], '76lehors': [], 'live1': ['plugin'],
    });
    const out = liveChannels(channels, pluginClients, agentClients);
    expect(out.map((c) => c.channel)).toEqual(['live1']);
  });

  it('★★★ 플러그인이 붙은 채널만 ready — 에이전트만 있으면 응답할 사람이 없다', () => {
    const { channels, pluginClients, agentClients } = build({
      'onlyAgent': ['agent'], 'both': ['agent', 'plugin'],
    });
    const out = liveChannels(channels, pluginClients, agentClients);
    const byName = Object.fromEntries(out.map((c) => [c.channel, c]));
    expect(byName['onlyAgent'].ready).toBe(false);
    expect(byName['both'].ready).toBe(true);
  });

  it('역할을 센다 — 어느 쪽도 아닌 클라이언트는 clients 에만 든다', () => {
    const { channels, pluginClients, agentClients } = build({
      'ch': ['plugin', 'agent', 'agent', 'unknown'],
    });
    const [c] = liveChannels(channels, pluginClients, agentClients);
    expect(c.clients).toBe(4);
    expect(c.plugins).toBe(1);
    expect(c.agents).toBe(2);
  });

  it('순서가 «늘 같다» — ready 먼저 · 붐비는 것 먼저 · 그다음 이름', () => {
    const { channels, pluginClients, agentClients } = build({
      'zz': ['plugin'], 'aa': ['plugin'], 'busy': ['plugin', 'agent'], 'dead': ['agent'],
    });
    const out = liveChannels(channels, pluginClients, agentClients).map((c) => c.channel);
    expect(out).toEqual(['busy', 'aa', 'zz', 'dead']);
  });

  it('★★★ «막 접속한» 플러그인도 ready 여야 한다 — 분류는 «행동 기반»이다', () => {
    // classifyClient: 플러그인은 「답」을 한 번 보닌 «뒤»에야 pluginClients 에 들다.
    // 그러나 processQueue 는 그전에도 「에이전트가 아닌 클라이언트」에게 보낸다(부트스트랩).
    // ★ plugins > 0 으로 재면 「사용자가 플러그인을 막 열었을 때」에 「보낼 채널 없음」이 나온다.
    const { channels, pluginClients, agentClients } = build({ 'fresh': ['unknown'] });
    const [c] = liveChannels(channels, pluginClients, agentClients);
    expect(c.plugins).toBe(0);        // 아직 분류 안 됐다
    expect(c.candidates).toBe(1);     // 그래도 명령은 이 클라이언트에게 간다
    expect(c.ready).toBe(true);       // ★ 이게 핵심
  });

  it('★★ candidates 는 「에이전트가 아닌」 수 — socket.ts 의 전달 규칙과 같은 셈', () => {
    const { channels, pluginClients, agentClients } = build({
      'ch': ['agent', 'agent', 'plugin', 'unknown'],
    });
    const [c] = liveChannels(channels, pluginClients, agentClients);
    expect(c.agents).toBe(2);
    expect(c.candidates).toBe(2);     // plugin 1 + unknown 1
    expect(c.ready).toBe(true);
  });

  it('에이전트만 있는 채널은 ready 가 아니다 — 답할 사람이 없다', () => {
    const { channels, pluginClients, agentClients } = build({ 'solo': ['agent', 'agent'] });
    const [c] = liveChannels(channels, pluginClients, agentClients);
    expect(c.candidates).toBe(0);
    expect(c.ready).toBe(false);
  });

  it('채널이 하나도 없으면 빈 배열 — 터지지 않는다', () => {
    expect(liveChannels(new Map(), new Set(), new Set())).toEqual([]);
  });
});

describe('summarizeLive — 「보낼 채널」을 «내가» 정하지 않는다', () => {
  it('★★★ 보낼 채널이 둘이면 readyChannel 은 null — 골라 주면 엉뚱한 파일을 고친다(§1-③)', () => {
    const { channels, pluginClients, agentClients } = build({
      'a': ['plugin'], 'b': ['plugin'],
    });
    const s = summarizeLive(channels, pluginClients, agentClients);
    expect(s.readyCount).toBe(2);
    expect(s.readyChannel).toBeNull();
  });

  it('★★ 정확히 하나일 때만 이름을 준다', () => {
    const { channels, pluginClients, agentClients } = build({
      'only': ['plugin'], 'noPlugin': ['agent'], 'empty': [],
    });
    const s = summarizeLive(channels, pluginClients, agentClients);
    expect(s.readyCount).toBe(1);
    expect(s.readyChannel).toBe('only');
  });

  it('하나도 없으면 null 이고 readyCount 는 0 — null 과 0 을 둘 다 적는다', () => {
    const { channels, pluginClients, agentClients } = build({ 'x': ['agent'] });
    const s = summarizeLive(channels, pluginClients, agentClients);
    expect(s.readyCount).toBe(0);
    expect(s.readyChannel).toBeNull();
    expect(s.live).toHaveLength(1);        // 살아는 있다 — 「없다」와 구별된다
  });
});

describe('socket.ts 에 «실제로» 붙어 있나', () => {
  const SRC_PATH = path.resolve(process.cwd(), 'src/socket.ts');
  if (!fs.existsSync(SRC_PATH)) {
    throw new Error('socket.ts 를 못 찾았다 — 시험이 «아무것도» 안 재게 된다: ' + SRC_PATH);
  }
  const SRC = fs.readFileSync(SRC_PATH, 'utf8');

  it('★★★ /status 가 summarizeLive 를 «부른다» — 만들어 놓고 안 부르면 아무 일도 안 난다', () => {
    expect(SRC).toContain('summarizeLive(channels, pluginClients, agentClients)');
  });

  it('★★ 옛 칸 `queue.channels` 를 «안 지운다» — 읽던 쪽이 깨진다', () => {
    expect(SRC).toContain('channels: Array.from(channelQueues.entries())');
  });
});
