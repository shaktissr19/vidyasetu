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
  await assert.rejects(discoverOfficialSyllabusDocuments({ boardCode: 'CBSE', sourceUrl: 'https://cisce.org/icse-regulations-and-syllabuses-2027/' }), /No official-source connector is configured for CBSE/);
  await assert.rejects(discoverOfficialSyllabusDocuments({ boardCode: 'CISCE', sourceUrl: 'https://cbseacademic.nic.in/curriculum_2027.html' }), /No official-source connector is configured for CISCE/);
});

test('known CBSE connector coverage gap returns unsupported-scope without fetching', async () => {
  const result = await discoverOfficialSyllabusDocuments({ boardCode: 'CBSE', sourceUrl: 'https://cbseacademic.nic.in/curriculum_2027.html', classCode: 'CLASS_6', subject: 'Science' });
  assert.equal(result.outcome, 'UNSUPPORTED_SCOPE');
  assert.match(result.message, /configured for Classes 9, 10, 11, 12/);
  assert.match(result.message, /No PDFs were fetched/);
});

test('CBSE Skill Education source distinguishes grade-specific Kaushal Bodh PDFs for classes VI to VIII', () => {
  const html = [
    '<h4>Classes VI-VIII</h4>',
    '<p>Skill Education (Kaushal Bodh) <a href="/web_material/Curriculum27/Kaushal_Bodh_6.pdf">VI</a></p>',
    '<p>Skill Education (Kaushal Bodh) <a href="/web_material/Curriculum27/Kaushal_Bodh_7.pdf">VII</a></p>',
    '<p>Skill Education (Kaushal Bodh) <a href="/web_material/Curriculum27/Kaushal_Bodh_8.pdf">VIII</a></p>',
  ].join(' ');
  for (const [grade, digit] of [['CLASS_6', '6'], ['CLASS_7', '7'], ['CLASS_8', '8']]) {
    const result = parseOfficialSyllabusIndex('https://cbseacademic.nic.in/skill-education-curriculum.html', html, { boardCode: 'CBSE', classCode: grade, subject: 'Skill Education' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].classGuess, grade);
    assert.match(result.documents[0].url, new RegExp(`Kaushal_Bodh_${digit}\\.pdf$`));
    assert.match(result.documents[0].title, /Kaushal Bodh/);
  }
});

test('official CISCE and UPMSP class-band gaps are explicit before fetching', async () => {
  const cisce = await discoverOfficialSyllabusDocuments({ boardCode: 'CISCE', sourceUrl: 'https://cisce.org/icse-regulations-and-syllabuses-2027/', classCode: 'CLASS_11' });
  assert.equal(cisce.outcome, 'UNSUPPORTED_SCOPE');
  assert.match(cisce.message, /Classes 9, 10/);
  const isc = await discoverOfficialSyllabusDocuments({ boardCode: 'CISCE', sourceUrl: 'https://cisce.org/isc-regulations-and-syllabuses-2027/', classCode: 'CLASS_10' });
  assert.equal(isc.outcome, 'UNSUPPORTED_SCOPE');
  assert.match(isc.message, /Classes 11, 12/);
  const upmsp = await discoverOfficialSyllabusDocuments({ boardCode: 'UPMSP', sourceUrl: 'https://upmsp.edu.in/Board_Syllabus.aspx', classCode: 'CLASS_8' });
  assert.equal(upmsp.outcome, 'UNSUPPORTED_SCOPE');
  assert.match(upmsp.message, /Classes 9, 10, 11, 12/);
  const nios = await discoverOfficialSyllabusDocuments({ boardCode: 'NIOS', sourceUrl: 'https://rchyderabad.nios.ac.in/secondary-courses-material.html', classCode: 'CLASS_8' });
  assert.equal(nios.outcome, 'UNSUPPORTED_SCOPE');
  assert.match(nios.message, /Classes 9, 10/);
});

test('ISC official index links are scoped to Classes XI and XII', () => {
  const result = parseOfficialSyllabusIndex('https://cisce.org/isc-regulations-and-syllabuses-2027/', '<h2>ISC Class XI</h2><a href="/wp-content/uploads/2025/02/25.-ISC-Computer-Science.doc.pdf">Computer Science</a>', { boardCode: 'CISCE', classCode: 'CLASS_11', subject: 'Computer Science' });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].classGuess, 'CLASS_11');
  assert.equal(result.documents[0].subjectGuess, 'Computer Science');
});

test('NIOS course index accepts approved board hosts and infers subject from course PDF', () => {
  const result = parseOfficialSyllabusIndex('https://rchyderabad.nios.ac.in/secondary-courses-material.html', '<a href="/curriculum/mathematics-211.pdf">Mathematics (211)</a>', { boardCode: 'NIOS', classCode: 'CLASS_10', subject: 'Mathematics' });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].subjectGuess, 'Mathematics');
  assert.equal(result.documents[0].url, 'https://rchyderabad.nios.ac.in/curriculum/mathematics-211.pdf');
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

test('UPMSP generic download links use the linked filename for class and subject', () => {
  const result = parseOfficialSyllabusIndex('https://upmsp.edu.in/Board_Syllabus.aspx', '<a href="/Downloads/Syllabus/Class09/931-Science-Class-9.pdf">डाउनलोड करें</a>', { boardCode: 'UPMSP', classCode: 'CLASS_9', subject: 'Science' });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].classGuess, 'CLASS_9');
  assert.equal(result.documents[0].subjectGuess, 'Science');
  assert.match(result.documents[0].title, /Science-Class-9/);
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

test('a page with no matching PDF reports no-match, not verified syllabus absence', async () => {
  const axios = require('axios');
  const dns = require('dns/promises');
  const originalGet = axios.default.get;
  const originalLookup = dns.lookup;
  axios.default.get = async () => ({ data: '<html><h1>Curriculum</h1><p>No links here</p></html>', headers: { 'content-type': 'text/html' } });
  dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  try {
    const result = await discoverOfficialSyllabusDocuments({ boardCode: 'CBSE', sourceUrl: 'https://cbseacademic.nic.in/unknown-index.html', classCode: 'CLASS_6', subject: 'Science' });
    assert.equal(result.outcome, 'NO_MATCH');
    assert.equal(result.documents.length, 0);
    assert.match(result.message, /No matching syllabus PDF was found/);
    assert.match(result.message, /links may use a format the importer cannot read/);
    assert.doesNotMatch(result.message, /No syllabus is available/);
  } finally {
    axios.default.get = originalGet;
    dns.lookup = originalLookup;
  }
});
