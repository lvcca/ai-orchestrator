import { call_llm_chat, call_llm_toolcall, PROMPTS } from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import { Related, Status, TaskType } from '../state/types.ts';
import { getExec, setExec } from '../state/util.ts';
import { registry } from '../tools/ToolBootstrap.ts';
import { ToolExec, appendToTransactionLog } from './util.ts';
import crypto from 'node:crypto';

const logger = getLogger('ExecutionWorker');

export const GetToolExecPayload = async (task: string, related: Related) =>
	await call_llm_toolcall(`
You are an System Execution agent.

Your job is to take decomposed tasks written into concise executable steps and execute them using internal APIs identified in the ToolSchemas.

ToolSchemas:
${registry.listSchemas()}
${PROMPTS['file_system_schema']}

Tool Request Format:
${PROMPTS['tool_types']}

TASK:
${task}

Related Tasks:
${JSON.stringify(related)}

RULES:
- Use ONLY valid JSON as output 
- Always explain reasoning
- Do NOT include markdown
- There are at most 5 steps
- Steps are concrete and actionable
- Any text not in Javascript notation MUST be prepended with a comment

ONLY ACCEPTABLE OUTPUT FORMAT:
ToolCallPayload`);

export const RunExec = async (
	exec_id: string,
	task: string,
	LLM_DIRECT: boolean,
) => {
	// set status
	await setExec({
		id: exec_id,
		status: { status: Status.RUNNING },
	});

	let related: Related | undefined;
	// get current
	const currObj = await getExec(exec_id);

	related = currObj?.related;

	let final_output: string = 'FAILED';

	try {
		if (LLM_DIRECT) final_output = await call_llm_chat(`${task}`);

		let ToolExecPayload = await GetToolExecPayload(task, related);

		await appendToTransactionLog({
			_id: exec_id,
			type: TaskType.EXECUTION,
			newUserRequest: task,
		});

		// task execution env
		const toolExecId = crypto.randomUUID();
		const toolOutput = await ToolExec(toolExecId, task, ToolExecPayload);

		// execution result
		if (typeof toolOutput === 'string') {
			final_output = toolOutput;

			await setExec({
				id: exec_id,
				status: { status: Status.COMPLETED },
				result: final_output,
			});

			await appendToTransactionLog({
				_id: exec_id,
				type: TaskType.EXECUTION,
				newLLMResponse: final_output,
			});
		}
		// we shouldn't hit this, just safety
		else
			throw new Error(
				`toolOutput did not match expected string output type: ${typeof toolOutput}, ${JSON.stringify(toolOutput)}`,
			);
	} catch (e) {
		logger.error(`something went wrong in RunExec: ${e}`);

		await setExec({
			id: exec_id,
			status: { status: Status.FAILED },
			result: `${JSON.stringify(e)}`,
		});
	}

	return final_output;
};
