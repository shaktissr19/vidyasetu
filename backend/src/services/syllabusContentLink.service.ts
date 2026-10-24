import type { PoolClient } from 'pg';
import type { UUID } from '@vidyasetu/contracts';

export interface SyllabusContentScope {
  boardCodes: string[];
  gradeCodes: string[];
  subjectId?: string | null;
  academicYear?: string | null;
  medium?: 'en' | 'hi' | null;
  conceptId?: string | null;
}

export interface PublishedSyllabusTopic {
  id: UUID;
  title: string;
  title_hi: string | null;
  chapter_title: string;
  unit_title: string;
  board_code: string;
  academic_year: string;
  medium: 'en' | 'hi';
  class_name: string;
  subject_id: UUID;
  concept_id: UUID | null;
}

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

/** Resolves only a published, verified framework node that matches the whole requested scope. */
export async function requirePublishedSyllabusTopic(
  client: Pick<PoolClient, 'query'>,
  topicId: string,
  scope: SyllabusContentScope,
): Promise<PublishedSyllabusTopic> {
  const { rows: [topic] } = await client.query<PublishedSyllabusTopic>(`
    SELECT ct.id,ct.title,ct.title_hi,COALESCE(cc.title,cu.title) AS chapter_title,cu.title AS unit_title,
           eb.code AS board_code,cv.academic_year,cv.medium,cs.class_name,cs.subject_id,ctc.concept_id
    FROM curriculum_topics ct
    JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id
    LEFT JOIN curriculum_chapters cc ON cc.id=ct.chapter_id
    JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id
    JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id
    JOIN education_boards eb ON eb.id=cv.board_id
    LEFT JOIN curriculum_topic_concepts ctc ON ctc.topic_id=ct.id
    WHERE ct.id=$1::uuid AND ct.is_retired=FALSE
      AND cv.status='ACTIVE' AND cv.publication_status='PUBLISHED' AND cv.verified_at IS NOT NULL
    LIMIT 1`, [topicId]);
  if (!topic) throw fail('Choose a topic from a verified, published syllabus.');
  if (!scope.boardCodes.some((code) => code.toUpperCase() === topic.board_code.toUpperCase())) {
    throw fail('The selected syllabus topic does not match the content board.');
  }
  if (!scope.gradeCodes.some((code) => code.toUpperCase() === topic.class_name.toUpperCase())) {
    throw fail('The selected syllabus topic does not match the content class.');
  }
  if (scope.subjectId && scope.subjectId !== topic.subject_id) {
    throw fail('The selected syllabus topic does not match the content subject.');
  }
  if (scope.academicYear && scope.academicYear !== topic.academic_year) {
    throw fail('The selected syllabus topic does not match the selected academic year.');
  }
  if (scope.medium && scope.medium !== topic.medium) {
    throw fail('The selected syllabus topic does not match the selected syllabus medium.');
  }
  if (scope.conceptId && scope.conceptId !== topic.concept_id) {
    throw fail('The selected syllabus topic does not match the curriculum concept.');
  }
  return topic;
}
