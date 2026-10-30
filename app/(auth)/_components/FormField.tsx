import type { ChangeEventHandler, FocusEventHandler } from "react";
import styles from "../auth.module.css";

type FormFieldProps = {
  id: string;
  name: "name" | "email" | "password";
  label: string;
  type: "text" | "email" | "password";
  autoComplete: "name" | "email" | "new-password" | "current-password";
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onBlur: FocusEventHandler<HTMLInputElement>;
  error?: string;
  hint?: string;
  passwordVisible?: boolean;
  onTogglePassword?: () => void;
};

export default function FormField({
  id, name, label, type, autoComplete, value, onChange, onBlur, error, hint,
  passwordVisible = false, onTogglePassword,
}: FormFieldProps) {
  const additionalHint = hint !== error ? hint : undefined;
  const describedBy = [error && id + "-error", additionalHint && id + "-hint"].filter(Boolean).join(" ");
  const hasToggle = type === "password" && Boolean(onTogglePassword);
  const visibilityLabel = passwordVisible ? "Hide password" : "Show password";
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.inputControl}>
        <input id={id} name={name} type={type === "password" && passwordVisible ? "text" : type}
          className={hasToggle ? styles.passwordInput : undefined} autoComplete={autoComplete}
          autoCapitalize={name === "name" ? "words" : "none"} spellCheck={false} required
          value={value} onChange={onChange} onBlur={onBlur}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy || undefined} />
        {hasToggle && (
          <button type="button" className={styles.passwordToggle}
            aria-label={visibilityLabel} aria-controls={id} title={visibilityLabel}
            onClick={onTogglePassword}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              aria-hidden="true" focusable="false">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {passwordVisible && <path d="m3 3 18 18" />}
            </svg>
          </button>
        )}
      </div>
      {additionalHint && <p id={id + "-hint"} className={styles.hint}>{additionalHint}</p>}
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
