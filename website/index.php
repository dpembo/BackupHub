<?php
/**
 * index.php — Orchelium landing page
 * orchelium.com
 */

$pageTitle       = 'Orchelium — Backup Orchestration for Home Labs';
$pageDescription = 'Centralized, unified backup orchestration across Proxmox, NAS servers, ZFS, containers, and your entire home lab. Free and open source.';
$pageCanonical   = 'https://orchelium.com/';
$siteBase        = '/';
$cssBase         = '/';
$activePage      = 'home';

$extraHead = <<<HTML
<style>
/* ── Landing-page-only styles ────────────────────────────────── */

/* Hero */
.hero {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px 60px;
  background:
    radial-gradient(ellipse 80% 60% at 60% -10%, rgba(255,112,67,0.12) 0%, transparent 70%),
    radial-gradient(ellipse 50% 40% at 10% 60%, rgba(255,112,67,0.06) 0%, transparent 60%),
    var(--bg);
  text-align: center;
  position: relative;
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 100%);
  pointer-events: none;
}
.hero-inner { position: relative; z-index: 1; max-width: 800px; }

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,112,67,.1);
  border: 1px solid rgba(255,112,67,.3);
  border-radius: 20px;
  padding: 5px 14px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #ff9166;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 28px;
}
.hero-badge svg { width: 14px; height: 14px; }

.hero h1 {
  font-size: clamp(2.4rem, 5vw, 3.8rem);
  font-weight: 800;
  line-height: 1.1;
  color: var(--text);
  margin-bottom: 20px;
  letter-spacing: -.02em;
}
.hero h1 .accent { color: var(--accent); }
.hero h1 .line2 { display: block; color: var(--text-muted); font-weight: 600; font-size: 0.7em; letter-spacing: -.01em; margin-top: 6px; }

.hero-sub {
  font-size: 1.15rem;
  color: var(--text-muted);
  max-width: 580px;
  margin: 0 auto 36px;
  line-height: 1.65;
}
.hero-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 52px; }

/* Workflow demo */
.workflow-demo {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px 18px;
  max-width: 640px;
  margin: 0 auto;
  text-align: left;
  font-family: var(--mono);
  font-size: 0.78rem;
}
.wf-label {
  font-size: 0.7rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 16px;
  font-family: var(--font);
  font-weight: 600;
}
.wf-nodes {
  display: flex;
  align-items: center;
  gap: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 4px;
}
.wf-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.wf-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1.5px solid var(--border-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  background: var(--bg-3);
  flex-shrink: 0;
}
.wf-name {
  font-size: 0.64rem;
  color: var(--text-muted);
  font-family: var(--font);
  text-align: center;
  white-space: nowrap;
  max-width: 56px;
}
.wf-arrow {
  color: var(--text-dim);
  font-size: 1.1rem;
  margin: 0 4px;
  flex-shrink: 0;
  padding-bottom: 18px;
}

/* Pain section */
.pain { background: var(--bg-2); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.section { padding: 80px 24px; }
.section-inner { max-width: 1100px; margin: 0 auto; }
.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--accent);
  margin-bottom: 12px;
}
.section-title {
  font-size: clamp(1.6rem, 3.5vw, 2.4rem);
  font-weight: 800;
  color: var(--text);
  line-height: 1.2;
  margin-bottom: 16px;
  letter-spacing: -.02em;
}
.section-sub {
  font-size: 1rem;
  color: var(--text-muted);
  max-width: 560px;
  line-height: 1.65;
}
.section-centered { text-align: center; }
.section-centered .section-sub { margin: 0 auto; }

.pain-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  margin-top: 48px;
  align-items: start;
}
.pain-list { display: flex; flex-direction: column; gap: 12px; }
.pain-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-3);
  border: 1px solid var(--border);
  font-size: 0.88rem;
  color: var(--text-muted);
}
.pain-item .pi { font-size: 1.1rem; flex-shrink: 0; margin-top: 1px; }
.pain-solution {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: var(--radius);
  padding: 28px;
}
.pain-solution h3 {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 16px;
}
.solution-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.solution-item .check { color: var(--green); flex-shrink: 0; font-size: 1rem; }
.solution-item strong { color: var(--text); }

