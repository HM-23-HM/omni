import cron from 'node-cron';
import { emailService } from './src/services/emailService.ts';
import { logger } from './src/services/logger.ts';
import { isHoliday } from './src/utils/holidays.ts';

// Schedule the job to run at 12:00 PM UTC-5 (17:00 UTC) on Monday, Wednesday, and Friday
// Cron format: minute hour * * day-of-week (0-6, where 0 is Sunday)
cron.schedule('0 12 * * 1,3,5', async () => {
  try {
    if (isHoliday()) {
      logger.log('Today is a holiday. Skipping the daily news report.');
      return;
    }

    await emailService.sendDailyNewsReport();
    logger.log('Daily news report sent successfully');
  } catch (error) {
    logger.error('Error sending daily news report:' + error);
  }
}, {
  timezone: "America/New_York"  // UTC-5 (EST)
});


logger.log('Schedulers have started');
