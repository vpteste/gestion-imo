import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import type { AuthenticatedRequest } from "../common/types";
import { ActivityLogsService } from "../activity-logs/activity-logs.service";
import { AuthService } from "./auth.service";
import type { ActivateAccountDto, LoginDto, ProvisionUserDto, UpdateUserPasswordDto, UpdateUserRoleDto } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post("activate")
  activate(@Body() body: ActivateAccountDto) {
    return this.authService.activateAccount(body);
  }

  @Get("users")
  @Roles("admin")
  users() {
    return this.authService.listUsers();
  }

  @Post("users/provision")
  @Roles("admin")
  provision(@Body() body: ProvisionUserDto) {
    return this.authService.provisionUser(body);
  }

  @Patch("users/:id/suspend")
  @Roles("admin")
  suspend(@Param("id") id: string) {
    return this.authService.suspendUser(id);
  }

  @Patch("users/:id/reactivate")
  @Roles("admin")
  reactivate(@Param("id") id: string) {
    return this.authService.reactivateUser(id);
  }

  @Patch("users/:id/role")
  @Roles("admin")
  updateRole(@Param("id") id: string, @Body() body: UpdateUserRoleDto) {
    return this.authService.updateUserRole(id, body);
  }

  @Patch("users/:id/password")
  @Roles("admin")
  updatePassword(@Param("id") id: string, @Body() body: UpdateUserPasswordDto) {
    return this.authService.updateUserPassword(id, body);
  }

  @Get("online-agents")
  @Roles("admin")
  onlineAgents() {
    return this.activityLogsService.getOnlineAgents(5);
  }

  @Get("profile")
  @Roles("admin", "agent", "proprietaire", "locataire")
  profile(@Req() req: AuthenticatedRequest) {
    return {
      user: req.user,
    };
  }
}
