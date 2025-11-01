# Why Layer-Based Hexagonal Architecture > Effect.Service Registry for AI Agents

**Date:** 2025-10-26
**Purpose:** Explain why the new Layer-based hexagonal architecture is superior to the old Effect.Service registry pattern for building AI agents (Claude, Codex, etc.)

**See Also:** [Effect Ports and Layers Guide](./EFFECT_PORTS_AND_LAYERS_GUIDE.md) - General patterns for all domains

---

## TL;DR

The new architecture enables AI agents to:
- ✅ Access multiple AI providers simultaneously through a unified interface
- ✅ Implement intelligent fallback strategies across providers
- ✅ Route tasks to specialized providers dynamically
- ✅ Test agent logic with hot-swappable mocks
- ✅ Build complex multi-provider orchestration without tight coupling

**The old Effect.Service registry pattern forced agents to depend on concrete service implementations. The new Layer-based hexagonal pattern provides a unified interface (AiProviderPort) with hot-swappable implementations.**

---

## Old Architecture: Effect.Service Registry Pattern

### How It Worked

```typescript
// Each provider was a separate Effect.Service
export class OpenAiProviderService extends Effect.Service<OpenAiProviderService>()(...) {
  effect: Effect.gen(function* () {
    return {
      signIn: () => { /* OpenAI-specific logic */ },
      getUsage: () => { /* OpenAI-specific logic */ },
    }
  })
}

export class ClaudeProviderService extends Effect.Service<ClaudeProviderService>()(...) {
  effect: Effect.gen(function* () {
    return {
      signIn: () => { /* Claude-specific logic */ },
      getUsage: () => { /* Claude-specific logic */ },
    }
  })
}

// Registry just mapped strings to services
export class AiProviderRegistryService extends Effect.Service<...>()(...) {
  effect: Effect.gen(function* () {
    return {
      getAdapter: (provider: string) => Effect.gen(function* () {
        // ❌ Had to yield* specific service tags at CALL TIME
        if (provider === 'openai') {
          return yield* OpenAiProviderService  // Requires context at call time
        }
        if (provider === 'claude') {
          return yield* ClaudeProviderService  // Requires context at call time
        }
      })
    }
  })
}
```

### Problems for AI Agents

#### ❌ Problem 1: Context Propagation Hell

AI agents had to propagate Effect context everywhere:

```typescript
// Agent code was polluted with context requirements
class AiAgent {
  async queryProvider(provider: string) {
    return Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* AiProviderRegistryService

        // This requires OpenAiProviderService in context at CALL TIME
        const adapter = yield* registry.getAdapter('openai')

        return yield* adapter.getUsage(accountId)
      }).pipe(
        // ❌ MUST provide all possible provider services
        Effect.provide(Layer.mergeAll(
          OpenAiProviderService.Default,    // Always needed
          ClaudeProviderService.Default,    // Always needed
          CursorProviderService.Default,    // Always needed
          AiProviderRegistryService.Default
        ))
      )
    )
  }
}
```

**Why this is bad for agents:**
- Agent code can't be modular - always needs full layer composition
- Can't test individual provider interactions without mocking all services
- Adding new providers requires updating agent layer dependencies
- IPC handlers couldn't use the registry without complex context setup

#### ❌ Problem 2: No Unified Interface

Each provider service had its own type:

```typescript
// Agent had to know about every concrete service type
const agent = Effect.gen(function* () {
  // Different types, different APIs
  const openai: OpenAiProviderService = yield* OpenAiProviderService
  const claude: ClaudeProviderService = yield* ClaudeProviderService

  // ❌ Can't treat them uniformly
  // ❌ Can't iterate over providers
  // ❌ Can't pass them to generic functions
})
```

**Why this is bad for agents:**
- Can't build generic orchestration logic
- Can't dynamically select providers at runtime
- Can't iterate over all available providers
- Hard to implement fallback strategies

#### ❌ Problem 3: Difficult Testing

Mocking required replacing entire services:

