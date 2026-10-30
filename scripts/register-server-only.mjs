import { registerHooks } from "node:module";

// Node-only CLI/test loader. Next supplies the real server-only build guard.
// Reuse its bundled server-context marker without installing another dependency.
// Application/client code must never import this tooling helper.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "server-only" ?
      "next/dist/compiled/server-only/empty.js" : specifier, context);
  },
});
