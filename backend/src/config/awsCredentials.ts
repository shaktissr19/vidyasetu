export type AwsCredentialMode = 'instance-role' | 'static' | 'partial-static';

export interface StaticAwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export function getAwsCredentialMode(env: NodeJS.ProcessEnv): AwsCredentialMode {
  const hasAccessKey = Boolean(env.AWS_ACCESS_KEY_ID?.trim());
  const hasSecretKey = Boolean(env.AWS_SECRET_ACCESS_KEY?.trim());
  if (hasAccessKey && hasSecretKey) return 'static';
  if (!hasAccessKey && !hasSecretKey) return 'instance-role';
  return 'partial-static';
}

export function getStaticAwsCredentials(env: NodeJS.ProcessEnv): StaticAwsCredentials | null {
  if (getAwsCredentialMode(env) !== 'static') return null;
  return {
    accessKeyId: env.AWS_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!.trim(),
  };
}
