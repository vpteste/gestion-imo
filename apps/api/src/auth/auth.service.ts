import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import nodemailer from "nodemailer";
import type { UserRole } from "@gestion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ActivateAccountDto,
  AccountStatus,
  IdentityLinks,
  JwtPayload,
  LoginDto,
  ProvisionUserDto,
  UpdateUserPasswordDto,
  UpdateUserRoleDto,
} from "./auth.types";

interface DemoUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  status: AccountStatus;
  identityLinks?: IdentityLinks;
  activationToken?: string;
  activationTokenExpiresAt?: string;
}

const DEMO_USERS: DemoUser[] = [];

const AUTH_STORAGE_DIR = join(process.cwd(), "storage");
const AUTH_STORAGE_FILE = join(AUTH_STORAGE_DIR, "auth-users.json");

function hashPassword(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeAgencyLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();
}

function sanitizeLegacyIdentityLinks(users: DemoUser[]): boolean {
  let changed = false;

  for (const user of users) {
    if (user.role !== "locataire" || !user.identityLinks) {
      continue;
    }

    if (user.identityLinks.leaseId === "lease-001") {
      delete user.identityLinks.leaseId;
      changed = true;
    }
  }

  return changed;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

@Injectable()
export class AuthService {
  private readonly users: DemoUser[] = [...DEMO_USERS];
  private usersLoaded = false;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private verifyPassword(storedPasswordHash: string, providedPassword: string): {
    valid: boolean;
    shouldMigrateToHash: boolean;
  } {
    const hashed = hashPassword(providedPassword);
    if (storedPasswordHash === hashed) {
      return { valid: true, shouldMigrateToHash: false };
    }

    // Compatibilite seed legacy en clair (passwordHash = mot de passe)
    if (storedPasswordHash === providedPassword) {
      return { valid: true, shouldMigrateToHash: true };
    }

    return { valid: false, shouldMigrateToHash: false };
  }

  private parseIdentityLinks(raw: unknown): IdentityLinks | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return undefined;
    }

    const value = raw as Record<string, unknown>;
    const propertyId = typeof value.propertyId === "string" ? value.propertyId : undefined;
    const leaseId = typeof value.leaseId === "string" ? value.leaseId : undefined;
    const agency = typeof value.agency === "string" ? value.agency : undefined;
    const agentCode = typeof value.agentCode === "string" ? value.agentCode : undefined;
    const propertyIds = Array.isArray(value.propertyIds)
      ? value.propertyIds.filter((item): item is string => typeof item === "string")
      : undefined;

    return {
      propertyId,
      leaseId,
      agency,
      agentCode,
      propertyIds,
    };
  }

  private buildAgentCode(fullName: string): string {
    const initials = fullName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 3)
      .padEnd(2, "X");
    const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const rand = Math.floor(100 + Math.random() * 900);
    return `AGT-${initials}-${stamp}-${rand}`;
  }

  private normalizeIdentityLinks(role: UserRole, identityLinks: IdentityLinks | undefined, fullName: string): IdentityLinks | undefined {
    if (role === "agent") {
      const agencySource = identityLinks?.agency?.trim() || `AGENCE-${fullName}`;
      const agency = normalizeAgencyLabel(agencySource);
      const agentCode = identityLinks?.agentCode?.trim() || this.buildAgentCode(fullName);

      return {
        agency,
        agentCode,
      };
    }

    if (role === "proprietaire") {
      const propertyIds = identityLinks?.propertyIds
        ?.map((item) => item.trim())
        .filter(Boolean);

      return {
        propertyIds: propertyIds && propertyIds.length > 0 ? [...new Set(propertyIds)] : undefined,
      };
    }

    if (role === "locataire") {
      return {
        propertyId: identityLinks?.propertyId,
        leaseId: identityLinks?.leaseId,
      };
    }

    return undefined;
  }

  private async ensureUsersLoaded(): Promise<void> {
    if (this.usersLoaded) {
      return;
    }

    try {
      await fs.mkdir(AUTH_STORAGE_DIR, { recursive: true });
      const raw = await fs.readFile(AUTH_STORAGE_FILE, "utf8");
      const parsed = JSON.parse(raw) as DemoUser[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const hasLegacyValues = sanitizeLegacyIdentityLinks(parsed);
        this.users.splice(0, this.users.length, ...parsed);
        if (hasLegacyValues) {
          await this.persistUsers();
        }
      } else {
        await this.persistUsers();
      }
    } catch {
      await this.persistUsers();
    }

    this.usersLoaded = true;
  }

  private async persistUsers(): Promise<void> {
    await fs.mkdir(AUTH_STORAGE_DIR, { recursive: true });
    await fs.writeFile(AUTH_STORAGE_FILE, JSON.stringify(this.users, null, 2), "utf8");
  }

  private toPublicUser(user: DemoUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      identityLinks: user.identityLinks,
    };
  }

  private validateIdentityLinks(role: UserRole, identityLinks?: IdentityLinks) {
    if (role === "locataire" && !identityLinks?.leaseId && !identityLinks?.propertyId) {
      throw new BadRequestException("Un locataire doit etre lie a un bail ou un bien");
    }

    if (role === "proprietaire" && (!identityLinks?.propertyIds || identityLinks.propertyIds.length === 0)) {
      throw new BadRequestException("Un proprietaire doit etre lie a au moins un bien");
    }

    if (role === "agent" && (!identityLinks?.agency || !identityLinks?.agentCode)) {
      throw new BadRequestException("Un agent doit etre lie a une agence avec un identifiant agent");
    }
  }

  private async sendActivationEmail(user: {
    email: string;
    fullName: string;
    activationToken: string;
    activationTokenExpiresAt: string;
  }): Promise<string> {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      throw new BadRequestException("SMTP_HOST manquant: configuration email requise");
    }

    const port = Number(process.env.SMTP_PORT ?? "587");
    const secure = parseBooleanFlag(process.env.SMTP_SECURE, port === 465);
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS ?? "";
    const from = process.env.SMTP_FROM?.trim() || smtpUser || "noreply@gestion.local";

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    });

    const info = await transporter.sendMail({
      from,
      to: user.email,
      subject: "Activation de votre compte",
      text: `Bonjour ${user.fullName},\n\nVotre compte a ete provisionne. Utilisez ce token d'activation: ${user.activationToken}\n\nCe token expire le ${user.activationTokenExpiresAt}.`,
    });

    return info.messageId ?? "sent";
  }

  async login(dto: LoginDto) {
    await this.ensureUsersLoaded();
    const normalizedEmail = normalizeEmail(dto.email);

    try {
      const dbUser = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: "insensitive" },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          passwordHash: true,
          status: true,
          identityLinks: true,
        },
      });

      if (!dbUser) {
        throw new UnauthorizedException("Identifiants invalides");
      }

      if (dbUser.status === "pending") {
        throw new UnauthorizedException("Compte en attente d'activation");
      }

      if (dbUser.status === "suspended") {
        throw new UnauthorizedException("Compte suspendu");
      }

      if (dbUser.role !== "admin" && dbUser.role !== "agent") {
        throw new UnauthorizedException("Acces interface reserve aux admins et agences");
      }

      const passwordCheck = this.verifyPassword(dbUser.passwordHash, dto.password);
      if (!passwordCheck.valid) {
        throw new UnauthorizedException("Identifiants invalides");
      }

      if (passwordCheck.shouldMigrateToHash) {
        await this.prisma.user.update({
          where: { id: dbUser.id },
          data: { passwordHash: hashPassword(dto.password) },
        });
      }

      const identityLinks = this.parseIdentityLinks(dbUser.identityLinks);
      const payload: JwtPayload = {
        sub: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: dbUser.role,
        agency: identityLinks?.agency,
      };

      return {
        accessToken: this.jwtService.sign(payload),
        user: {
          id: dbUser.id,
          email: dbUser.email,
          fullName: dbUser.fullName,
          role: dbUser.role,
          agency: identityLinks?.agency,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
    }

    const user = this.users.find((candidate) => normalizeEmail(candidate.email) === normalizedEmail);
    if (!user) {
      throw new UnauthorizedException("Identifiants invalides");
    }

    const passwordCheck = this.verifyPassword(user.passwordHash, dto.password);
    if (!passwordCheck.valid) {
      throw new UnauthorizedException("Identifiants invalides");
    }

    if (passwordCheck.shouldMigrateToHash) {
      user.passwordHash = hashPassword(dto.password);
      await this.persistUsers();
    }

    if (user.status === "pending") {
      throw new UnauthorizedException("Compte en attente d'activation");
    }

    if (user.status === "suspended") {
      throw new UnauthorizedException("Compte suspendu");
    }

    if (user.role !== "admin" && user.role !== "agent") {
      throw new UnauthorizedException("Acces interface reserve aux admins et agences");
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      agency: user.identityLinks?.agency,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        agency: user.identityLinks?.agency,
      },
    };
  }

  async provisionUser(dto: ProvisionUserDto) {
    await this.ensureUsersLoaded();

    if (dto.role === "locataire") {
      throw new BadRequestException("Les comptes locataires se gerent dans le module Locataires");
    }

    const normalizedEmail = normalizeEmail(dto.email);
    if (!normalizedEmail) {
      throw new BadRequestException("Email obligatoire");
    }
    if (!isValidEmail(normalizedEmail)) {
      throw new BadRequestException("Email invalide");
    }

    const normalizedIdentityLinks = this.normalizeIdentityLinks(dto.role, dto.identityLinks, dto.fullName);
    this.validateIdentityLinks(dto.role, normalizedIdentityLinks);

    const initialPassword = typeof dto.initialPassword === "string" && dto.initialPassword.length > 0
      ? dto.initialPassword
      : undefined;
    if (initialPassword && initialPassword.length < 8) {
      throw new BadRequestException("Le mot de passe initial doit contenir au moins 8 caracteres");
    }

    const initialStatus: AccountStatus = initialPassword ? "active" : "pending";

    const activationToken = randomBytes(24).toString("hex");
    const activationTokenExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    try {
      const existingDbUser = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (existingDbUser) {
        throw new BadRequestException("Un compte avec cet email existe deja");
      }

      const createdDbUser = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          email: normalizedEmail,
          passwordHash: initialPassword ? hashPassword(initialPassword) : "",
          fullName: dto.fullName.trim(),
          role: dto.role,
          status: initialStatus,
          identityLinks: normalizedIdentityLinks as unknown as object,
          activationToken: initialPassword ? null : activationToken,
          activationTokenExpiresAt: initialPassword ? null : new Date(activationTokenExpiresAt),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          identityLinks: true,
        },
      });

      let emailDispatchId: string | undefined;
      let emailError: string | undefined;
      if (!initialPassword) {
        try {
          emailDispatchId = await this.sendActivationEmail({
            email: createdDbUser.email,
            fullName: createdDbUser.fullName,
            activationToken,
            activationTokenExpiresAt,
          });
        } catch (emailErr) {
          emailError = emailErr instanceof Error ? emailErr.message : "Erreur envoi email";
        }
      }

      return {
        user: {
          id: createdDbUser.id,
          email: createdDbUser.email,
          fullName: createdDbUser.fullName,
          role: createdDbUser.role,
          status: createdDbUser.status as AccountStatus,
          identityLinks: this.parseIdentityLinks(createdDbUser.identityLinks),
        },
        activation: {
          expiresAt: initialPassword ? undefined : activationTokenExpiresAt,
          token: initialPassword ? undefined : activationToken,
          emailPreview: emailDispatchId,
          emailError,
          mode: initialPassword ? "password" : "token",
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
    }

    const existing = this.users.find((candidate) => normalizeEmail(candidate.email) === normalizedEmail);
    if (existing) {
      throw new BadRequestException("Un compte avec cet email existe deja");
    }

    const created: DemoUser = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash: initialPassword ? hashPassword(initialPassword) : "",
      fullName: dto.fullName.trim(),
      role: dto.role,
      status: initialStatus,
      identityLinks: normalizedIdentityLinks,
      activationToken: initialPassword ? undefined : activationToken,
      activationTokenExpiresAt: initialPassword ? undefined : activationTokenExpiresAt,
    };

    this.users.push(created);
    await this.persistUsers();

    let emailDispatchId: string | undefined;
    let emailError: string | undefined;
    if (!initialPassword) {
      try {
        emailDispatchId = await this.sendActivationEmail({
          email: created.email,
          fullName: created.fullName,
          activationToken,
          activationTokenExpiresAt,
        });
      } catch (emailErr) {
        emailError = emailErr instanceof Error ? emailErr.message : "Erreur envoi email";
      }
    }

    return {
      user: this.toPublicUser(created),
      activation: {
        expiresAt: initialPassword ? undefined : created.activationTokenExpiresAt,
        token: initialPassword ? undefined : activationToken,
        emailPreview: emailDispatchId,
        emailError,
        mode: initialPassword ? "password" : "token",
      },
    };
  }

  async activateAccount(dto: ActivateAccountDto) {
    await this.ensureUsersLoaded();

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException("Le mot de passe doit contenir au moins 8 caracteres");
    }

    try {
      const dbUser = await this.prisma.user.findFirst({
        where: { activationToken: dto.token },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          identityLinks: true,
          activationTokenExpiresAt: true,
        },
      });

      if (!dbUser) {
        throw new BadRequestException("Token d'activation invalide");
      }

      if (dbUser.status !== "pending") {
        throw new BadRequestException("Le compte n'est pas en attente d'activation");
      }

      if (!dbUser.activationTokenExpiresAt || dbUser.activationTokenExpiresAt.getTime() < Date.now()) {
        throw new BadRequestException("Token d'activation expire");
      }

      const updated = await this.prisma.user.update({
        where: { id: dbUser.id },
        data: {
          passwordHash: hashPassword(dto.password),
          status: "active",
          activationToken: null,
          activationTokenExpiresAt: null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          identityLinks: true,
        },
      });

      return {
        message: "Compte active avec succes",
        user: {
          id: updated.id,
          email: updated.email,
          fullName: updated.fullName,
          role: updated.role,
          status: updated.status as AccountStatus,
          identityLinks: this.parseIdentityLinks(updated.identityLinks),
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
    }

    const user = this.users.find((candidate) => candidate.activationToken === dto.token);
    if (!user) {
      throw new BadRequestException("Token d'activation invalide");
    }

    if (user.status !== "pending") {
      throw new BadRequestException("Le compte n'est pas en attente d'activation");
    }

    if (!user.activationTokenExpiresAt || new Date(user.activationTokenExpiresAt).getTime() < Date.now()) {
      throw new BadRequestException("Token d'activation expire");
    }

    user.passwordHash = hashPassword(dto.password);
    user.status = "active";
    user.activationToken = undefined;
    user.activationTokenExpiresAt = undefined;
    await this.persistUsers();

    return {
      message: "Compte active avec succes",
      user: this.toPublicUser(user),
    };
  }

  async listUsers() {
    await this.ensureUsersLoaded();

    try {
      const dbUsers = await this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          identityLinks: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return dbUsers.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status as AccountStatus,
        identityLinks: this.parseIdentityLinks(user.identityLinks),
      }));
    } catch {
      // fallback local
    }

    return this.users.map((user) => this.toPublicUser(user));
  }

  async suspendUser(userId: string) {
    await this.ensureUsersLoaded();

    try {
      const existing = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException("Utilisateur introuvable");
      }

      const suspended = await this.prisma.user.update({
        where: { id: userId },
        data: { status: "suspended" },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          identityLinks: true,
        },
      });

      return {
        id: suspended.id,
        email: suspended.email,
        fullName: suspended.fullName,
        role: suspended.role,
        status: suspended.status as AccountStatus,
        identityLinks: this.parseIdentityLinks(suspended.identityLinks),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
    }

    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException("Utilisateur introuvable");
    }

    user.status = "suspended";
    await this.persistUsers();
    return this.toPublicUser(user);
  }

  async reactivateUser(userId: string) {
    await this.ensureUsersLoaded();

    try {
      const existing = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException("Utilisateur introuvable");
      }

      const activated = await this.prisma.user.update({
        where: { id: userId },
        data: { status: "active" },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          identityLinks: true,
        },
      });

      return {
        id: activated.id,
        email: activated.email,
        fullName: activated.fullName,
        role: activated.role,
        status: activated.status as AccountStatus,
        identityLinks: this.parseIdentityLinks(activated.identityLinks),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
    }

    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException("Utilisateur introuvable");
    }

    user.status = "active";
    await this.persistUsers();
    return this.toPublicUser(user);
  }

  async updateUserRole(userId: string, dto: UpdateUserRoleDto) {
    await this.ensureUsersLoaded();

    try {
      const existing = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, identityLinks: true },
      });

      if (!existing) {
        throw new NotFoundException("Utilisateur introuvable");
      }

      const normalizedIdentityLinks = this.normalizeIdentityLinks(
        dto.role,
        dto.identityLinks ?? this.parseIdentityLinks(existing.identityLinks),
        existing.fullName,
      );
      this.validateIdentityLinks(dto.role, normalizedIdentityLinks);

      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          role: dto.role,
          identityLinks: normalizedIdentityLinks as unknown as object,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          identityLinks: true,
        },
      });

      return {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        status: updated.status as AccountStatus,
        identityLinks: this.parseIdentityLinks(updated.identityLinks),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
    }

    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException("Utilisateur introuvable");
    }

    const normalizedIdentityLinks = this.normalizeIdentityLinks(dto.role, dto.identityLinks ?? user.identityLinks, user.fullName);
    this.validateIdentityLinks(dto.role, normalizedIdentityLinks);

    user.role = dto.role;
    user.identityLinks = normalizedIdentityLinks;
    await this.persistUsers();
    return this.toPublicUser(user);
  }

  async updateUserPassword(userId: string, dto: UpdateUserPasswordDto) {
    await this.ensureUsersLoaded();

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException("Le mot de passe doit contenir au moins 8 caracteres");
    }

    try {
      const existing = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException("Utilisateur introuvable");
      }

      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hashPassword(dto.password),
          status: "active",
          activationToken: null,
          activationTokenExpiresAt: null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          identityLinks: true,
        },
      });

      return {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        status: updated.status as AccountStatus,
        identityLinks: this.parseIdentityLinks(updated.identityLinks),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
    }

    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException("Utilisateur introuvable");
    }

    user.passwordHash = hashPassword(dto.password);
    user.status = "active";
    user.activationToken = undefined;
    user.activationTokenExpiresAt = undefined;
    await this.persistUsers();
    return this.toPublicUser(user);
  }
}
