import type { Command } from "commander";
import { draftFeedbackRepo } from "../../db/repositories/draft-feedback.repo";
import { postsRepo } from "../../db/repositories/posts.repo";
import { logger } from "../../core/logger";

export const commands = (program: Command) => {
  program
    .command("drafts:list")
    .requiredOption("--run-account <id>", "Run Account ID")
    .option("--post <id>", "Filter by Post ID")
    .option("--status <status>", "Filter by status (generated, approved, rejected)")
    .action(async (options) => {
      const runAccountId = parseInt(options.runAccount, 10);
      const postId = options.post ? parseInt(options.post, 10) : undefined;

      if (postId) {
        const drafts = await draftFeedbackRepo.findDraftsByPost(runAccountId, postId);
        await displayDraftsForPost(postId, drafts);
      } else {
        console.log(`Use --post <id> to view drafts for a specific post.`);
        console.log(`Run 'triage:list --run-account ${runAccountId} --selected' to find posts with drafts.`);
      }
    });

  program
    .command("drafts:select")
    .requiredOption("--id <id>", "Draft ID to select")
    .option("--by <who>", "Who selected this draft", "cli")
    .action(async (options) => {
      const draftId = parseInt(options.id, 10);
      const draft = await draftFeedbackRepo.findDraftById(draftId);

      if (!draft) {
        console.log(`Draft ${draftId} not found`);
        process.exit(1);
      }

      if (draft.status !== "generated") {
        console.log(`Draft ${draftId} already has status: ${draft.status}`);
        process.exit(1);
      }

      const updated = await draftFeedbackRepo.selectDraft(draftId, options.by);

      const otherDrafts = await draftFeedbackRepo.findDraftsByPost(
        draft.runAccountId!,
        draft.postId!
      );

      for (const other of otherDrafts) {
        if (other.id !== draftId && other.status === "generated") {
          await draftFeedbackRepo.rejectDraft(other.id);
        }
      }

      const post = await postsRepo.findById(draft.postId!);

      logger.info({ draftId, postId: draft.postId }, "Draft selected");
      console.log(`Draft ${draftId} selected for post ${draft.postId}`);
      console.log(`  Author: @${post?.authorHandle}`);
      console.log(`  Selected text: ${updated?.draftText}`);
    });

  program
    .command("drafts:reject")
    .requiredOption("--id <id>", "Draft ID to reject")
    .action(async (options) => {
      const draftId = parseInt(options.id, 10);
      const draft = await draftFeedbackRepo.findDraftById(draftId);

      if (!draft) {
        console.log(`Draft ${draftId} not found`);
        process.exit(1);
      }

      await draftFeedbackRepo.rejectDraft(draftId);
      logger.info({ draftId }, "Draft rejected");
      console.log(`Draft ${draftId} rejected`);
    });

  program
    .command("drafts:feedback")
    .requiredOption("--run-account <id>", "Run Account ID")
    .option("--limit <n>", "Number of signals to show", "20")
    .action(async (options) => {
      const runAccountId = parseInt(options.runAccount, 10);
      const limit = parseInt(options.limit, 10);

      const signals = await draftFeedbackRepo.listSignalsByRunAccount(runAccountId, limit);

      console.log(`Draft feedback signals (${signals.length})`);

      for (const signal of signals) {
        const selectedDraft = signal.selectedDraftId
          ? await draftFeedbackRepo.findDraftById(signal.selectedDraftId)
          : null;
        const post = await postsRepo.findById(signal.postId);

        console.log(`  [${signal.id}] Post ${signal.postId} @${post?.authorHandle || "unknown"}`);
        console.log(`    Selected: ${selectedDraft?.draftText?.slice(0, 80) || "(none)"}...`);
        console.log(`    At: ${new Date(signal.createdAt * 1000).toISOString()}`);
      }
    });
};

async function displayDraftsForPost(postId: number, drafts: import("../../db/schema").LlmDraft[]) {
  const post = await postsRepo.findById(postId);

  console.log(`Drafts for post ${postId}`);
  console.log(`  Author: @${post?.authorHandle} (${post?.authorDisplayName})`);
  console.log(`  Content: ${post?.bodyText?.slice(0, 150) || "(no text)"}...`);
  console.log(`  URL: ${post?.postUrl || "(no url)"}`);
  console.log("");

  for (const draft of drafts) {
    const statusIcon = draft.status === "approved" ? "★" : draft.status === "rejected" ? "✗" : "○";
    const optionNum = (draft.optionIndex ?? 0) + 1;

    console.log(`${statusIcon} Option ${optionNum} [${draft.id}] (${draft.status})`);
    console.log(`  ${draft.draftText}`);
    console.log("");
  }
}
