import type {NextApiRequest,NextApiResponse} from "next";
import {createNextAdminResponse} from "../../../../lib/product-auth/registration-next.server.ts";
import {sendHttpsResponse} from "../../../../lib/product-auth/session-https.server.ts";
export const config={api:{bodyParser:false}};
const respond=createNextAdminResponse("summary");
export default async function handler(req:NextApiRequest,res:NextApiResponse){await sendHttpsResponse(res,await respond(req));}
