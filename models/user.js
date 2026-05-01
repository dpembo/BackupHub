const bcrypt = require('bcrypt');
const { Level } = require('level');
const { randomUUID } = require('crypto');

var db;

// ============================================================
// PERMISSION CONSTANTS
// ============================================================
const PERMISSIONS = {
  HISTORY_VIEW:              'history.view',
  HISTORY_RESUBMIT:          'history.resubmit',

  JOBS_VIEW:                 'jobs.view',
  JOBS_CREATE:               'jobs.create',
  JOBS_EDIT:                 'jobs.edit',
  JOBS_DELETE:               'jobs.delete',

  AGENTS_VIEW:               'agents.view',
  AGENTS_CREATE:             'agents.create',
  AGENTS_EDIT:               'agents.edit',
  AGENTS_UPDATE:             'agents.update',

  ORCHESTRATIONS_VIEW:       'orchestrations.view',
  ORCHESTRATIONS_CREATE:     'orchestrations.create',
  ORCHESTRATIONS_IMPORT:     'orchestrations.import',
  ORCHESTRATIONS_EDIT:       'orchestrations.edit',
  ORCHESTRATIONS_DELETE:     'orchestrations.delete',
  ORCHESTRATIONS_EXPORT:     'orchestrations.export',

  SCRIPTS_VIEW:              'scripts.view',
  SCRIPTS_CREATE:            'scripts.create',
  SCRIPTS_IMPORT:            'scripts.import',
  SCRIPTS_EDIT:              'scripts.edit',
  SCRIPTS_DELETE:            'scripts.delete',
  SCRIPTS_EXPORT:            'scripts.export',
  SCRIPTS_TEST:              'scripts.test',

  SETTINGS_ACCESS:           'settings.access',

  SETTINGS_SERVER:           'settings.server',
  SETTINGS_WEBSOCKET:        'settings.websocket',
  SETTINGS_MQTT:             'settings.mqtt',
  SETTINGS_ALERTS:           'settings.alerts',
  SETTINGS_ICONS:            'settings.icons',
  SETTINGS_TEMPLATES:        'settings.templates',
  SETTINGS_WEBHOOKS:         'settings.webhooks',
  SETTINGS_BACKUP:           'settings.backup',

  USERS_MANAGE:              'users.manage',
};

const LEGACY_SETTINGS_PERMISSIONS = [
  PERMISSIONS.SETTINGS_SERVER,
  PERMISSIONS.SETTINGS_WEBSOCKET,
  PERMISSIONS.SETTINGS_MQTT,
  PERMISSIONS.SETTINGS_ALERTS,
  PERMISSIONS.SETTINGS_ICONS,
  PERMISSIONS.SETTINGS_TEMPLATES,
  PERMISSIONS.SETTINGS_WEBHOOKS,
  PERMISSIONS.SETTINGS_BACKUP,
];

// Permissions granted by default to newly invited (non-admin) users
const DEFAULT_INVITED_PERMISSIONS = [
  PERMISSIONS.HISTORY_VIEW,
  PERMISSIONS.HISTORY_RESUBMIT,
  PERMISSIONS.JOBS_VIEW,
  PERMISSIONS.AGENTS_VIEW,
  PERMISSIONS.ORCHESTRATIONS_VIEW,
  PERMISSIONS.SCRIPTS_VIEW,
];

