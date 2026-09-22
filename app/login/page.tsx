"use client";

import { useFormState, useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const initialState: LoginState = { error: null };

/**
 * One sign-in form, no tabs.
 *
 * The template had Client and Staff tabs because it served two
 * different audiences. This CRM is staff only — no parents,
 * participants or public log in — so a chooser here would be asking a
 * question with one answer, and implying an account type that does not
 * exist.
 *
 * Where somebody lands after signing in is decided by their profile in
 * login(), never by anything on this screen.
 */
export default function LoginPage() {
  const [state, formAction] = useFormState(login, initialState);

  return (
    <main className="login-shell">
      <div className="login-card">
        {/* The only switch a signed-out visitor gets. The app's own
            toggle lives in the nav, which does not exist until you are
            signed in. */}
        <div className="login-theme-toggle">
          <ThemeToggle />
        </div>

        {/* Both logo files are transparent cut-outs, so CSS picks the
            black lettering in light mode and the white in dark. */}
        <div style={{ marginBottom: 10 }}>
          <Logo height={34} />
        </div>

        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-3)",
            margin: "0 0 32px",
            letterSpacing: "0.05em",
          }}
        >
          SIGN IN TO YOUR ACCOUNT
        </p>

        <form action={formAction} autoComplete="off">
          <Field label="Email" name="email" type="email" />
          <Field label="Password" name="password" type="password" />

          {state.error && (
            <p
              role="alert"
              style={{
                color: "var(--danger-fg)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                margin: "0 0 16px",
              }}
            >
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>

        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-3)",
            marginTop: 20,
            textAlign: "center",
          }}
        >
          Accounts are created by the shura. Speak to them if you need one.
        </p>
      </div>
    </main>
  );
}

function Field({ label, name, type }: { label: string; name: string; type: string }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-2)",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete="off"
        defaultValue=""
        required
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text-1)",
          fontFamily: "var(--font-body)",
          fontSize: 14,
        }}
      />
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        padding: "12px 0",
        marginTop: 8,
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: "var(--accent)",
        color: "var(--accent-fg)",
        fontFamily: "var(--font-body)",
        fontWeight: 600,
        fontSize: 14,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