/* How it works */
.steps {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 52px;
}
.step {
  flex: 1;
  text-align: center;
  padding: 28px 20px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.step-arrow {
  flex-shrink: 0;
  color: var(--text-dim);
  font-size: 1.4rem;
  padding: 0 6px;
  line-height: 1;
  margin-bottom: 30px;
}
.step-num {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-glow);
  border: 1.5px solid rgba(255,112,67,.4);
  color: var(--accent);
  font-weight: 800;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
}
.step-icon { font-size: 2rem; margin-bottom: 12px; }
.step h3 { font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.step p { font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; }

/* Features */
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 52px;
}
.feature-card {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  transition: border-color .2s, box-shadow .2s;
}
.feature-card:hover { border-color: var(--border-2); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
.feature-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--accent-glow);
  border: 1px solid rgba(255,112,67,.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  margin-bottom: 16px;
}
.feature-card h3 { font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 8px; }
.feature-card p { font-size: 0.85rem; color: var(--text-muted); line-height: 1.55; }

/* Tools */
.tools-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 36px;
}
.tool-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 24px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-muted);
  transition: border-color .15s, color .15s;
}
.tool-pill .tp { font-size: 1.1rem; }

/* Plugin teaser */
.plugin-teaser-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-top: 44px;
}
.pcat-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 14px;
  text-align: center;
  transition: border-color .2s, background .2s;
}
.pcat-card:hover { border-color: var(--border-2); background: var(--bg-3); }
.pcat-icon { font-size: 2rem; margin-bottom: 8px; }
.pcat-name { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
.pcat-count { font-size: 0.72rem; color: var(--text-dim); margin-top: 2px; }
.plugin-teaser-cta { text-align: center; margin-top: 32px; }
.plugin-teaser-cta p { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px; }

/* Automation */
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  margin-top: 44px;
}
.auto-item {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
  color: var(--text-muted);
  font-weight: 500;
}
.auto-item .ai { font-size: 1.2rem; }

/* Get started */
.gs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  margin-top: 52px;
  align-items: start;
}
.gs-card {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px;
}
.gs-card h3 { font-size: 1.05rem; font-weight: 700; color: var(--text); margin-bottom: 8px; }
.gs-card p { font-size: 0.88rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.55; }
.code-block {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px 18px;
  font-family: var(--mono);
  font-size: 0.8rem;
  color: #a0e080;
  line-height: 1.7;
  overflow-x: auto;
  margin-bottom: 20px;
}
.code-comment { color: var(--text-dim); }
.code-cmd { color: var(--accent); }

.repo-cards { display: flex; flex-direction: column; gap: 12px; }
.repo-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-sm);
  padding: 16px 20px;
  text-decoration: none !important;
  transition: border-color .15s, background .15s;
}
.repo-card:hover { border-color: rgba(255,112,67,.5); background: var(--bg-3); }
.repo-icon { font-size: 1.6rem; flex-shrink: 0; }
.repo-info h4 { font-size: 0.9rem; font-weight: 700; color: var(--text); margin-bottom: 3px; }
.repo-info p { font-size: 0.8rem; color: var(--text-muted); }
.repo-arrow { margin-left: auto; color: var(--text-dim); font-size: 1.2rem; }

