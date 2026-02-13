import type { EngagementPolicyInput } from "../domain/models";
import { engagementPoliciesRepo } from "../db/repositories/engagement-policies.repo";
import { policySnapshotsRepo } from "../db/repositories/engagement-policy-snapshots.repo";
import { logger } from "../core/logger";
import { TRIAGE_PROMPT_VERSION } from "../llm/prompts/triage";
import { DRAFT_PROMPT_VERSION } from "../llm/prompts/draft";

export class PolicySnapshotService {
  async createSnapshotForRunAccount(
    runAccountId: number,
    accountId: number
  ): Promise<{ snapshotId: number; policyJson: EngagementPolicyInput }> {
    const existing = await policySnapshotsRepo.findByRunAccountId(runAccountId);
    if (existing) {
      logger.debug({ runAccountId, snapshotId: existing.id }, "Policy snapshot already exists");
      const policyJson = JSON.parse(existing.policySnapshotJson) as EngagementPolicyInput;
      return { snapshotId: existing.id, policyJson };
    }

    const policy = await engagementPoliciesRepo.findByAccountId(accountId);
    if (!policy) {
      logger.warn({ accountId }, "No active policy found for account, using defaults");
      const defaultPolicy = this.getDefaultPolicy();
      const snapshot = await policySnapshotsRepo.create({
        runAccountId,
        policyId: null,
        policySnapshotJson: JSON.stringify(defaultPolicy),
        promptVersion: this.getPromptVersion(),
      });
      logger.info({ runAccountId, snapshotId: snapshot.id }, "Created default policy snapshot");
      return { snapshotId: snapshot.id, policyJson: defaultPolicy };
    }

    const policyJson: EngagementPolicyInput = {
      topics: JSON.parse(policy.topicsJson),
      goals: JSON.parse(policy.goalsJson),
      avoidList: JSON.parse(policy.avoidListJson),
      toneIdentity: policy.toneIdentity,
      preferredLanguages: JSON.parse(policy.preferredLanguagesJson),
    };

    const snapshot = await policySnapshotsRepo.create({
      runAccountId,
      policyId: policy.id,
      policySnapshotJson: JSON.stringify(policyJson),
      promptVersion: this.getPromptVersion(),
    });

    logger.info(
      { runAccountId, snapshotId: snapshot.id, policyId: policy.id },
      "Created policy snapshot for run-account"
    );

    return { snapshotId: snapshot.id, policyJson };
  }

  async getSnapshotForRunAccount(
    runAccountId: number
  ): Promise<{ snapshotId: number; policyJson: EngagementPolicyInput } | null> {
    const snapshot = await policySnapshotsRepo.findByRunAccountId(runAccountId);
    if (!snapshot) {
      return null;
    }
    const policyJson = JSON.parse(snapshot.policySnapshotJson) as EngagementPolicyInput;
    return { snapshotId: snapshot.id, policyJson };
  }

  private getDefaultPolicy(): EngagementPolicyInput {
    return {
      topics: [],
      goals: ["reply"],
      avoidList: [],
      toneIdentity: "Friendly and helpful",
      preferredLanguages: ["en"],
    };
  }

  private getPromptVersion(): string {
    return `triage:${TRIAGE_PROMPT_VERSION},draft:${DRAFT_PROMPT_VERSION}`;
  }
}

export const policySnapshotService = new PolicySnapshotService();
