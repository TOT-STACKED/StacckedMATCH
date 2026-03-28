# StackMatch

**Tinder for your hospitality tech stack.**

Operators pick their biggest operational problem, confirm their EPOS, then swipe through matched tools. Right swipe = shortlist. Request intros directly from the app. Share your stack via link. Vendors manage their own listings.

---

## Tech Stack

| Layer    | Choice                          |
|----------|---------------------------------|
| Frontend | Vanilla HTML / CSS / JS (ES modules) |
| PWA      | Service worker + Web App Manifest |
| Backend  | Supabase (Postgres + Auth + RLS) |
| Hosting  | Any static host (Netlify / Vercel / Cloudflare Pages) |

---

## File Structure

```
stackmatch/
├── index.html              Main app shell (all pages + modals)
├── manifest.json           PWA manifest
├── sw.js                   Service worker (offline support)
├── css/
│   └── style.css           Full design system + component styles
├── js/
│   ├── app.js              App orchestrator, routing, all page logic
│   ├── state.js            Centralised state + event emitter
│   ├── swipe.js            Touch/mouse drag engine
│   └── supabase.js         Supabase client + all DB queries
└── supabase/
    ├── schema.sql           Full Postgres schema (run first)
    └── seed.sql             Initial vendor data (run second)
```

---

## Setup

### 1. Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Open the SQL editor
3. Run `supabase/schema.sql`
4. Run `supabase/seed.sql`
5. Copy your **Project URL** and **anon public key** from Project Settings → API

### 2. Configure the client

Open `js/supabase.js` and replace the two placeholders:

```js
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
```

### 3. Deploy

Push to GitHub, then deploy via:

- **Netlify**: connect repo, build command = none, publish directory = `/`
- **Vercel**: connect repo, framework = Other, root = `/`
- **Cloudflare Pages**: connect repo, build = none, output = `/`

No build step needed. It's all static files.

---

## Auth Flow

StackMatch uses Supabase Magic Link (passwordless email). Users click a link in their inbox and are signed in. Sessions persist in localStorage via Supabase's built-in session management.

To allow magic link redirects back to your domain, add your URL to:
`Supabase Dashboard → Authentication → URL Configuration → Redirect URLs`

---

## Vendor Portal

Vendors sign in with the same magic link flow. Their account is linked to a vendor listing via the `vendor_users` table.

To onboard a vendor:
1. They sign up at your domain
2. You run this in the Supabase SQL editor:

```sql
insert into vendor_users (vendor_id, user_id, role)
values ('<vendor-uuid>', '<user-uuid>', 'owner');
```

Once linked, they can edit their tagline, hook, stats, POS integrations, and see incoming intro requests.

---

## Adding Vendors

Either via Supabase Table Editor (GUI) or SQL. Key fields:

| Field              | Description                                         |
|--------------------|-----------------------------------------------------|
| `name`             | Display name                                        |
| `slug`             | URL-safe unique ID                                  |
| `category`         | e.g. "Workforce Management"                         |
| `tagline`          | 1–2 sentence description                            |
| `hook`             | Punchy operator-facing line                         |
| `pos_integrations` | Array: `['lightspeed','square','zonal','oracle','vita','other']` |
| `problem_tags`     | Array: `['labour','waste','bookings','loyalty','ops','data']` |
| `venue_types`      | Array: `['pub','restaurant','hotel','cafe','qsr','enterprise']` |
| `stat_1/2/3_val`   | Short value shown on swipe card                     |
| `stat_1/2/3_lbl`   | Label for stat                                      |
| `color`            | Hex colour for card accent                          |
| `is_active`        | `true` to show in results                           |

---

## Shared Stack Links

Each swipe session gets a `share_token` (6-char hex). Shared URLs look like:

```
https://stackmatch.io/?share=a3f9c1
```

Anyone with the link can view the shortlist without signing in.

---

## Environment

No `.env` file needed for static deployment — just update `js/supabase.js` directly. The anon key is safe to expose (it's protected by Supabase Row Level Security).

If you want to use environment variables for CI/CD, use your host's build environment and a simple sed/replace step at deploy time.

---

## Roadmap

- [ ] Vendor profile pages (`/vendor/[slug]`)
- [ ] AI-powered stack recommendations (Claude API)
- [ ] Admin dashboard for listing moderation
- [ ] Email notifications for intro requests (Resend)
- [ ] Operator venue profile (multi-site, group size)
- [ ] Analytics: most-matched vendors, popular combos
