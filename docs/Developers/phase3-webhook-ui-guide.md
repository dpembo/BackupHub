# Phase 3: Webhook Management UI - Developer Guide

## Overview

Phase 3 implements a comprehensive user interface for managing webhooks directly within the Orchelium settings page. This eliminates the need for manual API calls or curl commands for typical webhook operations.

---

## Architecture

### UI Components Location

**File:** `views/settings.ejs`

The webhook management UI consists of:
1. **Settings Tab** - Navigation entry in settings page
2. **Webhooks Section** - Main content area with list and controls
3. **Management Modals** - Five modal dialogs for various operations

```
Settings Page Tabs
├── Server
├── WebSocket
├── MQTT
├── Alerts
├── Thresholds
├── Icons
├── Templates
├── Webhooks ◄─── NEW
└── Backup

Webhooks Tab Content
├── Stats Container (optional system-wide stats)
├── Webhooks Table
│   ├── Name
│   ├── Description
│   ├── Status (Active/Inactive)
│   ├── Trigger Count
│   ├── Last Triggered
│   └── Actions (Edit, Rotate Key, Delete)
├── Create Webhook Button
└── Refresh Button

Modals
├── Create/Edit Webhook Modal
├── API Key Display Modal (with copy button)
├── Rotate Key Confirmation Modal
├── Delete Confirmation Modal
└── Statistics Modal
```

---

## UI Components

### 1. Webhooks Table

Displays all webhooks for the current job with pagination-friendly design:

```html
<table class="striped highlight responsive-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Description</th>
      <th>Status</th>
      <th>Triggers</th>
      <th>Last Triggered</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody id="webhooksTableBody">
    <!-- Populated by updateWebooksTable() -->
  </tbody>
</table>
```

**Features:**
- Empty state message when no webhooks exist
- Responsive design (works on mobile/tablet)
- Status indicator: "● Active" (green) or "● Inactive" (grey)
- Trigger count and timestamps auto-formatted
- Action buttons for each webhook (edit, rotate, delete)

### 2. Create/Edit Webhook Modal

**Launch Triggers:**
- Click "Create Webhook" button → creates new webhook
- Click edit icon in table row → edits existing webhook

**Form Fields:**
- Name (required, text input)
- Description (optional, textarea)
- Trigger URL display (read-only, helps users understand the endpoint)

**Behavior:**
- Clear form when creating (new)
- Populate form when editing (existing)
- Display trigger URL based on current job
- Form validation before submit

### 3. API Key Display Modal

**Launch Trigger:**
- After creating new webhook
- After rotating webhook key

**Features:**
- **One-time Display Warning** - Red warning: "This is the only time your API key will be displayed"
- **Key Display** - Read-only input field with monospace font
- **Copy Button** - One-click copy to clipboard with toast confirmation
- **Usage Example** - Curl command template showing how to use the key

**User Experience:**
```
⚠️  This is the only time your API key will be displayed. Save it securely!

[a1b2c3d4-e5f6-4a5b-8c9d-e1f2g3h4i5j6] [Copy]

Usage:
curl -X POST https://your-orchelium/webhooks/trigger \
  -H "X-Webhook-Key: <YOUR_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"data": "value"}'
```

### 4. Rotate Key Confirmation Modal

**Launch Trigger:**
- Click key/rotate icon in table row

**Purpose:**
- Confirm user intent before invalidating current key
- Display which webhook key will be rotated
- Generate new key and display it

**Security:**
- Current API key is immediately invalidated
- New key is generated server-side
- User must copy new key before closing
- Toast notification confirms rotation

### 5. Delete Confirmation Modal

**Launch Trigger:**
- Click delete/trash icon in table row

**Purpose:**
- Confirm destructive operation
- Display which webhook will be deleted
- Prevent accidental deletion

**Implementation:**
- Modal shows webhook name
- Two buttons: Cancel or Delete
- No undo after confirmation
- Toast notification confirms deletion
- Table updates automatically

