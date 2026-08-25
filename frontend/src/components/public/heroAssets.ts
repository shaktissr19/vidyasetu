export const HERO_IMAGES = {
  home: '/images/heroes/home.avif',
  student: '/images/heroes/students.avif',
  school: '/images/heroes/schools.avif',
  parent: '/images/heroes/parents.avif',
  learn: '/images/heroes/learning.avif',
  competition: '/images/heroes/competitions.avif',
  communities: '/images/heroes/communities.avif',
  admin: '/images/heroes/platform-admin.avif',
} as const;

export const MODULE_IMAGES = {
  student: HERO_IMAGES.student,
  school: HERO_IMAGES.school,
  parent: HERO_IMAGES.parent,
  learn: HERO_IMAGES.learn,
  competition: HERO_IMAGES.competition,
  communities: HERO_IMAGES.communities,
} as const;
