export const log = (message: any, isError: boolean = false) => {
  const date = new Date();
  const timestamp = date.toLocaleString("en-US", {
    timeZone: "America/Jamaica",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  if (isError) {
    if(typeof message == 'string') return console.error(`[${timestamp}] ${message}`);
    console.error(`[${timestamp}] ${JSON.stringify(message, null, 2)}`);
  } else {
   if(typeof message == 'string') return console.log(`[${timestamp}] ${message}`);
    console.log(`[${timestamp}] ${JSON.stringify(message, null, 2)}`);
  }
};
