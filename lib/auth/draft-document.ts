import type { AuthMode } from "./state";

export type DocumentKind = "terms" | "privacy";
export type SignupView = "signup" | DocumentKind;
export type Inline = { type: "text" | "strong" | "em"; text: string } | { type: "link"; text: string; href: string };
export type DocumentBlock =
  | { type: "heading"; level: number; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { type: "table"; headings: Inline[][]; rows: Inline[][][] };

// A bounded renderer for the trusted repository drafts, not arbitrary HTML or a full Markdown engine.
export function inlineContent(source: string): Inline[] {
  const tokens: Inline[] = [];
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|(?<!\*)\*([^*]+)\*(?!\*)/g;
  let from = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index! > from) tokens.push({ type: "text", text: source.slice(from, match.index) });
    if (match[1] !== undefined) tokens.push({ type: "link", text: match[1], href: match[2] });
    else tokens.push({ type: match[3] !== undefined ? "strong" : "em", text: match[3] ?? match[4] });
    from = match.index! + match[0].length;
  }
  if (from < source.length) tokens.push({ type: "text", text: source.slice(from) });
  return tokens;
}

export function documentLink(href: string): DocumentKind | "external" | null {
  if (href === "platform-terms-draft.md") return "terms";
  if (href === "privacy-policy-draft.md") return "privacy";
  try {
    const url = new URL(href);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? "external" : null;
  } catch { return null; }
}

export function parseDraft(source: string): DocumentBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: DocumentBlock[] = [];
  const heading = (line: string) => /^(#{1,6}) (.+)$/.exec(line);
  const item = (line: string) => /^(?:(\d+)\. |([-*]) )(.+)$/.exec(line);
  const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => inlineContent(cell.trim()));
  const separator = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    const title = heading(lines[i]);
    if (title) { blocks.push({ type: "heading", level: title[1].length, content: inlineContent(title[2]) }); i++; continue; }
    if (lines[i].trim().startsWith("|") && separator(lines[i + 1] ?? "")) {
      const headings = cells(lines[i]); i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push({ type: "table", headings, rows }); continue;
    }
    const first = item(lines[i]);
    if (first) {
      const ordered = first[1] !== undefined, items: Inline[][] = [];
      const start = ordered ? Number(first[1]) : 1;
      while (i < lines.length) {
        const entry = item(lines[i]);
        if (!entry || (entry[1] !== undefined) !== ordered) break;
        items.push(inlineContent(entry[3])); i++;
      }
      blocks.push({ type: "list", ordered, start, items }); continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !heading(lines[i]) && !item(lines[i]) &&
      !(lines[i].trim().startsWith("|") && separator(lines[i + 1] ?? ""))) paragraph.push(lines[i++]);
    blocks.push({ type: "paragraph", content: inlineContent(paragraph.join("\n")) });
  }
  return blocks;
}

export function nextSignupView(mode: AuthMode, previewAvailable: boolean, requested: SignupView): SignupView {
  return mode === "signup" && previewAvailable ? requested : "signup";
}

export function focusViewTarget(target: { focus: () => void } | null): void { target?.focus(); }