// Preset role templates (convenience for the invite UI)
const ROLE_PRESETS = {
  viewer: [
    PERMISSIONS.HISTORY_VIEW,
    PERMISSIONS.JOBS_VIEW,
    PERMISSIONS.AGENTS_VIEW,
    PERMISSIONS.ORCHESTRATIONS_VIEW,
    PERMISSIONS.SCRIPTS_VIEW,
  ],
  operator: [
    PERMISSIONS.HISTORY_VIEW,
    PERMISSIONS.HISTORY_RESUBMIT,
    PERMISSIONS.JOBS_VIEW,
    PERMISSIONS.JOBS_CREATE,
    PERMISSIONS.JOBS_EDIT,
    PERMISSIONS.AGENTS_VIEW,
    PERMISSIONS.ORCHESTRATIONS_VIEW,
    PERMISSIONS.ORCHESTRATIONS_EDIT,
    PERMISSIONS.ORCHESTRATIONS_EXPORT,
    PERMISSIONS.SCRIPTS_VIEW,
    PERMISSIONS.SCRIPTS_TEST,
  ],
  manager: [
    PERMISSIONS.HISTORY_VIEW,
    PERMISSIONS.HISTORY_RESUBMIT,
    PERMISSIONS.JOBS_VIEW,
    PERMISSIONS.JOBS_CREATE,
    PERMISSIONS.JOBS_EDIT,
    PERMISSIONS.JOBS_DELETE,
    PERMISSIONS.AGENTS_VIEW,
    PERMISSIONS.AGENTS_CREATE,
    PERMISSIONS.AGENTS_EDIT,
    PERMISSIONS.AGENTS_UPDATE,
    PERMISSIONS.ORCHESTRATIONS_VIEW,
    PERMISSIONS.ORCHESTRATIONS_CREATE,
    PERMISSIONS.ORCHESTRATIONS_IMPORT,
    PERMISSIONS.ORCHESTRATIONS_EDIT,
    PERMISSIONS.ORCHESTRATIONS_DELETE,
    PERMISSIONS.ORCHESTRATIONS_EXPORT,
    PERMISSIONS.SCRIPTS_VIEW,
    PERMISSIONS.SCRIPTS_CREATE,
    PERMISSIONS.SCRIPTS_IMPORT,
    PERMISSIONS.SCRIPTS_EDIT,
    PERMISSIONS.SCRIPTS_DELETE,
    PERMISSIONS.SCRIPTS_EXPORT,
    PERMISSIONS.SCRIPTS_TEST,
    PERMISSIONS.SETTINGS_ACCESS,
  ],
};

// Schema version key stored in the DB to track migrations
const SCHEMA_VERSION_KEY = '_schema_version';
const CURRENT_SCHEMA_VERSION = 2;

class Users {
  emailer = null;
  debug = null;

  normalizePermissions(permissions) {
    if (!Array.isArray(permissions)) return [];
    const normalized = new Set();
    for (const perm of permissions) {
      if (typeof perm !== 'string') continue;
      const clean = perm.trim().toLowerCase();
      if (!clean) continue;
      if (clean === PERMISSIONS.SETTINGS_ACCESS || LEGACY_SETTINGS_PERMISSIONS.includes(clean)) {
        normalized.add(PERMISSIONS.SETTINGS_ACCESS);
        continue;
      }
      normalized.add(clean);
    }
    return Array.from(normalized);
  }

  init(dbPath, debug, emailer) {
    this.debug = debug;
    this.emailer = emailer;
    this.debug.debug('Initializing User Capability');
    this.initializeDB(dbPath);
  }

  initializeDB(dbPath) {
    this.debug.info('Initializing User DB from [' + dbPath + ']');
    db = new Level(dbPath, { valueEncoding: 'json' });
  }

