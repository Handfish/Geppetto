# Runner Activity Detection: Node-PTY and Tmux Control Mode

## Problem Statement

When users spawn AI runners that run in tmux sessions accessed via external terminal emulators (like Ghostty), the runner UI icons need to reflect real-time activity - turning green when the user types in that session.

### Original Approach: FIFO Buffering

Initially, activity detection used FIFO (named pipes) with tmux's `pipe-pane` command:

```bash
tmux pipe-pane -t session:pane "cat > /tmp/fifo-$pane"
```

**Problems with FIFO approach:**
1. **Buffering delays**: Data accumulated in the FIFO buffer, causing significant latency before activity detection
2. **Batching behavior**: Activity wasn't detected in real-time; events arrived in batches
3. **No heartbeat**: The system couldn't distinguish between "no activity" and "data in buffer waiting to be read"
4. **Slow UI feedback**: Icon state changes lagged behind actual user typing

## Solution: Node-PTY + Tmux Control Mode

### Why Node-PTY?

We needed a way to spawn a PTY (pseudo-terminal) that could connect to tmux's control mode protocol. Node-PTY provides:
- Native PTY spawning capability
- Ability to run `tmux -CC attach-session` (control mode requires a proper TTY)
- Event-driven data streaming instead of FIFO polling
- Real-time stream processing

### Why Tmux Control Mode (`-CC`)?

Tmux Control Mode is a machine-readable protocol that sends structured events to attached control mode clients:

```
%output %<pane-id> <escaped-data>
%pane-mode-changed %<pane-id>
%session-changed $<session-id> <name>
...
```

**Advantages over pipe-pane:**
1. **Real-time events**: Events are sent as they occur, not buffered
2. **Structured protocol**: Machine-readable format, not raw terminal output
3. **Multiple event types**: Can distinguish between output, mode changes, session changes
4. **Stream-based**: Data flows continuously, enabling instant activity detection

### Architecture

```
User types in Ghostty
    ↓
Tmux session receives input
    ↓
Tmux -CC control mode protocol sends %output event
    ↓
Node-PTY receives event on PTY
    ↓
TmuxControlClient.createEventStream() parses %output
    ↓
ProcessEvent yielded through Effect Stream
    ↓
Activity detector marks process as active
    ↓
Runner icon turns green
```

### Implementation Details

**TmuxControlClient** (`src/main/ai-runners/adapters/tmux-control-client-adapter.ts`):
- Spawns `tmux -CC attach-session` with proper PTY via node-pty
- Parses `%output %<pane-id> <data>` events from the control mode stream
- Handles escape sequence unescaping (`\\033` → `\x1b`)
- Yields `ProcessEvent` objects through Effect streams

**Integration** (`src/main/ai-runners/adapters/tmux-session-manager-adapter.ts`):
- When creating a runner session, extracts the pane ID from tmux
- Calls `pipeTmuxSession()` to start control mode monitoring
- One control mode client per runner session

**Activity Flow**:
1. Control mode events are parsed and yielded as `ProcessEvent` streams
2. Node process monitor taps these events and calls `markActivity()`
3. Activity state updates trigger UI reactivity
4. Runner icons reflect real-time state

## Known Limitations

### Performance: Window Switching

When multiple control mode clients are active (one per runner), `tmux switch-client` becomes slow due to resource contention. This is a tmux limitation, not a defect in our implementation.

**Why it happens:**
- Each runner maintains an attached control mode PTY client
- These clients share tmux's command processing resources
- `switch-client` must coordinate across all attached clients
- Result: slight delay (1-3 seconds) when switching sessions

**Trade-off accepted:**
- **Gained**: Real-time activity detection for all runners
- **Lost**: Instant session switching (but it still works, just slower)
- **Rationale**: Activity detection was the priority; window switching delay is acceptable

### Alternative Approaches Considered

1. **Only spawn control mode on demand**: Could reduce contention but would miss activity spikes
2. **Use send-keys to simulate `<C-b> s`**: Unreliable; tmux keybindings aren't guaranteed to work
3. **Async/background switch-client**: Loses feedback; user doesn't know if switch succeeded
4. **XDoTool for window focus**: X11-only; doesn't work on Wayland or macOS
5. **Reduce control mode clients**: Would lose activity detection for runners we're not actively monitoring

All alternatives had worse trade-offs than accepting the slight switch-client delay.

## Future Optimizations

If window switching performance becomes critical:

1. **Lazy control mode spawning**: Only spawn control mode client when renderer subscribes to events
2. **Control mode connection pooling**: Share one control mode connection across multiple panes (if tmux supports it)
3. **Alternative activity detection**: Use webhook-based activity reports instead of continuous monitoring
4. **Reduce monitoring scope**: Only monitor foreground runner, not all runners

## Code References

- **Control mode client**: `src/main/ai-runners/adapters/tmux-control-client-adapter.ts`
- **Session manager**: `src/main/ai-runners/adapters/tmux-session-manager-adapter.ts`
- **Process monitor integration**: `src/main/ai-runners/adapters/node-process-monitor-adapter.ts` (lines ~830-900)
- **Activity detection**: Look for `markActivity()` calls in the process monitor

## Debugging

To see control mode events in action:

```bash
# In one terminal, spawn a test control mode client
tmux -CC attach-session -t session-name

# In another terminal, type in that session
tmux send-keys -t session-name "echo test" Enter

# In the first terminal, you'll see:
# %output %<pane-id> <data>
```

Enable detailed logging by looking for `[TmuxControl:...]` log messages in the dev console when runners are active.
