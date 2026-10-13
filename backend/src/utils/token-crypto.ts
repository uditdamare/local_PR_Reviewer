import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function getKey(): Buffer {
  if (!env.tokenEncryptionKey) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to backend/.env.",
    );
  }

  const key = Buffer.from(env.tokenEncryptionKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes. Generate one with `openssl rand -base64 32`.",
    );
  }

  return key;
}

/** Returns "iv.authTag.ciphertext", each part base64. GCM authenticates, so tampering is detected on decrypt. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

export function decryptToken(payload: string): string {
  const parts = payload.split(".");

  if (parts.length !== 3) {
    throw new Error("Stored token is malformed.");
  }

  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64")) as [
    Buffer,
    Buffer,
    Buffer,
  ];

  try {
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key or tampered data both land here; deliberately no detail.
    throw new Error(
      "Stored token could not be decrypted — check that TOKEN_ENCRYPTION_KEY matches the key it was saved with.",
    );
  }
}
