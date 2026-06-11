import { RegisterTools } from './FileSystem.ts';
import { ToolRegistry } from './ToolRegistry.ts';

export const registry = new ToolRegistry();
RegisterTools(registry);
