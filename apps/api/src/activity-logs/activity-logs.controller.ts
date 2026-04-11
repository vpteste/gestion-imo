import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { ActivityLogsService } from "./activity-logs.service";
import type { ActivityLogFilters } from "./activity-logs.types";

@Controller("activity-logs")
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  @Roles("admin")
  findAll(@Query() query: ActivityLogFilters) {
    const filters: ActivityLogFilters = {
      ...query,
      statusCode: query.statusCode ? Number(query.statusCode) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    };

    return this.activityLogsService.findAll(filters);
  }
}
