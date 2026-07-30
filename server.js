const express = require('express');
const path = require('path');
const fs = require('fs');
const { scrapeEpisodes, META_PATH, DATA_PATH } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // Auto-sync every 12 hours

let isSyncing = false;

app.use(express.json());
app.use(express.static(__dirname));

// API Endpoint to check metadata / status
app.get('/api/status', (req, res) => {
  let metadata = { lastUpdated: null, totalEpisodes: 0, addedInLastSync: 0 };
  if (fs.existsSync(META_PATH)) {
    try {
      metadata = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    } catch (e) {}
  }
  res.json({
    ...metadata,
    isSyncing
  });
});

// API Endpoint to get raw json episodes
app.get('/api/episodes', (req, res) => {
  if (fs.existsSync(DATA_PATH)) {
    res.sendFile(DATA_PATH);
  } else {
    res.status(404).json({ error: 'Episodes data not found. Please sync first.' });
  }
});

// API Endpoint to trigger manual sync from wiki
app.post('/api/sync', async (req, res) => {
  if (isSyncing) {
    return res.status(409).json({ message: 'Sync is already in progress.' });
  }
  
  isSyncing = true;
  try {
    const meta = await scrapeEpisodes();
    isSyncing = false;
    res.json({ success: true, ...meta });
  } catch (error) {
    isSyncing = false;
    console.error('Error during wiki sync:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scheduled auto-sync worker
async function autoSyncCheck() {
  if (isSyncing) return;
  
  let shouldSync = false;
  if (!fs.existsSync(DATA_PATH) || !fs.existsSync(META_PATH)) {
    shouldSync = true;
  } else {
    try {
      const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
      const last = new Date(meta.lastUpdated).getTime();
      const ageMs = Date.now() - last;
      if (ageMs > SYNC_INTERVAL_MS) {
        shouldSync = true;
      }
    } catch (e) {
      shouldSync = true;
    }
  }

  if (shouldSync) {
    console.log('[Auto-Sync] Scheduled wiki sync starting...');
    isSyncing = true;
    try {
      await scrapeEpisodes();
    } catch (e) {
      console.error('[Auto-Sync] Error syncing wiki:', e.message);
    } finally {
      isSyncing = false;
    }
  }
}

// Start server & scheduled sync check
app.listen(PORT, () => {
  console.log(`================================================`);
  console.log(`Detective Conan Episode Browser Server Running`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Auto-Sync Schedule: Every 12 Hours`);
  console.log(`================================================`);

  // Initial sync check on startup
  autoSyncCheck();

  // Recurring timer
  setInterval(autoSyncCheck, SYNC_INTERVAL_MS);
});
