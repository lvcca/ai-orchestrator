export type ValidatorResponse = {
    "valid": boolean,
    "reason": string | null,
    "confidence": number,
    "issues": string[],
    "evidence": string[]
}