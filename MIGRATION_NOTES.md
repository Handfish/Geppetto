# OAuth Migration: HTTP Server → Custom Protocol Handler

## ✅ What Changed

The OAuth flow has been migrated from using a local HTTP server (`http://localhost:3000/callback`) to using a custom protocol handler (`geppetto://auth/callback`).

This is the same approach used by:
- GitHub Desktop (`x-github-desktop-auth://`)
- VS Code (`vscode://`)
- Slack (`slack://`)
- Discord (`discord://`)

## 🔧 Required Action: Update GitHub OAuth App

**IMPORTANT**: You must update your GitHub OAuth App configuration:

1. Go to https://github.com/settings/developers
2. Click on your OAuth App
3. Update the **Authorization callback URL** from:
   - ❌ Old: `http://localhost:3000/callback`
   - ✅ New: `geppetto://auth/callback`
4. Click "Update application"

## 📝 Code Changes Summary

### Main Process (`src/main/index.ts`)
- ✅ Registered `geppetto://` protocol handler using `app.setAsDefaultProtocolClient()`
- ✅ Added `open-url` event handler for macOS
- ✅ Added `second-instance` handler for Windows/Linux
- ✅ Added single instance lock to prevent duplicate instances
- ✅ Forwards protocol callbacks via `oauth-callback` event

### Auth Service (`src/main/github/auth-service.ts`)
- ✅ Removed HTTP server code (no more `http.createServer()`)
- ✅ Changed redirect URI to `geppetto://auth/callback`
- ✅ Listen for `oauth-callback` event instead of HTTP requests
- ✅ Added protocol URL validation
- ✅ Proper cleanup of event listeners

### HTTP Service (`src/main/github/http-service.ts`)
- ✅ Added explicit GitHub error response handling
- ✅ Improved error logging with actual response data
- ✅ Better schema validation error messages

### IPC Handlers (`src/main/ipc/github-handlers.ts`)
- ✅ Added `GitHubTokenExchangeError` to error mapping
- ✅ Improved error messages for debugging

### Schemas (`src/main/github/schemas.ts`)
- ✅ Made `scope` optional in `GitHubTokenResponse` (GitHub doesn't always send it)

## 🎯 Benefits

1. **No Port Conflicts**: No longer uses port 3000
2. **More Secure**: No HTTP server exposed on localhost
3. **Better UX**: No firewall prompts from opening ports
4. **Platform Native**: Standard approach for desktop OAuth
5. **Simpler Code**: No HTTP server management or port collision handling
6. **Works Offline**: Protocol registration doesn't require network

## 🧪 Testing Checklist

- [ ] Update GitHub OAuth app callback URL to `geppetto://auth/callback`
- [ ] Restart the app (`pnpm dev`)
- [ ] Click "Connect GitHub"
- [ ] Verify browser opens to GitHub authorization page
- [ ] Authorize the app
- [ ] Verify the app receives the callback and shows authentication success
- [ ] Check terminal logs for `[Protocol]` messages

## 🐛 Troubleshooting

If authentication doesn't work:

1. **Check the callback URL**: Must be exactly `geppetto://auth/callback` in GitHub settings
2. **Restart the app**: Protocol handlers are registered on app start
3. **Check logs**: Look for `[Protocol] Received URL` messages
4. **Clear old tokens**: If needed, delete `~/.config/my-electron-app/secure-data.json*`

## 📚 Technical Details

### macOS
- Uses `app.on('open-url')` event
- Protocol handler must be registered before `app.whenReady()`

### Windows/Linux
- Uses `app.on('second-instance')` event
- Requires single instance lock (`app.requestSingleInstanceLock()`)
- Protocol URL passed via command line arguments

### Event Flow
```
Browser → GitHub Authorization → geppetto://auth/callback?code=...
  ↓
OS Protocol Handler
  ↓
Electron App (open-url or second-instance)
  ↓
app.emit('oauth-callback', url)
  ↓
GitHubAuthService listener
  ↓
Token exchange → Store credentials
```
