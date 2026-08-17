-- ============================================================
-- 05_student_module_seed.sql
-- Idempotent enrichment for Student Portal E2E validation.
-- Safe to run on an existing development database.
-- ============================================================

\echo '▶  Enriching Student module demo data...'

BEGIN;

-- ── Class 8 chapters for all sidebar subjects ─────────────────
INSERT INTO chapters (id, subject_id, class_name, chapter_number, title, title_hi) VALUES
  ('61000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','8',1,'The Best Christmas Present in the World','द बेस्ट क्रिसमस प्रेज़ेंट इन द वर्ल्ड'),
  ('61000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004','8',1,'ध्वनि','ध्वनि'),
  ('61000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000005','8',1,'Resources','संसाधन'),
  ('61000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000006','8',1,'सुभाषितानि','सुभाषितानि')
ON CONFLICT (subject_id, class_name, chapter_number) DO NOTHING;

-- Attach lightweight same-origin demo assets to existing content.
UPDATE content_items SET file_url='/demo-content/rational-numbers.html', file_size_kb=18, is_offline_ready=TRUE
WHERE id='70000000-0000-0000-0000-000000000001';
UPDATE content_items SET file_url='/demo-content/rational-numbers-notes.html', file_size_kb=12, is_offline_ready=TRUE
WHERE id='70000000-0000-0000-0000-000000000002';
UPDATE content_items SET file_url='/demo-content/linear-equations.html', file_size_kb=16, is_offline_ready=TRUE
WHERE id='70000000-0000-0000-0000-000000000004';
UPDATE content_items SET file_url='/demo-content/crop-production.html', file_size_kb=18, is_offline_ready=TRUE
WHERE id='70000000-0000-0000-0000-000000000006';
UPDATE content_items SET file_url='/demo-content/crop-production-notes.html', file_size_kb=12, is_offline_ready=TRUE
WHERE id='70000000-0000-0000-0000-000000000007';

-- Additional class 8 content so all six subject cards are backed by PostgreSQL.
INSERT INTO content_items
  (id, chapter_id, type, status, title, title_hi, language, file_url, file_size_kb,
   xp_reward, sort_order, is_offline_ready) VALUES
  ('71000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','NOTES','PUBLISHED','Chapter Summary & Vocabulary','अध्याय सारांश','en','/demo-content/english-chapter.html',10,8,1,TRUE),
  ('71000000-0000-0000-0000-000000000002','61000000-0000-0000-0000-000000000002','NOTES','PUBLISHED','ध्वनि — सारांश और अभ्यास','ध्वनि — सारांश और अभ्यास','hi','/demo-content/hindi-dhwani.html',10,8,1,TRUE),
  ('71000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000000003','NOTES','PUBLISHED','Resources — Quick Notes','संसाधन — त्वरित नोट्स','en','/demo-content/resources.html',11,8,1,TRUE),
  ('71000000-0000-0000-0000-000000000004','61000000-0000-0000-0000-000000000004','NOTES','PUBLISHED','सुभाषितानि — अर्थ सहित','सुभाषितानि — अर्थ सहित','hi','/demo-content/sanskrit-subhashitani.html',9,8,1,TRUE)
ON CONFLICT (id) DO UPDATE SET
  status=EXCLUDED.status, file_url=EXCLUDED.file_url, file_size_kb=EXCLUDED.file_size_kb,
  is_offline_ready=EXCLUDED.is_offline_ready;

