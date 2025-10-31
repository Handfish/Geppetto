# Testing Git Stderr Flow

This guide explains how to test that git stderr (error output) properly flows from git commands → backend → IPC → renderer UI.

## What We Fixed

Previously, error mappers were checking for the wrong error tag (`GitCommandExecutionError` instead of `GitCommandFailedError`), which caused stderr from git to be lost. Now all error mappers correctly extract stderr from git errors.

## IPC Error Response Format

**Important**: Electron IPC calls in this app return error objects instead of throwing:

```javascript
// ✅ Correct - Check for error in response
const result = await window.electron.ipcRenderer.invoke('some-channel', params)
if (result._tag === 'Error') {
  // result.error contains the actual error with stderr
  console.log(result.error.stderr)
}

// ❌ Wrong - IPC doesn't throw
try {
  await window.electron.ipcRenderer.invoke('some-channel', params)
} catch (error) {
  // This catch block will NOT run for domain errors
}
```

The Error Tester component handles this correctly by checking for `_tag === 'Error'`.

## How to Test

### 1. Start the Application

```bash
pnpm dev
```

### 2. Open the Source Control Dev Panel

The dev panel should automatically appear in development mode. If not:
- Look for the "📦 Source Control" button in the bottom-right
- Click it to open the panel

### 3. Select a Repository (Optional)

Some error tests work better with a selected repository:
1. Click the "Repositories" tab
2. Select any repository from the list
3. The dev panel will switch to the Commits tab

### 4. Go to Error Testing Tab

1. Click the "🔴 Error Testing" tab in the dev panel
2. You'll see 4 test buttons that intentionally trigger git errors

### 5. Run Error Tests

Click any of these buttons:

- **🔴 Invalid Base Branch** - Tries to create worktree with non-existent branch
  - Expected stderr: `fatal: invalid reference: this-branch-does-not-exist-12345`

- **🔴 Invalid Issue Number** - Creates worktree with negative issue number
  - Expected: May create branch `issue#-1` (unusual but valid git branch name)

- **🔴 Remove Non-Existent Worktree** - Tries to remove worktree that doesn't exist
  - Expected stderr: `fatal: 'path' is not a working tree` or similar

- **🔴 Invalid Repository ID** - Lists worktrees for non-existent repo
  - Expected: NotFoundError (no git command executed, so no stderr)

### 6. Verify Stderr is Displayed

After clicking a test button, check the test result card:

✅ **SUCCESS** - You should see:
```
📋 STDERR (Git Error Output):
fatal: invalid reference: this-branch-does-not-exist-12345
```

❌ **FAILURE** - If stderr section is missing or empty, the fix didn't work.

### 7. Check Browser Console

Press `F12` to open DevTools and check the console. You should see:
- `[GitErrorTester] Testing invalid base branch...`
- `[GitErrorTester] Caught error: { ... }`
- Full error object with stderr included

### 8. Check Full Error Object

In each test result card, click "Full Error Object" to expand it. You should see:
```json
{
  "error": {
    "_tag": "GitOperationError",
    "message": "Failed to create branch issue#999 from this-branch-does-not-exist-12345",
    "stderr": "fatal: invalid reference: this-branch-does-not-exist-12345\n"
  }
}
```

## What to Look For

### ✅ Working Stderr Flow

- Stderr section is visible
- Contains actual git error messages (starting with "fatal:", "error:", etc.)
- Error messages are helpful and descriptive

### ❌ Broken Stderr Flow

- Stderr section is missing
- Stderr is empty or undefined
- Only generic error messages without git details

## Additional Testing

### Test in Real Scenarios

You can also test stderr flow in real usage:

1. **Shortlist an Issue with Invalid Base Branch**:
   - Go to GitHub Issues view
   - Edit an issue's details to use a non-existent base branch
   - Try to create a worktree
   - Error toast should show actual git stderr

2. **Manually Trigger Git Errors**:
   - Use the browser console to call IPC methods directly
   ```javascript
   await window.electron.ipcRenderer.invoke('source-control:create-worktree-for-issue', {
     repositoryId: 'some-repo-id',
     issueNumber: 123,
     baseBranch: 'invalid-branch-name-xyz'
   })
   ```

## Files Changed

The fix involved changing error tag checks in these files:

1. **src/main/source-control/git-command-service.ts**
   - Line 163: Branch creation error
   - Line 214: Worktree creation error
   - Line 257: Worktree removal error
   - Line 296: List worktrees error

   All changed from:
   ```typescript
   stderr: error._tag === 'GitCommandExecutionError' ? error.stderr : String(error)
   ```
   To:
   ```typescript
   stderr: error._tag === 'GitCommandFailedError' ? error.stderr : String(error)
   ```

## Error Flow

```
┌─────────────┐
│ Git Command │  exits with non-zero code
└──────┬──────┘
       │
       ▼
┌────────────────────────┐
│ node-git-command-runner│  captures stdout/stderr
│                        │  emits GitCommandFailedError
└──────┬─────────────────┘
       │
       ▼
┌─────────────────────┐
│ git-command-service │  extracts stderr into GitOperationError
│                     │  (now uses correct error tag!)
└──────┬──────────────┘
       │
       ▼
┌──────────────┐
│ error-mapper │  maps to shared error schema
│              │  preserves stderr field
└──────┬───────┘
       │
       ▼
┌──────────────┐
│     IPC      │  sends error to renderer
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Renderer   │  displays error.stderr in UI
│              │  (GitErrorTester, toasts, etc.)
└──────────────┘
```

## Troubleshooting

### Stderr Still Not Showing

1. Check that you're running the latest build:
   ```bash
   pnpm compile:app && pnpm start
   ```

2. Verify the error tag fix is in place:
   ```bash
   grep -n "GitCommandFailedError" src/main/source-control/git-command-service.ts
   ```
   Should show lines 163, 214, 257, 296

3. Check for 'GitCommandExecutionError' (should find nothing):
   ```bash
   grep -r "GitCommandExecutionError" src/main/source-control/
   ```

### Dev Panel Not Showing

- Dev panel only appears in development mode (`pnpm dev`)
- Check that `NODE_ENV === 'development'`

### Tests All Succeed

If tests succeed instead of failing, your git/repository state might be unusual:
- Try the "Invalid Base Branch" test - this should always fail
- Check browser console for actual IPC responses

## Success Criteria

The stderr flow is working correctly when:

✅ All 4 error tests display stderr section
✅ Stderr contains actual git error messages
✅ Error messages are helpful for debugging
✅ Console logs show full error objects with stderr
✅ Full Error Object expansion shows stderr field

## Next Steps

Once stderr flow is verified:
1. Test in real user scenarios (issue shortlisting, branch operations)
2. Improve error toast UI to display stderr prominently
3. Add stderr display to other error scenarios (not just git)
4. Consider adding stderr to error logging/telemetry
