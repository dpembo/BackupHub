<?php
/**
 * plugin.php — Orchelium Plugin Detail Page
 *
 * Usage: plugin.php?name=rsync
 *
 * Include plugins-registry.php from the same directory.
 */

require_once __DIR__ . '/plugins-registry.php';

// ─── Input validation ─────────────────────────────────────────────────────────

$rawName = $_GET['name'] ?? '';

if (!validatePluginName($rawName)) {
    http_response_code(404);
    $errorMsg = 'Plugin not found.';
    $plugin   = null;
} else {
    $registry = orchelium_fetchRegistry();
    $plugins  = $registry['plugins'] ?? [];

    // Find the plugin by name (exact match)
    $plugin = null;
    foreach ($plugins as $p) {
        if (($p['name'] ?? '') === $rawName) {
            $plugin = $p;
            break;
        }
    }

    if ($plugin === null) {
        http_response_code(404);
        $errorMsg = 'Plugin "' . h($rawName) . '" was not found in the registry.';
    }
}

// ─── Prepare display values ───────────────────────────────────────────────────

if ($plugin) {
    $name       = $plugin['name']               ?? '';
    $label      = $plugin['label']              ?? $name;
    $desc       = $plugin['description']        ?? '';
    $version    = $plugin['version']            ?? '';
    $cat        = $plugin['category']           ?? '';
    $tags       = $plugin['tags']               ?? [];
    $official   = $plugin['official']           ?? false;
    $repoPath   = $plugin['path']               ?? $name;
    $minVersion = $plugin['minOrcheliumVersion'] ?? '';

    $catColor = categoryColor($cat);
    $catEmoji = categoryEmoji($cat);
    $catLabel = categoryLabel($cat);

    $githubDirUrl = 'https://github.com/dpembo/orchelium-plugins/tree/main/' . rawurlencode($repoPath);
    $iconUrl      = $repoPath ? ORCHELIUM_RAW_BASE . '/' . rawurlencode($repoPath) . '/icon.svg' : '';
    $pageTitle    = h($label) . ' — Orchelium Plugin';
} else {
    $pageTitle = 'Plugin Not Found — Orchelium';
}

