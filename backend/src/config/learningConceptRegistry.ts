import fs = require('fs');
import path = require('path');

export interface CanonicalLearningConcept {
  code: string;
  name: string;
  academicYear: string;
  gradeCode: string;
  subjectCode: string;
  chapterCode: string;
  chapterTitle: string;
  registryStatus: string;
  registrySource: string;
  sequence: number;
}

interface TopicIndexConcept {
  code?: string;
  title?: string;
}

interface TopicIndexChapter {
  code?: string;
  title?: string;
  concepts?: TopicIndexConcept[];
}

interface TopicIndexSubject {
  subjectCode?: string;
  chapters?: TopicIndexChapter[];
}

interface TopicIndex {
  schemaVersion?: string;
  indexId?: string;
  gradeCode?: string;
  academicSession?: string;
  status?: string;
  subjects?: TopicIndexSubject[];
}

export const CLASS_8_CONCEPT_REGISTRY_SOURCE = 'content/syllabus/class-8/2026-27/topic-index.json';
export const CLASS_8_CONCEPT_REGISTRY_PATH = path.resolve(
  __dirname,
  '../../../content/syllabus/class-8/2026-27/topic-index.json',
);

export function loadClass8LearningConceptRegistry(): CanonicalLearningConcept[] {
  if (!fs.existsSync(CLASS_8_CONCEPT_REGISTRY_PATH)) {
    throw new Error(`Canonical syllabus topic index not found: ${CLASS_8_CONCEPT_REGISTRY_SOURCE}`);
  }

  const parsed = JSON.parse(fs.readFileSync(CLASS_8_CONCEPT_REGISTRY_PATH, 'utf8')) as TopicIndex;
  if (parsed.gradeCode !== 'CLASS_8') {
    throw new Error(`Canonical syllabus topic index must declare gradeCode CLASS_8; received ${parsed.gradeCode || 'missing'}`);
  }
  if (!parsed.academicSession?.trim()) throw new Error('Canonical syllabus topic index requires academicSession');
  if (!parsed.status?.trim()) throw new Error('Canonical syllabus topic index requires status');
  if (!Array.isArray(parsed.subjects) || parsed.subjects.length === 0) {
    throw new Error('Canonical syllabus topic index requires at least one subject');
  }

  const result: CanonicalLearningConcept[] = [];
  const seen = new Set<string>();
  let sequence = 0;

  for (const subject of parsed.subjects) {
    const subjectCode = subject.subjectCode?.trim();
    if (!subjectCode) throw new Error('Every canonical syllabus subject requires subjectCode');
    if (!Array.isArray(subject.chapters) || subject.chapters.length === 0) {
      throw new Error(`${subjectCode}: at least one chapter is required`);
    }

    for (const chapter of subject.chapters) {
      const chapterCode = chapter.code?.trim();
      const chapterTitle = chapter.title?.trim();
      if (!chapterCode || !chapterTitle) throw new Error(`${subjectCode}: every chapter requires code and title`);
      if (!Array.isArray(chapter.concepts) || chapter.concepts.length === 0) {
        throw new Error(`${chapterCode}: at least one concept is required`);
      }

      for (const concept of chapter.concepts) {
        const code = concept.code?.trim();
        const name = concept.title?.trim();
        if (!code || !name) throw new Error(`${chapterCode}: every concept requires code and title`);
        if (seen.has(code)) throw new Error(`Duplicate canonical concept code: ${code}`);
        seen.add(code);
        sequence += 1;
        result.push({
          code,
          name,
          academicYear: parsed.academicSession,
          gradeCode: parsed.gradeCode,
          subjectCode,
          chapterCode,
          chapterTitle,
          registryStatus: parsed.status,
          registrySource: CLASS_8_CONCEPT_REGISTRY_SOURCE,
          sequence,
        });
      }
    }
  }

  return result;
}

export function class8LearningConceptCodeSet(): Set<string> {
  return new Set(loadClass8LearningConceptRegistry().map((concept) => concept.code));
}
