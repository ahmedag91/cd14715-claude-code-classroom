import {AgentDefinition} from "@anthropic-ai/claude-agent-sdk";
import {TEST_COVERAGE_ANALYZER_PROMPT} from "../prompts";


export const testCoverageAnalyzer: AgentDefinition = {
    description: "Analyzes code for test coverage, identifying areas where tests are lacking or insufficient and providing a report in JSON format highlighting untested paths, associated test files, and recommendations for improving test coverage.",
    prompt: TEST_COVERAGE_ANALYZER_PROMPT,
    tools: [ "Skill", "Read", "WebSearch"],
    model: 'inherit'
}