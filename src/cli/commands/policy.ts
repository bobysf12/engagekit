import type { Command } from "commander";
import { engagementPoliciesRepo } from "../../db/repositories/engagement-policies.repo";
import { logger } from "../../core/logger";

export const commands = (program: Command) => {
  program
    .command("policy:get")
    .requiredOption("--account <id>", "Account ID")
    .action(async (options) => {
      const accountId = parseInt(options.account, 10);
      const policy = await engagementPoliciesRepo.findByAccountId(accountId);

      if (!policy) {
        console.log(`No active policy for account ${accountId}`);
        return;
      }

      console.log(`Policy [${policy.id}] for account ${accountId}`);
      console.log(`  Name: ${policy.name}`);
      console.log(`  Topics: ${JSON.stringify(JSON.parse(policy.topicsJson))}`);
      console.log(`  Goals: ${JSON.stringify(JSON.parse(policy.goalsJson))}`);
      console.log(`  Avoid: ${JSON.stringify(JSON.parse(policy.avoidListJson))}`);
      console.log(`  Tone: ${policy.toneIdentity}`);
      console.log(`  Languages: ${JSON.stringify(JSON.parse(policy.preferredLanguagesJson))}`);
    });

  program
    .command("policy:set")
    .requiredOption("--account <id>", "Account ID")
    .option("--name <name>", "Policy name", "Default Policy")
    .option("--topics <topics...>", "Topics of interest (space-separated)")
    .option("--goals <goals...>", "Engagement goals (reply, quote, learn, find_leads, build_in_public)")
    .option("--avoid <items...>", "Topics to avoid (space-separated)")
    .option("--tone <tone>", "Tone/identity description")
    .option("--languages <langs...>", "Preferred languages (space-separated)")
    .action(async (options) => {
      const accountId = parseInt(options.account, 10);

      const policy = await engagementPoliciesRepo.upsertByAccountId(accountId, {
        name: options.name,
        topicsJson: JSON.stringify(options.topics || []),
        goalsJson: JSON.stringify(options.goals || ["reply"]),
        avoidListJson: JSON.stringify(options.avoid || []),
        toneIdentity: options.tone || "Friendly and helpful",
        preferredLanguagesJson: JSON.stringify(options.languages || ["en"]),
        isActive: 1,
      });

      logger.info({ policyId: policy.id, accountId }, "Policy saved");
      console.log(`Policy [${policy.id}] saved for account ${accountId}`);
    });

  program
    .command("policy:delete")
    .requiredOption("--account <id>", "Account ID")
    .action(async (options) => {
      const accountId = parseInt(options.account, 10);
      await engagementPoliciesRepo.deactivateByAccountId(accountId);
      logger.info({ accountId }, "Policy deactivated");
      console.log(`Policy deactivated for account ${accountId}`);
    });
};