```typescript
// Testing required complex mock service setup
const MockOpenAiService = Effect.Service<OpenAiProviderService>()(
  'OpenAiProviderService',
  {
    effect: Effect.succeed({
      signIn: () => Effect.succeed(mockResult),
      getUsage: () => Effect.succeed(mockUsage),
      // ... had to mock ALL methods
    })
  }
)

// Agent tests were verbose and brittle
const testAgent = Effect.gen(function* () {
  // Test code looks different from production code
  const openai = yield* OpenAiProviderService  // Still need concrete type
  // ...
}).pipe(
  Effect.provide(Layer.mergeAll(
    MockOpenAiService,           // Mock this one
    ClaudeProviderService.Default, // But still need real ones?
    // ... messy
  ))
)
```

**Why this is bad for agents:**
- Test setup is complex and brittle
- Mock services must implement full interface
- Hard to test individual provider scenarios
- Can't easily swap providers in tests

#### ❌ Problem 4: No Dynamic Provider Selection

Agents couldn't dynamically choose providers:

```typescript
// Had to hardcode provider access
const agent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService

  // ❌ This doesn't work cleanly
  const providerName = selectBestProvider() // Returns 'openai' or 'claude'

  // Still need to yield* the specific service
  const adapter = yield* registry.getAdapter(providerName)
  // This requires the service in context at call time!
})
```

**Why this is bad for agents:**
- Can't implement intelligent routing
- Can't build cost-aware provider selection
- Can't adapt to availability/performance
- Limited orchestration possibilities

---

## New Architecture: Layer-Based Hexagonal Pattern

### How It Works

```typescript
// 1. Define the PORT (interface/contract)
export interface AiProviderPort {
  readonly provider: AiProviderType
  readonly supportsUsage: boolean

  signIn(): Effect.Effect<AiProviderSignInResult, ...>
  getUsage(accountId: AiAccountId): Effect.Effect<AiUsageSnapshot, ...>
  // ... other methods
}

// 2. Create unique tags for each provider
export class AiProviderTags {
  static register(provider: AiProviderType): Context.Tag<AiProviderPort, AiProviderPort> {
    const tag = Context.GenericTag<AiProviderPort>(`AiProvider:${provider}`)
    this.tags.set(provider, tag)
    return tag
  }
  // ... registry methods
}

// 3. Implement ADAPTERS as Layers
const OpenAiProviderTag = AiProviderTags.register('openai')

export const OpenAiBrowserProviderAdapter = Layer.effect(
  OpenAiProviderTag,
  Effect.gen(function* () {
    // Access infrastructure
    const browserAuth = yield* BrowserAuthService
    const usagePage = yield* CookieUsagePageAdapter

    // Return adapter implementing AiProviderPort
    const adapter: AiProviderPort = {
      provider: 'openai',
      supportsUsage: true,
      signIn: () => { /* implementation */ },
      getUsage: (accountId) => { /* implementation */ },
    }
    return adapter
  })
).pipe(Layer.provide(AiInfrastructureLayer))

// 4. Registry CAPTURES adapters at construction time
export class AiProviderRegistryService extends Effect.Service<...>()(...) {
  effect: Effect.gen(function* () {
    // ✅ Capture ALL adapters during construction
    const tags = AiProviderTags.all()
    const adaptersMap = new Map<AiProviderType, AiProviderPort>()

    for (const tag of tags) {
      const adapter = yield* tag  // Context available NOW
      adaptersMap.set(adapter.provider, adapter)
    }

    // ✅ Methods access the Map (no context needed at call time)
    return {
      getAdapter: (provider: AiProviderType) =>
        Effect.gen(function* () {
          const adapter = adaptersMap.get(provider)  // ✅ No yield* needed!
          if (!adapter) {
            return yield* Effect.fail(new AiProviderNotRegisteredError({ provider }))
          }
          return adapter
        }),

      listAdapters: () => Effect.succeed(Array.from(adaptersMap.values()))
    }
  })
}

// 5. Compose in MainLayer with proper dependency injection
const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,  // Shared services

  Layer.provide(
    Layer.mergeAll(
      AiProviderRegistryService.Default,  // Captures adapters
      AiProviderService.Default,
      // ... other services
    ),
    AiAdaptersLayer  // ✅ Provides all adapters to services above
  )
)
```

### Benefits for AI Agents

