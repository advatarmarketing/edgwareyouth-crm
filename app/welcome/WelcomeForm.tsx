"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_HOME } from "@/lib/routes";
import { button, fieldLabel, input } from "@/lib/ui";

type Stage = "checking" | "ready" | "saving" | "no-link";

const MIN_LENGTH = 10;

/**
 * Turns an invite link into a signed-in person with a password.
 *
 * Supabase's default invite email sends people through its own verify
 * endpoint, which redirects here with the session in the URL's
 * #fragment — a part of the URL the server never receives. So this has
 * to happen in the browser: read the fragment, hand the tokens to the
 * Supabase client (which stores them as cookies the server CAN read),
 * then wipe them from the address bar.
 *
 * If the link came through /auth/confirm instead, the session is
 * already a cookie and the fragment is empty; the getSession() check
 * below covers that path too.
 */
export function WelcomeForm({ serverError }: { serverError: string | null }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [isReset, setIsReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function readLink() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      // Supabase reports a dead link in the fragment, not as an HTTP
      // error. The commonest cause is an email scanner that "clicked"
      // the one-time link before the person did.
      if (hash.get("error")) {
        setStage("no-link");
        setError(
          hash.get("error_code") === "otp_expired"
            ? "This link has expired or has already been used."
            : hash.get("error_description")?.replace(/\+/g, " ") ?? "This link did not work.",
        );
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (hash.get("type") === "recovery") setIsReset(true);

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        // The tokens are a live session. Leaving them in the address
        // bar puts them in the browser history and in any screenshot.
        window.history.replaceState(null, "", window.location.pathname);
        if (sessionError) {
          setStage("no-link");
          setError("This link has expired or has already been used.");
          return;
        }
      }

      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setEmail(data.user.email ?? null);
        setStage("ready");
        return;
      }

      setStage("no-link");
      setError(
        serverError === "expired"
          ? "This link has expired or has already been used."
          : "There is no invite in this link.",
      );
    }

    void readLink();
  }, [serverError]);

  async function save(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`At least ${MIN_LENGTH} characters. This account can see other people's details.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two do not match.");
      return;
    }

    setStage("saving");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setStage("ready");
      setError(
        /different from the old/i.test(updateError.message)
          ? "That is your current password. Choose a new one."
          : updateError.message,
      );
      return;
    }

    router.replace(APP_HOME);
    router.refresh();
  }

  if (stage === "checking") {
    return <p style={{ color: "var(--text-3)", fontSize: 14 }}>Checking your link…</p>;
  }

  if (stage === "no-link") {
    return (
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 10px" }}>
          This link has run out
        </h1>
        <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6, margin: "0 0 14px" }}>
          {error}
        </p>
        <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          Ask a member of the shura to send you a fresh invite. Links only work once, and some
          email apps open them automatically to check for viruses — which uses them up before
          you get the chance.
        </p>
      </div>
    );
  }

  return (
    <form action={save} style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, margin: "0 0 6px" }}>
          {isReset ? "Choose a new password" : "Create your password"}
        </h1>
        <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          {isReset ? "For " : "Welcome to Edgware Youth. You are signing in as "}
          <strong>{email}</strong>.
        </p>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={fieldLabel}>Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          autoFocus
          style={input}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={fieldLabel}>Type it again</span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          style={input}
        />
      </label>

      <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
        At least {MIN_LENGTH} characters. A short sentence you will remember is better than a
        word with symbols in it.
      </p>

      {error && <p style={{ color: "var(--danger, #c0392b)", fontSize: 14, margin: 0 }}>{error}</p>}

      <div>
        <button type="submit" disabled={stage === "saving"} style={button}>
          {stage === "saving" ? "Saving…" : "Save and go in"}
        </button>
      </div>
    </form>
  );
}
