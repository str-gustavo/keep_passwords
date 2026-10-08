process.env.SESSION_SECRET ??= 'test-secret-test-secret-test-secret-1234';
process.env.KEEP_DB = 'memory';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
