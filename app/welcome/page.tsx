import { Logo } from "@/components/Logo";
import { WelcomeForm } from "./WelcomeForm";

export const dynamic = "force-dynamic";

/**
 * Where an invite link lands. The person arriving has an account and no
 * password, and this page is the only thing standing between them and
 * the CRM — so it does one job and says plainly what went wrong if the
 * link is no good.
 *
 * Outside /app on purpose: middleware sends anybody without a session
 * under /app to /login, and somebody arriving from an invite does not
 * have a session until this page has read it out of the link.
 */
export default function WelcomePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ marginBottom: 28 }}>
          <Logo height={34} />
        </div>
        <WelcomeForm serverError={searchParams.error ?? null} />
      </div>
    </main>
  );
}
