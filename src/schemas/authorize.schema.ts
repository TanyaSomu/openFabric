import { z } from 'zod';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export const authorizeSchema = z
  .object({
    access_token: z
      .string({
        message: 'access_token must be a string',
      })
      .trim()
      .min(1, 'access_token cannot be empty'),

    method: z
      .string({
        message: 'method must be a string',
      })
      .trim()
      .toUpperCase()
      .refine(
        (val): val is (typeof ALLOWED_METHODS)[number] =>
          ALLOWED_METHODS.includes(val as (typeof ALLOWED_METHODS)[number]),
        {
          message:
            "Unsupported HTTP method. Allowed methods: 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'",
        },
      ),

    path: z
      .string({
        message: 'path must be a string',
      })
      .trim()
      .min(1, 'path cannot be empty')
      .refine((val) => !val.includes('\0'), {
        message: 'path contains forbidden null byte characters',
      }),
  })
  .strict();

export type AuthorizeInput = z.infer<typeof authorizeSchema>;
