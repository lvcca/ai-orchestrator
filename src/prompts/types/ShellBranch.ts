type ShellBranchAnalysis = {
	final_analysis: string;
	pivot_required: boolean;
	pivot_recommended: boolean;
	next_step: string;
	original_task_goal: string;
};

type ShellBranchAnalysisSimplified = {
	next_step: string;
};
