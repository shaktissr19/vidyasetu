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
  detail: string;
  cue: string;
  band: LearningGradeBand;
  bandLabel: string;
  icon: LucideIcon;
  image: string;
}

type BandArtwork = Record<LearningGradeBand, { mark: string; detail: string; cue: string }>;

const SUBJECT_IMAGES: Record<LearningSubjectKey, string> = {
  math: '/images/subjects/mathematics.png',
  science: '/images/subjects/science.png',
  english: '/images/subjects/english.png',
  hindi: '/images/subjects/hindi.png',
  social: '/images/subjects/social-science.png',
  computer: '/images/subjects/computer.png',
  evs: '/images/subjects/evs.png',
  commerce: '/images/subjects/commerce.png',
  general: '/images/subjects/general-learning.png',
};

const SUBJECT_META: Record<LearningSubjectKey, { label: string; icon: LucideIcon; artwork: BandArtwork }> = {
  math: {
    label: 'Mathematics',
    icon: Calculator,
    artwork: {
      primary: { mark: '1 2 3', detail: '+  −  =', cue: '○  △  □' },
      middle: { mark: '×  ÷', detail: '½   x²', cue: '△  π  %' },
      secondary: { mark: '∑', detail: 'f(x)   √x', cue: 'π  θ  ∞' },
    },
  },
  science: {
    label: 'Science',
    icon: FlaskConical,
    artwork: {
      primary: { mark: 'OBSERVE', detail: 'plant • water', cue: 'life • earth' },
      middle: { mark: 'LAB', detail: 'H₂O   O₂', cue: 'matter • cells' },
      secondary: { mark: 'SCI', detail: 'CO₂   E=mc²', cue: 'bio • chem • physics' },
    },
  },
  english: {
    label: 'English',
    icon: Languages,
    artwork: {
      primary: { mark: 'ABC', detail: 'read • write', cue: 'words • story' },
      middle: { mark: 'Aa', detail: 'noun • verb', cue: 'read • express' },
      secondary: { mark: 'LIT', detail: 'prose • poetry', cue: 'analyse • write' },
    },
  },
  hindi: {
    label: 'Hindi',
    icon: Languages,
    artwork: {
      primary: { mark: 'अ', detail: 'क  ख  ग', cue: 'पढ़ें • लिखें' },
      middle: { mark: 'शब्द', detail: 'भाषा • व्याकरण', cue: 'पाठ • लेखन' },
      secondary: { mark: 'साहित्य', detail: 'गद्य • पद्य', cue: 'विश्लेषण • लेखन' },
    },
  },
  social: {
    label: 'Social Science',
    icon: Compass,
    artwork: {
      primary: { mark: 'WORLD', detail: 'people • places', cue: 'home • community' },
      middle: { mark: 'MAP', detail: 'history • civics', cue: 'India • geography' },
      secondary: { mark: 'CIVICS', detail: 'history • polity', cue: 'economy • society' },
    },
  },
  computer: {
    label: 'Computer',
    icon: Laptop2,
    artwork: {
      primary: { mark: 'LOGIC', detail: 'click • type', cue: 'safe • create' },
      middle: { mark: '</>', detail: '0101   HTML', cue: 'logic • web' },
      secondary: { mark: 'CODE', detail: 'if()   data', cue: 'build • debug' },
    },
  },
  evs: {
    label: 'EVS',
    icon: CloudSun,
    artwork: {
      primary: { mark: 'LIFE', detail: 'air • water', cue: 'plants • animals' },
      middle: { mark: 'ECO', detail: 'soil • climate', cue: 'habitat • balance' },
      secondary: { mark: 'ENV', detail: 'carbon • climate', cue: 'systems • action' },
    },
  },
  commerce: {
    label: 'Commerce',
    icon: BriefcaseBusiness,
    artwork: {
      primary: { mark: '₹', detail: 'save • spend', cue: 'needs • choices' },
      middle: { mark: 'BIZ', detail: 'cost • value', cue: 'trade • money' },
      secondary: { mark: 'ACC', detail: 'P&L   ₹', cue: 'accounts • economics' },
    },
  },
  general: {
    label: 'Learning',
    icon: BookOpen,
    artwork: {
      primary: { mark: 'READ', detail: 'learn • try', cue: 'curious • kind' },
      middle: { mark: 'LEARN', detail: 'focus • practise', cue: 'think • improve' },
      secondary: { mark: 'STUDY', detail: 'learn • apply', cue: 'reflect • grow' },
    },
  },
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
  const art = meta.artwork[band];
  const explicitLabel = input.subject_name || input.subject_label;
  return {
    subject,
    band,
    bandLabel: band === 'primary' ? 'Classes 1–4' : band === 'middle' ? 'Classes 5–8' : 'Classes 9–12',
    label: explicitLabel || meta.label,
    mark: art.mark,
    detail: art.detail,
    cue: art.cue,
    icon: meta.icon,
    image: SUBJECT_IMAGES[subject],
  };
}

export default function SubjectVisual({ input, selectedGrade, compact = false }: { input: LearningVisualInput; selectedGrade?: string | null; compact?: boolean }) {
  const visual = learningVisualFor(input, selectedGrade);
  const Icon = visual.icon;
  return (
    <div className={`${styles.visual} ${compact ? styles.compact : ''}`} data-subject={visual.subject} data-band={visual.band} aria-hidden="true">
      <div className={styles.subjectPhoto} style={{ backgroundImage: `url('${visual.image}')` }} />
      <div className={styles.artGrid} />
      <div className={styles.mainIcon}><Icon size={compact ? 28 : 34} strokeWidth={1.7} /></div>
      <div className={styles.formulaPanel}>
        <strong>{visual.mark}</strong>
        <span>{visual.detail}</span>
        <em>{visual.cue}</em>
      </div>
      <div className={styles.caption}><strong>{visual.label}</strong><span>{visual.bandLabel}</span></div>
    </div>
  );
}
