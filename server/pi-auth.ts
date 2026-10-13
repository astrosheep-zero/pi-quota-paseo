import { execFile } from "node:child_process";

export interface PiAuthReady {
  authType: string;
  credentials: string;
}

export type SpawnAuthCheck = (
  args: string[],
  env: Record<string, string>,
) => Promise<{ stdout: string; code: number | null }>;

const AUTH_CHECK_TIMEOUT_MS = 10_000;

/** Production spawner: `pi auth check`, never through a shell. */
export const spawnAuthCheck: SpawnAuthCheck = (args, env) =>
  new Promise((resolve, reject) => {
    execFile(
      process.env.PI_QUOTA_PASEO_PI ?? "pi",
      args,
      { env, timeout: AUTH_CHECK_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        // A non-zero exit means "not ready" and carries the JSON reason on
        // stdout; only systemic failures (ENOENT, timeout) arrive as errors.
        if (error && !stdout) return reject(error);
        resolve({ stdout, code: error ? 1 : 0 });
      },
    );
  });

/**
 * Read-only credential resolution through Pi's official CLI. `--no-refresh`
 * keeps the credential store untouched; the owning CLI stays responsible for
 * token rotation. Returns null when no usable credential exists.
 */
export async function checkProviderAuth(
  provider: string,
  env: Record<string, string>,
  spawn: SpawnAuthCheck = spawnAuthCheck,
  options: { allowRefresh?: boolean } = {},
): Promise<PiAuthReady | null> {
  const { stdout } = await spawn(
    [
      "auth", "check", "--provider", provider, "--credentials",
      ...(options.allowRefresh === true ? [] : ["--no-refresh"]),
      "--json",
    ],
    env,
  );
  let report: unknown;
  try {
    report = JSON.parse(stdout);
  } catch {
    console.warn(`pi auth check for ${provider} produced no JSON report`);
    return null;
  }
  if (report === null || typeof report !== "object" || Array.isArray(report)) return null;
  const data = report as Record<string, unknown>;
  if (data.status !== "ready" || typeof data.credentials !== "string" || data.credentials === "")
    return null;
  return {
    authType: typeof data.authType === "string" ? data.authType : "unknown",
    credentials: data.credentials,
  };
}
