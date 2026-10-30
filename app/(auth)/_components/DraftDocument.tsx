"use client";

import { createElement, useEffect, useRef } from "react";
import { documentLink, focusViewTarget, parseDraft } from "../../../lib/auth/draft-document";
import type { DocumentKind, Inline } from "../../../lib/auth/draft-document";
import styles from "../auth.module.css";

export function DocumentInline({ content, onDocument }: { content: Inline[]; onDocument: (kind: DocumentKind) => void }) {
  return <>{content.map((part, index) => {
    if (part.type === "link") {
      const destination = documentLink(part.href);
      if (destination === "external") return <a key={index} href={part.href} aria-label={part.text + " (opens in a new tab)"} target="_blank" rel="noopener noreferrer">{part.text}</a>;
      if (destination) return <button key={index} type="button" className={styles.documentLink}
        onClick={() => onDocument(destination)}>{part.text}</button>;
      // Repository-only PRD/review-note references remain text, not broken public routes.
      return <span key={index}>{part.text}</span>;
    }
    if (part.type === "strong" || part.type === "em") return createElement(part.type, { key: index }, part.text);
    return part.text;
  })}</>;
}

export default function DraftDocument({ kind, source, onBack, onDocument }: {
  kind: DocumentKind; source: string; onBack: () => void; onDocument: (kind: DocumentKind) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const blocks = parseDraft(source);
  useEffect(() => { focusViewTarget(heading.current); }, [kind]);
  return (
    <article className={styles.legalDocument} aria-labelledby="auth-title">
      <button type="button" className={styles.backToSignup} onClick={onBack}>Back to Signup</button>
      {blocks.map((block, index) => {
        const inline = (content: Inline[]) => <DocumentInline content={content} onDocument={onDocument} />;
        if (block.type === "heading") return createElement("h" + block.level, {
          key: index, id: index === 0 ? "auth-title" : undefined,
          ref: index === 0 ? heading : undefined, tabIndex: index === 0 ? -1 : undefined,
        }, inline(block.content));
        if (block.type === "paragraph") return <p key={index}>{inline(block.content)}</p>;
        if (block.type === "list") return createElement(block.ordered ? "ol" : "ul", { key: index,
          start: block.ordered && block.start !== 1 ? block.start : undefined },
          block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>));
        return <div key={index} className={styles.tableScroll} tabIndex={0} role="region"
          aria-label={block.headings.map(cell => cell.map(part => part.text).join("")).join(", ")}>
          <table><thead><tr>{block.headings.map((cell, column) => <th key={column} scope="col">{inline(cell)}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) =>
              <td key={column}>{inline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>;
      })}
    </article>
  );
}
