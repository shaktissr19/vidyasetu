# VidyaSetu Mobile Prototype

An Expo + React Native student app prototype. It lives separately from the Next.js website and uses the existing VidyaSetu API.

## Included in this prototype

- Student OTP sign-in against `/auth/send-otp` and `/auth/verify-otp`
- Access and refresh tokens stored in the device secure store
- Student home dashboard backed by `/student/dashboard`
- Subject/learning view backed by `/student/learning/home`
- Syllabus view backed by `/student/syllabus`
- Pull-to-refresh and sign-out

The prototype does not send OTPs until a user taps the sign-in button. It does not include mock credentials or embedded secrets.

## Run locally

1. Install Node.js 20+ and npm.
2. From this directory, run `npm install`.
3. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to an API address reachable from the test device.
4. Run `npm start` and scan the QR code with Expo Go for a quick UI check.
5. For native modules and a release-like test build, create an Expo development build; Expo Go is only the quick preview path.

For an Android emulator, `localhost` means the emulator itself. Use `10.0.2.2` to reach a backend running on the host computer. For a physical phone, use the computer's LAN address or the hosted API over HTTPS.

## API and auth notes

- The app expects the standard VidyaSetu JSON envelope: `{ success, data }`.
- Only `STUDENT` accounts can enter this prototype.
- The refresh token is stored securely, but automatic refresh is not yet implemented. Expired sessions must sign in again in this prototype.
- Do not use live student accounts for screenshots or demos without permission.

## Next prototype gates

1. Test sign-in and API reads with an approved test student account.
2. Add loading, empty, network-error, and session-expiry cases based on real API responses.
3. Verify the experience on a physical Android phone and iPhone simulator/device.
4. Add parent access, offline downloads, notifications, and store distribution only after the student flow is reviewed.
