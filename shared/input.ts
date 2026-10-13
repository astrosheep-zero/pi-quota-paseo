import { z } from "zod";

// The daemon treats inputs as opaque store locators. Credentials never appear
// here: fetch() re-reads the Pi settings file and re-runs `pi auth check`.
export const inputSchema = z
  .object({
    provider: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/),
    agentDir: z.string().min(1),
  })
  .strict();
export type PiQuotaUsageInput = z.infer<typeof inputSchema>;
