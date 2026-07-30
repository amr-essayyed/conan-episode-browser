// Investigate the Plot column structure
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
  
  // First, look at the Plot Legend page link
  const plotLegendLinks = doc.querySelectorAll('a[href*="Plot_Legend"]');
  console.log('Plot Legend links:', plotLegendLinks.length);
  
  const tables = doc.querySelectorAll('table.wikitable');
  const table = tables[0]; // Season 1
  const rows = table.querySelectorAll('tr');
  
  // Headers
  const headers = Array.from(rows[0].querySelectorAll('th'));
  console.log('\nHeaders:');
  headers.forEach((h, i) => {
    console.log(`  ${i}: "${h.textContent.trim()}" - innerHTML: "${h.innerHTML.trim().substring(0, 200)}"`);
  });
  
  // Look at plot cells specifically (column index 5 based on headers)
  console.log('\n=== Plot column (index 5) analysis - First 20 rows ===');
  
  // Track rowspans
  const rowSpanTracker = {};
  
  for (let i = 1; i < Math.min(21, rows.length); i++) {
    const cells = Array.from(rows[i].querySelectorAll('td'));
    
    // Build full cell array accounting for rowspans
    const fullCells = [];
    let cellIdx = 0;
    
    for (let h = 0; h < headers.length; h++) {
      if (rowSpanTracker[h] && rowSpanTracker[h].remaining > 0) {
        fullCells.push(rowSpanTracker[h].cell);
        rowSpanTracker[h].remaining--;
        if (rowSpanTracker[h].remaining <= 0) {
          delete rowSpanTracker[h];
        }
      } else if (cellIdx < cells.length) {
        const cell = cells[cellIdx];
        const rowspan = parseInt(cell.getAttribute('rowspan') || '1');
        if (rowspan > 1) {
          rowSpanTracker[h] = { cell: cell, remaining: rowspan - 1 };
        }
        fullCells.push(cell);
        cellIdx++;
      }
    }
    
    if (fullCells.length > 5) {
      const plotCell = fullCells[5]; // Plot column
      const title = fullCells[2]; // Episode title
      const epNum = fullCells[0]; // JP#
      
      // Get all attributes and content of the plot cell
      const imgs = plotCell.querySelectorAll('img');
      const links = plotCell.querySelectorAll('a');
      const style = plotCell.getAttribute('style') || '';
      const className = plotCell.getAttribute('class') || '';
      
      console.log(`\nRow ${i}: EP#${epNum.textContent.trim()} - "${title.textContent.trim().substring(0, 40)}"`);
      console.log(`  style: "${style}"`);
      console.log(`  class: "${className}"`);
      console.log(`  text: "${plotCell.textContent.trim()}"`);
      console.log(`  innerHTML: "${plotCell.innerHTML.trim().substring(0, 300)}"`);
      console.log(`  images: ${imgs.length}`);
      imgs.forEach(img => {
        console.log(`    img src: "${img.getAttribute('src')}" alt: "${img.getAttribute('alt')}" title: "${img.getAttribute('title')}"`);
      });
      console.log(`  links: ${links.length}`);
      links.forEach(link => {
        console.log(`    link href: "${link.getAttribute('href')}" title: "${link.getAttribute('title')}" text: "${link.textContent.trim()}"`);
      });
    }
  }
  
  // Also check a later season for different plot elements
  console.log('\n\n=== Season 5 (table 4) plot cells - first 10 rows ===');
  const table5 = tables[4];
  const rows5 = table5.querySelectorAll('tr');
  const headers5 = Array.from(rows5[0].querySelectorAll('th'));
  const rowSpanTracker5 = {};
  
  for (let i = 1; i < Math.min(11, rows5.length); i++) {
    const cells = Array.from(rows5[i].querySelectorAll('td'));
    const fullCells = [];
    let cellIdx = 0;
    
    for (let h = 0; h < headers5.length; h++) {
      if (rowSpanTracker5[h] && rowSpanTracker5[h].remaining > 0) {
        fullCells.push(rowSpanTracker5[h].cell);
        rowSpanTracker5[h].remaining--;
        if (rowSpanTracker5[h].remaining <= 0) delete rowSpanTracker5[h];
      } else if (cellIdx < cells.length) {
        const cell = cells[cellIdx];
        const rowspan = parseInt(cell.getAttribute('rowspan') || '1');
        if (rowspan > 1) rowSpanTracker5[h] = { cell: cell, remaining: rowspan - 1 };
        fullCells.push(cell);
        cellIdx++;
      }
    }
    
    if (fullCells.length > 5) {
      const plotCell = fullCells[5];
      const epNum = fullCells[0];
      const imgs = plotCell.querySelectorAll('img');
      
      console.log(`\nRow ${i}: EP#${epNum.textContent.trim()}`);
      console.log(`  style: "${plotCell.getAttribute('style') || ''}"`);
      console.log(`  innerHTML: "${plotCell.innerHTML.trim().substring(0, 300)}"`);
      imgs.forEach(img => {
        console.log(`    img src: "${img.getAttribute('src')}" alt: "${img.getAttribute('alt')}" title: "${img.getAttribute('title')}"`);
      });
    }
  }
  
  // Also check the Plot Legend page
  console.log('\n\n=== Fetching Plot Legend page ===');
  const legendHtml = await fetchPage('https://www.detectiveconanworld.com/wiki/Detective_Conan_Wiki:Plot_Legend');
  const legendDom = new JSDOM(legendHtml);
  const legendDoc = legendDom.window.document;
  
  // Find the content
  const content = legendDoc.querySelector('#mw-content-text');
  if (content) {
    const allImgs = content.querySelectorAll('img');
    console.log(`Found ${allImgs.length} images in plot legend`);
    allImgs.forEach(img => {
      // Find the closest text description
      const parent = img.closest('li') || img.closest('tr') || img.closest('p') || img.parentElement;
      console.log(`  img src: "${img.getAttribute('src')}" alt: "${img.getAttribute('alt')}" | context: "${parent.textContent.trim().substring(0, 100)}"`);
    });
    
    // Print the full text
    console.log('\nFull legend text:');
    console.log(content.textContent.trim().substring(0, 2000));
  }
}

main().catch(console.error);
