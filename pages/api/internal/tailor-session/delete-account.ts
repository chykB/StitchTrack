import {createNextAccountDeletionHandler} from "../../../../lib/product-auth/registration-next.server.ts";
export const config={api:{bodyParser:false}};
export default createNextAccountDeletionHandler();
