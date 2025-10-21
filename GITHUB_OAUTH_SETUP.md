# GitHub OAuth Setup Guide

To enable GitHub authentication in this app, you need to create a GitHub OAuth App.

## Steps

### 1. Create a GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "OAuth Apps" in the left sidebar
3. Click "New OAuth App"
4. Fill in the form:
   - **Application name**: `My Electron GitHub App` (or any name you prefer)
   - **Homepage URL**: `http://localhost:4927`
   - **Authorization callback URL**: `geppetto://auth/callback`
   - **Application description**: Optional
5. Click "Register application"

### 2. Get Your Credentials

After creating the app:
1. Copy the **Client ID** (visible immediately)
2. Click "Generate a new client secret"
3. Copy the **Client Secret** (you can only see this once!)

### 3. Update Your .env File

Open `.env` and replace the placeholder values:

```bash
GITHUB_CLIENT_ID=your_actual_client_id_here
GITHUB_CLIENT_SECRET=your_actual_client_secret_here
```

### 4. Restart the App

After updating the `.env` file, restart the dev server:

```bash
pnpm dev
```

## How It Works

1. When you click "Connect GitHub", the app opens your browser to GitHub's authorization page
2. After you authorize the app, GitHub redirects to `geppetto://auth/callback` with an authorization code
3. The custom protocol handler catches this URL and routes it back to the app
4. The code is exchanged for an access token
5. The token is securely stored (encrypted) locally using `electron-store`

### Why Custom Protocol Instead of HTTP Server?

This app uses a **custom protocol handler** (`geppetto://`) instead of a local HTTP server. This is the same approach used by GitHub Desktop, VS Code, Slack, and other native desktop apps because it:
- ✅ Avoids port conflicts (no need for port 3000)
- ✅ More secure (no network exposure)
- ✅ Works across all platforms consistently
- ✅ Prevents firewall prompts
- ✅ Is the recommended approach for native OAuth flows

## Troubleshooting

### "Connecting..." never completes

Check the terminal output for errors. Common issues:
- `.env` file not updated with real credentials
- OAuth callback URL in GitHub doesn't match `geppetto://auth/callback`
- Network/firewall blocking the OAuth flow
- Protocol handler not registered (try restarting the app)

### Browser doesn't open

Make sure your system's default browser is set correctly.

### Authentication timeout

The app waits up to 2 minutes for you to complete authentication in the browser. If you see a timeout error, try again and complete the authorization more quickly.
