import type { FreeModel } from './types.js';

/**
 * Model classification (模型分类).
 *
 * Every scraped model is tagged with a set of categories so the relay
 * catalog, RSS feed and dashboard can group free models by what they are
 * for. Classification is deterministic by default (name/capability heuristics)
 * and can optionally be refined by Workers AI when an `AI` binding is present.
 */

export type ModelCategory =
  | 'chat'
  | 'reasoning'
  | 'vision'
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'embedding';

export const CATEGORY_ORDER: readonly ModelCategory[] = [
  'chat',
  'reasoning',
  'vision',
  'image',
  'video',
  'audio',
  'code',
  'embedding',
];

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  chat: '对话',
  reasoning: '推理',
  vision: '视觉理解',
  image: '图像生成',
  video: '视频生成',
  audio: '语音/音频',
  code: '代码',
  embedding: '向量嵌入',
};

/** Minimal Workers AI binding shape (kept local, independent of workers-types). */
export interface WorkersAiLike {
  run(model: string, inputs: unknown): Promise<unknown>;
}

const ALL_CATEGORIES = new Set<string>(CATEGORY_ORDER);

function lower(s: unknown): string {
  return String(s ?? '').toLowerCase();
}

function hasAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(name));
}

const EMBEDDING_RE = [
  /embedding/i,
  /text-embed/i,
  /\bembed\b/i,
  /\bbge-/i,
  /\bgte-/i,
  /-e5\b/i,
  /e5-large|e5-base|e5-small/i,
  /jina-embeddings/i,
  /voyage/i,
  /m3e/i,
  /nomic-embed/i,
];

const IMAGE_RE = [
  /image/i,
  /img-/i,
  /\bt2i\b/i,
  /\bi2i\b/i,
  /stable-diffusion/i,
  /sdxl/i,
  /dall-e|dalle/i,
  /flux/i,
  /wanx/i,
  /qwen-image|qwen2\.5-image/i,
  /muse/i,
  /sana/i,
  /controlnet/i,
];

const VIDEO_RE = [
  /video/i,
  /veo/i,
  /\bsora\b/i,
  /\bwan\b/i,
  /kling/i,
  /pixeldance/i,
  /mochi/i,
  /cogvideo|cog-video/i,
  /videogen/i,
  /camera/,
];

const AUDIO_RE = [
  /whisper/i,
  /\btts\b/i,
  /voice/i,
  /speech/i,
  /audio/i,
  /diathe/i,
  /sensevoice/i,
  /cosyvoice/i,
  /spark-tts|sparktts/i,
  /f5-tts/i,
  /audio2text|asr/i,
];

const CODE_RE = [
  /coder/i,
  /codegeex/i,
  /codex/i,
  /deepseek-coder/i,
  /qwen(?:2\.5|3|-coder)?-coder/i,
  /devstral/i,
  /\bcodestral\b/i,
  /instruct-code/i,
  /codeqwen/i,
  /starcoder/i,
  /\bcode\b/i,
];

const REASONING_RE = [
  /reasoning/i,
  /deepseek-r/i,
  /\br1\b|\br2\b/i,
  /\bo1\b|\bo3\b|\bo4\b/i,
  /think/i,
  /thinking/i,
  /qwen3-(?:r|max)/i,
  /grok-.*-reasoning/i,
  /claude-.*-thinking/i,
  /kimi-k2-thinking/i,
];

const VISION_RE = [
  /vision/i,
  /multimodal/i,
  /\bvl\b/i,
  /v-flash/i,
  /-4v\b/i,
  /4\.5v|4v-flash/i,
  /gemini.*flash/i,
  /gemini-.*-pro/i,
  /minicpm-v/i,
  /internvl/i,
];

/**
 * Deterministic rule-based classification derived from the model name,
 * provider and already-known capabilities.
 */
