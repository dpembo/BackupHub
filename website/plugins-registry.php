<?php
/**
 * plugins-registry.php
 * Shared helper — fetches and caches the Orchelium plugin registry from GitHub.
 *
 * Include this file in plugins.php and plugin.php.
 * No output is produced; it just defines fetchRegistry() and helpers.
 */

define('ORCHELIUM_REGISTRY_URL',
    'https://raw.githubusercontent.com/dpembo/orchelium-plugins/main/registry.json');

define('ORCHELIUM_RAW_BASE',
    rtrim(str_replace('/registry.json', '', ORCHELIUM_REGISTRY_URL), '/'));

define('ORCHELIUM_REGISTRY_CACHE',
    sys_get_temp_dir() . '/orchelium-plugin-registry.json');

define('ORCHELIUM_REGISTRY_CACHE_TTL', 600); // seconds (10 min)

/** Plugin name must match this pattern — enforced before any lookup. */
define('PLUGIN_NAME_PATTERN', '/^[a-z0-9][a-z0-9\-]{0,63}$/');

// ─── Category display metadata ────────────────────────────────────────────────

const CATEGORY_META = [
    'backup'    => ['label' => 'Backup',      'emoji' => '💾', 'color' => '#e65100'],
    'databases' => ['label' => 'Databases',   'emoji' => '🗄️',  'color' => '#1565c0'],
    'file-sync' => ['label' => 'File Sync',   'emoji' => '🔄', 'color' => '#2e7d32'],
    'storage'   => ['label' => 'Storage',     'emoji' => '💿', 'color' => '#6a1b9a'],
    'containers'=> ['label' => 'Containers',  'emoji' => '📦', 'color' => '#00838f'],
    'system'    => ['label' => 'System',      'emoji' => '⚙️',  'color' => '#546e7a'],
];

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Returns the parsed registry array, e.g.:
 *   ['registryVersion' => '1', 'updated' => '2026-05-16', 'plugins' => [...]]
 *
 * Returns an empty array on failure. Errors are written to PHP error_log.
 */
function orchelium_fetchRegistry(): array {
    // Serve from cache if still fresh
    if (file_exists(ORCHELIUM_REGISTRY_CACHE)
        && (time() - filemtime(ORCHELIUM_REGISTRY_CACHE)) < ORCHELIUM_REGISTRY_CACHE_TTL) {
        $cached = @file_get_contents(ORCHELIUM_REGISTRY_CACHE);
        if ($cached !== false) {
            $data = json_decode($cached, true);
            if (is_array($data) && isset($data['plugins'])) {
                $data['_fromCache'] = true;
                return $data;
            }
        }
    }

    $body = false;

    // Prefer cURL (more configurable, works in more server environments)
    if (function_exists('curl_init')) {
        $ch = curl_init(ORCHELIUM_REGISTRY_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'orchelium-website-plugin-catalog/1.0',
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $body     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($body === false || $httpCode !== 200) {
            error_log("[orchelium] cURL fetch failed (HTTP {$httpCode}): {$curlErr}");
            $body = false;
        }
    }

    // Fallback: file_get_contents (requires allow_url_fopen=On)
    if ($body === false) {
        $ctx  = stream_context_create(['http' => [
            'timeout'    => 10,
            'user_agent' => 'orchelium-website-plugin-catalog/1.0',
            'ignore_errors' => true,
        ]]);
        $body = @file_get_contents(ORCHELIUM_REGISTRY_URL, false, $ctx);
    }

    if ($body === false) {
        error_log('[orchelium] Could not fetch plugin registry from GitHub');
        return [];
    }

    $data = json_decode($body, true);
    if (!is_array($data) || !isset($data['plugins'])) {
        error_log('[orchelium] Registry JSON is malformed');
        return [];
    }

    // Write cache
    @file_put_contents(ORCHELIUM_REGISTRY_CACHE, $body, LOCK_EX);

    $data['_fromCache'] = false;
    return $data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** HTML-safe output. */
function h(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Category emoji for a given category slug. */
function categoryEmoji(string $cat): string {
    return CATEGORY_META[$cat]['emoji'] ?? '🔌';
}

/** Category label for a given category slug. */
function categoryLabel(string $cat): string {
    return CATEGORY_META[$cat]['label'] ?? ucfirst(str_replace('-', ' ', $cat));
}

/** Category hex colour for a given category slug. */
function categoryColor(string $cat): string {
    return CATEGORY_META[$cat]['color'] ?? '#555';
}

/** Validate a plugin name supplied via URL parameter. */
function validatePluginName(string $name): bool {
    return (bool) preg_match(PLUGIN_NAME_PATTERN, $name);
}
