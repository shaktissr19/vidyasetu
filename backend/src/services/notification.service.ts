import axios from 'axios';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import logger = require('../utils/logger');

type TemplateVariable = string | number;

interface NotificationInsertInput {
  userId: UUID;
  schoolId?: UUID | null;
  type: string;
  channel?: string;
  title: string;
  body: string;
  refId?: string | null;
  refType?: string | null;
}

interface NotificationInsertRow extends QueryResultRow {
  id: UUID;
  sent_at: string | Date;
}

interface NotificationReadRow extends QueryResultRow {
  id: UUID;
  is_read: boolean;
  read_at: string | Date | null;
}

function smsProvider(): string {
  return String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
}

function smsConfigurationError(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 503 });
}

function requiredEnv(name: string, label: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw smsConfigurationError(`${label} is not configured`);
  return value;
}

function otpFromMessage(message: string): string {
  const otp = message.match(/\b(\d{6})\b/)?.[1];
  if (!otp) throw new Error('A 6-digit OTP is required for the configured OTP provider');
  return otp;
}

export function assertSmsDeliveryConfigured(): void {
  if (process.env.NODE_ENV === 'test') return;
  const provider = smsProvider();

  if (!provider || provider === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw smsConfigurationError('OTP SMS delivery is not configured. Please contact VidyaSetu support.');
    }
    return;
  }

  if (provider === 'kaleyra') {
    requiredEnv('KALEYRA_API_KEY', 'Kaleyra API key');
    requiredEnv('KALEYRA_ACCOUNT_SID', 'Kaleyra account SID');
    requiredEnv('KALEYRA_SENDER_ID', 'Kaleyra sender ID');
    requiredEnv('KALEYRA_TEMPLATE_ID', 'Kaleyra DLT template ID');
    return;
  }

  if (provider === 'twofactor') {
    requiredEnv('TWOFACTOR_API_KEY', '2Factor API key');
    requiredEnv('TWOFACTOR_TEMPLATE_NAME', '2Factor OTP template name');
    return;
  }

  throw smsConfigurationError(`Unsupported SMS provider: ${provider}`);
}

export async function sendSMS(mobile: string, message: string): Promise<unknown> {
  const provider = smsProvider();

  if (process.env.NODE_ENV === 'test' || (!provider && process.env.NODE_ENV !== 'production') || provider === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw smsConfigurationError('OTP SMS delivery is not configured. Please contact VidyaSetu support.');
    }
    logger.info(`[MOCK SMS] To: ${mobile} | Msg: ${message}`);
    return { success: true, provider: 'mock' };
  }

  assertSmsDeliveryConfigured();
  const maskedMobile = `${mobile.slice(0, 2)}******${mobile.slice(-2)}`;

  if (provider === 'kaleyra') {
    const apiKey = requiredEnv('KALEYRA_API_KEY', 'Kaleyra API key');
    const accountSid = requiredEnv('KALEYRA_ACCOUNT_SID', 'Kaleyra account SID');
    const sender = requiredEnv('KALEYRA_SENDER_ID', 'Kaleyra sender ID');
    const templateId = requiredEnv('KALEYRA_TEMPLATE_ID', 'Kaleyra DLT template ID');
    const domain = String(process.env.KALEYRA_API_DOMAIN || 'api.in.kaleyra.io').trim();

    const response = await axios.post<unknown>(
      `https://${domain}/v1/${encodeURIComponent(accountSid)}/sms`,
      {
        to: `+91${mobile}`,
        sender,
        type: 'OTP',
        prefix: '+91',
        body: message,
        template_id: templateId,
      },
      {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );
    logger.info(`SMS accepted by Kaleyra for ${maskedMobile}`);
    return response.data;
  }

  if (provider === 'twofactor') {
    const apiKey = requiredEnv('TWOFACTOR_API_KEY', '2Factor API key');
    const templateName = requiredEnv('TWOFACTOR_TEMPLATE_NAME', '2Factor OTP template name');
    const otp = otpFromMessage(message);

    const response = await axios.post<unknown>(
      'https://2factor.in/API/V1/OTP/SEND',
      {
        to: `+91${mobile}`,
        template_name: templateName,
        var1: otp,
      },
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );
    logger.info(`SMS accepted by 2Factor for ${maskedMobile}`);
    return response.data;
  }

  throw smsConfigurationError(`Unsupported SMS provider: ${provider}`);
}

export async function sendWhatsApp(
  mobile: string,
  templateName: string,
  variables: TemplateVariable[] = [],
): Promise<unknown> {
  const provider = process.env.WHATSAPP_PROVIDER || 'mock';
  if (provider === 'mock' || process.env.NODE_ENV === 'test') {
    logger.info(`[MOCK WA] To: ${mobile} | Template: ${templateName} | Vars: ${variables.join(', ')}`);
    return { success: true };
  }

  if (provider === 'interakt') {
    const response = await axios.post<unknown>(
      'https://api.interakt.ai/v1/public/message/',
      {
        countryCode: '+91',
        phoneNumber: mobile,
        callbackData: 'vidyasetu',
        type: 'Template',
        template: { name: templateName, languageCode: 'en', bodyValues: variables },
      },
      { headers: { Authorization: `Basic ${process.env.INTERAKT_API_KEY}` } },
    );
    return response.data;
  }

  if (provider === 'gupshup') {
    const response = await axios.post<unknown>(
      'https://api.gupshup.io/sm/api/v1/template/msg',
      new URLSearchParams({
        apikey: process.env.GUPSHUP_API_KEY || '',
        source: process.env.GUPSHUP_SOURCE || '917834811114',
        destination: `91${mobile}`,
        'src.name': process.env.GUPSHUP_APP_NAME || 'vidyasetu',
        template: JSON.stringify({ id: templateName, params: variables }),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return response.data;
  }

  throw new Error(`Unknown WhatsApp provider: ${provider}`);
}

export const notifyAttendanceAbsent = (
  parentMobile: string,
  studentName: string,
  date: string,
): Promise<unknown> => sendWhatsApp(parentMobile, 'attendance_absent', [studentName, date]);

export const notifyFeeReminder = (
  parentMobile: string,
  studentName: string,
  amount: string | number,
  dueDate: string,
): Promise<unknown> => sendWhatsApp(parentMobile, 'fee_reminder', [studentName, `₹${amount}`, dueDate]);

export const notifyExamResult = (
  parentMobile: string,
  studentName: string,
  examName: string,
  score: string | number,
): Promise<unknown> => sendWhatsApp(parentMobile, 'exam_result', [studentName, examName, score]);

export const notifyAnnouncement = (
  parentMobile: string,
  schoolName: string,
  message: string,
): Promise<unknown> => sendWhatsApp(parentMobile, 'school_announcement', [schoolName, message]);

export async function saveNotification({
  userId,
  schoolId = null,
  type,
  channel = 'IN_APP',
  title,
  body,
  refId,
  refType,
}: NotificationInsertInput): Promise<NotificationInsertRow | undefined> {
  const { rows: [row] } = await query<NotificationInsertRow>(
    `INSERT INTO notifications
       (user_id, school_id, type, channel, title, body, reference_id, reference_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, sent_at`,
    [userId, schoolId, type, channel, title, body, refId || null, refType || null],
  );
  return row;
}

export async function markNotificationRead(
  notificationId: UUID,
  userId: UUID,
): Promise<NotificationReadRow | null> {
  const { rows: [row] } = await query<NotificationReadRow>(
    `UPDATE notifications
     SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_read, read_at`,
    [notificationId, userId],
  );
  return row || null;
}
