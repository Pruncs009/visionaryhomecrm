import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const newPassword = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters'); // bcrypt limit

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
});


export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });
