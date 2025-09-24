# Universal AI Adapter Implementation Guide

**Version**: 2.9.1  
**Last Updated**: September 2025

---

## Getting Started

### What is UAA?

Universal AI Adapter (UAA) orchestrates multiple AI models to work as a team. Instead of choosing between GPT, Claude, or Gemini, use them all—each contributing their unique strengths to produce superior results.

### Installation

```javascript
// In your MCP Server project
npm install universal-ai-adapter

// Or add to existing project
import { UniversalAIAdapter } from 'universal-ai-adapter';
```

### Quick Example

```javascript
const uaa = new UniversalAIAdapter();

// Simple collaboration
const result = await uaa.collaborate([
  { model: 'claude-sonnet', task: 'generate', prompt: 'Create a function' },
  { model: 'gpt-5', task: 'review', prompt: 'Review and improve' },
  { model: 'claude-opus', task: 'finalize', prompt: 'Polish and document' }
]);
```

---

## Core Concepts

### Collaboration Modes

UAA supports four fundamental collaboration patterns:

#### 1. Sequential Mode
Models work in sequence, each building on the previous output:

```javascript
const sequential = {
  mode: 'sequential',
  tasks: [
    { model: 'claude-sonnet', action: 'draft' },
    { model: 'gpt-5', action: 'enhance' },
    { model: 'claude-opus', action: 'finalize' }
  ]
};

const result = await uaa.execute(sequential);
// Each model's output becomes the next model's input
```

#### 2. Parallel Mode
Models work simultaneously on different aspects:

```javascript
const parallel = {
  mode: 'parallel',
  tasks: [
    { model: 'gpt-5', analyze: 'technical_quality' },
    { model: 'claude-opus', analyze: 'documentation' },
    { model: 'gemini', analyze: 'performance' }
  ],
  aggregation: 'synthesize'
};

const results = await uaa.execute(parallel);
// All analyses combined into comprehensive report
```

#### 3. Iterative Mode
Models refine output through multiple rounds:

```javascript
const iterative = {
  mode: 'iterative',
  rounds: 3,
  tasks: [
    { model: 'claude-sonnet', role: 'creator' },
    { model: 'gpt-5', role: 'critic' }
  ],
  convergence: 0.95  // Stop when quality reaches threshold
};

const refined = await uaa.execute(iterative);
// Output improves with each iteration
```

#### 4. Review Mode
One model creates, another validates:

```javascript
const review = {
  mode: 'review',
  generator: { model: 'claude-sonnet' },
  reviewer: { model: 'gpt-5' },
  criteria: ['correctness', 'efficiency', 'readability']
};

const validated = await uaa.execute(review);
// Includes both output and review scores
```

---

## Real-World Implementations

### Code Development Pipeline

Build production-ready code with built-in quality assurance:

```javascript
class CodeDevelopmentPipeline {
  constructor() {
    this.uaa = new UniversalAIAdapter({
      caching: true,
      errorRecovery: true
    });
  }

  async developFeature(requirements) {
    const pipeline = {
      mode: 'sequential',
      tasks: [
        // Step 1: Architecture Design
        {
          model: 'gpt-5',
          action: 'design',
          prompt: `Design architecture for: ${requirements}`,
          output: 'architecture'
        },
        
        // Step 2: Implementation
        {
          model: 'claude-sonnet',
          action: 'implement',
          prompt: 'Implement based on architecture',
          input: 'architecture',
          output: 'code'
        },
        
        // Step 3: Code Review
        {
          model: 'gpt-5',
          action: 'review',
          prompt: 'Review code for bugs and improvements',
          input: 'code',
          output: 'review'
        },
        
        // Step 4: Apply Fixes
        {
          model: 'claude-sonnet',
          action: 'fix',
          prompt: 'Apply review suggestions',
          inputs: ['code', 'review'],
          output: 'fixed_code'
        },
        
        // Step 5: Documentation
        {
          model: 'claude-opus',
          action: 'document',
          prompt: 'Add comprehensive documentation',
          input: 'fixed_code',
          output: 'final_code'
        }
      ],
      
      metrics: {
        trackTime: true,
        trackTokens: true,
        trackQuality: true
      }
    };
    
    const result = await this.uaa.execute(pipeline);
    
    return {
      code: result.final_code,
      metrics: result.metrics,
      timeline: result.timeline
    };
  }
}
```

### Document Analysis System

Process complex documents with multiple perspectives:

```javascript
class DocumentAnalyzer {
  async analyzeDocument(document, type = 'legal') {
    const analyses = {
      legal: {
        mode: 'parallel',
        tasks: [
          {
            model: 'gpt-5',
            focus: 'legal_risks',
            maxTokens: 2000
          },
          {
            model: 'claude-opus',
            focus: 'compliance_issues',
            maxTokens: 2000
          },
          {
            model: 'gemini',
            focus: 'precedent_cases',
            maxTokens: 2000
          }
        ],
        synthesis: {
          model: 'claude-opus',
          action: 'synthesize_findings',
          format: 'executive_summary'
        }
      },
      
      research: {
        mode: 'sequential',
        tasks: [
          { model: 'gpt-5', action: 'extract_claims' },
          { model: 'claude-sonnet', action: 'verify_sources' },
          { model: 'claude-opus', action: 'summarize_findings' }
        ]
      }
    };
    
    return this.uaa.execute(analyses[type]);
  }
}
```