### 6. Statistics Modal

**Launch Trigger:**
- Future feature (button visible, functionality ready)

**Purpose:**
- View system-wide webhook statistics
- See trigger counts by job
- Audit webhook usage patterns

---

## JavaScript Implementation

### Core Functions

#### Initialization
```javascript
function initializeWebhookModals()
```
- Initializes Materialize modals on page load
- Ensures modals are ready for user interaction

#### Data Loading
```javascript
async function loadWebhooks()
```
- Fetches all webhooks for current job
- Calls REST API: `GET /rest/webhooks/:jobName`
- Handles 404 (no webhooks) gracefully
- Updates UI table with results
- Error handling with user feedback

#### Table Rendering
```javascript
function updateWebooksTable(webhooks)
```
- Dynamically renders table rows from webhook objects
- Handles empty state
- Creates action button click handlers with webhook ID/name
- Escapes HTML to prevent XSS
- Formats status, trigger count, last triggered timestamp

#### CRUD Operations

**Create:**
```javascript
async function saveWebhook() // Creates new webhook
```
- Validates webhook name (required)
- POST to `/rest/webhooks/:jobName`
- If successful: shows API key modal
- Reloads webhook list

**Update:**
```javascript
async function saveWebhook() // Updates existing webhook
```
- Validates webhook name
- PUT to `/rest/webhooks/:jobName/:webhookId`
- Updates: name, description, isActive status
- Reloads webhook list

**Rotate:**
```javascript
async function confirmRotateKey()
```
- POST to `/rest/webhooks/:jobName/:webhookId/rotate-key`
- Server returns new API key
- Displays key in modal
- Reloads webhook list

**Delete:**
```javascript
async function confirmDeleteWebhook()
```
- DELETE to `/rest/webhooks/:jobName/:webhookId`
- Removes from database
- Reloads webhook list

#### Utility Functions
```javascript
function getCurrentJobName()           // Get job from form
function escapeHtml(text)             // XSS prevention
function openCreateWebhook()          // Show create modal
function editWebhook(id, ...)         // Show edit modal
function rotateWebhookKey(id, name)   // Show rotate modal
function deleteWebhook(id, name)      // Show delete modal
async function loadWebhookStats()     // Show stats modal
```

### Error Handling

All fetch operations include try-catch blocks:
```javascript
try {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  // Process response...
} catch (error) {
  console.error('Error:', error);
  M.toast({html: 'Error: ' + error.message, displayLength: 4000});
}
```

### User Feedback

**Toast Notifications:**
- Success: "Webhook created/updated/deleted"
- Error: "Error: " + error message
- Info: "API Key copied to clipboard"

**Visual Feedback:**
- Refresh indicator during fetch
- Disabled buttons during processing
- Status colors in table (green = active, grey = inactive)
- Blinking/animation during operations

---

## REST API Integration

### Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/rest/webhooks/:jobName` | List all webhooks |
| POST | `/rest/webhooks/:jobName` | Create webhook |
| PUT | `/rest/webhooks/:jobName/:webhookId` | Update metadata |
| POST | `/rest/webhooks/:jobName/:webhookId/rotate-key` | Rotate API key |
| DELETE | `/rest/webhooks/:jobName/:webhookId` | Delete webhook |
| GET | `/rest/webhooks-stats` | Get statistics |

### Request/Response Patterns

**Create Webhook:**
```javascript
// Request
POST /rest/webhooks/:jobName
{
  "name": "My Webhook",
  "description": "Optional description"
}

// Response (with API key)
{
  "success": true,
  "webhook": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Webhook",
    "description": "Optional description",
    "isActive": true,
    "createdAt": "2026-04-04T10:30:00.000Z",
    "triggerCount": 0,
    "lastTriggeredAt": null,
    "apiKey": "a1b2c3d4-e5f6-4a5b-8c9d-e1f2g3h4i5j6" // Only in create response
  }
}
```

