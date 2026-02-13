import type { Command } from "commander";
import { postTriageRepo } from "../../db/repositories/post-triage.repo";
import { postsRepo } from "../../db/repositories/posts.repo";
import { logger } from "../../core/logger";

export const commands = (program: Command) => {
  program
    .command("triage:list")
    .requiredOption("--run-account <id>", "Run Account ID")
    .option("--limit <n>", "Number of results to show", "50")
    .option("--top20", "Show only top 20")
    .option("--selected", "Show only selected for deep scrape")
    .action(async (options) => {
      const runAccountId = parseInt(options.runAccount, 10);
      const limit = parseInt(options.limit, 10);

      let triageResults;
      if (options.top20) {
        triageResults = await postTriageRepo.listTop20(runAccountId);
      } else if (options.selected) {
        triageResults = await postTriageRepo.listSelectedForDeepScrape(runAccountId);
      } else {
        triageResults = await postTriageRepo.listByRunAccount(runAccountId, limit);
      }

      console.log(`Triage results for run-account ${runAccountId} (${triageResults.length} posts)`);
      console.log("");

      for (const t of triageResults) {
        const post = await postsRepo.findById(t.postId);
        const labelIcon = t.relevanceLabel === "keep" ? "✓" : t.relevanceLabel === "maybe" ? "?" : "✗";
        const selectedIcon = t.selectedForDeepScrape ? "★" : t.isTop20 ? "○" : " ";
        const rankStr = t.rank ? `#${t.rank.toString().padStart(2, " ")}` : "   ";

        console.log(
          `${selectedIcon} ${rankStr} [${t.id}] score=${t.relevanceScore.toString().padStart(3, " ")} ${labelIcon} ${t.action.padEnd(6)} @${post?.authorHandle || "unknown"}`
        );
        const reasons = JSON.parse(t.reasonsJson) as string[];
        if (reasons.length > 0) {
          console.log(`      ${reasons[0]}`);
        }
      }
    });

  program
    .command("triage:show")
    .requiredOption("--id <id>", "Triage ID")
    .action(async (options) => {
      const id = parseInt(options.id, 10);
      const triage = await postTriageRepo.findById(id);

      if (!triage) {
        console.log(`Triage ${id} not found`);
        return;
      }

      const post = await postsRepo.findById(triage.postId);

      console.log(`Triage [${triage.id}]`);
      console.log(`  Post ID: ${triage.postId}`);
      console.log(`  Author: @${post?.authorHandle} (${post?.authorDisplayName})`);
      console.log(`  Content: ${post?.bodyText?.slice(0, 200) || "(no text)"}...`);
      console.log(`  URL: ${post?.postUrl || "(no url)"}`);
      console.log("");
      console.log(`  Relevance Score: ${triage.relevanceScore}/100`);
      console.log(`  Label: ${triage.relevanceLabel}`);
      console.log(`  Action: ${triage.action}`);
      console.log(`  Confidence: ${triage.confidence}%`);
      console.log(`  Rank: ${triage.rank ?? "unranked"}`);
      console.log(`  Top 20: ${triage.isTop20 ? "Yes" : "No"}`);
      console.log(`  Selected for Deep Scrape: ${triage.selectedForDeepScrape ? "Yes" : "No"}`);
      console.log("");
      console.log(`  Reasons:`);
      const reasons = JSON.parse(triage.reasonsJson) as string[];
      for (const r of reasons) {
        console.log(`    - ${r}`);
      }
    });
};
