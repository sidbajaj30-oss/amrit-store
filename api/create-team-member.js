// /api/create-team-member.js
// Runs on Vercel's server only — never in the browser. Uses the SECRET
// service role key (never the public anon key) to create real Supabase
// Auth accounts for team members.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Server is missing Supabase configuration." });
  }

  const { name, username, password, role, requesterToken } = req.body || {};
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  if (!["owner", "staff"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const email = `${username.trim().toLowerCase()}@amritdryfruits.local`;

  try {
    // Check whether any owner account already exists (bootstrap case allows
    // creating the very first account without an existing logged-in owner).
    const { count, error: countErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (countErr) throw countErr;

    const isBootstrap = (count || 0) === 0;

    if (!isBootstrap) {
      // Not the first account — the requester must be a signed-in Owner.
      if (!requesterToken) return res.status(401).json({ error: "Not signed in." });
      const { data: userData, error: userErr } = await admin.auth.getUser(requesterToken);
      if (userErr || !userData?.user) return res.status(401).json({ error: "Not signed in." });
      const { data: requesterProfile, error: profErr } = await admin
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();
      if (profErr || requesterProfile?.role !== "owner") {
        return res.status(403).json({ error: "Only an Owner can add team members." });
      }
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr) throw createErr;

    const { error: insertErr } = await admin.from("profiles").insert({
      id: created.user.id,
      name,
      username: username.trim().toLowerCase(),
      role: isBootstrap ? "owner" : role,
    });
    if (insertErr) throw insertErr;

    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err?.message || "Something went wrong.";
    if (message.toLowerCase().includes("already registered") || message.toLowerCase().includes("duplicate")) {
      return res.status(409).json({ error: "That username is already taken." });
    }
    return res.status(500).json({ error: message });
  }
}