/* Responsive */
@media (max-width: 960px) {
  .features-grid { grid-template-columns: repeat(2, 1fr); }
  .steps { flex-wrap: wrap; gap: 16px; }
  .step { flex: 1 1 calc(50% - 8px); }
  .step-arrow { display: none; }
  .plugin-teaser-grid { grid-template-columns: repeat(3, 1fr); }
  .gs-grid { grid-template-columns: 1fr; }
  .pain-grid { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .hero { padding: 60px 20px 48px; }
  .hero h1 { font-size: 2rem; }
  .hero-sub { font-size: 0.97rem; }
  .section { padding: 60px 20px; }
  .features-grid { grid-template-columns: 1fr; }
  .steps { grid-template-columns: 1fr; }
  .plugin-teaser-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
HTML;

require_once __DIR__ . '/includes/header.php';
?>

<!-- ═══ HERO ══════════════════════════════════════════════════════ -->
<section class="hero">
  <div class="hero-inner">
    <div class="hero-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Free &amp; Open Source
    </div>

    <h1>
      Backup Orchestration
      <span class="line2">for Your Home Lab</span>
    </h1>

    <p class="hero-sub">
      Centralized, unified backup workflows across Proxmox, NAS servers, ZFS pools,
      containers, and everything else in your home lab &mdash; from one visual interface.
    </p>

    <div class="hero-ctas">
      <a href="https://github.com/dpembo/orchelium" class="btn btn-primary" target="_blank" rel="noopener">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.014-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/></svg>
        Get Started on GitHub
      </a>
      <a href="/plugins/" class="btn btn-secondary">Browse Plugins &rarr;</a>
    </div>

    <!-- Mini workflow diagram -->
    <div class="workflow-demo">
      <div class="wf-label">Example: Nightly Proxmox Backup Chain</div>
      <div class="wf-nodes">
        <div class="wf-node"><div class="wf-icon">&#x23F0;</div><div class="wf-name">Schedule</div></div>
        <div class="wf-arrow">&#x2192;</div>
        <div class="wf-node"><div class="wf-icon">&#x1F5C2;&#xFE0F;</div><div class="wf-name">ZFS Snapshot</div></div>
        <div class="wf-arrow">&#x2192;</div>
        <div class="wf-node"><div class="wf-icon">&#x1F4E6;</div><div class="wf-name">Restic Backup</div></div>
        <div class="wf-arrow">&#x2192;</div>
        <div class="wf-node"><div class="wf-icon">&#x2705;</div><div class="wf-name">Verify</div></div>
        <div class="wf-arrow">&#x2192;</div>
        <div class="wf-node"><div class="wf-icon">&#x1F504;</div><div class="wf-name">Sync Offsite</div></div>
        <div class="wf-arrow">&#x2192;</div>
        <div class="wf-node"><div class="wf-icon">&#x1F514;</div><div class="wf-name">Notify</div></div>
      </div>
    </div>
  </div>
</section>

<!-- ═══ THE PROBLEM ═══════════════════════════════════════════════ -->
<section class="pain section">
  <div class="section-inner">
    <div class="section-label">The Problem</div>
    <div class="pain-grid">
      <div>
        <h2 class="section-title">Your home lab backups are scattered everywhere</h2>
        <p class="section-sub" style="margin-bottom:28px;">
          Every system has its own schedule, its own script, its own log. There&rsquo;s no unified view,
          no coordinated verification, and no single place to know if last night&rsquo;s backups actually worked.
        </p>
        <div class="pain-list">
          <div class="pain-item"><span class="pi">&#x1F5A5;&#xFE0F;</span> Proxmox backups on their own schedule, buried in datacenter config</div>
          <div class="pain-item"><span class="pi">&#x1F4BF;</span> ZFS snapshots managed separately on each NAS pool</div>
          <div class="pain-item"><span class="pi">&#x1F4DC;</span> rsync cron jobs scattered across half a dozen machines</div>
          <div class="pain-item"><span class="pi">&#x1F4E6;</span> Restic and Borg jobs you haven&rsquo;t verified in months</div>
          <div class="pain-item"><span class="pi">&#x2601;&#xFE0F;</span> Offsite sync that may or may not be running</div>
          <div class="pain-item"><span class="pi">&#x1F4CA;</span> No unified log, no central alert, no single dashboard</div>
        </div>
      </div>
      <div class="pain-solution">
        <h3>Orchelium fixes this</h3>
        <div class="solution-item"><span class="check">&#x2713;</span><div><strong>One place to orchestrate</strong> every backup across your entire home lab</div></div>
        <div class="solution-item"><span class="check">&#x2713;</span><div><strong>Visual workflow builder</strong> with drag-and-drop multi-node chains</div></div>
        <div class="solution-item"><span class="check">&#x2713;</span><div><strong>Unified scheduling</strong> with cron or interval triggers</div></div>
        <div class="solution-item"><span class="check">&#x2713;</span><div><strong>Pre/post scripts</strong> for quiescing VMs, mounting pools, and more</div></div>
        <div class="solution-item"><span class="check">&#x2713;</span><div><strong>Centralised logs</strong> and real-time monitoring for every job</div></div>
        <div class="solution-item"><span class="check">&#x2713;</span><div><strong>Instant alerts</strong> via Discord, Telegram, or email when something fails</div></div>
        <div class="solution-item"><span class="check">&#x2713;</span><div><strong>Agent-based</strong> &mdash; runs scripts on any Linux node in your lab</div></div>
      </div>
    </div>
  </div>
</section>

<!-- ═══ HOW IT WORKS ══════════════════════════════════════════════ -->
<section class="section">
  <div class="section-inner section-centered">
    <div class="section-label">How It Works</div>
    <h2 class="section-title">From zero to orchestrated backups in minutes</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-icon">&#x1F433;</div>
        <h3>Deploy the Hub</h3>
        <p>Run one Docker container on any machine. The hub is the control plane &mdash; dashboard, scheduler, and engine in one.</p>
      </div>
      <div class="step-arrow" aria-hidden="true">&#x27A1;&#xFE0F;</div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-icon">&#x1F916;</div>
        <h3>Install Agents</h3>
        <p>Drop a lightweight agent on each node &mdash; Proxmox hosts, NAS servers, VMs, Docker hosts.</p>
      </div>
      <div class="step-arrow" aria-hidden="true">&#x27A1;&#xFE0F;</div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-icon">&#x1F9E9;</div>
        <h3>Install Plugins</h3>
        <p>Browse the plugin catalog and install the tools you need: Restic, Borg, ZFS, rsync, rclone, and more.</p>
      </div>
      <div class="step-arrow" aria-hidden="true">&#x27A1;&#xFE0F;</div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-icon">&#x1F680;</div>
        <h3>Build Workflows</h3>
        <p>Chain plugin nodes in the visual builder. Schedule, monitor, and receive alerts &mdash; all in one place.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══ TIER 1: BACKUP-FIRST FEATURES ════════════════════════════ -->
<section class="section" style="background:var(--bg-2);border-top:1px solid var(--border);border-bottom:1px solid var(--border);">
  <div class="section-inner">
    <div class="section-label">Backup-First</div>
    <h2 class="section-title">Built around the workflows you actually need</h2>
    <p class="section-sub">Every feature was designed for the specific challenges of home-lab backup orchestration &mdash; not a generic automation tool with backup bolted on.</p>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">&#x1F5A5;&#xFE0F;</div>
        <h3>Proxmox Orchestration</h3>
        <p>Snapshot, backup, and verify Proxmox VMs and LXC containers. Chain operations across multiple Proxmox hosts in a single workflow.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F4BF;</div>
        <h3>ZFS Snapshot &amp; Replication</h3>
        <p>Create ZFS snapshots, send them to remote pools, prune old snapshots, and verify integrity &mdash; all coordinated in one workflow.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F4E6;</div>
        <h3>Restic &amp; Borg Integration</h3>
        <p>Run, check, prune, and restore Restic and Borg backups. Structured output lets downstream nodes react to results automatically.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F504;</div>
        <h3>Rsync &amp; Rclone Sync</h3>
        <p>Sync between local paths, remote hosts, or cloud storage. Use rsync for local networks and rclone for S3, Backblaze B2, and more.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F4DC;</div>
        <h3>Pre / Post Scripts</h3>
        <p>Run quiesce scripts before backup starts and cleanup scripts after. Database dumps, service stops, mount operations &mdash; all in the chain.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x2705;</div>
        <h3>Backup Verification</h3>
        <p>Chain a verification step after every backup. Jobs that fail verification trigger immediate alerts and block downstream steps.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F514;</div>
        <h3>Failure Alerts</h3>
        <p>Instant notifications via Discord, Telegram, or email when any step fails. Know about problems before you need the backup.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F5C4;&#xFE0F;</div>
        <h3>Database Backups</h3>
        <p>Native plugins for MySQL, PostgreSQL, and SQLite. Dump, compress, and ship database backups as part of larger orchestration chains.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F310;</div>
        <h3>Multi-Node Chains</h3>
        <p>Orchestrate backup workflows that span multiple agents &mdash; snapshot on host A, replicate to host B, verify on host C, notify on success.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══ SUPPORTED TOOLS ═══════════════════════════════════════════ -->
<section class="section" style="border-bottom:1px solid var(--border);">
  <div class="section-inner section-centered">
    <div class="section-label">Supported Tools</div>
    <h2 class="section-title">Plugins for every tool in your home lab</h2>
    <div class="tools-grid">
      <span class="tool-pill"><span class="tp">&#x1F3F4;</span> Restic</span>
      <span class="tool-pill"><span class="tp">&#x1F3F0;</span> Borg / Borgmatic</span>
      <span class="tool-pill"><span class="tp">&#x1F504;</span> rsync</span>
      <span class="tool-pill"><span class="tp">&#x2601;&#xFE0F;</span> rclone</span>
      <span class="tool-pill"><span class="tp">&#x1F4BF;</span> ZFS</span>
      <span class="tool-pill"><span class="tp">&#x1F5A5;&#xFE0F;</span> Proxmox VE</span>
      <span class="tool-pill"><span class="tp">&#x1F4E6;</span> Proxmox Backup Server</span>
      <span class="tool-pill"><span class="tp">&#x1F433;</span> Docker</span>
      <span class="tool-pill"><span class="tp">&#x1F4E6;</span> LXC / LXD</span>
      <span class="tool-pill"><span class="tp">&#x1F5C4;&#xFE0F;</span> MySQL / MariaDB</span>
      <span class="tool-pill"><span class="tp">&#x1F418;</span> PostgreSQL</span>
      <span class="tool-pill"><span class="tp">&#x1F4BE;</span> SQLite</span>
      <span class="tool-pill"><span class="tp">&#x1F30A;</span> TrueNAS</span>
      <span class="tool-pill"><span class="tp">&#x2601;&#xFE0F;</span> S3 / Backblaze B2</span>
      <span class="tool-pill"><span class="tp">&#x1F5DC;&#xFE0F;</span> tar</span>
      <span class="tool-pill"><span class="tp">&#x1F510;</span> Bitwarden</span>
      <span class="tool-pill"><span class="tp">&#x2699;&#xFE0F;</span> systemd</span>
      <span class="tool-pill"><span class="tp">&#x1F50C;</span> Wake-on-LAN</span>
    </div>
  </div>
</section>

<!-- ═══ PLUGIN ECOSYSTEM ══════════════════════════════════════════ -->
<section class="section" style="background:var(--bg-2);border-bottom:1px solid var(--border);">
  <div class="section-inner section-centered">
    <div class="section-label">Plugin Ecosystem</div>
    <h2 class="section-title">19+ official plugins, one-click install</h2>
    <p class="section-sub">
      Every tool is a plugin. Browse the official catalog, install with one click from inside Orchelium,
      and get updates automatically. Or write your own with a simple YAML + shell script.
    </p>
    <div class="plugin-teaser-grid">
      <div class="pcat-card"><div class="pcat-icon">&#x1F4BE;</div><div class="pcat-name">Backup</div><div class="pcat-count">8 plugins</div></div>
      <div class="pcat-card"><div class="pcat-icon">&#x1F5C4;&#xFE0F;</div><div class="pcat-name">Databases</div><div class="pcat-count">3 plugins</div></div>
      <div class="pcat-card"><div class="pcat-icon">&#x1F504;</div><div class="pcat-name">File Sync</div><div class="pcat-count">3 plugins</div></div>
      <div class="pcat-card"><div class="pcat-icon">&#x1F4BF;</div><div class="pcat-name">Storage</div><div class="pcat-count">4 plugins</div></div>
      <div class="pcat-card"><div class="pcat-icon">&#x1F4E6;</div><div class="pcat-name">Containers</div><div class="pcat-count">2 plugins</div></div>
      <div class="pcat-card"><div class="pcat-icon">&#x2699;&#xFE0F;</div><div class="pcat-name">System</div><div class="pcat-count">2 plugins</div></div>
    </div>
    <div class="plugin-teaser-cta">
      <p>Plugins are open source and community-contributed. Missing something? Write one in 30 minutes.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <a href="/plugins/" class="btn btn-primary">Browse All Plugins</a>
        <a href="https://github.com/dpembo/orchelium-plugins" class="btn btn-secondary" target="_blank" rel="noopener">orchelium-plugins on GitHub &rarr;</a>
      </div>
    </div>
  </div>
</section>

<!-- ═══ TIER 2: GENERAL AUTOMATION ═══════════════════════════════ -->
<section class="section">
  <div class="section-inner">
    <div class="section-label">And More</div>
    <h2 class="section-title">Once your backups are sorted, the engine keeps working</h2>
    <p class="section-sub">
      Orchelium&rsquo;s flexible automation engine doesn&rsquo;t stop at backups. Once it&rsquo;s running on your nodes,
      you&rsquo;ll naturally start using it for everything else.
    </p>
    <div class="auto-grid">
      <div class="auto-item"><span class="ai">&#x1F550;</span> Scheduled Jobs</div>
      <div class="auto-item"><span class="ai">&#x1F4CB;</span> Script Execution</div>
      <div class="auto-item"><span class="ai">&#x1F500;</span> Conditional Logic</div>
      <div class="auto-item"><span class="ai">&#x1F333;</span> Parallel Branches</div>
      <div class="auto-item"><span class="ai">&#x1FA9D;</span> Webhook Triggers</div>
      <div class="auto-item"><span class="ai">&#x1F4E1;</span> Event-Driven Jobs</div>
      <div class="auto-item"><span class="ai">&#x1F527;</span> Maintenance Tasks</div>
      <div class="auto-item"><span class="ai">&#x1FA7A;</span> Health Checks</div>
      <div class="auto-item"><span class="ai">&#x1F501;</span> Container Restarts</div>
      <div class="auto-item"><span class="ai">&#x1F9F9;</span> Cleanup Jobs</div>
      <div class="auto-item"><span class="ai">&#x1F4CA;</span> Metrics &amp; Thresholds</div>
      <div class="auto-item"><span class="ai">&#x1F4EC;</span> Notifications</div>
    </div>
  </div>
</section>

<!-- ═══ GET STARTED ═══════════════════════════════════════════════ -->
<section class="section" style="background:var(--bg-2);border-top:1px solid var(--border);">
  <div class="section-inner">
    <div class="section-label">Get Started</div>
    <h2 class="section-title">Free and open source. Deploy in minutes.</h2>
    <div class="gs-grid">
      <div class="gs-card">
        <h3>Deploy with Docker</h3>
        <p>The hub runs as a single Docker container. Mount a data volume, open port 3000, and you&rsquo;re ready.</p>
        <pre class="code-block"><span class="code-comment"># Pull and run the Orchelium hub</span>
<span class="code-cmd">docker pull ghcr.io/dpembo/orchelium:latest</span>

<span class="code-cmd">docker run -d \</span>
<span class="code-cmd">  --name orchelium \</span>
<span class="code-cmd">  -p 3000:3000 \</span>
<span class="code-cmd">  -v orchelium-data:/app/data \</span>
<span class="code-cmd">  ghcr.io/dpembo/orchelium:latest</span>

<span class="code-comment"># Open http://localhost:3000</span></pre>
        <a href="https://github.com/dpembo/orchelium/blob/main/docs/installation.md"
           class="btn btn-secondary btn-sm" target="_blank" rel="noopener">
          Full Installation Guide &rarr;
        </a>
      </div>
      <div class="repo-cards">
        <a href="https://github.com/dpembo/orchelium" class="repo-card" target="_blank" rel="noopener">
          <span class="repo-icon">&#x1F537;</span>
          <div class="repo-info">
            <h4>dpembo/orchelium</h4>
            <p>Hub, agents, orchestration engine, and the web UI</p>
          </div>
          <span class="repo-arrow">&rarr;</span>
        </a>
        <a href="https://github.com/dpembo/orchelium-plugins" class="repo-card" target="_blank" rel="noopener">
          <span class="repo-icon">&#x1F9E9;</span>
          <div class="repo-info">
            <h4>dpembo/orchelium-plugins</h4>
            <p>Official plugin registry &mdash; 19+ plugins for backup, sync, databases, and more</p>
          </div>
          <span class="repo-arrow">&rarr;</span>
        </a>
        <a href="/plugins/" class="repo-card">
          <span class="repo-icon">&#x1F5C2;&#xFE0F;</span>
          <div class="repo-info">
            <h4>Plugin Browser</h4>
            <p>Browse, search, and preview all available plugins</p>
          </div>
          <span class="repo-arrow">&rarr;</span>
        </a>
        <a href="https://github.com/dpembo/orchelium/tree/main/docs" class="repo-card" target="_blank" rel="noopener">
          <span class="repo-icon">&#x1F4D6;</span>
          <div class="repo-info">
            <h4>Documentation</h4>
            <p>Installation, orchestrations, REST API, webhooks, and more</p>
          </div>
          <span class="repo-arrow">&rarr;</span>
        </a>
      </div>
    </div>
  </div>
</section>

<?php require_once __DIR__ . '/includes/footer.php'; ?>
