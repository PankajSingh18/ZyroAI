# ZyroAI

ZyroAI is an AI automation workspace for chatting with AI, creating tool-enabled agents, connecting external services, and managing usage credits.

## What it includes

- **AI chat** with conversation history and image analysis/captioning.
- **Custom agents** with per-agent instructions, knowledge bases, and optional tools.
- **Connected services** for Google Gmail/Calendar and Instagram.
- **Credits and plans** with Razorpay checkout.
- **Authentication** using Firebase on the client and a protected Express API.

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | React, Vite, Tailwind CSS, Redux Toolkit |
| Backend | Node.js, Express, MongoDB, Mongoose |
| AI and tools | LangChain, LangGraph, Groq, Gemini, Model Context Protocol (MCP) |
| Integrations | Firebase Authentication, Google APIs, Instagram Graph API, Razorpay |

## Repository layout

```text
.
├── Backend/
│   ├── config/          # Database, OAuth, Firebase, and payment configuration
│   ├── controllers/     # API handlers
│   ├── mcp/             # MCP server and tool integrations
│   ├── models/          # MongoDB models
│   ├── routes/          # Express API routes
│   ├── utils/           # Chat graphs, agent tools, and credit helpers
│   └── README.md        # Backend API, Firebase, and Google OAuth guide
└── Frontend/
    └── src/
        ├── Pages/       # Login, workspace, agents, integrations, and pricing
        ├── features/    # API calls
        └── redux/       # Application state
```

## Requirements

- Node.js 22.12 or newer
- npm
- A MongoDB database
- Firebase project credentials

Google OAuth, AI image analysis, web search, Instagram, and Razorpay each need their corresponding provider credentials. You can run the app without optional integrations, but the features that depend on them will be unavailable.

## Run locally

### 1. Configure the backend

Create `Backend/.env`. At minimum, configure:

```dotenv
PORT=8000
MONGO_URI=<your MongoDB connection string>
JWT_SECRET=<a long random secret>
MCP_AUTH_SECRET=<a separate long random secret>
GROQ_API_KEY=<your Groq API key>
ENCRYPTION_KEY=<64 hexadecimal characters>
```

Firebase Admin credentials are also needed for authentication. For local development, place the Firebase service-account JSON at `Backend/serviceAccountKey.json`; it is ignored by Git. For deployment, use the `FIREBASE_SERVICE_ACCOUNT_JSON` secret environment variable with the complete JSON value instead.

Configure the provider variables for the integrations you plan to use:

| Variables | Used for |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth; add the callback URI to the Google OAuth client. |
| `FRONTEND_URL` | Frontend origin allowed by backend CORS and used after an integration callback. |
| `GOOGLE_API_KEY` or `GEMINI_API_KEY` | Gemini-powered image analysis and captioning. |
| `TAVILY_API_KEY` | Web search; optional. |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` | Instagram connection and publishing. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Payment checkout and verification. |

The Google callback URL for local development is:

```text
http://localhost:8000/api/integration/google/callback
```

Install dependencies and start the API:

```bash
cd Backend
npm install
npm run dev
```

The backend defaults to port `5000`; the example above uses `8000` to match the frontend API default.

### 2. Configure and run the frontend

Create `Frontend/.env` with:

```dotenv
VITE_SERVER_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=<your Firebase web API key>
VITE_CLOUDINARY_CLOUD_NAME=<your Cloudinary cloud name>
VITE_CLOUDINARY_PRESET=<your unsigned upload preset>
```

Install dependencies and start Vite:

```bash
cd Frontend
npm install
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`).

## API overview

The backend mounts these API groups:

| Base path | Purpose |
| --- | --- |
| `/api/auth` | Sign-in, sign-out, and current user |
| `/api/chat` | Chat, image analysis/captions, agent chat, and action approvals |
| `/api/agent` | Create and manage agents |
| `/api/integration` | Google and Instagram connections |
| `/api/payment` | Payment order creation and verification |

Most endpoints require the authenticated user's cookie. See the [Backend README](./Backend/README.md) for request examples, credit costs, Firebase deployment credentials, and detailed Google OAuth setup.

## Useful commands

```bash
# Frontend
cd Frontend
npm run lint
npm run build

# Backend
cd Backend
npm run dev
```

## Security notes

- Keep `.env`, provider secrets, and Firebase service-account JSON out of Git.
- Use hosting-provider secret settings for deployed credentials.
- Keep `ENCRYPTION_KEY` stable while encrypted integration tokens exist in MongoDB.
- Configure production OAuth redirect URIs with the exact deployed backend callback URL.