**List Webhooks:**
```javascript
// Response (no API key in list)
{
  "success": true,
  "webhooks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Webhook",
      "description": "Optional description",
      "isActive": true,
      "createdAt": "2026-04-04T10:30:00.000Z",
      "triggerCount": 5,
      "lastTriggeredAt": "2026-04-04T11:00:00.000Z"
      // NO apiKey for security
    }
  ]
}
```

---

## Security Considerations

### API Key Handling
- Keys are **never stored in localStorage** (loaded fresh each time)
- Keys are **only displayed once** (after creation or rotation)
- Keys use **UUID v4 format** - cryptographically strong
- Keys are **validated on every trigger** against database
- Old key is **immediately invalidated** after rotation

### CSRF Protection
- All modifying requests (POST, PUT, DELETE) use Materialize modals
- Authentication required via `User.isAuthenticated` middleware
- All from data comes from form inputs (no inline HTML)

### XSS Prevention
- `escapeHtml()` function used on all user-provided strings
- HTML special characters escaped: `&`, `<`, `>`, `"`, `'`
- Webhook names/descriptions displayed via `.textContent` not `.innerHTML`

### Validation
- Webhook name required (validated client + server)
- Description optional
- Job name validated before API calls
- Response validation before UI updates

---

## User Experience Flow

### Create Webhook
1. User clicks "Create Webhook" button
2. Modal opens with empty form
3. User enters name and optional description
4. User clicks "Save"
5. Loading indicator shows
6. If successful: Modal closes → API Key modal opens
7. User copies key (one opportunity!)
8. User clicks "Close"
9. Table refreshes automatically
10. New webhook appears in list with status "Active"

### Rotate Key
1. User clicks key/rotate icon on webhook row
2. Confirmation modal opens showing webhook name
3. User clicks "Rotate Key"
4. Loading indicator shows
5. New key is generated server-side
6. API Key display modal opens with new key
7. User copies new key
8. Old key is now invalid
9. Table refreshes

### Delete Webhook
1. User clicks delete/trash icon on webhook row
2. Confirmation modal opens showing webhook name
3. User clicks "Delete"
4. Loading indicator shows
5. Webhook is deleted from database
6. Modal closes
7. Table refreshes and webhook disappears

---

## Testing the UI

### Manual Testing Scenarios

1. **Create Webhook:**
   - Navigate to Settings → Webhooks
   - Click "Create Webhook"
   - Enter name "Test Webhook"
   - Click Save
   - Verify API key modal appears
   - Copy key
   - Verify webhook appears in table

2. **Edit Webhook:**
   - Click edit icon on webhook
   - Change name to "Updated Webhook"
   - Click Save
   - Verify table updates

3. **Rotate Key:**
   - Click key icon on webhook
   - Verify confirmation modal
   - Click "Rotate Key"
   - Verify old key is now invalid (try trigger - should fail)
   - Verify new key works (try trigger - should succeed)

4. **Delete Webhook:**
   - Click delete icon on webhook
   - Verify confirmation modal
   - Click "Delete"
   - Verify webhook disappears from table
   - Verify trigger endpoint returns 404

5. **Error Handling:**
   - Create webhook with same name (test duplicate check)
   - Delete webhook then try to delete again (404 handling)
   - Network error simulation (offline webhook operations)

### UI Validation

- [ ] Tab navigation works smoothly
- [ ] Empty state shows when no webhooks
- [ ] Table updates without page refresh
- [ ] Modal dialogs are responsive
- [ ] Copy button works on different browsers
- [ ] Toast notifications appear for all operations
- [ ] Status indicator colors display correctly
- [ ] Timestamps format correctly in local timezone

---

## Future Enhancements

