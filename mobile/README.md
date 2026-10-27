# VidyaSetu Mobile App

Expo + React Native shell for iOS and Android. The app uses the live VidyaSetu website inside a native WebView so its existing pages, account creation, username/password login, and role-specific web flows are available without duplicating the web implementation.

## App navigation

The app starts at the public VidyaSetu home page. Native navigation links provide:

- Home and Learn
- Learning Library
- For Students, For Schools, and For Parents
- Competitions and Communities
- Platform Administration
- Login and Create Account

The website continues to provide the content and behavior for each route. This is a web-backed app prototype, not a separate native rewrite of every screen. Native versions of high-use student workflows can be added progressively while reusing the existing backend.

The native header and bottom bar stay visible above the WebView on every page. The bottom bar uses the approved softer orange (`#FF8A3D`) with navy labels. Signed-out users get Home, Learn, Login, Create Account, and **Menu**; after login, primary destinations and **Menu** change to the user's role (Student, Parent, Teacher, School Admin, or Super Admin). The app reads only role/name from the website's persisted session for navigation; the website and backend continue to enforce access. On phones, hero photos appear before their copy and call-to-action buttons stack at a comfortable touch size. The website continues to provide screen content and functionality inside the WebView, so web changes appear in the app when the selected deployment is updated. These app-only layout rules do not change the public website or its APIs.

By default, the app opens `https://vidyasetu.sbs`. To validate a web change before production deployment, set `EXPO_PUBLIC_WEB_URL` in `mobile/.env` to the staging site URL, then restart Expo with a cleared cache. The mobile WebView does not make a separate native implementation of website APIs; login, content-library filtering, review, publish, and archive actions all use the website's existing UI and API session.

## Test with Expo Go

1. Install Node.js 22.13 or newer and npm.
2. From this `mobile` directory, run `npm install`.
3. Keep the laptop and iPad/phone on the same Wi-Fi, then run `npx expo start --lan --clear`.
4. Scan the new QR code with Expo Go on the iPad or phone.

No VPS deployment is needed for this app preview. It opens the already-hosted website at `https://vidyasetu.sbs`.

If the device cannot connect over the same Wi-Fi, use `npx expo start --tunnel --clear`. The project includes the tunnel dependency; install project dependencies with `npm install` first. Do not install `@expo/ngrok` globally.

For a quick check, open Home and Learn, verify Login and Create Account are visible in the bottom bar, then open Menu and visit each role's workspace destinations. Test login/logout, dashboard loading, a syllabus page, Content Factory, Content Library filters, publish/archive/restore actions, and retry/back navigation. Repeat on the iPad and a narrow phone. Authenticated APIs require test accounts and should be checked with each role using `e2e/role-api-smoke.cjs` plus device verification; the script checks initial login/dashboard APIs, not all write actions.

## Build profiles

The `eas.json` file defines internal preview and production build profiles. To use EAS Build, sign in to the Expo account, link the project with `npx eas-cli init`, then build with:

```sh
npx eas-cli build --platform ios --profile preview
npx eas-cli build --platform android --profile preview
```

A store release still needs platform developer accounts, store listing details, a verified privacy policy/data-safety disclosure, and device testing. Expo Go preview is not an app-store release.

## Current boundaries

- Website pages render inside the WebView; offline access and native push notifications are not included.
- Username/password authentication and role routing use the existing website.
- App store acceptance and physical-device behavior must be verified before release.
- The native navigation menu lists the public entry points; signed-in features remain available through the website's own role-aware navigation.
