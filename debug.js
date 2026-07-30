// Debug scraper - understand DOM structure
const https = require('https');
const { JSDOM } = require('jsdom');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching page...');
  const html = await fetchPage('https://www.detectiveconanworld.com/wiki/Anime');
  
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Find all headings with season info
  const allHeadings = doc.querySelectorAll('h2, h3, h4');
  console.log('=== Season Headings ===');
  for (const h of allHeadings) {
    const text = h.textContent.trim();
    if (text.includes('Season') || text.includes('Episode')) {
      console.log(`${h.tagName}: "${text}"`);
    }
  }
  
  // Check table parent structure
  const tables = doc.querySelectorAll('table.wikitable');
  console.log(`\n=== Table Parents (first 3) ===`);
  for (let i = 0; i < Math.min(3, tables.length); i++) {
    const table = tables[i];
    const parent = table.parentElement;
    console.log(`Table ${i}: parent=${parent?.tagName}, parentClass=${parent?.className}`);
    
    // Check siblings
    let prev = table.previousElementSibling;
    let count = 0;
    while (prev && count < 5) {
      console.log(`  prev: ${prev.tagName} class="${prev.className}" text="${prev.textContent.trim().substring(0, 80)}"`);
      prev = prev.previousElementSibling;
      count++;
    }
  }

  // Try a different approach - just process tables by index
  // Season 1 = table 0, Season 2 = table 1, etc.
  console.log('\n=== All tables info ===');
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const rows = table.querySelectorAll('tr');
    const headerCells = Array.from(rows[0]?.querySelectorAll('th') || []);
    const headers = headerCells.map(th => th.textContent.trim());
    const firstDataRow = rows[1] ? Array.from(rows[1].querySelectorAll('td')).map(td => td.textContent.trim().substring(0, 30)) : [];
    console.log(`Table ${i}: ${rows.length} rows, headers=${JSON.stringify(headers)}, firstRow=${JSON.stringify(firstDataRow)}`);
  }
}

main().catch(console.error);
