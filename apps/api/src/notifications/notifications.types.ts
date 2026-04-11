import type { UserRole } from "@gestion/shared";

export type NotificationType =
  | "rappel_echeance"
  | "quittance"
  | "alerte_impaye"
  | "incident"
  | "etat_des_lieux"
  | "systeme";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  subject: string;
  body: string;
  createdAt: string;
  readAt?: string;
  senderId?: string;
  receiverId: string;
}

export interface ListNotificationsQuery {
  unreadOnly?: string;
  limit?: string;
}

export interface EmitNotificationInput {
  type: NotificationType;
  subject: string;
  body: string;
  senderId?: string;
  receiverId: string;
}

export interface BroadcastNotificationInput {
  type: NotificationType;
  subject: string;
  body: string;
  senderId?: string;
  roles: UserRole[];
}
