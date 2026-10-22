# 📍 ShareMap

A private website where a group (a family, a sports club, friends, a team…) shares favourite places (Google Maps links) and organises
get-togethers at them. It's a static site hosted free on **GitHub Pages**, with data stored in **Supabase**.

## Features

- **Organizations**: each group (family, friends, a club) has its own places, categories and calendar.
  - Create one, or join one by entering its **invite code** (or by opening an invite link).
  - Belong to several organizations and **switch** between them from the top bar.
  - The owner can rename the organization, make a new invite code (the old one stops working), remove members,
    or delete the organization. If the owner leaves, the longest-standing member becomes owner.
- **Languages**: English, 日本語, 繁體中文 and 简体中文, switchable from the top bar. The browser language is used
  by default and the choice is remembered. Dates and weekday names follow the language.
  To add a language, copy a block in [`js/i18n.js`](js/i18n.js).
- **Places**: paste a Google Maps share link (or the whole "Share" text; the name fills in automatically).
  Clicking a place opens it in Google Maps (on phones it opens in the Google Maps app).
- **Place covers**: each place shows a small OpenStreetMap map centered on it, in its category's colour,
  with the place name and the next time something is planned there (date and time follow the chosen language).
  Click the time to jump to that event. No images are stored: the map squares load from openstreetmap.org,
  and the location comes from the Google Maps link (see step 5 below). Places whose location can't be found
  show a generated map-style pattern instead.
- **Categories**: two levels (main category → sub-category), e.g. `Food › Ramen`. Only the organization's owner
  can add, rename or delete them; other members don't see the Categories tab.
