// /signup plan + account validation (b8ba / b876).
//
// b876: the page used useState('Local Business') + a post-paint
// useEffect to parse ?plan=, so ?plan=personal_pro first flashed Local
// $39 and a fast Continue advanced with the WRONG plan. The fix is to
// resolve the plan on the SERVER (app/signup/page.tsx reads
// searchParams before first paint) and pass it as a prop — never a
// client-side effect. This helper is the single mapping both the
// server page and tests use.
//
// b8ba S3: step 2 had no email-format check, so a nonexistent
// @example.com address sailed through. Format + reserved-domain
// (RFC 2606) checks run on Continue; Supabase's confirmation email
// still owns deliverability for real domains.

export type SignupPlanResolution = { plan: string; notice: string };

const PLAN_MAP: Record<string, string> = {
  business: 'Local Business',
  local_business: 'Local Business',
  local_pro: 'Local Business',
  personal_pro: 'Personal Brand',
  product_pro: 'Product Pro',
  agency: 'Agency',
  free: 'Free',
};

export function resolveSignupPlan(raw: string | null | undefined): SignupPlanResolution {
  if (!raw) return { plan: 'Local Business', notice: '' };
  const p = raw.trim().toLowerCase();
  if (PLAN_MAP[p]) return { plan: PLAN_MAP[p], notice: '' };
  return {
    plan: '',
    notice: `We don't offer a “${raw.trim()}” plan — pick one below.`,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// RFC 2606 reserved domains — can never receive mail.
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org', 'example.edu']);
const RESERVED_TLDS = new Set(['example', 'test', 'invalid', 'localhost']);

export function validateSignupAccount(form: { name: string; email: string; password: string }): string | null {
  if (!form.name.trim() || !form.email.trim() || !form.password) {
    return 'Please fill in all fields.';
  }
  const email = form.email.trim();
  if (!EMAIL_RE.test(email)) return 'Please enter a valid email address.';
  const domain = email.split('@')[1].toLowerCase();
  const tld = domain.split('.').pop() ?? '';
  if (RESERVED_DOMAINS.has(domain) || RESERVED_TLDS.has(tld)) {
    return 'This email domain can’t receive mail. Please use a real email address.';
  }
  if (form.password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}
