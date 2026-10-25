import type { Metadata } from "next";
import Link from "next/link";
import AuthForm from "../_components/AuthForm";
import FormField from "../_components/FormField";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Reset your password | StitchTrack" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 id="auth-title" className={styles.title}>Reset your password</h1>
      <p className={styles.description}>Use the email address for your tailor account.</p>
      <AuthForm buttonLabel="Request reset link" legend="Reset request"
        unavailableMessage="Password reset is not available yet.">
        <FormField id="reset-email" name="email" label="Email address"
          type="email" autoComplete="email" />
      </AuthForm>
      <nav className={styles.navigation} aria-label="Account options">
        <p><Link href="/login">Back to login</Link></p>
        <p>New to StitchTrack? <Link href="/signup">Create your tailor account</Link></p>
      </nav>
    </>
  );
}
