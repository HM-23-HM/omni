import { sendDailyNewsReport } from "./utils/index.ts";
import { log } from "./utils/logging/index.ts";

log("Manually sending daily report");
await sendDailyNewsReport();
