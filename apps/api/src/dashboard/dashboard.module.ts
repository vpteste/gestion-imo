import { Module } from "@nestjs/common";
import { ContractsModule } from "../contracts/contracts.module";
import { PaymentsModule } from "../payments/payments.module";
import { PropertiesModule } from "../properties/properties.module";
import { TenantsModule } from "../tenants/tenants.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [PropertiesModule, PaymentsModule, ContractsModule, TenantsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
