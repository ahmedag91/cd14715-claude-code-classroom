import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator';
import { logAgentStart, logAgentComplete, ErrorCodes } from '../src/utils';
import type { ReviewReport } from '../src/types/report-types';
import {
  codeQualityAnalyzer,
  QUALITY_ANALYZER_AGENT_NAME,
  REFACTORING_SUGGESTER_AGENT_NAME,
  refactoringSuggester,
  TEST_COVERAGE_ANALYZER_AGENT_NAME,
  testCoverageAnalyzer
} from "../src/agents";

// Mock the SDK's query() generator before importing the orchestrator, since
// orchestrator.ts imports `query` at module load time. Wrapping in an arrow
// fn sidesteps Vitest's hoisting restriction on referencing outer variables
// directly inside vi.mock's factory.
const queryMock = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

// Keep ReviewError/ErrorCodes real (needed for instanceof/.code assertions),
// but stub the logging side-effects so tests don't write to real log files
// and so logAgentStart/logAgentComplete become spyable mock functions.
vi.mock('../src/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
    logAgentStart: vi.fn(),
    logAgentComplete: vi.fn(),
    logReviewError: vi.fn(),
  };
});

// --- fixture helpers ---

function sdkAssistant(content: any[]): any {
  return { type: 'assistant', message: { role: 'assistant', content } };
}

function taskToolUseBlock(id: string, subagentType: string, file: string) {
  return { type: 'tool_use', id, name: 'Task', input: { subagent_type: subagentType, description: file } };
}

function sdkUserToolResult(parentToolUseId: string): any {
  return { type: 'user', parent_tool_use_id: parentToolUseId, message: { role: 'user', content: [] } };
}

function sdkResultSuccess(structuredOutput: unknown): any {
  return { type: 'result', subtype: 'success', structured_output: structuredOutput };
}

function sdkResultError(subtype: string, errors: string[] = ['boom']): any {
  return { type: 'result', subtype, errors };
}

function mockQueryStream(messages: any[]) {
  queryMock.mockReturnValue((async function* () {
    for (const m of messages) yield m;
  })());
}

function validReviewReport(): ReviewReport {
  return {
    pullRequest: { owner: 'octocat', repo: 'hello-world', number: 1 },
    fileReviews: [{
      file: 'src/index.ts',
      codeQuality: { file: 'src/index.ts', issues: [], overallScore: 90, summary: 'Looks good' },
      testCoverage: { file: 'src/index.ts', hasTests: true, testFiles: ['src/index.test.ts'], untestedPaths: [], coverageEstimate: 80, summary: 'Well covered' },
      refactorings: { file: 'src/index.ts', suggestions: [], summary: 'No refactors needed' },
    }],
    summary: { totalFiles: 1, overallScore: 90, criticalIssues: 0, highPriorityTests: 0, refactoringOpportunities: 0 },
    recommendations: [],
    metadata: { analyzedAt: new Date().toISOString(), duration: 1.2, agentVersions: { 'code-quality-analyzer': '1.0.0' } },
  };

}
const fakeSubAgents = {
  'code-quality-analyzer': { description: 'quality', prompt: 'p1', tools: ['Read'], model: 'inherit' as const },
  'test-coverage-analyzer': { description: 'coverage', prompt: 'p2', tools: ['Read'], model: 'inherit' as const },
  'refactoring-suggester': { description: 'refactor', prompt: 'p3', tools: ['Read'], model: 'inherit' as const },
};

const fakePrompt = (owner: string, repo: string, prNumber: number) =>
  `review ${owner}/${repo}#${prNumber}`;

beforeEach(() => {
  queryMock.mockReset();
  vi.clearAllMocks();
});

/**
 * Tests for CodeReviewOrchestrator
 */