### Content Creation Workflow

Create high-quality content with multiple rounds of refinement:

```javascript
class ContentCreator {
  async createArticle(topic, style, length) {
    const workflow = {
      mode: 'iterative',
      maxRounds: 3,
      tasks: [
        // Writer
        {
          model: 'claude-opus',
          role: 'writer',
          instructions: `Write ${length} words about ${topic} in ${style} style`
        },
        
        // Editor
        {
          model: 'gpt-5',
          role: 'editor',
          instructions: 'Suggest improvements for clarity, engagement, and accuracy'
        }
      ],
      
      convergenceCriteria: {
        method: 'score_threshold',
        threshold: 9.0,
        scorer: 'gpt-5'
      }
    };
    
    const article = await this.uaa.execute(workflow);
    
    // Final SEO optimization
    const optimized = await this.uaa.execute({
      mode: 'single',
      model: 'gemini',
      task: 'seo_optimize',
      input: article.content
    });
    
    return optimized;
  }
}
```

---

## Advanced Features

### Intelligent Routing

Let UAA automatically choose the best model for each task:

```javascript
const router = new UAA.Router({
  rules: {
    'code_generation': ['claude-sonnet', 'gpt-5'],
    'code_review': ['gpt-5'],
    'documentation': ['claude-opus'],
    'data_analysis': ['gpt-5', 'gemini'],
    'creative_writing': ['claude-opus', 'gpt-5']
  },
  
  costOptimization: true,
  loadBalancing: true
});

// UAA automatically selects optimal model
const result = await uaa.execute({
  task: 'code_generation',
  prompt: 'Create a REST API',
  router: router
});
```

### Context Management

Maintain context across long collaboration chains:

```javascript
class ContextManager {
  constructor() {
    this.contexts = new Map();
  }
  
  async executeWithContext(sessionId, tasks) {
    // Retrieve existing context
    const context = this.contexts.get(sessionId) || {};
    
    // Inject context into first task
    tasks[0].context = context;
    
    // Execute collaboration
    const result = await uaa.execute({
      mode: 'sequential',
      tasks: tasks,
      preserveContext: true
    });
    
    // Update context for next interaction
    this.contexts.set(sessionId, {
      ...context,
      ...result.context,
      history: [...(context.history || []), result]
    });
    
    return result;
  }
}
```

### Error Recovery

Build resilient collaboration chains:

```javascript
const resilientChain = {
  mode: 'sequential',
  tasks: [...],
  
  errorHandling: {
    strategy: 'retry_with_fallback',
    maxRetries: 3,
    fallbackModels: {
      'gpt-5': ['gpt-4', 'claude-opus'],
      'claude-opus': ['claude-sonnet', 'gpt-5']
    },
    
    onError: async (error, task, attempt) => {
      console.log(`Task failed: ${task.model}, attempt ${attempt}`);
      
      if (error.type === 'rate_limit') {
        await sleep(error.retryAfter);
        return 'retry';
      }
      
      return 'fallback';
    }
  }
};
```

---

## Performance Optimization

### Caching Strategies

```javascript
const uaa = new UniversalAIAdapter({
  cache: {
    enabled: true,
    ttl: 3600,  // 1 hour
    
    // Semantic similarity caching
    semantic: {
      enabled: true,
      threshold: 0.95,
      embedding: 'openai'
    },
    
    // Cache collaboration patterns
    patterns: {
      enabled: true,
      maxSize: 100
    }
  }
});
```

### Parallel Execution

```javascript
// Process multiple items efficiently
async function batchProcess(items) {
  const batches = chunk(items, 10);  // Process 10 at a time
  
  const results = await Promise.all(
    batches.map(batch => 
      uaa.executeBatch({
        mode: 'parallel',
        items: batch,
        tasks: [...]
      })
    )
  );
  
  return results.flat();
}
```

### Cost Management

```javascript
const costAware = new UniversalAIAdapter({
  costManagement: {
    monthlyBudget: 1000,  // USD
    
    modelCosts: {
      'gpt-5': 0.06,         // per 1K tokens
      'claude-opus': 0.075,
      'claude-sonnet': 0.003,
      'gemini': 0.0025
    },
    
    strategy: 'optimize_quality_per_dollar',
    
    alerts: {
      threshold: 0.8,  // Alert at 80% budget
      webhook: 'https://your-webhook.com/budget-alert'
    }
  }
});
```

---

## Monitoring & Analytics

