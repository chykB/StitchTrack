import type { ChangeEventHandler, FocusEventHandler, Ref } from "react";
import styles from "../auth.module.css";

type EmailCodeFieldProps = {
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
  error?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onBlur: FocusEventHandler<HTMLInputElement>;
};

export default function EmailCodeField({
  id = "verification-code", inputRef, error, onChange, onBlur,
}: EmailCodeFieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>Email verification code</label>
      {/* A code is an identifier: keep the DOM string unchanged, including leading zeros.
          Numeric input mode is a keyboard hint, not validation or authentication. */}
      <input ref={inputRef} id={id} name="code" type="text" inputMode="numeric"
        pattern="[0-9]{6}" autoComplete="one-time-code"
        required spellCheck={false} onChange={onChange} onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={id + "-hint" + (error ? " " + id + "-error" : "")} />
      <p id={id + "-hint"} className={styles.hint}>Enter the code for your email.</p>
      {error && (
        <p id={id + "-error"} className={styles.error}>
          <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" aria-hidden="true" focusable="false">
            <path d="M12 3 2 21h20L12 3Z" strokeLinejoin="round" />
            <path d="M12 9v5m0 3v1" />
          </svg>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
