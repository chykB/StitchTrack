import type { DocumentKind } from "../../../lib/auth/draft-document";
import styles from "../auth.module.css";

type TermsPreviewProps = {
  checked: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
  onBlur: () => void;
  onOpenDocument: (kind: DocumentKind, trigger: HTMLButtonElement) => void;
};

export default function TermsPreview({ checked, error, onChange, onBlur, onOpenDocument }: TermsPreviewProps) {
  const id = "signup-draft-acknowledgement";
  return (
    <div className={styles.draftAcknowledgement}>
      <div className={styles.acknowledgementRow}>
        <label className={styles.checkboxTarget}>
          <input id={id} name="draftAcknowledgement" type="checkbox" required
            checked={checked} onChange={event => onChange(event.currentTarget.checked)}
            onBlur={onBlur} aria-invalid={error ? true : undefined}
            aria-describedby={error ? id + "-error" : undefined} />
          <span className={styles.visuallyHidden}>I have reviewed the draft Terms and Privacy Policy.</span>
        </label>
        <p>I have reviewed the draft <button type="button" className={styles.documentLink}
          onClick={event => onOpenDocument("terms", event.currentTarget)}>Terms</button> and <button
          type="button" className={styles.documentLink}
          onClick={event => onOpenDocument("privacy", event.currentTarget)}>Privacy Policy</button>.</p>
      </div>
      {error && (
        <p id={id + "-error"} className={styles.error}>
          <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
            <path d="M12 3 2 21h20L12 3Z" strokeLinejoin="round" />
            <path d="M12 9v5m0 3v1" />
          </svg>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
