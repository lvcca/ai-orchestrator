export type ValidatorResponse = {
	valid: boolean;
	confidence: number;
	evidence: string[];
	reason?: string;
	issues?: string[];
};
