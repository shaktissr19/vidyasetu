-- ============================================================
-- 021_learning_original_academic_starter.sql
-- Original public academic examples for VidyaSetu Learning.
-- These are concise VidyaSetu-authored resources, not copied textbook text.
-- Additive/idempotent and cross-board by default.
-- ============================================================

BEGIN;

INSERT INTO learning_resources
  (id, public_slug, title, title_hi, summary, summary_hi, body_markdown,
   resource_type, category, visibility, review_status, language,
   class_min, class_max, subject_id, source_id, licence,
   is_featured_public, sort_order, published_at)
SELECT
  '84100000-0000-0000-0000-000000000001'::uuid,
  'class-8-rational-numbers-quick-guide',
  'Class 8 Mathematics: Rational Numbers — Quick Guide',
  'कक्षा 8 गणित: परिमेय संख्याएँ — त्वरित मार्गदर्शिका',
  'Understand rational numbers, equivalent forms, signs and a simple method for adding fractions.',
  'परिमेय संख्याओं, समतुल्य रूपों, चिन्हों और भिन्नों को जोड़ने की सरल विधि समझें।',
  '## What is a rational number?\nA rational number can be written in the form p/q, where p and q are integers and q is not zero. Numbers such as 3/5, -7/2, 4 and 0 are rational because each can be written as a ratio of integers.\n\n## Equivalent rational numbers\nMultiplying or dividing both numerator and denominator by the same non-zero integer does not change the value. For example, 2/3 = 4/6 = 10/15.\n\n## Signs matter\nA negative sign may be placed with the numerator, denominator or before the fraction. It is usually clearest to keep the denominator positive: -3/5 rather than 3/-5.\n\n## Adding rational numbers\nIf denominators are different, first find a common denominator. Example: 1/3 + 1/4 = 4/12 + 3/12 = 7/12.\n\n## Try it\n1. Write -6 as a rational number with denominator 5.\n2. Find an equivalent rational number for 3/7 with denominator 35.\n3. Calculate 5/6 - 1/4.\n\nCheck your working one step at a time: common denominator, numerator operation, then simplify.',
  'ARTICLE','ACADEMIC','PUBLIC','PUBLISHED','en',8,8,sub.id,
  '83000000-0000-0000-0000-000000000001'::uuid,'VIDYASETU_ORIGINAL',TRUE,20,NOW()
FROM subjects sub
WHERE sub.code='MATH'
ON CONFLICT (public_slug) DO NOTHING;

INSERT INTO learning_resources
  (id, public_slug, title, title_hi, summary, summary_hi, body_markdown,
   resource_type, category, visibility, review_status, language,
   class_min, class_max, subject_id, source_id, licence,
   is_featured_public, sort_order, published_at)
SELECT
  '84100000-0000-0000-0000-000000000002'::uuid,
  'class-8-crop-production-concepts',
  'Class 8 Science: Crop Production — Core Concepts',
  'कक्षा 8 विज्ञान: फसल उत्पादन — मुख्य अवधारणाएँ',
  'A concise original lesson on the main stages from preparing soil to storage and why each stage matters.',
  'मिट्टी की तैयारी से भंडारण तक फसल उत्पादन के मुख्य चरणों की संक्षिप्त मूल पाठ सामग्री।',
  '## Farming is a sequence of decisions\nCrop production is not one activity. It is a chain of connected steps, and a problem at one stage can affect the final yield.\n\n## Preparing the soil\nLoose, well-prepared soil helps roots grow and improves movement of air and water. Farmers may plough or till the field and add organic matter depending on soil and crop needs.\n\n## Choosing and sowing seed\nHealthy seed, suitable spacing and correct sowing depth improve the chance of strong germination. Different crops need different seasons and conditions.\n\n## Water and nutrients\nPlants need water and mineral nutrients, but more is not always better. Irrigation timing and nutrient management should match the crop, soil and weather.\n\n## Protecting the crop\nWeeds compete for light, water and nutrients. Pests and diseases can also reduce yield. Prevention, observation and appropriate control are part of good crop management.\n\n## Harvest and storage\nMature crops are harvested and then protected from excess moisture, insects, rodents and contamination during storage.\n\n## Think\nWhy might over-watering harm some crops? Why is dry storage important for grains? Explain each answer using cause and effect.',
  'ARTICLE','ACADEMIC','PUBLIC','PUBLISHED','en',8,8,sub.id,
  '83000000-0000-0000-0000-000000000001'::uuid,'VIDYASETU_ORIGINAL',TRUE,21,NOW()
