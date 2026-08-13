import "dotenv/config";

export interface McpServerConfig {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}
export const mcpServersConfig: Record<string, McpServerConfig> = {
  eslint: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@eslint/mcp@latest"],
  },
};
export const eslintTools = [
  "mcp__eslint__lint-files"
];
