import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { UserRole } from "@gestion/shared";
import type { JwtPayload } from "../../auth/auth.types";
import type { AuthenticatedRequest } from "../types";

const ALLOWED_ROLES: UserRole[] = ["admin", "agent", "proprietaire", "locataire"];

@Injectable()
export class HeaderAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = req.headers["authorization"];
    const authHeader = Array.isArray(authorization) ? authorization[0] : authorization;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);

      try {
        const payload = this.jwtService.verify<JwtPayload>(token);
        req.user = {
          id: payload.sub,
          role: payload.role,
          email: payload.email,
          fullName: payload.fullName,
          agency: payload.agency,
        };
        return true;
      } catch {
        // Token invalide: on continue pour permettre le fallback des en-tetes de dev.
      }
    }

    const roleHeader = req.headers["x-user-role"];
    const userIdHeader = req.headers["x-user-id"];
    const userEmailHeader = req.headers["x-user-email"];
    const userFullNameHeader = req.headers["x-user-fullname"];
    const userAgencyHeader = req.headers["x-user-agency"];

    const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;
    const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
    const userEmail = Array.isArray(userEmailHeader) ? userEmailHeader[0] : userEmailHeader;
    const userFullName = Array.isArray(userFullNameHeader) ? userFullNameHeader[0] : userFullNameHeader;
    const userAgency = Array.isArray(userAgencyHeader) ? userAgencyHeader[0] : userAgencyHeader;

    if (role && userId && ALLOWED_ROLES.includes(role as UserRole)) {
      req.user = {
        id: String(userId),
        role: role as UserRole,
        email: userEmail ? String(userEmail) : undefined,
        fullName: userFullName ? String(userFullName) : undefined,
        agency: userAgency ? String(userAgency) : undefined,
      };
    }

    return true;
  }
}
