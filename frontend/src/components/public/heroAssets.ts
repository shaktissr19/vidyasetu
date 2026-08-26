/**
 * Production public photography contract.
 *
 * Hero images live under /public/images/heroes and Home role-card images live
 * under /public/images/home-cards. Every public surface has its own PNG so
 * photography is never repeated or sprite-cropped.
 */
export const HERO_IMAGES = {
  home: '/images/heroes/home-hero.png',
  student: '/images/heroes/students-hero.png',
  school: '/images/heroes/schools-hero.png',
  parent: '/images/heroes/parents-hero.png',
  learn: '/images/heroes/learn-hero.png',
  competition: '/images/heroes/competition-hero.png',
  communities: '/images/heroes/communities-hero.png',
  admin: '/images/heroes/platform-admin-hero.png',
} as const;

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
  student: '/images/home-cards/home-students.png',
  school: '/images/home-cards/home-schools.png',
  parent: '/images/home-cards/home-parents.png',
  learn: '/images/home-cards/home-learning.png',
  competition: '/images/home-cards/home-competitions.png',
  communities: '/images/home-cards/home-communities.png',
} as const;
