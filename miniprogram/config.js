// The same Supabase project as the website (js/config.js). The anon key is meant to be public;
// data is protected by Row Level Security. Sign-in goes through the wechat-login Edge Function.
module.exports = {
  SUPABASE_URL: 'https://lkbhyzsyfevhaxwlzbwu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYmh5enN5ZmV2aGF4d2x6Ynd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NzU3ODQsImV4cCI6MjEwNzQ1MTc4NH0.8xVF82m7MYqjVlp9_lbW19CEscCuir1Ig5tJ8NjBdgA',
  // Cloud Development environment ID (云开发 → 设置 → 环境 ID). When set, every request goes through
  // the "supabase" cloud function, which a released mini program needs (supabase.co has no ICP
  // filing). Empty = call Supabase directly: fine in DevTools and with a test account.
  CLOUD_ENV: '',
};
