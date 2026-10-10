import {ReviewReport, ReviewReportJSONSchema, ReviewReportSchema} from './types/report-types';
import {AgentDefinition, query} from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import {githubTools, mcpServersConfig} from "./config/mcp.config";
import { logAgentStart, logReviewStart } from './utils';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  orchestratorPrompt: (owner: string, repo: string, prNumber: number) => string;
  subAgents: Record<string, AgentDefinition>;
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 */
export class CodeReviewOrchestrator {
  private orchestratorPrompt: (owner: string, repo: string, prNumber: number) => string;
  private subAgents: Record<string, AgentDefinition>;

  constructor(options: OrchestratorOptions) {
    this.orchestratorPrompt = options.orchestratorPrompt;
    this.subAgents = options.subAgents;

  }

  /**
   * Review a pull request using parallel subagent analysis
   * example usage: github.com/{owner}/{repo}/pull/{123}
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Complete review report
   */
  async reviewPullRequest(
      owner: string,
      repo: string,
      prNumber: number
  ): Promise<ReviewReport> {
    const PROJECT_ROOT = path.resolve(__dirname, "..")
    logReviewStart(owner, repo, prNumber);

    for await (const message of query({
      prompt: this.generateMessages(this.orchestratorPrompt(owner, repo, prNumber)),
      options: {
        cwd: PROJECT_ROOT,
        settingSources: ["project"],
        allowedTools: [...githubTools, "Task", "Skill", "Grep", "Glob", "WebSearch", "Read"],
        agents: this.subAgents,
        model: process.env.ANTHROPIC_MODEL,
        maxTurns: 30,
        outputFormat: {
          type: "json_schema",
          schema: ReviewReportJSONSchema,
        },
        mcpServers: mcpServersConfig,
      }

    })) {

      if (message.type === "assistant") {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          const taskBlocks = content.filter(
              (block) => block.type === "tool_use" && block.name === "Task",
          );
          if (taskBlocks.length > 0)
            taskBlocks.forEach((block) => {
              /*console.log(
                  `[Orchestrator]: Launching subagent ${(block as any).input?.subagent_type}.`);*/

            })
          else console.log("[Orchestrator]: No subagents invoked in this turn");
        }
      } else if (message.type === "result" && message.subtype === "success") {
        console.log(
            `[Orchestrator]: Received final structured results`,
            message.structured_output,
        );

        const parsedResults = ReviewReportSchema.safeParse(
            message.structured_output,
        );

        if (parsedResults.success)
          return parsedResults.data;
        else
          throw new Error("Structured output generation failed after maximum retries.");
      } else if (message.type === "result" &&
          (message.subtype === "error_max_turns" ||
              message.subtype === "error_max_structured_output_retries")) {
        throw new Error(`Orchestrator failed: ${message.subtype}. No Success result received from subagents.
        ${message.errors.join("\n")}`);
      }
    }
    throw new Error("Orchestrator failed. No Success result received from subagents.");
  }

  private async* generateMessages(prompt: string) {
    yield {
      type: "user" as const,
      message: {role: "user" as const, content: prompt},
      parent_tool_use_id: null,
      session_id: "code-review-orchestrator-session",
    };
  }
}