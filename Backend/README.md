# ZyroAI Backend: Chat API

This guide documents the authenticated chat, agent, image, and action-approval endpoints mounted at `/api/chat`.

## Firebase Admin credentials

The backend uses Firebase Admin to verify sign-in tokens. For deployment (including Render), add a `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable containing the complete service-account JSON. Keep it in the hosting provider's secret environment settings; do not commit it or paste it into source files.

For local development, the backend also accepts `Backend/serviceAccountKey.json`. This file is ignored by Git and should remain private. If both credential sources are present, `FIREBASE_SERVICE_ACCOUNT_JSON` takes precedence.

## Authentication

Every endpoint requires the signed-in user's `token` cookie. The backend reads the cookie to authenticate the request; include cookies when calling the API from a browser:

```js
fetch(`${API_URL}/api/chat`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello" }),
});
```

Requests and responses use JSON unless noted otherwise.

## Endpoints

### `POST /api/chat`

Send a message to the standard chat assistant.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `message` | string | Yes | Must contain non-whitespace text. |
| `threadId` | string | No | Reuse to continue a conversation. Defaults to the signed-in user's ID. |

**Success (`200`)**

```json
{
  "content": "Hello! How can I help?",
  "threadId": "conversation-id"
}
```

### `POST /api/chat/agent`

Send a message to one of the signed-in user's agents. The agent must be supplied as an object with `_id` or `name`, or as a name string.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `message` | string | Yes | Must contain non-whitespace text. |
| `agent` | object or string | Yes | Agent object with `_id`/`name`, or the agent's name. |
| `threadId` | UUID string | No | Reuse the ID to continue the agent conversation. A UUID is generated if omitted. |

**Success (`200`) — regular response**

```json
{
  "aiResponse": "Here is the answer.",
  "interrupted": false,
  "interrupts": [],
  "agentId": "agent-database-id",
  "threadId": "conversation-uuid"
}
```

An action requiring approval returns an `approvalRequest` alongside `aiResponse`, `agentId`, and `threadId`. Pass the request's `agentId`, `threadId`, and `approvalId` to the approval endpoint.

### `POST /api/chat/agent/approval`

Approve or reject a pending agent action, such as sending an email, creating a calendar event, or publishing an Instagram post.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `agentId` | string | Yes | MongoDB ID of the user's agent. |
| `threadId` | UUID string | Yes | Conversation containing the pending action. |
| `approvalId` | string | Yes | ID from the pending approval request; maximum 256 characters. |
| `approved` | boolean | Yes | `true` to approve, `false` to reject. |

**Success (`200`)**

```json
{
  "aiResponse": "Action completed.",
  "decision": "approved",
  "interrupted": false,
  "interrupts": [],
  "agentId": "agent-database-id"
}
```

If another action requires approval, the response also includes its `approvalRequest`. Each approval request can be used only once.

### `POST /api/chat/analyze-image`

Analyze an uploaded image using the image-analysis MCP tool.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `imageUrl` | string | Yes | URL of the uploaded image. |
| `prompt` | string | No | Optional instruction, up to 2,200 characters. Defaults to a general image description. |

**Success (`200`)**

```json
{
  "analysis": "The image shows..."
}
```

### `POST /api/chat/caption`

Generate a caption for a base64-encoded JPEG, PNG, or WebP image.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `imageDataUrl` | string | Yes | Image data URL, such as `data:image/png;base64,...`; maximum image size is 5 MB. |

**Success (`200`)**

```json
{
  "caption": "A concise description of the image."
}
```

## Credit usage

Credits are deducted after the corresponding operation succeeds:

| Operation | Credits |
| --- | ---: |
| Standard chat message | 2 |
| Agent chat message | 2 |
| Image analysis | 2 |
| Image caption generation | 2 |
| Approved agent action | 10 |
| Rejected agent action | 0 for the approval decision |

An agent message that creates an approval request incurs the agent-chat cost. Approving that action incurs the additional approval cost.

## Errors

Errors use a JSON response with a `message` field. Common status codes include:

| Status | Meaning |
| --- | --- |
| `400` | Missing/invalid message, image data, agent, thread ID, or approval details. |
| `401` | Authentication cookie is missing. |
| `402` | User has insufficient credits. |
| `404` | Agent or user was not found. |
| `409` | The approval request was already used. |
| `503` | The configured Groq model is unavailable. |
| `500` | Unexpected server/upstream error; an invalid auth token may currently surface as `500`. |
