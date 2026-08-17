// services/ai.service.js
const axios = require('axios');
const { query } = require('../config/db');
const logger = require('../utils/logger');

const SYSTEM_PROMPT = `You are VidyaBot, an AI tutor for Indian school students (Classes 1-12).
You help students understand NCERT curriculum topics in simple language.
Rules:
- Always respond in the same language the student uses (Hindi or English).
- Keep explanations simple, use examples from daily Indian life.
- For Math problems, show step-by-step solutions.
- Never give direct answers to a live exam question; guide the student to think.
- Be encouraging and patient.
- If asked non-academic questions, politely redirect to studies.`;

async function chat(userId, studentId, message, history = []) {
  const provider = process.env.AI_PROVIDER || 'mock';

  if (provider === 'mock' || process.env.NODE_ENV === 'test') {
    return mockResponse(message);
  }

  const recentHistory = (history || []).slice(-10);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...recentHistory,
    { role: 'user', content: message },
  ];

  let responseText;

  if (provider === 'openai') {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        max_tokens: 700,
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    responseText = res.data.choices?.[0]?.message?.content;
  } else if (provider === 'gemini') {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-1.5-flash'}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 700, temperature: 0.6 },
      }
    );
    responseText = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
  } else {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  if (!responseText) throw new Error('AI provider returned an empty response');
  await logAIInteraction(studentId, message, responseText).catch(() => {});
  return { response: responseText };
}

async function answerDoubt(doubtId, studentId) {
  const { rows: [doubt] } = await query(
    `SELECT d.id, d.title, d.body, d.subject_code, d.chapter_id,
            sub.name AS subject_name, ch.title AS chapter_title
     FROM doubts d
     LEFT JOIN subjects sub ON sub.code = d.subject_code
     LEFT JOIN chapters ch ON ch.id = d.chapter_id
     WHERE d.id = $1`,
    [doubtId]
  );
  if (!doubt) throw Object.assign(new Error('Doubt not found'), { statusCode: 404 });

  const prompt = `A student has posted this academic doubt.
Subject: ${doubt.subject_name || doubt.subject_code || 'General'}
Chapter: ${doubt.chapter_title || 'Not specified'}
Question: ${doubt.title}
Details: ${doubt.body}

Explain clearly, step by step, in the same language as the student's question.`;

  const { response } = await chat(null, studentId, prompt, []);

  const { rows: [systemUser] } = await query(
    `SELECT id FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' ORDER BY created_at LIMIT 1`
  );
  if (!systemUser) throw Object.assign(new Error('AI author user is not configured'), { statusCode: 500 });

  const { rows: [existing] } = await query(
    `SELECT id FROM doubt_answers
     WHERE doubt_id = $1 AND is_ai_answer = TRUE
     ORDER BY created_at DESC LIMIT 1`,
    [doubtId]
  );

  let answerId;
  if (existing) {
    await query(
      `UPDATE doubt_answers
       SET body = $1, updated_at = NOW()
       WHERE id = $2`,
      [response, existing.id]
    );
    answerId = existing.id;
  } else {
    const { rows: [answer] } = await query(
      `INSERT INTO doubt_answers (doubt_id, author_id, body, is_ai_answer)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id`,
      [doubtId, systemUser.id, response]
    );
    answerId = answer.id;
  }

  await query(
    `UPDATE doubts SET ai_answered = TRUE, updated_at = NOW() WHERE id = $1`,
    [doubtId]
  );

  return { answerId, answer: response };
}

async function logAIInteraction(studentId, question, answer) {
  logger.info(`AI interaction — Student: ${studentId || 'n/a'} | Q: ${String(question).substring(0, 60)} | A: ${String(answer).substring(0, 60)}`);
}

function mockResponse(message) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('pythagoras')) {
    return { response: 'Bilkul! Right-angle triangle mein Pythagoras theorem kehta hai: hypotenuse² = base² + height². Example: base 3 aur height 4 ho, toh hypotenuse² = 9 + 16 = 25, isliye hypotenuse = 5.' };
  }
  if (lower.includes('quadratic') || lower.includes('equation') || lower.includes('math') || lower.includes('ganit')) {
    return { response: 'Math ko step by step karte hain. Pehle given values likho, phir sahi formula choose karo, values substitute karo, aur last mein answer verify karo. Apna exact question bhejo, main har step samjhaunga.' };
  }
  if (lower.includes('photosynthesis')) {
    return { response: 'Photosynthesis mein green plants sunlight, carbon dioxide aur water ka use karke glucose banate hain aur oxygen release karte hain. Chlorophyll sunlight ki energy capture karta hai. Is process ko hum 3 parts mein samajh sakte hain: water uptake, light energy capture, aur glucose formation.' };
  }
  if (lower.includes('science') || lower.includes('vigyan') || lower.includes('physics') || lower.includes('light')) {
    return { response: 'Science mein concept ko observation aur example se samajhna easiest hota hai. Apna exact topic batao; main definition, real-life example aur important formula teen simple steps mein samjhaunga.' };
  }
  return { response: 'Bilkul! Main is topic ko simple steps mein samjhata hoon. Pehle basic idea, phir example, aur end mein ek quick practice question. Apna subject ya exact question likho.' };
}

module.exports = { chat, answerDoubt };
