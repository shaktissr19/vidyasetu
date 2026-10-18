#!/usr/bin/env node
/*
 * Authenticated API smoke test for the first screen each app role opens.
 * Set E2E_BASE_URL and E2E_<ROLE>_IDENTIFIER / E2E_<ROLE>_PASSWORD in the
 * shell running this script. Never put credentials in source control.
 */

const baseUrl = (process.env.E2E_BASE_URL || 'https://vidyasetu.sbs/api/v1').replace(/\/$/, '');
const timeoutMs = Number(process.env.E2E_REQUEST_TIMEOUT_MS || 30000);
const roles = [
  { key: 'STUDENT', apiRole: 'STUDENT', landing: [['GET', '/student/dashboard']] },
  { key: 'PARENT', apiRole: 'PARENT', landing: [['GET', '/parent/children']] },
  { key: 'SCHOOL_ADMIN', apiRole: 'SCHOOL_ADMIN', landing: [['GET', '/school/overview']] },
  { key: 'TEACHER', apiRole: 'TEACHER', landing: [['GET', '/school/overview']] },
  { key: 'SUPER_ADMIN', apiRole: 'SUPER_ADMIN', landing: [
    ['GET', '/admin/analytics'],
    ['GET', '/admin/learning/factory/queue-counts'],
  ] },
];

async function request(method, path, { token, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await response.text();
    let json;
    try { json = raw ? JSON.parse(raw) : {}; } catch { json = { nonJsonResponse: raw.slice(0, 200) }; }
    return { response, json, elapsedMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

function dataOf(json) { return json?.data?.data ?? json?.data; }

async function main() {
  const missing = roles.flatMap(({ key }) => {
    const prefix = `E2E_${key}`;
    return [
      ...(!process.env[`${prefix}_IDENTIFIER`] ? [`${prefix}_IDENTIFIER`] : []),
      ...(!process.env[`${prefix}_PASSWORD`] ? [`${prefix}_PASSWORD`] : []),
    ];
  });
  if (missing.length) {
    console.error(`Missing test-account environment variables: ${missing.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  let failed = false;
  for (const role of roles) {
    const prefix = `E2E_${role.key}`;
    try {
      const login = await request('POST', '/auth/login', {
        body: {
          identifier: process.env[`${prefix}_IDENTIFIER`],
          password: process.env[`${prefix}_PASSWORD`],
          deviceInfo: 'VidyaSetu mobile E2E API smoke test',
        },
      });
      const session = dataOf(login.json);
      const token = session?.accessToken;
      const actualRole = session?.user?.role;
      console.log(`${role.key} login: HTTP ${login.response.status}, ${login.elapsedMs} ms${actualRole ? `, role=${actualRole}` : ''}`);
      if (!login.response.ok || !token || actualRole !== role.apiRole) {
        console.error(`  FAIL: expected a successful ${role.apiRole} login and access token; ${login.json?.error?.message || 'response shape/role mismatch'}`);
        failed = true;
        continue;
      }

      for (const [method, path] of role.landing) {
        const result = await request(method, path, { token });
        const successfulEnvelope = result.json?.success !== false;
        console.log(`  ${method} ${path}: HTTP ${result.response.status}, ${result.elapsedMs} ms`);
        if (!result.response.ok || !successfulEnvelope) {
          console.error(`  FAIL: ${result.json?.error?.message || 'dashboard API returned an unsuccessful response'}`);
          failed = true;
          continue;
        }

        if (role.key === 'PARENT' && path === '/parent/children') {
          const children = dataOf(result.json);
          if (Array.isArray(children) && children[0]?.id) {
            const dashboard = await request('GET', `/parent/children/${encodeURIComponent(children[0].id)}/dashboard`, { token });
            console.log(`  GET /parent/children/:id/dashboard: HTTP ${dashboard.response.status}, ${dashboard.elapsedMs} ms`);
            if (!dashboard.response.ok || dashboard.json?.success === false) {
              console.error(`  FAIL: ${dashboard.json?.error?.message || 'Parent dashboard API returned an unsuccessful response'}`);
              failed = true;
            }
          } else {
            console.log('  NOTE: no linked child in this test account; child dashboard could not be exercised');
          }
        }
      }
    } catch (error) {
      failed = true;
      console.error(`${role.key} FAIL: ${error.name === 'AbortError' ? `request exceeded ${timeoutMs} ms` : error.message}`);
    }
  }

  if (failed) process.exitCode = 1;
  else console.log('All configured role login and landing API checks passed.');
}

main();
