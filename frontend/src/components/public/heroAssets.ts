const pexels = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=3840`;

/**
 * Public hero photography.
 *
 * Every source is a landscape, environment-led Pexels photograph requested at
 * UHD-class width. The shared hero keeps these images in a dedicated right-side
 * pane so they are never enlarged underneath the copy.
 */
export const HERO_IMAGES = {
  // Indian university students studying together outdoors — Kiran Pokuri Photography
  home: pexels(4622108),
  // Indian school boys studying in a classroom — Swastik Arora
  student: pexels(18012463),
  // Indian classroom with teacher and interactive learning — Gokuldham Nar
  school: pexels(35551059),
  // Family helping a child study at home — Annushka Ahuja
  parent: pexels(8054840),
  // Indian students collaborating on homework with a laptop — Ketut Subiyanto
  learn: pexels(4308097),
  // Students collaborating in a science laboratory — cottonbro studio
  competition: pexels(6208709),
  // Indian children learning and socialising together — Kunal Lakhotia
  communities: pexels(20556421),
  // Indian colleagues collaborating around a laptop — Ketut Subiyanto
  admin: pexels(4308104),
} as const;

export const MODULE_IMAGES = {
  student: HERO_IMAGES.student,
  school: HERO_IMAGES.school,
  parent: HERO_IMAGES.parent,
  learn: HERO_IMAGES.learn,
  competition: HERO_IMAGES.competition,
  communities: HERO_IMAGES.communities,
} as const;
