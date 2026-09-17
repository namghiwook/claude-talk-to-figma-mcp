import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sendCommandToFigma } from "../utils/websocket";

/**
 * Register variable tools to the MCP server
 * This module contains tools for managing Figma Variables (design tokens)
 * @param server - The MCP server instance
 */
export function registerVariableTools(server: McpServer): void {
  // Get Variables Tool
  server.tool(
    "get_variables",
    "List all variable collections and their variables in the current Figma file. Returns collections with their modes and variables.",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_variables", {});
        const typedResult = result as { collections: any[] };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(typedResult, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting variables: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Set Variable Tool
  server.tool(
    "set_variable",
    "Create or update a variable in a Figma variable collection. Creates the collection if collectionName is provided and it doesn't exist.",
    {
      collectionId: z.string().optional().describe("ID of an existing variable collection"),
      collectionName: z.string().optional().describe("Name for a new collection (used if collectionId not provided)"),
      name: z.string().describe("Variable name"),
      resolvedType: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]).describe("Variable type"),
      value: z.any().describe("Variable value. COLOR: {r,g,b,a} (0-1). FLOAT: number. STRING: string. BOOLEAN: boolean."),
      modeId: z.string().optional().describe("Mode ID to set the value for (uses default mode if omitted)"),
    },
    async ({ collectionId, collectionName, name, resolvedType, value, modeId }) => {
      try {
        const result = await sendCommandToFigma("set_variable", {
          collectionId,
          collectionName,
          name,
          resolvedType,
          value,
          modeId,
        });
        const typedResult = result as { variableId: string; variableName: string; collectionName: string };
        return {
          content: [
            {
              type: "text",
              text: `Set variable "${typedResult.variableName}" in collection "${typedResult.collectionName}" (ID: ${typedResult.variableId})`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting variable: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Apply Variable to Node Tool
  server.tool(
    "apply_variable_to_node",
    "Bind a variable to a node property in Figma. Call once per field — for multiple fields, call multiple times.",
    {
      nodeId: z.string().describe("The ID of the node to bind the variable to"),
      variableId: z.string().describe("The ID of the variable to bind"),
      field: z.string().describe("The node property field to bind (e.g., 'fills/0/color', 'opacity', 'width', 'height')"),
    },
    async ({ nodeId, variableId, field }) => {
      try {
        const result = await sendCommandToFigma("apply_variable_to_node", {
          nodeId,
          variableId,
          field,
        });
        const typedResult = result as { nodeName: string; variableName: string; field: string };
        return {
          content: [
            {
              type: "text",
              text: `Bound variable "${typedResult.variableName}" to field "${typedResult.field}" on node "${typedResult.nodeName}"`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error applying variable to node: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Add Variable Mode Tool
  //
  // Upstream can read, write and switch modes but cannot create one. That left a hole:
  // dark-theme token work could not start until someone opened the Figma UI and clicked "+",
  // even though every other step was automated.
  server.tool(
    "add_variable_mode",
    "Add a mode to a variable collection (e.g. a \"Dark\" mode next to \"Light\"). " +
      "Idempotent: if a mode with that name exists, returns it with created=false. " +
      "Note: Figma copies the first mode's values into the new mode, and the plan caps how many modes a collection may have.",
    {
      name: z.string().describe("Name for the new mode, e.g. \"Dark\""),
      collectionId: z.string().optional().describe("The ID of the variable collection"),
      collectionName: z.string().optional().describe("The name of the collection, if you don't have its ID"),
    },
    async ({ name, collectionId, collectionName }) => {
      try {
        const result = await sendCommandToFigma("add_variable_mode", { name, collectionId, collectionName });
        const r = result as {
          collectionName: string; modeId: string; modeName: string;
          created: boolean; copiedFrom?: string | null;
          modes: { modeId: string; name: string }[];
        };
        const head = r.created
          ? `Added mode "${r.modeName}" (${r.modeId}) to collection "${r.collectionName}"`
          : `Mode "${r.modeName}" (${r.modeId}) already existed in collection "${r.collectionName}"`;
        const copied = r.created && r.copiedFrom
          ? ` — Figma copied the values from "${r.copiedFrom}", so they are not empty.`
          : "";
        const all = ` Modes now: ${r.modes.map((m) => `${m.name} (${m.modeId})`).join(", ")}`;
        return { content: [{ type: "text", text: head + copied + all }] };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error adding variable mode: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );

  // Rename Variable Mode Tool
  //
  // Pairs with add_variable_mode: the default mode is called "Mode 1", which reads badly
  // next to an explicit "Dark".
  server.tool(
    "rename_variable_mode",
    "Rename a mode in a variable collection, e.g. \"Mode 1\" to \"Light\".",
    {
      name: z.string().describe("The new mode name"),
      collectionId: z.string().optional().describe("The ID of the variable collection"),
      collectionName: z.string().optional().describe("The name of the collection, if you don't have its ID"),
      modeId: z.string().optional().describe("The ID of the mode to rename"),
      modeName: z.string().optional().describe("The current name of the mode, if you don't have its ID. Defaults to the first mode."),
    },
    async ({ name, collectionId, collectionName, modeId, modeName }) => {
      try {
        const result = await sendCommandToFigma("rename_variable_mode", {
          name, collectionId, collectionName, modeId, modeName,
        });
        const r = result as {
          collectionName: string; from: string; to: string;
          modes: { modeId: string; name: string }[];
        };
        return {
          content: [{
            type: "text",
            text: `Renamed mode "${r.from}" to "${r.to}" in collection "${r.collectionName}". ` +
              `Modes now: ${r.modes.map((m) => `${m.name} (${m.modeId})`).join(", ")}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error renaming variable mode: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );

  // Switch Variable Mode Tool
  server.tool(
    "switch_variable_mode",
    "Switch the variable mode on a node for a specific collection. This changes which mode's values are used for bound variables.",
    {
      nodeId: z.string().describe("The ID of the node to switch mode on"),
      collectionId: z.string().describe("The ID of the variable collection"),
      modeId: z.string().describe("The ID of the mode to switch to"),
    },
    async ({ nodeId, collectionId, modeId }) => {
      try {
        const result = await sendCommandToFigma("switch_variable_mode", {
          nodeId,
          collectionId,
          modeId,
        });
        const typedResult = result as { nodeName: string; collectionName: string; modeName: string };
        return {
          content: [
            {
              type: "text",
              text: `Switched to mode "${typedResult.modeName}" for collection "${typedResult.collectionName}" on node "${typedResult.nodeName}"`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error switching variable mode: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
