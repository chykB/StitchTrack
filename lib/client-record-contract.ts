import {z} from "zod";
import {emailSchema,nameSchema} from "./auth/schemas.ts";
export const clientRecordPath="/api/internal/tailor-clients";
export const clientIdSchema=z.uuid().transform(value=>value.toLowerCase());
export const clientFullNameSchema=nameSchema.refine(value=>value.isWellFormed(),"Enter a valid full name.")
  .transform(value=>value.trim()).refine(value=>Array.from(value).length>=1&&Array.from(value).length<=120,"Use 1-120 characters for the full name.");
export const clientPhoneSchema=z.union([z.null(),z.string().transform(value=>value.trim()).transform(value=>value===""?null:value)
  .refine(value=>value===null||value.length<=32&&/^[+]?[0-9 ().-]+$/u.test(value)&&
    value.replace(/[^0-9]/gu,"").length>=7&&value.replace(/[^0-9]/gu,"").length<=15,"Use 7-15 digits and at most 32 characters for the phone number.")]);
export const clientEmailSchema=z.union([z.null(),z.string().transform(value=>value.trim()===""?null:value).pipe(z.union([z.null(),emailSchema]))]);
export const clientCursorSchema=z.strictObject({createdAt:z.iso.datetime({precision:3}),id:clientIdSchema});
export const clientCreateSchema=z.strictObject({operation:z.literal("create"),id:clientIdSchema,fullName:clientFullNameSchema,
  phone:clientPhoneSchema.default(null),email:clientEmailSchema.default(null)});
export const clientUpdateSchema=z.strictObject({operation:z.literal("update"),id:clientIdSchema,fullName:clientFullNameSchema.optional(),
  phone:clientPhoneSchema.optional(),email:clientEmailSchema.optional()}).refine(value=>value.fullName!==undefined||value.phone!==undefined||value.email!==undefined,"Provide a client field to update.");
export const clientRequestSchema=z.discriminatedUnion("operation",[
  clientCreateSchema,clientUpdateSchema,z.strictObject({operation:z.literal("get"),id:clientIdSchema}),
  z.strictObject({operation:z.literal("list"),limit:z.number().int().min(1).max(50).default(25),cursor:clientCursorSchema.optional()}),
]);
export const clientRecordSchema=z.strictObject({id:clientIdSchema,fullName:clientFullNameSchema,phone:clientPhoneSchema,email:clientEmailSchema,
  createdAt:z.iso.datetime({precision:3}),updatedAt:z.iso.datetime({precision:3})});
export const clientSingleReplySchema=z.strictObject({client:clientRecordSchema});
export const clientListReplySchema=z.strictObject({clients:z.array(clientRecordSchema).max(50),nextCursor:clientCursorSchema.nullable()});
export type ClientRecord=z.infer<typeof clientRecordSchema>;
export type ClientRequest=z.infer<typeof clientRequestSchema>;
export type ClientReply=z.infer<typeof clientSingleReplySchema>|z.infer<typeof clientListReplySchema>;
