/**
 * Sentiment Agent Evaluators
 *
 * 1. Tool Call Evaluator - Did the agent call the correct tool?
 * 2. Schema Validity Evaluator - Is the output valid against the Zod schema?
 * 3. Accuracy Evaluator - Does the sentiment match the expected value?
 */

import { SentimentAnalysisSchema, type SentimentAnalysis, type SentimentTestCase } from "../types.js";
import type { AgentTrace } from "../sentiment-agent.js";

// -----------------------------------------------------------------------------
// Evaluator Result Types
// -----------------------------------------------------------------------------

export interface EvaluatorResult {
  name: string;
  passed: boolean;
  score: number; // 0 to 1
  details: string;
}

export interface EvaluationReport {
  testCase: SentimentTestCase;
  evaluators: EvaluatorResult[];
  overallPassed: boolean;
  overallScore: number;
}

// -----------------------------------------------------------------------------
// Checks if the agent called the sentiment analysis tool correctly
// -----------------------------------------------------------------------------

export function evaluateToolCall(trace: AgentTrace): EvaluatorResult {
  const expectedTool = "mcp__sentiment-analyzer__analyze_sentiment";
  const toolCalls = trace.toolCalls;

  if (toolCalls.length === 0)
    return {
      name: "Tool Call Evaluator",
      passed: false,
      score: 0,
      details: "No tool calls were made",
    }

  const anyCorrectToolCalled = toolCalls.some(call => call.name === expectedTool);
  if(!anyCorrectToolCalled)
    return {
      name: "Tool Call Evaluator",
      passed: false,
      score: 0.25,
      details: `Expected tool '${expectedTool}' was not called. Called Tools are : ${toolCalls.map(c => c.name).join(", ")}`,
    }

  const correctToolCall = toolCalls.find(call => call.name === expectedTool);
  if(!correctToolCall || !correctToolCall.input || typeof correctToolCall.input.text !== "string")
    return {
      name: "Tool Call Evaluator",
      passed: false,
      score: 0.5,
      details: `The tool '${expectedTool}' was called but the 'text' parameter is missing or invalid.`,
    }

  return {
    name: "Tool Call Evaluator",
    passed: true,
    score: 1,
    details: "Tool was called correctly with valid parameters.",
  };
}

// -----------------------------------------------------------------------------
// Checks if the output conforms to the SentimentAnalysis Zod schema
// -----------------------------------------------------------------------------

export function evaluateSchemaValidity(trace: AgentTrace): EvaluatorResult {
  const result = trace.result;

  if(!result)
    return {
      name: "Schema Validity Evaluator",
      passed: false,
      score: 0,
      details: "No result was produced by the agent.",
    }

  const validation = SentimentAnalysisSchema.safeParse(result);
  if(!validation.success)
    return {
      name: "Schema Validity Evaluator",
      passed: false,
      score: 0.5,
      details: `Result does not conform to the expected schema. Errors: ${JSON.stringify(validation.error.format())}`,
    }

  const validationChecks = [
    {field: "text", valid: result.text && typeof result.text === "string" && result.text.length > 0},
    {
      field: "sentiment",
      valid: typeof result.sentiment === "string" && ["positive", "negative", "neutral"].includes(result.sentiment)
    },
    {
        field: "confidence",
      valid: typeof result.confidence === "number" && result.confidence >= 0 && result.confidence <= 1
    },
    {
        field: "keywords",
        valid: Array.isArray(result.keywords) && result.keywords.every(k => typeof k === "string")
    },
    {
        field: "explanation",
        valid: result.explanation && typeof result.explanation === "string" && result.explanation.length > 0
    }
  ];

  const invalidResults = validationChecks.filter(check => !check.valid)
  if(invalidResults.length > 0)
    return {
      name: "Schema Validity Evaluator",
      passed: false,
      score: 1.0 - (invalidResults.length * 1.0/ validationChecks.length),
      details: `Some fields are invalid: ${invalidResults.map(check => check.field).join(", ")}`,
    }

  return {
    name: "Schema Validity Evaluator",
    passed: true,
    score: 1,
    details: "The model output conforms to the expected schema.",
  };
}

// -----------------------------------------------------------------------------
// Checks if the detected sentiment matches the expected sentiment
// -----------------------------------------------------------------------------

export function evaluateAccuracy(
  trace: AgentTrace,
  testCase: SentimentTestCase
): EvaluatorResult {
  const result = trace.result;

  if (!result)
    return {
      name: "Accuracy Evaluator",
      passed: false,
      score: 0,
      details: "No result was produced by the agent.",
    };

  if (result.sentiment !== testCase.expectedSentiment) {
    return {
      name: "Accuracy Evaluator",
      passed: true,
      score: 0.5,
      details: `Detected sentiment ${result.sentiment} does not match expected sentiment ${testCase.expectedSentiment}.`,
    };
  }

  return {
    name: "Accuracy Evaluator",
    passed: true,
    score: 1,
    details: `Detected sentiment ${result.sentiment} matches expected sentiment ${testCase.expectedSentiment}.`,
  };
}

// -----------------------------------------------------------------------------
// Run All Evaluators
// -----------------------------------------------------------------------------

export function runEvaluators(
  trace: AgentTrace,
  testCase: SentimentTestCase
): EvaluationReport {
  const evaluators: EvaluatorResult[] = [
    evaluateToolCall(trace),
    evaluateSchemaValidity(trace),
    evaluateAccuracy(trace, testCase),
  ];

  const overallPassed = evaluators.every(e => e.passed);
  const overallScore = evaluators.reduce((sum, e) => sum + e.score, 0) / evaluators.length;

  return {
    testCase,
    evaluators,
    overallPassed,
    overallScore,
  };
}
