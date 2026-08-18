// services/notification.service.js
const axios = require('axios');
const { query } = require('../config/db');
const logger = require('../utils/logger');

async function sendSMS(mobile, message) {
  const provider = process.env.SMS_PROVIDER || 'mock';
  if (provider === 'mock' || process.env.NODE_ENV === 'test') {
    logger.info(`[MOCK SMS] To: ${mobile} | Msg: ${message}`);
    return { success: true };
  }

  if (provider === 'kaleyra') {
    if (!process.env.KALEYRA_API_KEY) throw new Error('KALEYRA_API_KEY is required');
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
    if (!process.env.TWOFACTOR_API_KEY) throw new Error('TWOFACTOR_API_KEY is required');
    const otp = String(message).match(/\b(\d{6})\b/)?.[1];
    if (!otp) throw new Error('A 6-digit OTP is required for the 2Factor OTP provider');
    const res = await axios.post(
      `https://2factor.in/API/V1/${encodeURIComponent(process.env.TWOFACTOR_API_KEY)}/SMS/+91${encodeURIComponent(mobile)}/${encodeURIComponent(otp)}`
    );
    return res.data;
  }

  throw new Error(`Unknown SMS provider: ${provider}`);
}

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
        template: { name: templateName, languageCode: 'en', bodyValues: variables },
      },
      { headers: { Authorization: `Basic ${process.env.INTERAKT_API_KEY}` } }
    );
    return res.data;
  }
  if (provider === 'gupshup') {
    const res = await axios.post(
      'https://api.gupshup.io/sm/api/v1/template/msg',
      new URLSearchParams({
        apikey: process.env.GUPSHUP_API_KEY,
        source: process.env.GUPSHUP_SOURCE || '917834811114',
        destination: `91${mobile}`,
        'src.name': process.env.GUPSHUP_APP_NAME || 'vidyasetu',
        template: JSON.stringify({ id: templateName, params: variables }),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return res.data;
  }
  throw new Error(`Unknown WhatsApp provider: ${provider}`);
}

const notifyAttendanceAbsent = (parentMobile, studentName, date) => sendWhatsApp(parentMobile, 'attendance_absent', [studentName, date]);
const notifyFeeReminder = (parentMobile, studentName, amount, dueDate) => sendWhatsApp(parentMobile, 'fee_reminder', [studentName, `₹${amount}`, dueDate]);
const notifyExamResult = (parentMobile, studentName, examName, score) => sendWhatsApp(parentMobile, 'exam_result', [studentName, examName, score]);
const notifyAnnouncement = (parentMobile, schoolName, message) => sendWhatsApp(parentMobile, 'school_announcement', [schoolName, message]);

async function saveNotification({ userId, schoolId = null, type, channel = 'IN_APP', title, body, refId, refType }) {
  const { rows: [row] } = await query(
    `INSERT INTO notifications
       (user_id, school_id, type, channel, title, body, reference_id, reference_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, sent_at`,
    [userId, schoolId, type, channel, title, body, refId || null, refType || null]
  );
  return row;
}

async function markNotificationRead(notificationId, userId) {
  const { rows: [row] } = await query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_read, read_at`,
    [notificationId, userId]
  );
  return row || null;
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
