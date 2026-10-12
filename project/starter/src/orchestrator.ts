import {ReviewReport, ReviewReportJSONSchema, ReviewReportSchema} from './types/report-types';
import {AgentDefinition, query} from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import {githubTools, mcpServersConfig} from "./config/mcp.config";
import { ReviewError, logAgentStart, logAgentComplete, logger, ErrorCodes } from './utils';
import {fileURLToPath} from "url";

/**
 * Orchestrator configuration options
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      prNumber: number,
  ): Promise<ReviewReport> {
    const maxTurns = 10;
    const PROJECT_ROOT = path.resolve(__dirname, "..")
    const activeSubagents = new Map<string, { subagentType: string; file: string; startedAt: number }>();

    for await (const message of query({
      prompt: this.generateMessages(this.orchestratorPrompt(owner, repo, prNumber)),
      options: {
        cwd: PROJECT_ROOT,
        settingSources: ["project"],
        allowedTools: [...githubTools, "Task", "Skill", "Grep", "Glob", "WebSearch", "Read"],
        agents: this.subAgents,
        model: process.env.ANTHROPIC_MODEL,
        maxTurns: maxTurns,
        outputFormat: {
          type: "json_schema",
          schema: ReviewReportJSONSchema,
        },
        mcpServers: mcpServersConfig,
      }

    })) {
      logger.debug(`[Orchestrator]: Received message of type ${message.type}`);

      if (message.type === "assistant") {
        const content = message.message?.content;
        logger.debug(`[Orchestrator]: Assistant content:`, content);
        if (Array.isArray(content)) {
          const taskBlocks = content.filter(
              (block) => block.type === "tool_use" && block.name === "Task",
          );
          if (taskBlocks.length > 0)
            taskBlocks.forEach((block) => {
              const file = (block as any).input?.description;
              const subagentType = (block as any).input?.subagent_type;
              logger.info(`[Orchestrator]: Starting subagent ${subagentType} for file ${file}`);
              logAgentStart(subagentType, file);
              activeSubagents.set((block as any).id, {subagentType, file, startedAt: Date.now()});
            })
          else
            logger.info("[Orchestrator]: No subagents invoked in this turn");
        }
      } else if (message.type === "user" && message.parent_tool_use_id) {
        const started = activeSubagents.get(message.parent_tool_use_id);
        if (started) {
          const duration = Date.now() - started.startedAt;
          logAgentComplete(started.subagentType, started.file, Math.round(duration / 100) / 10);
          activeSubagents.delete(message.parent_tool_use_id);
        }
      } else if (message.type === "result" && message.subtype === "success") {
        logger.info(
            `[Orchestrator]: Received final structured results`,
                message.structured_output)

        const parsedResults = ReviewReportSchema.safeParse(
            message.structured_output,
        );

        if (parsedResults.success)
          return parsedResults.data;
        else
          throw new ReviewError("Structured output generation failed after maximum retries.", ErrorCodes.STRUCTURED_OUTPUT_FAILED, {"Validation_Errors": parsedResults.error.format()});
      } else if (message.type === "result" &&
          (message.subtype === "error_max_turns" ||
              message.subtype === "error_max_structured_output_retries")) {
        throw new ReviewError(`Orchestrator failed: ${message.subtype}. No Success result received from subagents.`, ErrorCodes.AGENT_FAILED, {errors: message.errors.join("\n")});
      }
    }
    throw new ReviewError("Orchestrator failed. Max turns have been reached", ErrorCodes.AGENT_FAILED, {"Max_Turns": maxTurns});
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