-- Give Aarav and Priya real progress across all subjects.
INSERT INTO student_content_progress
  (student_id, content_item_id, is_completed, progress_pct, attempts, last_accessed, completed_at) VALUES
  ('30000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000006',TRUE,100,1,NOW()-INTERVAL '5 days',NOW()-INTERVAL '5 days'),
  ('30000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',TRUE,100,1,NOW()-INTERVAL '4 days',NOW()-INTERVAL '4 days'),
  ('30000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002',TRUE,100,1,NOW()-INTERVAL '3 days',NOW()-INTERVAL '3 days'),
  ('30000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000003',FALSE,45,1,NOW()-INTERVAL '2 days',NULL),
  ('30000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000004',FALSE,20,1,NOW()-INTERVAL '1 day',NULL),
  ('30000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000006',TRUE,100,1,NOW()-INTERVAL '6 days',NOW()-INTERVAL '6 days'),
  ('30000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000007',TRUE,100,1,NOW()-INTERVAL '5 days',NOW()-INTERVAL '5 days'),
  ('30000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001',TRUE,100,1,NOW()-INTERVAL '4 days',NOW()-INTERVAL '4 days'),
  ('30000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002',TRUE,100,1,NOW()-INTERVAL '3 days',NOW()-INTERVAL '3 days'),
  ('30000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000003',TRUE,100,1,NOW()-INTERVAL '2 days',NOW()-INTERVAL '2 days'),
  ('30000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000004',TRUE,100,1,NOW()-INTERVAL '1 day',NOW()-INTERVAL '1 day')
ON CONFLICT (student_id, content_item_id) DO UPDATE SET
  progress_pct=GREATEST(student_content_progress.progress_pct,EXCLUDED.progress_pct),
  is_completed=student_content_progress.is_completed OR EXCLUDED.is_completed,
  last_accessed=EXCLUDED.last_accessed,
  completed_at=COALESCE(student_content_progress.completed_at,EXCLUDED.completed_at);

-- ── Current-month attendance for realistic dashboard/calendar ─
WITH days AS (
  SELECT d::date AS day,
         ROW_NUMBER() OVER (ORDER BY d) AS rn
  FROM generate_series(
    date_trunc('month', CURRENT_DATE)::date,
    CURRENT_DATE,
    INTERVAL '1 day'
  ) d
  WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
)
INSERT INTO attendance (student_id, class_id, school_id, date, status, marked_by, remark)
SELECT s.student_id,
       '20000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000001',
       days.day,
       CASE
         WHEN s.student_id='30000000-0000-0000-0000-000000000001' AND days.rn IN (3,11) THEN 'ABSENT'::attendance_status
         WHEN s.student_id='30000000-0000-0000-0000-000000000002' AND days.rn=7 THEN 'LATE'::attendance_status
         ELSE 'PRESENT'::attendance_status
       END,
       '00000000-0000-0000-0000-000000000010',
       CASE WHEN days.rn IN (3,11) THEN 'Development seed attendance' ELSE NULL END
FROM days
CROSS JOIN (VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid),
  ('30000000-0000-0000-0000-000000000002'::uuid)
) AS s(student_id)
ON CONFLICT (student_id, date) DO NOTHING;

-- Recompute monthly summary from source attendance rows.
INSERT INTO attendance_monthly_summary
  (student_id, school_id, year, month, working_days, present_days, absent_days, late_days, half_days, percentage)