FROM subjects sub
WHERE sub.code='SCI'
ON CONFLICT (public_slug) DO NOTHING;

INSERT INTO learning_resources
  (id, public_slug, title, title_hi, summary, body_markdown,
   resource_type, category, visibility, review_status, language,
   class_min, class_max, subject_id, source_id, licence,
   is_featured_public, sort_order, published_at)
SELECT
  '84100000-0000-0000-0000-000000000003'::uuid,
  'class-8-reading-comprehension-evidence',
  'Class 8 English: Answer with Evidence from the Passage',
  'कक्षा 8 अंग्रेज़ी: अनुच्छेद से प्रमाण के साथ उत्तर दें',
  'A practical reading-comprehension method for finding the exact line or idea that supports an answer.',
  '## Read the question first\nBefore searching the passage, identify what the question is asking: a fact, a reason, a meaning, an inference or the writer’s viewpoint.\n\n## Locate the relevant part\nScan for names, key words or ideas connected to the question. Do not choose an answer only because it sounds generally sensible.\n\n## Separate fact from inference\nA factual answer is stated directly. An inference is not stated word-for-word, but it must still be supported by details in the passage.\n\n## Use evidence\nA strong short answer often has two parts: the answer itself and the detail that proves it. Example structure: “The character was worried because the passage says that she checked the clock repeatedly and could not concentrate.”\n\n## Avoid copying too much\nUse your own sentence unless the question asks you to quote. Keep only the details needed to prove the answer.\n\n## Practice\nAfter answering any comprehension question, point to the exact sentence or clue that supports your response. If you cannot find evidence, review your answer.',
  'ARTICLE','ACADEMIC','PUBLIC','PUBLISHED','en',8,8,sub.id,
  '83000000-0000-0000-0000-000000000001'::uuid,'VIDYASETU_ORIGINAL',FALSE,22,NOW()
FROM subjects sub
WHERE sub.code='ENG'
ON CONFLICT (public_slug) DO NOTHING;

INSERT INTO learning_resources
  (id, public_slug, title, title_hi, summary, body_markdown,
   resource_type, category, visibility, review_status, language,
   class_min, class_max, subject_id, source_id, licence,
   is_featured_public, sort_order, published_at)
SELECT
  '84100000-0000-0000-0000-000000000004'::uuid,
  'class-8-mathematics-practice-paper-set-1',
  'Class 8 Mathematics Practice Paper — Set 1',
  'कक्षा 8 गणित अभ्यास प्रश्नपत्र — सेट 1',
  'A short VidyaSetu-original cross-board practice paper covering rational numbers, equations, geometry and data handling.',
  '## Instructions\nAttempt all questions without looking at notes. Show working for numerical questions. Suggested time: 35 minutes.\n\n## Section A — Quick response\n1. Write 0.75 as a rational number in simplest form.\n2. Solve: 3x + 5 = 26.\n3. The sum of the interior angles of a quadrilateral is ____ degrees.\n4. Find the mean of 8, 11, 14 and 15.\n\n## Section B — Working required\n5. Calculate 7/8 - 5/12 and simplify your answer.\n6. The perimeter of a rectangle is 54 cm. Its length is 16 cm. Find its breadth.\n7. A shop records the number of notebooks sold on five days as 24, 30, 18, 36 and 27. Find the mean number sold.\n\n## Section C — Reasoning\n8. A student says that -2/3 is greater than -1/3 because 2 is greater than 1. Explain the error.\n9. Two angles of a quadrilateral are 95° and 80°. The other two are equal. Find each of the equal angles.\n10. Create a linear equation whose solution is x = 6 and explain how you checked it.\n\n## Self-check\nAfter finishing, mark questions you were unsure about. Review the concept first, then retry those questions without copying a solution.',
  'QUESTION_PAPER','ACADEMIC','PUBLIC','PUBLISHED','en',8,8,sub.id,
  '83000000-0000-0000-0000-000000000001'::uuid,'VIDYASETU_ORIGINAL',TRUE,23,NOW()
FROM subjects sub
WHERE sub.code='MATH'
ON CONFLICT (public_slug) DO NOTHING;

INSERT INTO learning_resource_boards (resource_id, board_id)
SELECT lr.id, eb.id
FROM learning_resources lr
JOIN education_boards eb ON eb.code='COMMON'
WHERE lr.public_slug IN (
  'class-8-rational-numbers-quick-guide',
  'class-8-crop-production-concepts',
  'class-8-reading-comprehension-evidence',
  'class-8-mathematics-practice-paper-set-1'
)
ON CONFLICT DO NOTHING;

COMMIT;
