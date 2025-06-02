import cron from 'node-cron';
import { sendDailyJamstockexReport, sendDailyNewsReport } from "./src/email.ts";
import { log } from './src/utils/logging.ts';
import { isHoliday } from './src/utils/holidays.ts';

// Schedule the job to run at 12:00 PM UTC-5 (17:00 UTC) on Monday, Wednesday, and Friday
// Cron format: minute hour * * day-of-week (0-6, where 0 is Sunday)
cron.schedule('0 12 * * 1,3,5', async () => {
  try {
    if (isHoliday()) {
      log('Today is a holiday. Skipping the daily news report.');
      return;
    }

    await sendDailyNewsReport();
    log('Daily news report sent successfully');
  } catch (error) {
    log('Error sending daily news report:' + error, true);
  }
}, {
  timezone: "America/New_York"  // UTC-5 (EST)
});


cron.schedule('30 18 * * 1-5', async () => {
  if (isHoliday()) {
    log('Today is a holiday. Skipping the daily jamstockex report.');
    return;
  }

  try {
    await sendDailyJamstockexReport();
    log('Daily jamstockex report sent successfully');
  } catch (error) {
    log('Error sending daily jamstockex report:' + error, true);
  }
}, {
  timezone: "America/New_York"  // UTC-5 (EST)
});


log('Schedulers have started');
