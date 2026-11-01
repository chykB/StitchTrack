import "server-only";
import {isIP} from "node:net";
import nodemailer, {type SMTPTransportOptions} from "nodemailer";
import {z} from "zod";
import {emailSchema} from "../auth/schemas.ts";
import {ProductAuthError} from "./secrets.server.ts";
import {renderVerificationEmail} from "./verification-email.server.ts";

const field = z.string().min(1).refine(value => value.trim().length > 0 && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value));
const configuration = z.object({
  PRODUCT_SMTP_HOST: z.hostname().refine(value => value.includes(".") && isIP(value) === 0),
  PRODUCT_SMTP_PORT: z.string().regex(/^[1-9][0-9]{0,4}$/u).transform(Number).refine(value => value <= 65535),
  PRODUCT_SMTP_TLS_MODE: z.enum(["implicit", "starttls"]),
  PRODUCT_SMTP_USERNAME: field,
  PRODUCT_SMTP_PASSWORD: field,
  PRODUCT_SMTP_FROM_ADDRESS: emailSchema,
  PRODUCT_SMTP_FROM_NAME: field,
}).refine(value => (value.PRODUCT_SMTP_PORT !== 465 || value.PRODUCT_SMTP_TLS_MODE === "implicit") &&
  (value.PRODUCT_SMTP_PORT !== 587 || value.PRODUCT_SMTP_TLS_MODE === "starttls"));

// Domain-specific message requirements checked against Nodemailer's bundled
// SMTP types. An injected factory remains available for offline tests.
export type VerificationMessage = Omit<ReturnType<typeof renderVerificationEmail>, "recipient"> & {
  from: {name: string; address: string}; to: {address: string};
  envelope: {from: string; to: string[]}; disableFileAccess: true; disableUrlAccess: true;
};
export type SmtpOptions = SMTPTransportOptions & {
  host: string; port: number; secure: boolean; requireTLS: boolean;
  auth: {user: string; pass: string};
  tls: {servername: string; rejectUnauthorized: true; minVersion: "TLSv1.2"};
  connectionTimeout: number; greetingTimeout: number; socketTimeout: number;
  pool: false; logger: false; debug: false; disableFileAccess: true; disableUrlAccess: true;
};
export type SmtpTransportFactory = (options: SmtpOptions) => {sendMail(message: VerificationMessage): Promise<unknown>};

export function createVerificationMailer(environment: Readonly<Record<string,string|undefined>>,
  createTransport: SmtpTransportFactory = options => nodemailer.createTransport(options),
  clock: () => Date = () => new Date()) {
  const parsed = configuration.safeParse(environment);
  if (!parsed.success || typeof createTransport !== "function") throw new ProductAuthError("email_configuration_unavailable");
  const config = parsed.data;
  // No connection/factory call on construction. Each explicit call is one attempt,
  // not a retry loop. Registration never imports or calls this mailer.
  return {
    async sendVerification(input: unknown, expiresAt: Date): Promise<{status: "accepted"}> {
      const {recipient: email, ...content} = renderVerificationEmail(input, expiresAt), now = clock();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || expiresAt <= now ||
          expiresAt.getTime() - now.getTime() > 300_000) throw new ProductAuthError("email_invalid_message");
      try {
        const transport = createTransport({host: config.PRODUCT_SMTP_HOST, port: config.PRODUCT_SMTP_PORT,
          secure: config.PRODUCT_SMTP_TLS_MODE === "implicit", requireTLS: config.PRODUCT_SMTP_TLS_MODE === "starttls",
          auth: {user: config.PRODUCT_SMTP_USERNAME, pass: config.PRODUCT_SMTP_PASSWORD},
          tls: {servername: config.PRODUCT_SMTP_HOST, rejectUnauthorized: true, minVersion: "TLSv1.2"},
          connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
          pool: false, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true});
        const info: unknown = await transport.sendMail({from: {name: config.PRODUCT_SMTP_FROM_NAME, address: config.PRODUCT_SMTP_FROM_ADDRESS},
          to: {address: email}, envelope: {from: config.PRODUCT_SMTP_FROM_ADDRESS, to: [email]},
          ...content, disableFileAccess: true, disableUrlAccess: true});
        if (!info || typeof info !== "object" || !("accepted" in info) || !("rejected" in info) ||
            !Array.isArray(info.accepted) || !Array.isArray(info.rejected)) throw new Error();
        const matches = (recipient: unknown) => {
          const address = typeof recipient === "string" ? recipient : recipient && typeof recipient === "object" && "address" in recipient ? recipient.address : undefined;
          const value = emailSchema.safeParse(address); return value.success && value.data === email;
        };
        if (info.accepted.length === 0 && info.rejected.length === 1 && matches(info.rejected[0])) throw new ProductAuthError("email_delivery_rejected");
        if (info.accepted.length !== 1 || !matches(info.accepted[0]) || info.rejected.length !== 0) throw new Error();
        return {status: "accepted"}; // Never return provider replies/IDs/recipient lists.
      } catch (error) {
        if (error instanceof ProductAuthError && error.code === "email_delivery_rejected") throw error;
        // Failure/timeout can follow SMTP acceptance. Do not assert unsent or retry
        // automatically; preserve uncertainty for the future worker's policy.
        throw new ProductAuthError("email_delivery_unconfirmed");
      }
    },
  };
}
