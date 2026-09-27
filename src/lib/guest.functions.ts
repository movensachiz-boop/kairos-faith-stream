import { createServerFn } from "@tanstack/react-start";

export const GUEST_EMAIL = "guest@kairos.app";
export const GUEST_PASSWORD = "kairos-guest-2026";

// Creates the shared guest account once (email pre-confirmed) so the
// "Enter as guest" button can sign in without any user details.
export const ensureGuestUser = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: GUEST_EMAIL,
    password: GUEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "KAIROS Guest", username: "kairos_guest" },
  });
  // "already registered" is fine — the account exists, sign-in will proceed.
  if (error && !/already|exists|registered/i.test(error.message)) {
    throw new Error(error.message);
  }
  return { ok: true };
});
