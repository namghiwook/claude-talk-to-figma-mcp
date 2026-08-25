import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sendCommandToFigma, joinChannel } from "../utils/websocket.js";
import { filterFigmaNode } from "../utils/figma-helpers.js";
import { coerceJson } from "../utils/schema-helpers";

/**
 * Register document-related tools to the MCP server
 * @param server - The MCP server instance
 */
export function registerDocumentTools(server: McpServer): void {
  /**
   * ★★★ get_geometry — REST 가 «못 주는» 것만 준다 (2026-08-07 추가, 원본에 없음)
   *
   * `get_node_info` 는 플러그인에서 `exportAsync({format:"JSON_REST_V1"})` 를 쓴다 —
   * **REST 와 같은 형식**이라 회전 «후» AABB 만 나오고 «회전 전» 크기가 없다.
   *
   * ✅ 실측(400×100 텍스트를 90° 회전):
   *     exportAsync → 48 × 470 (회전 후)  ·  node.width → 470 × 48 (회전 «전» ★)
   *
   * 이 값이 있어야 `transform: rotate()` 를 제대로 낼 수 있다.
   */
  /**
   * ★★★★ set_export_settings — 「이 레이어를 «어떤 형식·배수» 로 뽑을지」 (2026-08-11 추가, 원본에 없음)
   *
   *   ⚠️⚠️ 이것이 없으면 에셋을 «추측해서» 뽑아야 한다.
   *   실측(커뮤니티 213개): PNG 배수가 **1 · 1.5 · 2 · 3 · 4 · 5 · 21.33** 로 제각각이고
   *   JPG · SVG · PDF 가 섞이며 `HEIGHT 512` 처럼 배수 아닌 제약도 있다.
   *   붙는 자리도 FRAME · GROUP · INSTANCE · VECTOR · RECTANGLE · ELLIPSE 로 제각각이다.
   *   → **디자이너가 정한 것이 정본이고**, 그것을 넣고 읽는 문이 여기다.
   */
  server.tool(
    "set_export_settings",
    "Set export settings (format + scale/width/height constraint + suffix) on a node. Pass [] to clear. This is what design tooling reads to decide HOW an asset should be exported — do not guess format/scale elsewhere.",
    {
      nodeId: z.string().describe("The ID of the node"),
      settings: z.array(z.object({
        format: z.enum(["PNG", "JPG", "SVG", "PDF"]).describe("Export format"),
        suffix: z.string().optional().describe("File name suffix, e.g. '@2x' or '_hero'"),
        constraint: z.object({
          type: z.enum(["SCALE", "WIDTH", "HEIGHT"]).describe("SCALE = multiplier; WIDTH/HEIGHT = absolute px"),
          value: z.number().describe("Multiplier (e.g. 2) or pixel count (e.g. 512)"),
        }).optional().describe("Omit for SVG (no scale concept)"),
      })).describe("Export settings. Empty array clears them."),
    },
    async ({ nodeId, settings }) => {
      try {
        const result = await sendCommandToFigma("set_export_settings", { nodeId, settings });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error setting export settings: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  server.tool(
    "get_export_settings",
    "Read export settings from a node. An empty array means the designer did not specify any — that is a meaningful state, not an error.",
    {
      nodeId: z.string().describe("The ID of the node"),
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("get_export_settings", { nodeId });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting export settings: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  server.tool(
    "get_geometry",
    "Get PRE-ROTATION geometry (width/height/rotation/relativeTransform) for a node. Unlike get_node_info (which returns REST-format post-rotation AABB), this exposes Plugin API values needed to reproduce rotation in CSS.",
    {
      nodeId: z.string().describe("The ID of the node"),
      depth: z.number().int().min(0).max(5).optional().describe("How many child levels to include (default 0 = the node itself)"),
    },
    async ({ nodeId, depth }) => {
      try {
        const result = await sendCommandToFigma("get_geometry", { nodeId, depth });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting geometry: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Document Info Tool
  server.tool(
    "get_document_info",
    "Get detailed information about the current Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_document_info");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting document info: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Selection Tool
  server.tool(
    "get_selection",
    "Get information about the current selection in Figma",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_selection");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting selection: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Node Info Tool
  server.tool(
    "get_node_info",
    "Get detailed information about a specific node in Figma",
    {
      nodeId: z.string().describe("The ID of the node to get information about"),
      depth: z.number().int().min(0).optional().describe("How many child levels to include in full detail. Deeper levels return only id/name/type stubs."),
      raw: z.boolean().optional().describe("진단용. 필터 «전» 원본에 어떤 키가 있는지만 센다(값은 안 낸다)."),
    },
    async ({ nodeId, depth, raw }) => {
      try {
        const result = await sendCommandToFigma("get_node_info", { nodeId });
        if (raw) {
          // ★ 필터를 «거치지 않은» exportAsync(JSON_REST_V1) 원본의 «키 존재 여부» 만 센다.
          //   ⚠️ 값을 안 낸다 — 화면 하나가 수 MB 다.
          // ⚠️⚠️ «고정 목록» 으로 세지 않는다 — 목록에 없는 키는 «없는» 것처럼 보인다.
          //   실제로 isMask·maskType 를 빼놓고 「마스크 정보가 안 온다」고 읽을 뻔했다.
          //   → 원본에 «실제로 있는» 키를 전부 열거한다.
          const NODE = new Set(["DOCUMENT","CANVAS","FRAME","GROUP","SECTION","COMPONENT",
            "COMPONENT_SET","INSTANCE","TEXT","RECTANGLE","ELLIPSE","LINE","VECTOR","STAR",
            "REGULAR_POLYGON","BOOLEAN_OPERATION","SLICE"]);
          const have = {}, byType = {}, perType = {};
          let nodes = 0;
          (function walk(o) {
            if (!o || typeof o !== "object") return;
            if (Array.isArray(o)) { for (const c of o) walk(c); return; }
            if (o.id && NODE.has(o.type)) {
              nodes++; byType[o.type] = (byType[o.type] || 0) + 1;
              perType[o.type] = perType[o.type] || {};
              for (const k of Object.keys(o)) {
                if (k === "children") continue;
                have[k] = (have[k] || 0) + 1;
                perType[o.type][k] = (perType[o.type][k] || 0) + 1;
              }
            }
            for (const k in o) walk(o[k]);
          })(result);
          // ★ 타입마다 «그 타입에만» 붙는 키를 드러낸다 — 공통키는 빼야 눈에 띈다
          const common = Object.keys(have).filter((k) => have[k] === nodes);
          const uniq = {};
          for (const t of Object.keys(perType)) {
            const only = Object.keys(perType[t]).filter((k) => !common.includes(k));
            if (only.length) uniq[t] = only.sort();
          }
          // ★★ 작은 묶음이면 «값» 도 낸다 — bbox ↔ renderBounds 대응을 재려면 수가 필요하다.
          //   ⚠️ 30개 넘으면 안 낸다(화면 하나가 수천 노드다).
          const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
          const box = (b) => (b ? [r2(b.x), r2(b.y), r2(b.width), r2(b.height)] : null);
          let vals = null;
          if (nodes <= 30) {
            vals = [];
            (function walk2(o) {
              if (!o || typeof o !== "object") return;
              if (Array.isArray(o)) { for (const c of o) walk2(c); return; }
              if (o.id && NODE.has(o.type)) {
                const row = { id: o.id, type: o.type, name: String(o.name || "").slice(0, 24),
                  bbox: box(o.absoluteBoundingBox), render: box(o.absoluteRenderBounds) };
                if (o.isMask) row.isMask = true;
                if (o.rotation) row.rotation = r2(o.rotation);
                vals.push(row);
              }
              for (const k in o) walk2(o[k]);
            })(result);
          }
          return { content: [{ type: "text", text: JSON.stringify(
            { _probe: "JSON_REST_V1 원본 — 필터 «전» · 실제로 있는 키를 «전부» 열거",
              nodes, byType,
              "_값설명": "bbox·render = [x, y, w, h] · render 는 absoluteRenderBounds",
              노드값: vals,
              모든노드에있음: common.sort(),
              키별개수: have,
              타입별_추가키: uniq }, null, 2) }] };
        }
        const filtered = filterFigmaNode(result, depth ?? 1);
        const coordinateNote = filtered.absoluteBoundingBox && filtered.localPosition
          ? "absoluteBoundingBox contains global coordinates (relative to canvas). localPosition contains local coordinates (relative to parent, use these for move_node)."
          : undefined;

        const payload = coordinateNote ? { ...filtered, _note: coordinateNote } : filtered;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting node info: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Nodes Info Tool
  server.tool(
    "get_nodes_info",
    "Get detailed information about multiple nodes in Figma",
    {
      nodeIds: coerceJson(z.array(z.string())).describe("Array of node IDs to get information about"),
      depth: z.number().int().min(0).optional().describe("How many child levels to include in full detail. Deeper levels return only id/name/type stubs.")
    },
    async ({ nodeIds, depth }) => {
      try {
        const results = await sendCommandToFigma('get_nodes_info', { nodeIds }) as any[];
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results.map((result) => filterFigmaNode(result.document || result.info, depth ?? 1)))
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting nodes info: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );

  // Get Styles Tool
  server.tool(
    "get_styles",
    "Get all styles from the current Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_styles");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting styles: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Get Local Components Tool
  server.tool(
    "get_local_components",
    "Get all local components from the Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_local_components");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting local components: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Get Remote Components Tool
  server.tool(
    "get_remote_components",
    "Get available components from team libraries in Figma",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_remote_components");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting remote components: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );

  // Text Node Scanning Tool
  server.tool(
    "scan_text_nodes",
    "Scan all text nodes in the selected Figma node",
    {
      nodeId: z.string().describe("ID of the node to scan"),
    },
    async ({ nodeId }) => {
      try {
        // Initial response to indicate we're starting the process
        const initialStatus = {
          type: "text" as const,
          text: "Starting text node scanning. This may take a moment for large designs...",
        };

        // Use the plugin's scan_text_nodes function with chunking flag
        const result = await sendCommandToFigma("scan_text_nodes", {
          nodeId,
          useChunking: true,  // Enable chunking on the plugin side
          chunkSize: 10       // Process 10 nodes at a time
        });

        // If the result indicates chunking was used, format the response accordingly
        if (result && typeof result === 'object' && 'chunks' in result) {
          const typedResult = result as {
            success: boolean,
            totalNodes: number,
            processedNodes: number,
            chunks: number,
            textNodes: Array<any>
          };

          const summaryText = `
          Scan completed:
          - Found ${typedResult.totalNodes} text nodes
          - Processed in ${typedResult.chunks} chunks
          `;

          return {
            content: [
              initialStatus,
              {
                type: "text" as const,
                text: summaryText
              },
              {
                type: "text" as const,
                text: JSON.stringify(typedResult.textNodes, null, 2)
              }
            ],
          };
        }

        // If chunking wasn't used or wasn't reported in the result format, return the result as is
        return {
          content: [
            initialStatus,
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error scanning text nodes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Join Channel Tool
  server.tool(
    "join_channel",
    "Join a specific channel to communicate with Figma",
    {
      channel: z.string().describe("The name of the channel to join"),
    },
    async ({ channel }) => {
      try {
        if (!channel) {
          // If no channel provided, ask the user for input
          return {
            content: [
              {
                type: "text",
                text: "Please provide a channel name to join:",
              },
            ],
            followUp: {
              tool: "join_channel",
              description: "Join the specified channel",
            },
          };
        }

        // Use joinChannel instead of sendCommandToFigma to ensure currentChannel is updated
        await joinChannel(channel);

        return {
          content: [
            {
              type: "text",
              text: `Successfully joined channel: ${channel}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error joining channel: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Export Node as Image Tool
  server.tool(
    "export_node_as_image",
    "Export a node as an image from Figma",
    {
      nodeId: z.string().describe("The ID of the node to export"),
      format: z
        .enum(["PNG", "JPG", "SVG", "PDF"])
        .optional()
        .describe("Export format"),
      scale: z.coerce.number().positive().optional().describe("Export scale"),
    },
    async ({ nodeId, format, scale }) => {
      try {
        const result = await sendCommandToFigma("export_node_as_image", {
          nodeId,
          format: format || "PNG",
          scale: scale || 1,
        }, 120000); // 120 second timeout for image export
        const typedResult = result as { imageData: string; mimeType: string };

        return {
          content: [
            {
              type: "image",
              data: typedResult.imageData,
              mimeType: typedResult.mimeType || "image/png",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error exporting node as image: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Create Page Tool
  server.tool(
    "create_page",
    "Create a new page in the current Figma document",
    {
      name: z.string().describe("Name for the new page"),
    },
    async ({ name }) => {
      try {
        const result = await sendCommandToFigma("create_page", { name });
        const typedResult = result as { id: string; name: string };
        return {
          content: [
            {
              type: "text",
              text: `Created page "${typedResult.name}" with ID: ${typedResult.id}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating page: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Delete Page Tool
  server.tool(
    "delete_page",
    "Delete a page from the current Figma document",
    {
      pageId: z.string().describe("ID of the page to delete"),
    },
    async ({ pageId }) => {
      try {
        const result = await sendCommandToFigma("delete_page", { pageId });
        const typedResult = result as { success: boolean; name: string };
        return {
          content: [
            {
              type: "text",
              text: `Deleted page "${typedResult.name}" successfully`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting page: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Rename Page Tool
  server.tool(
    "rename_page",
    "Rename an existing page in the Figma document",
    {
      pageId: z.string().describe("ID of the page to rename"),
      name: z.string().describe("New name for the page"),
    },
    async ({ pageId, name }) => {
      try {
        const result = await sendCommandToFigma("rename_page", { pageId, name });
        const typedResult = result as { id: string; name: string; oldName: string };
        return {
          content: [
            {
              type: "text",
              text: `Renamed page from "${typedResult.oldName}" to "${typedResult.name}"`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error renaming page: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Get Pages Tool
  server.tool(
    "get_pages",
    "Get all pages in the current Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_pages");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting pages: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Set Current Page Tool
  server.tool(
    "set_current_page",
    "DEPRECATED — this stateful command is blocked by the relay server. Instead, pass the target page's node ID as parentId on creation commands (e.g., create_rectangle, create_frame). Use get_pages to discover page IDs.",
    {
      pageId: z.string().describe("ID of the page to switch to"),
    },
    async ({ pageId }) => {
      try {
        const result = await sendCommandToFigma("set_current_page", { pageId });
        const typedResult = result as { id: string; name: string };
        return {
          content: [
            {
              type: "text",
              text: `Switched to page "${typedResult.name}"`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error switching page: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Duplicate Page Tool
  server.tool(
    "duplicate_page",
    "Duplicate an existing page in the Figma document, creating a complete copy of all its contents",
    {
      pageId: z.string().describe("ID of the page to duplicate"),
      name: z.string().optional().describe("Optional name for the duplicated page (defaults to 'Original Name (Copy)')"),
    },
    async ({ pageId, name }) => {
      try {
        const result = await sendCommandToFigma("duplicate_page", { pageId, name });
        const typedResult = result as { id: string; name: string; originalName: string };
        return {
          content: [
            {
              type: "text",
              text: `Duplicated page "${typedResult.originalName}" → "${typedResult.name}" with ID: ${typedResult.id}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error duplicating page: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}