import {AgentDefinition} from "@anthropic-ai/claude-agent-sdk";
import {TEST_COVERAGE_ANALYZER_PROMPT} from "../prompts";
import {githubTools} from "../config/mcp.config";

export const testCoverageAnalyzer: AgentDefinition = {
    description: "Analyzes code for test coverage, identifying areas where tests are lacking or insufficient and providing a report in JSON format highlighting untested paths, associated test files, and recommendations for improving test coverage.",
    prompt: TEST_COVERAGE_ANALYZER_PROMPT,
    tools: [ "Skill", "Grep", "Glob", "WebSearch", "Read", ...githubTools],
    model: 'inherit'
}

export const TEST_COVERAGE_ANALYZER_AGENT_NAME = "test-coverage-analyzer";