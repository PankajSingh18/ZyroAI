# ZyroAI Backend: API and Integrations

This guide covers backend setup for Firebase and Google OAuth, plus the authenticated chat, agent, image, and action-approval endpoints.

## Firebase Admin credentials

The backend uses Firebase Admin to verify sign-in tokens. For deployment (including Render), add a `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable containing the complete service-account JSON. Keep it in the hosting provider's secret environment settings; do not commit it or paste it into source files.

For local development, the backend also accepts `Backend/serviceAccountKey.json`. This file is ignored by Git and should remain private. If both credential sources are present, `FIREBASE_SERVICE_ACCOUNT_JSON` takes precedence.

## Google OAuth

The Google OAuth client is configured in `config/googleOAuth.js` and is used by the integration routes to connect a user's Google account for Gmail and Google Calendar features.

### Google Cloud setup

1. In Google Cloud Console, select the project and create an OAuth 2.0 Client ID for a **Web application**.
2. Enable the **Gmail API** and **Google Calendar API** for that project.
3. Add the backend callback URL to the OAuth client's **Authorized redirect URIs**. It must exactly match `GOOGLE_REDIRECT_URI`:
   - Local: `http://localhost:8000/api/integration/google/callback`
   - Production: `https://<your-backend-domain>/api/integration/google/callback`
4. Configure the OAuth consent screen. During testing, add the Google accounts that need access as test users. Google may require app verification before general use of Gmail scopes.

### Environment variables

Set these in `Backend/.env` for local development and in the hosting provider's secret environment settings for deployment:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID from Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client secret; keep private. |
| `GOOGLE_REDIRECT_URI` | Exact backend callback URL registered in Google Cloud. |
| `FRONTEND_URL` | Frontend origin used after a successful callback, for example `http://localhost:5173` locally. |
| `JWT_SECRET` | Signs and verifies the short-lived OAuth `state` value. |
| `ENCRYPTION_KEY` | 64 hexadecimal characters used to encrypt Google tokens stored in MongoDB. Keep it stable; changing it makes previously stored tokens undecryptable. |

Never commit `.env`, OAuth client secrets, or token values. `index.js` loads dotenv before the application modules so the OAuth client is initialized with the configured environment values.

### OAuth flow

1. An authenticated frontend requests `GET /api/integration/google` (or `GET /api/integration/google/connect`).
2. The backend returns an authorization URL with the configured scopes, offline access, and a signed `state` value that expires after 10 minutes.
3. The user grants consent on Google's page. Google redirects to `GET /api/integration/google/callback` with an authorization code and the state.
4. The backend validates the state, exchanges the code, identifies the Google account, encrypts and stores the tokens, then redirects to `${FRONTEND_URL}/integration?google=connected`.

The callback route is public because Google redirects the browser to it; the signed, expiring state binds the callback to the initiating user. The connect and disconnect routes require the user's authenticated cookie.

### Requested scopes

| Scope | Access |
| --- | --- |
| `openid`, `email`, `profile` | Identify the connected Google account. |
| `https://www.googleapis.com/auth/calendar.events` | Create and manage calendar events. |
| `https://www.googleapis.com/auth/gmail.send` | Send email through Gmail. |
| `https://www.googleapis.com/auth/gmail.readonly` | Search and read Gmail messages. |

The user must grant the required scopes for the corresponding Gmail or Calendar integration to work.

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
