import { Module } from "@nestjs/common";
import { PropertiesModule } from "../properties/properties.module";
import { TenantsModule } from "../tenants/tenants.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [PropertiesModule, TenantsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
