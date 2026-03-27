import { z } from 'zod';

export const skillCatalogEntrySchema = z
  .object({
    name: z.string().min(1).optional(),
    path: z.string().min(1),
    enabled: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
    supportsDryRun: z.boolean().optional(),
    tags: z.array(z.string().min(1)).optional(),
    allowedCommands: z.array(z.string().min(1)).optional(),
    requiredTools: z.array(z.string().min(1)).optional()
  })
  .strict();
export type SkillCatalogEntry = z.infer<typeof skillCatalogEntrySchema>;
