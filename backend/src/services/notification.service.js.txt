// services/notification.service.js
const axios = require('axios');
const { query } = require('../config/db');
const logger = require('../utils/logger');

// ── SMS ───────────────────────────────────────────────────

async function sendSMS(mobile, message) {
  const provider = process.env.SMS_PROVIDER || 'mock';

  if (provider === 'mock' || process.env.NODE_ENV === 'test') {
    logger.info(`[MOCK SMS] To: ${mobile} | Msg: ${message}`);
    return { success: true };
  }

  if (provider === 'kaleyra') {
    const res = await axios.get('https://api.kaleyra.io/v1/messages', {
      params: {
        apikey: process.env.KALEYRA_API_KEY,
        method: 'sms',
        message,
        to: `+91${mobile}`,
        sender: process.env.KALEYRA_SID || 'VSETU',
      },
    });
    return res.data;
  }

  if (provider === 'twofactor') {
    const res = await axios.get(
      `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/+91${mobile}/AUTOGEN`
    );
    return res.data;
  }

  throw new Error(`Unknown SMS provider: ${provider}`);
}

// ── WhatsApp ──────────────────────────────────────────────

async function sendWhatsApp(mobile, templateName, variables = []) {
  const provider = process.env.WHATSAPP_PROVIDER || 'mock';

  if (provider === 'mock' || process.env.NODE_ENV === 'test') {
    logger.info(`[MOCK WA] To: ${mobile} | Template: ${templateName} | Vars: ${variables.join(', ')}`);
    return { success: true };
  }

  if (provider === 'interakt') {
    const res = await axios.post(
      'https://api.interakt.ai/v1/public/message/',
      {
        countryCode: '+91',
        phoneNumber: mobile,
        callbackData: 'vidyasetu',
        type: 'Template',
        template: {
          name: templateName,
          languageCode: 'en',
          bodyValues: variables,
        },
      },
      { headers: { Authorization: `Basic ${process.env.INTERAKT_API_KEY}` } }
    );
    return res.data;
  }

  if (provider === 'gupshup') {
    const res = await axios.post(
      'https://api.gupshup.io/sm/api/v1/template/msg',
      new URLSearchParams({
        apikey:  process.env.GUPSHUP_API_KEY,
        source:  process.env.GUPSHUP_SOURCE || '917834811114',
        destination: `91${mobile}`,
        'src.name':  process.env.GUPSHUP_APP_NAME || 'vidyasetu',
        template: JSON.stringify({ id: templateName, params: variables }),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return res.data;
  }

  throw new Error(`Unknown WhatsApp provider: ${provider}`);
}

// ── Pre-built notification helpers ────────────────────────

async function notifyAttendanceAbsent(parentMobile, studentName, date) {
  return sendWhatsApp(parentMobile, 'attendance_absent', [studentName, date]);
}

async function notifyFeeReminder(parentMobile, studentName, amount, dueDate) {
  return sendWhatsApp(parentMobile, 'fee_reminder', [studentName, `₹${amount}`, dueDate]);
}

async function notifyExamResult(parentMobile, studentName, examName, score) {
  return sendWhatsApp(parentMobile, 'exam_result', [studentName, examName, score]);
}

async function notifyAnnouncement(parentMobile, schoolName, message) {
  return sendWhatsApp(parentMobile, 'school_announcement', [schoolName, message]);
}

// ── Save notification to DB ────────────────────────────────

async function saveNotification({ userId, type, channel, title, body, data, refId, refType }) {
  const { rows } = await query(
    `INSERT INTO notifications (user_id, type, channel, title, body, reference_id, reference_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [userId, type, channel, title, body, refId || null, refType || null]
  );
  return rows[0];
}

async function markNotificationRead(notificationId, userId) {
  await query(
    `UPDATE notifications SET read_at = NOW(), status = 'READ'
     WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
}

module.exports = {
  sendSMS,
  sendWhatsApp,
  notifyAttendanceAbsent,
  notifyFeeReminder,
  notifyExamResult,
  notifyAnnouncement,
  saveNotification,
  markNotificationRead,
};
