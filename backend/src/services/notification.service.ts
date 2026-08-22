import axios from 'axios';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import logger = require('../utils/logger');

type TemplateVariable = string | number;
type SmsProvider = 'mock' | 'kaleyra' | 'twofactor';

export interface SmsDeliveryResult {
  provider: SmsProvider;
  accepted: boolean;
  providerStatus?: string | null;
  providerMessageId?: string | null;
}

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

function providerError(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 503 });
}

function maskedMobile(mobile: string): string {
  return mobile.length >= 4 ? `******${mobile.slice(-4)}` : mobile;
}

function normalizeProviderStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function acceptedStatus(value: unknown): boolean {
  const status = normalizeProviderStatus(value);
  return ['success', 'sent', 'accepted', 'ok', 'queued', '200'].includes(status);
}

export async function sendSMS(mobile: string, message: string): Promise<SmsDeliveryResult> {
  const provider = (process.env.SMS_PROVIDER || 'mock') as SmsProvider;

  if (provider === 'mock' || process.env.NODE_ENV === 'test') {
    if (process.env.NODE_ENV === 'production') {
      throw providerError('SMS delivery is not configured on the production server. Please contact VidyaSetu support.');
    }
    logger.info(`[MOCK SMS] To: ${maskedMobile(mobile)} | Msg: ${message}`);
    return { provider: 'mock', accepted: true, providerStatus: 'mock' };
  }

  if (provider === 'kaleyra') {
    const apiKey = process.env.KALEYRA_API_KEY;
    const sender = process.env.KALEYRA_SID;
    if (!apiKey || !sender) {
      throw providerError('Kaleyra SMS is selected but KALEYRA_API_KEY/KALEYRA_SID is not configured.');
    }

    const params: Record<string, string> = {
      api_key: apiKey,
      method: 'sms',
      message,
      to: mobile,
      sender,
      format: 'json',
    };
    if (process.env.KALEYRA_ENTITY_ID) params.entity_id = process.env.KALEYRA_ENTITY_ID;
    if (process.env.KALEYRA_TEMPLATE_ID) params.template_id = process.env.KALEYRA_TEMPLATE_ID;

    const response = await axios.get<unknown>('https://api-alerts.kaleyra.com/v4/', {
      params,
      timeout: 12_000,
    });
    const data = response.data as {
      status?: unknown;
      message?: unknown;
      data?: { sms?: Array<{ id?: unknown; status?: unknown }> };
    };
    const sms = data?.data?.sms?.[0];
    const accepted = acceptedStatus(data?.status) || acceptedStatus(sms?.status);
    if (!accepted) {
      logger.error(`Kaleyra rejected SMS to ${maskedMobile(mobile)}: ${JSON.stringify(data)}`);
      throw providerError(`SMS provider rejected the OTP request${data?.message ? `: ${String(data.message)}` : ''}`);
    }
    return {
      provider: 'kaleyra',
      accepted: true,
      providerStatus: String(sms?.status ?? data?.status ?? 'accepted'),
      providerMessageId: sms?.id ? String(sms.id) : null,
    };
  }

  if (provider === 'twofactor') {
    const apiKey = process.env.TWOFACTOR_API_KEY;
    if (!apiKey) throw providerError('2Factor SMS is selected but TWOFACTOR_API_KEY is not configured.');

    const otp = message.match(/\b(\d{6})\b/)?.[1];
    if (!otp) throw providerError('A 6-digit OTP is required for the 2Factor OTP provider.');

    const templateName = process.env.TWOFACTOR_TEMPLATE_NAME || 'LOGIN_OTP';
    const response = await axios.post<unknown>(
      'https://2factor.in/API/V1/OTP/SEND',
      {
        to: `+91${mobile}`,
        channel: 'SMS',
        template_name: templateName,
        var1: otp,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        timeout: 12_000,
      },
    );

    const data = response.data as {
      status?: unknown;
      Status?: unknown;
      message?: unknown;
      Details?: unknown;
      session_id?: unknown;
      Session_Id?: unknown;
    };
    const status = data?.status ?? data?.Status;
    const accepted = acceptedStatus(status);
    if (!accepted) {
      logger.error(`2Factor rejected SMS to ${maskedMobile(mobile)}: ${JSON.stringify(data)}`);
      throw providerError(`SMS provider rejected the OTP request${data?.message ? `: ${String(data.message)}` : ''}`);
    }

    return {
      provider: 'twofactor',
      accepted: true,
      providerStatus: String(status ?? 'accepted'),
      providerMessageId: data?.session_id
        ? String(data.session_id)
        : data?.Session_Id
          ? String(data.Session_Id)
          : data?.Details
            ? String(data.Details)
            : null,
    };
  }

  throw providerError(`Unknown SMS provider: ${provider}`);
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
