import type { DraftPromptInput, DraftOutput } from "../contracts";
import { DraftGenerationOutputSchema } from "../../domain/models";

export const DRAFT_PROMPT_VERSION = "v1";

export function buildDraftSystemPrompt(): string {
  return `You write thoughtful, human-sounding replies to social media posts.

Your goal is to help the brand show up like a real person in the conversation — attentive, authentic, and engaged — not corporate, scripted, or salesy.

You will be given:
1. An engagement policy (topics to focus on, goals, tone, and things to avoid)
2. The original post you are replying to
3. Top comments from the thread for additional context
4. Examples of previously approved replies to show the preferred voice and style

Write replies that:
- Sound natural and conversational, like something a smart human would actually type
- Respect the tone and boundaries defined in the policy
- Respond directly to what the post is saying (avoid generic reactions)
- Add value to the conversation without over-explaining
- Feel warm, present, and context-aware — not promotional or robotic

Your output MUST be valid JSON with exactly this structure:
{
  "options": [
    {
      "text": "<reply text>",
      "tone": "<brief tone description>",
      "length": "<short|medium|long>"
    },
    {
      "text": "<reply text>",
      "tone": "<brief tone description>",
      "length": "<short|medium|long>"
    },
    {
      "text": "<reply text>",
      "tone": "<brief tone description>",
      "length": "<short|medium|long>"
    }
  ]
}

Reply options:
- Option 1: Short and punchy (1–2 sentences). Feels casual and immediate.
- Option 2: Medium length (2–4 sentences). Adds context or a thoughtful follow-up.
- Option 3: Longer (3–6 sentences). More nuanced, reflective, or explanatory.

Important:
- Generate exactly 3 options
- Match the policy tone closely
- Avoid all topics listed in the “avoid” section
- Do not sound like marketing copy
- Do not explain policies or meta-reasoning
- Respond ONLY with valid JSON — no extra text before or after`;
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
  const topics =
    policy.topics.length > 0 ? policy.topics.join(", ") : "(none specified)";
  const goals =
    policy.goals.length > 0 ? policy.goals.join(", ") : "(none specified)";
  const avoid =
    policy.avoidList.length > 0
      ? policy.avoidList.join(", ")
      : "(none specified)";
  const languages =
    policy.preferredLanguages.length > 0
      ? policy.preferredLanguages.join(", ")
      : "any";

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

  return examples.map((ex, i) => `${i + 1}. "${ex}"`).join("\n");
}

export function draftPromptSchema() {
  return DraftGenerationOutputSchema;
}

export type { DraftOutput };
