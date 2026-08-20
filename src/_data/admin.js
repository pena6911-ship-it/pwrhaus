export default function admin() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    ghlLocationId: process.env.GHL_LOCATION_ID || '',
  };
}