SELECT a.student_id,
       MAX(a.school_id),
       EXTRACT(YEAR FROM CURRENT_DATE)::smallint,
       EXTRACT(MONTH FROM CURRENT_DATE)::smallint,
       COUNT(*)::smallint,
       COUNT(*) FILTER (WHERE a.status='PRESENT')::smallint,
       COUNT(*) FILTER (WHERE a.status='ABSENT')::smallint,
       COUNT(*) FILTER (WHERE a.status='LATE')::smallint,
       COUNT(*) FILTER (WHERE a.status='HALF_DAY')::smallint,
       ROUND((COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE','HALF_DAY'))::numeric / NULLIF(COUNT(*),0))*100,2)
FROM attendance a
WHERE a.student_id IN ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')
  AND EXTRACT(YEAR FROM a.date)=EXTRACT(YEAR FROM CURRENT_DATE)
  AND EXTRACT(MONTH FROM a.date)=EXTRACT(MONTH FROM CURRENT_DATE)
GROUP BY a.student_id
ON CONFLICT (student_id, year, month) DO UPDATE SET
  working_days=EXCLUDED.working_days,
  present_days=EXCLUDED.present_days,
  absent_days=EXCLUDED.absent_days,
  late_days=EXCLUDED.late_days,
  half_days=EXCLUDED.half_days,
  percentage=EXCLUDED.percentage,
  updated_at=NOW();

-- ── Student exam center: live, upcoming and completed exams ───
INSERT INTO exams
  (id, school_id, created_by, title, title_hi, description, type, status,
   class_names, subject_codes, total_questions, duration_mins,
   marks_per_question, negative_marks,
   registration_start, registration_end, start_time, end_time, results_at,
   prize_pool, instructions) VALUES
  ('b0000000-0000-0000-0000-000000000001',NULL,'00000000-0000-0000-0000-000000000001',
   'Class 8 Mathematics Practice Challenge','कक्षा 8 गणित अभ्यास चुनौती',
   'A live five-question practice exam used for Student Portal E2E testing.','PRACTICE','LIVE',
   ARRAY['8'],ARRAY['MATH'],5,30,2,0,
   NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day',NOW()-INTERVAL '20 minutes',NOW()+INTERVAL '2 hours',NOW()+INTERVAL '2 hours',0,
   'Answer all five questions. You may submit early.'),
  ('b0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
   'Unit Test — Science Class 8','इकाई परीक्षा — विज्ञान कक्षा 8',
   'Upcoming school unit test.','SCHOOL_TEST','REGISTRATION_OPEN',
   ARRAY['8'],ARRAY['SCI'],20,45,4,0,
   NOW()-INTERVAL '1 day',NOW()+INTERVAL '2 days',NOW()+INTERVAL '3 days',NOW()+INTERVAL '3 days 45 minutes',NOW()+INTERVAL '4 days',0,
   'Revise Crop Production and Microorganisms.'),
  ('b0000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
   'Mathematics Monthly Test','मासिक गणित परीक्षा',
   'Completed school test for report-card validation.','SCHOOL_TEST','COMPLETED',
   ARRAY['8'],ARRAY['MATH'],25,45,4,0,
   CURRENT_DATE-INTERVAL '35 days',CURRENT_DATE-INTERVAL '31 days',CURRENT_DATE-INTERVAL '30 days',CURRENT_DATE-INTERVAL '30 days'+INTERVAL '45 minutes',CURRENT_DATE-INTERVAL '29 days',0,
   'Completed test.'),
  ('b0000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
   'Science Monthly Test','मासिक विज्ञान परीक्षा',
   'Completed school test for report-card validation.','SCHOOL_TEST','COMPLETED',
   ARRAY['8'],ARRAY['SCI'],25,45,4,0,
   CURRENT_DATE-INTERVAL '20 days',CURRENT_DATE-INTERVAL '16 days',CURRENT_DATE-INTERVAL '15 days',CURRENT_DATE-INTERVAL '15 days'+INTERVAL '45 minutes',CURRENT_DATE-INTERVAL '14 days',0,
   'Completed test.')
ON CONFLICT (id) DO UPDATE SET
  status=EXCLUDED.status,
  registration_start=EXCLUDED.registration_start,
  registration_end=EXCLUDED.registration_end,
  start_time=EXCLUDED.start_time,
  end_time=EXCLUDED.end_time,
  results_at=EXCLUDED.results_at;

INSERT INTO exam_questions
  (id, exam_id, question_text, question_hi, option_a, option_b, option_c, option_d,
   correct_option, explanation, subject_code, difficulty, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','What is 3/4 + 1/4?','3/4 + 1/4 कितना है?','1','1/2','3/8','4/8','A','Same denominators: add numerators.','MATH','EASY',1),
  ('b1000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','Solve: 2x + 6 = 14','हल करें: 2x + 6 = 14','x=2','x=3','x=4','x=5','C','Subtract 6, then divide by 2.','MATH','EASY',2),
  ('b1000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','Which is a rational number?','इनमें से परिमेय संख्या कौन-सी है?','√2','π','5/7','√3','C','A ratio of two integers is rational.','MATH','EASY',3),
  ('b1000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000001','A quadrilateral has how many sides?','चतुर्भुज की कितनी भुजाएँ होती हैं?','3','4','5','6','B','Quad means four.','MATH','EASY',4),
  ('b1000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000001','The mean of 4, 6 and 8 is:','4, 6 और 8 का औसत है:','5','6','7','8','B','(4+6+8)/3 = 6.','MATH','MEDIUM',5)
ON CONFLICT (id) DO NOTHING;

-- Past scored attempts for report card.
INSERT INTO exam_attempts
  (id, exam_id, student_id, school_id, status, started_at, submitted_at,
   time_taken_secs, total_marks, correct_count, wrong_count, skipped_count, rank_school, rank_overall, percentile) VALUES
  ('b2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','SCORED',CURRENT_DATE-INTERVAL '30 days',CURRENT_DATE-INTERVAL '30 days'+INTERVAL '40 minutes',2400,84,21,4,0,3,18,86.4),
  ('b2000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','SCORED',CURRENT_DATE-INTERVAL '15 days',CURRENT_DATE-INTERVAL '15 days'+INTERVAL '41 minutes',2460,72,18,7,0,8,42,67.2),
  ('b2000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','SCORED',CURRENT_DATE-INTERVAL '30 days',CURRENT_DATE-INTERVAL '30 days'+INTERVAL '34 minutes',2040,96,24,1,0,1,5,96.1),
  ('b2000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','SCORED',CURRENT_DATE-INTERVAL '15 days',CURRENT_DATE-INTERVAL '15 days'+INTERVAL '36 minutes',2160,88,22,3,0,2,10,91.0)
ON CONFLICT (exam_id, student_id) DO UPDATE SET
  status='SCORED', total_marks=EXCLUDED.total_marks, correct_count=EXCLUDED.correct_count,
  wrong_count=EXCLUDED.wrong_count, skipped_count=EXCLUDED.skipped_count,
  rank_school=EXCLUDED.rank_school, rank_overall=EXCLUDED.rank_overall, percentile=EXCLUDED.percentile;

-- ── Doubt forum answers and fresh threads ─────────────────────
INSERT INTO doubts
  (id, student_id, school_id, subject_code, chapter_id, title, body, status) VALUES
  ('a0000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','SCI','60000000-0000-0000-0000-000000000010','Why do crops need different seasons?','Kharif aur Rabi crops alag seasons mein kyun ugte hain? Rainfall aur temperature ka role samjhaiye.','OPEN'),
  ('a0000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','MATH','60000000-0000-0000-0000-000000000002','Linear equation checking method','Equation solve karne ke baad answer ko quickly verify kaise karein?','OPEN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO doubt_answers (id, doubt_id, author_id, body, is_ai_answer, is_accepted) VALUES
  ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','Use the average repeatedly. First (1/3 + 1/2)/2 = 5/12, which lies between them. You can repeat the same method to generate more rational numbers.',FALSE,TRUE),
  ('a1000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000011','Kharif crops need warm, rainy conditions, while Rabi crops prefer cooler and drier months. Their water and temperature needs are different.',FALSE,FALSE)
ON CONFLICT (id) DO NOTHING;

UPDATE doubts d SET answer_count=(SELECT COUNT(*) FROM doubt_answers da WHERE da.doubt_id=d.id);
UPDATE doubts SET resolved_by='00000000-0000-0000-0000-000000000020', resolved_at=COALESCE(resolved_at,NOW()-INTERVAL '10 days')
WHERE id='a0000000-0000-0000-0000-000000000001';

COMMIT;

\echo '✅  Student module E2E demo data ready.'
