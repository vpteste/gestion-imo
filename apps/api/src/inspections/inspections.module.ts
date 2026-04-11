import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { PropertiesModule } from "../properties/properties.module";
import { InspectionsController } from "./inspections.controller";
import { InspectionsService } from "./inspections.service";

@Module({
  imports: [PropertiesModule, PaymentsModule],
  controllers: [InspectionsController],
  providers: [InspectionsService],
  exports: [InspectionsService],
})
export class InspectionsModule {}
