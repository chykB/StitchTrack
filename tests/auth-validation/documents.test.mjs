import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TermsPreview, DraftDocument, AuthScreen } from "./rendering.mjs";
import { documentLink, focusViewTarget, inlineContent, nextSignupView, parseDraft } from "../../lib/auth/draft-document.ts";

const fixtures = { terms: "# Terms\n\nExact **draft** wording.", privacy: "# Privacy\n\nExact privacy wording." };
const noop = () => {};
const normalized = text => text.replace(/\s+/g, " ").trim();
function findAll(node, type) {
  if (!node || typeof node !== "object") return [];
  return [...(node.type === type ? [node] : []),
    ...[node.props?.children].flat(Infinity).flatMap(child => findAll(child, type))];
}

test("acknowledgement has one noninteractive native label and independent nonsubmit document actions", () => {
  let checked = false, calls = [];
  const tree = TermsPreview({ checked, onChange(value) { checked = value; },
    onBlur: noop, onOpenDocument(kind, trigger) { calls.push({ kind, trigger }); } });
  const label = findAll(tree, "label")[0], input = findAll(tree, "input")[0];
  assert.equal(findAll(label, "button").length, 0);
  assert.equal(findAll(label, "a").length, 0);
  assert.equal(input.props.required, true);
  const buttons = findAll(tree, "button");
  for (const [index, kind] of ["terms", "privacy"].entries()) {
    const button = buttons[index];
    assert.equal(button.props.type, "button");
    assert.equal(button.props.onKeyDown, undefined); // Native Enter/Space.
    assert.equal(button.props.tabIndex, undefined);
    const trigger = { focus: noop };
    button.props.onClick({ currentTarget: trigger });
    assert.equal(checked, false);
    assert.deepEqual(calls.at(-1), { kind, trigger });
  }
  input.props.onChange({ currentTarget: { checked: true } });
  assert.equal(checked, true);
  const html = renderToStaticMarkup(createElement(TermsPreview, {
    checked: false, onChange: noop, onBlur: noop, onOpenDocument: noop,
  }));
  assert.match(html, /I have reviewed the draft Terms and Privacy Policy\./);
  assert.doesNotMatch(html, /<section|<details|<summary|<pre/);
});

test("view policy excludes Login/Reset and missing previews", () => {
  for (const view of ["signup", "terms", "privacy"]) {
    assert.equal(nextSignupView("signup", true, view), view);
    for (const mode of ["login", "reset"]) assert.equal(nextSignupView(mode, true, view), "signup");
    assert.equal(nextSignupView("signup", false, view), "signup");
  }
});

test("focus target contract focuses only the supplied heading or original trigger", () => {
  let focused = [];
  const heading = { focus() { focused.push("heading"); } }, trigger = { focus() { focused.push("trigger"); } };
  focusViewTarget(heading); focusViewTarget(trigger); focusViewTarget(null);
  assert.deepEqual(focused, ["heading", "trigger"]);
});

test("initial Signup renders the form and actions, without document content or duplicate titles", () => {
  const html = renderToStaticMarkup(createElement(AuthScreen, { mode: "signup", draftPreview: fixtures }));
  assert.equal((html.match(/id="auth-title"/g) || []).length, 1);
  assert.match(html, /name="email"/);
  assert.doesNotMatch(html, /<article|<pre|<details|Back to Signup|Exact privacy wording/);
});

test("links permit only existing document transitions and original safe public citations", () => {
  assert.equal(documentLink("privacy-policy-draft.md"), "privacy");
  assert.equal(documentLink("platform-terms-draft.md"), "terms");
  assert.equal(documentLink("https://ndpc.gov.ng/"), "external");
  for (const href of ["javascript:alert(1)", "data:text/html,bad", "//example.com", "https://user:secret@example.com",
    "../../docs/PRD.md", "terms-note.md#pre-launch-checklist"]) assert.equal(documentLink(href), null);
});

for (const kind of ["terms", "privacy"]) {
  test(kind + ": rendered body preserves all source words and exposes semantic headings/links/tables", () => {
    const file = kind === "terms" ? "platform-terms-draft.md" : "privacy-policy-draft.md";
    const source = readFileSync(new URL("../../task-03-client-validation/docs/" + file, import.meta.url), "utf8");
    const blocks = parseDraft(source);
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].level, 1);
    assert.equal(blocks.filter(b => b.type === "heading" && b.level === 1).length, 1);
    const html = renderToStaticMarkup(createElement(DraftDocument, { kind, source, onBack: noop, onDocument: noop }));
    assert.match(html, /<article[^>]*aria-labelledby="auth-title"/);
    assert.match(html, /<h1[^>]*id="auth-title"[^>]*tabindex="-1"/);
    assert.match(html, /<h2>/);
    assert.match(html, /<a[^>]*href="https:/);
    assert.doesNotMatch(html, /<pre|<details|dangerouslySetInnerHTML/);
    if (kind === "privacy") {
      assert.equal((html.match(/<table>/g) || []).length, 2);
      assert.match(html, /<thead><tr><th scope="col">/);
      assert.match(html, /<tbody>/);
    }
    const expected = source.split(/\r?\n/).filter(line => !/^\|[\s|:-]+\|$/.test(line))
      .map(line => line.startsWith("|") ? line.slice(1, -1).split("|").join(" ") : line)
      .join("\n").replace(/^#{1,6} /gm, "").replace(/\[([^\]]+)\]\([^\s)]+\)/g, "$1").replace(/\*\*/g, "");
    const actual = html.replace(/<(?:h[1-6]|p|li|td|th)\b[^>]*>/g, " ").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    assert.ok(normalized(actual) === "Back to Signup " + normalized(expected), "Rendered text must preserve source wording and punctuation");
  });
}

test("renderer supports list semantics and never interprets raw HTML", () => {
  const source = "# Example\n\n## List\n\n1. First\n2. Second\n\n- Third\n- Fourth\n\n<script>not executable</script>";
  const html = renderToStaticMarkup(createElement(DraftDocument, {
    kind: "terms", source, onBack: noop, onDocument: noop,
  }));
  assert.match(html, /<ol><li>First<\/li><li>Second<\/li><\/ol>/);
  assert.match(html, /<ul><li>Third<\/li><li>Fourth<\/li><\/ul>/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
  assert.deepEqual(inlineContent("Exact **wording** and *emphasis*.").map(p => p.text).join(""), "Exact wording and emphasis.");
});