#### ✅ Benefit 1: No Context Propagation

Agents work cleanly without context pollution:

```typescript
// Agent code is clean and modular
class AiAgent {
  async queryProvider(provider: string) {
    return Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* AiProviderRegistryService

        // ✅ No context needed - adapter already captured!
        const adapter = yield* registry.getAdapter('openai')

        // ✅ Just use it
        return yield* adapter.getUsage(accountId)
      }).pipe(
        // ✅ Only need the services agent directly uses
        Effect.provide(Layer.mergeAll(
          AiProviderRegistryService.Default,  // That's it!
        ))
      )
    )
  }
}
```

**Why this is better for agents:**
- Agent code is modular and focused
- Test setup is minimal
- Adding providers doesn't affect agent code
- IPC handlers work seamlessly
- Agents only depend on registry, not concrete adapters

#### ✅ Benefit 2: Unified Interface

All providers implement the same port:

```typescript
// Agent can treat all providers uniformly
const agent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService

  // ✅ All have the same type: AiProviderPort
  const adapters = yield* registry.listAdapters()

  // ✅ Can iterate uniformly
  for (const adapter of adapters) {
    const usage = yield* adapter.getUsage(accountId)
    processUsage(usage)
  }

  // ✅ Can pass to generic functions
  const results = yield* Effect.forEach(
    adapters,
    adapter => adapter.getUsage(accountId),
    { concurrency: 'unbounded' }
  )
})
```

**Why this is better for agents:**
- Build generic orchestration logic
- Iterate over all providers easily
- Pass adapters to reusable functions
- Implement patterns like "try all providers"

#### ✅ Benefit 3: Easy Testing with Hot-Swapping

Mocking is trivial with Layer.provide:

```typescript
// Create mock adapter (same interface!)
const MockOpenAiAdapter = Layer.succeed(
  AiProviderTags.getOrCreate('openai'),
  {
    provider: 'openai',
    supportsUsage: true,
    signIn: () => Effect.succeed(mockSignInResult),
    getUsage: () => Effect.succeed(mockUsage),
  } satisfies AiProviderPort  // ✅ Type-checked against port
)

// Agent tests use same code as production
const testAgent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService

  // ✅ Same code as production!
  const adapter = yield* registry.getAdapter('openai')
  const usage = yield* adapter.getUsage(accountId)

  expect(usage).toEqual(mockUsage)
}).pipe(
  // ✅ Just swap the adapter layer
  Effect.provide(Layer.mergeAll(
    Layer.provide(
      AiProviderRegistryService.Default,
      MockOpenAiAdapter  // Hot-swap!
    )
  ))
)
```

**Why this is better for agents:**
- Test code identical to production code
- Easy to mock individual providers
- Can test multi-provider scenarios
- Type-safe mocking (implements AiProviderPort)

#### ✅ Benefit 4: Dynamic Provider Selection

Agents can choose providers at runtime:

```typescript
// Agent selects provider dynamically
const agent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService

  // ✅ Choose provider based on any criteria
  const providerName = yield* selectBestProvider()  // Returns 'openai' | 'claude' | 'cursor'

  // ✅ Get adapter dynamically
  const adapter = yield* registry.getAdapter(providerName)

  // ✅ Use it (no context issues!)
  return yield* adapter.getUsage(accountId)
})

// Example: Cost-aware selection
const selectBestProvider = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService
  const adapters = yield* registry.listAdapters()

  // Check usage for all providers
  const usages = yield* Effect.forEach(
    adapters,
    adapter => adapter.getUsage(getAccountId(adapter.provider)),
    { concurrency: 'unbounded' }
  )

  // Return provider with most remaining quota
  return usages
    .map((usage, i) => ({ usage, adapter: adapters[i] }))
    .sort((a, b) => getRemainingQuota(b.usage) - getRemainingQuota(a.usage))[0]
    .adapter
})
```

**Why this is better for agents:**
- Intelligent routing based on availability
- Cost optimization across providers
- Performance-based selection
- Failover strategies

---

## Concrete Benefits for Claude/Codex AI Agents

### Use Case 1: Multi-Provider Query Orchestration

