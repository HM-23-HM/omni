export const log = (message: string, isError: boolean = false) => {
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
    console.error(`[${timestamp}] ${message}`);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
};
