export interface EmbeddingProvider {
  readonly name: 'noop' | 'voyage';
  readonly modelName?: string | null;
  embed(inputs: string[]): Promise<number[][]>;
}

export class NoopEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'noop' as const;
  readonly modelName = null;

  embed(inputs: string[]): Promise<number[][]> {
    return Promise.resolve(inputs.map(() => []));
  }
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'voyage' as const;
  readonly modelName: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {
    this.modelName = model;
  }

  async embed(inputs: string[]): Promise<number[][]> {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: inputs
      })
    });

    if (!response.ok) {
      throw new Error(`Voyage embedding request failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return (payload.data ?? []).map((row) => row.embedding ?? []);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    magA += a[i]! ** 2;
    magB += b[i]! ** 2;
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