**Scenario:** Claude Code agent needs to gather context from multiple AI providers to answer a user question.

```typescript
// Claude Code agent gathering multi-provider context
export const claudeCodeMultiProviderAgent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService

  // ✅ Get all available providers
  const adapters = yield* registry.listAdapters()

  // ✅ Query all providers in parallel
  const providerContexts = yield* Effect.forEach(
    adapters,
    adapter => Effect.gen(function* () {
      const usage = yield* adapter.getUsage(getAccountId(adapter.provider))
      return {
        provider: adapter.provider,
        hasQuota: hasRemainingQuota(usage),
        capabilities: extractCapabilities(usage),
      }
    }),
    { concurrency: 'unbounded' }
  )

  // ✅ Build comprehensive context for Claude
  const context = {
    availableProviders: providerContexts.filter(c => c.hasQuota),
    totalCapabilities: mergeCapabilities(providerContexts),
    recommendedProvider: selectBestForTask(providerContexts)
  }

  return context
})
```

**Old architecture:** Would require yielding each service separately, complex context management, can't iterate uniformly.

**New architecture:** Clean iteration, parallel execution, unified interface.

---

### Use Case 2: Intelligent Fallback Chain

**Scenario:** Codex agent tries primary provider, falls back to secondary, with detailed logging.

```typescript
// Codex agent with smart fallback
export const codexFallbackAgent = (taskType: string) =>
  Effect.gen(function* () {
    const registry = yield* AiProviderRegistryService

    // ✅ Define fallback chain based on task
    const fallbackChain = taskType === 'code-completion'
      ? ['cursor', 'openai', 'claude']  // Cursor best for code
      : ['claude', 'openai', 'cursor']  // Claude best for reasoning

    // ✅ Try each provider in order
    let lastError: unknown
    for (const providerName of fallbackChain) {
      const result = yield* Effect.gen(function* () {
        console.log(`[Codex] Trying provider: ${providerName}`)

        const adapter = yield* registry.getAdapter(providerName)
        const usage = yield* adapter.getUsage(getAccountId(providerName))

        // Check if provider has quota
        if (!hasRemainingQuota(usage)) {
          return yield* Effect.fail(new Error(`${providerName} has no quota`))
        }

        console.log(`[Codex] Success with: ${providerName}`)
        return usage
      }).pipe(
        Effect.catchAll(error => {
          console.log(`[Codex] ${providerName} failed: ${error}`)
          lastError = error
          return Effect.fail(error)
        }),
        Effect.orElseSucceed(() => null)  // Continue to next provider
      )

      if (result !== null) {
        return result  // Success!
      }
    }

    // All providers failed
    return yield* Effect.fail(
      new Error(`All providers failed. Last error: ${lastError}`)
    )
  })
```

**Old architecture:** Would require nested conditionals, hard to implement clean fallback chain, verbose error handling.

**New architecture:** Loop over providers, clean error handling with Effect operators, easy to modify fallback order.

---

### Use Case 3: A/B Testing and Quality Comparison

**Scenario:** Claude Code agent compares responses from multiple providers to ensure quality.

```typescript
// Claude Code A/B testing agent
export const claudeCodeQualityAgent = (query: string) =>
  Effect.gen(function* () {
    const registry = yield* AiProviderRegistryService

    // ✅ Get specific providers for comparison
    const [claude, openai] = yield* Effect.all([
      registry.getAdapter('claude'),
      registry.getAdapter('openai'),
    ])

    // ✅ Query both in parallel
    const [claudeResult, openaiResult] = yield* Effect.all([
      claude.getUsage(claudeAccountId).pipe(
        Effect.timeout(Duration.seconds(5)),
        Effect.catchAll(() => Effect.succeed(null))
      ),
      openai.getUsage(openaiAccountId).pipe(
        Effect.timeout(Duration.seconds(5)),
        Effect.catchAll(() => Effect.succeed(null))
      ),
    ], { concurrency: 'unbounded' })

    // ✅ Compare results
    if (claudeResult && openaiResult) {
      const comparison = {
        claude: analyzeQuality(claudeResult),
        openai: analyzeQuality(openaiResult),
        recommendation: selectBetterResponse(claudeResult, openaiResult)
      }

      // Log for improvement
      logProviderComparison(query, comparison)

      return comparison.recommendation
    }

    // Return whichever succeeded
    return claudeResult ?? openaiResult ?? yield* Effect.fail(
      new Error('Both providers failed')
    )
  })
```

