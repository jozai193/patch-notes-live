import { Codex, type ThreadEvent } from '@openai/codex-sdk';
import type { CompileEvent, PatchRunner } from './types.js';

export function codexRunner(workspace: string): PatchRunner {
  // Do not hand the child Twitch/OpenAI keys or unrelated application environment.
  const env: Record<string, string> = {};
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'CODEX_HOME',
  ]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  const codex = new Codex({
    env,
    ...(process.env.CODEX_API_KEY ? { apiKey: process.env.CODEX_API_KEY } : {}),
    config: {
      shell_environment_policy: { inherit: 'core' },
      sandbox_workspace_write: { network_access: false },
    },
    // Replace inherited connector/plugin tables: this task needs only local files and npm test.
    configOverrides: ['mcp_servers={}', 'plugins={}'],
  });
  const thread = codex.startThread({
    workingDirectory: workspace,
    skipGitRepoCheck: true,
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    networkAccessEnabled: false,
    webSearchMode: 'disabled',
    modelReasoningEffort: process.env.PATCH_CODEX_REASONING === 'medium' ? 'medium' : 'low',
    ...(process.env.PATCH_CODEX_MODEL ? { model: process.env.PATCH_CODEX_MODEL } : {}),
  });
  return {
    get id() {
      return thread.id;
    },
    async run(prompt, { signal, onEvent }) {
      const { events } = await thread.runStreamed(prompt, { signal });
      for await (const event of events) {
        onEvent(event);
        if (event.type === 'turn.failed') throw new Error(event.error.message);
        if (event.type === 'error') throw new Error(event.message);
      }
    },
  };
}

export function compileEvent(event: ThreadEvent): CompileEvent | undefined {
  if (event.type === 'turn.started') return { phase: 'thinking', text: 'Planning the game rule.' };
  if (!('item' in event)) return;
  // Never forward reasoning, agent prose, commands, tool arguments or output from the model.
  if (event.item.type === 'file_change') return { phase: 'editing', text: 'Updating patch files.' };
  if (event.item.type === 'command_execution' && event.type === 'item.started') {
    return { phase: 'testing', text: 'Running a workspace command.' };
  }
  return;
}
