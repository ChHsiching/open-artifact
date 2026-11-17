/**
 * The subset of the DSH (DeepSeek Harness) server API this plugin uses, declared locally: DSH publishes no types for
 * it. Everything is optional where the plugin copes without it, so an older or smaller host still loads the plugin.
 */

/** A parameter of a DSH tool: DSH's schemas are a subset of JSON Schema without nested objects or arrays. */
export interface DshParameter {
  type?: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  enum?: string[];
}

/** A DSH tool's parameter schema. */
export interface DshParameters {
  type: 'object';
  properties: Record<string, DshParameter>;
  required?: string[];
}

/** One part of a rendered tool result. */
export interface DshContentPart {
  type: 'text';
  text: string;
}

/** The agent a tool call runs for, as DSH hands it to `execute`. */
export interface DshAgentRef {
  /** The session id. */
  id: string;
  /** `idle` or `running`; other values are treated as running. */
  status?: string;
}

/** The second argument of a tool's `execute`. */
export interface DshToolExecution {
  agent?: DshAgentRef;
  signal?: AbortSignal;
}

/** A tool as `ctx.tools.register` takes it. */
export interface DshToolDefinition {
  name: string;
  description: string;
  parameters: DshParameters;
  output: { schema: Record<string, never>; render(args: unknown, value: unknown): DshContentPart[] };
  execute(args: Record<string, unknown> | undefined, exec: DshToolExecution | undefined): Promise<unknown>;
}

/** A user message as DSH's `createUserMessage` makes one. */
export interface DshUserMessage {
  readonly role: 'user';
  readonly id: string;
  readonly content: readonly DshContentPart[];
  /** Where the message came from; the browser half draws its own card for a wake's source kind. */
  readonly source: Readonly<Record<string, unknown>> & { kind: string; form: 'notice'; summary: string };
}

/** A live agent (`ctx.agents.get(session)`). */
export interface DshAgent {
  /** `idle`, `running`, … */
  status: string;
  /** The agent's session object: the key of the session events DSH emits. */
  session?: object;
  /** Start a new turn with the message once the agent is idle. */
  followup(message: DshUserMessage): void;
  /** Hand the message to the running turn, which reads it at its next step. */
  inject(message: DshUserMessage): void;
  /** End the running turn. `keepInbox` keeps what was queued for the next one. */
  cancel?(cause: { kind: 'user' }, options: { keepInbox: boolean }): void;
}

/** A foreground wait of a timed `ask_user_question` (the userQuestions service's own). */
export interface DshQuestionWait {
  /** What the wait ends with when its timer runs out ("pending": the person can still answer later). */
  timeout?: unknown;
  close?(reason: unknown): void;
}

/** `ctx.get('workingDirectory')`: the session folder the built-in file and shell tools use. */
export interface DshWorkingDirectory {
  ensure?(agent: DshAgentRef, signal?: AbortSignal): Promise<string | undefined> | string | undefined;
}

/** `ctx.get('sessions')`. */
export interface DshSessions {
  get?(id: string): { cwd?: string; meta?: { cwd?: string } } | undefined;
}

/** `ctx.get('agents')`. */
export interface DshAgents {
  get?(id: string): DshAgent | undefined;
}

/** `ctx.get('sessionController')`: resumes a session with no live agent. */
export interface DshSessionController {
  resolveAgent?(id: string): Promise<DshAgent | undefined> | DshAgent | undefined;
}

/** `ctx.get('userQuestions')`. */
export interface DshUserQuestions {
  /** agent → callId → wait. */
  waits?: { get(agent: DshAgent): Map<string, DshQuestionWait> | undefined };
}

/** `ctx.get('systemPrompt')`. */
export interface DshSystemPrompt {
  section?(section: { name: string; order: number; text: string; interpolate: boolean }): unknown;
}

/** A route of the app's route registry (the `connection` service). */
export interface DshRoute {
  path: string;
  methods: string[];
  requestBody: 'buffered';
  fetch(request: Request): Promise<Response>;
}

/** What {@link DshContext.inject} hands its callback. */
export interface DshConnectionContext {
  connection: { fetch: { register(route: DshRoute): unknown } };
}

/** Who can load a skill: the model (by its own choice) and the person (a `/name` word in what they send). */
export interface DshSkillInvocation {
  modelInvocable: boolean;
  userInvocable: boolean;
}

/** A skill a provider lists (`@deepseek-ai/dsh-skill`). */
export interface DshSkillCandidate {
  name: string;
  description: string;
  invocation: DshSkillInvocation;
  provider: string;
  source: string;
  rank: number;
  /** The SKILL.md. */
  path: string;
  /** Where the skill's relative paths resolve. */
  resourceBase: { kind: 'directory'; path: string };
}

/** A skill as a provider loads it: the candidate without its rank, and what the model reads. */
export interface DshSkillDefinition extends Omit<DshSkillCandidate, 'rank'> {
  content: string;
}

/** A source of skills for the app's skill registry. */
export interface DshSkillProvider {
  name: string;
  list(): Promise<DshSkillCandidate[]>;
  get(candidate: DshSkillCandidate, options?: { signal?: AbortSignal }): Promise<DshSkillDefinition>;
}

/** The `skills` service. */
export interface DshSkillsContext {
  skills: { registerProvider(factory: () => DshSkillProvider): unknown };
}

/** A session event (`session/event`), as far as the plugin reads it. */
export interface DshSessionEvent {
  type?: string;
  data?: { name?: string; callId?: string; message?: { toolCallId?: string } };
}

/** An agent status change (`agent/status`). */
export interface DshAgentStatus {
  agent?: { id?: string };
  status?: string;
}

/** The events the plugin listens to. */
export interface DshEvents {
  'session/event': (session: object, event: DshSessionEvent) => void;
  'agent/status': (change: DshAgentStatus) => void;
}

/** The Cordis context DSH hands a server plugin's `apply`: the subset this plugin uses. */
export interface DshContext {
  tools: { register(tool: DshToolDefinition): unknown };
  /** A service by name; throws or returns undefined when the host has none. */
  get(name: string): unknown;
  on?<K extends keyof DshEvents>(name: K, listener: DshEvents[K], options: { global: boolean }): unknown;
  /** Run `callback` in a context of its own once these services are there. */
  inject?<T = DshConnectionContext>(deps: string[], callback: (ctx: T) => void): unknown;
  /** Run `execute` while the plugin is on; its result is the disposer. */
  effect(execute: () => () => void, label?: string): unknown;
  logger?: Partial<Record<'debug' | 'info' | 'warn' | 'error', (message: string) => void>>;
}

/** A service, or undefined when the host has none (or refuses it). */
export function service<T>(ctx: DshContext, name: string): T | undefined {
  try {
    return (ctx.get(name) ?? undefined) as T | undefined;
  } catch {
    return undefined;
  }
}