### Built-in Metrics

```javascript
const result = await uaa.execute(chain);

console.log(result.metrics);
// {
//   totalTime: 384.3,
//   modelTimes: {
//     'claude-sonnet': 79.7,
//     'gpt-5': 189.9,
//     'claude-opus': 116.7
//   },
//   tokenUsage: {
//     input: 2340,
//     output: 4560,
//     total: 6900
//   },
//   cost: 0.42,
//   qualityScore: 9.5
// }
```

### Custom Analytics

```javascript
class AnalyticsCollector {
  constructor(uaa) {
    uaa.on('taskComplete', this.collectMetrics.bind(this));
    uaa.on('chainComplete', this.generateReport.bind(this));
  }
  
  collectMetrics(event) {
    // Store in your analytics system
    analytics.track({
      event: 'ai_task_complete',
      properties: {
        model: event.model,
        duration: event.duration,
        tokens: event.tokens,
        success: event.success
      }
    });
  }
  
  generateReport(event) {
    return {
      chainId: event.id,
      totalDuration: event.duration,
      modelPerformance: event.modelMetrics,
      qualityImprovement: event.qualityDelta,
      costEfficiency: event.value / event.cost
    };
  }
}
```

---

## Testing

### Unit Testing Collaborations

```javascript
import { UAA } from 'universal-ai-adapter';
import { describe, it, expect, vi } from 'vitest';

describe('Code Development Pipeline', () => {
  it('should improve code quality through collaboration', async () => {
    const mockUAA = new UAA({
      mock: true,
      responses: {
        'claude-sonnet': { code: 'function fibonacci(n) { ... }' },
        'gpt-5': { score: 5, issues: ['No memoization'] },
        'claude-opus': { score: 10, code: 'optimized code' }
      }
    });
    
    const result = await mockUAA.execute({
      mode: 'sequential',
      tasks: [
        { model: 'claude-sonnet', action: 'generate' },
        { model: 'gpt-5', action: 'review' },
        { model: 'claude-opus', action: 'optimize' }
      ]
    });
    
    expect(result.finalScore).toBeGreaterThan(result.initialScore);
  });
});
```

### Integration Testing

```javascript
// Test with real models (use sparingly)
describe('Real Model Integration', () => {
  it('should handle model failures gracefully', async () => {
    const uaa = new UAA({
      testMode: true,
      timeout: 5000
    });
    
    const result = await uaa.execute({
      mode: 'review',
      generator: { model: 'claude-sonnet' },
      reviewer: { model: 'gpt-5' },
      fallback: true
    });
    
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBeDefined();
  });
});
```

---

## Deployment

### Environment Configuration

```bash
# .env
UAA_ENABLED=true
UAA_CACHE_REDIS_URL=redis://localhost:6379
UAA_LOG_LEVEL=info
UAA_METRICS_ENABLED=true
UAA_COST_TRACKING=true

# Model API Keys (stored securely)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_KEY=...
```

### Production Setup

```javascript
// production.config.js
export default {
  uaa: {
    mode: 'production',
    
    reliability: {
      timeout: 30000,
      retries: 3,
      circuitBreaker: true
    },
    
    performance: {
      connectionPool: 10,
      queueSize: 100,
      rateLimit: 100  // requests per minute
    },
    
    monitoring: {
      prometheus: true,
      endpoint: '/metrics'
    }
  }
};
```

---

## Migration from Single Models

### From OpenAI

```javascript
// Before: Single model
const response = await openai.complete({
  model: 'gpt-4',
  prompt: prompt
});

// After: Collaborative approach
const response = await uaa.execute({
  mode: 'review',
  generator: { model: 'gpt-4', prompt: prompt },
  reviewer: { model: 'claude-opus' }
});
```

### From LangChain

```javascript
// Before: Complex chain setup
const chain = new LLMChain({
  llm: new OpenAI(),
  prompt: PromptTemplate.fromTemplate(template)
});

// After: Simple collaboration
const result = await uaa.execute({
  mode: 'sequential',
  tasks: [
    { model: 'gpt-5', template: template }
  ]
});
```

---

## Best Practices

### Do's
- ✅ Start with simple sequential chains
- ✅ Use caching for repeated queries
- ✅ Monitor costs and set budgets
- ✅ Implement fallback strategies
- ✅ Test with mock responses first

### Don'ts
- ❌ Don't use multiple models for simple tasks
- ❌ Don't ignore rate limits
- ❌ Don't skip error handling
- ❌ Don't use production models in tests
- ❌ Don't forget to validate outputs

---

## Support & Resources

- **Documentation**: [docs.uaa.dev](https://docs.uaa.dev)
- **Examples**: [github.com/uaa/examples](https://github.com/uaa/examples)
- **Community**: [Discord](https://discord.gg/uaa)
- **Support**: support@uaa.dev

---

*For market analysis, see the [UAA Market Analysis](./UAA-Market-Analysis.md)*