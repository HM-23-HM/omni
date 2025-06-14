import { JSDOM } from 'jsdom';
import { ArticleSource, StockData } from './types.ts';
import { logger } from '../services/logger.ts';
import fs from 'fs';

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
    logger.error("Error parsing JSON: " + error);
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
    html = html.replace(/<link[^>]*>/g, ''); 
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(tag => tag.remove());
    
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    const styles = document.querySelectorAll('style');
    styles.forEach(style => style.remove());
    
    const nav = document.querySelectorAll('nav');
    nav.forEach(n => n.remove());
    
    const search = document.querySelectorAll('search, .elementor-search-form');
    search.forEach(s => s.remove());
    
    const logo = document.querySelectorAll('.elementor-widget-theme-site-logo');
    logo.forEach(l => l.remove());
    
    const header = document.querySelectorAll('header');
    header.forEach(h => h.remove());
    
    const footerSections = document.querySelectorAll('footer, .elementor-location-footer');
    footerSections.forEach(footer => footer.remove());
    
    const cleanedHtml = document.documentElement.outerHTML
        .split('\n')
        .filter(line => line.trim() !== '')
        .join('\n');
    
    return cleanedHtml;
}

export function cleanDailyJseStockHtml(html: string): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    const stockName = document.querySelector('h2.tw-font-bold');
    const todaysRange = document.querySelector('.tw-flex:has(span:contains("Today\'s Range"))');
    const volumeTraded = document.querySelector('.tw-flex:has(span:contains("Volume Traded"))');
    
    const container = document.createElement('div');
    
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
  
  const flexContainers = document.querySelectorAll('.tw-flex');
  
  let range = '';
  let volume = 0;
  
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

/**
 * Strip code markers like ```html or ``` from a string, regardless of position
 * @param text - The string to strip code markers from
 * @returns The string with code markers stripped
 */
