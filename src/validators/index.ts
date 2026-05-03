import { z } from 'zod';

const nameField = z.string().min(3);
const emailField = z.email();
const passwordField = z.string().min(8).max(20);

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: passwordField,
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  password: passwordField,
});
