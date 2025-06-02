import { sendDailyJamstockexReport } from "./src/utils/index.ts";
import { log } from "./src/utils/logging.ts";

log("Manually sending jamstockex report");
await sendDailyJamstockexReport();
