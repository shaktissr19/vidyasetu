const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCurriculumOutline, parseOfficialSyllabusIndex } = require('../dist/services/syllabusAutoFetch.service');
const { discoverOfficialSyllabusDocuments, extractOfficialSyllabusOutline } = require('../dist/services/syllabusAutoFetch.service');

test('outline parser preserves explicit unit, chapter, topic and page evidence', () => {
  const rows = parseCurriculumOutline([
    { page: 2, lines: ['Unit I: Chemical Substances - Nature and Behaviour', 'Chapter 1: Matter in Our Surroundings', '1.1 Physical Nature of Matter', '• Characteristics of Particles of Matter'] },
    { page: 3, lines: ['Chapter 2: Is Matter Around Us Pure?', '2.1 What is a Mixture?', '• Types of Mixtures'] },
  ]);
  assert.deepEqual(rows.map(row => [row.unit, row.chapter, row.topic, row.pageReference]), [
    ['Unit I · Chemical Substances - Nature and Behaviour', 'Matter in Our Surroundings', 'Physical Nature of Matter', 'Page 2'],
    ['Unit I · Chemical Substances - Nature and Behaviour', 'Matter in Our Surroundings', 'Characteristics of Particles of Matter', 'Page 2'],
    ['Unit I · Chemical Substances - Nature and Behaviour', 'Is Matter Around Us Pure?', 'What is a Mixture?', 'Page 3'],
    ['Unit I · Chemical Substances - Nature and Behaviour', 'Is Matter Around Us Pure?', 'Types of Mixtures', 'Page 3'],
  ]);
  assert.ok(rows.every(row => ['high', 'review'].includes(row.confidence)));
  assert.ok(rows.some(row => row.confidence === 'high'));
  assert.ok(rows.some(row => row.confidence === 'review'));
});

test('outline parser ignores front matter and repeated headings', () => {
  const rows = parseCurriculumOutline([{ page: 1, lines: ['Contents', 'Unit 1: Number Systems', 'Chapter 1: Real Numbers', 'Chapter 1: Real Numbers', '1.1 Euclid’s Division Lemma'] }]);
  assert.equal(rows.filter(row => row.topic === 'Real Numbers').length, 0);
  assert.equal(rows.some(row => row.topic === 'Contents'), false);
  assert.ok(rows.some(row => row.topic === 'Euclid’s Division Lemma'));
});

test('source discovery rejects a board/source mismatch before making a request', async () => {
  await assert.rejects(discoverOfficialSyllabusDocuments({ boardCode: 'CBSE', sourceUrl: 'https://cisce.org/regulations-and-syllabus-icse-2027/' }), /No official-source connector is configured for CBSE/);
  await assert.rejects(discoverOfficialSyllabusDocuments({ boardCode: 'CISCE', sourceUrl: 'https://cbseacademic.nic.in/curriculum_2027.html' }), /No official-source connector is configured for CISCE/);
});

test('PDF extraction rejects non-allowlisted URLs and unsupported board connectors', async () => {
  await assert.rejects(extractOfficialSyllabusOutline('https://example.com/syllabus.pdf', 'CBSE'), /approved official board domains/);
  await assert.rejects(extractOfficialSyllabusOutline('https://cbseacademic.nic.in/syllabus.pdf', 'UNKNOWN'), /No official-source connector is configured/);
});

test('official index parser resolves relative PDF links and infers Roman-numeral class scope', () => {
  const result = parseOfficialSyllabusIndex('https://cbseacademic.nic.in/curriculum_2027.html', [
    '<a href="web_material/CurriculumMain27/Class-X-Science.pdf">Class X Science PDF</a>',
    '<a href="web_material/CurriculumMain27/Class-VIII-Math.pdf">Class VIII Mathematics PDF</a>',
    '<a href="https://example.com/fake.pdf">Class X Science mirror</a>',
  ].join(' '), { boardCode: 'CBSE', classCode: 'CLASS_10', subject: 'Science' });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].classGuess, 'CLASS_10');
  assert.equal(result.documents[0].subjectGuess, 'Science');
  assert.equal(result.documents[0].url, 'https://cbseacademic.nic.in/web_material/CurriculumMain27/Class-X-Science.pdf');
});

test('official index parser uses the nearest board page heading for class scope', () => {
  const html = '<h2>Secondary curriculum (Class IX)</h2><a href="science-9.pdf">Science</a><h2>Secondary curriculum (Class X)</h2><a href="science-10.pdf">Science</a>';
  const ninth = parseOfficialSyllabusIndex('https://cbseacademic.nic.in/curriculum_2027.html', html, { boardCode: 'CBSE', classCode: 'CLASS_9', subject: 'Science' });
  const tenth = parseOfficialSyllabusIndex('https://cbseacademic.nic.in/curriculum_2027.html', html, { boardCode: 'CBSE', classCode: 'CLASS_10', subject: 'Science' });
  assert.equal(ninth.documents.length, 1);
  assert.equal(ninth.documents[0].classGuess, 'CLASS_9');
  assert.equal(tenth.documents.length, 1);
  assert.equal(tenth.documents[0].classGuess, 'CLASS_10');
});

test('official index parser recognizes pre-nursery as a valid grade option', () => {
  const result = parseOfficialSyllabusIndex('https://cbseacademic.nic.in/curriculum_2027.html', '<h2>Pre-Nursery</h2><a href="pre-nursery-english.pdf">English</a>', { boardCode: 'CBSE', classCode: 'PRE_NURSERY' });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].classGuess, 'PRE_NURSERY');
});

test('class-scoped discovery excludes unknown and mismatched PDFs', () => {
  const result = parseOfficialSyllabusIndex('https://cbseacademic.nic.in/curriculum_2027.html', [
    '<a href="web_material/Maths_SecP1IX_2026-27.pdf">Mathematics curriculum</a>',
    '<a href="web_material/general-mathematics.pdf">Mathematics curriculum</a>',
    '<a href="web_material/Class-VIII-Math.pdf">Class VIII Mathematics</a>',
  ].join(' '), { boardCode: 'CBSE', classCode: 'CLASS_8', subject: 'Mathematics' });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].classGuess, 'CLASS_8');
  assert.match(result.documents[0].url, /Class-VIII-Math\.pdf$/);
});
