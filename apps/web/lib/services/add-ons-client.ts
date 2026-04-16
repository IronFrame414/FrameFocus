import { createClient } from "@/lib/supabase-browser";
import type { AddOns } from "@/lib/services/add-ons";

export type { AddOns };

export async function setAiTaggingEnabled(enabled: boolean): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("is_deleted", false)
    .single();
  if (!profile) throw new Error("Profile not found");

  const { error } = await supabase
    .from("companies")
    .update({ ai_tagging_enabled: enabled })
    .eq("id", profile.company_id);

  if (error) throw error;
}
