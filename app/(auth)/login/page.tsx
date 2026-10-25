import type { Metadata } from "next";
import Link from "next/link";
import AuthForm from "../_components/AuthForm";
import FormField from "../_components/FormField";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Tailor login | StitchTrack" };

export default function LoginPage() {
  return (
    <>
      <h1 id="auth-title" className={styles.title}>Log in to StitchTrack</h1>
      <p className={styles.description}>For tailors and fashion studios.</p>
      <AuthForm buttonLabel="Log in" legend="Login details"
        unavailableMessage="Login is not available yet.">
        <FormField id="login-email" name="email" label="Email address"
          type="email" autoComplete="email" />
        <FormField id="login-password" name="password" label="Password"
          type="password" autoComplete="current-password" />
      </AuthForm>
      <nav className={styles.navigation} aria-label="Account options">
        <p><Link href="/forgot-password">Forgot your password?</Link></p>
        <p>New to StitchTrack? <Link href="/signup">Create your tailor account</Link></p>
      </nav>
    </>
  );
}
