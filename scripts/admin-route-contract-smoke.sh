#!/usr/bin/env bash
set -Eeuo pipefail

LAYOUT="frontend/src/app/(admin)/layout.tsx"
APP_ROOT="frontend/src/app/(admin)"

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

[[ -f "$LAYOUT" ]] || fail "Admin layout not found: $LAYOUT"

mapfile -t admin_hrefs < <(sed -n "s/.*href: '\(\/admin\/[^']*\)'.*/\1/p" "$LAYOUT")
[[ "${#admin_hrefs[@]}" -gt 0 ]] || fail "No /admin/* sidebar hrefs found in $LAYOUT"

found_groups=0
for href in "${admin_hrefs[@]}"; do
  route_file="${APP_ROOT}${href}/page.tsx"
  printf '%-34s %s\n' "$href" "$route_file"
  [[ -f "$route_file" ]] || fail "Sidebar route $href has no canonical Next.js page at $route_file"
  [[ "$href" == "/admin/groups" ]] && found_groups=1
done

[[ "$found_groups" -eq 1 ]] || fail "Admin sidebar must include /admin/groups"

printf '\nAdmin sidebar route contract passed: %s canonical routes verified.\n' "${#admin_hrefs[@]}"
