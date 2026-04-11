import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@gestion/shared";
import { Roles } from "./common/decorators/roles.decorator";

@Controller()
export class AppController {
  @Get("health")
  getHealth(): HealthResponse {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("admin")
  @Roles("admin")
  adminOnly() {
    return {
      message: "Zone admin accessible",
    };
  }

  @Get("agent-owner")
  @Roles("agent", "proprietaire")
  agentOrOwner() {
    return {
      message: "Zone agent/proprietaire accessible",
    };
  }

  @Get("locataire")
  @Roles("locataire")
  tenantOnly() {
    return {
      message: "Zone locataire accessible",
    };
  }
}
