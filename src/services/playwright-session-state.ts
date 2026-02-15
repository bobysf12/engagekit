import { z } from "zod";
import type { Account } from "../db/schema";
import { AuthError } from "../core/errors";

const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
});

const OriginSchema = z.object({
  origin: z.string(),
  localStorage: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional(),
});

export const StorageStateSchema = z.object({
  cookies: z.array(CookieSchema).optional().default([]),
  origins: z.array(OriginSchema).optional().default([]),
});

export type StorageState = z.infer<typeof StorageStateSchema>;

export function serializeStorageState(state: StorageState): string {
  return JSON.stringify(state);
}

export function parseStorageState(json: string): StorageState {
  const parsed = JSON.parse(json);
  return StorageStateSchema.parse(parsed);
}

export function getRequiredStorageState(account: Account): StorageState {
  if (!account.sessionStateJson) {
    throw new AuthError("Session state not found in database", "SESSION_STATE_MISSING");
  }
  try {
    return parseStorageState(account.sessionStateJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid session state JSON";
    throw new AuthError(message, "SESSION_STATE_INVALID");
  }
}

export function hasSessionState(account: Account): boolean {
  return !!account.sessionStateJson;
}
