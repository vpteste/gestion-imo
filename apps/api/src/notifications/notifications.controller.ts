import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestUser } from "../common/types";
import { NotificationsService } from "./notifications.service";
import type { ListNotificationsQuery } from "./notifications.types";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles("admin", "agent", "proprietaire", "locataire")
  list(@Query() query: ListNotificationsQuery, @CurrentUser() user?: RequestUser) {
    return this.notificationsService.listForUser(user?.id ?? "", query);
  }

  @Patch("read-all")
  @Roles("admin", "agent", "proprietaire", "locataire")
  markAll(@CurrentUser() user?: RequestUser) {
    return this.notificationsService.markAllAsRead(user?.id ?? "");
  }

  @Patch(":id/read")
  @Roles("admin", "agent", "proprietaire", "locataire")
  markOne(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    return this.notificationsService.markAsRead(id, user?.id ?? "");
  }
}
