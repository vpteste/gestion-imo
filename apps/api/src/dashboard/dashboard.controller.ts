import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestUser } from "../common/types";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private resolveScope(user?: RequestUser): { ownerId?: string; agentId?: string } | undefined {
    return user?.role === "proprietaire"
      ? { ownerId: user.id }
      : user?.role === "agent"
        ? { agentId: user.id }
        : undefined;
  }

  @Get("summary")
  @Roles("admin", "agent", "proprietaire")
  summary(@CurrentUser() user?: RequestUser) {
    return this.dashboardService.getSummary(this.resolveScope(user));
  }

  @Get("summary/pdf")
  @Roles("admin", "agent", "proprietaire")
  async summaryPdf(@CurrentUser() user: RequestUser | undefined, @Res() res: Response) {
    await this.sendSummaryPdf(user, res);
  }

  @Get("summary-pdf")
  @Roles("admin", "agent", "proprietaire")
  async summaryPdfAlias(@CurrentUser() user: RequestUser | undefined, @Res() res: Response) {
    await this.sendSummaryPdf(user, res);
  }

  private async sendSummaryPdf(user: RequestUser | undefined, res: Response) {
    const fileBuffer = await this.dashboardService.buildSummaryPdf(this.resolveScope(user));
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `bilan-${datePart}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
    res.send(fileBuffer);
  }
}
