import type {NextApiRequest,NextApiResponse} from "next";
import {createNextBusinessResponse} from "../../../lib/product-auth/registration-next.server.ts";
import {sendHttpsResponse} from "../../../lib/product-auth/session-https.server.ts";
export const config={api:{bodyParser:false}};
const respond=createNextBusinessResponse();
export default async function handler(request:NextApiRequest,response:NextApiResponse){
  await sendHttpsResponse(response,await respond(request));
}
