# OAuth Google — production setup

Client code is wired up — the "continue with Google" button on
`/login` calls `supabase.auth.signInWithOAuth({ provider: 'google' })`.
This doc covers the manual half: creating the OAuth credentials in
Google Cloud Console and pasting them into Supabase. ~20 minutes.

---

## 1. Google Cloud Console

1. Open https://console.cloud.google.com/ and sign in.
2. **Create a new project** (or pick an existing one). Name it `Rat List` —
   shows up in the user-facing consent screen, so keep it on-brand.

### OAuth consent screen

3. Sidebar → **APIs & Services → OAuth consent screen**.
4. User Type: **External** (we want anyone with a Google account, not just
   Workspace users).
5. **App information**:
   - App name: `Rat List`
   - User support email: `hello@ratlist.app`
   - App logo: upload `app/public/favicon-512x512.png` (Google requires
     PNG ≥ 120 px)
6. **App domain**:
   - Application home page: `https://ratlist.app`
   - Application privacy policy: `https://ratlist.app/legal/privacy`
   - Application terms of service: `https://ratlist.app/legal/terms`
7. **Authorized domains**: add `ratlist.app` and `supabase.co`.
8. Developer contact email: your gmail.
9. Save.
10. **Scopes**: leave at defaults (`openid`, `userinfo.email`,
    `userinfo.profile`). Don't add anything sensitive — Google reviews
    those.
11. **Test users**: skip (we'll publish straight to production at step 13).

### OAuth credentials

12. Sidebar → **APIs & Services → Credentials → Create Credentials →
    OAuth client ID**.
    - Application type: **Web application**
    - Name: `ratlist-prod`
    - **Authorized JavaScript origins** — add both, one per line:
      ```
      https://ratlist.app
      https://fiuheufmawxkgbqddwwu.supabase.co
      ```
    - **Authorized redirect URIs** — exactly this, no trailing slash:
      ```
      https://fiuheufmawxkgbqddwwu.supabase.co/auth/v1/callback
      ```
    - Create. Google shows the **Client ID** + **Client secret** —
      copy both, the secret is only shown once.

### Publish

13. Back to **OAuth consent screen** → **Publish app**.

    > ⚠️ **Branding validation gotcha (since 2023).** When you click
    > Publish, Google now checks that the homepage URL
    > (`https://ratlist.app`) is verified as yours in Google Search
    > Console. If it isn't, the validation panel will refuse with
    > "Le site Web ... n'est pas enregistré à votre nom" / "The
    > website ... is not registered to you" and the app stays in
    > Testing mode. This is independent from OAuth scopes — even our
    > basic `openid + email + profile` scope set triggers the check
    > on first publish.

    **Two paths from here:**

    - **(A) Soft launch — stay in Testing mode.** No verification
      needed; only up to 100 explicitly-listed test users can sign in
      via Google. Add them under **Audience → Test users**. Everyone
      else still has magic-link as a fallback. Use this if you only
      need OAuth for yourself + a handful of friends right now.

    - **(B) Production — verify the domain via Search Console
      (~10 min).** The proper path. Useful for SEO monitoring later
      anyway.

      1. Open https://search.google.com/search-console
      2. **Add property → Domain** (not "URL prefix" — Domain covers
         apex + subdomains in one record)
      3. Enter `ratlist.app`
      4. Google shows a TXT record like
         `google-site-verification=abc…`
      5. **Vercel → Project → Settings → Domains → ratlist.app →
         DNS Records → Add Record**: Type `TXT`, Name `@`, Value =
         the verification string (no quotes)
      6. Wait 30–60 s, click **Verify** in Search Console
      7. Back in Google Cloud Console → **OAuth consent screen →
         Branding** → side panel "I've fixed the issues" → submit
      8. A few minutes later the app moves to "In production" and
         Google sign-in works for any account.

## 2. Supabase

1. Supabase Dashboard → **Authentication → Providers → Google**.
2. Toggle **Enable Sign in with Google** on.
3. Paste the Client ID and Client Secret from step 12.
4. **Skip nonce check**: leave off (default, more secure).
5. Save.

## 3. Smoke-test

1. Open https://ratlist.app/login in an incognito window.
2. Click **continue with Google**.
3. Google's account chooser opens → pick / sign in.
4. Consent screen shows "Rat List wants to access your basic profile" —
   click Continue.
5. Browser redirects through `…supabase.co/auth/v1/callback` then to
   `https://ratlist.app/auth/callback` → `/`.
6. You're signed in. Check `/settings` — display name should be pulled
   from your Google profile (handled by the existing `handle_new_user`
   trigger on the first sign-in).
7. Sign out and try again to confirm it returns straight to `/`
   without re-asking consent.

## What happens under the hood

- Supabase Auth issues the OAuth flow; Google authenticates the user;
  Supabase creates an `auth.users` row keyed by Google's `sub` claim.
- Our `handle_new_user` trigger (see migration `20260516120000_init.sql`)
  fires once and inserts a `public.profiles` row, defaulting
  `display_name` to whatever Google returned for `name`, falling back
  to the email-local-part. The user can edit either in `/settings`.
- Subsequent sign-ins reuse the existing `auth.users` row — same
  user identity, no new profile.

## Troubleshooting

- **"Error 400: redirect_uri_mismatch"** in Google → the redirect URI
  in step 12 isn't an exact match for what Supabase sent. Common
  causes: trailing slash, `http://` instead of `https://`, wrong
  Supabase project ref. Copy verbatim:
  `https://fiuheufmawxkgbqddwwu.supabase.co/auth/v1/callback`.

- **"Unauthorized" after returning to /auth/callback** → the Supabase
  Auth → URL Configuration list doesn't include
  `https://ratlist.app/auth/callback`. Add it.

- **First sign-in works but display_name is empty** → check Google
  consent included the `profile` scope (default does). The
  `handle_new_user` trigger reads `raw_user_meta_data.name`.

## Future providers (not in scope for 1B)

Apple Sign-In requires a $99/yr developer account + Service ID +
Sign in with Apple JS — postpone unless we see real demand on iOS.

Яндекс ID is a candidate for the RU audience once we open that
channel; same Supabase OAuth pattern, different provider config.
