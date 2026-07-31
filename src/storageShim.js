// This file makes the site's storage calls (window.storage.get/set/...) work
// outside of Claude, using a free Supabase table as the real shared database.
// The App code itself is unchanged — it was written against this same interface.
import { supabase } from "./supabaseClient";

async function get(key) {
  const { data, error } = await supabase
    .from("kv_store")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("not found");
  return { key, value: data.value };
}

async function set(key, value) {
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
  return { key, value };
}

async function del(key) {
  const { error } = await supabase.from("kv_store").delete().eq("key", key);
  if (error) throw error;
  return { key, deleted: true };
}

async function list(prefix) {
  let query = supabase.from("kv_store").select("key");
  if (prefix) query = query.like("key", `${prefix}%`);
  const { data, error } = await query;
  if (error) throw error;
  return { keys: (data || []).map((r) => r.key), prefix };
}

window.storage = { get, set, delete: del, list };
