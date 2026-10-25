-- VidyaSetu synthetic school-network expansion.
-- Intended only for a disposable development/staging database AFTER all
-- migrations and database/seeds/dev_seed.sql. It creates no real UDISE IDs.
-- Safety: requires both an explicit session opt-in and a non-production DB
-- name containing dev, test, stage, or staging.
DO $$
BEGIN
  IF current_setting('app.allow_synthetic_seed', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Synthetic seed blocked. Set app.allow_synthetic_seed=on for a development/staging run.';
  END IF;
  IF current_database() !~* '(dev|test|stage|staging)' THEN
    RAISE EXCEPTION 'Synthetic seed blocked for database "%"; use a development/staging database.', current_database();
  END IF;
END $$;

BEGIN;

-- Totals after this file: 9 schools, 15 students, 12 teachers, 12 parents.
-- Existing users 000...001 through 000...045 are preserved.
INSERT INTO users(id,mobile,name,username,email,role,status,language)
VALUES
 ('00000000-0000-0000-0000-000000000052','9110000003','Neha Kapoor','neha.kapoor','neha.kapoor@demo.vidyasetu.sbs','SCHOOL_ADMIN','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000053','9110000004','Amit Joshi','amit.joshi','amit.joshi@demo.vidyasetu.sbs','SCHOOL_ADMIN','ACTIVE','hi'),
 ('00000000-0000-0000-0000-000000000054','9110000005','Kavita Rao','kavita.rao','kavita.rao@demo.vidyasetu.sbs','SCHOOL_ADMIN','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000055','9110000006','Sanjay Mehta','sanjay.mehta','sanjay.mehta@demo.vidyasetu.sbs','SCHOOL_ADMIN','ACTIVE','hi'),
 ('00000000-0000-0000-0000-000000000056','9110000007','Pooja Nair','pooja.nair','pooja.nair@demo.vidyasetu.sbs','SCHOOL_ADMIN','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000057','9110000008','Deepak Rawat','deepak.rawat','deepak.rawat@demo.vidyasetu.sbs','SCHOOL_ADMIN','ACTIVE','hi'),
 ('00000000-0000-0000-0000-000000000058','9110000009','Farah Khan','farah.khan','farah.khan@demo.vidyasetu.sbs','SCHOOL_ADMIN','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000014','9210000001','Nisha Saini','nisha.saini','nisha.saini@demo.vidyasetu.sbs','TEACHER','ACTIVE','hi'),
 ('00000000-0000-0000-0000-000000000015','9210000002','Rahul Bansal','rahul.bansal','rahul.bansal@demo.vidyasetu.sbs','TEACHER','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000016','9210000003','Meera Joshi','meera.joshi','meera.joshi@demo.vidyasetu.sbs','TEACHER','ACTIVE','hi'),
 ('00000000-0000-0000-0000-000000000017','9210000004','Vikram Rao','vikram.rao','vikram.rao@demo.vidyasetu.sbs','TEACHER','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000018','9210000005','Sana Qureshi','sana.qureshi','sana.qureshi@demo.vidyasetu.sbs','TEACHER','ACTIVE','hi'),
 ('00000000-0000-0000-0000-000000000019','9210000006','Karan Mehta','karan.mehta','karan.mehta@demo.vidyasetu.sbs','TEACHER','ACTIVE','en'),
 ('00000000-0000-0000-0000-00000000001a','9210000007','Anjali Rawat','anjali.rawat','anjali.rawat@demo.vidyasetu.sbs','TEACHER','ACTIVE','hi'),
 ('00000000-0000-0000-0000-00000000001b','9210000008','Imran Khan','imran.khan','imran.khan@demo.vidyasetu.sbs','TEACHER','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000032','9310000001','Ishita Sharma','ishita.sharma','ishita.sharma@demo.vidyasetu.sbs','STUDENT','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000033','9310000002','Kabir Singh','kabir.singh','kabir.singh@demo.vidyasetu.sbs','STUDENT','ACTIVE','hi'),
 ('00000000-0000-0000-0000-000000000034','9310000003','Aanya Verma','aanya.verma','aanya.verma@demo.vidyasetu.sbs','STUDENT','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000046','9410000001','Sunil Sharma','sunil.sharma','sunil.sharma@demo.vidyasetu.sbs','PARENT','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000047','9410000002','Nandita Singh','nandita.singh','nandita.singh@demo.vidyasetu.sbs','PARENT','ACTIVE','hi'),
 ('00000000-0000-0000-0000-000000000048','9410000003','Rakesh Verma','rakesh.verma','rakesh.verma@demo.vidyasetu.sbs','PARENT','ACTIVE','en'),
 ('00000000-0000-0000-0000-000000000049','9410000004','Shalini Gupta','shalini.gupta','shalini.gupta@demo.vidyasetu.sbs','PARENT','ACTIVE','hi'),
 ('00000000-0000-0000-0000-00000000004a','9410000005','Manoj Patel','manoj.patel','manoj.patel@demo.vidyasetu.sbs','PARENT','ACTIVE','en'),
 ('00000000-0000-0000-0000-00000000004b','9410000006','Farida Khan','farida.khan','farida.khan@demo.vidyasetu.sbs','PARENT','ACTIVE','hi')
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,username=EXCLUDED.username,email=EXCLUDED.email,role=EXCLUDED.role,status=EXCLUDED.status,language=EXCLUDED.language;

-- The original development fixture assigned these four linked Teacher users
-- the School Admin role. Normalize that legacy fixture before reporting counts.
UPDATE users u SET role='TEACHER',updated_at=NOW()
WHERE u.id IN ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000013')
  AND EXISTS(SELECT 1 FROM teachers t WHERE t.user_id=u.id);

INSERT INTO schools(id,name,name_hi,admin_user_id,status,plan,address,city,district,state,pincode,mobile,email,academic_year,board,principal_name)
VALUES
 ('10000000-0000-0000-0000-000000000003','VidyaSetu Demo Academy 03','विद्यासेतु डेमो अकादमी 03','00000000-0000-0000-0000-000000000052','ACTIVE','BASIC','Demo Campus, Civil Lines','Lucknow','Lucknow','Uttar Pradesh','226001','9110000003','school03@demo.vidyasetu.sbs','2026-27','CBSE','Neha Kapoor'),
 ('10000000-0000-0000-0000-000000000004','VidyaSetu Demo Academy 04','विद्यासेतु डेमो अकादमी 04','00000000-0000-0000-0000-000000000053','ACTIVE','FREE','Demo Campus, Sector 18','Noida','Gautam Buddha Nagar','Uttar Pradesh','201301','9110000004','school04@demo.vidyasetu.sbs','2026-27','CBSE','Amit Joshi'),
 ('10000000-0000-0000-0000-000000000005','VidyaSetu Demo Academy 05','विद्यासेतु डेमो अकादमी 05','00000000-0000-0000-0000-000000000054','ACTIVE','BASIC','Demo Campus, Model Town','Jaipur','Jaipur','Rajasthan','302001','9110000005','school05@demo.vidyasetu.sbs','2026-27','CBSE','Kavita Rao'),
 ('10000000-0000-0000-0000-000000000006','VidyaSetu Demo Academy 06','विद्यासेतु डेमो अकादमी 06','00000000-0000-0000-0000-000000000055','ACTIVE','FREE','Demo Campus, Sector 14','Gurugram','Gurugram','Haryana','122001','9110000006','school06@demo.vidyasetu.sbs','2026-27','CBSE','Sanjay Mehta'),
 ('10000000-0000-0000-0000-000000000007','VidyaSetu Demo Academy 07','विद्यासेतु डेमो अकादमी 07','00000000-0000-0000-0000-000000000056','ACTIVE','BASIC','Demo Campus, Rajpur Road','Dehradun','Dehradun','Uttarakhand','248001','9110000007','school07@demo.vidyasetu.sbs','2026-27','CBSE','Pooja Nair'),
 ('10000000-0000-0000-0000-000000000008','VidyaSetu Demo Academy 08','विद्यासेतु डेमो अकादमी 08','00000000-0000-0000-0000-000000000057','ACTIVE','FREE','Demo Campus, Civil Lines','Prayagraj','Prayagraj','Uttar Pradesh','211001','9110000008','school08@demo.vidyasetu.sbs','2026-27','UPMSP','Deepak Rawat'),
 ('10000000-0000-0000-0000-000000000009','VidyaSetu Demo Academy 09','विद्यासेतु डेमो अकादमी 09','00000000-0000-0000-0000-000000000058','ACTIVE','BASIC','Demo Campus, Central Zone','Bhopal','Bhopal','Madhya Pradesh','462001','9110000009','school09@demo.vidyasetu.sbs','2026-27','CBSE','Farah Khan')
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,name_hi=EXCLUDED.name_hi,admin_user_id=EXCLUDED.admin_user_id,status=EXCLUDED.status,plan=EXCLUDED.plan,address=EXCLUDED.address,city=EXCLUDED.city,district=EXCLUDED.district,state=EXCLUDED.state,pincode=EXCLUDED.pincode,mobile=EXCLUDED.mobile,email=EXCLUDED.email,academic_year=EXCLUDED.academic_year,board=EXCLUDED.board,principal_name=EXCLUDED.principal_name;

-- Ensure the roster has sections in each of the nine demonstration schools.
INSERT INTO school_classes(school_id,class_name,section,academic_year,is_active)
SELECT s.id,g.class_name,'A','2026-27',TRUE
FROM schools s CROSS JOIN (VALUES('8'),('9'),('10')) AS g(class_name)
WHERE s.id BETWEEN '10000000-0000-0000-0000-000000000001'::uuid AND '10000000-0000-0000-0000-000000000009'::uuid
ON CONFLICT(school_id,class_name,section,academic_year) DO UPDATE SET is_active=TRUE;

-- Spread the existing 12 sample learners across eight schools; add three at
-- School 09. Existing IDs and parent links stay stable.
WITH roster(student_id,school_id,class_name,roll_number) AS (VALUES
 ('30000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000001'::uuid,'8','8A01'),
 ('30000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000001'::uuid,'8','8A02'),
 ('30000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'8','8A03'),
 ('30000000-0000-0000-0000-000000000004'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'8','8A04'),
 ('30000000-0000-0000-0000-000000000005'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'9','9A01'),
 ('30000000-0000-0000-0000-000000000006'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'9','9A02'),
 ('30000000-0000-0000-0000-000000000007'::uuid,'10000000-0000-0000-0000-000000000004'::uuid,'9','9A01'),
 ('30000000-0000-0000-0000-000000000008'::uuid,'10000000-0000-0000-0000-000000000005'::uuid,'10','10A01'),
 ('30000000-0000-0000-0000-000000000009'::uuid,'10000000-0000-0000-0000-000000000005'::uuid,'10','10A02'),
 ('30000000-0000-0000-0000-000000000010'::uuid,'10000000-0000-0000-0000-000000000006'::uuid,'10','10A01'),
 ('30000000-0000-0000-0000-000000000011'::uuid,'10000000-0000-0000-0000-000000000007'::uuid,'10','10A01'),
 ('30000000-0000-0000-0000-000000000012'::uuid,'10000000-0000-0000-0000-000000000008'::uuid,'10','10A01')
)
UPDATE students st SET school_id=r.school_id,class_id=sc.id,grade_level=r.class_name,roll_number=r.roll_number,academic_year='2026-27',school_link_status='APPROVED',school_link_reviewed_at=COALESCE(st.school_link_reviewed_at,NOW()),school_link_reviewed_by=COALESCE(st.school_link_reviewed_by,s.admin_user_id)
FROM roster r JOIN school_classes sc ON sc.school_id=r.school_id AND sc.class_name=r.class_name AND sc.section='A' AND sc.academic_year='2026-27' JOIN schools s ON s.id=r.school_id
WHERE st.id=r.student_id;

-- Keep the legacy fixture's already-created ledger rows aligned with the new
-- school/class ownership for those same stable Student IDs.
UPDATE attendance a SET school_id=st.school_id,class_id=st.class_id
FROM students st WHERE st.id=a.student_id AND st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000012'::uuid;
UPDATE attendance_monthly_summary m SET school_id=st.school_id
FROM students st WHERE st.id=m.student_id AND st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000012'::uuid;
UPDATE fee_invoices f SET school_id=st.school_id
FROM students st WHERE st.id=f.student_id AND st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000012'::uuid;
UPDATE fee_payments p SET school_id=st.school_id
FROM students st WHERE st.id=p.student_id AND st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000012'::uuid;
UPDATE exam_registrations r SET school_id=st.school_id
FROM students st WHERE st.id=r.student_id AND st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000012'::uuid;
UPDATE exam_attempts a SET school_id=st.school_id
FROM students st WHERE st.id=a.student_id AND st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000012'::uuid;

INSERT INTO students(id,user_id,school_id,class_id,roll_number,academic_year,date_of_birth,gender,primary_parent_mobile,grade_level,school_link_status,school_link_reviewed_at,school_link_reviewed_by)
SELECT x.student_id,x.user_id,x.school_id,sc.id,x.roll_number,'2026-27',x.dob,x.gender,x.parent_mobile,x.grade,'APPROVED',NOW(),s.admin_user_id
FROM (VALUES
 ('30000000-0000-0000-0000-000000000013'::uuid,'00000000-0000-0000-0000-000000000032'::uuid,'10000000-0000-0000-0000-000000000009'::uuid,'8A01','2013-04-12'::date,'FEMALE'::gender_type,'9410000001','8'),
 ('30000000-0000-0000-0000-000000000014'::uuid,'00000000-0000-0000-0000-000000000033'::uuid,'10000000-0000-0000-0000-000000000009'::uuid,'9A01','2012-09-03'::date,'MALE'::gender_type,'9410000002','9'),
 ('30000000-0000-0000-0000-000000000015'::uuid,'00000000-0000-0000-0000-000000000034'::uuid,'10000000-0000-0000-0000-000000000009'::uuid,'10A01','2011-12-22'::date,'FEMALE'::gender_type,'9410000003','10')
) AS x(student_id,user_id,school_id,roll_number,dob,gender,parent_mobile,grade)
JOIN schools s ON s.id=x.school_id
JOIN school_classes sc ON sc.school_id=x.school_id AND sc.class_name=x.grade AND sc.section='A' AND sc.academic_year='2026-27'
ON CONFLICT(id) DO UPDATE SET school_id=EXCLUDED.school_id,class_id=EXCLUDED.class_id,roll_number=EXCLUDED.roll_number,academic_year=EXCLUDED.academic_year,grade_level=EXCLUDED.grade_level,school_link_status='APPROVED';

-- Six more synthetic Parents; each family relationship is explicit.
INSERT INTO parent_student_links(parent_user_id,student_id,relation,is_primary)
VALUES
 ('00000000-0000-0000-0000-000000000046','30000000-0000-0000-0000-000000000013','FATHER',TRUE),
 ('00000000-0000-0000-0000-000000000047','30000000-0000-0000-0000-000000000014','MOTHER',TRUE),
 ('00000000-0000-0000-0000-000000000048','30000000-0000-0000-0000-000000000015','FATHER',TRUE),
 ('00000000-0000-0000-0000-000000000049','30000000-0000-0000-0000-000000000013','MOTHER',FALSE),
 ('00000000-0000-0000-0000-00000000004a','30000000-0000-0000-0000-000000000014','FATHER',FALSE),
 ('00000000-0000-0000-0000-00000000004b','30000000-0000-0000-0000-000000000015','MOTHER',FALSE)
ON CONFLICT(parent_user_id,student_id) DO UPDATE SET relation=EXCLUDED.relation,is_primary=EXCLUDED.is_primary;

-- Twelve teachers total: the four existing School 01 teachers plus one per
-- remaining school. The four original sample teacher roles are corrected above.
INSERT INTO teachers(id,user_id,school_id,employee_id,qualification,experience_yrs,designation,employment_type,email_official)
VALUES
 ('40000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000002','DEMO-S02-T01','B.Ed., M.Sc. Mathematics',6,'Mathematics Teacher','FULL_TIME','nisha.saini@demo.vidyasetu.sbs'),
 ('40000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000003','DEMO-S03-T01','B.Ed., M.Sc. Science',9,'Science Teacher','FULL_TIME','rahul.bansal@demo.vidyasetu.sbs'),
 ('40000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000016','10000000-0000-0000-0000-000000000004','DEMO-S04-T01','B.Ed., M.A. English',5,'English Teacher','FULL_TIME','meera.joshi@demo.vidyasetu.sbs'),
 ('40000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000017','10000000-0000-0000-0000-000000000005','DEMO-S05-T01','B.Ed., M.Sc. Mathematics',11,'Mathematics Teacher','FULL_TIME','vikram.rao@demo.vidyasetu.sbs'),
 ('40000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000018','10000000-0000-0000-0000-000000000006','DEMO-S06-T01','B.Ed., M.A. Hindi',7,'Hindi Teacher','FULL_TIME','sana.qureshi@demo.vidyasetu.sbs'),
 ('40000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000019','10000000-0000-0000-0000-000000000007','DEMO-S07-T01','B.Ed., M.Sc. Physics',8,'Science Teacher','FULL_TIME','karan.mehta@demo.vidyasetu.sbs'),
 ('40000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000001a','10000000-0000-0000-0000-000000000008','DEMO-S08-T01','B.Ed., M.A. Social Science',10,'Social Science Teacher','FULL_TIME','anjali.rawat@demo.vidyasetu.sbs'),
 ('40000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000001b','10000000-0000-0000-0000-000000000009','DEMO-S09-T01','B.Ed., M.Sc. Mathematics',4,'Mathematics Teacher','FULL_TIME','imran.khan@demo.vidyasetu.sbs')
ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,school_id=EXCLUDED.school_id,employee_id=EXCLUDED.employee_id,qualification=EXCLUDED.qualification,experience_yrs=EXCLUDED.experience_yrs,designation=EXCLUDED.designation,email_official=EXCLUDED.email_official;

-- Assign all twelve Teachers to active demo classes. Existing School 01
-- teachers receive subject-specific assignments; one class teacher is set per
-- section. Schools 02–09 receive a math teacher for the three test grades.
INSERT INTO teacher_assignments(teacher_id,school_id,class_id,subject_code,academic_year,is_class_teacher)
SELECT t.id,t.school_id,sc.id,subject.subject_code,'2026-27',subject.is_class_teacher
FROM teachers t
JOIN school_classes sc ON sc.school_id=t.school_id AND sc.academic_year='2026-27' AND sc.class_name IN ('8','9','10')
JOIN LATERAL (SELECT CASE WHEN t.school_id='10000000-0000-0000-0000-000000000001'::uuid THEN
       CASE t.employee_id WHEN 'SVM001' THEN 'MATH' WHEN 'SVM002' THEN 'SCI' WHEN 'SVM003' THEN 'HIN' ELSE 'SST' END
     ELSE 'MATH' END AS subject_code,
     CASE WHEN t.school_id='10000000-0000-0000-0000-000000000001'::uuid THEN t.employee_id='SVM001' AND sc.class_name='8'
          ELSE sc.class_name='8' END AS is_class_teacher) subject ON TRUE
WHERE t.id BETWEEN '40000000-0000-0000-0000-000000000001'::uuid AND '40000000-0000-0000-0000-00000000000c'::uuid
ON CONFLICT(teacher_id,class_id,subject_code,academic_year) DO UPDATE SET is_class_teacher=EXCLUDED.is_class_teacher;

-- Keep denormalized school totals truthful after roster changes.
UPDATE schools s SET
 total_students=(SELECT COUNT(*)::int FROM students st WHERE st.school_id=s.id AND st.status='ACTIVE' AND st.school_link_status='APPROVED'),
 total_teachers=(SELECT COUNT(*)::int FROM teachers t WHERE t.school_id=s.id AND t.status='ACTIVE'),
 updated_at=NOW()
WHERE s.id BETWEEN '10000000-0000-0000-0000-000000000001'::uuid AND '10000000-0000-0000-0000-000000000009'::uuid;

-- Twenty school days of dated attendance for all 15 students. The monthly
-- summary trigger builds rollups; deterministic status variation makes charts
-- and attendance filters useful without inventing free-form identities.
WITH school_days AS (
 SELECT day::date AS attendance_date FROM generate_series('2026-09-01'::date,'2026-09-30'::date,INTERVAL '1 day') day
 WHERE EXTRACT(ISODOW FROM day)<6 ORDER BY day LIMIT 20
),
roster AS (
 SELECT st.*,ROW_NUMBER() OVER(ORDER BY st.student_code)::int AS seq
 FROM students st WHERE st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000015'::uuid
),
teacher_for_class AS (
 SELECT DISTINCT ON (ta.class_id) ta.class_id,t.user_id AS teacher_user_id FROM teacher_assignments ta
 JOIN teachers t ON t.id=ta.teacher_id
 WHERE ta.academic_year='2026-27' AND ta.is_class_teacher=TRUE ORDER BY ta.class_id,ta.teacher_id
)
INSERT INTO attendance(student_id,class_id,school_id,date,status,remark,marked_by)
SELECT r.id,r.class_id,r.school_id,d.attendance_date,
 CASE WHEN (r.seq+EXTRACT(DAY FROM d.attendance_date)::int)%19=0 THEN 'ABSENT'::attendance_status
      WHEN (r.seq+EXTRACT(DAY FROM d.attendance_date)::int)%13=0 THEN 'LATE'::attendance_status
      WHEN (r.seq+EXTRACT(DAY FROM d.attendance_date)::int)%17=0 THEN 'HALF_DAY'::attendance_status
      ELSE 'PRESENT'::attendance_status END,
 CASE WHEN (r.seq+EXTRACT(DAY FROM d.attendance_date)::int)%19=0 THEN 'Synthetic demo absence' ELSE NULL END,
 COALESCE(t.teacher_user_id,s.admin_user_id)
FROM roster r CROSS JOIN school_days d JOIN schools s ON s.id=r.school_id
LEFT JOIN teacher_for_class t ON t.class_id=r.class_id
ON CONFLICT(student_id,date) DO NOTHING;

-- Per-school, per-grade fee schedules for the current demo academic year.
INSERT INTO fee_structures(school_id,class_name,academic_year,term,fee_head,amount,due_date,is_optional)
SELECT sc.school_id,sc.class_name,'2026-27',term.term,head.fee_head,
       CASE head.fee_head WHEN 'Tuition Fee' THEN 8000+sc.class_name::int*250 ELSE 1500 END,
       CASE term.term WHEN 1 THEN '2026-06-30'::date WHEN 2 THEN '2026-09-30'::date WHEN 3 THEN '2026-12-31'::date ELSE '2027-03-31'::date END,FALSE
FROM school_classes sc CROSS JOIN (VALUES(1),(2),(3),(4)) term(term)
CROSS JOIN (VALUES('Tuition Fee'),('Development Fee')) head(fee_head)
WHERE sc.school_id BETWEEN '10000000-0000-0000-0000-000000000001'::uuid AND '10000000-0000-0000-0000-000000000009'::uuid
 AND sc.academic_year='2026-27' AND sc.class_name IN ('8','9','10')
ON CONFLICT(school_id,class_name,academic_year,term,fee_head) DO NOTHING;

-- One Term 2 invoice per student. Term 1 legacy sample invoices remain intact.
-- Payment-triggered statuses cover Paid and Partial; unpaid invoices are overdue.
INSERT INTO fee_invoices(id,school_id,student_id,academic_year,term,invoice_number,amount_due,amount_paid,status,due_date,notes)
SELECT uuid_generate_v5(uuid_ns_url(),'vidyasetu-demo-invoice:'||st.id::text),st.school_id,st.id,'2026-27',2,
       'DEMO-2627-T2-'||st.student_code,9500+sc.class_name::int*250,0,'OVERDUE','2026-09-30','Synthetic development/staging invoice'
FROM students st JOIN school_classes sc ON sc.id=st.class_id
WHERE st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000015'::uuid
ON CONFLICT(student_id,academic_year,term) DO NOTHING;

WITH ranked AS (
 SELECT fi.*,st.user_id,st.student_code,ROW_NUMBER() OVER(ORDER BY st.student_code)::int AS seq
 FROM fee_invoices fi JOIN students st ON st.id=fi.student_id
 WHERE fi.academic_year='2026-27' AND fi.term=2 AND st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000015'::uuid
),
payments AS (
 SELECT *,CASE WHEN seq%3=1 THEN amount_due WHEN seq%3=2 THEN ROUND(amount_due*0.4,2) ELSE 0 END AS payment_amount
 FROM ranked
)
INSERT INTO fee_payments(id,invoice_id,school_id,student_id,amount,mode,transaction_ref,receipt_number,collected_by,paid_at,notes)
SELECT uuid_generate_v5(uuid_ns_url(),'vidyasetu-demo-payment:'||id::text),id,school_id,student_id,payment_amount,
       CASE WHEN seq%2=0 THEN 'UPI'::payment_mode ELSE 'BANK_TRANSFER'::payment_mode END,
       'DEMO-TXN-'||student_code,'DEMO-RCPT-'||student_code,
       (SELECT admin_user_id FROM schools WHERE schools.id=payments.school_id),
       '2026-09-15'::timestamptz,'Synthetic development/staging payment'
FROM payments WHERE payment_amount>0
ON CONFLICT(id) DO NOTHING;

-- One completed school mathematics assessment per school and scored attempt
-- for every demo learner. Result totals are deterministic and rankings valid.
INSERT INTO exams(id,school_id,created_by,title,title_hi,description,type,status,class_names,subject_codes,total_questions,duration_mins,marks_per_question,negative_marks,start_time,end_time,results_at)
SELECT uuid_generate_v5(uuid_ns_url(),'vidyasetu-demo-exam:'||s.id::text),s.id,s.admin_user_id,
       'Mid-term Mathematics Assessment 2026','मध्यावधि गणित मूल्यांकन 2026','Synthetic demonstration results; not official academic records.',
       'SCHOOL_TEST','COMPLETED',ARRAY['8','9','10'],ARRAY['MATH'],20,45,5,0,
       '2026-09-21 09:00:00+05:30','2026-09-21 09:45:00+05:30','2026-09-22 09:00:00+05:30'
FROM schools s WHERE s.id BETWEEN '10000000-0000-0000-0000-000000000001'::uuid AND '10000000-0000-0000-0000-000000000009'::uuid
ON CONFLICT(id) DO NOTHING;

WITH scores AS (
 SELECT st.id AS student_id,st.school_id,st.user_id,
        uuid_generate_v5(uuid_ns_url(),'vidyasetu-demo-exam:'||st.school_id::text) AS exam_id,
        (55+((ROW_NUMBER() OVER(ORDER BY st.student_code)*7)%46))::numeric(8,2) AS score,
        ROW_NUMBER() OVER(ORDER BY st.student_code)::int AS seq
 FROM students st WHERE st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000015'::uuid
),
ranked AS (
 SELECT *,RANK() OVER(PARTITION BY school_id ORDER BY score DESC)::int AS school_rank,
          RANK() OVER(ORDER BY score DESC)::int AS overall_rank,
          PERCENT_RANK() OVER(ORDER BY score)*100 AS percentile_value
 FROM scores
)
INSERT INTO exam_registrations(exam_id,student_id,school_id,registered_at)
SELECT exam_id,student_id,school_id,'2026-09-10 10:00:00+05:30' FROM ranked
ON CONFLICT(exam_id,student_id) DO NOTHING;

WITH scores AS (
 SELECT st.id AS student_id,st.school_id,
        uuid_generate_v5(uuid_ns_url(),'vidyasetu-demo-exam:'||st.school_id::text) AS exam_id,
        (55+((ROW_NUMBER() OVER(ORDER BY st.student_code)*7)%46))::numeric(8,2) AS score,
        ROW_NUMBER() OVER(ORDER BY st.student_code)::int AS seq
 FROM students st WHERE st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000015'::uuid
),
ranked AS (
 SELECT *,RANK() OVER(PARTITION BY school_id ORDER BY score DESC)::int AS school_rank,
          RANK() OVER(ORDER BY score DESC)::int AS overall_rank,
          PERCENT_RANK() OVER(ORDER BY score)*100 AS percentile_value
 FROM scores
)
INSERT INTO exam_attempts(exam_id,student_id,school_id,status,started_at,submitted_at,time_taken_secs,total_marks,correct_count,wrong_count,skipped_count,percentile,rank_school,rank_overall)
SELECT exam_id,student_id,school_id,'SCORED','2026-09-21 09:00:00+05:30','2026-09-21 09:38:00+05:30',2280,score,
       ROUND(score/5)::smallint,(20-ROUND(score/5)-1)::smallint,1,percentile_value,school_rank,overall_rank
FROM ranked
ON CONFLICT(exam_id,student_id) DO NOTHING;

COMMIT;

-- Post-seed contract: fail loudly if the intended demo scale or links are absent.
DO $$
DECLARE school_count integer; student_count integer; teacher_count integer; parent_count integer;
BEGIN
 SELECT COUNT(*) INTO school_count FROM schools WHERE id BETWEEN '10000000-0000-0000-0000-000000000001'::uuid AND '10000000-0000-0000-0000-000000000009'::uuid;
 SELECT COUNT(*) INTO student_count FROM students WHERE id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000015'::uuid;
 SELECT COUNT(*) INTO teacher_count FROM teachers WHERE id BETWEEN '40000000-0000-0000-0000-000000000001'::uuid AND '40000000-0000-0000-0000-00000000000c'::uuid;
 SELECT COUNT(DISTINCT u.id) INTO parent_count FROM users u WHERE u.id BETWEEN '00000000-0000-0000-0000-000000000040'::uuid AND '00000000-0000-0000-0000-00000000004b'::uuid AND u.role='PARENT';
 IF school_count<>9 OR student_count<>15 OR teacher_count<>12 OR parent_count<>12 THEN
   RAISE EXCEPTION 'Demo seed count contract failed: schools %, students %, teachers %, parents %',school_count,student_count,teacher_count,parent_count;
 END IF;
 IF EXISTS(SELECT 1 FROM students st WHERE st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000015'::uuid AND (st.school_id IS NULL OR st.class_id IS NULL OR NOT EXISTS(SELECT 1 FROM parent_student_links psl WHERE psl.student_id=st.id))) THEN
   RAISE EXCEPTION 'Demo seed relationship contract failed: a student is missing school/class/parent links';
 END IF;
 IF EXISTS(SELECT 1 FROM students st WHERE st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid AND '30000000-0000-0000-0000-000000000015'::uuid AND (NOT EXISTS(SELECT 1 FROM attendance a WHERE a.student_id=st.id) OR NOT EXISTS(SELECT 1 FROM exam_attempts ea WHERE ea.student_id=st.id) OR NOT EXISTS(SELECT 1 FROM fee_invoices fi WHERE fi.student_id=st.id AND fi.academic_year='2026-27'))) THEN
   RAISE EXCEPTION 'Demo seed detail contract failed: a student is missing attendance, assessment, or fees';
 END IF;
END $$;
