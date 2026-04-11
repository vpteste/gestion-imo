import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { PropertiesModule } from "../properties/properties.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";

@Module({
  imports: [PropertiesModule, PaymentsModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
