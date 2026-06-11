import {
	call_llm_chat,
	call_llm_toolcall,
	PROMPTS,
} from '../llm.ts';
import {getLogger} from '../logger/logger.ts';
import { Status } from '../state/types.ts';
import { setTask } from '../state/util.ts';
import { registry } from '../tools/ToolBootstrap.ts';
import { ToolExec } from './util.ts';
import crypto from 'node:crypto';

const logger = getLogger('ExecutionWorker')

export const RunExec = async (task_id: string, task: string, LLM_DIRECT: boolean) => {
	
	await setTask({
		id: task_id,
		status: { status: Status.RUNNING },
	});

	let final_output: string = 'FAILED';

	try {
		if (LLM_DIRECT) final_output = await call_llm_chat(`${task}`);

		let initial_exec = await call_llm_toolcall(`
You are an System Execution agent.

Your job is to take decomposed tasks written into concise executable steps and execute them using internal APIs identified in the ToolSchemas.

ToolSchemas:
${registry.listSchemas()}
${PROMPTS['file_system_schema']}

Tool Request Format:
${PROMPTS['tool_types']}

TASK:
${task}

RULES:
- Use ONLY valid JSON as output 
- Always explain reasoning
- Do NOT include markdown
- There are at most 5 steps
- Steps are concrete and actionable
- Any text not in Javascript notation MUST be prepended with a comment

ONLY ACCEPTABLE OUTPUT FORMAT:
Tool_Output`);

		const exec_id = crypto.randomUUID();
		const tool_output = await ToolExec(exec_id, task, initial_exec);

		// at this point tool should have executed...
		
		if (typeof tool_output === 'string') final_output = tool_output
		
	} catch (e) {
		logger.error(`something went wrong in RunExec: ${e}`);
		
		await setTask({
			id: task_id,
			status: { status: Status.FAILED },
			result: `${JSON.stringify(e)}`
		});
	}

	await setTask({
		id: task_id,
		status: { status: Status.COMPLETED },
		result: final_output
	});

	return final_output
};
