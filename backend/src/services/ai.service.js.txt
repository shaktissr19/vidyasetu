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
- Never give direct answers to exam questions — guide the student to think.
- Be encouraging and patient. Use "Shabash!" or "Great!" to motivate.
- If asked non-academic questions, politely redirect to studies.`;

/**
 * Send a message to VidyaBot and get a response.
 * Maintains conversation history for context.
 */
async function chat(userId, studentId, message, history = []) {
  const provider = process.env.AI_PROVIDER || 'mock';

  if (provider === 'mock' || process.env.NODE_ENV === 'test') {
    return mockResponse(message);
  }

  // Build messages array with history (last 10 turns for context window)
  const recentHistory = history.slice(-10);
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
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 600,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    responseText = res.data.choices[0].message.content;
  } else if (provider === 'gemini') {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
      }
    );
    responseText = res.data.candidates[0].content.parts[0].text;
  } else {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  // Log interaction for quality monitoring
  await logAIInteraction(studentId, message, responseText).catch(() => {});

  return { response: responseText };
}

/**
 * Auto-answer a doubt using AI, mark it as AI-answered.
 */
async function answerDoubt(doubtId, studentId) {
  const { rows: [doubt] } = await query(
    `SELECT d.*, s.name AS subject_name, ch.title AS chapter_title
     FROM doubts d
     LEFT JOIN subjects s ON s.id = d.subject_id
     LEFT JOIN chapters ch ON ch.id = d.chapter_id
     WHERE d.id = $1`,
    [doubtId]
  );
  if (!doubt) throw Object.assign(new Error('Doubt not found'), { statusCode: 404 });

  const prompt = `A student has posted this doubt:
Subject: ${doubt.subject_name || 'General'}
Chapter: ${doubt.chapter_title || 'Not specified'}
Question: ${doubt.title}
Details: ${doubt.body}

Please provide a clear, helpful explanation. Use simple Hindi or English based on the question language.`;

  const { response } = await chat(null, studentId, prompt, []);

  // Save AI answer
  await query(
    `INSERT INTO doubt_answers (doubt_id, answered_by, body, is_ai_answer)
     VALUES ($1, (SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1), $2, TRUE)`,
    [doubtId, response]
  );

  // Update doubt status
  await query(
    `UPDATE doubts SET status = 'ANSWERED', updated_at = NOW() WHERE id = $1`,
    [doubtId]
  );

  return { answer: response };
}

async function logAIInteraction(studentId, question, answer) {
  // Could be stored in a separate ai_interactions table
  // For now just log
  logger.info(`AI interaction — Student: ${studentId} | Q: ${question.substring(0, 60)}`);
}

function mockResponse(message) {
  const responses = {
    default: 'Bilkul! Main samjhata hoon. Yeh concept bahut interesting hai. Step by step chalte hain...',
    maths: 'Math ke liye hum step-by-step approach use karenge. Pehle formula yaad karo, phir example solve karte hain.',
    science: 'Vigyan mein observation bahut important hai. Is concept ko ek example se samjhte hain...',
  };

  const lower = message.toLowerCase();
  if (lower.includes('math') || lower.includes('ganit') || lower.includes('equation')) {
    return { response: responses.maths };
  }
  if (lower.includes('science') || lower.includes('vigyan') || lower.includes('physics')) {
    return { response: responses.science };
  }
  return { response: responses.default };
}

module.exports = { chat, answerDoubt };
