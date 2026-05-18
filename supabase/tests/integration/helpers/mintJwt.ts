// supabase/tests/integration/helpers/mintJwt.ts
import { SignJWT } from 'jose';
import { JWT_SECRET } from './env.ts';

export async function mintUserJwt(
  userId: string,
  opts?: { role?: 'authenticated' | 'anon'; expiresIn?: string },
): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({
    sub: userId,
    role: opts?.role ?? 'authenticated',
    aud: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('supabase')
    .setIssuedAt()
    .setExpirationTime(opts?.expiresIn ?? '1h')
    .sign(secret);
}
