import "server-only";
import {createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual} from "node:crypto";

export type KeyRing = {currentId: string; keys: ReadonlyMap<string, Uint8Array>};
export type Envelope = {payloadCiphertext: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer>; authTag: Uint8Array<ArrayBuffer>; keyId: string};
export type MailContext = {id: string; issuanceId: string; templateVersion: string};
export type MailPayload = {email: string; otp: string};
export class ProductAuthError extends Error {
  readonly code: string;
  constructor(code = "operation_unavailable") {super("Product authentication operation unavailable."); this.name = "ProductAuthError"; this.code = code;}
}
export function createSecretTools(verifierRing: KeyRing, outboxRing: KeyRing) {
  const copy = (ring: KeyRing) => {
    if (!ring || !/^[A-Za-z0-9_-]{1,64}$/u.test(ring.currentId) || !ring.keys.has(ring.currentId)) throw new ProductAuthError("configuration_unavailable");
    const keys = new Map<string, Buffer>();
    for (const [id, key] of ring.keys) {
      if (!/^[A-Za-z0-9_-]{1,64}$/u.test(id) || key.byteLength !== 32) throw new ProductAuthError("configuration_unavailable");
      keys.set(id, Buffer.from(key));
    }
    return keys;
  };
  const verifierKeys = copy(verifierRing), outboxKeys = copy(outboxRing);
  for (const a of verifierKeys.values()) for (const b of outboxKeys.values()) if (timingSafeEqual(a, b)) throw new ProductAuthError("configuration_unavailable");
  const key = (keys: Map<string, Buffer>, id: string) => {const value = keys.get(id); if (!value) throw new ProductAuthError(); return value;};
  const aad = (context: MailContext, keyId: string) => Buffer.from(JSON.stringify(["stitchtrack-email-v1", context.id, context.issuanceId, context.templateVersion, keyId]));
  return {
    verifierKeyId: verifierRing.currentId,
    mac(id: string, email: string, otp: string, keyId = verifierRing.currentId): Buffer {
      return createHmac("sha256", key(verifierKeys, keyId)).update(JSON.stringify(["stitchtrack-tailor-email-v1", id, email, otp])).digest();
    },
    matches(expected: Uint8Array, id: string, email: string, otp: string, keyId: string): boolean {
      const actual = this.mac(id, email, otp, keyId);
      return expected.byteLength === actual.byteLength && timingSafeEqual(Buffer.from(expected), actual);
    },
    seal(context: MailContext, payload: MailPayload): Envelope {
      const keyId = outboxRing.currentId, nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key(outboxKeys, keyId), nonce);
      cipher.setAAD(aad(context, keyId));
      const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
      if (plaintext.byteLength > 4096) throw new ProductAuthError();
      const payloadCiphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return {payloadCiphertext: new Uint8Array(payloadCiphertext), nonce: new Uint8Array(nonce), authTag: new Uint8Array(cipher.getAuthTag()), keyId};
    },
    open(context: MailContext, envelope: Envelope): MailPayload {
      try {
        if (envelope.nonce.byteLength !== 12 || envelope.authTag.byteLength !== 16 || envelope.payloadCiphertext.byteLength > 4096) throw new Error();
        const decipher = createDecipheriv("aes-256-gcm", key(outboxKeys, envelope.keyId), envelope.nonce);
        decipher.setAAD(aad(context, envelope.keyId)); decipher.setAuthTag(Buffer.from(envelope.authTag));
        const value: unknown = JSON.parse(Buffer.concat([decipher.update(envelope.payloadCiphertext), decipher.final()]).toString("utf8"));
        if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== "email,otp" ||
            !("email" in value) || !("otp" in value) || typeof value.email !== "string" || typeof value.otp !== "string" || !/^[0-9]{6}$/u.test(value.otp)) throw new Error();
        return {email: value.email, otp: value.otp};
      } catch {throw new ProductAuthError();}
    },
  };
}
