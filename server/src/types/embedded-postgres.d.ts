// Minimal ambient types for the dev-only embedded-postgres tool. Its real types
// are exposed through an `exports` map that classic Node module resolution can't
// read; tsx resolves the module fine at runtime, this just satisfies tsc.
declare module 'embedded-postgres' {
  export interface EmbeddedPostgresOptions {
    databaseDir: string;
    port: number;
    user: string;
    password: string;
    persistent: boolean;
    initdbFlags?: string[];
    authMethod?: 'scram-sha-256' | 'password' | 'md5';
  }
  export default class EmbeddedPostgres {
    constructor(options?: Partial<EmbeddedPostgresOptions>);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
    dropDatabase(name: string): Promise<void>;
  }
}
