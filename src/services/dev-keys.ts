import { generateKeyPair, SignJWT } from 'jose';
import { env } from '../config/env';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

let devKeyPair: KeyPair | null = null;
let devKeyPairPromise: Promise<KeyPair> | null = null;

export async function getDevKeyPair(): Promise<KeyPair> {
  if (devKeyPair) {
    return devKeyPair;
  }
  if (!devKeyPairPromise) {
    devKeyPairPromise = generateKeyPair('RS256').then((kp) => {
      devKeyPair = kp;
      return kp;
    });
  }
  return devKeyPairPromise;
}

export function getDevIssuer(): string {
  if (env.AUTH0_ISSUER_URL && env.AUTH0_ISSUER_URL.length > 0) {
    return env.AUTH0_ISSUER_URL.endsWith('/')
      ? env.AUTH0_ISSUER_URL
      : `${env.AUTH0_ISSUER_URL}/`;
  }
  return 'https://dev-example.us.auth0.com/';
}

export function getDevAudience(): string {
  if (env.AUTH0_AUDIENCE && env.AUTH0_AUDIENCE.length > 0) {
    return env.AUTH0_AUDIENCE;
  }
  return 'https://api.openfabric.example.com';
}

export async function mintDevToken(options: {
  userId: string;
  customClaims?: Record<string, unknown>;
  expiresIn?: string;
  issuer?: string;
  audience?: string;
}): Promise<string> {
  const { privateKey } = await getDevKeyPair();
  const issuer = options.issuer || getDevIssuer();
  const audience = options.audience || getDevAudience();
  const expiresIn = options.expiresIn || '2h';

  let builder = new SignJWT({
    ...(options.customClaims || {}),
    sub: options.userId,
    'https://openfabric.com/user_id': options.userId.includes('|')
      ? options.userId.split('|').slice(1).join('|')
      : options.userId,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt();

  if (expiresIn === 'expired') {
    // Generate an already expired token for testing
    builder = builder.setExpirationTime('1s ago');
  } else {
    builder = builder.setExpirationTime(expiresIn);
  }

  return builder.sign(privateKey);
}
