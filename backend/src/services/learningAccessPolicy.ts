export type LearningVisibility = 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
export type LearningAccessRequirement = 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';

const VISIBILITIES = new Set<LearningVisibility>(['PUBLIC', 'REGISTERED', 'CLASS_ONLY', 'SCHOOL_ONLY']);
const ACCESS_REQUIREMENTS = new Set<LearningAccessRequirement>(['PUBLIC', 'REGISTERED', 'SUBSCRIBER']);

function badRequest(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function resolveLearningAccessPolicy(
  visibilityValue: string,
  accessRequirementValue?: string | null,
): { visibility: LearningVisibility; accessRequirement: LearningAccessRequirement } {
  const visibility = visibilityValue.trim().toUpperCase() as LearningVisibility;
  if (!VISIBILITIES.has(visibility)) throw badRequest('Invalid learning visibility.');

  const fallback: LearningAccessRequirement = visibility === 'PUBLIC' ? 'PUBLIC' : 'REGISTERED';
  const accessRequirement = (accessRequirementValue?.trim().toUpperCase() || fallback) as LearningAccessRequirement;
  if (!ACCESS_REQUIREMENTS.has(accessRequirement)) throw badRequest('Invalid learning access requirement.');

  if (visibility === 'PUBLIC' && accessRequirement !== 'PUBLIC') {
    throw badRequest('PUBLIC visibility must use PUBLIC access requirement.');
  }
  if (visibility !== 'PUBLIC' && accessRequirement === 'PUBLIC') {
    throw badRequest('PUBLIC access requirement is only valid with PUBLIC visibility.');
  }

  return { visibility, accessRequirement };
}

export function learningAccessLabel(requirement: LearningAccessRequirement): string {
  if (requirement === 'PUBLIC') return 'Public Free';
  if (requirement === 'REGISTERED') return 'Registered Free';
  return 'Subscriber';
}
