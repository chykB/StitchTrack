import {z} from "zod";
export const businessPath="/api/internal/tailor-business";
export const businessNameSchema=z.string().refine(value=>value.isWellFormed(),"Enter a valid business name.").transform(value=>value.trim()).refine(value=>Array.from(value).length>=2&&Array.from(value).length<=120,"Use 2-120 characters for your business name.");
export const businessWriteSchema=z.strictObject({operation:z.enum(["create","rename"]),name:businessNameSchema});
export const businessProfileSchema=z.strictObject({id:z.string().min(1),name:z.string().refine(value=>value===value.trim()).pipe(businessNameSchema),timeZone:z.literal("Africa/Lagos")});
export const businessReadReply=z.strictObject({business:businessProfileSchema.nullable()});
export const businessWriteReply=z.strictObject({business:businessProfileSchema});
export type BusinessProfile=z.infer<typeof businessProfileSchema>;
export type BusinessWrite=z.infer<typeof businessWriteSchema>;
