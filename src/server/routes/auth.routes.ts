import { Router } from "express";
import { accountsRepo } from "../../db/repositories/accounts.repo";
import { serializeStorageState } from "../../services/playwright-session-state";
import { decodeSessionBlob } from "../../services/session-blob";
import { logger } from "../../core/logger";

export const authRoutes = Router();

authRoutes.post("/import-session", async (req, res, next) => {
  try {
    const accountId = parseInt(req.body.accountId, 10);
    const blob = typeof req.body.blob === "string" ? req.body.blob.trim() : "";

    if (isNaN(accountId)) {
      res.status(400).json({ error: "accountId is required and must be a number" });
      return;
    }

    if (!blob) {
      res.status(400).json({ error: "blob is required" });
      return;
    }

    const account = await accountsRepo.findById(accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const decoded = decodeSessionBlob(blob);
    const sessionStateJson = serializeStorageState(decoded.state);

    await accountsRepo.update(accountId, {
      status: "active",
      sessionStateJson,
      lastAuthAt: Math.floor(Date.now() / 1000),
      lastAuthCheckAt: Math.floor(Date.now() / 1000),
    });
    await accountsRepo.clearAuthError(accountId);

    logger.info(
      {
        accountId,
        importedIssuedAt: decoded.iat,
        importedExpiresAt: decoded.exp,
        cookieCount: decoded.state.cookies?.length || 0,
      },
      "Session blob imported via API",
    );

    res.json({
      success: true,
      accountId,
      importedIssuedAt: decoded.iat,
      importedExpiresAt: decoded.exp,
    });
  } catch (err) {
    if (err instanceof Error) {
      const known = [
        "Invalid session blob encoding",
        "Invalid session blob JSON",
        "Invalid session blob signature",
        "Session blob expired",
        "SESSION_BLOB_SECRET is missing or too short (min 16 chars). Set it in .env on both exporter and importer.",
      ];
      if (known.includes(err.message)) {
        res.status(400).json({ error: err.message });
        return;
      }
    }
    next(err);
  }
});
