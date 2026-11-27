/**
 * ★★ 「지금 «살아 있는» 채널」을 밖으로 내준다.
 *
 * ⚠️⚠️ 2026-11-27 — 왜 이 파일이 생겼나.
 *   `/status` 는 `channelQueues`(명령이 «지나간» 채널)만 내줬다. 그래서 9.7일 띄워 둔
 *   서버가 **죽은 채널 셋**을 나란히 보여 주고, 「지금 플러그인이 «어느» 채널에 붙어
 *   있나」는 아무도 알 수 없었다. ⇒ 사이클마다 **사람이 Figma UI 에서 채널 ID 를 읽어
 *   줘야** 했다. 그건 Figma 의 제약이 아니라 **«우리 fork 의 빈칸»** 이었다.
 *
 *   자료는 처음부터 다 있었다 — `channels`(살아 있는 멤버십) · `pluginClients` ·
 *   `agentClients`. 내주지만 않았다.
 *
 * ★ 왜 «따로» 떼어 냈나: `socket.ts` 는 `bun` 을 import 해서 jest 가 못 읽는다
 *   (`tests/unit/socket-queue.test.ts` 가 `jest.config.js` 의 `testPathIgnorePatterns`
 *   에 들어 있다). 판정이 들어가는 부분만 **순수 함수**로 떼어 내면 시험이 붙는다.
 *
 * ★★★ §1-③ 「`—`(NULL) ≠ `0`」 — 보낼 채널이 «여럿»이면 `readyChannel` 은 **null** 이다.
 *   하나를 골라 주면 부른 쪽이 「정해졌다」고 읽고 엉뚱한 파일을 고친다.
 */

/** 한 채널의 «지금» 상태 */
export interface LiveChannel {
  channel: string;
  /** 지금 붙어 있는 클라이언트 수 */
  clients: number;
  /** 그중 Figma 플러그인 */
  plugins: number;
  /** 그중 MCP 에이전트 */
  agents: number;
  /**
   * ★★ 「에이전트가 아닌」 클라이언트 수 = **명령이 실제로 전달될 대상**.
   *   `plugins` 와 다르다 — 분류는 **행동 기반**이어서, 막 접속한 플러그인은
   *   아직 `plugins` 에 안 든다(`classifyClient`: 답을 한 번 보낸 뒤에야 플러그인이 된다).
   */
  candidates: number;
  /**
   * ★★★ 이 채널로 명령을 보낼 수 있나. **`socket.ts` 의 전달 규칙을 그대로 베낀다** —
   *   `processQueue` 는 분류된 플러그인이 없으면 「에이전트가 아닌 모든 클라이언트」에게
   *   보낸다(부트스트랩 대체). 그래서 `plugins > 0` 으로 재면 **거짓 음성**이 된다 —
   *   사용자가 플러그인을 **막 열었을 때** 「보낼 채널 없음」이 나온다. 가장 필요한 순간에.
   *
   * ⚠️ 베낀 규칙 자체에 틈이 있다: 아직 명령을 안 보낸 «다른 에이전트»도 `candidates`
   *   에 들어간다. 서버도 같은 틈을 갖고 있으므로 **여기서 더 엄하게 재면 서버와 어긋난다.**
   *   숨기지 않고 적어 둔다(§1-④).
   */
  ready: boolean;
}

export interface LiveSummary {
  /** 빈 채널을 걷어낸, 지금 살아 있는 채널들 */
  live: LiveChannel[];
  /** 명령을 받을 수 있는 채널 수 */
  readyCount: number;
  /**
   * ★ 보낼 채널이 «정확히 하나»일 때만 그 이름. 0개거나 2개 이상이면 **null**.
   *   null 은 「없다」가 아니라 「내가 정하지 않는다」다 — `live` 를 보고 부른 쪽이 정한다.
   */
  readyChannel: string | null;
}

/**
 * ★ 판정하지 않는다 — 세어서 그대로 내준다. 유일한 «단정»은 「빈 채널은 죽었다」이고,
 *   그건 `join` 이 채널을 만들기만 하고 끊길 때 **빈 Set 을 지우지 않기** 때문이다.
 */
export function liveChannels<C>(
  channels: Map<string, Set<C>>,
  pluginClients: Set<C>,
  agentClients: Set<C>,
): LiveChannel[] {
  const out: LiveChannel[] = [];
  channels.forEach((clients, channel) => {
    if (!clients || clients.size === 0) return;   // ★ 빈 채널 = 죽은 채널
    let plugins = 0;
    let agents = 0;
    clients.forEach((c) => {
      if (pluginClients.has(c)) plugins++;
      else if (agentClients.has(c)) agents++;
    });
    const candidates = clients.size - agents;   // ★ socket.ts processQueue 와 같은 셈
    out.push({ channel, clients: clients.size, plugins, agents, candidates, ready: candidates > 0 });
  });
  // 보낼 수 있는 것 먼저 · 붐비는 것 먼저 · 그다음 이름 — 출력이 «늘 같은 순서»여야 한다
  out.sort((a, b) =>
    (Number(b.ready) - Number(a.ready)) ||
    (b.clients - a.clients) ||
    a.channel.localeCompare(b.channel));
  return out;
}

export function summarizeLive<C>(
  channels: Map<string, Set<C>>,
  pluginClients: Set<C>,
  agentClients: Set<C>,
): LiveSummary {
  const live = liveChannels(channels, pluginClients, agentClients);
  const ready = live.filter((c) => c.ready);
  return {
    live,
    readyCount: ready.length,
    readyChannel: ready.length === 1 ? ready[0].channel : null,
  };
}
