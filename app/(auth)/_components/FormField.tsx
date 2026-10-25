import styles from "../auth.module.css";

type FormFieldProps = {
  id: string;
  name: "email" | "password";
  label: string;
  type: "email" | "password";
  autoComplete: "email" | "new-password" | "current-password";
};

export default function FormField({ id, name, label, type, autoComplete }: FormFieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} autoComplete={autoComplete}
        autoCapitalize="none" spellCheck={false} />
    </div>
  );
}
