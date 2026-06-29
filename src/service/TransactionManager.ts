import { call_llm_task_transaction_manager } from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import { redisGet } from '../state/state.ts';
import { isValidUUID } from '../util/InputValidation.ts';
import { parseJsonSafe, SummarizeTask } from '../worker/util.ts';

const logger = getLogger('TransactionManager');

export type TransactionManagerResponse = {
	transaction_status?:
		| 'success'
		| 'failure'
		| 'partial_success'
		| 'unknown_state';
	recoverability?:
		| 'recoverable'
		| 'non_recoverable'
		| 'environment_issue'
		| 'unknown';
	next_action?: {
		type: 'retry' | 'terminate' | 'noop';
		prompt: string;
	};
	confidence?: number;
};

export const ManageTransaction = async (id: string) => {
	if (!isValidUUID(id))
		throw new Error(
			'cannot process this uuid, it has been flagged as invalid...',
		);

	const entry = await redisGet(id);

	if (!entry) throw new Error(`no entry found with id ${id}`);

	logger.info(`execution_id: ${id}`);

	const summary = await SummarizeTask(id);

	let final_results: TransactionManagerResponse = {};

	const initialResponse = await call_llm_task_transaction_manager(`
You are Task Transaction Manager.

Your job is to take analyze executed task results and determine next steps. If the current transaction_status is not "success" a next_action is required. The "next_action" object should attempt to use all information involved to determine how to accomplish the initial task.

Summary Results:
${JSON.stringify(summary)}

Task Results:
${JSON.stringify(entry)}
    
RULES:
- Use ONLY valid JSON as output 
- Always explain reasoning
- Do NOT include markdown
- There are at most 5 steps
- Steps are concrete and actionable
- Any text not in Javascript notation MUST be prepended with a comment

ONLY ACCEPTABLE OUTPUT FORMAT:
{
	transaction_status?:
		| 'success'
		| 'failure'
		| 'partial_success'
		| 'unknown_state';
	recoverability?:
		| 'recoverable'
		| 'non_recoverable'
		| 'environment_issue'
		| 'unknown';
	next_action?: {
		type: 'retry' | 'terminate' | 'noop';
		prompt: string;
	};
	confidence?: number;
};
`);

	final_results =
		await parseJsonSafe<TransactionManagerResponse>(initialResponse);

	logger.info(
		`ManageTransaction final_results: ${JSON.stringify(final_results)}`,
	);

	return final_results;
};
