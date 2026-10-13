import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_PATH: z.string().default('./database/permissions.db'),
  AUTH0_ISSUER_URL: z.string().url().optional().or(z.literal('')),
  AUTH0_AUDIENCE: z.string().optional().or(z.literal('')),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const env = envSchema.parse({
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_PATH: process.env.DATABASE_PATH,
  AUTH0_ISSUER_URL: process.env.AUTH0_ISSUER_URL,
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE,
  LOG_LEVEL: process.env.LOG_LEVEL,
});

export type Env = z.infer<typeof envSchema>;
