import { getLogger } from '../logger/logger.ts';
import { Tool } from '../prompts/types/ApiToolChain.ts';

const logger = getLogger('ToolRegistry')

export type _func = (...args: any[]) => any;

export type ToolEntry = {
	readonly name: string;
	readonly func: _func;
	readonly schema?: string;
};

export class ToolRegistry {
	public readonly _tools: Map<string, ToolEntry> = new Map<string, ToolEntry>();

	register(name: string, func: _func, schema?: string): void {
		if (this._tools.has(name))
			throw new Error(`Tool '${name}' is already registered`);

		try {
			logger.info(
				`registering tool name: ${name}, functype: ${typeof func}, func: ${func}, schema: ${schema}`,
			);

			const tool: ToolEntry = {
				name,
				func,
				schema,
			};

			this._tools.set(name, tool);

			const sanityCheck = this._tools.get(name);

			logger.info(`tool sanity check func: ${sanityCheck?.func}`);
		} catch (e) {
			logger.error(`something went wrong in ToolRegistry register: ${e}`);
		}
	}

	get(name: string): ToolEntry | undefined {
		return this._tools.get(name);
	}

	listTools(): ToolEntry[] {
		const allTools: ToolEntry[] = [];

		for (const key of this._tools.keys()) {
			const tool = this._tools.get(key);
			if (tool) allTools.push(tool);
		}

		return allTools;
	}

	listSchemas(): string[] {
		const schemas = new Set<string>();

		for (const tool of this._tools.values()) {
			if (tool.schema) {
				schemas.add(tool.schema);
			}
		}

		return [...schemas];
	}
}
