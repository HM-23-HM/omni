import { sendDailyNewsReport } from "../src/email.js";
import { logger } from "../src/services/logger.ts";

logger.log("Manually sending news report");
sendDailyNewsReport();
