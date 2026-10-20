// Public synthetic data only. No real session identifiers, paths or prompts.
export const example = {
  context_max: 128000, context_used: 46080, context_percent: 36,
  estimated_total: 43520, context_estimated: false, context_source: 'provider_usage', model: 'synthetic-model-128k',
  categories: [
    { id: 'system_prompt', label: 'System prompt', tokens: 7800 },
    { id: 'tool_definitions', label: 'Tool definitions', tokens: 9600 },
    { id: 'rules', label: 'Workspace rules', tokens: 1280 },
    { id: 'skills', label: 'Skills index', tokens: 1840 },
    { id: 'mcp', label: 'MCP schemas', tokens: 6400 },
    { id: 'subagent_definitions', label: 'Subagent definitions', tokens: 600 },
    { id: 'memory', label: 'Memory & user profile', tokens: 1600 },
    { id: 'conversation', label: 'Conversation', tokens: 14400 }
  ],
  context_files: [
    { label: 'Workspace instructions', path: '/demo/project/AGENTS.md', chars: 3200, est_tokens: 800, loaded: true, status: 'loaded' },
    { label: 'Compatibility instructions', path: '/demo/project/CLAUDE.md', chars: 1920, est_tokens: 480, loaded: false, status: 'shadowed_by_agents' }
  ]
}
