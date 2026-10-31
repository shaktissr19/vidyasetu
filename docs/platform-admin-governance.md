# VidyaSetu platform administrator boundary

## Roles

| Role | Purpose | Owner controlled |
| --- | --- | --- |
| `SUPER_ADMIN` | The single platform owner account. Sees platform-wide analytics and revenue, manages platform administrators and settings, and edits/publishes Home page content. | Only one account is allowed by a database unique index. It cannot be suspended through the admin UI. |
| `PLATFORM_ADMIN` | An operator account created by the Super Admin. Handles school and ordinary-user operations, competition operations, support, and non-financial operational analytics. | Cannot create or suspend administrator accounts, publish Home page content, view revenue, change platform settings, or read the audit trail. |
| `SCHOOL_ADMIN` | Manages its own school's people and workflows. | No platform-wide permissions. |

The distinction is enforced in API middleware and services. The frontend only hides unavailable controls; it is not the security boundary. Platform Admin access follows least privilege and deny-by-default: analytics is the baseline, while school operations, user operations, content analytics, competitions, and support are separately granted. Platform operators also cannot access the existing owner-only learning governance, syllabus, moderation, and grievance routes until those areas receive an explicit permission review. Home and Learn show a direct edit shortcut to the signed-in Super Admin; the linked editor routes and APIs independently enforce the Super Admin role.

## Super Admin controls

- Bootstrap the first `SUPER_ADMIN` only through the existing operator-run bootstrap script.
- Create additional `PLATFORM_ADMIN` users from Admin → Users and select the operational areas they need.
- Change a Platform Admin's operational areas or suspend/reactivate the account from that same user list. Permission changes are checked on every API request; a suspended account is blocked by authentication.
- The database enforces a maximum of one `SUPER_ADMIN`; the bootstrap API also serializes account creation.
- Public registration never accepts either platform-admin role.

## Home page content

Home editorial content is stored separately from the Content Factory and Learning Library. The owner editor manages the hero copy, benefit cards, audience cards, journey and trust cards, closing CTA, and video metadata. Saving creates a draft; publishing copies that draft atomically to the public version and records an audit entry. Public visitors only receive the published version. Learning resources, connected schools, competitions, and live metrics remain API-backed.

The Learn editor manages editorial copy and learning-type labels only. Learn resources, grade and board choices, assessments, and private student records continue to use their existing APIs and authorization rules. Public Students, Schools, Parents, Competitions, and Communities pages do not yet have equivalent page editors; their content remains implemented in page components and data APIs.

Video files are not stored in PostgreSQL. The current Home editor accepts a direct HTTPS MP4/WebM/Ogg URL, poster, WebVTT caption file, and transcript. The player does not autoplay and defers loading until the visitor plays it. The video URL is currently empty by default and the editor has no upload/hosting flow; the Home video section stays hidden until a stable public video URL is saved and published. Therefore the player plumbing exists, but the end-to-end video feature and actual platform-introduction video are not complete.

## Security and compliance baseline

This permission design implements useful OWASP authorization and NIST least-privilege patterns, but this is not a certification or a full compliance review. The access dialog supports keyboard focus entry, Escape close, focus containment, and focus return. MFA, periodic access recertification and expiry, alerting on privileged changes, and a documented owner-account recovery procedure remain recommended controls. VidyaSetu handles children's education data; the India DPDP Act 2023 and DPDP Rules 2025 require a separate legal/privacy implementation assessment, including their phased commencement. Do not treat this feature as evidence of DPDP compliance.

## Database release

Migration `062_homepage_content_and_platform_admins.sql` adds the operator role, owner uniqueness constraint, and singleton Home content record. Migration `063_public_page_content.sql` adds the separate, versioned editorial store for the Learn page; it does not contain or duplicate Learning Library records. Migration `064_platform_admin_scoped_permissions.sql` adds explicit module permissions and preserves existing Platform Admin access during rollout so the Super Admin can review and narrow it. Run the reviewed database preparation script (which takes a backup and applies the pending reviewed migrations) before deploying code. The native application deployment fails preflight if a required migration is missing; it does not run migrations itself.
