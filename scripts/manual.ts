import { emailService } from "../src/services/EmailService.ts";
import { logger } from "../src/services/logger.ts";

logger.log("Manually sending news report");
await emailService.sendDailyNewsReport();
