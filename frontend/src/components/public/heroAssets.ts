/**
 * Approved public photography contract.
 *
 * All public hero/module photography is repo-owned under /public/images/sample.
 * The files are intentionally separate so no image is repeated or sprite-cropped.
 * Source files are PNG; Next/Image handles optimized delivery in the browser.
 */
export const HERO_IMAGES = {
  home: '/images/sample/home-hero.png',
  student: '/images/sample/students-hero.png',
  school: '/images/sample/schools-hero.png',
  parent: '/images/sample/parents-hero.png',
  learn: '/images/sample/learn-hero.png',
  competition: '/images/sample/competition-hero.png',
  communities: '/images/sample/communities-hero.png',
  admin: '/images/sample/platform-admin-hero.png',
} as const;

/**
 * Approved sample images are composed with subjects away from the copy area.
 * Keep neutral positioning by default; tune a page only after screenshot review.
 */
export const HERO_POSITIONS = {
  home: 'center center',
  student: 'center center',
  school: 'center center',
  parent: 'center center',
  learn: 'center center',
  competition: 'center center',
  communities: 'center center',
  admin: 'center center',
} as const;

export const MODULE_IMAGES = {
  student: '/images/sample/home-students.png',
  school: '/images/sample/home-schools.png',
  parent: '/images/sample/home-parents.png',
  learn: '/images/sample/home-learning.png',
  competition: '/images/sample/home-competitions.png',
  communities: '/images/sample/home-communities.png',
} as const;
