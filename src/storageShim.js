// This file wires the site's storage/auth/orders/reviews calls to real,
// secure Supabase infrastructure for the deployed site — genuine Supabase
// Auth (not a password stored in a table), and real database tables for
// orders and reviews with row-level security enforced by Postgres itself.
import { supabase } from "./supabaseClient";

// ---------- window.storage (catalog, banners, recipes, settings) ----------
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

// ---------- window.auth (real Supabase Auth) ----------
function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@amritdryfruits.local`;
}

async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, name: data.name, username: data.username, role: data.role };
}

window.auth = {
  async getSession() {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return null;
    return fetchProfile(user.id);
  },

  async login(username, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) throw new Error("Incorrect username or password.");
    const profile = await fetchProfile(data.user.id);
    if (!profile) throw new Error("Account found but no profile — contact support.");
    return profile;
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async bootstrapOrCreateMember({ name, username, password, role }) {
    const { data: sessionData } = await supabase.auth.getSession();
    const requesterToken = sessionData?.session?.access_token || null;

    const res = await fetch("/api/create-team-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, password, role, requesterToken }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Could not create the account.");
  },

  async listTeam() {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
    if (error) return [];
    return (data || []).map((d) => ({ id: d.id, name: d.name, username: d.username, role: d.role }));
  },

  async removeTeamMember(id) {
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

// ---------- window.ordersApi (real orders table) ----------
function mapOrderRow(row) {
  return {
    id: row.id,
    orderCode: row.order_code,
    placedAt: row.created_at,
    status: row.status,
    paymentMethod: row.payment_method,
    customer: row.customer,
    items: row.items,
    subtotal: row.subtotal,
    shipping: row.shipping,
    total: row.total,
  };
}

window.ordersApi = {
  async list() {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (error) return [];
    return (data || []).map(mapOrderRow);
  },
  async insert(order) {
    const { error } = await supabase.from("orders").insert({
      order_code: order.orderCode,
      status: order.status || "new",
      payment_method: order.paymentMethod,
      customer: order.customer,
      items: order.items,
      subtotal: order.subtotal,
      shipping: order.shipping,
      total: order.total,
    });
    if (error) throw error;
  },
  async update(id, patch) {
    const dbPatch = {};
    if (patch.status) dbPatch.status = patch.status;
    const { error } = await supabase.from("orders").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) throw error;
  },
  async trackByPhone(phone, orderCode) {
    const { data, error } = await supabase.rpc("get_my_orders", {
      p_phone: phone,
      p_order_code: orderCode || null,
    });
    if (error) throw error;
    return (data || []).map(mapOrderRow);
  },
};

// ---------- window.reviewsApi (real reviews table) ----------
window.reviewsApi = {
  async listApproved() {
    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  },
  async listAll() {
    const { data, error } = await supabase.from("reviews").select("*").order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  },
  async insert(review) {
    const { error } = await supabase.from("reviews").insert({
      name: review.name,
      rating: review.rating,
      text: review.text,
      image: review.image || null,
      status: "pending",
    });
    if (error) throw error;
  },
  async approve(id) {
    const { error } = await supabase.from("reviews").update({ status: "approved" }).eq("id", id);
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) throw error;
  },
};
