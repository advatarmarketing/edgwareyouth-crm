"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMany } from "@/lib/notify";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

/** Turns a constraint or trigger message into something a human can act on. */
function explain(message: string): string {
  if (/Zakat cannot be moved/i.test(message)) return message;
  if (/nobody_decides_their_own_claim/.test(message)) {
    return "You cannot approve your own claim. Somebody else has to.";
  }
  if (/rejection_needs_a_reason/.test(message)) {
    return "Say why it is being rejected.";
  }
  if (/no_account_numbers/.test(message)) {
    return "That looks like a card or account number. This system never stores them — describe the payment instead.";
  }
  if (/collections_need_two_counters/.test(message)) {
    return "A collection needs two different people named as counters.";
  }
  if (/what kind of fund it is cannot be changed/i.test(message)) return message;
  if (/row-level security/i.test(message)) {
    return "You do not have permission to do that.";
  }
  return message;
}

export async function recordTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount.", ok: null };

  const source = String(formData.get("source") ?? "other");
  const { error } = await supabase.from("finance_transactions").insert({
    fund_id: String(formData.get("fund_id") ?? ""),
    direction: String(formData.get("direction") ?? "in") as "in" | "out",
    amount,
    occurred_on: String(formData.get("occurred_on") ?? "") || new Date().toISOString().slice(0, 10),
    description: String(formData.get("description") ?? "").trim() || null,
    source: source as never,
    member_id: String(formData.get("member_id") ?? "").trim() || null,
    counted_by_1: String(formData.get("counted_by_1") ?? "").trim() || null,
    counted_by_2: String(formData.get("counted_by_2") ?? "").trim() || null,
    recorded_by: user.id,
  });

  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/finance");
  return { error: null, ok: "Recorded." };
}

/**
 * Moving money between funds.
 *
 * The zakat rule is not checked here. It is a database trigger, and
 * this action only translates the refusal into a sentence — which is
 * the right way round: if this code were the guard, a script or the
 * dashboard would walk straight past it.
 */
export async function transferBetweenFunds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount.", ok: null };

  const { error } = await supabase.from("fund_transfers").insert({
    from_fund_id: String(formData.get("from_fund_id") ?? ""),
    to_fund_id: String(formData.get("to_fund_id") ?? ""),
    amount,
    reason: String(formData.get("reason") ?? "").trim() || null,
    moved_by: user.id,
  });

  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/finance");
  return { error: null, ok: "Moved." };
}

export async function submitClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter what you spent.", ok: null };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Say what it was for.", ok: null };

  // The receipt goes up first. A claim row with a receipt_path pointing
  // at a file that failed to upload is worse than no claim at all.
  let receiptPath: string | null = null;
  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.size > 0) {
    const ext = receipt.name.split(".").pop()?.toLowerCase() ?? "jpg";
    // The first path segment must be the uploader's id — that is what
    // the storage policies in 0012 key off.
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, receipt, { contentType: receipt.type || undefined });
    if (uploadError) return { error: `The receipt would not upload: ${uploadError.message}`, ok: null };
    receiptPath = path;
  }

  const { error } = await supabase.from("expense_claims").insert({
    claimant_id: user.id,
    amount,
    spent_on: String(formData.get("spent_on") ?? "") || new Date().toISOString().slice(0, 10),
    description,
    fund_id: String(formData.get("fund_id") ?? "").trim() || null,
    receipt_path: receiptPath,
    status: "submitted",
  });

  if (error) return { error: explain(error.message), ok: null };

  const { data: approvers } = await supabase
    .from("profiles").select("id").eq("tier", "shura").eq("is_active", true);
  if (approvers?.length) {
    await notifyMany(
      createAdminClient(),
      approvers.map((a) => a.id).filter((id) => id !== user.id),
      {
        kind: "expense_decision",
        title: `Expense claim to approve — £${amount.toFixed(2)}`,
        body: description,
        href: "/app/finance/claims",
      },
    );
  }

  revalidatePath("/app/finance/claims");
  return { error: null, ok: "Submitted." };
}

/**
 * Approve, reject or mark paid.
 *
 * `decided_by` is set to the caller and nothing else. The RLS policy
 * requires that too, which is what stops an approval being recorded in
 * somebody else's name — and the table's CHECK constraint refuses it
 * outright if that somebody is the claimant.
 */
export async function decideClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["approved", "rejected", "paid"].includes(decision)) {
    return { error: "That is not a decision.", ok: null };
  }

  const note = String(formData.get("decision_note") ?? "").trim();
  if (decision === "rejected" && !note) return { error: "Say why it is being rejected.", ok: null };

  const { error } = await supabase
    .from("expense_claims")
    .update({
      status: decision as "approved" | "rejected" | "paid",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
      paid_at: decision === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return { error: explain(error.message), ok: null };

  const { data: claim } = await supabase
    .from("expense_claims").select("claimant_id, amount").eq("id", id).maybeSingle();
  if (claim) {
    await notifyMany(createAdminClient(), [claim.claimant_id], {
      kind: "expense_decision",
      title: `Your claim was ${decision} — £${Number(claim.amount).toFixed(2)}`,
      body: note || null,
      href: "/app/finance/claims",
    });
  }

  revalidatePath("/app/finance/claims");
  return { error: null, ok: `Marked ${decision}.` };
}

export async function recordPledgeMonth(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const month = String(formData.get("month") ?? "");
  if (!month) return { error: "Pick a month.", ok: null };
  // The constraint wants the first of the month; the form gives a
  // month input, which is already the first, but be explicit.
  const firstOfMonth = `${month.slice(0, 7)}-01`;
  const status = String(formData.get("status") ?? "paid");
  const amountRaw = String(formData.get("amount_paid") ?? "").trim();

  const { error } = await supabase.from("pledge_payments").upsert(
    {
      pledge_id: String(formData.get("pledge_id") ?? ""),
      month: firstOfMonth,
      status: status as "paid" | "missed" | "partial" | "waived",
      amount_paid: amountRaw ? Number(amountRaw) : null,
      recorded_by: user.id,
    },
    { onConflict: "pledge_id,month" },
  );

  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/finance/pledges");
  return { error: null, ok: "Recorded." };
}

export async function saveDonor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Who is it?", ok: null };

  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? Number(v) : null;
  };

  const { error } = await supabase.from("donors").insert({
    owner_id: user.id,
    name,
    contact: String(formData.get("contact") ?? "").trim() || null,
    approached_on: String(formData.get("approached_on") ?? "").trim() || null,
    pledged_amount: num("pledged_amount"),
    received_amount: num("received_amount"),
    next_follow_up: String(formData.get("next_follow_up") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/finance/donors");
  return { error: null, ok: "Added." };
}

export async function updateDonorField(
  id: string,
  field: string,
  value: string,
): Promise<{ error?: string }> {
  const allowed = new Set([
    "contact", "approached_on", "pledged_amount", "received_amount", "next_follow_up", "notes",
  ]);
  if (!allowed.has(field)) return { error: "That field cannot be edited here." };

  const numeric = field === "pledged_amount" || field === "received_amount";
  const trimmed = value.trim();
  const out = trimmed === "" ? null : numeric ? Number(trimmed) : trimmed;
  if (numeric && out !== null && Number.isNaN(out)) return { error: "That needs to be a number." };

  const supabase = createClient();
  const { error } = await supabase
    .from("donors")
    .update({ [field]: out } as Partial<import("@/lib/supabase/types").Donor>)
    .eq("id", id);

  if (error) return { error: explain(error.message) };
  revalidatePath("/app/finance/donors");
  return {};
}
