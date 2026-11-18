/** A checkout held by the demo PSP. A real PSP keeps this in its own systems. */
export interface DemoSession {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly description: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  paid: boolean;
}

// In memory, shared across the example's routes through `globalThis`.
const store = globalThis as typeof globalThis & { __demoSessions?: Map<string, DemoSession> };
const sessions = (store.__demoSessions ??= new Map<string, DemoSession>());

export function saveDemoSession(session: DemoSession): void {
  sessions.set(session.id, session);
}

export function findDemoSession(id: string | undefined): DemoSession | undefined {
  return id ? sessions.get(id) : undefined;
}
