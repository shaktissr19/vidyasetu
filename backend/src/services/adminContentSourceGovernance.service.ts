import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

export interface UpdateIntakeEvidenceInput {
  licenceCandidate: string;
  attributionText: string;
  reviewerNote?: string | null;
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

const ALLOWED_LICENCES = new Set([
  'CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER',
]);

async function hasExplicitVerificationColumns(): Promise<boolean> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name='licence_verified_at'
     ) AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name='licence_verified_by'
     ) AS ready`,
  );
  return Boolean(row?.ready);
}

export async function updateIntakeEvidence(intakeId: UUID, input: UpdateIntakeEvidenceInput, adminId: UUID) {
  const licence = String(input.licenceCandidate || '').trim().toUpperCase();
  if (!ALLOWED_LICENCES.has(licence)) throw appError('Unsupported OER licence candidate');
  const attribution = String(input.attributionText || '').trim();

  const { rows: [item] } = await query<{
    id: UUID;
    status: string;
    source_code: string;
    attribution_required: boolean;
    requires_item_license_check: boolean;
  } & QueryResultRow>(
    `SELECT lsi.id,lsi.status,lcs.code AS source_code,lcs.attribution_required,lcs.requires_item_license_check
     FROM learning_source_intake lsi
     JOIN learning_content_sources lcs ON lcs.id=lsi.source_id
     WHERE lsi.id=$1::uuid`,
    [intakeId],
  );
  if (!item) throw appError('OER intake item not found', 404);
  if (item.status === 'IMPORTED') throw appError('Imported OER evidence is immutable; create a new intake revision instead');
  if (item.attribution_required && !attribution) throw appError(`${item.source_code} requires attribution evidence`);

  const verified = licence !== 'OTHER';
  const nextStatus = ['APPROVED','REJECTED'].includes(item.status) ? 'LICENCE_REVIEW' : item.status;

  // Migration 049 adds an explicit human-verification timestamp. The fallback
  // keeps this endpoint deploy-safe during rolling upgrades and disposable CI
  // databases that intentionally stop at the older source-discovery schema.
  if (await hasExplicitVerificationColumns()) {
    const { rows: [updated] } = await query(
      `UPDATE learning_source_intake
       SET licence_candidate=$2::learning_license_code,
           attribution_text=$3,
           reviewer_note=COALESCE($4,reviewer_note),
           status=$5::learning_intake_status,
           reviewed_by=$6::uuid,
           reviewed_at=NOW(),
           licence_verified_at=CASE WHEN $7::boolean THEN NOW() ELSE NULL END,
           licence_verified_by=CASE WHEN $7::boolean THEN $6::uuid ELSE NULL END,
           updated_at=NOW()
       WHERE id=$1::uuid
       RETURNING id,title,source_url,licence_candidate,attribution_text,status,reviewer_note,reviewed_at,
                 licence_verified_at,licence_verified_by`,
      [intakeId, licence, attribution || null, input.reviewerNote?.trim() || null, nextStatus, adminId, verified],
    );
    return updated;
  }

  const { rows: [updated] } = await query(
    `UPDATE learning_source_intake
     SET licence_candidate=$2::learning_license_code,
         attribution_text=$3,
         reviewer_note=COALESCE($4,reviewer_note),
         status=$5::learning_intake_status,
         reviewed_by=$6::uuid,
         reviewed_at=NOW(),
         updated_at=NOW()
     WHERE id=$1::uuid
     RETURNING id,title,source_url,licence_candidate,attribution_text,status,reviewer_note,reviewed_at`,
    [intakeId, licence, attribution || null, input.reviewerNote?.trim() || null, nextStatus, adminId],
  );
  return updated;
}