**Old architecture:** Would need to reference concrete service types, complex parallel execution setup, verbose error handling.

**New architecture:** Clean parallel execution, uniform error handling, easy comparison logic.

---

### Use Case 4: Cost-Aware Task Distribution

**Scenario:** Codex agent distributes tasks across providers based on remaining quota.

```typescript
// Codex cost-aware distribution agent
export const codexCostAwareAgent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService
  const adapters = yield* registry.listAdapters()

  // ✅ Check usage for all providers
  const providerStates = yield* Effect.forEach(
    adapters,
    adapter => Effect.gen(function* () {
      const usage = yield* adapter.getUsage(getAccountId(adapter.provider)).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      )

      return {
        adapter,
        usage,
        remainingQuota: usage ? calculateRemainingQuota(usage) : 0,
        costPerRequest: getCostPerRequest(adapter.provider),
      }
    }),
    { concurrency: 'unbounded' }
  )

  // ✅ Sort by best value (quota / cost)
  const sortedProviders = providerStates
    .filter(p => p.remainingQuota > 0)
    .sort((a, b) => {
      const aValue = a.remainingQuota / a.costPerRequest
      const bValue = b.remainingQuota / b.costPerRequest
      return bValue - aValue  // Highest value first
    })

  if (sortedProviders.length === 0) {
    return yield* Effect.fail(new Error('No providers with remaining quota'))
  }

  // ✅ Use most cost-effective provider
  const bestProvider = sortedProviders[0].adapter
  console.log(`[Codex] Using ${bestProvider.provider} (best cost/value ratio)`)

  return bestProvider
})
```

**Old architecture:** Would require hardcoded service access, can't iterate over providers, complex state management.

**New architecture:** Clean iteration, uniform interface, easy to implement complex selection logic.

---

### Use Case 5: Hot-Swappable Testing for Agent Development

**Scenario:** Testing Claude Code agent behavior with various provider configurations.

```typescript
// Test Claude Code agent with different provider configurations
describe('ClaudeCodeAgent', () => {
  it('should handle provider failures gracefully', () => {
    // ✅ Create mock providers with specific behaviors
    const FailingOpenAiAdapter = Layer.succeed(
      AiProviderTags.getOrCreate('openai'),
      {
        provider: 'openai',
        supportsUsage: true,
        getUsage: () => Effect.fail(new Error('Rate limited'))
      } satisfies AiProviderPort
    )

    const SuccessfulClaudeAdapter = Layer.succeed(
      AiProviderTags.getOrCreate('claude'),
      {
        provider: 'claude',
        supportsUsage: true,
        getUsage: () => Effect.succeed(mockClaudeUsage)
      } satisfies AiProviderPort
    )

    // ✅ Agent code is IDENTICAL to production
    const result = await Effect.runPromise(
      claudeCodeAgent().pipe(
        Effect.provide(Layer.mergeAll(
          Layer.provide(
            AiProviderRegistryService.Default,
            Layer.mergeAll(
              FailingOpenAiAdapter,      // OpenAI fails
              SuccessfulClaudeAdapter    // Claude succeeds
            )
          )
        ))
      )
    )

    // Agent should have fallen back to Claude
    expect(result.provider).toBe('claude')
  })

  it('should prefer low-cost provider when both available', () => {
    // ✅ Mock both providers with different costs
    const ExpensiveOpenAiAdapter = Layer.succeed(
      AiProviderTags.getOrCreate('openai'),
      {
        provider: 'openai',
        supportsUsage: true,
        getUsage: () => Effect.succeed(mockExpensiveUsage)
      } satisfies AiProviderPort
    )

    const CheapCursorAdapter = Layer.succeed(
      AiProviderTags.getOrCreate('cursor'),
      {
        provider: 'cursor',
        supportsUsage: true,
        getUsage: () => Effect.succeed(mockCheapUsage)
      } satisfies AiProviderPort
    )

    // ✅ Same agent code, different layer configuration
    const result = await Effect.runPromise(
      codexCostAwareAgent.pipe(
        Effect.provide(Layer.mergeAll(
          Layer.provide(
            AiProviderRegistryService.Default,
            Layer.mergeAll(
              ExpensiveOpenAiAdapter,
              CheapCursorAdapter
            )
          )
        ))
      )
    )

    // Should choose Cursor (cheaper)
    expect(result.provider).toBe('cursor')
  })
})
```

