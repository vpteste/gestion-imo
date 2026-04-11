import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import type { AuthenticatedRequest } from "../common/types";
import { AuthService } from "./auth.service";
import type { ActivateAccountDto, LoginDto, ProvisionUserDto, UpdateUserRoleDto } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post("activate")
  activate(@Body() body: ActivateAccountDto) {
    return this.authService.activateAccount(body);
  }

  @Get("users")
  @Roles("admin", "agent")
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

  @Get("profile")
  @Roles("admin", "agent", "proprietaire", "locataire")
  profile(@Req() req: AuthenticatedRequest) {
    return {
      user: req.user,
    };
  }
}
