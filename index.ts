import cron from 'node-cron';
import { sendDailyReport } from "./utils/index.ts";

// Schedule the job to run at 11:30 AM UTC-5 (16:30 UTC)
// Cron format: minute hour * * *
// cron.schedule('30 11 * * *', async () => {
//   try {
//     await sendDailyReport();
//     console.log('Daily report sent successfully');
//   } catch (error) {
//     console.error('Error sending daily report:', error);
//   }
// }, {
//   timezone: "America/New_York"  // UTC-5 (EST)
// });

console.log('Daily report scheduler started');

sendDailyReport()
.catch(console.error);