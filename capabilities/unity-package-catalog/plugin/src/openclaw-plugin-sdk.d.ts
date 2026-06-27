declare module "openclaw/plugin-sdk/tool-plugin" {
  export type ToolDefinition<TParams = any, TConfig = any, TResult = any> = {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (params: TParams, config: TConfig) => Promise<TResult> | TResult;
  };

  export type ToolBuilder = <TParams = any, TConfig = any, TResult = any>(
    definition: ToolDefinition<TParams, TConfig, TResult>,
  ) => ToolDefinition<TParams, TConfig, TResult>;

  export function defineToolPlugin(definition: {
    id: string;
    name: string;
    description: string;
    configSchema?: unknown;
    tools: (tool: ToolBuilder) => ToolDefinition[];
  }): unknown;
}

