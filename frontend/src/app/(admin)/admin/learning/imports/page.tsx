'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  commitLearningImport,
  getLearningImportBatch,
  getLearningImportBatches,
  getLearningImportOptions,
  stageLearningImport,
  type LearningImportBatch,
} from '@/services/adminLearningService';
import api from '@/services/api';
import { apiErrorText } from '@/utils/errors';
import styles from '@/components/public/publicLearning.module.css';

function payloadLabel(payload: Record<string, unknown>): string {
  return String(payload.title || payload.prompt || payload.importKey || 'Learning row');
}

async function downloadTemplate(format: 'csv' | 'json', sample: 'BLANK' | 'EARLY_YEARS' | 'CLASS_5' | 'CLASS_8') {
  const response = await api.get(`/admin/learning/imports/template?format=${format}&sample=${sample}`, { responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] || '');
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `vidyasetu-learning-import-${sample.toLowerCase()}.${format}`;
  const url = URL.createObjectURL(response.data as Blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function LearningBulkImporterPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ['learning-import-options'],
    queryFn: () => getLearningImportOptions().then((r) => r.data.data),
  });
  const batchesQuery = useQuery({
    queryKey: ['learning-import-batches'],
    queryFn: () => getLearningImportBatches().then((r) => r.data.data || []),
  });
  const batchQuery = useQuery({
    queryKey: ['learning-import-batch', selectedBatchId],
    enabled: Boolean(selectedBatchId),
    queryFn: () => getLearningImportBatch(selectedBatchId as string).then((r) => r.data.data),
  });

  const stageMutation = useMutation({
    mutationFn: (selected: File) => stageLearningImport(selected),
    onSuccess: async (response) => {
      const batch = response.data.data;
      if (!batch) return;
      setSelectedBatchId(batch.id);
      setFile(null);
      toast.success(batch.error_rows ? `Staged with ${batch.error_rows} row(s) needing correction` : 'File validated and staged — ready to import');
      await queryClient.invalidateQueries({ queryKey: ['learning-import-batches'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not validate import file')),
  });

  const commitMutation = useMutation({
    mutationFn: (batchId: string) => commitLearningImport(batchId),
    onSuccess: async (response) => {
      const batch = response.data.data;
      toast.success(`Imported ${batch?.imported_rows || 0} Learning row(s)`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-import-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-import-batch', selectedBatchId] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-questions'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not commit import batch')),
  });

  const gradesByStage = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof optionsQuery.data>['grades']>();
    for (const grade of optionsQuery.data?.grades || []) groups.set(grade.stage, [...(groups.get(grade.stage) || []), grade]);
    return Array.from(groups.entries());
  }, [optionsQuery.data]);

  const selectedBatch = batchQuery.data as LearningImportBatch | undefined;

  return (
    <div className={styles.studio}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING PLATFORM · ADMIN CONTENT OPERATIONS</div>
        <h1 style={{ color: 'white', fontSize: 34, margin: '6px 0' }}>📥 Global Learning Bulk Importer</h1>
        <p style={{ color: 'rgba(255,255,255,.62)', maxWidth: 980, lineHeight: 1.7 }}>
          Platform Admins can load VidyaSetu Original resources, NROER references and question-bank items in one governed batch.
          The importer works from <strong>Pre-Nursery through Class 12</strong>, across COMMON and configured national/state boards.
          Upload never publishes directly: every row is validated and previewed before the final Import action.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Link className={styles.tinyButton} href="/admin/learning">← Learning Studio</Link>
          <Link className={styles.tinyButton} href="/admin/learning/practice">Question Bank</Link>
          <Link className={styles.tinyButton} href="/admin/learning/intake">OER Intake</Link>
        </div>
      </div>

      <div className={styles.adminGrid}>
        <section className={styles.adminPanel}>
          <h2>1. Download a template</h2>
          <p style={{ color: 'rgba(255,255,255,.54)', lineHeight: 1.6 }}>
            Start with a blank global template or use the Class 5/Class 8 examples to understand the format. Early-years example demonstrates Pre-Nursery/Nursery targeting. Templates are examples only; the importer itself is global.
          </p>
          <div className={styles.statusRow}>
            <button type="button" className={styles.tinyButton} onClick={() => downloadTemplate('csv','BLANK')}>Blank CSV</button>
            <button type="button" className={styles.tinyButton} onClick={() => downloadTemplate('csv','EARLY_YEARS')}>Early-years CSV</button>
            <button type="button" className={styles.tinyButton} onClick={() => downloadTemplate('csv','CLASS_5')}>Class 5 CSV</button>
            <button type="button" className={styles.tinyButton} onClick={() => downloadTemplate('csv','CLASS_8')}>Class 8 CSV</button>
            <button type="button" className={styles.tinyButton} onClick={() => downloadTemplate('json','CLASS_5')}>Class 5 JSON</button>
            <button type="button" className={styles.tinyButton} onClick={() => downloadTemplate('json','CLASS_8')}>Class 8 JSON</button>
          </div>

          <div className={styles.note} style={{ marginTop: 14 }}>
            <strong>Grade codes:</strong> PRE_NURSERY, NURSERY, LKG, UKG, CLASS_1 … CLASS_12. Use <strong>ALL</strong> for genuinely all-age material. Multiple values use semicolons, for example <code>CLASS_5;CLASS_6</code>.
          </div>
          <div className={styles.note}>
            <strong>Board codes:</strong> use COMMON for cross-board content or one/more configured boards such as CBSE;UPMSP. NROER rows must contain a genuine nroer.gov.in source URL, verified open/link-only licence and attribution.
          </div>
        </section>

        <section className={styles.adminPanel}>
          <h2>2. Upload and validate</h2>
          <label className={styles.field}>CSV or JSON file
            <input className={styles.input} type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {file && <p style={{ color: '#9ed8ff', fontSize: 12 }}>{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
          <button className="btn-primary" type="button" disabled={!file || stageMutation.isPending} onClick={() => file && stageMutation.mutate(file)}>
            {stageMutation.isPending ? 'Validating…' : 'Validate & stage file'}
          </button>
          <p style={{ color: 'rgba(255,255,255,.46)', marginTop: 12, lineHeight: 1.6, fontSize: 12 }}>
            Maximum 5 MB / 1,000 rows per batch. Duplicate import keys, unknown grades/boards/sources, invalid licences and unsafe NROER URLs are rejected before any content is created.
          </p>
        </section>
      </div>

      <section className={styles.adminPanel} style={{ marginTop: 18 }}>
        <h2>Supported learning range</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {gradesByStage.map(([stage, grades]) => (
            <div key={stage}>
              <strong style={{ color: '#ffb46d', fontSize: 12 }}>{stage.replaceAll('_',' ')}</strong>
              <div className={styles.pillRow} style={{ marginTop: 7 }}>{grades.map((grade) => <span key={grade.code} className={styles.pill}>{grade.short_name}</span>)}</div>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.adminGrid} style={{ marginTop: 18 }}>
        <section className={styles.adminPanel}>
          <h2>Import history</h2>
          <div className={styles.adminList}>
            {(batchesQuery.data || []).map((batch) => (
              <button key={batch.id} type="button" className={styles.adminItem} style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick={() => setSelectedBatchId(batch.id)}>
                <div className={styles.adminItemTop}>
                  <div><strong>{batch.source_filename}</strong><p>{batch.import_format} · {batch.total_rows} rows · {batch.imported_rows} imported</p></div>
                  <span className={styles.badge}>{batch.status}</span>
                </div>
                <div className={styles.pillRow}><span className={styles.pill}>{batch.valid_rows} valid</span><span className={styles.pill}>{batch.error_rows} errors</span></div>
              </button>
            ))}
            {!batchesQuery.data?.length && <p style={{ color: 'rgba(255,255,255,.5)' }}>No bulk imports yet.</p>}
          </div>
        </section>

        <section className={styles.adminPanel}>
          <h2>3. Preview and import</h2>
          {!selectedBatch ? <p style={{ color: 'rgba(255,255,255,.5)' }}>Upload a file or select an import batch to inspect every row before commit.</p> : <>
            <div className={styles.adminItemTop}>
              <div><strong>{selectedBatch.source_filename}</strong><p>{selectedBatch.total_rows} total · {selectedBatch.valid_rows} valid · {selectedBatch.error_rows} invalid · {selectedBatch.imported_rows} imported</p></div>
              <span className={styles.badge}>{selectedBatch.status}</span>
            </div>
            <div className={styles.adminList} style={{ marginTop: 14, maxHeight: 560, overflowY: 'auto' }}>
              {(selectedBatch.rows || []).map((row) => (
                <article key={row.id} className={styles.adminItem}>
                  <div className={styles.adminItemTop}><div><strong>Row {row.row_number} · {payloadLabel(row.normalized_payload)}</strong><p>{row.record_type}</p></div><span className={styles.badge}>{row.validation_status}</span></div>
                  {row.errors?.map((error) => <p key={error} style={{ color: '#ff9e9e', fontSize: 12 }}>✕ {error}</p>)}
                  {row.warnings?.map((warning) => <p key={warning} style={{ color: '#ffd589', fontSize: 12 }}>⚠ {warning}</p>)}
                  <div className={styles.pillRow}>
                    {Array.isArray(row.normalized_payload.gradeCodes) && (row.normalized_payload.gradeCodes as string[]).slice(0,6).map((grade) => <span className={styles.pill} key={grade}>{grade.replace('CLASS_','Class ')}</span>)}
                    {Array.isArray(row.normalized_payload.boardCodes) && (row.normalized_payload.boardCodes as string[]).slice(0,4).map((board) => <span className={styles.pill} key={board}>{board}</span>)}
                  </div>
                </article>
              ))}
            </div>
            {selectedBatch.status !== 'COMPLETED' && <button className="btn-primary" style={{ marginTop: 14 }} type="button" disabled={selectedBatch.error_rows > 0 || selectedBatch.valid_rows !== selectedBatch.total_rows || commitMutation.isPending} onClick={() => commitMutation.mutate(selectedBatch.id)}>
              {commitMutation.isPending ? 'Importing…' : `Import ${selectedBatch.valid_rows} validated row(s)`}
            </button>}
            {selectedBatch.error_rows > 0 && <div className={styles.note} style={{ marginTop: 12 }}>Import is intentionally blocked while any row is invalid. Correct the source file and upload it as a new batch; invalid data is never partially published.</div>}
          </>}
        </section>
      </div>
    </div>
  );
}