describe('CodeReviewOrchestrator', () => {
  describe('Configuration', () => {
    it('should initialize with default options', () => {
      const orchestrator = new CodeReviewOrchestrator({ orchestratorPrompt: fakePrompt, subAgents: fakeSubAgents });
      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
      expect(typeof orchestrator.reviewPullRequest).toBe('function');
    });

    // Note: the skeleton's original name for this test was "should accept custom
    // rate limit configuration", but CodeReviewOrchestrator's constructor only
    // accepts { orchestratorPrompt, subAgents } - there is no rate-limit option
    // anywhere on this class (rate limiting is applied one layer up, in main.ts).
    // Repurposed to verify what the constructor actually takes.
    it('should pass custom subAgents and orchestratorPrompt through to the underlying query() call', async () => {
      mockQueryStream([sdkResultSuccess(validReviewReport())]);
      const orchestrator = new CodeReviewOrchestrator({ orchestratorPrompt: fakePrompt, subAgents: fakeSubAgents });
      await orchestrator.reviewPullRequest('octocat', 'hello-world', 1);

      expect(queryMock).toHaveBeenCalledTimes(1);
      const callArgs = queryMock.mock.calls[0][0];
      expect(callArgs.options.agents).toBe(fakeSubAgents);

      // prompt is the async generator from the private generateMessages() method
      const firstMessage = (await callArgs.prompt[Symbol.asyncIterator]().next()).value;
      expect(firstMessage.message.content).toBe(fakePrompt('octocat', 'hello-world', 1));
    });
  });

  describe('reviewPullRequest', () => {
    it('should fetch PR files from GitHub MCP', async () => {
      mockQueryStream([sdkResultSuccess(validReviewReport())]);
      const orchestrator = new CodeReviewOrchestrator({ orchestratorPrompt: fakePrompt, subAgents: fakeSubAgents });
      await orchestrator.reviewPullRequest('octocat', 'hello-world', 1);

      const { options } = queryMock.mock.calls[0][0];
      expect(options.allowedTools).toEqual(expect.arrayContaining(['mcp__github__*']));
      expect(options.mcpServers.github).toMatchObject({
        type: 'stdio',
        command: 'npx',
        args: expect.arrayContaining(['@modelcontextprotocol/server-github']),
      });
    });

    it('should spawn all 3 subagents in parallel', async () => {
      mockQueryStream([
        sdkAssistant([
          taskToolUseBlock('tool_1', 'code-quality-analyzer', 'src/index.ts'),
          taskToolUseBlock('tool_2', 'test-coverage-analyzer', 'src/index.ts'),
          taskToolUseBlock('tool_3', 'refactoring-suggester', 'src/index.ts'),
        ]),
        sdkUserToolResult('tool_1'),
        sdkUserToolResult('tool_2'),
        sdkUserToolResult('tool_3'),
        sdkResultSuccess(validReviewReport()),
      ]);
      const orchestrator = new CodeReviewOrchestrator({ orchestratorPrompt: fakePrompt, subAgents: fakeSubAgents });
      await orchestrator.reviewPullRequest('octocat', 'hello-world', 1);

      expect(logAgentStart).toHaveBeenCalledTimes(3);
      expect(logAgentStart).toHaveBeenCalledWith('code-quality-analyzer', 'src/index.ts');
      expect(logAgentStart).toHaveBeenCalledWith('test-coverage-analyzer', 'src/index.ts');
      expect(logAgentStart).toHaveBeenCalledWith('refactoring-suggester', 'src/index.ts');
      expect(logAgentComplete).toHaveBeenCalledTimes(3);
    });

    it('should aggregate results into ReviewReport', async () => {
      const expected = validReviewReport();
      mockQueryStream([sdkResultSuccess(expected)]);
      const orchestrator = new CodeReviewOrchestrator({ orchestratorPrompt: fakePrompt, subAgents: fakeSubAgents });
      const result = await orchestrator.reviewPullRequest('octocat', 'hello-world', 1);

      // result is the Zod-parsed copy, not reference-identical to `expected`
      expect(result).toEqual(expected);
      expect(result.fileReviews).toHaveLength(1);
    });

    it('should validate output with Zod schema', async () => {
      const invalidOutput = {
        pullRequest: { owner: 'octocat', repo: 'hello-world', number: 1 },
        fileReviews: [],
        // summary intentionally omitted -> fails ReviewReportSchema
        recommendations: [],
        metadata: { analyzedAt: 'x', duration: 1, agentVersions: {} },
      };
      mockQueryStream([sdkResultSuccess(invalidOutput)]);
      const orchestrator = new CodeReviewOrchestrator({ orchestratorPrompt: fakePrompt, subAgents: fakeSubAgents });

      await expect(orchestrator.reviewPullRequest('octocat', 'hello-world', 1))
        .rejects.toMatchObject({ name: 'ReviewError', code: ErrorCodes.VALIDATION_FAILED });
    });

    // Additional failure-path coverage beyond the skeleton's 4 required blocks -
    // exercises createReviewErrorAndLog's handling of an SDK error_* result subtype.
    it('should throw AGENT_FAILED when the SDK reports error_max_turns', async () => {
      mockQueryStream([sdkResultError('error_max_turns')]);
      const orchestrator = new CodeReviewOrchestrator({ orchestratorPrompt: fakePrompt, subAgents: fakeSubAgents });
      await expect(orchestrator.reviewPullRequest('octocat', 'hello-world', 1))
        .rejects.toMatchObject({ code: ErrorCodes.AGENT_FAILED });
    });
  });

  describe('Integration', () => {
    it.skip('should review a real small PR', async () => {
      vi.doUnmock('@anthropic-ai/claude-agent-sdk');
      vi.doUnmock('../src/utils');
      vi.resetModules();

      const { CodeReviewOrchestrator: RealCodeReviewOrchestrator } = await import('../src/orchestrator');
      const { buildOrchestratorPrompt } = await import('../src/prompts');

      const realOrchestrator = new RealCodeReviewOrchestrator({
        orchestratorPrompt: buildOrchestratorPrompt,
        subAgents: {
          [QUALITY_ANALYZER_AGENT_NAME]: codeQualityAnalyzer,
          [TEST_COVERAGE_ANALYZER_AGENT_NAME]: testCoverageAnalyzer,
          [REFACTORING_SUGGESTER_AGENT_NAME]: refactoringSuggester,
        },
      });

      const result = await realOrchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      expect(result.pullRequest).toEqual({ owner: 'octocat', repo: 'Hello-World', number: 1 });
      expect(Array.isArray(result.fileReviews)).toBe(true);
      expect(typeof result.summary.overallScore).toBe('number');
    }, 600000); // 10 min timeout - a real run can take several minutes (see this session's live traces)
  });
});
