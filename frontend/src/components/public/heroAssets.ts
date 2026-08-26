const pexels = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2560`;

/**
 * Public hero photography — Indian education context first.
 *
 * These sources are intentionally environment-led rather than portrait-led so
 * the hero reads as one coherent photograph. Hero delivery is direct from the
 * image CDN (see ImageHero) to avoid the first-navigation delay caused by
 * server-side remote optimisation.
 */
export const HERO_IMAGES = {
  // Interactive Indian classroom — Petlad, Gujarat, India.
  home: pexels(35551059),
  // Indian school boys studying in a classroom — India.
  student: pexels(18012463),
  // Indian teacher and students in a hands-on science class — Petlad, Gujarat.
  school: pexels(35551044),
  // Indian family learning together at home.
  parent: pexels(9345612),
  // Indian students studying together in a modern library — Petlad, Gujarat.
  learn: pexels(33745700),
  // Indian school academic/event gathering — competition and opportunity context.
  competition: pexels(28389291),
  // Indian children learning and interacting together in a classroom.
  communities: pexels(18012458),
  // Indian colleagues collaborating around a laptop.
  admin: pexels(4308104),
} as const;

export const HERO_POSITIONS = {
  home: '60% center',
  student: '64% center',
  school: '62% center',
  parent: '64% center',
  learn: '62% center',
  competition: '62% center',
  communities: '63% center',
  admin: '64% center',
} as const;

export const MODULE_IMAGES = {
  student: HERO_IMAGES.student,
  school: HERO_IMAGES.school,
  parent: HERO_IMAGES.parent,
  learn: HERO_IMAGES.learn,
  competition: HERO_IMAGES.competition,
  communities: HERO_IMAGES.communities,
} as const;
