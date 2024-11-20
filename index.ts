import cron from 'node-cron';
import { sendDailyReport } from "./utils/index.ts";
import { log } from './utils/logging/index.ts';

// Schedule the job to run at 11:00 AM UTC-5 (16:00 UTC)
// Cron format: minute hour * * *
cron.schedule('0 11 * * *', async () => {
  try {
    await sendDailyReport();
    log('Daily report sent successfully');
  } catch (error) {
    log('Error sending daily report:' + error, true);
  }
}, {
  timezone: "America/New_York"  // UTC-5 (EST)
});

log('Daily report scheduler started');
