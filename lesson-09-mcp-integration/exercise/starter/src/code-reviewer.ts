import "dotenv/config";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eslintTools, mcpServersConfig } from "./config/mcp.config.ts";

const model = process.env.ANTHROPIC_MODEL;
if (!model) {
  throw new Error("ANTHROPIC_MODEL is not set");
}

// -----------------------------------------------------------------------------
// Exported Types (provided - no changes needed)
// -----------------------------------------------------------------------------

export const LintIssueSchema = z.object({
  line: z.number(),
  column: z.number(),
  severity: z.enum(["error", "warning", "info"]),
  rule: z.string(),
  message: z.string(),
  fix: z.string(),
});

export const IssueSummarySchema = z.object({
  totalIssues: z.number(),
  errors: z.number(),
  warnings: z.number(),
  infos: z.number(),
});

export const IssueCategoriesSchema = z.object({
  formatting: z.number(),
  bestPractices: z.number(),
  potentialBugs: z.number(),
  other: z.number(),
});

export const CodeQualityReportSchema = z.object({
  filename: z.string(),
  qualityScore: z.number().min(0).max(100),
  issues: z.array(LintIssueSchema),
  summary: IssueSummarySchema,
  categories: IssueCategoriesSchema,
  recommendations: z.array(z.string()),
});

export type LintIssue = z.infer<typeof LintIssueSchema>;
export type IssueSummary = z.infer<typeof IssueSummarySchema>;
export type IssueCategories = z.infer<typeof IssueCategoriesSchema>;
export type CodeQualityReport = z.infer<typeof CodeQualityReportSchema>;

// Convert to JSON Schema for structured output
export const CodeQualityReportJSONSchema = zodToJsonSchema(CodeQualityReportSchema, {
  $refStrategy: "root",
});

// -----------------------------------------------------------------------------
// TODO: Step 1 - Implement async generator input mode
// This is the recommended pattern for MCP/streaming compatibility
// -----------------------------------------------------------------------------

async function* generateMessages(userMessage: string) {
yield {
    type: "user" as const,
    message: { role: "user" as const, content: userMessage },
    parent_tool_use_id: null,
    session_id: "code-reviewer-session",
  };}

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

export async function reviewCodeFile(filePath: string): Promise<CodeQualityReport> {
  const userMessage = `You are a code quality reviewer with access to ESLint via MCP.

Analyze the JavaScript file and provide a comprehensive quality report.

File path: ${filePath}

ANALYSIS REQUIREMENTS:

1. Use the mcp__eslint__lint-files tool to lint the file at the path above

2. Use the Read tool to read the file at the path above

3. Identify all linting issues with:
   - Line and column number
   - Severity (error, warning, info)
   - ESLint rule violated
   - Description of the problem
   - How to fix it

4. Categorize issues:
   - formatting: Spacing, indentation, quotes, semicolons
   - bestPractices: no-var, no-eval, prefer-const, etc.
   - potentialBugs: no-unused-vars, no-cond-assign, etc.
   - other: Any other issues

5. Calculate quality score (0-100):
   - Start at 100
   - Subtract 10 for each error
   - Subtract 5 for each warning
   - Subtract 2 for each info
   - Minimum score is 0

6. Provide 2-4 actionable recommendations to improve the code.

Return the complete quality report in the structured JSON format.`;

  try {
    const messageTypes = new Set<string>() 
    for await (const message of query({
      prompt: generateMessages(userMessage),
      options: {
        mcpServers: mcpServersConfig,
        model,
        allowedTools: [...eslintTools, 'Read'],
        // Structured output configuration
        outputFormat: {
          type: "json_schema",
          schema: CodeQualityReportJSONSchema,
        },
      },
    })) {
      
      
      /**
       * 
       * //Comment out all what is inside this loop except for this log statment to sea what messages are being received from the agent. 
       * 
       */
      //console.log(`[Agent]: Received message of type: ${message.type}, subtype ${message.subtype}`, message);

      /*if(message.type){
      messageTypes.add(message.type)
      console.log(`[Agent]: Received message of type: ${message.type}, subtype ${message.subtype}`, 
        message);
        }
        if(messageTypes.size > 3) 
          throw new Error(`Messages exceeded max size`);
      */

      if (message.type === "system" && message.subtype === "init") {
        console.log("Available MCP tools:", message.mcp_servers);
        if (message.mcp_servers) {
          console.log("Found init message in MCP servers")
          for (const server of message.mcp_servers) {
            if (server.status !== "connected") {
              throw new Error(
                `MCP server '${server.name}' failed to connect: ${server.status || "Unknown error"}`,
              );
            }
            console.log(`[MCP]: Server '${server.name}' status: ${server.status}`);
          }
        }
      }

      if (message.type === "assistant") {
        const content = message.message?.content;
        //console.log("[Assistant]:", content);
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use") {
              console.log(`[Tool]: ${block.name}`);
            }
          }
        }
      }
      
      // Handle structured output result
      if (message.type === "result") {
        if (message.subtype === "success" && message.structured_output) {
          console.log(
            "Structured output received, validating against schema...",
            message.structured_output,
          );
          return CodeQualityReportSchema.parse(message.structured_output);
        }
      }
    }
    
  } catch (error) {
    console.error(error);
    throw new Error("Failed to get structured output from agent");
  }
  throw new Error(
    "Error occurred. Could not generate code quality report for the file: " +
      filePath,
  );
}