export function classifyModel(model: FreeModel): string[] {
  const name = lower(model.model_name);
  const caps = (model.capabilities ?? []).map(lower);
  const cats = new Set<string>();

  // Capability hints are the strongest signal.
  if (caps.includes('vision')) cats.add('vision');
  if (caps.includes('image')) cats.add('image');
  if (caps.includes('video')) cats.add('video');
  if (caps.includes('audio')) cats.add('audio');
  if (caps.includes('embedding')) cats.add('embedding');
  if (caps.includes('code')) cats.add('code');
  if (caps.includes('reasoning')) cats.add('reasoning');

  if (hasAny(name, EMBEDDING_RE)) cats.add('embedding');
  if (hasAny(name, IMAGE_RE)) cats.add('image');
  if (hasAny(name, VIDEO_RE)) cats.add('video');
  if (hasAny(name, AUDIO_RE)) cats.add('audio');
  if (hasAny(name, CODE_RE)) cats.add('code');
  if (hasAny(name, REASONING_RE)) cats.add('reasoning');
  if (hasAny(name, VISION_RE)) cats.add('vision');

  // Embedding / generation models are not conversational.
  const isChat = !cats.has('embedding');
  if (isChat) cats.add('chat');

  return CATEGORY_ORDER.filter((c) => cats.has(c));
}

/**
 * Optional Workers AI refinement. Merges AI-detected categories with the
 * rule-based result (union), constrained to the known category set. Failures
 * are silent so a bad AI response never breaks a sync run.
 */
export async function aiRefineCategories(
  models: FreeModel[],
  ai: WorkersAiLike,
  options?: { concurrency?: number; maxModels?: number }
): Promise<FreeModel[]> {
  const concurrency = Math.max(1, options?.concurrency ?? 8);
  const maxModels = options?.maxModels ?? 60;
  const targets = models.slice(0, maxModels);

  const enriched: FreeModel[] = [];
  for (let i = 0; i < targets.length; i += concurrency) {
    const chunk = targets.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (m) => {
        const ruleBased = classifyModel(m);
        const aiCats = await aiClassifyOne(m, ai);
        const merged = [...new Set([...ruleBased, ...aiCats])];
        return { ...m, categories: CATEGORY_ORDER.filter((c) => merged.includes(c)) };
      })
    );
    enriched.push(...results);
  }

  // Models beyond the AI budget keep their rule-based classification.
  return [...enriched, ...models.slice(maxModels)];
}

async function aiClassifyOne(model: FreeModel, ai: WorkersAiLike): Promise<ModelCategory[]> {
  try {
    const prompt = [
      'You are a free AI model catalog classifier.',
      'Classify the following model and reply with ONLY a JSON array of category strings.',
      `Allowed categories: ${JSON.stringify(CATEGORY_ORDER)}.`,
      'Only include categories confidently supported by the model.',
      `Model name: ${model.model_name}`,
      `Provider: ${model.provider}`,
      `Known capabilities: ${(model.capabilities ?? []).join(', ') || 'unknown'}`,
    ].join('\n');

    const raw = await ai.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 128,
    });

    return parseCategoryJson(extractJson(String((raw as { response?: string }).response ?? '')));
  } catch {
    return [];
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const bracket = text.match(/\[[\s\S]*\]/);
  return bracket ? bracket[0] : text.trim();
}

function parseCategoryJson(text: string): ModelCategory[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .map((c) => String(c).trim())
      .filter((c) => ALL_CATEGORIES.has(c)) as ModelCategory[];
  } catch {
    return [];
  }
}

/**
 * Entry point used by the sync pipeline: always applies the deterministic
 * classifier, then (optionally) refines with Workers AI when a binding exists.
 */
export async function classifyAll(
  models: FreeModel[],
  ai?: WorkersAiLike
): Promise<FreeModel[]> {
  const classified = models.map((m) => ({
    ...m,
    categories: m.categories && m.categories.length > 0 ? m.categories : classifyModel(m),
  }));
  if (!ai) return classified;
  return aiRefineCategories(classified, ai);
}
