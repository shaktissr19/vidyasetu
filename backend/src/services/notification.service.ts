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
    if (!process.env.KALEYRA_API_KEY) throw smsConfigurationError('Kaleyra SMS delivery is not configured');
    return;
  }

  if (provider === 'twofactor') {
    if (!process.env.TWOFACTOR_API_KEY) throw smsConfigurationError('2Factor SMS delivery is not configured');
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

  if (provider === 'kaleyra') {
    const response = await axios.get<unknown>('https://api.kaleyra.io/v1/messages', {
      params: {
        apikey: process.env.KALEYRA_API_KEY,
        method: 'sms',
        message,
        to: `+91${mobile}`,
        sender: process.env.KALEYRA_SID || 'VSETU',
      },
      timeout: 15000,
    });
    logger.info(`SMS accepted by Kaleyra for ${mobile.slice(0, 2)}******${mobile.slice(-2)}`);
    return response.data;
  }

  if (provider === 'twofactor') {
    const otp = message.match(/\b(\d{6})\b/)?.[1];
    if (!otp) throw new Error('A 6-digit OTP is required for the 2Factor OTP provider');
    const response = await axios.post<unknown>(
      `https://2factor.in/API/V1/${encodeURIComponent(process.env.TWOFACTOR_API_KEY || '')}/SMS/+91${encodeURIComponent(mobile)}/${encodeURIComponent(otp)}`,
      undefined,
      { timeout: 15000 },
    );
    logger.info(`SMS accepted by 2Factor for ${mobile.slice(0, 2)}******${mobile.slice(-2)}`);
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
