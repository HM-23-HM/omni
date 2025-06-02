import { sendDailyNewsReport } from "../src/email.ts";
import { log } from "../src/utils/logging.ts";

log("Manually sending news report");
await sendDailyNewsReport();
