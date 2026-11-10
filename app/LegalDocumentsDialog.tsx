"use client";

import { useEffect, useRef, useState } from "react";
import DraftDocument from "./(auth)/_components/DraftDocument";
import type { DocumentKind } from "../lib/auth/draft-document";
import styles from "./page.module.css";

export default function LegalDocumentsDialog({ terms, privacy }: { terms: string; privacy: string }) {
  const [document, setDocument] = useState<DocumentKind | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const source = document === "terms" ? terms : privacy;

  useEffect(() => {
    if (!dialog.current) return;
    if (document && !dialog.current.open) dialog.current.showModal();
    else if (!document && dialog.current.open) dialog.current.close();
  }, [document]);

  return <>
    <button
      className={styles.legalLink}
      type="button"
      aria-haspopup="dialog"
      aria-controls="homepage-legal-dialog"
      onClick={() => setDocument("terms")}
    >
      Terms and Privacy
    </button>
    <dialog
      id="homepage-legal-dialog"
      ref={dialog}
      className={styles.documentDialog}
      aria-labelledby={document ? "auth-title" : undefined}
      aria-describedby={document ? "draft-document-status" : undefined}
      onClose={() => setDocument(null)}
    >
      {document && <>
        <p id="draft-document-status" className={styles.documentStatus}>
          Unapproved working draft. Not in effect; viewing it does not record acceptance.
        </p>
        <nav className={styles.documentSwitch} aria-label="Terms and Privacy documents">
          <button type="button" aria-pressed={document === "terms"} onClick={() => setDocument("terms")}>
            Terms of Service
          </button>
          <button type="button" aria-pressed={document === "privacy"} onClick={() => setDocument("privacy")}>
            Privacy Notice
          </button>
        </nav>
        <DraftDocument
          kind={document}
          source={source}
          onBack={() => setDocument(null)}
          onDocument={setDocument}
          backLabel="Close document"
        />
      </>}
    </dialog>
  </>;
}
