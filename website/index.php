<?php
/**
 * plugins.php — Orchelium Plugin Catalog
 *
 * Drop this file (and plugins-registry.php) onto your PHP server.
 * The registry is fetched from GitHub and cached for 10 minutes.
 *
 * To integrate with your site's layout, replace the <!-- SITE HEADER -->
 * and <!-- SITE FOOTER --> comment blocks with your own include()s.
 */

require_once __DIR__ . '/plugins-registry.php';

$registry = orchelium_fetchRegistry();
$plugins  = $registry['plugins'] ?? [];
$fetchOk  = !empty($plugins);

// Collect distinct categories in the order they appear (for stable tab order)
$categoryOrder = [];
foreach ($plugins as $p) {
    $cat = $p['category'] ?? '';
    if ($cat && !in_array($cat, $categoryOrder, true)) {
        $categoryOrder[] = $cat;
    }
}
sort($categoryOrder);

$pluginCount    = count($plugins);
$updatedDisplay = isset($registry['updated']) ? h($registry['updated']) : 'unknown';

?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plugin Catalog — Orchelium</title>
  <meta name="description" content="Browse the official Orchelium plugin catalog. Install backup, database, file sync, storage, and container plugins directly from your Orchelium instance.">
  <style>
    /* ── Reset / base ─────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.5;
    }
    a { color: #e65100; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── Page header ──────────────────────────────────────────── */
    .catalog-hero {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #fff;
      padding: 48px 24px 40px;
      text-align: center;
    }
    .catalog-hero h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .catalog-hero h1 span { color: #ff7043; }
    .catalog-hero p {
      font-size: 1rem;
      color: #aaa;
      margin-bottom: 20px;
    }
    .catalog-meta {
      display: inline-flex;
      gap: 20px;
      font-size: 0.82rem;
      color: #aaa;
    }
    .catalog-meta strong { color: #ff7043; }

    /* ── Controls bar ─────────────────────────────────────────── */
    .catalog-controls {
      background: #fff;
      border-bottom: 1px solid #e0e0e0;
      padding: 16px 24px;
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .search-wrap {
      position: relative;
      flex: 1 1 220px;
      max-width: 340px;
    }
    .search-wrap svg {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: #999;
      pointer-events: none;
    }
    #pluginSearch {
      width: 100%;
      padding: 8px 12px 8px 36px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 0.9rem;
      outline: none;
      transition: border-color .15s;
    }
    #pluginSearch:focus { border-color: #ff7043; }

    .filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .filter-tab {
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      border: 1.5px solid #ddd;
      background: #fff;
      color: #555;
      transition: all .15s;
      user-select: none;
    }
    .filter-tab:hover { border-color: #ff7043; color: #ff7043; }
    .filter-tab.active {
      background: #ff7043;
      border-color: #ff7043;
      color: #fff;
    }
    .result-count {
      margin-left: auto;
      font-size: 0.82rem;
      color: #888;
      white-space: nowrap;
    }

    /* ── Plugin grid ──────────────────────────────────────────── */
    .catalog-grid {
      max-width: 1200px;
      margin: 32px auto;
      padding: 0 24px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }

    /* ── Plugin card ──────────────────────────────────────────── */
    .plugin-card {
      background: #fff;
      border-radius: 10px;
      border: 1px solid #e8e8e8;
      display: flex;
      flex-direction: column;
      transition: box-shadow .2s, transform .2s;
      overflow: hidden;
    }
    .plugin-card:hover {
      box-shadow: 0 6px 24px rgba(0,0,0,.1);
      transform: translateY(-2px);
    }
    .card-accent {
      height: 4px;
      width: 100%;
    }
    .card-body {
      padding: 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 10px;
    }
    .card-emoji {
      font-size: 2rem;
      line-height: 1;
      flex-shrink: 0;
    }
    .card-icon {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      border-radius: 6px;
    }
    .card-title-group { flex: 1; }
    .card-title {
      font-size: 1rem;
      font-weight: 700;
      color: #1a1a1a;
    }
    .card-version {
      font-size: 0.75rem;
      color: #999;
      margin-top: 2px;
    }
    .card-category {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      color: #fff;
      margin-top: 4px;
      letter-spacing: .03em;
      text-transform: uppercase;
    }
    .card-desc {
      font-size: 0.85rem;
      color: #555;
      line-height: 1.5;
      flex: 1;
      margin-bottom: 14px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 16px;
    }
    .tag {
      font-size: 0.72rem;
      padding: 2px 8px;
      background: #f0f0f0;
      color: #666;
      border-radius: 10px;
    }
    .card-footer {
      border-top: 1px solid #f0f0f0;
      padding: 12px 20px;
      display: flex;
      justify-content: flex-end;
    }
    .btn-details {
      font-size: 0.82rem;
      font-weight: 600;
      color: #e65100;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-details:hover { text-decoration: none; color: #bf360c; }
    .btn-details svg { transition: transform .15s; }
    .btn-details:hover svg { transform: translateX(3px); }

    /* ── Error / empty states ─────────────────────────────────── */
    .state-message {
      max-width: 600px;
      margin: 60px auto;
      padding: 0 24px;
      text-align: center;
    }
    .state-message .icon { font-size: 3rem; margin-bottom: 12px; }
    .state-message h2 { margin-bottom: 8px; }
    .state-message p { color: #666; font-size: 0.9rem; }
    .alert-error {
      background: #fff3e0;
      border: 1px solid #ffcc80;
      border-radius: 8px;
      padding: 16px 20px;
      max-width: 800px;
      margin: 24px auto;
      font-size: 0.88rem;
      color: #bf360c;
    }

    /* ── Footer ───────────────────────────────────────────────── */
    .catalog-footer {
      text-align: center;
      padding: 32px 24px;
      font-size: 0.8rem;
      color: #aaa;
      border-top: 1px solid #e8e8e8;
      margin-top: 24px;
    }
    .catalog-footer a { color: #ff7043; }

    @media (max-width: 600px) {
      .catalog-hero h1 { font-size: 1.5rem; }
      .catalog-controls { padding: 12px 16px; }
      .catalog-grid { padding: 0 16px; gap: 14px; }
    }
  </style>
</head>
<body>

<!-- SITE HEADER: replace this comment with your site's include('header.php') -->

<header class="catalog-hero">
  <h1>Orchelium <span>Plugin Catalog</span></h1>
  <p>Official plugins for backup, databases, file sync, storage, and containers.</p>
  <div class="catalog-meta">
    <span><strong><?= $pluginCount ?></strong> plugins available</span>
    <span>Registry updated: <strong><?= $updatedDisplay ?></strong></span>
    <span><a href="https://github.com/dpembo/orchelium-plugins" target="_blank" rel="noopener"
             style="color:#ff7043;">View on GitHub ↗</a></span>
  </div>
</header>

<?php if (!$fetchOk): ?>
<div class="alert-error">
  ⚠️ Could not load the plugin registry. Please try again later.
  If the problem persists, check the
  <a href="https://github.com/dpembo/orchelium-plugins" target="_blank" rel="noopener">GitHub repository</a>
  directly.
</div>
<?php else: ?>

<!-- Controls -->
<div class="catalog-controls">
  <div class="search-wrap">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input type="search" id="pluginSearch" placeholder="Search plugins…"
           aria-label="Search plugins" autocomplete="off">
  </div>

  <div class="filter-tabs" role="group" aria-label="Filter by category">
    <button class="filter-tab active" data-cat="">
      All <span class="tab-count">(<?= $pluginCount ?>)</span>
    </button>
    <?php foreach ($categoryOrder as $cat):
      $count = count(array_filter($plugins, fn($p) => ($p['category'] ?? '') === $cat));
    ?>
    <button class="filter-tab" data-cat="<?= h($cat) ?>"
            style="--cat-color: <?= h(categoryColor($cat)) ?>">
      <?= categoryEmoji($cat) ?> <?= h(categoryLabel($cat)) ?>
      <span class="tab-count">(<?= $count ?>)</span>
    </button>
    <?php endforeach; ?>
  </div>

  <span class="result-count" id="resultCount"><?= $pluginCount ?> plugins</span>
</div>

<!-- Plugin grid (rendered server-side; JS adds filtering) -->
<div class="catalog-grid" id="pluginGrid">
<?php foreach ($plugins as $p):
  $name     = $p['name']        ?? '';
  $label    = $p['label']       ?? $name;
  $desc     = $p['description'] ?? '';
  $version  = $p['version']     ?? '';
  $cat      = $p['category']    ?? '';
  $tags     = $p['tags']        ?? [];
  $catColor = categoryColor($cat);
  $catEmoji = categoryEmoji($cat);
  $catLbl   = categoryLabel($cat);
  $path     = $p['path'] ?? '';
  $iconUrl  = $path ? ORCHELIUM_RAW_BASE . '/' . rawurlencode($path) . '/icon.svg' : '';
?>
<article class="plugin-card"
         data-name="<?= h(strtolower($label . ' ' . $desc . ' ' . implode(' ', $tags))) ?>"
         data-cat="<?= h($cat) ?>">
  <div class="card-accent" style="background: <?= h($catColor) ?>"></div>
  <div class="card-body">
    <div class="card-header">
      <?php if ($iconUrl): ?>
      <img class="card-icon" src="<?= h($iconUrl) ?>" width="40" height="40" alt="" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <div class="card-emoji" aria-hidden="true" style="display:none"><?= $catEmoji ?></div>
      <?php else: ?>
      <div class="card-emoji" aria-hidden="true"><?= $catEmoji ?></div>
      <?php endif; ?>
      <div class="card-title-group">
        <div class="card-title"><?= h($label) ?></div>
        <?php if ($version): ?>
        <div class="card-version">v<?= h($version) ?></div>
        <?php endif; ?>
        <span class="card-category" style="background: <?= h($catColor) ?>"><?= h($catLbl) ?></span>
      </div>
    </div>
    <p class="card-desc"><?= h($desc) ?></p>
    <?php if ($tags): ?>
    <div class="card-tags">
      <?php foreach ($tags as $tag): ?>
      <span class="tag"><?= h($tag) ?></span>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>
  <div class="card-footer">
    <a href="plugin.php?name=<?= urlencode($name) ?>" class="btn-details">
      Details
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
      </svg>
    </a>
  </div>
</article>
<?php endforeach; ?>
</div>

<div class="state-message" id="emptyState" style="display:none">
  <div class="icon">🔌</div>
  <h2>No plugins found</h2>
  <p>Try a different search term or remove the category filter.</p>
</div>

<?php endif; ?>

<footer class="catalog-footer">
  <p>
    Orchelium Plugin Catalog &nbsp;·&nbsp;
    <a href="https://github.com/dpembo/orchelium-plugins" target="_blank" rel="noopener">
      orchelium-plugins on GitHub
    </a>
    &nbsp;·&nbsp;
    <a href="https://github.com/dpembo/orchelium-plugins/blob/main/CONTRIBUTING.md"
       target="_blank" rel="noopener">Submit a plugin</a>
  </p>
</footer>

<!-- SITE FOOTER: replace this comment with your site's include('footer.php') -->

<script>
  (function () {
    var cards       = Array.from(document.querySelectorAll('.plugin-card'));
    var grid        = document.getElementById('pluginGrid');
    var emptyState  = document.getElementById('emptyState');
    var resultCount = document.getElementById('resultCount');
    var searchInput = document.getElementById('pluginSearch');
    var tabs        = Array.from(document.querySelectorAll('.filter-tab'));
    var activeCat   = '';

    function filterCards() {
      var query = (searchInput ? searchInput.value : '').toLowerCase().trim();
      var shown = 0;

      cards.forEach(function (card) {
        var matchCat  = !activeCat || card.dataset.cat === activeCat;
        var matchText = !query || card.dataset.name.includes(query);
        var visible   = matchCat && matchText;
        card.style.display = visible ? '' : 'none';
        if (visible) shown++;
      });

      resultCount.textContent = shown + ' plugin' + (shown !== 1 ? 's' : '');
      emptyState.style.display = shown === 0 ? 'block' : 'none';
      grid.style.display = shown === 0 ? 'none' : '';
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        activeCat = tab.dataset.cat;
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        filterCards();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', filterCards);
    }
  })();
</script>
</body>
</html>
