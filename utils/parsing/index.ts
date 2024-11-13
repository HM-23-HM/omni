export function parseJsonString(input: string) {
  // First, find the actual JSON content between the backticks
  const jsonMatch = input.match(/```json\n([\s\S]*?)```/);

  if (!jsonMatch || !jsonMatch[1]) {
    throw new Error("No valid JSON content found between backticks");
  }

  try {
    // Parse the matched content (jsonMatch[1] contains the actual JSON string)
    const parsedJson = JSON.parse(jsonMatch[1]);
    return parsedJson;
  } catch (error) {
    console.error("Error parsing JSON:", error);
    throw new Error("Invalid JSON string");
  }
}

/**
 * Populate the date in the url if it is present
 * @param url - The url to populate
 * @returns The url with the date populated
 */
export function populateDateUrl(url: string): string {
  if (url.includes("YYYY/MM/DD")) {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const formattedDate = `${year}/${month}/${day}`;
    return url.replace("YYYY/MM/DD", formattedDate);
  }
  return url;
}
