import path = require('path');

export interface ContentPackConfig {
  key: string;
  folder: string;
  resourceSlug: string;
  assessmentSlugs: readonly [string, string];
}

export const FORCE_PRESSURE_PACK_ROOT = path.resolve(
  __dirname,
  '../../../content/class-8/science/force-and-pressure',
);

export const FORCE_PRESSURE_PACKS: Readonly<Record<string, ContentPackConfig>> = Object.freeze({
  pressure: {
    key: 'pressure',
    folder: 'pressure',
    resourceSlug: 'class-8-science-pressure-v1',
    assessmentSlugs: ['class-8-science-pressure-practice-v1', 'class-8-science-pressure-mastery-v1'],
  },
  force: {
    key: 'force',
    folder: 'force',
    resourceSlug: 'class-8-science-force-v1',
    assessmentSlugs: ['class-8-science-force-practice-v1', 'class-8-science-force-mastery-v1'],
  },
  'effects-of-force': {
    key: 'effects-of-force',
    folder: 'effects-of-force',
    resourceSlug: 'class-8-science-effects-of-force-v1',
    assessmentSlugs: ['class-8-science-effects-of-force-practice-v1', 'class-8-science-effects-of-force-mastery-v1'],
  },
  'contact-noncontact': {
    key: 'contact-noncontact',
    folder: 'contact-noncontact',
    resourceSlug: 'class-8-science-contact-noncontact-forces-v1',
    assessmentSlugs: ['class-8-science-contact-noncontact-practice-v1', 'class-8-science-contact-noncontact-mastery-v1'],
  },
  'pressure-in-liquids': {
    key: 'pressure-in-liquids',
    folder: 'pressure-in-liquids',
    resourceSlug: 'class-8-science-pressure-in-liquids-v1',
    assessmentSlugs: ['class-8-science-pressure-in-liquids-practice-v1', 'class-8-science-pressure-in-liquids-mastery-v1'],
  },
  'atmospheric-pressure': {
    key: 'atmospheric-pressure',
    folder: 'atmospheric-pressure',
    resourceSlug: 'class-8-science-atmospheric-pressure-v1',
    assessmentSlugs: ['class-8-science-atmospheric-pressure-practice-v1', 'class-8-science-atmospheric-pressure-mastery-v1'],
  },
});

export function listForcePressurePackConfigs(): ContentPackConfig[] {
  return Object.values(FORCE_PRESSURE_PACKS);
}

export function getForcePressurePackConfig(packKey: string): ContentPackConfig {
  const normalized = packKey.trim().toLowerCase();
  const config = FORCE_PRESSURE_PACKS[normalized];
  if (!config) {
    throw new Error(`Unsupported Force and Pressure content pack: ${packKey}`);
  }
  return config;
}