**Old architecture:** Would require mocking entire service classes, test code looks different from production, hard to configure specific scenarios.

**New architecture:** Hot-swap adapters, test code identical to production, easy to test edge cases.

---

## Architecture Comparison Summary

| Aspect | Old (Effect.Service Registry) | New (Layer Hexagonal) |
|--------|------------------------------|----------------------|
| **Interface Uniformity** | ❌ Each service is different type | ✅ All implement AiProviderPort |
| **Context Propagation** | ❌ Required at call time | ✅ Captured at construction |
| **Dynamic Selection** | ❌ Hard to implement | ✅ Easy with registry.getAdapter() |
| **Testing** | ❌ Complex mock services | ✅ Hot-swap layers |
| **Multi-Provider Access** | ❌ Yield each service separately | ✅ registry.listAdapters() |
| **Fallback Strategies** | ❌ Nested conditionals | ✅ Loop over providers |
| **Agent Code Clarity** | ❌ Context pollution | ✅ Clean and modular |
| **Adding Providers** | ❌ Update agent dependencies | ✅ Zero agent code changes |
| **Parallel Execution** | ❌ Verbose setup | ✅ Effect.forEach with adapters |
| **Cost Optimization** | ❌ Can't iterate providers | ✅ Easy to compare all |

---

## Key Insights for AI Agent Development

### 1. **Composition over Inheritance**

The Layer pattern follows functional composition principles:
- Adapters are **values** (not classes)
- Can be composed with `Layer.mergeAll`
- Can be overridden with `Layer.provide`
- No inheritance hierarchies to manage

### 2. **Separation of Concerns**

Clear boundaries between:
- **Port** (AiProviderPort interface) - what agents need
- **Adapters** (OpenAiBrowserProviderAdapter) - how it's implemented
- **Registry** (AiProviderRegistryService) - discovery mechanism
- **Agent Logic** - uses ports, doesn't know about adapters

### 3. **Dependency Inversion Principle**

Agents depend on abstractions (AiProviderPort), not concretions:
```typescript
// Agent depends on abstract port
function agentLogic(provider: AiProviderPort) {
  return provider.getUsage(accountId)
}

// Not on concrete service
function oldAgentLogic(service: OpenAiProviderService) {
  return service.getUsage(accountId)  // Tight coupling!
}
```

### 4. **Open/Closed Principle**

System is:
- **Open for extension**: Add new providers without changing existing code
- **Closed for modification**: Agent logic doesn't change when providers are added

```typescript
// Add new provider - zero changes to agent code
export const GeminiProviderAdapter = Layer.effect(
  AiProviderTags.register('gemini'),
  // ... implementation
)

// Agents automatically discover it via registry.listAdapters()
```

---

## Conclusion

**For AI agents (Claude Code, Codex, etc.), the Layer-based hexagonal architecture is objectively superior because:**

1. **Agents are orchestrators** - they need to coordinate multiple providers, not be tightly coupled to specific implementations
2. **Testing is critical** - agents are complex and need extensive testing with various provider configurations
3. **Dynamic behavior is essential** - agents must adapt to provider availability, cost, and performance at runtime
4. **Code clarity matters** - agent logic is already complex; the architecture shouldn't add more complexity

**The old Effect.Service registry pattern was designed for simple service lookup. The new Layer hexagonal pattern is designed for sophisticated multi-provider orchestration - exactly what AI agents need.**

### Migration Path for Existing Agents

If you have existing agent code using the old pattern:

