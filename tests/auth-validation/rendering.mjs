// Database-free component rendering using the project's existing TypeScript and React packages.
// This is server markup inspection, not a browser or screen-reader simulation.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/link") return nextResolve("next/link.js", context);
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith(".") && context.parentURL) {
        for (const suffix of [".tsx", ".ts"]) {
          const url = new URL(specifier + suffix, context.parentURL);
          if (existsSync(url)) return { url: url.href, shortCircuit: true };
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".module.css")) {
      return { format: "module", source: "export default new Proxy({}, { get: (_, key) => String(key) });", shortCircuit: true };
    }
    if (url.endsWith(".tsx")) {
      const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

export const { default: FormField } = await import("../../app/(auth)/_components/FormField.tsx");
export const { default: AuthForm, readLocalSubmission, handleLocalSubmit } = await import("../../app/(auth)/_components/AuthForm.tsx");

export const { default: TermsPreview } = await import("../../app/(auth)/_components/TermsPreview.tsx");

export const { default: DraftDocument, DocumentInline } = await import("../../app/(auth)/_components/DraftDocument.tsx");
export const { default: AuthScreen } = await import("../../app/(auth)/auth/AuthScreen.tsx");