### Potential Features
1. **Webhook Testing Panel** - Send test payloads to webhook
2. **Webhook History/Audit Log** - View all triggers with payloads
3. **Request Signature Verification** - Sign webhook requests with HMAC
4. **Pre-built Templates** - Slack, Discord, GitHub webhook templates
5. **Bulk Operations** - Enable/disable multiple webhooks at once
6. **Webhook Groups** - Organize webhooks by category
7. **Advanced Filtering** - Filter by status, creation date, trigger count
8. **Webhook Health Check** - Verify webhook endpoint is reachable

---

## Integration with Phases 1 & 2

### Phase 1: Trigger Context System
- Scripts receive `$ORCHELIUM_TRIGGER_CONTEXT` containing webhook payload
- Template substitution in orchestrations: `#{context.webhook.field}`

### Phase 2: Database & REST API
- UI calls the 6 REST endpoints implemented in Phase 2
- Database layer (`webhooksData.js`) handles persistence
- Security: API keys validated on every trigger

### Phase 3: Webhook Management UI
- User-friendly interface replaces curl commands
- Same functionality, better UX
- All three phases work together seamlessly

---

## Code Organization

### File Structure
```
views/
├── settings.ejs (Webhooks HTML + JavaScript)
│   ├── Tab navigation (line 275)
│   ├── Webhooks section (lines 616-670)
│   ├── Modals (lines 739-835)
│   └── JavaScript functions (lines 936-1386)
│
server.js
├── REST API endpoints (lines 1200-1359)
│   ├── GET /rest/webhooks/:jobName
│   ├── POST /rest/webhooks/:jobName
│   ├── PUT /rest/webhooks/:jobName/:webhookId
│   ├── POST .../rotate-key
│   ├── DELETE .../
│   └── GET /rest/webhooks-stats
│
webhooksData.js
├── Database CRUD operations
├── Validation and security
└── Statistics aggregation
```

---

## Deployment Considerations

### Requirements
- Existing Orchelium with Phase 2 (webhooksData.js, REST APIs)
- Materialize CSS framework (already integrated)
- Browser with JavaScript enabled
- Modern browser (ES6+ support)

### Browser Compatibility
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

### Performance
- Table renders efficiently for 100+ webhooks
- Modals initialize on demand
- API calls have appropriate timeouts
- Toast notifications auto-dismiss

### Accessibility
- Modal dialogs are keyboard navigable
- Color indicators supplemented with text (Active/Inactive)
- Form labels associated with inputs
- Error messages clearly communicated

---

## Troubleshooting

### Common Issues

**Problem:** "API Key copied to clipboard" appears but key not copied
- **Solution:** Check browser permissions for clipboard access
- Some browsers require HTTPS for clipboard operations

**Problem:** Webhooks table is empty but webhooks should exist
- **Solution:** Click "Refresh" button to reload from server
- Check browser console for error messages
- Verify correct job name is selected

**Problem:** Cannot see API key after creating webhook
- **Solution:** Keys are only shown once - rotate key to get a new one
- Write down/screenshot keys immediately after creation

**Problem:** Rotate key appears to work but old key still triggers job
- **Solution:** May take a few seconds for database to propagate
- Try old key again after 10 seconds
- New key should work immediately

**Problem:** Modal not responding to button clicks
- **Solution:** Refresh page to reinitialize modals
- Check browser console for JavaScript errors
- Clear browser cache

---

## Contributing

When modifying webhook UI:
1. Update tests in corresponding test files
2. Follow existing Materialize CSS patterns
3. Maintain XSS protection practices
4. Document any new functions in comments
5. Test all error scenarios
6. Verify on mobile devices

---

## Related Documentation

- [Phase 1: Trigger Context System](./phase1-trigger-context-guide.md)
- [Phase 2: Webhooks Database & API](./phase2-webhooks-developer-guide.md)
- [REST API Reference](../REST_API_REFERENCE.md)
- [Settings Configuration](../settings-config.md)
- [Main README](../README.md)
