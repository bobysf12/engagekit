import { describe, it, expect } from "bun:test";
import { canTransition, validateTransition, ALLOWED_TRANSITIONS } from "../../src/domain/account-state-machine";
import type { AccountStatus } from "../../src/domain/models";

describe("Account state machine", () => {
  describe("canTransition", () => {
    it("should allow initial auth to active", () => {
      expect(canTransition("needs_initial_auth", "active")).toBe(true);
    });

    it("should allow active to needs_reauth", () => {
      expect(canTransition("active", "needs_reauth")).toBe(true);
    });

    it("should allow needs_reauth to active", () => {
      expect(canTransition("needs_reauth", "active")).toBe(true);
    });

    it("should allow active to disabled", () => {
      expect(canTransition("active", "disabled")).toBe(true);
    });

    it("should allow disabled to active", () => {
      expect(canTransition("disabled", "active")).toBe(true);
    });

    it("should reject invalid transitions", () => {
      expect(canTransition("needs_initial_auth", "needs_reauth")).toBe(false);
      expect(canTransition("active", "needs_initial_auth")).toBe(false);
    });
  });

  describe("validateTransition", () => {
    it("should not throw for valid transitions", () => {
      expect(() => validateTransition("needs_initial_auth", "active")).not.toThrow();
      expect(() => validateTransition("active", "needs_reauth")).not.toThrow();
      expect(() => validateTransition("needs_reauth", "active")).not.toThrow();
    });

    it("should throw for invalid transitions", () => {
      expect(() => validateTransition("needs_initial_auth", "needs_reauth")).toThrow();
      expect(() => validateTransition("active", "needs_initial_auth")).toThrow();
    });
  });

  describe("ALLOWED_TRANSITIONS configuration", () => {
    it("should have transitions for all states", () => {
      const states: AccountStatus[] = ["active", "needs_initial_auth", "needs_reauth", "disabled"];
      for (const state of states) {
        expect(ALLOWED_TRANSITIONS.has(state)).toBe(true);
      }
    });

    it("should allow all states to transition to disabled", () => {
      const states: AccountStatus[] = ["active", "needs_initial_auth", "needs_reauth", "disabled"];
      for (const state of states) {
        expect(canTransition(state, "disabled")).toBe(true);
      }
    });
  });
});
