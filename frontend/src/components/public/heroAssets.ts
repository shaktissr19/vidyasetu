const previewFallback = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1800`;

/**
 * Production public photography contract.
 *
 * The approved local PNG set is being introduced incrementally for visual
 * validation. READY images use repo-owned production assets. Surfaces whose
 * replacement PNG has not been supplied yet temporarily retain the previous
 * remote image so this preview release never renders a broken hero/card.
 *
 * Remove previewFallback once the complete production PNG set is present.
 */
export const HERO_IMAGES = {
  // READY local production PNGs
  home: '/images/heroes/home-hero.png',
  student: '/images/heroes/students-hero.png',
  school: '/images/heroes/schools-hero.png',
  parent: '/images/heroes/parents-hero.png',
  learn: '/images/heroes/learn-hero.png',
  competition: '/images/heroes/competition-hero.png',

  // TEMPORARY fallbacks until their production PNGs are supplied
  communities: previewFallback(18012458),
  admin: previewFallback(4308104),
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
  // Reuse the matching, repository-owned public hero photos for Home cards.
  student: HERO_IMAGES.student,
  school: HERO_IMAGES.school,
  parent: '/images/home-cards/home-parents.png',
  learn: HERO_IMAGES.learn,
  competition: HERO_IMAGES.competition,
} as const;
