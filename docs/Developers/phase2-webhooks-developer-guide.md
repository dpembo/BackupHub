# Phase 2: Webhook Database & Management API - Developer Guide

## Overview

Phase 2 focuses on persistent webhook storage and comprehensive REST API for webhook management. This enables administrators to create, manage, and monitor webhooks through HTTP endpoints.

---

## Architecture

### Data Layer (`webhooksData.js`)

Provides comprehensive CRUD operations with LevelDB persistence:

```
┌─ Webhooks Data Module ─────────────────────┐
│                                             │
│  createWebhook()                           │
│  getWebhooksForJob()                       │
│  validateWebhookKey()                      │
│  recordWebhookTrigger()                    │
│  rotateWebhookKey()                        │
│  updateWebhook()                           │
│  deleteWebhook()                           │
│  getWebhookStats()                         │
│                                             │
└─────────────┬───────────────────────────────┘
              │
              ▼
      ┌─────────────────┐
      │  LevelDB        │
      │  data.db        │
      ├─────────────────┤
      │   WEBHOOKS_     │
      │   INDEX         │
      │                 │
      │   WEBHOOK_      │
      │   DATA_*        │
      └─────────────────┘
```

### Storage Format

**Index Key:** `WEBHOOKS_INDEX`
```json
{
  "backup-job": ["webhook-id-1", "webhook-id-2"],
  "cleanup-job": ["webhook-id-3"]
}
```

**Data Keys:** `WEBHOOK_DATA_<jobId>_<webhookId>`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "backup-job",
  "name": "External Alert",
  "description": "Sends alerts to monitoring system",
  "apiKey": "uuid-string",
  "isActive": true,
  "createdAt": "2026-04-04T10:30:00.000Z",
  "lastTriggeredAt": "2026-04-04T12:15:00.000Z",
  "triggerCount": 5,
  "keyRotatedAt": "2026-04-04T14:20:00.000Z"
}
```

---

## REST API Endpoints

All endpoints are authenticated (session-based).

### GET /rest/webhooks/:jobName

List all webhooks for a specific job.

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "External Alert",
    "description": "Monitoring system",
    "isActive": true,
    "createdAt": "2026-04-04T10:30:00.000Z",
    "lastTriggeredAt": "2026-04-04T12:15:00.000Z",
    "triggerCount": 5
  }
]
```

**Implementation Notes:**
- API keys NOT returned for security
- Returns safe webhook metadata only
- Used by UI to populate webhook list

### POST /rest/webhooks/:jobName

Create a new webhook for a job.

**Request:**
```json
{
  "name": "My Webhook",
  "description": "Optional description"
}
```

**Response:**
```json
{
  "success": true,
  "webhook": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Webhook",
    "description": "Optional description",
    "apiKey": "a1b2c3d4-e5f6-4a5b-8c9d-e1f2g3h4i5j6",
    "isActive": true,
    "createdAt": "2026-04-04T10:30:00.000Z"
  }
}
```

**Implementation Notes:**
- API key returned ONLY on creation
- Key is UUID v4 format
- Stored in database for validation
- Max 10 webhooks per job

### PUT /rest/webhooks/:jobName/:webhookId

Update webhook metadata.

**Request:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "isActive": false
}
```

**Response:**
```json
{
  "success": true,
  "webhook": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Updated Name",
    "description": "Updated description",
    "isActive": false
  }
}
```

**Implementation Notes:**
- All fields optional
- Only specified fields updated
- Used for enable/disable and renaming

### POST /rest/webhooks/:jobName/:webhookId/rotate-key

Generate new API key.

**Request:**
```json
{
  "oldKey": "old-uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "webhook": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Webhook",
    "apiKey": "new-uuid-here",
    "keyRotatedAt": "2026-04-04T15:45:00.000Z"
  }
}
```

**Implementation Notes:**
- Old key must match stored key
- Immediately invalidates old key
- New key returned for user to save
- Updates keyRotatedAt timestamp

### DELETE /rest/webhooks/:jobName/:webhookId

Delete webhook.

**Response:**
```json
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

**Implementation Notes:**
- Removes webhook and all history
- Cannot be undone
- Use PUT to disable instead of delete

### GET /rest/webhooks-stats

Get system-wide statistics.

**Response:**
```json
{
  "jobsWithWebhooks": 5,
  "totalWebhooks": 12,
  "activeWebhooks": 10,
  "inactiveWebhooks": 2
}
```

