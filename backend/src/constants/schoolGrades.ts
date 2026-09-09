export const SCHOOL_GRADE_VALUES = [
  'PN',
  'NURSERY',
  'LKG',
  'UKG',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
] as const;

export type SchoolGradeValue = (typeof SCHOOL_GRADE_VALUES)[number];

export function isSchoolGradeValue(value: string): value is SchoolGradeValue {
  return (SCHOOL_GRADE_VALUES as readonly string[]).includes(value);
}

export function schoolGradeSortOrder(value: string): number {
  const index = (SCHOOL_GRADE_VALUES as readonly string[]).indexOf(value);
  return index === -1 ? SCHOOL_GRADE_VALUES.length : index;
}
