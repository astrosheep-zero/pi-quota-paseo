import type { PluginServerContext } from "@getpaseo/plugin/server";
import { inputSchema } from "./shared/input.ts";
import { discover, fetchUsage } from "./server/usage.ts";

export default function contribute(server: PluginServerContext) {
  server.registerUsageSource({
    id: "pi-quota",
    label: "Pi Quota",
    icon: "icon.svg",
    input: inputSchema,
    discover: (scope) => discover(scope),
    fetch: (input) => fetchUsage(input),
  });
  return () => {};
}
