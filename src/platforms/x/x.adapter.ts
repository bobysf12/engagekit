import type { Page } from "playwright";
import type { AuthState, CollectedPost, CollectedComment, MetricSnapshot } from "../../domain/models";
import type { PlatformAdapter, CollectPostOptions, CollectCommentOptions } from "../adapter";
import { AuthError } from "../../core/errors";

export class XAdapter implements PlatformAdapter {
  readonly platform = "x";

  async validateSession(_page: Page): Promise<AuthState> {
    throw new AuthError("X adapter not yet implemented", "NOT_IMPLEMENTED");
  }

  async performLogin(_page: Page, _handle: string): Promise<void> {
    throw new AuthError("X adapter not yet implemented", "NOT_IMPLEMENTED");
  }

  async collectHome(_page: Page, _options: CollectPostOptions): Promise<CollectedPost[]> {
    throw new AuthError("X adapter not yet implemented", "NOT_IMPLEMENTED");
  }

  async collectProfileByHandle(_page: Page, _handle: string, _options: CollectPostOptions): Promise<CollectedPost[]> {
    throw new AuthError("X adapter not yet implemented", "NOT_IMPLEMENTED");
  }

  async collectSearch(_page: Page, _query: string, _options: CollectPostOptions): Promise<CollectedPost[]> {
    throw new AuthError("X adapter not yet implemented", "NOT_IMPLEMENTED");
  }

  async expandThreadComments(
    _page: Page,
    _post: CollectedPost,
    _options: CollectCommentOptions
  ): Promise<CollectedComment[]> {
    throw new AuthError("X adapter not yet implemented", "NOT_IMPLEMENTED");
  }

  async extractMetrics(_page: Page, _entityType: "post" | "comment", _entityRef: string): Promise<MetricSnapshot> {
    throw new AuthError("X adapter not yet implemented", "NOT_IMPLEMENTED");
  }
}
