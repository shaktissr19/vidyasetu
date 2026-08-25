import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  CloudSun,
  Compass,
  FlaskConical,
  Languages,
  Laptop2,
} from 'lucide-react';
import styles from './subjectVisual.module.css';

export type LearningGradeBand = 'primary' | 'middle' | 'secondary';
export type LearningSubjectKey = 'math' | 'science' | 'english' | 'hindi' | 'social' | 'computer' | 'evs' | 'commerce' | 'general';

export interface LearningVisualInput {
  subject_name?: string | null;
  subject_label?: string | null;
  category?: string | null;
  class_min?: number | null;
  class_max?: number | null;
  grade_codes?: string[] | null;
}

export interface LearningVisual {
  subject: LearningSubjectKey;
  label: string;
  mark: string;
  band: LearningGradeBand;
  bandLabel: string;
  icon: LucideIcon;
}

const SUBJECT_META: Record<LearningSubjectKey, { label: string; icon: LucideIcon; marks: Record<LearningGradeBand, string> }> = {
  math: { label: 'Mathematics', icon: Calculator, marks: { primary: '123', middle: '× ÷', secondary: '∑' } },
  science: { label: 'Science', icon: FlaskConical, marks: { primary: 'OBS', middle: 'LAB', secondary: 'SCI' } },
  english: { label: 'English', icon: Languages, marks: { primary: 'ABC', middle: 'Aa', secondary: 'LIT' } },
  hindi: { label: 'Hindi', icon: Languages, marks: { primary: 'अ', middle: 'शब्द', secondary: 'साहित्य' } },
  social: { label: 'Social Science', icon: Compass, marks: { primary: 'MAP', middle: 'CIV', secondary: 'POL' } },
  computer: { label: 'Computer', icon: Laptop2, marks: { primary: 'LOG', middle: '</>', secondary: 'CODE' } },
  evs: { label: 'EVS', icon: CloudSun, marks: { primary: 'LIFE', middle: 'ECO', secondary: 'ENV' } },
  commerce: { label: 'Commerce', icon: BriefcaseBusiness, marks: { primary: '₹', middle: 'BIZ', secondary: 'ACC' } },
  general: { label: 'Learning', icon: BookOpen, marks: { primary: 'READ', middle: 'LEARN', secondary: 'STUDY' } },
};

function classFromGradeCode(code?: string | null): number | null {
  if (!code) return null;
  const match = code.match(/^CLASS_(\d{1,2})$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

function bandForClass(value: number | null): LearningGradeBand {
  if (value !== null && value >= 9) return 'secondary';
  if (value !== null && value >= 5) return 'middle';
  return 'primary';
}

function resolveBand(input: LearningVisualInput, selectedGrade?: string | null): LearningGradeBand {
  const selectedClass = classFromGradeCode(selectedGrade);
  if (selectedClass) return bandForClass(selectedClass);

  const codedClasses = (input.grade_codes || []).map(classFromGradeCode).filter((value): value is number => value !== null);
  if (codedClasses.length > 0) return bandForClass(Math.max(...codedClasses));

  if (input.class_min || input.class_max) {
    const representative = input.class_max || input.class_min || 1;
    return bandForClass(representative);
  }

  return 'middle';
}

function resolveSubject(input: LearningVisualInput): LearningSubjectKey {
  const raw = `${input.subject_name || ''} ${input.subject_label || ''} ${input.category || ''}`.toLowerCase();
  if (raw.includes('math')) return 'math';
  if (raw.includes('science') || raw.includes('physics') || raw.includes('chemistry') || raw.includes('biology')) return 'science';
  if (raw.includes('hindi') || raw.includes('हिंदी')) return 'hindi';
  if (raw.includes('english') || raw.includes('language')) return 'english';
  if (raw.includes('social') || raw.includes('history') || raw.includes('geography') || raw.includes('civics') || raw.includes('political')) return 'social';
  if (raw.includes('computer') || raw.includes('digital') || raw.includes('coding') || raw.includes('technology')) return 'computer';
  if (raw.includes('evs') || raw.includes('environment')) return 'evs';
  if (raw.includes('commerce') || raw.includes('account') || raw.includes('economics') || raw.includes('business')) return 'commerce';
  return 'general';
}

export function learningVisualFor(input: LearningVisualInput, selectedGrade?: string | null): LearningVisual {
  const subject = resolveSubject(input);
  const band = resolveBand(input, selectedGrade);
  const meta = SUBJECT_META[subject];
  const explicitLabel = input.subject_name || input.subject_label;
  return {
    subject,
    band,
    bandLabel: band === 'primary' ? 'Classes 1–4' : band === 'middle' ? 'Classes 5–8' : 'Classes 9–12',
    label: explicitLabel || meta.label,
    mark: meta.marks[band],
    icon: meta.icon,
  };
}

export default function SubjectVisual({ input, selectedGrade, compact = false }: { input: LearningVisualInput; selectedGrade?: string | null; compact?: boolean }) {
  const visual = learningVisualFor(input, selectedGrade);
  const Icon = visual.icon;
  return (
    <div className={`${styles.visual} ${compact ? styles.compact : ''}`} data-subject={visual.subject} data-band={visual.band} aria-hidden="true">
      <div className={styles.orbit} />
      <div className={styles.icon}><Icon size={compact ? 22 : 28} strokeWidth={1.8} /></div>
      <div className={styles.mark}>{visual.mark}</div>
      <div className={styles.caption}><strong>{visual.label}</strong><span>{visual.bandLabel}</span></div>
    </div>
  );
}
