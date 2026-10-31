# VidyaSetu platform administrator boundary

## Roles

| Role | Purpose | Owner controlled |
| --- | --- | --- |
| `SUPER_ADMIN` | The single platform owner account. Sees platform-wide analytics and revenue, manages platform administrators and settings, and edits/publishes Home page content. | Only one account is allowed by a database unique index. It cannot be suspended through the admin UI. |
| `PLATFORM_ADMIN` | An operator account created by the Super Admin. Handles school and ordinary-user operations, competition operations, support, and non-financial operational analytics. | Cannot create or suspend administrator accounts, publish Home page content, view revenue, change platform settings, or read the audit trail. |
| `SCHOOL_ADMIN` | Manages its own school's people and workflows. | No platform-wide permissions. |

The distinction is enforced in API middleware and services. The frontend only hides unavailable controls; it is not the security boundary. Platform operators also cannot access the existing owner-only learning governance, syllabus, moderation, and grievance routes until those areas receive an explicit permission review.

## Super Admin controls

- Bootstrap the first `SUPER_ADMIN` only through the existing operator-run bootstrap script.
- Create additional `PLATFORM_ADMIN` users from Admin → Users.
- Suspend or reactivate a `PLATFORM_ADMIN` from that same user list. A suspended account is blocked by authentication and its tokens fail the account-status check.
- The database enforces a maximum of one `SUPER_ADMIN`; the bootstrap API also serializes account creation.
- Public registration never accepts either platform-admin role.

## Home page content

Home editorial content is stored separately from the Content Factory and Learning Library. The owner editor manages the hero copy, benefit cards, audience cards, journey and trust cards, closing CTA, and video metadata. Saving creates a draft; publishing copies that draft atomically to the public version and records an audit entry. Public visitors only receive the published version. Learning resources, connected schools, competitions, and live metrics remain API-backed.

Video files are not stored in PostgreSQL. Upload an MP4/WebM/Ogg to the approved media host or project asset storage, then enter its direct HTTPS URL, poster, WebVTT caption file, and transcript in the Home editor. The player does not autoplay and defers loading until the visitor plays it.

## Database release

Migration `062_homepage_content_and_platform_admins.sql` adds the operator role, owner uniqueness constraint, and singleton Home content record. Run the reviewed database preparation script (which takes a backup and applies the pending reviewed migrations) before deploying code. The native application deployment now fails preflight if migration 062 is missing; it does not run migrations itself.
