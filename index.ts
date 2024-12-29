import cron from 'node-cron';
import { sendDailyJamstockexReport, sendDailyNewsReport } from "./utils/index.ts";
import { log } from './utils/logging/index.ts';

const holidays = [
  '2024-12-25', // Christmas
  '2024-12-26', // Boxing Day
  '2025-01-01', // New Year's Day
];

// Schedule the job to run at 12:00 PM UTC-5 (17:00 UTC) on Monday, Wednesday, and Friday
// Cron format: minute hour * * day-of-week (0-6, where 0 is Sunday)
cron.schedule('0 12 * * 1,3,5', async () => {
  try {
    await sendDailyNewsReport();
    log('Daily news report sent successfully');
  } catch (error) {
    log('Error sending daily news report:' + error, true);
  }
}, {
  timezone: "America/New_York"  // UTC-5 (EST)
});


cron.schedule('30 23 * * 1-5', async () => {
  const today = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  if (holidays.includes(today)) {
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
