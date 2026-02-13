import type { DraftPromptInput, DraftOutput } from "../contracts";
import { DraftGenerationOutputSchema } from "../../domain/models";

export const DRAFT_PROMPT_VERSION = "v1";

export function buildDraftSystemPrompt(): string {
  return `You are an expert social media engagement writer. Your task is to generate reply drafts for social media posts.

You will receive:
1. An engagement policy with topics, goals, tone, and things to avoid
2. The original post to reply to
3. Top comments from the thread for context
4. Examples of past approved replies for style reference

Your output must be a JSON object with this exact structure:
{
  "options": [
    {
      "text": "<the reply text>",
      "tone": "<brief tone description>",
      "length": "<short|medium|long>"
    },
    {
      "text": "<the reply text>",
      "tone": "<brief tone description>",
      "length": "<short|medium|long>"
    },
    {
      "text": "<the reply text>",
      "tone": "<brief tone description>",
      "length": "<short|medium|long>"
    }
  ]
}

Requirements:
- Generate exactly 3 reply options
- Option 1: short and punchy (1-2 sentences)
- Option 2: medium length with some context (2-4 sentences)  
- Option 3: longer with more detail (3-6 sentences)
- Match the tone specified in the policy
- Avoid topics from the avoid list
- Be authentic and conversational, not salesy
- Reference specific points from the post when appropriate

Respond ONLY with valid JSON. No explanation text outside the JSON.`;
}

export function buildDraftUserPrompt(input: DraftPromptInput): string {
  const policySection = formatPolicy(input.policy);
  const postSection = formatPost(input.post);
  const commentsSection = formatComments(input.topComments);
  const examplesSection = formatExamples(input.pastApprovedReplies);

  return `## Engagement Policy

${policySection}

## Post to Reply To

${postSection}

## Top Comments for Context

${commentsSection}

## Past Approved Replies (Style Reference)

${examplesSection}

## Your Draft Options

Generate 3 reply options as JSON:`;
}

function formatPolicy(policy: DraftPromptInput["policy"]): string {
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

function formatPost(post: DraftPromptInput["post"]): string {
  const authorInfo = `@${post.authorHandle} (${post.authorDisplayName})`;
  const content = post.bodyText || "(no text content)";
  const url = post.postUrl || "(no URL)";

  return `Author: ${authorInfo}
Content: ${content}
URL: ${url}`;
}

function formatComments(comments: DraftPromptInput["topComments"]): string {
  if (comments.length === 0) {
    return "(no comments available)";
  }

  return comments
    .map((c, i) => {
      const author = `@${c.authorHandle}`;
      const content = c.bodyText || "(no text)";
      return `${i + 1}. ${author}: ${content}`;
    })
    .join("\n");
}

function formatExamples(examples: string[]): string {
  if (examples.length === 0) {
    return "(no past approved replies available)";
  }

  return examples
    .map((ex, i) => `${i + 1}. "${ex}"`)
    .join("\n");
}

export function draftPromptSchema() {
  return DraftGenerationOutputSchema;
}

export type { DraftOutput };
