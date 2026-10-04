import {AgentDefinition} from "@anthropic-ai/claude-agent-sdk";
import {CODE_QUALITY_ANALYZER_PROMPT} from "../prompts";

export const codeQualityAnalyzer: AgentDefinition = {
    description: "Analyzes code for security vulnerabilities, performance issues, maintainability, style, bug-risks, and best practices concerns.",
    prompt: CODE_QUALITY_ANALYZER_PROMPT,
    tools: [ "Skill", "Read", "WebSearch", "Write"],
    model: 'inherit'
}