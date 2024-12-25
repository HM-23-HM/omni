import cron from 'node-cron';
import { sendDailyJamstockexReport, sendDailyNewsReport } from "./utils/index.ts";
import { log } from './utils/logging/index.ts';

// Schedule the job to run at 12:00 PM UTC-5 (17:00 UTC)
// Cron format: minute hour * * *
cron.schedule('0 12 * * *', async () => {
  try {
    await sendDailyNewsReport();
    log('Daily news report sent successfully');
  } catch (error) {
    log('Error sending daily news report:' + error, true);
  }
}, {
  timezone: "America/New_York"  // UTC-5 (EST)
});


// cron.schedule('30 23 * * 1-5', async () => {
//   try {
//     await sendDailyJamstockexReport();
//     log('Daily jamstockex report sent successfully');
//   } catch (error) {
//     log('Error sending daily jamstockex report:' + error, true);
//   }
// }, {
//   timezone: "America/New_York"  // UTC-5 (EST)
// });


log('Schedulers have started');
