import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type {
  BroadcastNotificationInput,
  EmitNotificationInput,
  ListNotificationsQuery,
  NotificationItem,
} from "./notifications.types";

@Injectable()
export class NotificationsService {
  private readonly memoryItems: NotificationItem[] = [];

  constructor(private readonly prisma: PrismaService) {}

  private mapRow(row: {
    id: string;
    type: string;
    subject: string;
    body: string;
    createdAt: Date;
    readAt: Date | null;
    senderId: string | null;
    receiverId: string;
  }): NotificationItem {
    return {
      id: row.id,
      type: row.type as NotificationItem["type"],
      subject: row.subject,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString(),
      senderId: row.senderId ?? undefined,
      receiverId: row.receiverId,
    };
  }

  async listForUser(userId: string, query: ListNotificationsQuery): Promise<NotificationItem[]> {
    const limit = Math.min(Math.max(Number(query.limit ?? 20) || 20, 1), 100);
    const unreadOnly = String(query.unreadOnly ?? "false") === "true";

    try {
      const rows = await this.prisma.notification.findMany({
        where: {
          receiverId: userId,
          readAt: unreadOnly ? null : undefined,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      });

      return rows.map((row) => this.mapRow(row));
    } catch {
      return this.memoryItems
        .filter((item) => item.receiverId === userId)
        .filter((item) => (unreadOnly ? !item.readAt : true))
        .slice(0, limit);
    }
  }

  async markAsRead(notificationId: string, userId: string): Promise<NotificationItem> {
    try {
      const existing = await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          receiverId: userId,
        },
      });

      if (!existing) {
        throw new NotFoundException("Notification introuvable");
      }

      const updated = await this.prisma.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });

      return this.mapRow(updated);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const item = this.memoryItems.find((candidate) => candidate.id === notificationId && candidate.receiverId === userId);
      if (!item) {
        throw new NotFoundException("Notification introuvable");
      }
      item.readAt = new Date().toISOString();
      return item;
    }
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    try {
      const updated = await this.prisma.notification.updateMany({
        where: {
          receiverId: userId,
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });

      return { updated: updated.count };
    } catch {
      let count = 0;
      for (const item of this.memoryItems) {
        if (item.receiverId === userId && !item.readAt) {
          item.readAt = new Date().toISOString();
          count += 1;
        }
      }
      return { updated: count };
    }
  }

  async emit(input: EmitNotificationInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          id: randomUUID(),
          type: input.type,
          subject: input.subject,
          body: input.body,
          senderId: input.senderId,
          receiverId: input.receiverId,
          sentAt: new Date(),
        },
      });
      return;
    } catch {
      this.memoryItems.unshift({
        id: randomUUID(),
        type: input.type,
        subject: input.subject,
        body: input.body,
        senderId: input.senderId,
        receiverId: input.receiverId,
        createdAt: new Date().toISOString(),
      });
    }
  }

  async broadcastToRoles(input: BroadcastNotificationInput): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          role: {
            in: input.roles,
          },
          status: "active",
        },
        select: {
          id: true,
        },
      });

      if (users.length === 0) {
        return;
      }

      await this.prisma.notification.createMany({
        data: users
          .filter((user) => user.id !== input.senderId)
          .map((user) => ({
            id: randomUUID(),
            type: input.type,
            subject: input.subject,
            body: input.body,
            senderId: input.senderId,
            receiverId: user.id,
            sentAt: new Date(),
          })),
      });
      return;
    } catch {
      // fallback minimal si DB indisponible
    }
  }
}
