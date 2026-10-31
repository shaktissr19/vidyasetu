import { isPublicAuthRequest } from './publicAuthRequest';

const publicRoutes = [
  '/api/v1/auth/login',
  'auth/platform-admin/login',
  'https://vidyasetu.sbs/api/v1/auth/forgot-password?source=login',
  '/api/v1/auth/register/student',
];

for (const route of publicRoutes) {
  if (!isPublicAuthRequest(route)) throw new Error(`Expected public auth route: ${route}`);
}

const protectedRoutes = ['/api/v1/auth/me', '/api/v1/auth/sessions', '/api/v1/students/profile'];
for (const route of protectedRoutes) {
  if (isPublicAuthRequest(route)) throw new Error(`Protected route was classified as public: ${route}`);
}

console.log(`Public auth request policy passed (${publicRoutes.length} public, ${protectedRoutes.length} protected routes).`);
