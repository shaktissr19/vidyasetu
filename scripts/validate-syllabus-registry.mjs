#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'content/syllabus');
let failed = false;

function fail(message) {
  failed = true;
  console.error(`SYLLABUS QA FAILED: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${file}: invalid JSON (${error.message})`);
    return null;
  }
}

function walk(dir, targetName, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, targetName, out);
    else if (entry.name === targetName) out.push(p);
  }
  return out;
}

const registries = walk(ROOT, 'registry.json');
if (!registries.length) fail(`No registry.json found under ${ROOT}`);

for (const registryFile of registries) {
  const registry = readJson(registryFile);
  if (!registry) continue;

  const label = registry.registryId || registryFile;
  for (const field of ['registryId', 'academicSession', 'gradeCode', 'stage', 'status']) {
    if (!String(registry[field] || '').trim()) fail(`${label}: ${field} is required`);
  }

  const areas = Array.isArray(registry.curricularAreas) ? registry.curricularAreas : [];
  const areaCodes = new Set(areas.map((x) => x?.code).filter(Boolean));
  const requiredAreas = [
    'LANGUAGE_R1','LANGUAGE_R2','LANGUAGE_R3','MATHEMATICS','SCIENCE','SOCIAL_SCIENCE',
    'ART_EDUCATION','PHYSICAL_EDUCATION_WELLBEING','VOCATIONAL_EDUCATION','CT_AI',
  ];
  for (const code of requiredAreas) {
    if (!areaCodes.has(code)) fail(`${label}: missing curricular area ${code}`);
  }

  const books = Array.isArray(registry.referenceBooks) ? registry.referenceBooks : [];
  const bookCodes = new Set();
  for (const book of books) {
    const code = String(book?.subjectCode || '').trim();
    if (!code) fail(`${label}: reference book missing subjectCode`);
    if (bookCodes.has(code)) fail(`${label}: duplicate reference subjectCode ${code}`);
    bookCodes.add(code);
    if (!String(book?.title || '').trim()) fail(`${label}/${code}: title is required`);
    if (!String(book?.publisher || '').trim()) fail(`${label}/${code}: publisher is required`);
  }

  for (const code of ['MATHEMATICS','SCIENCE','SOCIAL_SCIENCE','ART_EDUCATION','PHYSICAL_EDUCATION_WELLBEING','VOCATIONAL_EDUCATION','CT_AI']) {
    if (!bookCodes.has(code)) fail(`${label}: missing reference structure for ${code}`);
  }

  const topicFile = path.join(path.dirname(registryFile), 'topic-index.json');
  if (!fs.existsSync(topicFile)) {
    fail(`${label}: missing topic-index.json`);
    continue;
  }
  const topics = readJson(topicFile);
  if (!topics) continue;
  if (topics.gradeCode !== registry.gradeCode) fail(`${label}: topic index grade mismatch`);
  if (topics.academicSession !== registry.academicSession) fail(`${label}: topic index session mismatch`);
  if (topics.decompositionOwner !== 'VIDYASETU') fail(`${label}: topic index must identify VIDYASETU as decomposition owner`);

  const seen = new Set();
  for (const subject of topics.subjects || []) {
    for (const chapter of subject.chapters || []) {
      const chapterCode = String(chapter?.code || '').trim();
      if (!chapterCode) fail(`${label}/${subject.subjectCode}: chapter code missing`);
      if (seen.has(chapterCode)) fail(`${label}: duplicate node code ${chapterCode}`);
      seen.add(chapterCode);
      for (const concept of chapter.concepts || []) {
        const conceptCode = String(concept?.code || '').trim();
        if (!conceptCode) fail(`${label}/${chapterCode}: concept code missing`);
        if (!String(concept?.title || '').trim()) fail(`${label}/${chapterCode}/${conceptCode}: title missing`);
        if (seen.has(conceptCode)) fail(`${label}: duplicate node code ${conceptCode}`);
        seen.add(conceptCode);
      }
    }
    for (const key of ['skillStrands','concepts','projectConcepts','strands']) {
      for (const node of subject[key] || []) {
        const code = String(node?.code || '').trim();
        if (!code) fail(`${label}/${subject.subjectCode}/${key}: node code missing`);
        if (!String(node?.title || '').trim()) fail(`${label}/${code}: node title missing`);
        if (seen.has(code)) fail(`${label}: duplicate node code ${code}`);
        seen.add(code);
      }
    }
  }

  if (!failed) console.log(`SYLLABUS QA PASSED: ${label} (${seen.size} stable topic/concept nodes)`);
}

if (failed) process.exit(1);
