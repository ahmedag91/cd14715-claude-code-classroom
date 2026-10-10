import {AgentDefinition} from "@anthropic-ai/claude-agent-sdk";
import {REFACTORING_SUGGESTER_PROMPT} from "../prompts";
import {githubTools} from "../config/mcp.config";

export const refactoringSuggester: AgentDefinition = {
    description: "Analyzes code for refactoring opportunities, identifying areas where code can be improved for readability, maintainability, and performance, and providing a report in JSON format highlighting suggested refactorings, associated code files, and recommendations for implementing the changes.",
    prompt: REFACTORING_SUGGESTER_PROMPT,
    tools: [ "Skill", "Grep", "Glob", "WebSearch", "Read", ...githubTools],
    model: 'inherit'
}

export const REFACTORING_SUGGESTER_AGENT_NAME = "refactoring-suggester";