```typescript
// OLD - Tightly coupled
const oldAgent = Effect.gen(function* () {
  const openai = yield* OpenAiProviderService
  const claude = yield* ClaudeProviderService
  // ... hardcoded logic
})

// NEW - Flexible and testable
const newAgent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService
  const adapters = yield* registry.listAdapters()
  // ... generic orchestration logic
})
```

**Migration is straightforward:**
1. Replace `yield* ConcreteService` with `registry.getAdapter(provider)`
2. Remove concrete service dependencies from Effect.provide
3. Iterate over `registry.listAdapters()` instead of hardcoded services
4. Enjoy cleaner, more testable agent code!

---

## When Do You Need the Registry Pattern?

The registry pattern adds a layer of indirection between your code and the adapters. **It's not always necessary** - understand when to use it.

### ✅ Use Registry Pattern When:

#### 1. Multiple Adapters for Same Port Interface

```typescript
// Multiple implementations of AiProviderPort
OpenAiBrowserProviderAdapter  → AiProviderPort
ClaudeBrowserProviderAdapter  → AiProviderPort
CursorBrowserProviderAdapter  → AiProviderPort

// Registry provides unified access
const registry = yield* AiProviderRegistryService
const adapter = yield* registry.getAdapter('openai')  // Dynamic selection
```

**Why:** GenericTags alone require adapters in context at call time. Registry captures them once at construction.

#### 2. Dynamic Provider Selection

```typescript
// Select provider at runtime based on criteria
const selectProvider = (criteria: Criteria): AiProviderType => {
  if (criteria.cost === 'low') return 'cursor'
  if (criteria.quality === 'high') return 'claude'
  return 'openai'
}

const registry = yield* AiProviderRegistryService
const adapter = yield* registry.getAdapter(selectProvider(userCriteria))
```

**Why:** Can't dynamically yield different tags without registry.

#### 3. Iteration Over All Providers

```typescript
// Compare all providers
const registry = yield* AiProviderRegistryService
const adapters = yield* registry.listAdapters()

const results = yield* Effect.forEach(
  adapters,
  adapter => adapter.getUsage(accountId),
  { concurrency: 'unbounded' }
)
```

**Why:** GenericTags can provide list of tags, but you'd yield each one repeatedly. Registry captures them once.

#### 4. Complex Orchestration (Fallback, A/B Testing, Cost Optimization)

```typescript
// Fallback chain
const registry = yield* AiProviderRegistryService
for (const provider of ['openai', 'claude', 'cursor']) {
  const adapter = yield* registry.getAdapter(provider)  // Map lookup, not context yield
  const result = yield* adapter.getUsage(id).pipe(
    Effect.catchAll(() => Effect.succeed(null))
  )
  if (result) return result
}
```

**Why:** Loops with repeated lookups benefit from Map-based access vs repeated tag yielding.

#### 5. IPC Handlers Need Adapter Access

```typescript
// IPC handler - minimal context needed
registerIpcHandler(AiIpcContracts.getUsage, (input) =>
  Effect.gen(function* () {
    const registry = yield* AiProviderRegistryService  // Only need registry
    const adapter = yield* registry.getAdapter(input.provider)
    return yield* adapter.getUsage(input.accountId)
  })
)
```

**Why:** Without registry, IPC handler needs all adapter layers in context. With registry, only needs registry.

### ❌ Skip Registry Pattern When:

#### 1. Single Adapter Per Port

```typescript
// Terminal domain - only one adapter
interface TerminalPort { ... }
NodePtyTerminalAdapter → TerminalPort

// ❌ NO REGISTRY NEEDED - just use port directly
const terminal = yield* TerminalPort
yield* terminal.spawn(config)
```

**Why:** Registry adds unnecessary abstraction when there's only one implementation.

#### 2. Static, Compile-Time Adapter Selection

```typescript
// Always use OpenAI - no dynamic selection
const openai = yield* OpenAiProviderTag
yield* openai.getUsage(accountId)
```

**Why:** If you always know which adapter you need, just yield the tag directly.

#### 3. No Iteration or Multi-Provider Logic

```typescript
// Just use one provider
const claude = yield* ClaudeProviderTag
const result = yield* claude.getUsage(accountId)
```

**Why:** If you never need to iterate or compare providers, registry is overkill.

### Comparison: With vs Without Registry