export function stripCodeMarkers(text: string): string {
  const lines = text.split('\n');
  const cleanedLines = lines.map(line => {
    return line.replace(/```(?:html)?/g, '');
  });
  
  return cleanedLines.join('\n');
}

/**
 * Cleans newspaper article HTML by removing unnecessary markup and extracting key metadata.
 * For the Jamaica-Gleaner and Jamaica-Observer
 * @param html Raw HTML string from newspaper article page
 * @returns Cleaned article data object
 */
export function cleanJamaica_XX_NewspaperHtml(html: string) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const unwantedSelectors = [
      'script',
      'style',
      'iframe',
      'link',
      'meta',
      'noscript',
      'img',
      'svg',
      'picture',
      '.ads',
      '#header',
      '#footer',
      '.nav',
      '.sidebar',
      '.comments',
      '.social-share',
      '[class*="advertisement"]',
      '.google-auto-placed', // Remove Google ads
      '#jg-newsletter-sign-up', // Remove newsletter sign-up
      '.autors-widget', // Remove author widget
      'p:has(a[href*="mailto:"])' // Remove email links in paragraphs
  ];

  unwantedSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
  });

  const articleBody = document.querySelector('.body, .article-content, [class*="article-body"]')?.innerHTML || '';

  const cleanedHtml = articleBody
      .replace(/<\!--.*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/<([^>]+)>\s*<\/\1>/g, '')
      .trim();

  return cleanedHtml;
}

/**
 * Cleans ICInsider HTML content by removing unnecessary elements and extracting article content
 * @param html Raw HTML string from ICInsider article
 * @returns Cleaned article content
 */
export function cleanIcInsiderHtml(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const elementsToRemove = [
      'script',
      'style',
      'header',
      'nav',
      '#header',
      '#subnav',
      '.post-info',
      'link',
      'meta',
      '.elementor-widget-container hr', // Remove horizontal rules
  ];

  elementsToRemove.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
  });

  const contentSelectors = [
      '.elementor-widget-container',
      '.entry-content',
      '.post',
      'article',
  ];

  let content: Element | null = null;
  for (const selector of contentSelectors) {
      content = doc.querySelector(selector);
      if (content && content.textContent?.trim()) {
          break;
      }
  }

  if (content) {
      content.querySelectorAll('p, div').forEach(el => {
          if (!el.textContent?.trim()) {
              el.remove();
          }
      });

      // Get the cleaned text content
      let cleanedContent = content.textContent || '';
      
      // Remove extra whitespace and normalize spacing
      cleanedContent = cleanedContent
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .trim();

      return cleanedContent;
  }

  return '';
}

export const newspaperSourceToCleanerFn = {
  "https://jamaica-gleaner.com/business": cleanJamaica_XX_NewspaperHtml,
  "https://www.jamaicaobserver.com/category/business/": cleanJamaica_XX_NewspaperHtml,
  "https://icinsider.com/": cleanIcInsiderHtml,
}

export function cleanJamObserverHomePage(htmlContent: string): string {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  // Find all business articles
  const articles = document.querySelectorAll('article');
  const businessArticles = Array.from(articles).filter(article => {
    const category = article.querySelector('.categories')?.textContent;
    return category?.includes('Business');
  });

  // Create a container for our cleaned content
  const container = document.createElement('div');
  container.className = 'business-headlines';

  // Extract relevant information from each business article
  businessArticles.forEach(article => {
    const articleDiv = document.createElement('div');
    articleDiv.className = 'article';

    // Get headline
    const headline = article.querySelector('.title a')?.textContent?.trim();
    if (headline) {
      const titleElement = document.createElement('h2');
      titleElement.textContent = headline;
      articleDiv.appendChild(titleElement);
    }

    // Get author if available
    const author = article.querySelector('.author')?.textContent?.trim();
    if (author) {
      const authorElement = document.createElement('p');
      authorElement.className = 'author';
      authorElement.textContent = author;
      articleDiv.appendChild(authorElement);
    }

    // Get date
    const date = article.querySelector('.date_part')?.textContent?.trim();
    if (date) {
      const dateElement = document.createElement('p');
      dateElement.className = 'date';
      dateElement.textContent = date;
      articleDiv.appendChild(dateElement);
    }

    // Get article preview/body if available
    const body = article.querySelector('.body')?.textContent?.trim();
    if (body) {
      const bodyElement = document.createElement('p');
      bodyElement.className = 'preview';
      bodyElement.textContent = body;
      articleDiv.appendChild(bodyElement);
    }

    // Add article link
    const link = article.querySelector('.title a')?.getAttribute('href');
    if (link) {
      const linkElement = document.createElement('a');
      linkElement.href = link;
      linkElement.className = 'article-link';
      linkElement.textContent = 'Read more';
      articleDiv.appendChild(linkElement);
    }

    container.appendChild(articleDiv);
  });

  return container.innerHTML;
}

export const newspaperSourceToHomePageCleanerFn = {
  "https://www.jamaicaobserver.com/category/business/": cleanJamObserverHomePage,
}

export const getProxyUrls = (): string[] => {
  const filePath = 'page-content/proxy-list.html';
  const htmlContent = fs.readFileSync(filePath, 'utf-8');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  const proxyList: any[] = [];
  const rows = document.querySelectorAll('body > div.wrap > div.services_proxylist.services > div > div.table_block > table > tbody > tr');

  rows.forEach((row) => {
    const ip = row.querySelector('td:nth-child(1)')?.textContent?.trim();
    const port = row.querySelector('td:nth-child(2)')?.textContent?.trim();
    const country = row.querySelector('td:nth-child(3) > span.country')?.textContent?.trim();
    const protocol = row.querySelector('td:nth-child(5)')?.textContent?.trim();
    if (ip && port && country && protocol === 'HTTPS') {
      proxyList.push({ ip, port });
    }
  });

  return proxyList.map(proxy => `https://${proxy.ip}:${proxy.port}`);
};
