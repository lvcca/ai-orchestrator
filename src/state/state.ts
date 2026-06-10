import {
	createClient,
	type RedisClientType,
	type RedisDefaultModules,
} from 'redis';
import logger from '../logger/logger.ts';
import type { Transaction } from './types.ts';

const client: RedisClientType = createClient({
	url: 'redis://redis:6379',
});

let connection: RedisClientType<RedisDefaultModules, {}, {}, 3, {}> | undefined;

client.on('error', (err: Error) => console.error('Redis Client Error:', err));
client.on('connect', () => console.log('Redis Client Connected!'));

export const getConnection = async () => {
	try {
		if (!connection) connection = await client.connect();
		return connection;
	} catch (e) {
		logger.error(`something went wrong in getConnection: ${e}`);
		throw new Error(`redis connection cannot be established: error ${e}`);
	}
};

export const redisSet = async (tx: Transaction) => {
	let successful = false;

	logger.debug(`in redisSet`);

	try {
		const _connection = await getConnection();
		logger.debug(`got connection`);

		let _new_entry = structuredClone(tx);
		logger.debug(`cloned`);

		// get current val if exists
		if (await redisExists(tx.id)) {
			const _existing_entry = await redisGet(tx.id);
			_new_entry = {
				..._existing_entry,
				..._new_entry,
			};
		}

		// save
		const saved_status = await _connection.set(
			_new_entry.id,
			JSON.stringify(_new_entry),
		);

		logger.debug(`saved...`);

		//
		logger.debug(
			`saved status: ${saved_status}, value: ${JSON.stringify(_new_entry)}`,
		);

		successful = true;
	} catch (e) {
		logger.error(`something went wrong in redisSet: ${e}`);
	}

	return successful;
};

export const redisGetAll = async () => {
	try {
		const _connection = await getConnection();
		const keys = await _connection.keys('*');

		if (!keys || keys.length < 1) throw new Error(`could not find entries..`);

		return keys;
	} catch (e) {
		logger.error(`something went wrong in redisGet: ${e}`);
	}
};

export const redisGet = async (id: string) => {
	try {
		const _connection = await getConnection();
		const tx = await _connection.get(id);

		if (!tx) throw new Error(`could not find entry with id: ${id}`);

		const parsed: Transaction = JSON.parse(tx);
		return parsed;
	} catch (e) {
		logger.error(`something went wrong in redisGet: ${e}`);
	}
};

export const redisExists = async (id: string) => {
	let exists = false;

	try {
		const _connection = await getConnection();
		exists = (await _connection.exists(id)) === 1;
	} catch (e) {
		logger.error(`something went wrong in redisExists: ${e}`);
	}

	return exists;
};
