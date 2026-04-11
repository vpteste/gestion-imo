import { Module } from "@nestjs/common";
import { PropertiesModule } from "../properties/properties.module";
import { TenantsModule } from "../tenants/tenants.module";
import { IncidentsController } from "./incidents.controller";
import { IncidentsService } from "./incidents.service";

@Module({
  imports: [PropertiesModule, TenantsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
