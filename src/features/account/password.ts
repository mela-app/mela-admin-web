// The console's password rules, checked here as you type and again by the
// API (mela-backend: src/admin/password-policy.ts) - keep the two in step.

export const MIN_PASSWORD_LENGTH = 12

export interface PasswordRule {
  label: string
  met: boolean
}

export function passwordRules(password: string, email: string): PasswordRule[] {
  const localPart = email.split('@')[0]?.toLowerCase() ?? ''
  return [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { label: 'Letters and numbers', met: /\p{L}/u.test(password) && /\d/.test(password) },
    {
      label: 'Not based on your email address',
      met: password.length > 0 && !(localPart.length >= 4 && password.toLowerCase().includes(localPart)),
    },
  ]
}

export function passwordAcceptable(password: string, email: string): boolean {
  return password.length <= 128 && passwordRules(password, email).every((rule) => rule.met)
}
