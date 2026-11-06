export const LS_KEY = "pool_chem_webapp_v1";

/* ============================================================
   SUPABASE CROSS-DEVICE SYNC  (optional)
   To turn on cloud sync across all your devices, fill in these
   three values. Leave them blank to keep using local (per-browser)
   storage only. See the README for the 5-minute setup.
   - SUPABASE_URL : your project URL (https://xxxx.supabase.co)
   - SUPABASE_ANON_KEY : the project's public "anon" key
   - POOL_ID : any long hard-to-guess string YOU invent. This is
     your private access key — anyone with it can see your data,
     so make it long and random and don't share it publicly.
   ============================================================ */
export const SUPABASE_URL = typeof window !== "undefined" && window.POOL_CONFIG && window.POOL_CONFIG.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = typeof window !== "undefined" && window.POOL_CONFIG && window.POOL_CONFIG.SUPABASE_ANON_KEY || "";
export const POOL_ID = typeof window !== "undefined" && window.POOL_CONFIG && window.POOL_CONFIG.POOL_ID || "";
export const SYNC_ON = !!(SUPABASE_URL && SUPABASE_ANON_KEY && POOL_ID);

// REST helpers — single row per pool, holding the whole state blob in a JSON column.
export async function sbLoad() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pool_state?pool_id=eq.${encodeURIComponent(POOL_ID)}&select=data`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!r.ok) throw new Error("load " + r.status);
  const rows = await r.json();
  return rows.length ? rows[0].data : null;
}
export async function sbSave(state) {
  // upsert on pool_id
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pool_state?on_conflict=pool_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      pool_id: POOL_ID,
      data: state,
      updated_at: new Date().toISOString()
    })
  });
  if (!r.ok) throw new Error("save " + r.status);
}