---

## Integration Points

### Webhook Trigger Endpoint

Enhanced `POST /api/webhook/trigger/:jobName?key=<uuid>` now:

1. **Extracts API key** from query param or header
2. **Calls `webhooksData.validateWebhookKey(jobName, key)`**
3. **On validation failure** - returns 401 error
4. **On validation success** - triggers job with context
5. **Records trigger** via `webhooksData.recordWebhookTrigger()`

### Server Initialization

```javascript
// server.js startup sequence
const webhooksData = require('./webhooksData.js');
await webhooksData.init();  // Load index from database
```

Happens early in startup to ensure webhooks are available before job execution.

---

## Error Handling

### Webhook Validation Errors

```json
{
  "error": "Invalid webhook API key for this job"
}
```

**Conditions:**
- Key invalid format (not UUID v4)
- Key not found for job
- Webhook inactive
- Job not found

### Creation Errors

```json
{
  "error": "Maximum webhooks (10) reached for job [job-name]"
}
```

**Conditions:**
- Job already has 10 webhooks
- Name is empty or missing
- Database write failure

### Key Rotation Errors

```json
{
  "error": "Old webhook key does not match"
}
```

**Conditions:**
- Provided old key doesn't match stored key
- Webhook not found
- Database write failure

---

## Security Considerations

### API Key Management

- **Format:** UUID v4 - cryptographically secure
- **Validation:** Done against database on every trigger
- **Storage:** Plain text in database (consider hashing future)
- **Rotation:** Supported - old key immediate invalidated
- **Exposure:** Only returned on creation endpoint

### Access Control

- **Public endpoints:** Only webhook trigger (requires valid key)
- **Management endpoints:** All authenticated (session required)
- **Key verification:** Prevents unauthorized trigger attempts

### Database Security

- **LevelDB:** Local database, no network exposure
- **File permissions:** Inherited from OS (secure with proper chmod)
- **Backup:** Include webhooksData in backup/restore if needed

---

## Performance Characteristics

### Load Times

| Operation | Typical Time | Notes |
|-----------|-------------|-------|
| List webhooks | < 5ms | Single index lookup |
| Create webhook | < 10ms | Write to DB + index update |
| Validate key | < 5ms | Index lookup + data read |
| Record trigger | < 10ms | Update count + timestamp |
| Rotate key | < 15ms | Update + index write |

### Scaling

- **Max webhooks per job:** 10 (configurable in code)
- **Index size:** O(n) where n = number of jobs with webhooks
- **Lookup complexity:** O(1) index + O(1) data read

### Database Size

- **Per webhook:** ~500 bytes including metadata
- **10 webhooks:** ~5KB
- **100 webhooks:** ~50KB

---

## Testing

### Unit Tests to Implement

```javascript
describe('webhooksData', () => {
  describe('createWebhook', () => {
    it('should create webhook with UUID key');
    it('should prevent exceeding max webhooks');
    it('should initialize index if missing');
  });
  
  describe('validateWebhookKey', () => {
    it('should validate matching key');
    it('should reject invalid key');
    it('should reject inactive webhooks');
  });
  
  describe('recordWebhookTrigger', () => {
    it('should increment trigger count');
    it('should update lastTriggeredAt');
  });
});
```

### Integration Tests

```javascript
describe('Webhook API', () => {
  it('POST /api/webhook/trigger with valid key');
  it('POST /api/webhook/trigger with invalid key');
  it('GET /rest/webhooks/:jobName');
  it('POST /rest/webhooks/:jobName');
  it('PUT /rest/webhooks/:jobName/:webhookId');
  it('POST .../rotate-key');
  it('DELETE /rest/webhooks/:jobName/:webhookId');
});
```

---

## Future Enhancements

- [ ] Webhook history/audit log
- [ ] Key hashing in storage (increase security)
- [ ] Webhook templates (Slack, Discord, etc.)
- [ ] Retry logic for failed webhook triggers
- [ ] Webhook filtering/conditional triggers
- [ ] Payload transformation/mapping
- [ ] Webhook request signature verification

---

## Related Files

- `webhooksData.js` - Database layer
- `webhookManager.js` - Security utilities
- `server.js` - API endpoints
- `REST_API_REFERENCE.md` - API documentation
- `TRIGGER_CONTEXT_GUIDE.md` - Payload examples