#### Without Registry (GenericTags Only)

```typescript
// Agent that uses multiple providers
const agent = Effect.gen(function* () {
  // Must yield each tag separately
  const openai = yield* AiProviderTags.getOrCreate('openai')  // Requires context
  const claude = yield* AiProviderTags.getOrCreate('claude')  // Requires context

  // Can't iterate dynamically
  const adapters = []
  for (const tag of AiProviderTags.all()) {
    adapters.push(yield* tag)  // Yields in loop - performance cost
  }

  // Use adapters...
}).pipe(
  // ⚠️ ALL adapters must be in context
  Effect.provide(Layer.mergeAll(
    OpenAiBrowserProviderAdapter,
    ClaudeBrowserProviderAdapter,
    CursorBrowserProviderAdapter
  ))
)
```

**Issues:**
- ❌ Adapters required in context at every call site
- ❌ Tags yielded repeatedly (performance cost in loops)
- ❌ Can't use in IPC handlers without full adapter context
- ❌ Verbose layer composition

#### With Registry

```typescript
// Same agent with registry
const agent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService  // Adapters captured once

  // Get adapters by name (Map lookup, no context needed)
  const openai = yield* registry.getAdapter('openai')
  const claude = yield* registry.getAdapter('claude')

  // Iterate cleanly
  const adapters = yield* registry.listAdapters()  // Already captured

  // Use adapters...
}).pipe(
  // ✅ Only need registry - adapters already captured at construction
  Effect.provide(MainLayer)
)
```

**Benefits:**
- ✅ Adapters captured once at construction
- ✅ No repeated tag yielding
- ✅ IPC handlers only need registry in context
- ✅ Clean layer composition

### Registry Pattern Architecture

The registry pattern uses **two abstractions** working together:

```typescript
// 1. AiProviderTags - Tag Management (GenericTags)
export class AiProviderTags {
  private static tags = new Map<AiProviderType, Context.Tag<AiProviderPort, AiProviderPort>>()

  static register(provider: AiProviderType) {
    const tag = Context.GenericTag<AiProviderPort>(`AiProvider:${provider}`)
    this.tags.set(provider, tag)
    return tag
  }

  static all() {
    return Array.from(this.tags.values())
  }
}

// 2. AiProviderRegistryService - Adapter Capture & Lookup
export class AiProviderRegistryService extends Effect.Service<...>() {
  effect: Effect.gen(function* () {
    // Capture adapters at construction time
    const tags = AiProviderTags.all()
    const adaptersMap = new Map<AiProviderType, AiProviderPort>()

    for (const tag of tags) {
      const adapter = yield* tag  // Context available NOW
      adaptersMap.set(adapter.provider, adapter)
    }

    // Methods access Map (no context needed at call time)
    return {
      getAdapter: (provider) => Effect.succeed(adaptersMap.get(provider)),
      listAdapters: () => Effect.succeed(Array.from(adaptersMap.values()))
    }
  })
}
```

**Why Two Abstractions?**
- **AiProviderTags**: Manages tag identity and creation
- **AiProviderRegistryService**: Manages adapter lifecycle and access
- **Separation of Concerns**: Tag management vs adapter capture
- **Flexibility**: Can use tags directly in simple scenarios

### Decision Tree: Do You Need Registry?

```
┌─ Single adapter per port?
│  └─ NO → Use port directly (e.g., TerminalPort)
│
├─ Multiple adapters for same port?
│  ├─ NO → Use port directly
│  └─ YES → Continue...
│
├─ Need dynamic runtime selection?
│  ├─ NO → Yield specific tag directly
│  └─ YES → Use registry
│
├─ Need to iterate over all adapters?
│  ├─ NO → Yield specific tags
│  └─ YES → Use registry
│
├─ Complex orchestration (fallback, comparison, A/B testing)?
│  ├─ NO → Yield specific tags
│  └─ YES → Use registry
│
└─ IPC handlers need adapter access?
   ├─ NO → Yield specific tags
   └─ YES → Use registry
```

---

**Author:** AI Assistant
**Date:** 2025-10-26
**Purpose:** Developer reference for understanding why Layer hexagonal architecture benefits AI agents
