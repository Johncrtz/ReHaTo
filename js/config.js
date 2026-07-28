// ReHaTo configuration
// ─────────────────────────────────────────────────────────────
// The publishable key is safe to ship in client code by design —
// data protection comes from Row Level Security in the database
// (see backend/schema.sql), not from hiding this key.
// Sync is OPT-IN: the app stays local-only until the user enables
// it via the cloud toggle in the header.
export const CONFIG = {
  supabaseUrl: 'https://epfdjgnizfszhuenjzkw.supabase.co',
  supabaseAnonKey: 'sb_publishable_K7R-oQSjUtJKSB3TCPvtWA_Cvfi1PDZ',
  version: '0.6.0',
};
