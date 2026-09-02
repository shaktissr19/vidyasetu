#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'content');
const REQUIRED_STAGES = ['SEE', 'UNDERSTAND', 'DO', 'PRACTISE', 'APPLY', 'REVISE'];

function fail(message) {
  console.error(`CONTENT QA FAILED: ${message}`);
  process.exitCode = 1;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${file}: invalid JSON (${error.message})`);
    return null;
  }
}

function findFiles(dir, name, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(target, name, out);
    else if (entry.name === name) out.push(target);
  }
  return out;
}

const manifests = findFiles(ROOT, 'pack-manifest.json');
if (!manifests.length) fail(`No pack-manifest.json found below ${ROOT}`);

for (const manifestFile of manifests) {
  const dir = path.dirname(manifestFile);
  const manifest = readJson(manifestFile);
  if (!manifest) continue;

  const label = manifest.packId || manifestFile;
  if (!manifest.packId) fail(`${manifestFile}: packId is required`);
  if (manifest.status === 'PUBLISHED') fail(`${label}: repo content packs must not auto-enter PUBLISHED status`);
  if (manifest.sourceCode !== 'VIDYASETU_ORIGINAL') fail(`${label}: pilot pack must use VIDYASETU_ORIGINAL`);
  if (manifest.licence !== 'VIDYASETU_ORIGINAL') fail(`${label}: pilot pack must use VIDYASETU_ORIGINAL licence`);
  if (!Array.isArray(manifest.languages) || !manifest.languages.includes('en') || !manifest.languages.includes('hi')) {
    fail(`${label}: English and Hindi must both be declared`);
  }

  const outcomes = Array.isArray(manifest.learningOutcomes) ? manifest.learningOutcomes : [];
  if (!outcomes.length) fail(`${label}: learningOutcomes are required`);
  for (const outcome of outcomes) {
    if (!String(outcome?.en || '').trim() || !String(outcome?.hi || '').trim()) {
      fail(`${label}: every learning outcome must contain en and hi text`);
    }
  }

  const sequence = Array.isArray(manifest.sequence) ? manifest.sequence : [];
  const stages = new Set(sequence.map((item) => item?.stage));
  for (const stage of REQUIRED_STAGES) {
    if (!stages.has(stage)) fail(`${label}: missing required learning stage ${stage}`);
  }

  for (const requiredFile of ['README.md', 'lesson-content.md', 'media-scripts.md', 'question-bank.json', 'qa-checklist.md', 'references.md']) {
    if (!fs.existsSync(path.join(dir, requiredFile))) fail(`${label}: missing ${requiredFile}`);
  }

  const bank = readJson(path.join(dir, 'question-bank.json'));
  if (!bank) continue;
  if (bank.packId !== manifest.packId) fail(`${label}: question bank packId does not match manifest`);
  if (bank.status === 'PUBLISHED') fail(`${label}: question bank must remain review-gated`);

  const questions = Array.isArray(bank.questions) ? bank.questions : [];
  if (questions.length < 10) fail(`${label}: pilot mastery bank requires at least 10 questions`);

  const codes = new Set();
  for (const q of questions) {
    const code = String(q?.publicCode || '').trim();
    if (!code) fail(`${label}: question missing publicCode`);
    if (codes.has(code)) fail(`${label}: duplicate question publicCode ${code}`);
    codes.add(code);

    for (const field of ['prompt', 'promptHi', 'explanation', 'explanationHi']) {
      if (!String(q?.[field] || '').trim()) fail(`${label}/${code}: ${field} is required`);
    }
    if (!q.correctAnswer || typeof q.correctAnswer !== 'object') fail(`${label}/${code}: correctAnswer is required`);
    if (Number(q.negativeMarks || 0) !== 0) fail(`${label}/${code}: pilot learning questions must not use negative marking`);

    if (['MCQ_SINGLE', 'MCQ_MULTIPLE', 'TRUE_FALSE'].includes(q.type)) {
      if (!Array.isArray(q.options) || q.options.length < 2) fail(`${label}/${code}: objective question requires at least two options`);
      const optionKeys = new Set();
      for (const option of q.options || []) {
        const key = String(option?.key || '').trim();
        if (!key || optionKeys.has(key)) fail(`${label}/${code}: option keys must be non-empty and unique`);
        optionKeys.add(key);
        if (!String(option?.text || '').trim() || !String(option?.textHi || '').trim()) {
          fail(`${label}/${code}: every option needs English and Hindi text`);
        }
      }
      if (q.type === 'MCQ_SINGLE' || q.type === 'TRUE_FALSE') {
        const correct = q.correctAnswer?.option;
        if (!optionKeys.has(correct)) fail(`${label}/${code}: correct option ${correct} does not exist`);
      }
      if (q.type === 'MCQ_MULTIPLE') {
        for (const correct of q.correctAnswer?.options || []) {
          if (!optionKeys.has(correct)) fail(`${label}/${code}: correct option ${correct} does not exist`);
        }
      }
    }

    if (q.type === 'NUMERIC' && typeof q.correctAnswer?.value !== 'number') {
      fail(`${label}/${code}: numeric question requires numeric correctAnswer.value`);
    }
  }

  const referencedQuestions = new Set(
    sequence.flatMap((item) => Array.isArray(item?.questionIds) ? item.questionIds : []),
  );
  for (const code of referencedQuestions) {
    if (!codes.has(code)) fail(`${label}: sequence references unknown question ${code}`);
  }

  if (!process.exitCode) console.log(`CONTENT QA PASSED: ${label} (${questions.length} bilingual questions)`);
}

if (process.exitCode) process.exit(process.exitCode);
