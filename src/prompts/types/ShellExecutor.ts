import { UUID } from 'node:crypto';

type StandardStreams = {
	error: string;
	input: string;
	output: string;
};

type ShellSession = {
	SessionId: UUID;
	SessionStreams: StandardStreams;
};
