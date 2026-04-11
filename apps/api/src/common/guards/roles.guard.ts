import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@gestion/shared";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedRequest } from "../types";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!req.user) {
      throw new UnauthorizedException("Authentification requise");
    }

    if (!requiredRoles.includes(req.user.role)) {
      throw new ForbiddenException("Acces refuse pour ce role");
    }

    return true;
  }
}
