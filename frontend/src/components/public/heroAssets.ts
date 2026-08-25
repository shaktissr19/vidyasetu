export const HERO_IMAGES = {
  home: '/images/heroes/home.webp',
  student: '/images/heroes/students.webp',
  school: '/images/heroes/schools.webp',
  parent: '/images/heroes/parents.webp',
  learn: '/images/heroes/learning.webp',
  competition: '/images/heroes/competitions.webp',
  communities: '/images/heroes/communities.webp',
  admin: '/images/heroes/platform-admin.webp',
} as const;

export const MODULE_IMAGES = {
  student: HERO_IMAGES.student,
  school: HERO_IMAGES.school,
  parent: HERO_IMAGES.parent,
  learn: HERO_IMAGES.learn,
  competition: HERO_IMAGES.competition,
  communities: HERO_IMAGES.communities,
} as const;
