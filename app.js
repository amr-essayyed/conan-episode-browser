/* ============================================
   Detective Conan Episode Browser - Application Logic
   ============================================ */

(function () {
  'use strict';

  // ---- Plot Element Definitions ----
  const PLOT_ELEMENTS = {
    black_org:     { icon: '🕵️', label: 'Black Organization' },
    fbi:           { icon: '🔫', label: 'FBI' },
    new_character: { icon: '🆕', label: 'New Character' },
    character_dev: { icon: '💎', label: 'Character Dev' },
    romance:       { icon: '💕', label: 'Romance' },
    past:          { icon: '⏳', label: "Characters' Pasts" },
    heiji:         { icon: '🗡️', label: 'Heiji Hattori' },
    detective_boys:{ icon: '👦', label: 'Detective Boys' },
    magic_kaito:   { icon: '🎩', label: 'Magic Kaito' },
    detective_conan:{ icon: '🔍', label: 'Detective Conan' },
    mk_org:        { icon: '🎭', label: "MK's Organization" },
  };

  // ---- State ----
  let allEpisodes = [];
  let filteredEpisodes = [];
  let currentPage = 1;
  let perPage = 50;
  let currentSort = { key: 'jp', dir: 'asc' };
  let searchTerm = '';
  let searchDebounceTimer = null;
  let activePlotFilters = new Set();
  let isSyncing = false;

  // ---- DOM References ----
  const dom = {
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    seasonFilter: document.getElementById('seasonFilter'),
    typeFilter: document.getElementById('typeFilter'),
    sortFilter: document.getElementById('sortFilter'),
    resetFilters: document.getElementById('resetFilters'),
    emptyReset: document.getElementById('emptyReset'),
    episodeBody: document.getElementById('episodeBody'),
    emptyState: document.getElementById('emptyState'),
    tableWrapper: document.querySelector('.table-wrapper'),
    pagination: document.getElementById('pagination'),
    paginationInfo: document.getElementById('paginationInfo'),
    pageNumbers: document.getElementById('pageNumbers'),
    firstPage: document.getElementById('firstPage'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    lastPage: document.getElementById('lastPage'),
    perPageSelect: document.getElementById('perPageSelect'),
    backToTop: document.getElementById('backToTop'),
    filterSection: document.querySelector('.filter-section'),
    totalCount: document.getElementById('totalCount'),
    statTotalValue: document.getElementById('statTotalValue'),
    statCanonValue: document.getElementById('statCanonValue'),
    statOriginalValue: document.getElementById('statOriginalValue'),
    statRemasterValue: document.getElementById('statRemasterValue'),
    statFilteredValue: document.getElementById('statFilteredValue'),
    plotChips: document.getElementById('plotChips'),
    btnSync: document.getElementById('btnSync'),
    syncStatus: document.getElementById('syncStatus'),
    syncText: document.getElementById('syncText'),
    toastContainer: document.getElementById('toastContainer'),
  };

  // ---- Utilities ----
  function parseEpisodeNumber(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[RS]/gi, '').split(/[-~]/)[0].trim();
    return parseInt(cleaned) || 0;
  }

  function parseDate(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightMatch(text, term) {
    if (!term || !text) return escapeHtml(text || '');
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="search-highlight">$1</span>');
  }

  function animateNumber(el, target) {
    const start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    const diff = target - start;
    if (diff === 0) { el.textContent = target.toLocaleString(); return; }
    const duration = 600;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + diff * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function getTypeBadgeClass(type) {
    switch (type) {
      case 'Manga Canon': return 'manga-canon';
      case 'Anime Original': return 'anime-original';
      case 'Remaster': return 'remaster';
      case 'Magic Kaito': return 'magic-kaito';
      case 'Special Volume': return 'special-volume';
      default: return 'unknown';
    }
  }

  function getTypeIcon(type) {
    switch (type) {
      case 'Manga Canon': return '📖';
      case 'Anime Original': return '✨';
      case 'Remaster': return '🔄';
      case 'Magic Kaito': return '🎭';
      case 'Special Volume': return '📕';
      default: return '❓';
    }
  }

  function renderPlotIcons(plotElements) {
    if (!plotElements || plotElements.length === 0) {
      return '<span class="ep-plot-empty">—</span>';
    }
    return '<div class="plot-icons">' +
      plotElements.map(key => {
        const def = PLOT_ELEMENTS[key];
        if (!def) return '';
        return `<span class="plot-icon-badge" data-plot="${key}" data-tooltip="${def.label}">${def.icon}</span>`;
      }).join('') +
    '</div>';
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }

  // ---- Data Loading & Syncing ----
  async function checkSyncStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.lastUpdated) {
          dom.syncText.textContent = `Updated ${formatTimeAgo(data.lastUpdated)}`;
        }
        if (data.isSyncing) {
          setSyncingState(true);
        }
        return;
      }
    } catch (e) {
      // Ignore network errors when running static
    }

    // Static mode / fallback using embedded metadata
    if (typeof EPISODES_METADATA !== 'undefined' && EPISODES_METADATA.lastUpdated) {
      dom.syncText.textContent = `Updated ${formatTimeAgo(EPISODES_METADATA.lastUpdated)}`;
    } else {
      dom.syncText.textContent = 'Auto-synced via GitHub';
    }
  }

  function setSyncingState(syncing) {
    isSyncing = syncing;
    dom.btnSync.disabled = syncing;
    dom.btnSync.classList.toggle('syncing', syncing);
    const dot = dom.syncStatus.querySelector('.sync-dot');
    if (dot) dot.classList.toggle('syncing', syncing);
    if (syncing) {
      dom.syncText.textContent = 'Syncing from Wiki...';
    }
  }

  async function triggerWikiSync() {
    if (isSyncing) return;
    setSyncingState(true);
    showToast('🔄 Checking sync server status...', 'info');

    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.status === 404) {
        showToast('ℹ️ Auto-sync runs automatically every 12 hours via GitHub Actions. Dataset is up to date!', 'info');
        if (typeof EPISODES_METADATA !== 'undefined' && EPISODES_METADATA.lastUpdated) {
          dom.syncText.textContent = `Updated ${formatTimeAgo(EPISODES_METADATA.lastUpdated)}`;
        }
        return;
      }

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(`✅ Sync Complete! ${data.totalEpisodes} episodes loaded. (${data.addedInLastSync >= 0 ? '+' : ''}${data.addedInLastSync} new)`, 'success');
        dom.syncText.textContent = 'Updated Just now';
        
        // Reload fresh episode data from server
        await reloadEpisodeData();
      } else {
        showToast(`⚠️ Sync failed: ${data.error || 'Server error'}`, 'error');
        dom.syncText.textContent = 'Sync Failed';
      }
    } catch (e) {
      showToast('ℹ️ Auto-sync runs automatically every 12 hours via GitHub Actions. Dataset is up to date!', 'info');
      if (typeof EPISODES_METADATA !== 'undefined' && EPISODES_METADATA.lastUpdated) {
        dom.syncText.textContent = `Updated ${formatTimeAgo(EPISODES_METADATA.lastUpdated)}`;
      }
    } finally {
      setSyncingState(false);
    }
  }

  async function reloadEpisodeData() {
    try {
      const res = await fetch('/api/episodes');
      if (res.ok) {
        const rawData = await res.json();
        processEpisodeData(rawData);
      }
    } catch (e) {
      console.warn('Could not fetch updated /api/episodes, using embedded dataset');
    }
  }

  function processEpisodeData(rawData) {
    allEpisodes = rawData.map((ep, idx) => ({
      ...ep,
      _idx: idx,
      _jpNum: parseEpisodeNumber(ep.jpNumber),
      _date: parseDate(ep.originalBroadcast),
    }));

    // Re-populate season filter
    const prevSeason = dom.seasonFilter.value;
    dom.seasonFilter.innerHTML = '<option value="">All Seasons</option>';
    const seasons = [...new Set(allEpisodes.map(e => e.season))].sort((a, b) => a - b);
    seasons.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s === 0 ? 'Unscheduled' : `Season ${s}`;
      dom.seasonFilter.appendChild(opt);
    });
    dom.seasonFilter.value = prevSeason;

    // Update total count & stats
    dom.totalCount.textContent = allEpisodes.length.toLocaleString() + '+';

    const canonCount = allEpisodes.filter(e => e.type === 'Manga Canon').length;
    const originalCount = allEpisodes.filter(e => e.type === 'Anime Original').length;
    const remasterCount = allEpisodes.filter(e => e.type === 'Remaster').length;

    animateNumber(dom.statTotalValue, allEpisodes.length);
    animateNumber(dom.statCanonValue, canonCount);
    animateNumber(dom.statOriginalValue, originalCount);
    animateNumber(dom.statRemasterValue, remasterCount);

    // Update plot chip counts
    const plotCounts = {};
    allEpisodes.forEach(ep => {
      (ep.plotElements || []).forEach(p => {
        plotCounts[p] = (plotCounts[p] || 0) + 1;
      });
    });
    document.querySelectorAll('.plot-chip').forEach(chip => {
      const key = chip.dataset.plot;
      const countEl = chip.querySelector('.chip-count');
      if (countEl && plotCounts[key]) {
        countEl.textContent = plotCounts[key];
      }
    });

    applyFilters();
  }

  // ---- Initialize ----
  function init() {
    // Initial data load from embedded EPISODES_DATA or API
    if (typeof EPISODES_DATA !== 'undefined' && EPISODES_DATA.length > 0) {
      processEpisodeData(EPISODES_DATA);
    } else {
      reloadEpisodeData();
    }

    bindEvents();
    createParticles();
    checkSyncStatus();
  }

  // ---- Particles ----
  function createParticles() {
    const container = document.getElementById('bgParticles');
    if (!container) return;
    const count = 30;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (8 + Math.random() * 15) + 's';
      p.style.animationDelay = Math.random() * 10 + 's';
      p.style.width = (2 + Math.random() * 3) + 'px';
      p.style.height = p.style.width;
      const colors = ['#3b82f6', '#8b5cf6', '#22d3ee', '#60a5fa'];
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      container.appendChild(p);
    }
  }

  // ---- Events ----
  function bindEvents() {
    // Sync Button
    if (dom.btnSync) {
      dom.btnSync.addEventListener('click', triggerWikiSync);
    }

    // Search with debounce
    dom.searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      const val = dom.searchInput.value;
      dom.searchClear.classList.toggle('visible', val.length > 0);
      searchDebounceTimer = setTimeout(() => {
        searchTerm = val.trim();
        currentPage = 1;
        applyFilters();
      }, 200);
    });

    dom.searchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.searchClear.classList.remove('visible');
      searchTerm = '';
      currentPage = 1;
      applyFilters();
      dom.searchInput.focus();
    });

    // Filters
    dom.seasonFilter.addEventListener('change', () => { currentPage = 1; applyFilters(); });
    dom.typeFilter.addEventListener('change', () => { currentPage = 1; applyFilters(); });

    // Sort dropdown
    dom.sortFilter.addEventListener('change', () => {
      const val = dom.sortFilter.value;
      const [key, dir] = val.split('-');
      currentSort = { key, dir };
      applyFilters();
    });

    // Column header sorting
    document.querySelectorAll('.th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const sortKey = th.dataset.sort;
        if (currentSort.key === sortKey) {
          currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.key = sortKey;
          currentSort.dir = 'asc';
        }
        dom.sortFilter.value = currentSort.key + '-' + currentSort.dir;
        applyFilters();
      });
    });

    // Plot chip filters
    document.querySelectorAll('.plot-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.plot;
        if (activePlotFilters.has(key)) {
          activePlotFilters.delete(key);
          chip.classList.remove('active');
        } else {
          activePlotFilters.add(key);
          chip.classList.add('active');
        }
        currentPage = 1;
        applyFilters();
      });
    });

    // Reset
    dom.resetFilters.addEventListener('click', resetAllFilters);
    dom.emptyReset.addEventListener('click', resetAllFilters);

    // Pagination
    dom.firstPage.addEventListener('click', () => { currentPage = 1; renderTable(); scrollToTable(); });
    dom.prevPage.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); scrollToTable(); } });
    dom.nextPage.addEventListener('click', () => { const max = Math.ceil(filteredEpisodes.length / perPage); if (currentPage < max) { currentPage++; renderTable(); scrollToTable(); } });
    dom.lastPage.addEventListener('click', () => { currentPage = Math.ceil(filteredEpisodes.length / perPage); renderTable(); scrollToTable(); });
    dom.perPageSelect.addEventListener('change', () => {
      perPage = parseInt(dom.perPageSelect.value);
      currentPage = 1;
      renderTable();
    });

    // Back to top
    dom.backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Scroll events
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          dom.backToTop.classList.toggle('visible', scrollY > 400);
          dom.filterSection.classList.toggle('scrolled', scrollY > 200);
          ticking = false;
        });
        ticking = true;
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        dom.searchInput.focus();
        dom.searchInput.select();
      }
      if (e.key === 'Escape' && document.activeElement === dom.searchInput) {
        dom.searchInput.value = '';
        dom.searchClear.classList.remove('visible');
        searchTerm = '';
        currentPage = 1;
        applyFilters();
        dom.searchInput.blur();
      }
    });
  }

  function resetAllFilters() {
    dom.searchInput.value = '';
    dom.searchClear.classList.remove('visible');
    dom.seasonFilter.value = '';
    dom.typeFilter.value = '';
    dom.sortFilter.value = 'jp-asc';
    searchTerm = '';
    currentSort = { key: 'jp', dir: 'asc' };
    currentPage = 1;

    activePlotFilters.clear();
    document.querySelectorAll('.plot-chip').forEach(chip => chip.classList.remove('active'));

    applyFilters();
  }

  function scrollToTable() {
    const rect = dom.filterSection.getBoundingClientRect();
    if (rect.top < 0) {
      dom.filterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---- Filter & Sort ----
  function applyFilters() {
    const seasonVal = dom.seasonFilter.value;
    const typeVal = dom.typeFilter.value;
    const search = searchTerm.toLowerCase();

    filteredEpisodes = allEpisodes.filter(ep => {
      if (seasonVal !== '' && ep.season !== parseInt(seasonVal)) return false;
      if (typeVal && ep.type !== typeVal) return false;

      if (activePlotFilters.size > 0) {
        const epPlots = new Set(ep.plotElements || []);
        for (const requiredPlot of activePlotFilters) {
          if (!epPlots.has(requiredPlot)) return false;
        }
      }

      if (search) {
        const searchFields = [
          ep.title,
          ep.jpNumber,
          ep.mangaSource,
          ep.originalBroadcast,
        ].filter(Boolean).map(s => s.toLowerCase());

        if (!searchFields.some(f => f.includes(search))) return false;
      }

      return true;
    });

    sortEpisodes();
    animateNumber(dom.statFilteredValue, filteredEpisodes.length);
    renderTable();
  }

  function sortEpisodes() {
    const { key, dir } = currentSort;
    const multiplier = dir === 'asc' ? 1 : -1;

    filteredEpisodes.sort((a, b) => {
      let valA, valB;

      switch (key) {
        case 'jp':
          valA = a._jpNum;
          valB = b._jpNum;
          break;
        case 'title':
          valA = (a.title || '').toLowerCase();
          valB = (b.title || '').toLowerCase();
          return multiplier * valA.localeCompare(valB);
        case 'season':
          valA = a.season;
          valB = b.season;
          if (valA === valB) { valA = a._jpNum; valB = b._jpNum; }
          break;
        case 'date':
          valA = a._date ? a._date.getTime() : 0;
          valB = b._date ? b._date.getTime() : 0;
          break;
        default:
          valA = a._idx;
          valB = b._idx;
      }

      return multiplier * (valA - valB);
    });

    document.querySelectorAll('.th-sortable').forEach(th => {
      th.classList.remove('active', 'asc', 'desc');
      if (th.dataset.sort === key) {
        th.classList.add('active', dir);
      }
    });
  }

  // ---- Render ----
  function renderTable() {
    const totalPages = Math.max(1, Math.ceil(filteredEpisodes.length / perPage));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * perPage;
    const end = Math.min(start + perPage, filteredEpisodes.length);
    const pageEpisodes = filteredEpisodes.slice(start, end);

    const isEmpty = filteredEpisodes.length === 0;
    dom.emptyState.style.display = isEmpty ? 'block' : 'none';
    dom.tableWrapper.style.display = isEmpty ? 'none' : '';
    dom.pagination.style.display = isEmpty ? 'none' : '';

    if (isEmpty) return;

    const fragment = document.createDocumentFragment();
    pageEpisodes.forEach((ep, idx) => {
      const tr = document.createElement('tr');
      tr.style.animationDelay = Math.min(idx * 0.015, 0.5) + 's';

      const typeClass = getTypeBadgeClass(ep.type);
      const typeIcon = getTypeIcon(ep.type);

      const titleContent = ep.url
        ? `<a href="${escapeHtml(ep.url)}" target="_blank" rel="noopener">${highlightMatch(ep.title, searchTerm)}</a>`
        : highlightMatch(ep.title, searchTerm);

      const seasonText = ep.season === 0 ? 'TBA' : ep.season;

      tr.innerHTML = `
        <td class="ep-number">${highlightMatch(ep.jpNumber || '-', searchTerm)}</td>
        <td class="ep-title">${titleContent}</td>
        <td><span class="season-badge">${seasonText}</span></td>
        <td><span class="type-badge ${typeClass}">${typeIcon} ${ep.type}</span></td>
        <td>${renderPlotIcons(ep.plotElements)}</td>
        <td class="ep-date">${highlightMatch(ep.originalBroadcast || '-', searchTerm)}</td>
        <td class="ep-manga">${highlightMatch(ep.mangaSource || '-', searchTerm)}</td>
      `;

      fragment.appendChild(tr);
    });

    dom.episodeBody.innerHTML = '';
    dom.episodeBody.appendChild(fragment);

    dom.paginationInfo.textContent = `Showing ${start + 1}–${end} of ${filteredEpisodes.length.toLocaleString()}`;
    renderPageNumbers(totalPages);

    dom.firstPage.disabled = currentPage === 1;
    dom.prevPage.disabled = currentPage === 1;
    dom.nextPage.disabled = currentPage === totalPages;
    dom.lastPage.disabled = currentPage === totalPages;
  }

  function renderPageNumbers(totalPages) {
    dom.pageNumbers.innerHTML = '';

    const maxButtons = 7;
    let startPage, endPage;

    if (totalPages <= maxButtons) {
      startPage = 1;
      endPage = totalPages;
    } else {
      const half = Math.floor(maxButtons / 2);
      startPage = Math.max(1, currentPage - half);
      endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', () => {
        currentPage = i;
        renderTable();
        scrollToTable();
      });
      dom.pageNumbers.appendChild(btn);
    }
  }

  // ---- Start ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
