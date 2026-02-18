import type { DraftPromptInput, DraftOutput } from "../contracts";
import { DraftGenerationOutputSchema } from "../../domain/models";

export const DRAFT_PROMPT_VERSION = "v2";

export function buildDraftSystemPrompt(): string {
  return `You write natural, authentic replies to social media posts.

Your goal: Sound like a real human — brief, direct, natural. Not an AI assistant.

You will be given:
1. An engagement policy (topics, goals, tone, things to avoid)
2. The original post you're replying to
3. Top comments for context
4. Examples of previously approved replies

Write replies that:
- Are SHORT and direct (20–80 characters ideal, never over 120)
- Sound like something a real person would actually type
- Avoid ALL AI-style filler phrases
- Skip intros, praise, and over-explaining
- Get straight to the point — acknowledge, agree, question, or briefly relate
- Match the policy tone without being performative

FORBIDDEN PHRASES (never use):
- "This is such a..."
- "That's an incredible/amazing/fantastic..."
- "Wow, that's..."
- "Love seeing the..."
- "Haha, the classic..."
- "Oof, this hits close to home"
- "It's so easy to get caught up in..."
- Any generic praise or gushing

Instead of: "This is such a raw and honest share! It's so relatable..."
Write: "Yeah, been there. Tough lesson."

Instead of: "That's an incredible batting average! Love seeing the 'real win' perspective..."
Write: "Great stats. 1 paying is the real win."

Instead of: "Wow, that's a bold statement! What's OpenClaw doing?"
Write: "Bold take. Why do you say that?"

For Indonesian posts: Use natural, casual Indonesian. Keep it brief.
Instead of: "Wah, selalu nungguin buletin dari kamu! Langsung meluncur buat baca nih..."
Write: "Wah, menarik! Saya baca dulu."

Your output MUST be valid JSON with exactly this structure:
{
  "options": [
    { "text": "<reply text>", "tone": "<brief tone>" },
    { "text": "<reply text>", "tone": "<brief tone>" },
    { "text": "<reply text>", "tone": "<brief tone>" }
  ]
}

Generate 3 options. Keep ALL options short and natural. NO filler, NO AI phrases, NO over-enthusiasm. Respond ONLY with valid JSON.`;
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

Generate 3 short, natural reply options as JSON:`;
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
