import { z } from 'zod';

export const skillScopeSchema = z
  .object({
    filesystem: z.enum(['none', 'read', 'write']).default('none'),
    process: z.enum(['none', 'exec']).default('none'),
    network: z.enum(['none', 'outbound']).default('none'),
    secrets: z.enum(['none', 'read']).default('none')
  })
  .strict();

export const skillManifestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    entry: z.string().min(1),
    enabled: z.boolean().default(true),
    requiresApproval: z.boolean().default(false),
    supportsDryRun: z.boolean().default(true),
    tags: z.array(z.string().min(1)).default([]),
    allowedCommands: z.array(z.string().min(1)).default([]),
    requiredTools: z.array(z.string().min(1)).default([]),
    scopes: skillScopeSchema.default({
      filesystem: 'none',
      process: 'none',
      network: 'none',
      secrets: 'none'
    })
  })
  .strict();

export type SkillManifest = z.infer<typeof skillManifestSchema>;
