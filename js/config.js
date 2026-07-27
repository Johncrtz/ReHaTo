// ReHaTo configuration
// ─────────────────────────────────────────────────────────────
// Phase 1 (now):   backend: 'local'  → everything in localStorage
// Phase 2 (later): backend: 'supabase' → fill in URL + anon key,
//                  see backend/README.md for setup steps.
export const CONFIG = {
  backend: 'local', // 'local' | 'supabase'
  supabaseUrl: '',
  supabaseAnonKey: '',
  version: '0.1.0',
};
