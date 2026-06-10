import {
	call_llm_chat,
	call_llm_tasks,
} from '../llm.ts';
import logger from '../logger/logger.ts';
import { Status } from '../state/types.ts';
import { setTask } from '../state/util.ts';
import { updatePrompt } from './util.ts';

const RunExec = async (
	task_id: string,
	task: string,
	LLM_DIRECT: boolean,
) => {
	await setTask({
		id: task_id,
		status: { status: Status.RUNNING },
	});

	let final_output = '';
	let plan = '';
	let revised_plan = '';

	try {
		if (LLM_DIRECT)
			final_output = await call_llm_chat(
				`${task}`,
			);
	} catch (e) {
		logger.error(
			`something went wrong in RunExec: ${e}`,
		);
	}
};
