import type { SmspvaCountry } from "@/lib/smspva";
import { formatSmspvaPhone } from "@/lib/smspva";

export type SmsPvaOrderRow = {
  id: string;
  smspva_order_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  country: SmspvaCountry;
  service: string;
  service_name: string;
  phone_number: string | null;
  sms_code: string | null;
  sms_text: string | null;
  status: "waiting" | "received" | "expired" | "cancelled" | "failed";
  error_message: string | null;
  created_at: string;
  code_received_at: string | null;
  completed_at: string | null;
  expires_at: string;
};

export type SmsPvaOrder = {
  id: string;
  smspvaOrderId: string;
  userId: string;
  userName: string;
  userEmail: string;
  country: SmspvaCountry;
  service: string;
  serviceName: string;
  phoneNumber: string | null;
  rawNumber: string | null;
  smsCode: string | null;
  smsText: string | null;
  status: SmsPvaOrderRow["status"];
  errorMessage: string | null;
  createdAt: string;
  codeReceivedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
};

export function mapSmsPvaOrder(row: SmsPvaOrderRow): SmsPvaOrder {
  return {
    id: row.id,
    smspvaOrderId: row.smspva_order_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    country: row.country,
    service: row.service,
    serviceName: row.service_name,
    phoneNumber: row.phone_number
      ? formatSmspvaPhone(row.country, row.phone_number)
      : null,
    rawNumber: row.phone_number,
    smsCode: row.sms_code,
    smsText: row.sms_text,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    codeReceivedAt: row.code_received_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  };
}
