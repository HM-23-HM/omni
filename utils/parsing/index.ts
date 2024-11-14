import { JSDOM } from 'jsdom';  // Need to install this package first
import { ArticleSource, StockData } from '../ingestion/index.ts';


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

export function cleanDailyJamstockexHtml(html: string): string {
    // Pre-clean link tags and comments
    html = html.replace(/<link[^>]*>/g, ''); // Remove link tags
    html = html.replace(/<!--[\s\S]*?-->/g, ''); // Remove HTML comments
    
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Remove SEO meta tags
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(tag => tag.remove());
    
    // Remove scripts
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Remove styles
    const styles = document.querySelectorAll('style');
    styles.forEach(style => style.remove());
    
    // Remove navigation menu
    const nav = document.querySelectorAll('nav');
    nav.forEach(n => n.remove());
    
    // Remove search functionality
    const search = document.querySelectorAll('search, .elementor-search-form');
    search.forEach(s => s.remove());
    
    // Remove logo
    const logo = document.querySelectorAll('.elementor-widget-theme-site-logo');
    logo.forEach(l => l.remove());
    
    // Remove header
    const header = document.querySelectorAll('header');
    header.forEach(h => h.remove());
    
    // Remove footer section (more specific selector)
    const footerSections = document.querySelectorAll('footer, .elementor-location-footer');
    footerSections.forEach(footer => footer.remove());
    
    // Get cleaned HTML and remove empty lines
    const cleanedHtml = document.documentElement.outerHTML
        .split('\n')
        .filter(line => line.trim() !== '')
        .join('\n');
    
    return cleanedHtml;
}

export function cleanDailyJseStockHtml(html: string): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Find the key elements we need
    const stockName = document.querySelector('h2.tw-font-bold');
    const todaysRange = document.querySelector('.tw-flex:has(span:contains("Today\'s Range"))');
    const volumeTraded = document.querySelector('.tw-flex:has(span:contains("Volume Traded"))');
    
    // Create a new container for our cleaned content
    const container = document.createElement('div');
    
    // Only add elements if they exist
    if (stockName) container.appendChild(stockName.cloneNode(true));
    if (todaysRange) container.appendChild(todaysRange.cloneNode(true));
    if (volumeTraded) container.appendChild(volumeTraded.cloneNode(true));
    
    return container.innerHTML;
}

export function parseStockData(html: string): StockData {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  const tickerElement = document.querySelector('h2.tw-font-bold');
  const tickerMatch = tickerElement?.textContent?.match(/\(([^)]+)\)/);
  const ticker = tickerMatch ? tickerMatch[1] : '';
  
  // Find all flex containers
  const flexContainers = document.querySelectorAll('.tw-flex');
  
  // Initialize variables
  let range = '';
  let volume = 0;
  
  // Iterate through flex containers to find the ones we need
  flexContainers.forEach(container => {
    const spanText = container.querySelector('span')?.textContent || '';
    const boldText = container.querySelector('.tw-font-bold')?.textContent?.trim() || '';
    
    if (spanText.includes("Today's Range")) {
      range = boldText;
    }
    if (spanText.includes("Volume Traded")) {
      volume = parseInt(boldText.replace(/,/g, '') || '0', 10);
    }
  });
  
  return {
    ticker,
    range,
    volume
  };
}


export function parseJamStockexDaily(html: string): ArticleSource[] {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Find all posts WITHOUT has-post-thumbnail class
  const posts = document.querySelectorAll('article:not(.has-post-thumbnail) .elementor-post__title a');
  const results: ArticleSource[] = [];
  
  posts.forEach(link => {
    const headline = link.textContent?.trim() || '';
    const href = link.getAttribute('href');
    
    if (headline && href) {
      results.push({
        headline,
        link: href
      });
    }
  });
  
  return results;
}