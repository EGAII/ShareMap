// Edge Function "wechat-login": POST { code } → a Supabase session for the WeChat mini program.
// The mini program gets the code from wx.login(); this exchanges it with WeChat for the user's
// openid and signs in the ShareMap account tied to it, making the account on first use.
// Secrets (never in the repo): supabase secrets set WECHAT_APPID=… WECHAT_APPSECRET=…
// Deploy: supabase functions deploy wechat-login --no-verify-jwt   (callers aren't signed in yet)
import { handle } from './login.ts';

Deno.serve((req) => handle(req, (name) => Deno.env.get(name)));
