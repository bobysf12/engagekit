import { Router } from "express";
import { engagementPoliciesRepo } from "../../db/repositories/engagement-policies.repo";
import { logger } from "../../core/logger";

export const policiesRoutes = Router();

policiesRoutes.get("/account/:accountId", async (req, res, next) => {
  try {
    const accountId = parseInt(req.params.accountId);
    if (isNaN(accountId)) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }

    const policy = await engagementPoliciesRepo.findByAccountId(accountId);
    if (!policy) {
      res.status(404).json({ error: "No active policy for this account" });
      return;
    }

    res.json({
      ...policy,
      topics: policy.topicsJson ? JSON.parse(policy.topicsJson) : [],
      goals: policy.goalsJson ? JSON.parse(policy.goalsJson) : [],
      avoidList: policy.avoidListJson ? JSON.parse(policy.avoidListJson) : [],
      preferredLanguages: policy.preferredLanguagesJson
        ? JSON.parse(policy.preferredLanguagesJson)
        : ["en"],
    });
  } catch (err) {
    next(err);
  }
});

policiesRoutes.put("/account/:accountId", async (req, res, next) => {
  try {
    const accountId = parseInt(req.params.accountId);
    if (isNaN(accountId)) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }

    const { name, topics, goals, avoidList, toneIdentity, preferredLanguages } = req.body;

    if (!name || !toneIdentity) {
      res.status(400).json({ error: "name and toneIdentity are required" });
      return;
    }

    const policy = await engagementPoliciesRepo.upsertByAccountId(accountId, {
      name,
      topicsJson: JSON.stringify(topics || []),
      goalsJson: JSON.stringify(goals || []),
      avoidListJson: JSON.stringify(avoidList || []),
      toneIdentity,
      preferredLanguagesJson: JSON.stringify(preferredLanguages || ["en"]),
    });

    logger.info({ accountId, policyId: policy.id }, "Policy updated via API");
    res.json({
      ...policy,
      topics: policy.topicsJson ? JSON.parse(policy.topicsJson) : [],
      goals: policy.goalsJson ? JSON.parse(policy.goalsJson) : [],
      avoidList: policy.avoidListJson ? JSON.parse(policy.avoidListJson) : [],
      preferredLanguages: policy.preferredLanguagesJson
        ? JSON.parse(policy.preferredLanguagesJson)
        : ["en"],
    });
  } catch (err) {
    next(err);
  }
});

policiesRoutes.delete("/account/:accountId", async (req, res, next) => {
  try {
    const accountId = parseInt(req.params.accountId);
    if (isNaN(accountId)) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }

    await engagementPoliciesRepo.deactivateByAccountId(accountId);
    logger.info({ accountId }, "Policy deactivated via API");
    res.json({ success: true, accountId });
  } catch (err) {
    next(err);
  }
});
