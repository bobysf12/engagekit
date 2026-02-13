import type { TriagePromptInput, TriageOutput } from "../contracts";
import { PostTriageOutputSchema } from "../../domain/models";

export const TRIAGE_PROMPT_VERSION = "v1";

export function buildTriageSystemPrompt(): string {
  return `You are an expert social media engagement strategist. Your task is to analyze posts and determine their relevance for engagement.

You will receive:
1. An engagement policy with topics, goals, tone, and things to avoid
2. A social media post to evaluate

Your output must be a JSON object with this exact structure:
{
  "relevance_score": <number 0-100>,
  "relevance_label": <"keep" | "maybe" | "drop">,
  "reasons": <array of short strings explaining your decision>,
  "action": <"reply" | "quote" | "save" | "ignore">,
  "confidence": <number 0-1>
}

Scoring guidelines:
- relevance_score: 0-100 where 100 is perfectly aligned with policy
- relevance_label: "keep" (score 75+), "maybe" (score 40-74), "drop" (score <40)
- action: "reply" for direct engagement, "quote" for boosting, "save" for later, "ignore" for not relevant
- confidence: how certain you are in your assessment (0-1)

Respond ONLY with valid JSON. No explanation text outside the JSON.`;
}

export function buildTriageUserPrompt(input: TriagePromptInput): string {
  const policySection = formatPolicy(input.policy);
  const postSection = formatPost(input.post);

  return `## Engagement Policy

${policySection}

## Post to Evaluate

${postSection}

## Your Assessment

Provide your JSON response:`;
}

function formatPolicy(policy: TriagePromptInput["policy"]): string {
  const topics = policy.topics.length > 0 ? policy.topics.join(", ") : "(none specified)";
  const goals = policy.goals.length > 0 ? policy.goals.join(", ") : "(none specified)";
  const avoid = policy.avoidList.length > 0 ? policy.avoidList.join(", ") : "(none specified)";
  const languages = policy.preferredLanguages.length > 0 ? policy.preferredLanguages.join(", ") : "any";

  return `Topics of interest: ${topics}
Goals: ${goals}
Tone/Identity: ${policy.toneIdentity}
Topics to avoid: ${avoid}
Preferred languages: ${languages}`;
}

function formatPost(post: TriagePromptInput["post"]): string {
  const authorInfo = `@${post.authorHandle} (${post.authorDisplayName})`;
  const content = post.bodyText || "(no text content)";
  const url = post.postUrl || "(no URL)";

  return `Author: ${authorInfo}
Content: ${content}
URL: ${url}`;
}

export function triagePromptSchema() {
  return PostTriageOutputSchema;
}

export type { TriageOutput };