?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $pageTitle ?></title>
  <?php if ($plugin): ?>
  <meta name="description" content="<?= h(mb_strimwidth($desc, 0, 160, '…')) ?>">
  <?php endif; ?>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    a { color: #e65100; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── Hero ─────────────────────────────────────────────────── */
    .detail-hero {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #fff;
      padding: 40px 24px 36px;
    }
    .breadcrumb {
      font-size: 0.82rem;
      color: #888;
      margin-bottom: 18px;
    }
    .breadcrumb a { color: #ff7043; }
    .breadcrumb span { margin: 0 6px; }
    .hero-inner {
      max-width: 900px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .hero-emoji {
      font-size: 3.5rem;
      line-height: 1;
      flex-shrink: 0;
    }
    .hero-icon {
      width: 64px;
      height: 64px;
      flex-shrink: 0;
      border-radius: 10px;
    }
    .hero-text h1 {
      font-size: 1.9rem;
      font-weight: 700;
    }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 10px;
      align-items: center;
    }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 12px;
      color: #fff;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .badge-official {
      background: #ff7043;
    }
    .badge-version {
      background: #444;
      text-transform: none;
      letter-spacing: 0;
      font-weight: 400;
    }

    /* ── Content ──────────────────────────────────────────────── */
    .detail-content {
      max-width: 900px;
      margin: 32px auto;
      padding: 0 24px;
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 28px;
      align-items: start;
    }
    @media (max-width: 700px) {
      .detail-content { grid-template-columns: 1fr; }
    }

    /* Main column */
    .section { margin-bottom: 28px; }
    .section h2 {
      font-size: 1rem;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #f0f0f0;
    }
    .description-text {
      font-size: 0.95rem;
      color: #444;
      line-height: 1.7;
    }

    .tags-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      font-size: 0.8rem;
      padding: 4px 12px;
      background: #f0f0f0;
      color: #555;
      border-radius: 14px;
    }

    /* Install box */
    .install-box {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .install-box-header {
      padding: 12px 16px;
      font-weight: 600;
      font-size: 0.88rem;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .install-box-body {
      padding: 14px 16px;
      font-size: 0.85rem;
      color: #444;
      line-height: 1.6;
    }
    .install-box-body ol, .install-box-body ul {
      padding-left: 18px;
    }
    .install-box-body li { margin-bottom: 4px; }
    code {
      font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
      font-size: 0.82em;
      background: #f3f3f3;
      padding: 1px 5px;
      border-radius: 4px;
    }

    /* Sidebar */
    .sidebar-card {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .sidebar-card-header {
      padding: 10px 16px;
      font-size: 0.82rem;
      font-weight: 700;
      color: #fff;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .sidebar-table {
      width: 100%;
      font-size: 0.84rem;
    }
    .sidebar-table td {
      padding: 9px 16px;
      vertical-align: middle;
      border-bottom: 1px solid #f5f5f5;
    }
    .sidebar-table td:first-child {
      color: #888;
      font-weight: 500;
      width: 40%;
    }
    .sidebar-table td:last-child {
      color: #222;
      font-weight: 400;
    }
    .sidebar-table tr:last-child td { border-bottom: none; }

    .sidebar-links {
      padding: 10px 16px;
    }
    .sidebar-links a {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      font-size: 0.85rem;
      border-bottom: 1px solid #f5f5f5;
      color: #333;
    }
    .sidebar-links a:last-child { border-bottom: none; }
    .sidebar-links a:hover { color: #e65100; text-decoration: none; }

    /* ── 404 state ────────────────────────────────────────────── */
    .error-block {
      max-width: 500px;
      margin: 80px auto;
      padding: 0 24px;
      text-align: center;
    }
    .error-block .icon { font-size: 3rem; margin-bottom: 16px; }
    .error-block h1 { margin-bottom: 8px; }
    .error-block p { color: #666; margin-bottom: 20px; }
    .btn-back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ff7043;
      color: #fff;
      padding: 10px 22px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .btn-back:hover { background: #e64a19; text-decoration: none; }

    /* ── Footer ───────────────────────────────────────────────── */
    .page-footer {
      text-align: center;
      padding: 28px 24px;
      font-size: 0.8rem;
      color: #aaa;
      border-top: 1px solid #e8e8e8;
      margin-top: 24px;
    }
    .page-footer a { color: #ff7043; }
  </style>
</head>
<body>

<!-- SITE HEADER: replace this comment with your site's include('header.php') -->

<?php if (!$plugin): ?>

<div class="error-block">
  <div class="icon">🔌</div>
  <h1>Plugin Not Found</h1>
  <p><?= $errorMsg ?? 'The requested plugin does not exist.' ?></p>
  <a href="plugins.php" class="btn-back">← Back to Catalog</a>
</div>

<?php else: ?>

<!-- ── Hero ─────────────────────────────────────────────────────── -->
<header class="detail-hero">
  <div style="max-width:900px;margin:0 auto;">
    <nav class="breadcrumb">
      <a href="/plugins">Plugin Catalog</a>
      <span>›</span>
      <?= h($label) ?>
    </nav>
    <div class="hero-inner">
      <?php if (!empty($iconUrl)): ?>
      <img class="hero-icon" src="<?= h($iconUrl) ?>" width="64" height="64" alt="" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <div class="hero-emoji" aria-hidden="true" style="display:none"><?= $catEmoji ?></div>
      <?php else: ?>
      <div class="hero-emoji" aria-hidden="true"><?= $catEmoji ?></div>
      <?php endif; ?>
      <div class="hero-text">
        <h1><?= h($label) ?></h1>
        <div class="hero-meta">
          <?php if ($version): ?>
          <span class="badge badge-version">v<?= h($version) ?></span>
          <?php endif; ?>
          <span class="badge" style="background: <?= h($catColor) ?>"><?= h($catLabel) ?></span>
          <?php if ($official): ?>
          <span class="badge badge-official">Official</span>
          <?php endif; ?>
          <?php if ($minVersion): ?>
          <span style="font-size:0.8rem;color:#888;">Requires Orchelium ≥ <?= h($minVersion) ?></span>
          <?php endif; ?>
        </div>
      </div>
    </div>
  </div>
</header>

<!-- ── Body ─────────────────────────────────────────────────────── -->
<div class="detail-content">

  <!-- Main column -->
  <main>
    <div class="section">
      <h2>Description</h2>
      <p class="description-text"><?= nl2br(h($desc)) ?></p>
    </div>

    <?php if ($tags): ?>
    <div class="section">
      <h2>Tags</h2>
      <div class="tags-list">
        <?php foreach ($tags as $tag): ?>
        <span class="tag"><?= h($tag) ?></span>
        <?php endforeach; ?>
      </div>
    </div>
    <?php endif; ?>

    <div class="section">
      <h2>Installation</h2>

      <!-- Plugin Manager (recommended) -->
      <div class="install-box">
        <div class="install-box-header" style="background: <?= h($catColor) ?>">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          Via Plugin Manager (Recommended)
        </div>
        <div class="install-box-body">
          <ol>
            <li>Open Orchelium and go to your <strong>Profile</strong> menu → <strong>Plugin Manager</strong>.</li>
            <li>Find <strong><?= h($label) ?></strong> in the catalog.</li>
            <li>Click <strong>Install</strong>. The plugin will be downloaded and activated automatically.</li>
          </ol>
        </div>
      </div>

      <!-- Manual install -->
      <div class="install-box">
        <div class="install-box-header" style="background: #424242;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
          Manual Install
        </div>
        <div class="install-box-body">
          <ol>
            <li>
              Download the plugin files from GitHub:<br>
              <code><?= h($githubDirUrl) ?></code>
            </li>
            <li>
              Copy the folder to your Orchelium <code>plugins/</code> directory as
              <code>plugins/<?= h($repoPath) ?>/</code>
            </li>
            <li>Orchelium detects and loads the plugin automatically — no restart needed.</li>
          </ol>
        </div>
      </div>
    </div>
  </main>

  <!-- Sidebar -->
  <aside>
    <div class="sidebar-card">
      <div class="sidebar-card-header" style="background: <?= h($catColor) ?>">Details</div>
      <table class="sidebar-table">
        <tr><td>Version</td><td><?= $version ? h($version) : '—' ?></td></tr>
        <tr><td>Category</td><td><?= h($catLabel) ?></td></tr>
        <tr><td>Official</td><td><?= $official ? '✅ Yes' : 'No' ?></td></tr>
        <?php if ($minVersion): ?>
        <tr><td>Min Orchelium</td><td><?= h($minVersion) ?></td></tr>
        <?php endif; ?>
        <tr><td>Repo path</td><td><code><?= h($repoPath) ?></code></td></tr>
      </table>
    </div>

    <div class="sidebar-card">
      <div class="sidebar-card-header" style="background: #424242;">Links</div>
      <div class="sidebar-links">
        <a href="<?= h($githubDirUrl) ?>" target="_blank" rel="noopener">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77A5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
          </svg>
          View on GitHub
        </a>
        <a href="https://github.com/dpembo/orchelium-plugins/blob/main/<?= rawurlencode($repoPath) ?>/plugin.yaml"
           target="_blank" rel="noopener">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          plugin.yaml
        </a>
        <a href="https://github.com/dpembo/orchelium-plugins/blob/main/CONTRIBUTING.md"
           target="_blank" rel="noopener">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Submit / contribute
        </a>
        <a href="plugins.php">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to catalog
        </a>
      </div>
    </div>
  </aside>

</div>

<?php endif; ?>

<footer class="page-footer">
  <p>
    Orchelium Plugin Catalog &nbsp;·&nbsp;
    <a href="https://github.com/dpembo/orchelium-plugins" target="_blank" rel="noopener">
      orchelium-plugins on GitHub
    </a>
  </p>
</footer>

<!-- SITE FOOTER: replace this comment with your site's include('footer.php') -->

</body>
</html>
