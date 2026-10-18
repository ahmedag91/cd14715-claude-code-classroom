import "dotenv/config";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { query, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// -----------------------------------------------------------------------------
// Exported Types (provided - no changes needed)
// -----------------------------------------------------------------------------

export const SalesBriefingSchema = z.object({
  companyProfile: z.object({
    name: z.string(),
    industry: z.string(),
    employeeCount: z.number(),
    estimatedRevenue: z.string(),
    techStack: z.array(z.string()),
    recentNews: z.array(z.string()),
  }),
  competitiveAnalysis: z.object({
    currentSolution: z.string(),
    ourAdvantages: z.array(z.string()),
    theirConcerns: z.array(z.string()),
  }),
  qualification: z.object({
    budget: z.object({
      hasBudget: z.boolean(),
      estimatedBudget: z.number(),
    }),
    authority: z.object({
      contactIsDecisionMaker: z.boolean(),
      decisionMakers: z.array(z.string()),
    }),
    need: z.object({
      painPoints: z.array(z.string()),
      urgency: z.enum(["high", "medium", "low"]),
    }),
    timeline: z.string(),
    dealSize: z.number(),
    winProbability: z.number().min(0).max(100),
  }),
  recommendation: z.enum(["Pursue", "Nurture", "Disqualify"]),
  talkingPoints: z.array(z.string()),
});

export type SalesBriefing = z.infer<typeof SalesBriefingSchema>;

export const SalesBriefingJSONSchema = zodToJsonSchema(SalesBriefingSchema, {
  $refStrategy: "root",
});

// -----------------------------------------------------------------------------
// TODO 1: Implement async generator input mode
// This is the recommended pattern for streaming compatibility
// -----------------------------------------------------------------------------

async function* generateMessages(userMessage: string) {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: userMessage },
    parent_tool_use_id: null,
    session_id: "Sales-Opportunity-Orchestrator-Session",
  };
}

const subagents: Record<string, AgentDefinition> = {
    "company-researcher": {
    description: "Research Specialist that gathers company information",
    prompt: ` You are a research specialist
    You have now a company PROSPECT and CONTACT details of it. You should use WebSearch tool and gather the following information:
    - Company size. The total number of employees globally
    - Company industry profile including the ones it recently entered, the ones it recently exited, and the the one it is still active in.
    - Technologies and tech-stalk being used to develop their products
    - Company news including the positive and negative ones sorted in descending order 
    `,
    tools: ["WebSearch"],
    model: "sonnet",
  },

  "competitive-analyzer": {
    description: "A competition analyst comparing the company's solution to ours ",
    prompt: `You are a competitive analyst
    For the given company details provided, you should analyse them and return their competitive position. 
    when given the company details, you should return the following information:
    - Current solution they are using to solve their problems
    - Our advantages over their current solution
    - Their concerns about our solution and how we can address them
    - Switching barriers and costs
    `,
    tools: [], // No tools needed
    model: "haiku",
  },
  "qualification-scorer": {
    description: "Score provider that evaluates BANT criteria and deal probability",
    prompt: `
    
    - Provide a detailed assessment of the BANT criteria (Budget, Authority, Need, Timeline) for the given company and contact information. 
    - Calculate the deal size and win probability based on the gathered data and return such result
    
    `,
    tools: [],
    model: "sonnet",
  },
};

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

export interface ContactInfo {
  name: string;
  title: string;
  email: string;
}

export async function qualifyOpportunity(
  companyName: string,
  contactInfo: ContactInfo
): Promise<SalesBriefing> {
  const orchestratorPrompt = `You are a sales intelligence orchestrator coordinating specialized subagents.

You have access to three subagents via the Task tool:
- company-researcher: Gathers company intelligence
- competitive-analyzer: Analyzes competitive position
- qualification-scorer: Assesses BANT and calculates deal metrics

PROSPECT: ${companyName}
CONTACT: ${contactInfo.name}, ${contactInfo.title} (${contactInfo.email})

WORKFLOW:
1. Use company-researcher to research the company
2. Use competitive-analyzer to analyze their competitive position
3. Use qualification-scorer to assess BANT and calculate deal probability

After all agents complete, compile a comprehensive sales briefing with:
- Company profile
- Competitive analysis
- BANT qualification scores
- Deal size and win probability
- Recommendation (Pursue/Nurture/Disqualify)
- 3-4 talking points for the sales rep

Return the briefing as structured JSON.`;

  for await (const message of query({
    prompt: generateMessages(orchestratorPrompt),
    options: {
      allowedTools: ["Task"],
      agents: subagents,
      model: process.env.ANTHROPIC_MODEL,
      maxTurns: 15,
      outputFormat: {
        type: "json_schema",
        schema: SalesBriefingJSONSchema,
      },
    },
  })) {

    if (message.type === "assistant") {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        const taskBlocks = content.filter(
          (block) => block.type === "tool_use" && block.name === "Task",
        );
        if (taskBlocks.length > 0)
          taskBlocks.forEach((block) => {
            console.log(
                `[Orchestrator]: Launching subagent ${(block as any).input?.subagent_type}.`);
          })
        else console.log("[Orchestrator]: No subagents invoked in this turn");
      }
    } else if (message.type === "result" && message.subtype === "success") {
      console.log(
        `[Orchestrator]: Received final structured results`,
        message.structured_output,
      );

      const parsedResults = SalesBriefingSchema.safeParse(
        message.structured_output,
      );

      if (parsedResults.success) {
        return parsedResults.data
      }

      throw new Error(
        `Schema validation failed: ${parsedResults.error.message}`,
      );
    }
  }

  throw new Error("Orchestrator failed. No Success result received from subagents.");
}