  // ----------------------------------------------------------
  // STARTUP MIGRATION — runs automatically on first boot after
  // deploy; idempotent on subsequent starts.
  // ----------------------------------------------------------
  async migrateUsers() {
    try {
      let currentVersion = 0;
      try {
        currentVersion = await db.get(SCHEMA_VERSION_KEY);
      } catch (e) {
        if (!e.notFound) throw e;
      }

      if (currentVersion >= CURRENT_SCHEMA_VERSION) {
        this.debug.debug(`User schema is up to date (v${currentVersion}), no migration needed`);
        return;
      }

      this.debug.info(`Migrating user schema from v${currentVersion} to v${CURRENT_SCHEMA_VERSION}`);
      const now = Date.now();
      let migrated = 0;

      for await (const [key, value] of db.iterator({})) {
        // Skip the sentinel key
        if (key === SCHEMA_VERSION_KEY) continue;

        // Only migrate records that look like user objects
        if (typeof value !== 'object' || !value.username) continue;

        if (value.isSuperAdmin !== undefined) continue; // already migrated

        // Every pre-existing user was the single user allowed by the old schema,
        // so they all become super admin.
        const upgraded = {
          ...value,
          isSuperAdmin: true,
          isActive: true,
          permissions: [],
          createdAt: value.createdAt || now,
          updatedAt: now,
          lastLogin: value.lastLogin || undefined,
        };
        await db.put(key, upgraded);
        migrated++;
        this.debug.info(`Migrated user [${key}] → isSuperAdmin=true`);
      }

      // v2: Collapse legacy granular settings.* permissions into settings.access
      if (currentVersion < 2) {
        let settingsPermissionMigrated = 0;
        for await (const [key, value] of db.iterator({})) {
          if (key === SCHEMA_VERSION_KEY) continue;
          if (typeof value !== 'object' || !value.username || value.isSuperAdmin) continue;
          if (!Array.isArray(value.permissions)) continue;

          const hasLegacySettingsPerm = value.permissions.some((p) => LEGACY_SETTINGS_PERMISSIONS.includes(p));
          const hasSettingsAccess = value.permissions.includes(PERMISSIONS.SETTINGS_ACCESS);

          if (hasLegacySettingsPerm && !hasSettingsAccess) {
            value.permissions.push(PERMISSIONS.SETTINGS_ACCESS);
            value.updatedAt = now;
            await db.put(key, value);
            settingsPermissionMigrated++;
          }
        }
        if (settingsPermissionMigrated > 0) {
          this.debug.info(`Granted settings.access to ${settingsPermissionMigrated} user(s) based on legacy settings.* permissions`);
        }
      }

      await db.put(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
      this.debug.info(`User schema migration complete. ${migrated} user(s) upgraded to v${CURRENT_SCHEMA_VERSION}`);
    } catch (err) {
      this.debug.error('User schema migration failed:', err.message || err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // USER CREATION
  // ----------------------------------------------------------

  // Create the first/admin user (used during initial registration)
  async createUser(username, email, password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = Date.now();
    const user = {
      username: username.toLowerCase(),
      email,
      password: hashedPassword,
      isSuperAdmin: true,
      isActive: true,
      permissions: [],
      createdAt: now,
      updatedAt: now,
    };
    await db.put(username.toLowerCase(), user);
    return user;
  }

  // Create an invited (pending) user — no password yet, sends invite email
  async createInvitedUser(username, email, permissions) {
    const lowerUsername = username.toLowerCase();
    const existing = await this.getUserByUsername(lowerUsername);
    if (existing) throw new Error(`User '${lowerUsername}' already exists`);

    const inviteToken = randomUUID();
    const now = Date.now();
    const user = {
      username: lowerUsername,
      email,
      password: null,
      isSuperAdmin: false,
      isActive: false,
      permissions: this.normalizePermissions(
        Array.isArray(permissions) ? permissions : DEFAULT_INVITED_PERMISSIONS
      ),
      inviteToken,
      inviteExpires: now + 48 * 3600000, // 48-hour invite window
      createdAt: now,
      updatedAt: now,
    };
    await db.put(lowerUsername, user);
    this.debug.info(`Created invited user [${lowerUsername}]`);

    // Send invite email
    const hostname = this.emailer.getHostName();
    let body = `Hello ${username}\n\n`;
    body += `You have been invited to access Orchelium at ${hostname}\n\n`;
    body += `To set your password and activate your account, click the link below:\n`;
    body += `${hostname}/invite/${inviteToken}/${lowerUsername}\n\n`;
    body += `This link expires in 48 hours.\n`;
    this.emailer.sendEmail('Orchelium - You have been invited', body, email);

    return { user, inviteToken };
  }

  // Resend / regenerate an invite token for a pending user
  async regenerateInviteToken(username) {
    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');
    user.inviteToken = randomUUID();
    user.inviteExpires = Date.now() + 48 * 3600000;
    user.updatedAt = Date.now();
    await db.put(user.username, user);

    const hostname = this.emailer.getHostName();
    let body = `Hello ${username}\n\n`;
    body += `A new invite link has been generated for your Orchelium account at ${hostname}\n\n`;
    body += `${hostname}/invite/${user.inviteToken}/${user.username}\n\n`;
    body += `This link expires in 48 hours.\n`;
    this.emailer.sendEmail('Orchelium - New Invite Link', body, user.email);
    return user.inviteToken;
  }

  async isInviteTokenValid(username, token) {
    const user = await this.getUserByUsername(username);
    if (
      user &&
      user.inviteToken &&
      user.inviteToken === token &&
      user.inviteExpires &&
      user.inviteExpires > Date.now()
    ) {
      return user;
    }
    return null;
  }

  // Accept an invite: set password, activate account
  async acceptInvite(username, token, password) {
    const user = await this.isInviteTokenValid(username, token);
    if (!user) return false;

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.isActive = true;
    user.inviteToken = undefined;
    user.inviteExpires = undefined;
    user.updatedAt = Date.now();
    await db.put(user.username, user);
    this.debug.info(`Invite accepted — user [${username}] is now active`);
    return true;
  }

  // ----------------------------------------------------------
  // USER LOOKUPS
  // ----------------------------------------------------------

  async getUserByUsername(username) {
    try {
      return await db.get(username);
    } catch (error) {
      if (error.notFound) return null;
      throw error;
    }
  }

  async getUserByEmail(email) {
    for await (const [key, value] of db.iterator({})) {
      if (key === SCHEMA_VERSION_KEY) continue;
      if (value && value.email && value.email.toLowerCase() === email.toLowerCase()) return value;
    }
    return null;
  }

  async getUserByToken(token) {
    this.debug.debug('Getting user by reset token');
    for await (const [key, value] of db.iterator({})) {
      if (key === SCHEMA_VERSION_KEY) continue;
      if (value && value.resetPasswordToken && value.resetPasswordToken === token) return value;
    }
    this.debug.warn('Unable to match a user by reset token');
    return null;
  }

  async getUserByInviteToken(token) {
    for await (const [key, value] of db.iterator({})) {
      if (key === SCHEMA_VERSION_KEY) continue;
      if (value && value.inviteToken && value.inviteToken === token) return value;
    }
    return null;
  }

  // Returns all user records (excluding the schema sentinel), password stripped
  async getAllUsers() {
    const users = [];
    for await (const [key, value] of db.iterator({})) {
      if (key === SCHEMA_VERSION_KEY) continue;
      if (typeof value !== 'object' || !value.username) continue;
      const { password, resetPasswordToken, resetPasswordExpires, inviteToken, inviteExpires, ...safe } = value;
      safe.permissions = this.normalizePermissions(safe.permissions || []);
      // Derive a display status
      if (!safe.isActive && value.inviteToken && value.inviteExpires && value.inviteExpires > Date.now()) {
        safe.status = 'invited';
      } else if (safe.isActive) {
        safe.status = 'active';
      } else {
        safe.status = 'inactive';
      }
      // Keep inviteToken presence indicator (not the token itself)
      safe.hasPendingInvite = !!(value.inviteToken && value.inviteExpires && value.inviteExpires > Date.now());
      users.push(safe);
    }
    return users;
  }

  // ----------------------------------------------------------
  // USER UPDATES
  // ----------------------------------------------------------

  async getUserCount() {
    let count = 0;
    for await (const [key] of db.iterator({})) {
      if (key !== SCHEMA_VERSION_KEY) count++;
    }
    return count;
  }

  async setUserActive(username, isActive) {
    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');
    if (user.isSuperAdmin && !isActive) throw new Error('Cannot deactivate the super admin account');
    user.isActive = isActive;
    user.updatedAt = Date.now();
    await db.put(username, user);
    this.debug.info(`User [${username}] isActive set to ${isActive}`);
    return user;
  }

  async updateUserPermissions(username, permissions) {
    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');
    if (user.isSuperAdmin) throw new Error('Cannot modify permissions of the super admin');
    user.permissions = this.normalizePermissions(Array.isArray(permissions) ? permissions : []);
    user.updatedAt = Date.now();
    await db.put(username, user);
    return user;
  }

  async updateUser(updatedUser) {
    try {
      updatedUser.updatedAt = Date.now();
      await db.put(updatedUser.username, updatedUser);
    } catch (error) {
      this.debug.error('An error occurred updating a user', error);
      throw error;
    }
  }

  async deleteUser(username) {
    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');
    if (user.isSuperAdmin) throw new Error('Cannot delete the super admin account');
    await db.del(username);
    this.debug.info(`User [${username}] deleted`);
  }

  async updatePassword(username, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await this.getUserByUsername(username);
    if (user) {
      user.password = hashedPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      user.updatedAt = Date.now();
      await db.put(username, user);
    }
    const body =
      `Hello ${username}\n\n` +
      `This is a message from Orchelium at ${this.emailer.getHostName()}\n\n` +
      `Your password for account [${username}] has been updated.\n\n` +
      `If this was not you, please reset your password immediately:\n` +
      `${this.emailer.getHostName()}/forgot.html`;
    this.emailer.sendEmail('Orchelium - Password Changed', body, user ? user.email : undefined);
  }

  async generateResetToken(username) {
    this.debug.debug('Generating reset token for user: ' + username);
    try {
      const token = randomUUID();
      const user = await this.getUserByUsername(username);
      if (user) {
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await this.updateUser(user);

        const body =
          `Hello ${username}\n\n` +
          `This is a message from Orchelium at ${this.emailer.getHostName()}\n\n` +
          `Somebody has requested to reset your password. If this was not you, please ignore.\n` +
          `If you want to continue, click the following link:\n\n` +
          `${this.emailer.getHostName()}/reset/${token}/${username}`;
        this.emailer.sendEmail('Orchelium - Reset Password', body, user.email);
      }
      return token;
    } catch (error) {
      throw error;
    }
  }

  async resetPassword(username, token, newPassword) {
    try {
      const user = await this.isResetTokenValid(username, token);
      if (user && user !== null) {
        await this.updatePassword(username, newPassword);
        return true;
      }
      return false;
    } catch (error) {
      this.debug.error('An error occurred resetting the password:', error);
      throw error;
    }
  }

  async isResetTokenValid(username, token) {
    this.debug.debug('Checking reset token for: ' + username);
    const user = await this.getUserByUsername(username);
    if (
      user &&
      user.resetPasswordExpires &&
      user.resetPasswordExpires > Date.now() &&
      user.resetPasswordToken &&
      user.resetPasswordToken === token
    ) {
      return user;
    }
    return null;
  }

  // ----------------------------------------------------------
  // PERMISSION HELPERS
  // ----------------------------------------------------------

  hasPermission(user, permission) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (!user.isActive) return false;
    if (!Array.isArray(user.permissions)) return false;

    const normalizedUserPerms = this.normalizePermissions(user.permissions);
    const requestedPermission = typeof permission === 'string' ? permission.trim().toLowerCase() : '';
    if (!requestedPermission) return false;

    if (requestedPermission === PERMISSIONS.SETTINGS_ACCESS) {
      return normalizedUserPerms.includes(PERMISSIONS.SETTINGS_ACCESS);
    }

    return normalizedUserPerms.includes(requestedPermission);
  }

  // ----------------------------------------------------------
  // EXPRESS MIDDLEWARE
  // ----------------------------------------------------------

  // isAuthenticated: checks session, reloads user from DB (for session revocation),
  // and sets res.locals.currentUser for EJS views.
  isAuthenticated = async (req, res, next) => {
    if (!req.session.user) {
      const fullUrl = req.originalUrl;
      return res.redirect(
        `/login.html?message=User+Not+Authenticated&redirect=${encodeURIComponent(fullUrl)}`
      );
    }
    try {
      const freshUser = await this.getUserByUsername(req.session.user.username);
      if (!freshUser || !freshUser.isActive) {
        req.session.destroy(() => {});
        return res.redirect('/login.html?message=Account+has+been+deactivated');
      }
      // Keep session fresh
      req.session.user = freshUser;
      // Make available to all EJS views without modifying every render call
      res.locals.currentUser = freshUser;
      next();
    } catch (err) {
      next(err);
    }
  };

  // requirePermission: middleware factory — call as User.requirePermission(PERMISSIONS.X)
  // Must be used AFTER User.isAuthenticated (relies on req.session.user being fresh).
  requirePermission(permission) {
    return (req, res, next) => {
      const user = req.session.user;
      if (!user) {
        return res.redirect('/login.html?message=User+Not+Authenticated');
      }
      if (this.hasPermission(user, permission)) return next();

      const isApi = req.path.startsWith('/rest/') || req.path.startsWith('/api/');
      if (isApi) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
      }
      return res.status(403).render('403', { currentUser: user });
    };
  }

  // requireAnyPermission: passes if the user holds at least one of the given permissions
  requireAnyPermission(permissions) {
    return (req, res, next) => {
      const user = req.session.user;
      if (!user) return res.redirect('/login.html?message=User+Not+Authenticated');
      if (permissions.some(p => this.hasPermission(user, p))) return next();
      const isApi = req.path.startsWith('/rest/') || req.path.startsWith('/api/');
      if (isApi) return res.status(403).json({ success: false, message: 'Permission denied' });
      return res.status(403).render('403', { currentUser: user });
    };
  }

  // requireSuperAdmin: middleware — restricts to isSuperAdmin only
  requireSuperAdmin() {
    return (req, res, next) => {
      const user = req.session.user;
      if (!user) return res.redirect('/login.html?message=User+Not+Authenticated');
      if (user.isSuperAdmin) return next();
      const isApi = req.path.startsWith('/rest/') || req.path.startsWith('/api/');
      if (isApi) {
        return res.status(403).json({ success: false, message: 'Administrator access required' });
      }
      return res.status(403).render('403', { currentUser: user });
    };
  }
}

const instance = new Users();
instance.PERMISSIONS = PERMISSIONS;
instance.DEFAULT_INVITED_PERMISSIONS = DEFAULT_INVITED_PERMISSIONS;
instance.ROLE_PRESETS = ROLE_PRESETS;

module.exports = instance;
