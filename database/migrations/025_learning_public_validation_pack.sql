-- ============================================================
-- 025_learning_public_validation_pack.sql
-- Adds a richer set of original public Learning resources for
-- production validation without copying external textbook content.
-- Additive and idempotent; no existing rows are deleted or reset.
-- ============================================================

BEGIN;

WITH resource_seed (
  id, public_slug, title, summary, body_markdown,
  resource_type, category, class_min, class_max,
  subject_code, subject_label, featured, sort_order
) AS (
  VALUES
  ('89500000-0000-0000-0000-000000000001'::uuid,'class-5-fractions-visual-method','Class 5 Mathematics: Fractions Made Clear','A practical guide to equivalent fractions, comparison and simple addition.','## Start with equal parts\nA fraction tells us how many equal parts are being considered. The denominator names the total equal parts and the numerator tells how many are selected.\n\n## Equivalent fractions\nMultiply the numerator and denominator by the same number. 1/2 = 2/4 = 4/8.\n\n## Compare carefully\nWhen denominators match, compare numerators. When they do not, use a common denominator or a visual model.\n\n## Try\nCompare 3/4 and 5/8. Then solve 2/5 + 1/5.','ARTICLE','ACADEMIC',5,5,'MATH','Mathematics',TRUE,40),
  ('89500000-0000-0000-0000-000000000002'::uuid,'class-5-decimals-place-value','Class 5 Mathematics: Decimal Place Value','Understand tenths, hundredths and how decimals connect to fractions and money.','## Decimal place value\nThe first place after the decimal point is tenths; the second is hundredths.\n\n0.4 means four tenths. 0.35 means thirty-five hundredths.\n\n## Connect to fractions\n0.5 = 5/10 = 1/2.\n\n## Try\nWrite 27/100 as a decimal and arrange 0.7, 0.07 and 0.77 from smallest to largest.','ARTICLE','ACADEMIC',5,5,'MATH','Mathematics',FALSE,41),
  ('89500000-0000-0000-0000-000000000003'::uuid,'class-5-plants-food-making','Class 5 Science: How Plants Make Food','A simple explanation of leaves, sunlight, water, air and photosynthesis.','## Plants are producers\nGreen plants make their own food using light energy. Leaves receive sunlight, roots absorb water and leaves take in carbon dioxide from air.\n\n## Why chlorophyll matters\nThe green pigment chlorophyll helps capture light energy.\n\n## Think\nWhy might a plant kept in darkness for many days become weak? Explain using what the plant needs to make food.','ARTICLE','ACADEMIC',5,5,'SCI','Science',TRUE,42),
  ('89500000-0000-0000-0000-000000000004'::uuid,'class-5-reading-main-idea','Class 5 English: Find the Main Idea','Learn how to separate the central idea from supporting details in a short passage.','## Main idea\nThe main idea is what the whole paragraph is mostly about. Supporting details explain, prove or illustrate it.\n\n## A useful check\nIf a sentence is removed, does the paragraph still have the same central meaning? Details can often be removed; the main idea cannot.\n\n## Practice\nAfter reading a paragraph, explain its main idea in one sentence without copying the first line.','ARTICLE','ACADEMIC',5,5,'ENG','English',TRUE,43),
  ('89500000-0000-0000-0000-000000000005'::uuid,'class-5-maths-revision-sheet','Class 5 Mathematics Revision Sheet','A short mixed worksheet covering operations, fractions, decimals and measurement.','## Quick revision\n1. 3,408 + 2,795\n2. 7,200 - 3,864\n3. Find 3/5 of 25\n4. Write 45/100 as a decimal\n5. Convert 2.5 m to centimetres.\n\nCheck each answer and mark the topic you need to revise again.','WORKSHEET','ACADEMIC',5,5,'MATH','Mathematics',FALSE,44),
  ('89500000-0000-0000-0000-000000000006'::uuid,'class-8-linear-equations-method','Class 8 Mathematics: Linear Equations Step by Step','A reliable method for solving one-variable linear equations and checking the answer.','## Keep the equation balanced\nWhatever operation you perform on one side must be performed on the other.\n\nFor 3x + 5 = 26, subtract 5 from both sides, then divide both sides by 3. x = 7.\n\n## Always check\nSubstitute the value back into the original equation. If both sides match, the solution is correct.','ARTICLE','ACADEMIC',8,8,'MATH','Mathematics',TRUE,45),
  ('89500000-0000-0000-0000-000000000007'::uuid,'class-8-force-pressure-basics','Class 8 Science: Force and Pressure','Connect pushes, pulls, area and pressure through everyday examples.','## Force changes motion\nA force is a push or pull. It can start, stop, speed up, slow down or change the direction of an object.\n\n## Pressure depends on area\nThe same force acting over a smaller area creates greater pressure.\n\n## Think\nWhy do sharp knives cut more easily than blunt ones? Explain in terms of area and pressure.','ARTICLE','ACADEMIC',8,8,'SCI','Science',TRUE,46),
  ('89500000-0000-0000-0000-000000000008'::uuid,'class-8-english-active-passive','Class 8 English: Active and Passive Voice','Understand when the doer is central and when the action or receiver is central.','## Active voice\nThe subject performs the action: “The students completed the project.”\n\n## Passive voice\nThe receiver becomes the focus: “The project was completed by the students.”\n\n## Use with purpose\nActive voice is usually clearer. Passive voice is useful when the action or result matters more than the doer.','ARTICLE','ACADEMIC',8,8,'ENG','English',FALSE,47),
  ('89500000-0000-0000-0000-000000000009'::uuid,'class-8-exam-revision-plan','Class 8: Build a 7-Day Revision Plan','Turn a large revision list into short daily targets with practice and review.','## Start with the syllabus\nList the chapters and mark each as strong, improving or weak.\n\n## Mix review and retrieval\nDo not only reread. Close the book and recall key ideas, solve questions and explain concepts aloud.\n\n## End each day\nWrite what improved and what needs another attempt tomorrow.','ARTICLE','STUDY_SKILLS',8,8,NULL,'Study Skills',TRUE,48),
  ('89500000-0000-0000-0000-000000000010'::uuid,'classes-6-12-consistency-small-steps','Consistency: Small Steps That Keep Moving','A practical way to continue studying when motivation changes from day to day.','## Make the next step small\nA study routine survives when the starting action is simple: open the notebook, review one example, answer one question.\n\n## Track effort, not mood\nYou do not need to feel highly motivated before beginning. Regular effort creates momentum.','ARTICLE','MOTIVATION',6,12,NULL,'Motivation',TRUE,49),
  ('89500000-0000-0000-0000-000000000011'::uuid,'classes-6-12-digital-citizenship-basics','Digital Citizenship: Think Before You Share','Simple habits for privacy, respectful communication and responsible online participation.','## Pause before posting\nOnline messages can travel further than expected. Avoid sharing private information, passwords or another person’s photo without permission.\n\n## Verify before forwarding\nAsk where a claim came from and whether the source is trustworthy.\n\n## Be respectful\nThe same standards of honesty and respect apply online and offline.','ARTICLE','DIGITAL_CITIZENSHIP',6,12,NULL,'Digital Citizenship',TRUE,50),
  ('89500000-0000-0000-0000-000000000012'::uuid,'classes-6-12-work-ethic-reliability','Work Ethic: Be Someone Others Can Rely On','What preparation, honesty, punctuality and finishing responsibilities look like in everyday student life.','## Reliability is visible\nArriving prepared, keeping promises and completing agreed work builds trust.\n\n## Ask early when blocked\nResponsibility does not mean hiding a problem. Tell the right person early and ask for help when needed.\n\n## Finish well\nCheck your work before declaring it complete.','ARTICLE','WORK_ETHIC',6,12,NULL,'Work Ethic',TRUE,51),
  ('89500000-0000-0000-0000-000000000013'::uuid,'classes-6-12-social-responsibility-school','Social Responsibility: Improve the Space Around You','Practical ways students can contribute to a safer, kinder and more responsible school community.','## Notice what needs care\nResponsibility begins close to us: shared classrooms, common spaces, classmates and digital groups.\n\n## Small actions count\nInclude others, avoid waste, report unsafe situations and help keep common spaces usable.\n\n## Respect boundaries\nHelping does not mean taking control of someone else’s choices.','ARTICLE','SOCIAL_RESPONSIBILITY',6,12,NULL,'Social Responsibility',TRUE,52),
  ('89500000-0000-0000-0000-000000000014'::uuid,'classes-6-12-wellbeing-study-balance','Well-being: Build a Sustainable Study Day','Plan study, rest, movement and sleep so progress does not depend on exhaustion.','## Sustainable beats extreme\nLong sessions without rest can reduce attention. Use focused blocks with short breaks.\n\n## Protect sleep\nMemory and concentration depend on adequate rest.\n\n## Notice overload\nIf a plan is repeatedly impossible, reduce the load and prioritise the most important tasks.','ARTICLE','WELLBEING',6,12,NULL,'Well-being',TRUE,53),
  ('89500000-0000-0000-0000-000000000015'::uuid,'early-years-colours-around-us','Early Years: Colours Around Us','A simple observation activity for naming and sorting familiar colours.','## Look and name\nFind one red, one blue, one yellow and one green object around you.\n\n## Sort\nPlace safe classroom or home objects into colour groups.\n\n## Talk\nWhich colours do you see outside? Which colours appear on fruits, flowers or clothes?','ARTICLE','ACADEMIC',NULL,NULL,NULL,'Early Learning',TRUE,54),
  ('89500000-0000-0000-0000-000000000016'::uuid,'early-years-shapes-around-us','Early Years: Shapes Around Us','Recognise circles, squares, rectangles and triangles in familiar objects.','## Shape hunt\nA plate may look like a circle, a book like a rectangle and some signs like triangles.\n\n## Describe\nTalk about corners and sides using simple language.\n\n## Create\nDraw or arrange simple shapes to make a house, vehicle or pattern.','ARTICLE','ACADEMIC',NULL,NULL,NULL,'Early Learning',TRUE,55)
)
INSERT INTO learning_resources (
  id, public_slug, title, summary, body_markdown,
  resource_type, category, visibility, review_status, language,
  class_min, class_max, subject_id, subject_label, source_id, licence,
  is_featured_public, sort_order, published_at
)
SELECT
  rs.id, rs.public_slug, rs.title, rs.summary, rs.body_markdown,
  rs.resource_type::learning_resource_type,
  rs.category::learning_category,
  'PUBLIC'::learning_visibility,
  'PUBLISHED'::learning_review_status,
  'en', rs.class_min, rs.class_max, sub.id, rs.subject_label,
  '83000000-0000-0000-0000-000000000001'::uuid,
  'VIDYASETU_ORIGINAL'::learning_license_code,
  rs.featured, rs.sort_order, NOW()
