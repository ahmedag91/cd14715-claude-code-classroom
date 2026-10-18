import {AgentDefinition} from "@anthropic-ai/claude-agent-sdk";
import {CODE_QUALITY_ANALYZER_PROMPT} from "../prompts/code-quality-analyzer.prompt";
import {eslintTools} from "../config/mcp.config";

export const codeQualityAnalyzer: AgentDefinition = {
    description: "Analyzes code for security vulnerabilities, performance issues, maintainability, style, bug-risks, and best practices concerns.",
    prompt: CODE_QUALITY_ANALYZER_PROMPT,
    tools: ["Skill", "Grep", "Glob", "WebSearch", "Read", ...eslintTools],
    model: 'inherit',
    mcpServers: [{
        eslint: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@eslint/mcp@latest"],
            env: {

            }
        },
    }],
}

export const QUALITY_ANALYZER_AGENT_NAME = "code-quality-analyzer";