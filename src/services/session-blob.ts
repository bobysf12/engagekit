import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../core/config";
import { StorageStateSchema, type StorageState } from "./playwright-session-state";

const SessionBlobEnvelopeSchema = z.object({
  v: z.literal(1),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  state: StorageStateSchema,
  sig: z.string().min(1),
});

export interface SessionBlobPayload {
  iat: number;
  exp: number;
  state: StorageState;
}

function getBlobSecret(): string {
  const secret = env.SESSION_BLOB_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_BLOB_SECRET is missing or too short (min 16 chars). Set it in .env on both exporter and importer.",
    );
  }
  return secret;
}

function buildUnsignedPayload(payload: SessionBlobPayload): string {
  return JSON.stringify({
    v: 1,
    iat: payload.iat,
    exp: payload.exp,
    state: payload.state,
  });
}

function signPayload(unsignedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(unsignedPayload).digest("base64url");
}

export function createSessionBlob(state: StorageState, ttlSeconds = env.SESSION_BLOB_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionBlobPayload = {
    iat: now,
    exp: now + ttlSeconds,
    state,
  };

  const secret = getBlobSecret();
  const unsignedPayload = buildUnsignedPayload(payload);
  const sig = signPayload(unsignedPayload, secret);

  const envelope = {
    v: 1 as const,
    iat: payload.iat,
    exp: payload.exp,
    state: payload.state,
    sig,
  };

  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

export function decodeSessionBlob(blob: string): SessionBlobPayload {
  let decoded: string;
  try {
    decoded = Buffer.from(blob, "base64url").toString("utf8");
  } catch {
    throw new Error("Invalid session blob encoding");
  }

  let parsedEnvelope: unknown;
  try {
    parsedEnvelope = JSON.parse(decoded);
  } catch {
    throw new Error("Invalid session blob JSON");
  }

  const envelope = SessionBlobEnvelopeSchema.parse(parsedEnvelope);

  const payload: SessionBlobPayload = {
    iat: envelope.iat,
    exp: envelope.exp,
    state: envelope.state,
  };

  const secret = getBlobSecret();
  const expectedSig = signPayload(buildUnsignedPayload(payload), secret);

  const expectedBuffer = Buffer.from(expectedSig);
  const actualBuffer = Buffer.from(envelope.sig);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Invalid session blob signature");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error("Session blob expired");
  }

  return {
    iat: payload.iat,
    exp: payload.exp,
    state: StorageStateSchema.parse(payload.state),
  };
}
