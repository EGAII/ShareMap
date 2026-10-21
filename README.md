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
    (the sharer's name, the date and the event). Someone opening the link sees it, and the group's name, on the
    sign-in page, signs in or taps *Guest*, and lands on the event. The link starts with the group's invite code, so
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
