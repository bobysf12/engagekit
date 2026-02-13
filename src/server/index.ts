import express from "express";
import { env } from "../core/config";
import { logger } from "../core/logger";
import { runsRoutes } from "./routes/runs.routes";
import { postsRoutes } from "./routes/posts.routes";
import { triageRoutes } from "./routes/triage.routes";
import { draftsRoutes } from "./routes/drafts.routes";
import { policiesRoutes } from "./routes/policies.routes";
import { cronRoutes } from "./routes/cron.routes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Math.floor(Date.now() / 1000) });
});

app.use("/api/runs", runsRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/triage", triageRoutes);
app.use("/api/drafts", draftsRoutes);
app.use("/api/policies", policiesRoutes);
app.use("/api/cron", cronRoutes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err: err.message, stack: err.stack }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  }
);

export function startServer() {
  if (!env.API_ENABLED) {
    logger.warn("API_ENABLED is false, not starting server");
    return;
  }

  app.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(`API server listening on http://${env.API_HOST}:${env.API_PORT}`);
  });
}

export { app };

startServer();