FROM resource_seed rs
LEFT JOIN subjects sub ON sub.code=rs.subject_code
ON CONFLICT (public_slug) DO UPDATE SET
  summary=EXCLUDED.summary,
  body_markdown=EXCLUDED.body_markdown,
  visibility='PUBLIC',
  review_status='PUBLISHED',
  is_featured_public=EXCLUDED.is_featured_public,
  sort_order=EXCLUDED.sort_order;

INSERT INTO learning_resource_boards(resource_id, board_id)
SELECT lr.id, eb.id
FROM learning_resources lr
JOIN education_boards eb ON eb.code='COMMON'
WHERE lr.id::text LIKE '89500000-0000-0000-0000-%'
ON CONFLICT DO NOTHING;

INSERT INTO learning_resource_grades(resource_id, grade_id)
SELECT lr.id, egl.id
FROM learning_resources lr
JOIN education_grade_levels egl
  ON (
    (lr.class_min IS NOT NULL AND lr.class_max IS NOT NULL AND egl.class_number BETWEEN lr.class_min AND lr.class_max)
    OR (lr.public_slug IN ('early-years-colours-around-us','early-years-shapes-around-us') AND egl.code IN ('PRE_NURSERY','NURSERY','LKG','UKG'))
  )
WHERE lr.id::text LIKE '89500000-0000-0000-0000-%'
ON CONFLICT DO NOTHING;

COMMIT;
