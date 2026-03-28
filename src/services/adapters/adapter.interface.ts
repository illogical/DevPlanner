import type {
  DispatchAdapter,
  DispatchAdapterName,
  DispatchConfig,
  DispatchProcess,
} from '../../types/dispatch';
import { ClaudeCliAdapter } from './claude-cli.adapter';
import { GeminiCliAdapter } from './gemini-cli.adapter';

export type { DispatchAdapter, DispatchConfig, DispatchProcess };
export type { DispatchAdapterName };

const ADAPTERS: Record<DispatchAdapterName, DispatchAdapter> = {
  'claude-cli': new ClaudeCliAdapter(),
  'gemini-cli': new GeminiCliAdapter(),
};

export const ADAPTER_NAMES: DispatchAdapterName[] = ['claude-cli', 'gemini-cli'];

/**
 * Return the registered adapter for the given name,
 * or throw if the adapter is unknown.
 */
export function getAdapter(name: DispatchAdapterName): DispatchAdapter {
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(
      `Unknown dispatch adapter: "${name}". Valid adapters: ${ADAPTER_NAMES.join(', ')}`
    );
  }
  return adapter;
}

export function isValidAdapterName(name: string): name is DispatchAdapterName {
  return ADAPTER_NAMES.includes(name as DispatchAdapterName);
}
