export const GROQ_MODELS = {
  primary: 'openai/gpt-oss-120b',
  fast: 'openai/gpt-oss-20b'
} as const;

export type GroqModel = (typeof GROQ_MODELS)[keyof typeof GROQ_MODELS];
export type GroqTask = 'agent-generation' | 'workflow-generation' | 'reality-lab' | 'prompt-repair' | 'caller-simulation' | 'quick-edit';

export const GROQ_TASK_MODELS: Record<GroqTask, GroqModel> = {
  'agent-generation': GROQ_MODELS.primary,
  'workflow-generation': GROQ_MODELS.primary,
  'reality-lab': GROQ_MODELS.primary,
  'prompt-repair': GROQ_MODELS.primary,
  'caller-simulation': GROQ_MODELS.fast,
  'quick-edit': GROQ_MODELS.fast
};

export function isGroqModel(value: unknown): value is GroqModel {
  return value === GROQ_MODELS.primary || value === GROQ_MODELS.fast;
}

export function modelForTask(task: GroqTask, requested?: unknown): GroqModel {
  return isGroqModel(requested) ? requested : GROQ_TASK_MODELS[task];
}
