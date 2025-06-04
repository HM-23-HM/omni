import { sendDailyNewsReport } from "../src/email.js";
import { logger } from "../src/utils/logging.js";

logger.log("Manually sending news report");
sendDailyNewsReport();
