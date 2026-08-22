'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAdminGrievanceAttachmentUrl,
  getParentGrievanceAttachmentUrl,
  getSchoolGrievanceAttachmentUrl,
  listAdminGrievanceAttachments,
  listParentGrievanceAttachments,
  listSchoolGrievanceAttachments,
  uploadParentGrievanceEvidence,
  type GrievanceAttachment,
  type GrievanceStatus,
} from '@/services/grievanceService';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

type EvidenceRole = 'parent' | 'school' | 'admin';

interface Props {
  grievanceId: string;
  role: EvidenceRole;
  status: GrievanceStatus;
  dark?: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.txt';
const ALLOWED = new Set(['image/jpeg','image/png','image/webp','application/pdf','text/plain']);

function sizeLabel(value: number | string | null | undefined): string {
  const bytes = Number(value || 0);
  if (!bytes) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(contentType: string): string {
  if (contentType === 'application/pdf') return '📄';
  if (contentType.startsWith('image/')) return '🖼️';
  return '📝';
}

export default function GrievanceEvidence({ grievanceId, role, status, dark = false }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['grievance-evidence', role, grievanceId],
    queryFn: async (): Promise<GrievanceAttachment[]> => {
      if (role === 'parent') return listParentGrievanceAttachments(grievanceId).then((r) => r.data.data);
      if (role === 'school') return listSchoolGrievanceAttachments(grievanceId).then((r) => r.data.data);
      return listAdminGrievanceAttachments(grievanceId).then((r) => r.data.data);
    },
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose an evidence file first');
      if (!ALLOWED.has(file.type)) throw new Error('Use JPG, PNG, WebP, PDF or plain text evidence');
      if (file.size <= 0 || file.size > MAX_BYTES) throw new Error('Evidence must be no more than 10 MB');
      return uploadParentGrievanceEvidence(grievanceId, file);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grievance-evidence', role, grievanceId] });
      qc.invalidateQueries({ queryKey: ['parent-grievance', grievanceId] });
      setFile(null);
      toast.success('Evidence attached to the concern');
    },
    onError: (error) => toast.error(apiErrorText(error, 'Could not attach evidence')),
  });

  async function download(attachment: GrievanceAttachment): Promise<void> {
    try {
      const payload = role === 'parent'
        ? await getParentGrievanceAttachmentUrl(grievanceId, attachment.id).then((r) => r.data.data)
        : role === 'school'
          ? await getSchoolGrievanceAttachmentUrl(grievanceId, attachment.id).then((r) => r.data.data)
          : await getAdminGrievanceAttachmentUrl(grievanceId, attachment.id).then((r) => r.data.data);
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error: unknown) {
      toast.error(apiErrorText(error, 'Could not open evidence'));
    }
  }

  const border = dark ? '#2C3E5C' : 'var(--border)';
  const background = dark ? '#101B31' : '#F8FAFC';
  const text = dark ? '#EAF1FF' : 'var(--navy)';
  const muted = dark ? '#90A4C4' : 'var(--slate)';
  const parentCanUpload = role === 'parent' && status !== 'CLOSED';

  return (
    <section className="rounded-xl p-4 mt-4" style={{ background, border: `1px solid ${border}` }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-sm" style={{ color: text }}>📎 Evidence & supporting files</h3>
          <p className="text-xs mt-1" style={{ color: muted }}>
            Private files are opened through time-limited signed links. Accepted: JPG, PNG, WebP, PDF and text, up to 10 MB.
          </p>
        </div>
        <span className="text-xs font-bold" style={{ color: muted }}>{attachments.length} file{attachments.length === 1 ? '' : 's'}</span>
      </div>

      {parentCanUpload && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <label className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer" style={{ border: `1px solid ${border}`, color: text, background: dark ? '#15233D' : 'white' }}>
            Choose evidence
            <input
              className="hidden"
              type="file"
              accept={ACCEPT}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          {file && <span className="text-xs" style={{ color: muted }}>{file.name} · {sizeLabel(file.size)}</span>}
          <button
            className="px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'var(--forest)', color: 'white', opacity: !file || uploadMut.isPending ? 0.55 : 1 }}
            disabled={!file || uploadMut.isPending}
            onClick={() => uploadMut.mutate()}
          >
            {uploadMut.isPending ? 'Uploading…' : 'Attach'}
          </button>
        </div>
      )}

      {role === 'parent' && status === 'CLOSED' && (
        <p className="text-xs mt-3" style={{ color: muted }}>This concern is closed. Reopen or escalate it before adding new evidence.</p>
      )}

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <p className="text-xs" style={{ color: muted }}>Loading evidence…</p>
        ) : attachments.length === 0 ? (
          <p className="text-xs" style={{ color: muted }}>No evidence has been attached to this concern.</p>
        ) : attachments.map((attachment) => (
          <div key={attachment.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: dark ? '#121E36' : 'white', border: `1px solid ${border}` }}>
            <span className="text-xl">{iconFor(attachment.content_type)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate" style={{ color: text }}>{attachment.file_name}</div>
              <div className="text-[11px]" style={{ color: muted }}>
                {sizeLabel(attachment.file_size)} · {attachment.uploader_name} · {new Date(attachment.created_at).toLocaleString()}
              </div>
            </div>
            <button
              className="px-3 py-2 rounded-lg text-xs font-bold"
              style={{ border: `1px solid ${border}`, color: dark ? '#80D8FF' : 'var(--forest)', background: 'transparent' }}
              onClick={() => void download(attachment)}
            >
              Open
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
