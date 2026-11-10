import {z} from "zod";
import {clientIdSchema} from "./client-record-contract.ts";
export const orderPath="/api/internal/tailor-orders";
// 50 descriptions x 500 code points, including JSON-escaped supplementary characters.
// This endpoint-specific budget leaves the authentication transport's 16 KiB default intact.
export const ORDER_BODY_LIMIT=320*1024;
export const orderDescriptionSchema=z.string().refine(value=>value.isWellFormed()&&!value.includes("\u0000"),"Enter a valid clothing-item description.")
  .transform(value=>value.replace(/^[\s\p{White_Space}]+|[\s\p{White_Space}]+$/gu,"")).refine(value=>Array.from(value).length>=1&&Array.from(value).length<=500,"Use 1-500 characters for each clothing-item description.");
export const orderItemInputSchema=z.strictObject({id:clientIdSchema,description:orderDescriptionSchema,measurementVersionId:clientIdSchema.nullable().default(null)});
export const orderCreateSchema=z.strictObject({operation:z.literal("create"),id:clientIdSchema,clientId:clientIdSchema,items:z.array(orderItemInputSchema).min(1).max(50)})
  .refine(data=>new Set(data.items.map(item=>item.id)).size===data.items.length,"Use a separate identifier for each clothing item.");
export const orderUpdateItemSchema=z.strictObject({operation:z.literal("update_item"),id:clientIdSchema,itemId:clientIdSchema,
  expectedUpdatedAt:z.iso.datetime({precision:3}),description:orderDescriptionSchema.optional(),measurementVersionId:clientIdSchema.nullable().optional()})
  .refine(data=>data.description!==undefined||data.measurementVersionId!==undefined,"Supply at least one clothing-item field to update.");
export const orderCursorSchema=z.strictObject({createdAt:z.iso.datetime({precision:3}),id:clientIdSchema});
export const orderRequestSchema=z.discriminatedUnion("operation",[
  orderCreateSchema,orderUpdateItemSchema,z.strictObject({operation:z.literal("list"),limit:z.number().int().min(1).max(50).default(25),cursor:orderCursorSchema.optional()}),
  z.strictObject({operation:z.literal("get"),id:clientIdSchema}),
]);
export const orderSummarySchema=z.strictObject({id:clientIdSchema,clientId:clientIdSchema,createdAt:z.iso.datetime({precision:3}),updatedAt:z.iso.datetime({precision:3})});
export const orderItemSchema=z.strictObject({id:clientIdSchema,description:orderDescriptionSchema,measurementVersionId:clientIdSchema.nullable(),createdAt:z.iso.datetime({precision:3}),updatedAt:z.iso.datetime({precision:3})});
export const orderSchema=orderSummarySchema.extend({items:z.array(orderItemSchema).min(1).max(50)})
  .refine(data=>new Set(data.items.map(item=>item.id)).size===data.items.length);
export const orderSingleReplySchema=z.strictObject({order:orderSchema});
export const orderListReplySchema=z.strictObject({orders:z.array(orderSummarySchema).max(50),nextCursor:orderCursorSchema.nullable()});
export type OrderSummary=z.infer<typeof orderSummarySchema>;
export type OrderDetails=z.infer<typeof orderSchema>;
export type OrderReply=z.infer<typeof orderSingleReplySchema>|z.infer<typeof orderListReplySchema>;
