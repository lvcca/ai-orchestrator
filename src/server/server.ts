import express from 'express';
import { _env } from '../env.ts';

export const app = express();
export const port = _env.port;
