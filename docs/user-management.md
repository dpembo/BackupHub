# User Management

Orchelium supports multiple users with role-based access control. Access to features is governed by a set of granular permissions that can be assigned per user. One **Super Admin** account always exists and has unrestricted access to everything.

---

## Contents

- [First Access](#first-access)
- [Login](#login)
- [Forgotten Password](#forgotten-password)
- [User Types and Statuses](#user-types-and-statuses)
- [Managing Users](#managing-users)
  - [Inviting Users](#inviting-users)
  - [Resending an Invite](#resending-an-invite)
  - [Activating and Deactivating Users](#activating-and-deactivating-users)
  - [Resetting a User's Password](#resetting-a-users-password)
  - [Deleting a User](#deleting-a-user)
- [Permissions](#permissions)
  - [Role Presets](#role-presets)
  - [Permission Reference](#permission-reference)
- [Related Documentation](#related-documentation)

---

## First Access

When you first access Orchelium after installation, you are prompted to create the initial Super Admin account. You will need to provide:

- A username
- An email address
- A password

This account becomes the Super Admin — it cannot be deactivated, deleted, or have its permissions modified. All subsequent users must be invited by a user with the `users.manage` permission.

---

## Login

Access Orchelium at `http://<your-server>:<port>/login.html` (default port `8082`). Enter your username and password to log in.

---

## Forgotten Password

If you forget your password:

1. Click **Forgot Password** on the login page, or navigate to `/forgot.html`.
2. Enter your username and submit the form.
3. You will receive an email containing a one-time reset link, valid for **1 hour**.
4. Click the link in the email to set a new password.

> **Note:** Password reset emails require SMTP to be configured in [Settings](./settings-config.md).

---

## User Types and Statuses

### Super Admin

The initial account created at first access is the Super Admin. This account:

- Has full, unrestricted access to all features.
- Cannot be deactivated, deleted, or have its permissions changed.
- Always has exactly one instance in the system.

### Regular Users

All other accounts are regular users. Their access is controlled entirely by the permissions assigned to them.

### User Statuses

| Status | Description |
|--------|-------------|
| **Active** | The user has accepted their invite and can log in. |
| **Invited** | The user has been invited but has not yet set a password. The invite link is still valid (within 48 hours). |
| **Inactive** | The user account exists but has been deactivated, or the invite expired before being accepted. |

---

## Managing Users

The User Management page is accessible from the navigation menu. It requires the `users.manage` permission (or Super Admin).

### Inviting Users

To add a new user to Orchelium:

1. Navigate to **Users** from the main menu.
2. Click **Invite User**.
3. Enter the new user's **username** and **email address**.
4. Select a **role preset** or configure individual permissions manually.
5. Click **Send Invite**.

Orchelium will send the new user an email containing a link to set their password. The link is valid for **48 hours**. Until the invite is accepted, the user's status shows as **Invited**.

> **Note:** Sending invite emails requires SMTP to be configured in [Settings](./settings-config.md). If SMTP is not configured, invites cannot be sent.

### Resending an Invite

If a user's invite expires before they accept it:

1. Navigate to **Users**.
2. Locate the user with **Invited** or **Inactive** status.
3. Click **Resend Invite**.

A new 48-hour invite link is generated and emailed to the user.

### Activating and Deactivating Users

You can temporarily disable access for a user without deleting them:

- **Deactivate**: The user can no longer log in. Their account and history are preserved.
- **Activate**: Restores login access to a previously deactivated user.

The Super Admin account cannot be deactivated.

### Resetting a User's Password

An admin can trigger a password reset for any user:

1. Navigate to **Users**.
2. Click the **Reset Password** action for the target user.

Orchelium sends the user a password reset email with a one-time link (valid for 1 hour).

### Deleting a User

To permanently remove a user:

1. Navigate to **Users**.
2. Click **Delete** for the target user and confirm.

Deleted users are removed immediately and cannot be recovered. The Super Admin account cannot be deleted.

---

## Permissions

Regular users have access only to the features permitted by their assigned permissions. Permissions are set when inviting a user and can be updated at any time from the User Management page.

### Role Presets

To simplify setup, Orchelium provides three built-in role presets. These are starting-point templates — you can apply a preset and then adjust individual permissions as needed.

#### Viewer

Read-only access to the main sections of the application.

| Permission | Granted |
|------------|---------|
| history.view | ✓ |
| jobs.view | ✓ |
| agents.view | ✓ |
| orchestrations.view | ✓ |
| scripts.view | ✓ |

#### Operator

Can view and interact with most resources, run scripts and orchestrations.

| Permission | Granted |
|------------|---------|
| history.view | ✓ |
| history.resubmit | ✓ |
| jobs.view | ✓ |
| jobs.create | ✓ |
| jobs.edit | ✓ |
| agents.view | ✓ |
| orchestrations.view | ✓ |
| orchestrations.edit | ✓ |
| orchestrations.export | ✓ |
| scripts.view | ✓ |
| scripts.test | ✓ |

#### Manager

Full access to create, edit, and delete resources, plus settings access. Does not include user management.

| Permission | Granted |
|------------|---------|
| history.view | ✓ |
| history.resubmit | ✓ |
| jobs.view / create / edit / delete | ✓ |
| agents.view / create / edit / update | ✓ |
| orchestrations.view / create / import / edit / delete / export | ✓ |
| scripts.view / create / import / edit / delete / export / test | ✓ |
| settings.access | ✓ |

### Permission Reference

The table below lists all available permissions.

| Permission | Description |
|------------|-------------|
| `history.view` | View job execution history |
| `history.resubmit` | Re-run a job from the history list |
| `jobs.view` | View scheduled jobs |
| `jobs.create` | Create new scheduled jobs |
| `jobs.edit` | Edit existing scheduled jobs |
| `jobs.delete` | Delete scheduled jobs |
| `agents.view` | View agents |
| `agents.create` | Register new agents |
| `agents.edit` | Edit agent configuration |
| `agents.update` | Trigger agent software updates |
| `orchestrations.view` | View orchestrations |
| `orchestrations.create` | Create new orchestrations |
| `orchestrations.import` | Import orchestrations from file |
| `orchestrations.edit` | Edit existing orchestrations |
| `orchestrations.delete` | Delete orchestrations |
| `orchestrations.export` | Export orchestrations to file |
| `scripts.view` | View scripts in the script editor |
| `scripts.create` | Create new scripts |
| `scripts.import` | Import scripts |
| `scripts.edit` | Edit existing scripts |
| `scripts.delete` | Delete scripts |
| `scripts.export` | Export scripts |
| `scripts.test` | Run scripts interactively from the editor |
| `settings.access` | Access the Settings page |
| `users.manage` | View and manage users (invite, deactivate, delete, change permissions) |

> **Note:** The Super Admin bypasses all permission checks and always has full access regardless of the permission list.

---

## Related Documentation

- [Installation](./installation.md): Setting up Orchelium
- [Job Schedules](./backup-schedules.md): Creating and managing schedules
- [Settings Configuration](./settings-config.md): Server configuration and backup/restore
- [Orchestrations](./orchestrations.md): Building complex workflows
- [REST API Reference](./REST_API_REFERENCE.md): API endpoints
- [Back to Documentation Index](./README.MD)
