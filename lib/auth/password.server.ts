import "server-only";
import { randomBytes } from "node:crypto";
import { hash, parseOptions, verify, type Options } from "@node-rs/argon2";

// Initial policy, not hardware-calibrated. Do not change without reviewing
// verification of existing profiles and a rehash/migration strategy.
export const ARGON2ID_PARAMETERS = Object.freeze({
  algorithm: 2, // Argon2id; numeric value avoids ambient const enums under isolatedModules.
  version: 1, // Package V0x13 constant; encoded PHC version is 19.
  memoryCost: 65536, // KiB: 64 MiB total memory.
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} satisfies Options);
export const PASSWORD_SALT_BYTES = 16;

export class PasswordHashingError extends Error {
  constructor() {
    super("Password hashing is unavailable.");
    this.name = "PasswordHashingError";
  }
}

function representablePassword(password: string): boolean {
  // UTF-8 cannot preserve isolated UTF-16 surrogates. Reject rather than replace.
  return typeof password === "string" && password.isWellFormed();
}

// Enrollment policy belongs to the shared schemas, not this primitive.
// No password transformation, logs, persistence or enrollment/session side effect.
export async function hashPassword(password: string): Promise<string> {
  if (!representablePassword(password)) throw new PasswordHashingError();
  try {
    return await hash(password, {
      ...ARGON2ID_PARAMETERS,
      salt: randomBytes(PASSWORD_SALT_BYTES),
    });
  } catch {
    // Never expose input, hash or a native exception/cause.
    throw new PasswordHashingError();
  }
}

// Compatible callback shape for later integration; no Better Auth setup here.
export async function verifyPassword(input: { password: string; hash: string }): Promise<boolean> {
  if (!input || !representablePassword(input.password) || typeof input.hash !== "string") return false;
  // Bound encoded-hash parsing, not password length. Accept only this reviewed
  // profile before asking native code to allocate memory/perform expensive work.
  if (input.hash.length > 256 || !input.hash.startsWith("$argon2id$v=19$")) return false;
  try {
    const profile = parseOptions(input.hash);
    if (profile.algorithm !== ARGON2ID_PARAMETERS.algorithm ||
        profile.version !== ARGON2ID_PARAMETERS.version ||
        profile.memoryCost !== ARGON2ID_PARAMETERS.memoryCost ||
        profile.timeCost !== ARGON2ID_PARAMETERS.timeCost ||
        profile.parallelism !== ARGON2ID_PARAMETERS.parallelism ||
        profile.outputLen !== ARGON2ID_PARAMETERS.outputLen ||
        profile.saltLen !== PASSWORD_SALT_BYTES) return false;
    return await verify(input.hash, input.password, ARGON2ID_PARAMETERS);
  } catch {
    // Malformed hashes and native verification failures fail closed without logs.
    return false;
  }
}