- **Adding places**: each member can add 1 place a day (Japan time); organizers can add 2. The owner has no limit. A place can be edited or deleted only by the person who added it, or by the owner.
- **Calendar**: pick a place from the list and create an event.
  - **Repeat**: weekly (choose weekdays, every N weeks), daily, or monthly, with an optional end date.
    A Supabase cron job runs every night and keeps creating dates 90 days ahead.
  - **Auto-join every time**: subscribe to a repeating event and you're registered for every new date.
  - **People limit**: people can still join after it's full. They go on the **waiting list**, which everyone
    can see, and move up automatically when someone leaves.
  - Bring a guest, cancel a single date, edit or stop a series, add to Google Calendar.
  - **Share**: an event's *Share* button shows the invitation, time, place and link. *Copy invitation* copies it as
    one plain text, which pastes into WeChat, LINE or any chat as one message with a tappable link. On phones,
    *Send the link with an app* opens the share sheet with the link alone (sending text and link together arrives
    in WeChat as a message plus a file). The invitation reads *"Tom invites you to attend Mon, Nov 30 Badminton"*
    (the sharer's name, the date and the event). The link itself is short, letters and numbers only
    (`…/?join=CODE&event=ID`), so chats show it as a tappable link. Someone opening it is told on the sign-in page
    that they are invited, signs in or taps *Guest*, and lands on the event. The invite code in the link means
    people not in the group yet join it on the way (members just open the event). Like the invite link, anyone it is
    forwarded to can join; making a new invite code stops that (members can still open it). Links shared before v23
    have no invite code and can't add anyone: share the event again.
    While an event is open the page title is that invitation (with your name), so sharing it from WeChat's own
    browser (the ··· menu) makes a chat card titled with it. WeChat (on iPhone at least) shares the address the page
    was opened with, so in WeChat the *Share* button first reopens the page on the event's link, then ··· sends it.
  - Anyone can create an event; only the person who created it can edit, cancel or delete it.
    Each event shows when and by whom it was created.
  - **History**: every event has a *History* button showing who signed up and when, and every
    create / edit / cancel / delete by the organizer. *History* on the calendar shows the whole
    organization's record, including deleted events. The record is written by the database itself and
    nobody, the owner included, can change or delete it.
- **Guests**: on the sign-in screen, *Guest* lets someone in with only a nickname (no email). Guests can join a
  group with an invite code and sign up for events, but cannot create groups or events. A guest account is
  deleted automatically 7 days after joining its first group (checked every hour), together with its sign-ups;
  the event history keeps the record. Signing out of a guest account loses it.
- **Owner controls**: the organization's owner can remove anyone's sign-up and delete any event (it is recorded in the event's history). On the **Permissions** page (only the
  owner sees it) the owner taps **Edit** to tick *Organizer*, *Create events* and *Join events* for each member, then ✔ to save (× to discard),
  remove someone from the group, or **ban** them so they can never rejoin (until unbanned).
- **Private**: you can only see an organization's data if you're a member (enforced by database rules).
- **Add to home screen**: a button in the top bar (and on the sign-in screen) shows how to add ShareMap to an
  iPhone or Android home screen, or install it on a computer (Chrome or Edge); it then opens like an app with its own icon.
  The guide also pops up once, the first time someone signs in on a browser, right after a short tour
  (dashed box + arrow + OK) of the main buttons. The footer shows the version (the `?v=` number in index.html) and the maker.
- **Ranking**: two lists, this month and this year (they start over on the 1st and on January 1, Japan time), each with
  the top 10 members by events attended (past, not-cancelled dates where they had a confirmed spot),
  with gold, silver and bronze for 1st to 3rd and ties sharing a place. Your own place is shown below the list.
- **How soon an event is**: upcoming event cards and calendar chips are colored by when they start: red today, orange tomorrow,
  yellow within 3 days, blue within a week, and plain after that (a legend is under the calendar). Past events are gray.
- **WeChat mini program** (optional, see [below](#wechat-mini-program)): the same groups, places and events inside WeChat,
  signed in with WeChat instead of an email and password.

## Setup (about 15 minutes)

### 1. Supabase

1. Create a free project at <https://supabase.com>. Pick region *Tokyo* if you're in Japan.
2. Go to **Database → Extensions** and enable **pg_cron**.
3. Go to **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
4. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Configure the site

Edit [`js/config.js`](js/config.js) and paste in the URL and anon key.
The anon key is designed to be public; the database's Row Level Security protects your data.

### 3. GitHub Pages

1. Create a GitHub repository (e.g. `sharemap`) and push this folder to it:
   ```bash
   git init && git add . && git commit -m "ShareMap" && git branch -M main
   ```
   ```bash
   git remote add origin https://github.com/<you>/sharemap.git && git push -u origin main
   ```
2. Go to **Repo → Settings → Pages**, set *Source: Deploy from a branch*, *Branch: main / (root)*, then Save.
3. After a minute your site is live at `https://<you>.github.io/sharemap/`.

### 4. Sign-in settings in Supabase

Members sign in with email + password.

- **Authentication → URL Configuration**: set **Site URL** to `https://<you>.github.io/sharemap/` and add the
  same URL to **Redirect URLs** (plus `http://localhost:8765/` for local testing). Password-reset links use it.
- **Authentication → Sign In / Providers → Email**:
  - **Confirm email**: turn it **off** if you don't want new members to confirm their address before using the
    site; leave it on if you do (then they need the confirmation email first).
  - **Minimum password length**: 8 matches the site.
  - **Allow anonymous sign-ins**: turn it **on** for the *Guest* option (under **Authentication → Sign In / Providers**).
    Anyone with the site link can create a guest account; **Authentication → Rate Limits** caps how many per hour.
- **Forgot password** sends an email, so it needs working email (custom SMTP, e.g. a Gmail app password, under
  **Authentication → Emails → SMTP Settings**). The **Reset Password** template is the one used.

People who used the site before passwords existed have no password yet: they can set one under
**Members → Password** while still signed in, or use **Forgot password?** on the sign-in screen.

### Updating an existing project

When you pull a new version, open **SQL Editor → New query**, paste the whole of
[`supabase/schema.sql`](supabase/schema.sql) again and click **Run**. It is safe to run more than once and keeps
your data.

### 5. Maps on place cards (optional)

Short Google Maps share links (`maps.app.goo.gl/…`) don't contain the location, so a small Edge Function
([`supabase/functions/resolve-map`](supabase/functions/resolve-map)) follows the link and returns the
coordinates. It only opens Google Maps links and never writes to the database. Deploy it once with the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase login
npx supabase functions deploy resolve-map --project-ref <your-project-ref>
```

Your project ref is the `xxxx` part of `https://xxxx.supabase.co`. After that, new places get a map when
saved, and older ones are filled in automatically when their owner or the group owner opens the Places tab.
Without the function, long Google Maps links still get a map and the rest show the generated pattern.

When a link has no coordinates, the function searches the place name in OpenStreetMap data (Photon) and only
accepts a result in the city/ward from the share text's address, or with a matching name. If it isn't sure it
returns nothing and the card keeps the pattern; a link with only a name (no address) can still match a
same-named place elsewhere. If a card looks wrong, edit the place and paste the full Google Maps "Share" text.

### 6. Start using it

Sign in, create your organization, then open the **Members** tab and share the invite code or link.

## WeChat mini program

[`miniprogram/`](miniprogram) is a WeChat mini program on the same Supabase project: same tables, Row Level Security
and RPCs, so a group, its places and its events are the same on the website and in WeChat. It looks like the website
(the same colors, cards, chips, calendar and event page, in light and dark mode) and is in 简体中文.

- **Signing in**: opening the mini program signs people in with their WeChat identity. There is no email, password,
  sign-up screen or *Guest* option. The first time, they're asked for a nickname (the box offers their WeChat
  nickname), which the group sees and which shared invitations show.
- **What it does**: switch groups, join a group with an invite code, browse places (tap one to open it in WeChat's
  map, or copy its Google Maps link), the events calendar and upcoming list, and an event's page, with join, leave,
  the waiting list, bring a friend, auto-join for repeating events, and **Share**.
- **Sharing** an event sends a chat card titled *"Tom 邀请你参加 11月30日周一 羽毛球"* that opens the event. Like the
  website's event links, it carries the group's invite code, so people not in the group yet join it on the way. On
  the **Members** tab, *发送邀请* shares an invitation to the group (it asks before joining, like the invite link).
- **Use the website** to add places, create or edit events, create groups, and for categories, the ranking,
  permissions and history.
- **Accounts**: a WeChat account is a full member, not a guest, and is never deleted automatically. It is a different
  ShareMap account from an email account on the website, so someone who uses both appears in the group twice.

How it talks to Supabase: a released mini program may only call addresses with a Chinese ICP filing
(**"域名必须经过 ICP 备案"**, [network docs](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)),
and `supabase.co` has none and can't get one. So its requests go through a cloud function on WeChat Cloud Development
(云开发), [`cloudfunctions/supabase`](miniprogram/cloudfunctions/supabase), which forwards them to Supabase: cloud
functions aren't limited by that rule. It only reaches this Supabase project and only the paths the mini program uses,
and adds no rights: each request carries the person's own sign-in token, so Row Level Security applies as on the website.

How sign-in works: the mini program gets a one-time code from `wx.login()` and sends it (through the cloud function)
to the [`wechat-login`](supabase/functions/wechat-login) Edge Function. That exchanges it with WeChat
(`jscode2session`) for the person's openid, makes their ShareMap account on the first visit (its email is made up from
the openid and ends in `.invalid`, so no mail is ever sent to it) and returns a normal Supabase session, which the
mini program refreshes like the website does. The AppSecret and Supabase's service key stay in Supabase; the cloud
function holds no secrets. No database changes are needed.

### Setting it up (personal mini program)

1. **Register** at <https://mp.weixin.qq.com> → 立即注册 → 小程序, as **个人** (personal). It needs an email address not
   used by another WeChat account, and a WeChat account verified with a mainland China ID. Then note the **AppID** and
   generate the **AppSecret** (开发管理 → 开发设置).
2. **Deploy the sign-in function** (your project ref is the `xxxx` in `https://xxxx.supabase.co`):
   ```bash
   npx supabase secrets set WECHAT_APPID=wx0123456789abcdef WECHAT_APPSECRET=your-app-secret --project-ref <your-project-ref>
   ```
   ```bash
   npx supabase functions deploy wechat-login --no-verify-jwt --project-ref <your-project-ref>
   ```
   `--no-verify-jwt` because callers aren't signed in yet; the function only answers a valid WeChat code.
3. **Open the project** in [WeChat DevTools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html):
   *Import* the `miniprogram` folder with your AppID (or replace `touristappid` in
   [`project.config.json`](miniprogram/project.config.json); tourist mode can't sign in).
4. **Turn on Cloud Development**: click **云开发** in DevTools' toolbar and create an environment. It's a paid service;
   the console shows the plans (WeChat's 2026 growth plan also gives new developers a free personal environment for
  6 months).
   Copy the **环境 ID** into `CLOUD_ENV` in [`miniprogram/config.js`](miniprogram/config.js).
5. **Deploy the cloud function**: in DevTools, right-click `cloudfunctions/supabase` → **上传并部署：所有文件** (it has
   no dependencies). Then in the Cloud Development console → 云函数 → `supabase` → configuration, set the **timeout**
   to 20 seconds (the default 3 s is too short for a first sign-in). No request domain needs to be added: Supabase is
   only reached through the function, and the map squares on place cards are `<image>`s, which need no entry.
6. **Privacy declaration** (设置 → 服务内容声明 → 用户隐私保护指引): declare the **nickname** (用户信息：微信昵称) and the
   **clipboard** (剪切板, used to copy invite codes and map links). WeChat blocks undeclared ones.
7. **Mini program filing** (小程序备案, in the console): needed before release; it asks for the mainland ID, a mainland
   phone number and face verification, and is reviewed before it's approved.
8. Upload a version from DevTools, try it as the trial version (体验版), then submit it for review and release. Choose a
   service category (服务类目) that fits; the console only offers those open to personal mini programs.

To try it before registering, a test account (<https://developers.weixin.qq.com/sandbox>) gives a test AppID and
AppSecret for steps 2–3. Test accounts have no Cloud Development, so leave `CLOUD_ENV` empty: the mini program then
calls Supabase directly, which works in DevTools (*不校验合法域名* is already on in `project.config.json`) and on a phone
with *开发调试* switched on (··· menu), but not in a released version.

### Notes

- Google Maps doesn't open inside WeChat (and is blocked in mainland China), so a place opens in WeChat's own map
  at its coordinates. Places without coordinates copy their Google Maps link instead. WeChat's map uses China's
  coordinate system inside mainland China, so places there can show a few hundred meters off.
- When something fails, the error says why. *url not in domain list* means `CLOUD_ENV` is empty, so the mini program
  called Supabase directly; *FUNCTION_NOT_FOUND* or *cloud.callFunction:fail* means the cloud function isn't deployed
  in that environment (step 5); *TIME_LIMIT_EXCEEDED* means its timeout is still the default 3 s.
- The cloud function runs in mainland China and Supabase doesn't, so each request takes a little longer than on the
  website (more so from inside China).
- Review may ask for a content check on text people type in the mini program (the only free text is a friend's name;
  nicknames are checked by WeChat's nickname box). If it does, the cloud function is where to add WeChat's
  `msgSecCheck`.
- Tests (WeChat and Supabase are replaced by fakes; nothing is sent):
  ```bash
  npx deno test supabase/functions/wechat-login/
  ```
  ```bash
  node --test "miniprogram/test/*.test.js"
  ```
  With `LIVE=1` the mini program tests also send every query it reads with to your Supabase project, using only the
  anon key: Row Level Security returns no rows, but a wrong column or relation is refused. Nothing is written.
  Behind a proxy, add `NODE_USE_ENV_PROXY=1`.
- The icons and place-cover colors are made from `index.html` and `css/style.css`. After changing those, run
  `node miniprogram/tools/build-styles.js`.

## Local testing

```bash
python -m http.server 8765
```
Then open <http://localhost:8765/>.

## Notes

- Dates are generated 90 days ahead. To change this, edit `event_horizon_days()` in `schema.sql`.
- To change the date, time or repeat rule of a series, delete it and create a new one. You can edit the
  title, people limit, details and end date, or stop the series.
- A monthly event on the 29th–31st skips months that don't have that day.
- Places and categories can be edited by any member. An event can only be edited by the person
  who created it, who can also remove participants.
- Free Supabase projects pause after a week with no activity. If yours pauses, click *Restore* in the
  Supabase dashboard.
