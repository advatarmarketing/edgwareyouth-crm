import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Escapes one cell for CSV, and defuses formula injection.
 *
 * A cell beginning = + - or @ is executed as a formula when the file is
 * opened in Excel or Sheets. A donor called "=cmd|..." is unlikely; a
 * description someone pasted that starts with a minus sign is not. The
 * leading apostrophe makes it text.
 */
function cell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const viewer = await loadViewer();
  if (!viewer) return new NextResponse("Not signed in.", { status: 401 });
  if (!viewer.can("finance.view_totals")) {
    return new NextResponse("You do not have permission to export finance data.", { status: 403 });
  }

  const supabase = createClient();

  // RLS applies to this read as well, so the export can never contain
  // more than the person could already see on screen.
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("occurred_on, direction, amount, source, description, fund_id, member_id")
    .order("occurred_on", { ascending: false });

  if (error) return new NextResponse(error.message, { status: 500 });

  const [{ data: funds }, { data: people }] = await Promise.all([
    supabase.from("funds").select("id, name"),
    supabase.from("member_directory").select("id, full_name"),
  ]);
  const fundOf = new Map((funds ?? []).map((f) => [f.id, f.name]));
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? ""]));

  const header = ["Date", "Fund", "In or out", "Amount", "Source", "Member", "Description"];
  const rows = (data ?? []).map((t) => [
    t.occurred_on,
    fundOf.get(t.fund_id) ?? "",
    t.direction === "in" ? "In" : "Out",
    Number(t.amount).toFixed(2),
    t.source,
    t.member_id ? nameOf.get(t.member_id) ?? "" : "",
    t.description ?? "",
  ]);

  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="edgware-youth-finance-${stamp}.csv"`,
      // It contains everything the organisation has taken in. It should
      // not sit in a shared cache.
      "Cache-Control": "no-store",
    },
  });
}
