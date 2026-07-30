// Scraper module for Detective Conan episode data
const https = require('https');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const WIKI_URL = 'https://www.detectiveconanworld.com/wiki/Anime';
const DATA_PATH = path.join(__dirname, 'episodes.json');
const JS_DATA_PATH = path.join(__dirname, 'episodes.js');
const META_PATH = path.join(__dirname, 'metadata.json');

const PLOT_IMAGE_MAP = {
  'Plot-New.png': 'new_character',
  'Plot-Char.png': 'character_dev',
  'Plot-Romance.png': 'romance',
  'Plot-BO.png': 'black_org',
  'Plot-FBI.png': 'fbi',
  'Plot-MK.png': 'magic_kaito',
  'Plot-Past.png': 'past',
  'PlotHH.png': 'heiji',
  'Plot-DB.png': 'detective_boys',
  'Plot-DC.png': 'detective_conan',
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DetectiveConanApp/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function extractPlotElements(cell) {
  const imgs = cell.querySelectorAll('img');
  const elements = [];
  
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    
    for (const [filename, key] of Object.entries(PLOT_IMAGE_MAP)) {
      if (src.includes(filename)) {
        if (filename === 'Plot-BO.png' && alt.toLowerCase().includes('magic kaito')) {
          elements.push('mk_org');
        } else {
          elements.push(key);
        }
        break;
      }
    }
  }
  return [...new Set(elements)];
}

async function scrapeEpisodes() {
  console.log(`[${new Date().toISOString()}] Scraping Detective Conan World Wiki...`);
  const html = await fetchPage(WIKI_URL);
  
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  const tables = doc.querySelectorAll('table.wikitable');
  const episodes = [];
  
  for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
    const season = tableIdx + 1;
    const isUnscheduled = tableIdx === tables.length - 1;
    
    const table = tables[tableIdx];
    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) continue;
    
    const headerCells = Array.from(rows[0].querySelectorAll('th'));
    const headers = headerCells.map(th => th.textContent.trim());
    
    const rowSpanTracker = {};
    
    for (let i = 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll('td'));
      if (cells.length === 0) continue;
      
      const fullCells = [];
      let cellIdx = 0;
      
      for (let h = 0; h < headers.length; h++) {
        if (rowSpanTracker[h] && rowSpanTracker[h].remaining > 0) {
          fullCells.push(rowSpanTracker[h].cell);
          rowSpanTracker[h].remaining--;
          if (rowSpanTracker[h].remaining <= 0) delete rowSpanTracker[h];
        } else if (cellIdx < cells.length) {
          const cell = cells[cellIdx];
          const rowspan = parseInt(cell.getAttribute('rowspan') || '1');
          if (rowspan > 1) rowSpanTracker[h] = { cell: cell, remaining: rowspan - 1 };
          fullCells.push(cell);
          cellIdx++;
        }
      }
      
      if (fullCells.length < 3) continue;
      
      const episode = { season: isUnscheduled ? 0 : season };
      
      for (let h = 0; h < Math.min(headers.length, fullCells.length); h++) {
        const header = headers[h].toLowerCase();
        const cell = fullCells[h];
        const text = cell.textContent.trim();
        
        if (header === 'jp#') {
          episode.jpNumber = text;
        } else if (header === 'int#') {
          episode.intNumber = text;
        } else if (header.includes('episode') || header.includes('title')) {
          const link = cell.querySelector('a');
          episode.title = link ? link.textContent.trim() : text;
          if (link) {
            const href = link.getAttribute('href');
            episode.url = href ? 'https://www.detectiveconanworld.com' + href : '';
          }
        } else if (header.includes('original broadcast')) {
          episode.originalBroadcast = text;
        } else if (header.includes('english') || header.includes('dub')) {
          episode.englishBroadcast = text;
        } else if (header === 'plot') {
          episode.plotElements = extractPlotElements(cell);
        } else if (header.includes('manga')) {
          episode.mangaSource = text;
        } else if (header.includes('hint')) {
          episode.hint = text;
        }
      }
      
      if (!episode.mangaSource) {
        episode.type = 'Unknown';
      } else if (episode.mangaSource.includes('TV Original') || episode.mangaSource.includes('Anime Original')) {
        episode.type = 'Anime Original';
      } else if (episode.mangaSource.includes('MK') || episode.mangaSource.includes('Magic Kaito')) {
        episode.type = 'Magic Kaito';
      } else if (episode.mangaSource.includes('SV') || episode.mangaSource.includes('Special Volume')) {
        episode.type = 'Special Volume';
      } else {
        episode.type = 'Manga Canon';
      }
      
      if (episode.jpNumber && (episode.jpNumber.includes('R') || episode.jpNumber.includes('REMASTER'))) {
        episode.type = 'Remaster';
      }
      
      if (episode.title) {
        episodes.push(episode);
      }
    }
  }
  
  // Read previous count to measure diff
  let previousCount = 0;
  if (fs.existsSync(DATA_PATH)) {
    try {
      const prevData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      previousCount = prevData.length;
    } catch (e) {}
  }
  
  // Construct metadata
  const metadata = {
    lastUpdated: new Date().toISOString(),
    totalEpisodes: episodes.length,
    addedInLastSync: episodes.length - previousCount
  };
  fs.writeFileSync(META_PATH, JSON.stringify(metadata, null, 2));

  // Save episodes.json
  fs.writeFileSync(DATA_PATH, JSON.stringify(episodes, null, 2));
  
  // Save episodes.js (includes dataset and metadata)
  const jsOut = 'const EPISODES_DATA = ' + JSON.stringify(episodes) + ';\n' +
                'const EPISODES_METADATA = ' + JSON.stringify(metadata) + ';\n';
  fs.writeFileSync(JS_DATA_PATH, jsOut);
  
  console.log(`[${metadata.lastUpdated}] Successfully scraped ${episodes.length} episodes (Diff: ${metadata.addedInLastSync})`);
  return metadata;
}

// Allow direct CLI execution: node scraper.js
if (require.main === module) {
  scrapeEpisodes().catch(console.error);
}

module.exports = {
  scrapeEpisodes,
  META_PATH,
  DATA_PATH
};
