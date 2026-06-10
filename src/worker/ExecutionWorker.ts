import {
	call_llm_chat,
	call_llm_tasks,
	call_llm_toolcall,
	PROMPTS,
} from '../llm.ts';
import logger from '../logger/logger.ts';
import { Status } from '../state/types.ts';
import { setTask } from '../state/util.ts';
import { ToolExec, updatePrompt } from './util.ts';

export const RunExec = async (task_id: string, task: string, LLM_DIRECT: boolean) => {
	await setTask({
		id: task_id,
		status: { status: Status.RUNNING },
	});

	let final_output = '';
	let plan = '';
	let revised_plan = '';

	try {
		if (LLM_DIRECT) final_output = await call_llm_chat(`${task}`);

		let initial_exec = await call_llm_toolcall(`
You are an System Execution agent.

Your job is to take decomposed tasks written into concise executable steps and execute them using internal APIs identified in the FileSystemApiSchema.
                    
Tool Request Format AND FileSystemApiSchema:
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
		let tool_output = ToolExec(exec_id, task, initial_exec);
		
	} catch (e) {
		logger.error(`something went wrong in RunExec: ${e}`);
	}

	return final_output
};
