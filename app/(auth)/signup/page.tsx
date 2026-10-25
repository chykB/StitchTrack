import type { Metadata } from "next";
import Link from "next/link";
import AuthForm from "../_components/AuthForm";
import FormField from "../_components/FormField";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Create your tailor account | StitchTrack" };

export default function SignupPage() {
  return (
    <>
      <h1 id="auth-title" className={styles.title}>Create your tailor account</h1>
      <p className={styles.description}>A clearer place for your tailoring business.</p>
      <AuthForm buttonLabel="Create account" legend="Account details"
        unavailableMessage="Account creation is not available yet.">
        <FormField id="signup-email" name="email" label="Email address"
          type="email" autoComplete="email" />
        <FormField id="signup-password" name="password" label="Password"
          type="password" autoComplete="new-password" />
      </AuthForm>
      <nav className={styles.navigation} aria-label="Account options">
        <p>Already have an account? <Link href="/login">Log in</Link></p>
      </nav>
      <p className={styles.clientNote}>
        Clients access their orders through a tailor’s invitation, without creating a password.
      </p>
    </>
  );
}
