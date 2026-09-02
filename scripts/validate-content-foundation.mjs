#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'content');
const standardsDir = path.join(root, 'standards');
let failed = false;

function fail(message) {
  failed = true;
  console.error(`CONTENT FOUNDATION QA FAILED: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${file}: invalid JSON (${error.message})`);
    return null;
  }
}

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, callback);
    else callback(target);
  }
}

for (const required of ['README.md', 'subject-pedagogy-templates.md', 'content-quality-standard.md', 'glossary-en-hi.json', 'coverage-matrix.json']) {
  if (!fs.existsSync(path.join(standardsDir, required))) fail(`missing content/standards/${required}`);
}

const glossary = readJson(path.join(standardsDir, 'glossary-en-hi.json'));
if (glossary) {
  if (!Array.isArray(glossary.terms) || glossary.terms.length < 25) fail('controlled glossary must contain at least 25 seed terms');
  const keys = new Set();
  for (const term of glossary.terms || []) {
    for (const field of ['domain', 'english', 'hindi', 'learnerFriendlyHi']) {
      if (!String(term?.[field] || '').trim()) fail(`glossary term missing ${field}: ${JSON.stringify(term)}`);
    }
    const key = `${String(term.domain).trim().toLowerCase()}::${String(term.english).trim().toLowerCase()}`;
    if (keys.has(key)) fail(`duplicate glossary term ${key}`);
    keys.add(key);
  }
  console.log(`CONTENT FOUNDATION: glossary ${glossary.terms?.length || 0} bilingual terms`);
}

const packIds = new Set();
walk(root, (file) => {
  if (path.basename(file) !== 'pack-manifest.json') return;
  const manifest = readJson(file);
  if (manifest?.packId) packIds.add(manifest.packId);
});

const coverage = readJson(path.join(standardsDir, 'coverage-matrix.json'));
if (coverage) {
  const conceptCodes = new Set();
  let concepts = 0;
  let linkedPacks = 0;
  let bilingualReady = 0;
  const allowedAssetStates = new Set(['NOT_STARTED', 'SCRIPT_READY', 'SPEC_READY', 'READY', 'MEDIA_READY', 'QA_APPROVED', 'PENDING']);
  const allowedAuthoringStates = new Set(['NOT_STARTED', 'PLANNED', 'NEXT', 'AUTHORING', 'DRAFT_READY', 'NEXT_ARCHETYPE', 'PLANNED_ARCHETYPE']);

  for (const grade of coverage.classes || []) {
    if (!String(grade?.gradeCode || '').trim()) fail('coverage grade missing gradeCode');
    for (const subject of grade.subjects || []) {
      if (!String(subject?.subject || '').trim()) fail(`${grade.gradeCode}: subject missing name`);
      for (const unit of subject.units || []) {
        if (!String(unit?.unitCode || '').trim()) fail(`${grade.gradeCode}/${subject.subject}: unit missing unitCode`);
        if (!String(unit?.titleEn || '').trim() || !String(unit?.titleHi || '').trim()) fail(`${unit.unitCode}: bilingual unit title required`);
        for (const concept of unit.concepts || []) {
          concepts += 1;
          if (!String(concept?.conceptCode || '').trim()) fail(`${unit.unitCode}: concept missing conceptCode`);
          if (conceptCodes.has(concept.conceptCode)) fail(`duplicate conceptCode ${concept.conceptCode}`);
          conceptCodes.add(concept.conceptCode);
          if (!String(concept?.titleEn || '').trim() || !String(concept?.titleHi || '').trim()) fail(`${concept.conceptCode}: bilingual title required`);
          if (!allowedAuthoringStates.has(concept.authoringStatus)) fail(`${concept.conceptCode}: invalid authoringStatus ${concept.authoringStatus}`);
          if (concept.packId) {
            linkedPacks += 1;
            if (!packIds.has(concept.packId)) fail(`${concept.conceptCode}: coverage references missing pack ${concept.packId}`);
          }
          const assets = concept.assets || {};
          for (const [name, state] of Object.entries(assets)) {
            if (!allowedAssetStates.has(state)) fail(`${concept.conceptCode}: invalid ${name} state ${state}`);
          }
          if (assets.englishText === 'READY' && assets.hindiText === 'READY') bilingualReady += 1;
          if (concept.authoringStatus === 'DRAFT_READY') {
            for (const mustHave of ['englishText', 'hindiText', 'practiceBank', 'mastery']) {
              if (assets[mustHave] !== 'READY' && assets[mustHave] !== 'QA_APPROVED') {
                fail(`${concept.conceptCode}: DRAFT_READY requires ${mustHave} READY`);
              }
            }
          }
        }
      }
    }
  }
  console.log(`CONTENT FOUNDATION: ${concepts} tracked concepts; ${linkedPacks} linked packs; ${bilingualReady} bilingual-text ready`);
}

if (failed) process.exit(1);
console.log('CONTENT FOUNDATION QA PASSED');
