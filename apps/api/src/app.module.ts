import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { ActivityLogsMiddleware } from "./activity-logs/activity-logs.middleware";
import { ActivityLogsModule } from "./activity-logs/activity-logs.module";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { ContractsModule } from "./contracts/contracts.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HeaderAuthGuard } from "./common/guards/header-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { IncidentsModule } from "./incidents/incidents.module";
import { InspectionsModule } from "./inspections/inspections.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PropertiesModule } from "./properties/properties.module";
import { TenantsModule } from "./tenants/tenants.module";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "dev-secret",
      signOptions: { expiresIn: "8h" },
    }),
    ActivityLogsModule,
    AuthModule,
    ContractsModule,
    DashboardModule,
    IncidentsModule,
    InspectionsModule,
    NotificationsModule,
    PaymentsModule,
    PrismaModule,
    PropertiesModule,
    TenantsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: HeaderAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ActivityLogsMiddleware).forRoutes("*");
  }
}
