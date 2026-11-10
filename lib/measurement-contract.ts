import {z} from "zod";
import {clientIdSchema} from "./client-record-contract.ts";
export const measurementPath="/api/internal/tailor-measurements";
// Trim the SQL constraint's surrounding whitespace plus U+0085 (in its blank set).
// Keep internal whitespace, spelling, case and Unicode representation untouched.
export const measurementLabelSchema=z.string().refine(value=>value.isWellFormed()&&!value.includes("\u0000"),"Enter a valid measurement name.")
  .transform(value=>value.replace(/^[\s\p{White_Space}]+|[\s\p{White_Space}]+$/gu,"")).refine(value=>Array.from(value).length>=1&&Array.from(value).length<=60,"Use 1-60 characters for each measurement name.");
// Decimal strings only: no Number coercion, exponent syntax or rounding. Numeric equality
// treats 40, 40.0 and 40.00 as identical retries; label bytes are never normalized/folded.
export const measurementValueSchema=z.string().regex(/^[0-9]+(?:\.[0-9]{1,2})?$/u,"Use an exact decimal with at most two decimal places.")
  .pipe(z.string().refine(value=>{const [whole,fraction=""]=value.split(".");const cents=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,"0"));return cents>BigInt(0)&&cents<=BigInt(100000);},"Use a value greater than 0 and at most 1000.")
  .transform(value=>{const [whole,fraction=""]=value.split(".");const integral=whole.replace(/^0+(?=[0-9])/u,"");const trimmed=fraction.replace(/0+$/u,"");return trimmed?integral+"."+trimmed:integral;}));
export const measurementEntrySchema=z.strictObject({name:measurementLabelSchema,value:measurementValueSchema});
const versionNumber=z.number().int().min(1).max(2147483647);
export const measurementCursorSchema=z.strictObject({versionNumber});
export const measurementRequestSchema=z.discriminatedUnion("operation",[
  z.strictObject({operation:z.literal("create"),id:clientIdSchema,clientId:clientIdSchema,unit:z.enum(["cm","in"]),entries:z.array(measurementEntrySchema).min(1).max(50)}),
  z.strictObject({operation:z.literal("list"),clientId:clientIdSchema,limit:z.number().int().min(1).max(50).default(25),cursor:measurementCursorSchema.optional()}),
  z.strictObject({operation:z.literal("get"),clientId:clientIdSchema,id:clientIdSchema}),
]);
export const measurementVersionSchema=z.strictObject({id:clientIdSchema,clientId:clientIdSchema,versionNumber,unit:z.enum(["cm","in"]),
  recordedAt:z.iso.datetime({precision:3}),entries:z.array(measurementEntrySchema).min(1).max(50)});
export const measurementSingleReplySchema=z.strictObject({version:measurementVersionSchema});
export const measurementListReplySchema=z.strictObject({versions:z.array(measurementVersionSchema).max(50),nextCursor:measurementCursorSchema.nullable()});
export type MeasurementVersion=z.infer<typeof measurementVersionSchema>;
export type MeasurementReply=z.infer<typeof measurementSingleReplySchema>|z.infer<typeof measurementListReplySchema>;
