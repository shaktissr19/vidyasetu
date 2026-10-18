# Mobile role smoke test

`role-api-smoke.cjs` verifies that each role can authenticate and that the
first dashboard APIs return successful responses. It covers Student,
Parent (including the first linked child when present), School Admin,
Teacher, and Super Admin (analytics plus the admin navigation queue count).
It reports HTTP status and elapsed time without printing credentials or tokens.

Use dedicated, non-production test accounts. Keep credentials in the local
PowerShell session or CI secrets; do not commit them or paste them into source.

```powershell
$env:E2E_STUDENT_IDENTIFIER = "..."
$env:E2E_STUDENT_PASSWORD = "..."
$env:E2E_PARENT_IDENTIFIER = "..."
$env:E2E_PARENT_PASSWORD = "..."
$env:E2E_SCHOOL_ADMIN_IDENTIFIER = "..."
$env:E2E_SCHOOL_ADMIN_PASSWORD = "..."
$env:E2E_TEACHER_IDENTIFIER = "..."
$env:E2E_TEACHER_PASSWORD = "..."
$env:E2E_SUPER_ADMIN_IDENTIFIER = "..."
$env:E2E_SUPER_ADMIN_PASSWORD = "..."
$env:E2E_BASE_URL = "https://vidyasetu.sbs/api/v1"
node .\mobile\e2e\role-api-smoke.cjs
```

To exercise the native app as well, start the Expo development server from
`mobile` (`npx expo start --tunnel`), open the project in Expo Go, and repeat
the login for each role. Confirm that the correct role tabs appear, open every
tab and each item under **More**, and verify the page either renders data/its
empty state or shows an API error with a working Retry action. The API smoke
script covers initial dashboard calls; it does not replace those device
checks or test write actions such as approvals, attendance, and submissions.
