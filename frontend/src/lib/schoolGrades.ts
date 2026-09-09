export const SCHOOL_GRADES = [
  { value: 'PN', label: 'Pre-Nursery', labelHi: 'प्री-नर्सरी' },
  { value: 'NURSERY', label: 'Nursery', labelHi: 'नर्सरी' },
  { value: 'LKG', label: 'LKG', labelHi: 'एलकेजी' },
  { value: 'UKG', label: 'UKG', labelHi: 'यूकेजी' },
  ...Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: `Class ${index + 1}`,
    labelHi: `कक्षा ${index + 1}`,
  })),
] as const;

export function schoolGradeLabel(value: string, language: 'en' | 'hi' = 'en'): string {
  const grade = SCHOOL_GRADES.find((item) => item.value === value);
  if (!grade) return value;
  return language === 'hi' ? grade.labelHi : grade.label;
}

export function schoolGradeSortOrder(value: string): number {
  const index = SCHOOL_GRADES.findIndex((item) => item.value === value);
  return index === -1 ? SCHOOL_GRADES.length : index;
}

export function sortSchoolGradeValues(values: string[]): string[] {
  return [...values].sort((a, b) => schoolGradeSortOrder(a) - schoolGradeSortOrder(b) || a.localeCompare(b));
}
