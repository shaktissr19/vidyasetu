import path = require('path');

export interface ContentPackConfig {
  key: string;
  folder: string;
  resourceSlug: string;
  resourceAssetId: string;
  assessmentSlugs: readonly [string, string];
  conceptCodes: readonly string[];
  questionConceptCodes?: Readonly<Record<string, readonly string[]>>;
}

export const FORCE_PRESSURE_PACK_ROOT = path.resolve(
  __dirname,
  '../../../content/class-8/science/force-and-pressure',
);

const CONTACT = 'C8-SCI-05-C03';
const NON_CONTACT = 'C8-SCI-05-C04';

export const FORCE_PRESSURE_PACKS: Readonly<Record<string, ContentPackConfig>> = Object.freeze({
  pressure: {
    key: 'pressure',
    folder: 'pressure',
    resourceSlug: 'class-8-science-pressure-v1',
    resourceAssetId: 'VS-PRESSURE-ARTICLE-01',
    assessmentSlugs: ['class-8-science-pressure-practice-v1', 'class-8-science-pressure-mastery-v1'],
    conceptCodes: ['C8-SCI-06-C01'],
  },
  force: {
    key: 'force',
    folder: 'force',
    resourceSlug: 'class-8-science-force-v1',
    resourceAssetId: 'VS-FORCE-ARTICLE-01',
    assessmentSlugs: ['class-8-science-force-practice-v1', 'class-8-science-force-mastery-v1'],
    conceptCodes: ['C8-SCI-05-C01'],
  },
  'effects-of-force': {
    key: 'effects-of-force',
    folder: 'effects-of-force',
    resourceSlug: 'class-8-science-effects-of-force-v1',
    resourceAssetId: 'VS-EFFECTS-ARTICLE-01',
    assessmentSlugs: ['class-8-science-effects-of-force-practice-v1', 'class-8-science-effects-of-force-mastery-v1'],
    conceptCodes: ['C8-SCI-05-C02'],
  },
  'contact-noncontact': {
    key: 'contact-noncontact',
    folder: 'contact-noncontact',
    resourceSlug: 'class-8-science-contact-noncontact-forces-v1',
    resourceAssetId: 'VS-CN-LESSON-01',
    assessmentSlugs: ['class-8-science-contact-noncontact-practice-v1', 'class-8-science-contact-noncontact-mastery-v1'],
    conceptCodes: [CONTACT, NON_CONTACT],
    questionConceptCodes: {
      'VS8S-CNF-001': [CONTACT],
      'VS8S-CNF-002': [CONTACT],
      'VS8S-CNF-003': [CONTACT, NON_CONTACT],
      'VS8S-CNF-004': [NON_CONTACT],
      'VS8S-CNF-005': [NON_CONTACT],
      'VS8S-CNF-006': [CONTACT, NON_CONTACT],
      'VS8S-CNF-007': [NON_CONTACT],
      'VS8S-CNF-008': [CONTACT],
      'VS8S-CNF-009': [NON_CONTACT],
      'VS8S-CNF-010': [NON_CONTACT],
      'VS8S-CNF-011': [CONTACT, NON_CONTACT],
      'VS8S-CNF-012': [CONTACT, NON_CONTACT],
    },
  },
  'pressure-in-liquids': {
    key: 'pressure-in-liquids',
    folder: 'pressure-in-liquids',
    resourceSlug: 'class-8-science-pressure-in-liquids-v1',
    resourceAssetId: 'VS-LP-LESSON-01',
    assessmentSlugs: ['class-8-science-pressure-in-liquids-practice-v1', 'class-8-science-pressure-in-liquids-mastery-v1'],
    conceptCodes: ['C8-SCI-06-C02'],
  },
  'atmospheric-pressure': {
    key: 'atmospheric-pressure',
    folder: 'atmospheric-pressure',
    resourceSlug: 'class-8-science-atmospheric-pressure-v1',
    resourceAssetId: 'VS-AP-LESSON-01',
    assessmentSlugs: ['class-8-science-atmospheric-pressure-practice-v1', 'class-8-science-atmospheric-pressure-mastery-v1'],
    conceptCodes: ['C8-SCI-06-C03'],
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
