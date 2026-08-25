![Claude Talk to Figma collage](images/claude-talk-to-figma.png)

# <del>Claude</del> <ins>AI Agents</ins> Talk to Figma MCP

> ## 🍴 This is a fork — here is what differs from upstream
>
> Fork of **[arinspunk/claude-talk-to-figma-mcp](https://github.com/arinspunk/claude-talk-to-figma-mcp)**.
> All credit for the original design and tool catalogue goes there. Everything below the
> horizontal rule at the end of this box is upstream's README, unchanged.
>
> **Why this fork exists.** Our Figma seat is **Dev-mode only** — no Design mode. Upstream's
> manifest declares `editorType: ["figma", "figjam"]`, so the plugin refuses to start in the dev
> handoff panel. We also needed node properties the default tools do not expose.
>
> ### What we changed
>
> | | Change | Why |
> |---|---|---|
> | **manifest** | `editorType` += `"dev"`, `capabilities: ["inspect"]` | Without these the plugin cannot run in Dev Mode at all |
> | **`get_geometry`** *(new)* | Returns **pre-rotation** `width`/`height`, `relativeTransform`, and `rotation` in degrees | `get_node_info` uses `exportAsync({format:"JSON_REST_V1"})`, which is the REST shape — post-rotation AABB only. Measured on a 400×100 text rotated 90°: `exportAsync` → 48×470, `node.width` → **470×48**. CSS `transform: rotate()` needs the latter |
> | **`set_export_settings`** / **`get_export_settings`** *(new)* | Read and write a node's export format and scale | Asset format/scale is the designer's decision, not something to guess. Across 213 Figma Community files we measured PNG scales of 1, 1.5, 2, 3, 4, 5 **and 21.33**, mixed JPG/SVG/PDF, and constraints such as `HEIGHT 512` rather than a scale. An empty array means *"not decided"* — a meaningful state, not an error |
> | **`get_node_info({ raw: true })`** *(new flag)* | Enumerates every key actually present in the **unfiltered** `JSON_REST_V1` output | See below |
>
> ### Why `raw: true` exists
>
> `filterFigmaNode` keeps only `id`, `name`, `type`, `fills`, `strokes`, `cornerRadius`,
> `absoluteBoundingBox`, `localPosition`, `characters`, `style` and `children`. So
> `layoutSizing*`, `constraints`, `isMask` and `absoluteRenderBounds` are **invisible even when
> present** — and concluding *"the source does not provide X"* from filtered output is unsound.
> We made exactly that mistake once.
>
> `raw: true` never returns values (a single screen is megabytes); it returns the key inventory,
> plus per-node `bbox` / `render` / `isMask` / `rotation` when the subtree has ≤ 30 nodes.
> It deliberately does **not** use a fixed watch-list: the first version did, omitted `isMask`,
> and would have been read as *"mask data does not come through"* — which was *"I did not ask"*.
>
> ### What we found with it (may be useful to others)
>
> `exportAsync({format:"JSON_REST_V1"})` returns essentially the full REST node shape — including
> `layoutSizing*`, `constraints`, `itemSpacing`, `absoluteRenderBounds`, `isMask`/`maskType`,
> `strokeWeight`/`strokeAlign`, and gradients with `gradientStops`, alpha and handle positions.
> What it does **not** return are the `geometry=paths` extras — `size`, `relativeTransform`,
> `fillGeometry`, `strokeGeometry` — because `ExportSettingsREST` has a single `format` field and
> no place for a query parameter. Verified against 2,085 nodes (1,026 vectors, 39 rotated).
>
> Those gaps are fillable without the REST API: `get_geometry` for the first two, `get_svg` for
> path data. The bridge for `get_svg` is `absoluteRenderBounds` — the exported viewBox is
> `ceil(renderBounds.w/h)` and its origin is `renderBounds.x/y`. Masks come through `get_svg` on
> the **group** as a proper `<mask>` element; note that a mask node's own `absoluteRenderBounds`
> is `null`, because Figma does not paint it.
>
> ### Staying in sync with upstream
>
> ```bash
> git remote add upstream https://github.com/arinspunk/claude-talk-to-figma-mcp.git
> git fetch upstream && git merge upstream/main
> bun install && bun run build
> ```
>
> ⚠️ `bun run build` currently fails at the **DTS** step (`src/socket.ts:513`, a pre-existing
> `Server<WebSocketData>` generics error inherited from upstream). The **JS output is produced
> correctly** — only the type declarations fail. Do not read it as a broken build.
>
> <details>
> <summary><b>🇰🇷 한국어</b></summary>
>
> **왜 포크했나.** 우리 Figma 좌석이 **Dev seat 뿐**이라 Design 모드 권한이 없다. 원본 매니페스트는
> `editorType: ["figma","figjam"]` 뿐이라 Dev Mode 에서 플러그인이 아예 안 뜬다. 그리고 기본 도구가
> 안 내주는 노드 속성이 필요했다.
>
> **고친 것**
>
> | | 무엇 | 왜 |
> |---|---|---|
> | **manifest** | `editorType` 에 `"dev"` · `capabilities: ["inspect"]` | 없으면 Dev Mode 에서 실행 자체가 안 된다 |
> | **`get_geometry`** | **회전 «전»** `width`/`height` · `relativeTransform` · `rotation`(도) | `get_node_info` 는 `exportAsync(JSON_REST_V1)` 라 REST 와 같은 형식 — 회전 «후» AABB 만 준다. 실측(400×100 을 90° 회전): `exportAsync` → 48×470 · `node.width` → **470×48**. CSS `transform: rotate()` 에 필요한 건 뒤엣것이다 |
> | **`set_export_settings`** / **`get_export_settings`** | 노드의 export 형식·배수를 읽고 쓴다 | 에셋 형식·배수는 **디자이너가 정한 것이 정본**이다(추측 금지). 커뮤니티 213개 실측: PNG 배수가 1·1.5·2·3·4·5·**21.33** 로 제각각, JPG·SVG·PDF 가 섞이고 `HEIGHT 512` 처럼 배수 아닌 제약도 있다. 빈 배열은 **«안 정했다»** — 오류가 아니라 뜻이 있는 상태다 |
> | **`get_node_info({raw:true})`** | 필터 **«전»** 원본에 «실제로 있는» 키를 전부 열거 | 아래 |
>
> **`raw:true` 가 왜 필요한가** — `filterFigmaNode` 가 `id·name·type·fills·strokes·cornerRadius·
> absoluteBoundingBox·localPosition·characters·style·children` 만 남긴다. 그래서
> `layoutSizing*`·`constraints`·`isMask`·`absoluteRenderBounds` 는 **있어도 안 보인다.**
> ⚠️ **필터를 거친 값으로 「원본에 없다」고 판단하면 틀린다** — 실제로 한 번 그렇게 틀렸다.
>
> ⚠️ 값은 **안 낸다**(화면 하나가 수 MB). 노드 30개 이하면 `bbox`·`render`·`isMask`·`rotation` 을 값으로 낸다.
> ⚠️⚠️ **«고정 목록» 으로 세지 않는다** — 첫 판이 그렇게 했다가 **`isMask` 가 빠져** 「마스크 정보가
> 안 온다」로 읽힐 뻔했다. **「안 온다」가 아니라 「내가 안 물었다」** 였다.
>
> **재서 알아낸 것** — `exportAsync(JSON_REST_V1)` 는 REST 노드 형식을 **거의 그대로** 준다:
> `layoutSizing*`·`constraints`·`itemSpacing`·`absoluteRenderBounds`·`isMask`/`maskType`·
> `strokeWeight`/`strokeAlign`, 그라디언트도 `gradientStops`·알파·핸들 위치까지.
> **안 오는 것은 `geometry=paths` 여분**(`size`·`relativeTransform`·`fillGeometry`·`strokeGeometry`)
> 뿐이다 — `ExportSettingsREST` 에 `format` 필드 하나뿐이라 쿼리 파라미터를 줄 자리가 없다.
> ✅ 2,085노드(VECTOR 1,026 · 회전 39)로 확인.
>
> ★ 그 둘은 REST 없이 메울 수 있다 — 앞은 `get_geometry`, 뒤는 `get_svg`.
> **다리는 `absoluteRenderBounds`** 다: viewBox 치수 = `ceil(render.w/h)` · 원점 = `render.x/y`.
> 마스크는 **그룹째** `get_svg` 하면 `<mask>` 로 통째로 온다.
> ⚠️ 마스크 노드 자신의 `absoluteRenderBounds` 는 **`null`** 이다 — Figma 가 마스크를 안 그리기 때문.
>
> ⚠️ `bun run build` 는 **DTS 단계에서 항상 실패**한다(`src/socket.ts:513` — 원본에서 물려받은
> `Server<WebSocketData>` 제네릭 오류). **JS 는 정상적으로 나온다.** 빌드가 깨진 것으로 읽지 말 것.
>
> </details>
>
> ---

Enable your AI agents to read, analyze, and modify Figma designs.

Works with your favorite agentic tools:

- [Claude Desktop](https://claude.ai/)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Cursor](https://cursor.com/)
- [Antigravity](https://antigravity.google/)
- [Windsurf](https://windsurf.com/)
- [VS Code](https://code.visualstudio.com/) + [GitHub Copilot](https://github.com/features/copilot)
- [Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)
- [Roo Code](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline)

## 👩🏽‍💻 Who it's for

### UX/UI Teams

Automate repetitive design tasks and maintain brand consistency without manual effort:

- **Automated accessibility audits** - Detect and fix contrast issues in seconds
- **Bulk style updates** - Change colors, typography, or spacing across the entire document with a single command
- **Visual hierarchy analysis** - Get instant feedback on your design structure

### Developers

Generate production-ready code directly from designs:

- **React/Vue/SwiftUI components** - From design to code in one step
- **Code with design tokens** - Keep design and development in sync
- **Reduce handoff friction** - Fewer back-and-forth iterations with the design team

> **Key advantage**: Unlike [Figma's official MCP](https://www.figma.com/mcp-catalog/) which requires a Dev Mode license, this MCP **works with any Figma account** (even free ones).

## 💡 Real-world use cases

**Accessibility:**
> "Find all text with contrast ratio <4.5:1 and suggest colors that meet WCAG AA"

**Rebranding:**
> "Change #FF6B6B to #E63946 in all primary buttons throughout the document"

**Design analysis:**
> "Analyze the visual hierarchy of this screen and suggest improvements based on design principles"

**Developer handoff:**
> "Generate the React component for 'CardProduct' including PropTypes and styles in CSS modules"

## ⚡️ Quick installation

**Setup:** 5 minutes | **First automation:** 2 minutes

### Requirements

- [Node.js](https://nodejs.org/en/download) installed
- [Figma Desktop](https://www.figma.com/downloads/)
- AI client:
  - [Claude Desktop](https://claude.ai/download)
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
  - [Cursor](https://cursor.com/downloads)
  - [Antigravity](https://antigravity.google/download)
  - [Windsurf](https://windsurf.com/download)
  - [VS Code](https://code.visualstudio.com/) + [GitHub Copilot](https://github.com/features/copilot)
  - [Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)
  - [Roo Code](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline)

### Step 1: Install and start the websocket

*Enables the Agent to send commands to Figma.*

Open your terminal, navigate to the folder where you want to install the tool, and run:

```bash
npx claude-talk-to-figma-mcp
```

> **💡 Tip**: This command is an "all-in-one" (clones, installs, and starts). In subsequent sessions, if you're already inside the project folder `your-project/claude-talk-to-figma-mcp`, you can simply run `bun run socket`.

### Step 2: Install the plugin in Figma

*Enables Figma to receive commands from the agent and return responses.*

In Figma Desktop go to Menu → Plugins → Development → Import plugin from manifest → inside the folder where you installed the MCP, select `src/claude_mcp_plugin/manifest.json`

### Step 3: Configure your Agentic Tool

*Enables the agent to use the MCP's read and modify tools.*

#### Claude Desktop

Download [claude-talk-to-figma-mcp.dxt](https://github.com/arinspunk/claude-talk-to-figma-mcp/releases) (from Assets section of the latest release) and double-click. Claude configures itself automatically.

#### Cursor

1. Open **Cursor Settings → Tools & Integrations**
2. Click **"New MCP Server"** to open the `mcp.json` file
3. Add this configuration:
  ```json
  {
    "mcpServers": {
      "ClaudeTalkToFigma": {
        "command": "npx",
        "args": ["-p", "claude-talk-to-figma-mcp@latest", "claude-talk-to-figma-mcp-server"]
      }
    }
  }
  ```
4. Save the file and restart Cursor

#### Other Agentic Tools

For other tools (Claude Code, Windsurf, VS Code + GitHub Copilot, Cline, Roo Code), you can follow the instructions in the ["Configure your Agentic Tool" chapter of the detailed installation guide](INSTALLATION.md#3-configure-your-agentic-tool).

### Step 4: Start working

1. Open the plugin in Figma
2. Copy the channel ID (bold code inside the green box)
3. Type in the chat: `Connect to Figma, channel {your-ID}`

✅ Ready to design with AI!

## Subsequent work sessions

To use the MCP again in day-to-day work, you don't need to repeat the entire process:

1. **Start the socket**: In the terminal, enter the project folder `your-project/claude-talk-to-figma-mcp` and run `bun run socket` (or `npm run socket`).
2. **Open the plugin in Figma**: You'll find it in your recent plugins list.
3. **Connect the AI**: Copy the channel ID and tell your agent: `Connect to Figma, channel {your-ID}`.

## 🤖 Multi-Agent & Parallel execution

This MCP server supports **safe parallel execution** out of the box, allowing multiple AI agents (e.g. Claude Code's sub-agents or team swarms) to work simultaneously on your Figma file without locking up the plugin. A built-in command queue processes requests sequentially on the server side, preventing the Figma API from timing out.

> **Note**: Because multiple agents can modify the document simultaneously, relying on implicit page context is unsafe. As a result, stateful commands like `set_current_page` are **blocked**. All agents must explicitly provide the intended `parentId` parameter when executing any creation or structural modification command (e.g., `create_frame`, `create_text`).

*(Special thanks to [@mmabas77](https://github.com/mmabas77) for architecting and contributing this feature!)*

## 🐳 Alternative: Using Docker

If you prefer Docker or need to run the WebSocket server in a team environment, see the [Docker installation guide](INSTALLATION.md#alternative-using-docker) in the detailed installation documentation.

## 🛠️ Capabilities

**Design analysis**
- Get document information, current selection, styles
- Scan text, audit components, export assets

**Element creation**
- Shapes, text, frames with full style control
- Clone, group, organize elements

**Modification**
- Colors, borders, corners, shadows
- Auto-layout, advanced typography
- Local components and team library components

See [complete command list](COMMANDS.md).

## 📚 Documentation

- [Detailed installation](INSTALLATION.md) — Manual setup, Cursor, Windsurf and other IDEs
- [Available commands](COMMANDS.md) — Complete tool reference
- [Troubleshooting](TROUBLESHOOTING.md) — Common errors and how to fix them
- [Contributing](CONTRIBUTING.md) — Architecture, testing, contribution guide
- [Changelog](CHANGELOG.md) — Version history

## 🙏 Credits

Based on [cursor-talk-to-figma-mcp](https://github.com/sonnylazuardi/cursor-talk-to-figma-mcp) by Sonny Lazuardi. Adapted for Claude Desktop and extended with new tools by [Xúlio Zé](https://github.com/arinspunk).

If you want to know about all project contributions, you can visit the ["Contributors" chapter of the contribution guide](CONTRIBUTING.md#contributors).

[MIT License](LICENSE)

---

## 📊 Project status

✅ **Stable production** - Tool ready for daily use in design and development teams

🚀 **Under active development:**
- Complete support for Figma Variables
- Enhanced export to Tailwind CSS/SwiftUI

### Need something specific?

**[Propose new ones on GitHub Issues](https://github.com/arinspunk/claude-talk-to-figma-mcp/issues)**

Your feedback and contributions keep the project alive. ❤️
