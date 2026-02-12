import type { AccountStatus } from "./models";

export type AccountStateTransition = {
  from: AccountStatus;
  to: AccountStatus;
  reason: string;
};

export const ALLOWED_TRANSITIONS: ReadonlyMap<AccountStatus, AccountStatus[]> = new Map([
  ["needs_initial_auth", ["active", "disabled"]],
  ["active", ["needs_reauth", "disabled"]],
  ["needs_reauth", ["active", "disabled"]],
  ["disabled", ["needs_initial_auth", "active", "needs_reauth", "disabled"]],
]);

export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS.get(from);
  return allowed?.includes(to) ?? false;
}

export function validateTransition(from: AccountStatus, to: AccountStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid account state transition: ${from} -> ${to}. Allowed: ${ALLOWED_TRANSITIONS.get(from)?.join(", ") ?? "none"}`
    );
  }
}
