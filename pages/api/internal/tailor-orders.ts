import {createNextOrderHandler} from "../../../lib/product-auth/registration-next.server.ts";
export const config={api:{bodyParser:false}};
export default createNextOrderHandler();
