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
- **Place covers**: each place gets a generated map-style cover in its category's colour, showing the
  place name and the next time something is planned there (date and time follow the chosen language).
  Click the time to jump to that event. No external image service, no cost.
- **Categories**: you create them yourselves, with two levels (main category → sub-category), e.g. `Food › Ramen`.
- **Calendar**: pick a place from the list and create an event.
  - **Repeat**: weekly (choose weekdays, every N weeks), daily, or monthly, with an optional end date.
    A Supabase cron job runs every night and keeps creating dates 90 days ahead.
  - **Auto-join every time**: subscribe to a repeating event and you're registered for every new date.
  - **People limit**: people can still join after it's full. They go on the **waiting list**, which everyone
    can see, and move up automatically when someone leaves.
  - Bring a guest, cancel a single date, edit or stop a series, add to Google Calendar.
- **Private**: you can only see an organization's data if you're a member (enforced by database rules).
- **Add to home screen**: a button in the top bar (and on the sign-in screen) shows how to add ShareMap to an
  iPhone or Android home screen; it then opens like an app with its own icon.

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
- **Forgot password** sends an email, so it needs working email (custom SMTP, e.g. a Gmail app password, under
  **Authentication → Emails → SMTP Settings**). The **Reset Password** template is the one used.

People who used the site before passwords existed have no password yet: they can set one under
**Members → Password** while still signed in, or use **Forgot password?** on the sign-in screen.

### 5. Start using it

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
