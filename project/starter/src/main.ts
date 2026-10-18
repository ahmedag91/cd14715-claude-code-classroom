import 'dotenv/config';
import {CodeReviewOrchestrator} from './orchestrator.js';
import {
    logger,
    logReviewComplete,
    logReviewError,
    logReviewStart,
    ReportGenerator,
    withRetry,
    withTimeout
} from './utils';
import {buildOrchestratorPrompt} from "./prompts";
import "./agents";
import {ReviewReport} from "./types";
import {
    codeQualityAnalyzer,
    QUALITY_ANALYZER_AGENT_NAME,
    REFACTORING_SUGGESTER_AGENT_NAME,
    refactoringSuggester,
    TEST_COVERAGE_ANALYZER_AGENT_NAME,
    testCoverageAnalyzer
} from "./agents";
import {globalRateLimiter, withRateLimit} from "./utils/rate-limiter";

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev <owner> <repo> <pr-number>
 */
async function main() {
    const [owner, repo, prStr] = process.argv.slice(2);

    // TODO: Validate command line arguments
    // - Check if owner, repo, and prStr are provided
    // - Convert prStr to number and validate it's a valid integer
    // - Exit with error message if validation fails
    if (!owner || !repo || !prStr) {
        console.error("Error: Missing required arguments. Usage: npm run dev <owner> <repo> <pr-number>");
        process.exit(1);
    }
    const prNumber = parseInt(prStr, 10);
    if (isNaN(prNumber)) {
        console.error("Error: Pull request number must be a valid integer.");
        process.exit(1);
    }

    // TODO: Validate authentication (choose ONE method)
    // Students must have either:
    //   - ANTHROPIC_API_KEY environment variable, OR
    //   - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY for Bedrock
    //
    // If using AWS Bedrock:
    //   - Verify AWS_REGION is set
    //   - Log: "🔐 Using AWS Bedrock authentication"
    // If using Anthropic API:
    //   - Log: "🔐 Using Anthropic API authentication"
    // If neither method is configured:
    //   - Exit with clear error message showing both options
    if (process.env.ANTHROPIC_API_KEY) {
        console.log("🔐 Using Anthropic API authentication");
    } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        if (!process.env.AWS_REGION) {
            console.error("Error: AWS_REGION must be set for AWS Bedrock authentication.");
            process.exit(1);
        }
        console.log("🔐 Using AWS Bedrock authentication");
    } else {
        console.error("Error: No authentication method configured. Please set either ANTHROPIC_API_KEY or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
        process.exit(1);
    }

    // TODO: Validate ANTHROPIC_MODEL environment variable
    // This is REQUIRED for both authentication methods
    // - For AWS Bedrock: us.anthropic.claude-sonnet-4-5-20250929-v1:0
    // - For Anthropic API: claude-sonnet-4-5-20250929
    // Exit with error if not set

    if (!process.env.ANTHROPIC_MODEL) {
        console.error("Error: ANTHROPIC_MODEL environment variable must be set.");
        process.exit(1);
    }

    console.log('start here', owner, repo, prStr)
    try {
        // TODO: Create orchestrator instance
        // TODO: Call .reviewPullRequest(owner, repo, prNumber);
        // TODO: Generate formatted reports using ReportGenerator
        // Hint: Use ReportGenerator to create Markdown, HTML, and JSON reports
        // Save reports to 'reports/' directory with appropriate filenames
        const orchestrator = new CodeReviewOrchestrator({
            orchestratorPrompt: buildOrchestratorPrompt,
            subAgents: {
                [QUALITY_ANALYZER_AGENT_NAME]: codeQualityAnalyzer,
                [TEST_COVERAGE_ANALYZER_AGENT_NAME]: testCoverageAnalyzer,
                [REFACTORING_SUGGESTER_AGENT_NAME]: refactoringSuggester,
            }
        });
        const startTime = Date.now();
        logReviewStart(owner, repo, prNumber);
        // Shared across every retry attempt by reference: each attempt writes the
        // real session_id as messages stream in, so a retry after a timeout resumes
        // the prior session instead of restarting from scratch.
        const sessionTracker: { sessionId?: string } = {};
        const reviewReport = await withRetry(() =>
            withRateLimit(globalRateLimiter,
                () => withTimeout(
                    () => orchestrator.reviewPullRequest(owner, repo, prNumber, sessionTracker),
                    600000,
                    'Review pull request timed out'
                )
            )
        );
        logReviewComplete(owner, repo, prNumber, reviewReport.summary.overallScore, Math.round((Date.now() - startTime) / 100) / 10);

        // Generate reports
        const reportGenerator = new ReportGenerator();
        const filePath = `reports/${owner}_${repo}_pr${prNumber}_report`;

        for await (const [fileType, generateFile] of Object.entries(type2FileGenerator)) {
            console.log("#".repeat(50));
            console.log("Generating report:", `${filePath}.${fileType}`);

            try {
                const report = generateFile(reviewReport, reportGenerator);
                await reportGenerator.saveReport(report, `${filePath}.${fileType}`);
            } catch (error) {
                logger.error(`Error generating report for ${fileType}:`, error);
            }
        }

    } catch (error) {
        logReviewError(owner, repo, prNumber, error as Error);
    }
}

const type2FileGenerator: Record<string, (report: ReviewReport, reportGenerator: ReportGenerator) => string> = {
    'md': (report: ReviewReport, reportGenerator: ReportGenerator) => reportGenerator.generateMarkdownReport(report),
    'html': (report: ReviewReport, reportGenerator: ReportGenerator) => reportGenerator.generateHTMLReport(report),
    'json': (report: ReviewReport, reportGenerator: ReportGenerator) => reportGenerator.generateJSONReport(report),
};

main();
