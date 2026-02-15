import { describe, it, expect } from "bun:test";
import { Router } from "express";

/**
 * Helper to extract route definitions from Express router
 * This tests the route registration order without needing a database
 */
function extractRouteInfo(router: Router): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  
  // Access the router's internal stack
  const stack = (router as unknown as { stack: Array<{ route?: { methods: Record<string, boolean>; path: string } }> }).stack;
  
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods);
      for (const method of methods) {
        routes.push({
          method: method.toUpperCase(),
          path: layer.route.path,
        });
      }
    }
  }
  
  return routes;
}

describe("Route Order Conflicts", () => {
  describe("Triage Routes", () => {
    it("should have static paths before dynamic /:id to prevent shadowing", async () => {
      // Import the router to check its stack
      const { triageRoutes } = await import("../../../src/server/routes/triage.routes");
      const routes = extractRouteInfo(triageRoutes);
      
      // Find the index of /:id route
      const idRouteIndex = routes.findIndex(r => r.path === "/:id");
      
      // Find the index of /run-account/:runAccountId route  
      const runAccountRouteIndex = routes.findIndex(r => r.path === "/run-account/:runAccountId");
      
      // /run-account/:runAccountId should come BEFORE /:id
      // Otherwise /run-account/123 would match /:id with id="run-account"
      if (idRouteIndex !== -1 && runAccountRouteIndex !== -1) {
        expect(runAccountRouteIndex).toBeLessThan(idRouteIndex);
      }
    });

    it("should have /run-account/:runAccountId/review before /:id", async () => {
      const { triageRoutes } = await import("../../../src/server/routes/triage.routes");
      const routes = extractRouteInfo(triageRoutes);
      
      const idRouteIndex = routes.findIndex(r => r.path === "/:id");
      const reviewRouteIndex = routes.findIndex(r => r.path === "/run-account/:runAccountId/review");
      
      if (idRouteIndex !== -1 && reviewRouteIndex !== -1) {
        expect(reviewRouteIndex).toBeLessThan(idRouteIndex);
      }
    });
  });

  describe("Drafts Routes", () => {
    it("should have /post/:postId/feedback before /:id", async () => {
      const { draftsRoutes } = await import("../../../src/server/routes/drafts.routes");
      const routes = extractRouteInfo(draftsRoutes);
      
      const idRouteIndex = routes.findIndex(r => r.path === "/:id");
      const feedbackRouteIndex = routes.findIndex(r => r.path === "/post/:postId/feedback");
      
      if (idRouteIndex !== -1 && feedbackRouteIndex !== -1) {
        expect(feedbackRouteIndex).toBeLessThan(idRouteIndex);
      }
    });

    it("should have /run-account/:runAccountId/generate before /:id", async () => {
      const { draftsRoutes } = await import("../../../src/server/routes/drafts.routes");
      const routes = extractRouteInfo(draftsRoutes);
      
      const idRouteIndex = routes.findIndex(r => r.path === "/:id");
      const generateRouteIndex = routes.findIndex(r => r.path === "/run-account/:runAccountId/generate");
      
      if (idRouteIndex !== -1 && generateRouteIndex !== -1) {
        expect(generateRouteIndex).toBeLessThan(idRouteIndex);
      }
    });
  });

  describe("Posts Routes", () => {
    it("should have /:id/comments before /:id to prevent shadowing", async () => {
      const { postsRoutes } = await import("../../../src/server/routes/posts.routes");
      const routes = extractRouteInfo(postsRoutes);
      
      const idRouteIndex = routes.findIndex(r => r.path === "/:id");
      const commentsRouteIndex = routes.findIndex(r => r.path === "/:id/comments");
      
      // /:id/comments should come BEFORE /:id
      // Otherwise /123/comments would match /:id with id="123/comments"
      if (idRouteIndex !== -1 && commentsRouteIndex !== -1) {
        expect(commentsRouteIndex).toBeLessThan(idRouteIndex);
      }
    });
  });

  describe("Runs Routes", () => {
    it("should have /:id/accounts before /:id to prevent shadowing", async () => {
      const { runsRoutes } = await import("../../../src/server/routes/runs.routes");
      const routes = extractRouteInfo(runsRoutes);
      
      const idRouteIndex = routes.findIndex(r => r.path === "/:id");
      const accountsRouteIndex = routes.findIndex(r => r.path === "/:id/accounts");
      
      if (idRouteIndex !== -1 && accountsRouteIndex !== -1) {
        expect(accountsRouteIndex).toBeLessThan(idRouteIndex);
      }
    });
  });

  describe("Cron Routes", () => {
    it("should have /:id/history before /:id to prevent shadowing", async () => {
      const { cronRoutes } = await import("../../../src/server/routes/cron.routes");
      const routes = extractRouteInfo(cronRoutes);
      
      const idRouteIndex = routes.findIndex(r => r.path === "/:id");
      const historyRouteIndex = routes.findIndex(r => r.path === "/:id/history");
      
      if (idRouteIndex !== -1 && historyRouteIndex !== -1) {
        expect(historyRouteIndex).toBeLessThan(idRouteIndex);
      }
    });
  });
});
