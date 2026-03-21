var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// src/tool-compatibility/base.ts
class McpToolCompatibility {
  modelInfo;
  constructor(modelInfo) {
    this.modelInfo = modelInfo;
  }
  transformToolSchema(toolSchema) {
    if (!this.shouldApply()) {
      return toolSchema;
    }
    return this.processSchema(toolSchema);
  }
  processSchema(schema) {
    const processed = { ...schema };
    switch (processed.type) {
      case "string":
        return this.processStringSchema(processed);
      case "number":
      case "integer":
        return this.processNumberSchema(processed);
      case "array":
        return this.processArraySchema(processed);
      case "object":
        return this.processObjectSchema(processed);
      default:
        return this.processGenericSchema(processed);
    }
  }
  processStringSchema(schema) {
    const constraints = {};
    const processed = { ...schema };
    if (typeof schema.minLength === "number") {
      constraints.minLength = schema.minLength;
    }
    if (typeof schema.maxLength === "number") {
      constraints.maxLength = schema.maxLength;
    }
    if (typeof schema.pattern === "string") {
      constraints.pattern = schema.pattern;
    }
    if (typeof schema.format === "string") {
      constraints.format = schema.format;
    }
    if (Array.isArray(schema.enum)) {
      constraints.enum = schema.enum;
    }
    const unsupportedProps = this.getUnsupportedStringProperties();
    for (const prop of unsupportedProps) {
      if (prop in processed) {
        delete processed[prop];
      }
    }
    if (Object.keys(constraints).length > 0) {
      processed.description = this.mergeDescription(schema.description, constraints);
    }
    return processed;
  }
  processNumberSchema(schema) {
    const constraints = {};
    const processed = { ...schema };
    if (typeof schema.minimum === "number") {
      constraints.minimum = schema.minimum;
    }
    if (typeof schema.maximum === "number") {
      constraints.maximum = schema.maximum;
    }
    if (typeof schema.exclusiveMinimum === "number") {
      constraints.exclusiveMinimum = schema.exclusiveMinimum;
    }
    if (typeof schema.exclusiveMaximum === "number") {
      constraints.exclusiveMaximum = schema.exclusiveMaximum;
    }
    if (typeof schema.multipleOf === "number") {
      constraints.multipleOf = schema.multipleOf;
    }
    const unsupportedProps = this.getUnsupportedNumberProperties();
    for (const prop of unsupportedProps) {
      if (prop in processed) {
        delete processed[prop];
      }
    }
    if (Object.keys(constraints).length > 0) {
      processed.description = this.mergeDescription(schema.description, constraints);
    }
    return processed;
  }
  processArraySchema(schema) {
    const constraints = {};
    const processed = { ...schema };
    if (typeof schema.minItems === "number") {
      constraints.minItems = schema.minItems;
    }
    if (typeof schema.maxItems === "number") {
      constraints.maxItems = schema.maxItems;
    }
    if (typeof schema.uniqueItems === "boolean") {
      constraints.uniqueItems = schema.uniqueItems;
    }
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      processed.items = this.processSchema(schema.items);
    }
    const unsupportedProps = this.getUnsupportedArrayProperties();
    for (const prop of unsupportedProps) {
      if (prop in processed) {
        delete processed[prop];
      }
    }
    if (Object.keys(constraints).length > 0) {
      processed.description = this.mergeDescription(schema.description, constraints);
    }
    return processed;
  }
  processObjectSchema(schema) {
    const constraints = {};
    const processed = { ...schema };
    if (typeof schema.minProperties === "number") {
      constraints.minProperties = schema.minProperties;
    }
    if (typeof schema.maxProperties === "number") {
      constraints.maxProperties = schema.maxProperties;
    }
    if (typeof schema.additionalProperties === "boolean") {
      constraints.additionalProperties = schema.additionalProperties;
    }
    if (schema.properties && typeof schema.properties === "object") {
      const newProperties = {};
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (typeof prop === "object" && !Array.isArray(prop)) {
          newProperties[key] = this.processSchema(prop);
        } else {
          newProperties[key] = prop;
        }
      }
      processed.properties = newProperties;
    }
    const unsupportedProps = this.getUnsupportedObjectProperties();
    for (const prop of unsupportedProps) {
      if (prop in processed) {
        delete processed[prop];
      }
    }
    if (Object.keys(constraints).length > 0) {
      processed.description = this.mergeDescription(schema.description, constraints);
    }
    return processed;
  }
  processGenericSchema(schema) {
    const processed = { ...schema };
    if (Array.isArray(schema.oneOf)) {
      processed.oneOf = schema.oneOf.map((s) => typeof s === "object" ? this.processSchema(s) : s);
    }
    if (Array.isArray(schema.anyOf)) {
      processed.anyOf = schema.anyOf.map((s) => typeof s === "object" ? this.processSchema(s) : s);
    }
    if (Array.isArray(schema.allOf)) {
      processed.allOf = schema.allOf.map((s) => typeof s === "object" ? this.processSchema(s) : s);
    }
    return processed;
  }
  mergeDescription(originalDescription, constraints) {
    const constraintJson = JSON.stringify(constraints);
    if (originalDescription) {
      return `${originalDescription}
${constraintJson}`;
    }
    return constraintJson;
  }
}
function hasModelInfo(runtime) {
  return typeof runtime === "object" && runtime !== null && (("modelProvider" in runtime) || ("model" in runtime));
}
function getModelString(runtime) {
  if (hasModelInfo(runtime)) {
    return runtime.modelProvider ?? runtime.model ?? "";
  }
  if (runtime.character && typeof runtime.character === "object" && "settings" in runtime.character && runtime.character.settings && typeof runtime.character.settings === "object") {
    const settings = runtime.character.settings;
    const modelProvider = settings.MODEL_PROVIDER ?? settings.modelProvider;
    const model = settings.MODEL ?? settings.model;
    return String(modelProvider ?? model ?? "");
  }
  return "";
}
function detectModelProvider(runtime) {
  const modelString = getModelString(runtime);
  const modelId = String(modelString).toLowerCase();
  let provider2 = "openrouter";
  let supportsStructuredOutputs = false;
  let isReasoningModel = false;
  if (modelId.includes("openai") || modelId.includes("gpt-") || modelId.includes("o1-") || modelId.includes("o3-")) {
    provider2 = "openai";
    supportsStructuredOutputs = modelId.includes("gpt-5") || modelId.includes("o1") || modelId.includes("o3");
    isReasoningModel = modelId.includes("o1") || modelId.includes("o3");
  } else if (modelId.includes("anthropic") || modelId.includes("claude")) {
    provider2 = "anthropic";
    supportsStructuredOutputs = true;
  } else if (modelId.includes("google") || modelId.includes("gemini")) {
    provider2 = "google";
    supportsStructuredOutputs = true;
  } else if (modelId.includes("openrouter")) {
    provider2 = "openrouter";
    supportsStructuredOutputs = false;
  }
  return {
    provider: provider2,
    modelId,
    supportsStructuredOutputs,
    isReasoningModel
  };
}

// src/tool-compatibility/providers/openai.ts
var exports_openai = {};
__export(exports_openai, {
  OpenAIReasoningMcpCompatibility: () => OpenAIReasoningMcpCompatibility,
  OpenAIMcpCompatibility: () => OpenAIMcpCompatibility
});
var OpenAIMcpCompatibility, OpenAIReasoningMcpCompatibility;
var init_openai = __esm(() => {
  OpenAIMcpCompatibility = class OpenAIMcpCompatibility extends McpToolCompatibility {
    shouldApply() {
      return this.modelInfo.provider === "openai" && (!this.modelInfo.supportsStructuredOutputs || this.modelInfo.isReasoningModel === true);
    }
    getUnsupportedStringProperties() {
      const baseUnsupported = ["format"];
      if (this.modelInfo.isReasoningModel === true) {
        return [...baseUnsupported, "pattern"];
      }
      if (this.modelInfo.modelId.includes("gpt-3.5") || this.modelInfo.modelId.includes("davinci")) {
        return [...baseUnsupported, "pattern"];
      }
      return baseUnsupported;
    }
    getUnsupportedNumberProperties() {
      if (this.modelInfo.isReasoningModel === true) {
        return ["exclusiveMinimum", "exclusiveMaximum", "multipleOf"];
      }
      return [];
    }
    getUnsupportedArrayProperties() {
      if (this.modelInfo.isReasoningModel === true) {
        return ["uniqueItems"];
      }
      return [];
    }
    getUnsupportedObjectProperties() {
      return ["minProperties", "maxProperties"];
    }
  };
  OpenAIReasoningMcpCompatibility = class OpenAIReasoningMcpCompatibility extends McpToolCompatibility {
    shouldApply() {
      return this.modelInfo.provider === "openai" && this.modelInfo.isReasoningModel === true;
    }
    getUnsupportedStringProperties() {
      return ["format", "pattern", "minLength", "maxLength"];
    }
    getUnsupportedNumberProperties() {
      return ["exclusiveMinimum", "exclusiveMaximum", "multipleOf"];
    }
    getUnsupportedArrayProperties() {
      return ["uniqueItems", "minItems", "maxItems"];
    }
    getUnsupportedObjectProperties() {
      return ["minProperties", "maxProperties", "additionalProperties"];
    }
    mergeDescription(originalDescription, constraints) {
      const constraintText = this.formatConstraintsForReasoningModel(constraints);
      if (originalDescription) {
        return `${originalDescription}

IMPORTANT: ${constraintText}`;
      }
      return `IMPORTANT: ${constraintText}`;
    }
    formatConstraintsForReasoningModel(constraints) {
      const rules = [];
      if (constraints.minLength) {
        rules.push(`minimum ${constraints.minLength} characters`);
      }
      if (constraints.maxLength) {
        rules.push(`maximum ${constraints.maxLength} characters`);
      }
      if (constraints.minimum !== undefined) {
        rules.push(`must be >= ${constraints.minimum}`);
      }
      if (constraints.maximum !== undefined) {
        rules.push(`must be <= ${constraints.maximum}`);
      }
      if (constraints.format === "email") {
        rules.push(`must be a valid email address`);
      }
      if (constraints.format === "uri" || constraints.format === "url") {
        rules.push(`must be a valid URL`);
      }
      if (constraints.format === "uuid") {
        rules.push(`must be a valid UUID`);
      }
      if (constraints.pattern) {
        rules.push(`must match pattern: ${constraints.pattern}`);
      }
      if (constraints.enum) {
        rules.push(`must be one of: ${constraints.enum.join(", ")}`);
      }
      if (constraints.minItems) {
        rules.push(`array must have at least ${constraints.minItems} items`);
      }
      if (constraints.maxItems) {
        rules.push(`array must have at most ${constraints.maxItems} items`);
      }
      return rules.length > 0 ? rules.join(", ") : JSON.stringify(constraints);
    }
  };
});

// src/tool-compatibility/providers/anthropic.ts
var exports_anthropic = {};
__export(exports_anthropic, {
  AnthropicMcpCompatibility: () => AnthropicMcpCompatibility
});
var AnthropicMcpCompatibility;
var init_anthropic = __esm(() => {
  AnthropicMcpCompatibility = class AnthropicMcpCompatibility extends McpToolCompatibility {
    shouldApply() {
      return this.modelInfo.provider === "anthropic";
    }
    getUnsupportedStringProperties() {
      return [];
    }
    getUnsupportedNumberProperties() {
      return [];
    }
    getUnsupportedArrayProperties() {
      return [];
    }
    getUnsupportedObjectProperties() {
      return ["additionalProperties"];
    }
    mergeDescription(originalDescription, constraints) {
      const constraintHints = this.formatConstraintsForAnthropic(constraints);
      if (originalDescription && constraintHints) {
        return `${originalDescription}. ${constraintHints}`;
      } else if (constraintHints) {
        return constraintHints;
      }
      return originalDescription ?? "";
    }
    formatConstraintsForAnthropic(constraints) {
      const hints = [];
      if (constraints.additionalProperties === false) {
        hints.push("Only use the specified properties");
      }
      if (constraints.format === "date-time") {
        hints.push("Use ISO 8601 date-time format");
      }
      if (constraints.pattern) {
        hints.push(`Must match the pattern: ${constraints.pattern}`);
      }
      return hints.join(". ");
    }
  };
});

// src/tool-compatibility/providers/google.ts
var exports_google = {};
__export(exports_google, {
  GoogleMcpCompatibility: () => GoogleMcpCompatibility
});
var GoogleMcpCompatibility;
var init_google = __esm(() => {
  GoogleMcpCompatibility = class GoogleMcpCompatibility extends McpToolCompatibility {
    shouldApply() {
      return this.modelInfo.provider === "google";
    }
    getUnsupportedStringProperties() {
      return ["minLength", "maxLength", "pattern", "format"];
    }
    getUnsupportedNumberProperties() {
      return ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"];
    }
    getUnsupportedArrayProperties() {
      return ["minItems", "maxItems", "uniqueItems"];
    }
    getUnsupportedObjectProperties() {
      return ["minProperties", "maxProperties", "additionalProperties"];
    }
    mergeDescription(originalDescription, constraints) {
      const constraintText = this.formatConstraintsForGoogle(constraints);
      if (originalDescription && constraintText) {
        return `${originalDescription}

Constraints: ${constraintText}`;
      } else if (constraintText) {
        return `Constraints: ${constraintText}`;
      }
      return originalDescription ?? "";
    }
    formatConstraintsForGoogle(constraints) {
      const rules = [];
      if (constraints.minLength) {
        rules.push(`text must be at least ${constraints.minLength} characters long`);
      }
      if (constraints.maxLength) {
        rules.push(`text must be no more than ${constraints.maxLength} characters long`);
      }
      if (constraints.minimum !== undefined) {
        rules.push(`number must be at least ${constraints.minimum}`);
      }
      if (constraints.maximum !== undefined) {
        rules.push(`number must be no more than ${constraints.maximum}`);
      }
      if (constraints.exclusiveMinimum !== undefined) {
        rules.push(`number must be greater than ${constraints.exclusiveMinimum}`);
      }
      if (constraints.exclusiveMaximum !== undefined) {
        rules.push(`number must be less than ${constraints.exclusiveMaximum}`);
      }
      if (constraints.multipleOf) {
        rules.push(`number must be a multiple of ${constraints.multipleOf}`);
      }
      if (constraints.format === "email") {
        rules.push(`must be a valid email address`);
      }
      if (constraints.format === "uri" || constraints.format === "url") {
        rules.push(`must be a valid URL starting with http:// or https://`);
      }
      if (constraints.format === "uuid") {
        rules.push(`must be a valid UUID in the format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`);
      }
      if (constraints.format === "date-time") {
        rules.push(`must be a valid ISO 8601 date-time (e.g., 2023-12-25T10:30:00Z)`);
      }
      if (constraints.pattern) {
        rules.push(`must match the regular expression pattern: ${constraints.pattern}`);
      }
      if (constraints.enum && Array.isArray(constraints.enum)) {
        rules.push(`must be exactly one of these values: ${constraints.enum.join(", ")}`);
      }
      if (constraints.minItems) {
        rules.push(`array must contain at least ${constraints.minItems} items`);
      }
      if (constraints.maxItems) {
        rules.push(`array must contain no more than ${constraints.maxItems} items`);
      }
      if (constraints.uniqueItems === true) {
        rules.push(`array items must all be unique (no duplicates)`);
      }
      if (constraints.minProperties) {
        rules.push(`object must have at least ${constraints.minProperties} properties`);
      }
      if (constraints.maxProperties) {
        rules.push(`object must have no more than ${constraints.maxProperties} properties`);
      }
      if (constraints.additionalProperties === false) {
        rules.push(`object must only contain the specified properties, no additional properties allowed`);
      }
      return rules.join("; ");
    }
  };
});

// src/index.ts
import { logger as logger3 } from "@elizaos/core";

// src/types.ts
var MCP_SERVICE_NAME = "mcp";
var DEFAULT_MCP_TIMEOUT_SECONDS = 60000;
var DEFAULT_MAX_RETRIES = 2;
var ResourceSelectionSchema = {
  type: "object",
  required: ["serverName", "uri"],
  properties: {
    serverName: {
      type: "string",
      minLength: 1,
      errorMessage: "serverName must not be empty"
    },
    uri: {
      type: "string",
      minLength: 1,
      errorMessage: "uri must not be empty"
    },
    reasoning: {
      type: "string"
    },
    noResourceAvailable: {
      type: "boolean"
    }
  }
};
var DEFAULT_PING_CONFIG = {
  enabled: true,
  intervalMs: 1e4,
  timeoutMs: 5000,
  failuresBeforeDisconnect: 3
};
var MAX_RECONNECT_ATTEMPTS = 5;
var BACKOFF_MULTIPLIER = 2;
var INITIAL_RETRY_DELAY = 2000;

// src/utils/error.ts
import {
  composePromptFromState,
  logger,
  ModelType
} from "@elizaos/core";

// src/generated/prompts/typescript/prompts.ts
var errorAnalysisTemplate = `{{{mcpProvider.text}}}

{{{recentMessages}}}

# Prompt

You're an assistant helping a user, but there was an error accessing the resource you tried to use.

User request: "{{{userMessage}}}"
Error message: {{{error}}}

Create a helpful response that:
1. Acknowledges the issue in user-friendly terms
2. Offers alternative approaches to help if possible
3. Doesn't expose technical error details unless they're truly helpful
4. Maintains a helpful, conversational tone

Your response:`;
var resourceAnalysisTemplate = `{{{mcpProvider.text}}}

{{{recentMessages}}}

# Prompt

You are a helpful assistant responding to a user's request. You've just accessed the resource "{{{uri}}}" to help answer this request.

Original user request: "{{{userMessage}}}"

Resource metadata: 
{{{resourceMeta}}

Resource content: 
{{{resourceContent}}

Instructions:
1. Analyze how well the resource's content addresses the user's specific question or need
2. Identify the most relevant information from the resource
3. Create a natural, conversational response that incorporates this information
4. If the resource content is insufficient, acknowledge its limitations and explain what you can determine
5. Do not start with phrases like "According to the resource" or "Here's what I found" - instead, integrate the information naturally
6. Maintain your helpful, intelligent assistant personality while presenting the information

Your response (written as if directly to the user):`;
var resourceSelectionTemplate = `{{{mcpProvider.text}}}

{{{recentMessages}}}

# Prompt

You are an intelligent assistant helping select the right resource to address a user's request.

CRITICAL INSTRUCTIONS:
1. You MUST specify both a valid serverName AND uri from the list above
2. The serverName value should match EXACTLY the server name shown in parentheses (Server: X)
   CORRECT: "serverName": "github"  (if the server is called "github") 
   WRONG: "serverName": "GitHub" or "Github" or any other variation
3. The uri value should match EXACTLY the resource uri listed
   CORRECT: "uri": "weather://San Francisco/current"  (if that's the exact uri)
   WRONG: "uri": "weather://sanfrancisco/current" or any variation
4. Identify the user's information need from the conversation context
5. Select the most appropriate resource based on its description and the request
6. If no resource seems appropriate, output {"noResourceAvailable": true}

!!! YOUR RESPONSE MUST BE A VALID JSON OBJECT ONLY !!! 

STRICT FORMAT REQUIREMENTS:
- NO code block formatting (NO backticks or \`\`\`)
- NO comments (NO // or /* */)
- NO placeholders like "replace with...", "example", "your...", "actual", etc.
- Every parameter value must be a concrete, usable value (not instructions to replace)
- Use proper JSON syntax with double quotes for strings
- NO explanatory text before or after the JSON object

EXAMPLE RESPONSE:
{
  "serverName": "weather-server",
  "uri": "weather://San Francisco/current",
  "reasoning": "Based on the conversation, the user is asking about current weather in San Francisco. This resource provides up-to-date weather information for that city."
}

REMEMBER: Your response will be parsed directly as JSON. If it fails to parse, the operation will fail completely!`;
var toolReasoningTemplate = `{{{mcpProvider.text}}}

{{{recentMessages}}}

# Prompt

You are a helpful assistant responding to a user's request. You've just used the "{{{toolName}}}" tool from the "{{{serverName}}}" server to help answer this request.

Original user request: "{{{userMessage}}}"

Tool response:
{{{toolOutput}}}

{{#if hasAttachments}}
The tool also returned images or other media that will be shared with the user.
{{/if}}

Instructions:
1. Analyze how well the tool's response addresses the user's specific question or need
2. Identify the most relevant information from the tool's output
3. Create a natural, conversational response that incorporates this information
4. If the tool's response is insufficient, acknowledge its limitations and explain what you can determine
5. Do not start with phrases like "I used the X tool" or "Here's what I found" - instead, integrate the information naturally
6. Maintain your helpful, intelligent assistant personality while presenting the information

Your response (written as if directly to the user):`;
var toolSelectionArgumentTemplate = `{{recentMessages}}

# TASK: Generate a Strictly Valid JSON Object for Tool Execution

You have chosen the "{{toolSelectionName.toolName}}" tool from the "{{toolSelectionName.serverName}}" server to address the user's request.
The reasoning behind this selection is: "{{toolSelectionName.reasoning}}"

## CRITICAL INSTRUCTIONS
1. Ensure the "toolArguments" object strictly adheres to the structure and requirements defined in the schema.
2. All parameter values must be extracted from the conversation context and must be concrete, usable values.
3. Avoid placeholders or generic terms unless explicitly provided by the user.

!!! YOUR RESPONSE MUST BE A VALID JSON OBJECT ONLY !!! 

## STRICT FORMAT REQUIREMENTS
- The response MUST be a single valid JSON object.
- DO NOT wrap the JSON in triple backticks (\`\`\`), code blocks, or include any explanatory text.
- DO NOT include comments (// or /* */) anywhere.
- DO NOT use placeholders (e.g., "replace with...", "example", "your...", etc.)
- ALL strings must use double quotes

## CRITICAL NOTES
- All values must be fully grounded in user input or inferred contextually.
- No missing fields unless they are explicitly optional in the schema.
- All types must match the schema (strings, numbers, booleans).

## JSON OBJECT STRUCTURE
Your response MUST contain ONLY these two top-level keys:
1. "toolArguments" — An object matching the input schema: {{toolInputSchema}}
2. "reasoning" — A string explaining how the values were inferred from the conversation.

## EXAMPLE RESPONSE
{
  "toolArguments": {
    "owner": "facebook",
    "repo": "react",
    "path": "README.md",
    "branch": "main"
  },
  "reasoning": "The user wants to see the README from the facebook/react repository based on our conversation."
}

REMEMBER: Your response will be parsed directly as JSON. If it fails to parse, the operation will fail completely.`;
var toolSelectionNameTemplate = `{{mcpProvider.text}}

{{recentMessages}}

# TASK: Select the Most Appropriate Tool and Server

You must select the most appropriate tool from the list above to fulfill the user's request. Your response must be a valid JSON object with the required properties.

## CRITICAL INSTRUCTIONS
1. Provide both "serverName" and "toolName" from the options listed above.
2. Each name must match EXACTLY as shown in the list:
   - Example (correct): "serverName": "github"
   - Example (incorrect): "serverName": "GitHub", "Github", or variations
3. Extract ACTUAL parameter values from the conversation context.
   - Do not invent or use placeholders like "octocat" or "Hello-World" unless the user said so.
4. Include a "reasoning" field explaining why the selected tool fits the request.
5. If no tool is appropriate, respond with:
   {
     "noToolAvailable": true
   }

!!! YOUR RESPONSE MUST BE A VALID JSON OBJECT ONLY !!! 

CRITICAL: Your response must START with { and END with }. DO NOT include ANY text before or after the JSON.

## STRICT FORMAT REQUIREMENTS
- The response MUST be a single valid JSON object.
- DO NOT wrap the JSON in triple backticks (\`\`\`), code blocks, or include any explanatory text.
- DO NOT include comments (// or /* */) anywhere.
- DO NOT use placeholders (e.g., "replace with...", "example", "your...", etc.)
- ALL strings must use double quotes.

## CRITICAL NOTES
- All values must be fully grounded in user input or inferred contextually.
- No missing fields unless they are explicitly optional in the schema.
- All types must match the schema (strings, numbers, booleans).

## JSON OBJECT STRUCTURE
Your response MUST contain ONLY these top-level keys:
1. "serverName" — The name of the server (e.g., "github", "notion")
2. "toolName" — The name of the tool (e.g., "get_file_contents", "search")
3. "reasoning" — A string explaining how the values were inferred from the conversation.
4. "noToolAvailable" — A boolean indicating if no tool is available (true/false)

## EXAMPLE RESPONSE
{
  "serverName": "github",
  "toolName": "get_file_contents",
  "reasoning": "The user wants to retrieve the README from the facebook/react repository.",
  "noToolAvailable": false
}

## REMINDERS
- Use "github" as serverName for GitHub tools.
- Use "notion" as serverName for Notion tools.
- For search and knowledge-based tasks, MCP tools are often appropriate.

REMEMBER: This output will be parsed directly as JSON. If the format is incorrect, the operation will fail.`;

// src/templates/errorAnalysisPrompt.ts
var errorAnalysisPrompt = errorAnalysisTemplate;

// src/utils/error.ts
async function handleMcpError(state, mcpProvider, error, runtime, message, type, callback) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error({ error, mcpType: type }, `Error executing MCP ${type}: ${errorMessage}`);
  let responseText = `I'm sorry, I wasn't able to get the information you requested. There seems to be an issue with the ${type} right now. Is there something else I can help you with?`;
  if (callback) {
    const enhancedState = {
      ...state,
      values: {
        ...state.values,
        mcpProvider,
        userMessage: message.content.text ?? "",
        error: errorMessage
      }
    };
    const prompt = composePromptFromState({
      state: enhancedState,
      template: errorAnalysisPrompt
    });
    const errorResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt
    });
    responseText = errorResponse;
    await callback({
      text: responseText,
      actions: ["REPLY"]
    });
  }
  return {
    text: `Failed to execute MCP ${type}`,
    values: {
      success: false,
      error: errorMessage,
      errorType: type
    },
    data: {
      actionName: type === "tool" ? "CALL_MCP_TOOL" : "READ_MCP_RESOURCE",
      error: errorMessage,
      mcpType: type
    },
    success: false,
    error: error instanceof Error ? error : new Error(errorMessage)
  };
}

// src/utils/handler.ts
async function handleNoToolAvailable(callback, toolSelection) {
  const responseText = "I don't have a specific tool that can help with that request. Let me try to assist you directly instead.";
  if (callback && toolSelection?.noToolAvailable) {
    await callback({
      text: responseText,
      actions: ["REPLY"]
    });
  }
  return {
    text: responseText,
    values: {
      success: true,
      noToolAvailable: true,
      fallbackToDirectAssistance: true
    },
    data: {
      actionName: "CALL_MCP_TOOL",
      noToolAvailable: true,
      reason: toolSelection?.reasoning ?? "No appropriate tool available"
    },
    success: true
  };
}

// src/utils/processing.ts
import {
  ContentType,
  composePromptFromState as composePromptFromState2,
  createUniqueUuid,
  ModelType as ModelType2
} from "@elizaos/core";

// src/utils/mcp.ts
async function createMcpMemory(runtime, message, type, serverName, content, metadata) {
  const memory = await runtime.addEmbeddingToMemory({
    entityId: message.entityId,
    agentId: runtime.agentId,
    roomId: message.roomId,
    content: {
      text: `Used the "${type}" from "${serverName}" server. 
        Content: ${content}`,
      metadata: {
        ...metadata,
        serverName
      }
    }
  });
  await runtime.createMemory(memory, type === "resource" ? "resources" : "tools", true);
}
function buildMcpProviderData(servers) {
  const mcpData = {};
  let textContent = "";
  if (servers.length === 0) {
    return {
      values: { mcp: {} },
      data: { mcp: {} },
      text: "No MCP servers are currently connected."
    };
  }
  for (const server of servers) {
    const tools = {};
    const resources = {};
    mcpData[server.name] = {
      status: server.status,
      tools,
      resources
    };
    textContent += `## Server: ${server.name} (${server.status})

`;
    if (server.tools && server.tools.length > 0) {
      textContent += `### Tools:

`;
      for (const tool of server.tools) {
        tools[tool.name] = {
          description: tool.description ?? "No description available",
          inputSchema: tool.inputSchema
        };
        textContent += `- **${tool.name}**: ${tool.description ?? "No description available"}
`;
      }
      textContent += `
`;
    }
    if (server.resources && server.resources.length > 0) {
      textContent += `### Resources:

`;
      for (const resource of server.resources) {
        resources[resource.uri] = {
          name: resource.name,
          description: resource.description ?? "No description available",
          mimeType: resource.mimeType
        };
        textContent += `- **${resource.name}** (${resource.uri}): ${resource.description ?? "No description available"}
`;
      }
      textContent += `
`;
    }
  }
  return {
    values: { mcp: mcpData, mcpText: `# MCP Configuration

${textContent}` },
    data: { mcp: mcpData },
    text: `# MCP Configuration

${textContent}`
  };
}

// src/utils/processing.ts
function getMimeTypeToContentType(mimeType) {
  if (!mimeType)
    return;
  if (mimeType.startsWith("image/"))
    return ContentType.IMAGE;
  if (mimeType.startsWith("video/"))
    return ContentType.VIDEO;
  if (mimeType.startsWith("audio/"))
    return ContentType.AUDIO;
  if (mimeType.includes("pdf") || mimeType.includes("document"))
    return ContentType.DOCUMENT;
  return;
}
function processResourceResult(result, uri) {
  let resourceContent = "";
  let resourceMeta = "";
  for (const content of result.contents) {
    if (content.text) {
      resourceContent += content.text;
    } else if (content.blob) {
      resourceContent += `[Binary data${content.mimeType ? ` - ${content.mimeType}` : ""}]`;
    }
    resourceMeta += `Resource: ${content.uri ?? uri}
`;
    if (content.mimeType) {
      resourceMeta += `Type: ${content.mimeType}
`;
    }
  }
  return { resourceContent, resourceMeta };
}
function processToolResult(result, serverName, toolName, runtime, messageEntityId) {
  let toolOutput = "";
  let hasAttachments = false;
  const attachments = [];
  for (const content of result.content) {
    if (content.type === "text" && content.text) {
      toolOutput += content.text;
    } else if (content.type === "image" && content.data && content.mimeType) {
      hasAttachments = true;
      attachments.push({
        contentType: getMimeTypeToContentType(content.mimeType),
        url: `data:${content.mimeType};base64,${content.data}`,
        id: createUniqueUuid(runtime, messageEntityId),
        title: "Generated image",
        source: `${serverName}/${toolName}`,
        description: "Tool-generated image",
        text: "Generated image"
      });
    } else if (content.type === "resource" && content.resource) {
      const resource = content.resource;
      if ("text" in resource && resource.text) {
        toolOutput += `

Resource (${resource.uri}):
${resource.text}`;
      } else if ("blob" in resource) {
        toolOutput += `

Resource (${resource.uri}): [Binary data]`;
      }
    }
  }
  return { toolOutput, hasAttachments, attachments };
}
async function handleResourceAnalysis(runtime, message, uri, serverName, resourceContent, resourceMeta, callback) {
  await createMcpMemory(runtime, message, "resource", serverName, resourceContent, {
    uri,
    isResourceAccess: true
  });
  const analysisPrompt = createAnalysisPrompt(uri, message.content.text ?? "", resourceContent, resourceMeta);
  const analyzedResponse = await runtime.useModel(ModelType2.TEXT_SMALL, {
    prompt: analysisPrompt
  });
  if (callback) {
    await callback({
      text: analyzedResponse,
      actions: ["READ_MCP_RESOURCE"]
    });
  }
}
async function handleToolResponse(runtime, message, serverName, toolName, toolArgs, toolOutput, hasAttachments, attachments, state, mcpProvider, callback) {
  await createMcpMemory(runtime, message, "tool", serverName, toolOutput, {
    toolName,
    arguments: toolArgs,
    isToolCall: true
  });
  const reasoningPrompt = createReasoningPrompt(state, mcpProvider, toolName, serverName, message.content.text ?? "", toolOutput, hasAttachments);
  const reasonedResponse = await runtime.useModel(ModelType2.TEXT_SMALL, {
    prompt: reasoningPrompt
  });
  const agentId = message.agentId ?? runtime.agentId;
  const replyMemory = {
    entityId: agentId,
    roomId: message.roomId,
    worldId: message.worldId,
    content: {
      text: reasonedResponse,
      actions: ["CALL_MCP_TOOL"],
      attachments: hasAttachments && attachments.length > 0 ? [...attachments] : undefined
    }
  };
  await runtime.createMemory(replyMemory, "messages");
  if (callback) {
    await callback({
      text: reasonedResponse,
      actions: ["CALL_MCP_TOOL"],
      attachments: hasAttachments && attachments.length > 0 ? [...attachments] : undefined
    });
  }
  return replyMemory;
}
async function sendInitialResponse(callback) {
  if (callback) {
    const responseContent = {
      text: "I'll retrieve that information for you. Let me access the resource...",
      actions: ["READ_MCP_RESOURCE"]
    };
    await callback(responseContent);
  }
}
function createAnalysisPrompt(uri, userMessage, resourceContent, resourceMeta) {
  const enhancedState = {
    data: {},
    text: "",
    values: {
      uri,
      userMessage,
      resourceContent,
      resourceMeta
    }
  };
  return composePromptFromState2({
    state: enhancedState,
    template: resourceAnalysisTemplate
  });
}
function createReasoningPrompt(state, mcpProvider, toolName, serverName, userMessage, toolOutput, hasAttachments) {
  const enhancedState = {
    ...state,
    values: {
      ...state.values,
      mcpProvider,
      toolName,
      serverName,
      userMessage,
      toolOutput,
      hasAttachments
    }
  };
  return composePromptFromState2({
    state: enhancedState,
    template: toolReasoningTemplate
  });
}

// src/utils/selection.ts
import {
  composePromptFromState as composePromptFromState3,
  ModelType as ModelType4
} from "@elizaos/core";

// src/utils/json.ts
import Ajv from "ajv";
import JSON5 from "json5";
function parseJSON(input) {
  let cleanedInput = input.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const firstBrace = cleanedInput.indexOf("{");
  const lastBrace = cleanedInput.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No valid JSON object found in input");
  }
  cleanedInput = cleanedInput.substring(firstBrace, lastBrace + 1);
  return JSON5.parse(cleanedInput);
}
var ajv = new Ajv({
  allErrors: true,
  strict: false
});
function formatAjvErrors(errors) {
  return errors.map((err) => {
    const path = err.instancePath ? `${err.instancePath.replace(/^\//, "")}` : "value";
    return `${path}: ${err.message ?? "validation failed"}`;
  }).join(", ");
}
function validateJsonSchema(data, schema) {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors ?? [];
    const errorMessage = formatAjvErrors(errors);
    return { success: false, error: errorMessage };
  }
  return { success: true, data };
}

// src/utils/schemas.ts
var toolSelectionNameSchema = {
  type: "object",
  required: ["serverName", "toolName"],
  properties: {
    serverName: {
      type: "string",
      minLength: 1,
      errorMessage: "serverName must not be empty"
    },
    toolName: {
      type: "string",
      minLength: 1,
      errorMessage: "toolName must not be empty"
    },
    reasoning: {
      type: "string"
    },
    noToolAvailable: {
      type: "boolean"
    }
  }
};
var toolSelectionArgumentSchema = {
  type: "object",
  required: ["toolArguments"],
  properties: {
    toolArguments: {
      type: "object"
    }
  }
};

// src/utils/validation.ts
function validateToolSelectionName(parsed, state) {
  const basicResult = validateJsonSchema(parsed, toolSelectionNameSchema);
  if (basicResult.success === false) {
    return { success: false, error: basicResult.error };
  }
  const data = basicResult.data;
  const mcpData = state.values.mcp ?? {};
  const server = mcpData[data.serverName];
  if (!server || server.status !== "connected") {
    return {
      success: false,
      error: `Server "${data.serverName}" not found or not connected`
    };
  }
  const toolInfo = server.tools?.[data.toolName];
  if (!toolInfo) {
    return {
      success: false,
      error: `Tool "${data.toolName}" not found on server "${data.serverName}"`
    };
  }
  return { success: true, data };
}
function validateToolSelectionArgument(parsed, toolInputSchema) {
  const basicResult = validateJsonSchema(parsed, toolSelectionArgumentSchema);
  if (basicResult.success === false) {
    return { success: false, error: basicResult.error };
  }
  const data = basicResult.data;
  const validationResult = validateJsonSchema(data.toolArguments, toolInputSchema);
  if (validationResult.success === false) {
    return {
      success: false,
      error: `Invalid arguments: ${validationResult.error}`
    };
  }
  return { success: true, data };
}
function validateResourceSelection(selection) {
  return validateJsonSchema(selection, ResourceSelectionSchema);
}
function createToolSelectionFeedbackPrompt(originalResponse, errorMessage, composedState, userMessage) {
  let toolsDescription = "";
  const mcpData = composedState.values.mcp;
  if (mcpData) {
    for (const [serverName, server] of Object.entries(mcpData)) {
      if (server.status !== "connected")
        continue;
      const tools = server.tools;
      if (tools) {
        for (const [toolName, tool] of Object.entries(tools)) {
          toolsDescription += `Tool: ${toolName} (Server: ${serverName})
`;
          toolsDescription += `Description: ${tool.description ?? "No description available"}

`;
        }
      }
    }
  }
  return createFeedbackPrompt(originalResponse, errorMessage, "tool", toolsDescription, userMessage);
}
function createResourceSelectionFeedbackPrompt(originalResponse, errorMessage, composedState, userMessage) {
  let resourcesDescription = "";
  const mcpData = composedState.values.mcp;
  if (mcpData) {
    for (const [serverName, server] of Object.entries(mcpData)) {
      if (server.status !== "connected")
        continue;
      const resources = server.resources;
      if (resources) {
        for (const [uri, resource] of Object.entries(resources)) {
          resourcesDescription += `Resource: ${uri} (Server: ${serverName})
`;
          resourcesDescription += `Name: ${resource.name ?? "No name available"}
`;
          resourcesDescription += `Description: ${resource.description ?? "No description available"}

`;
        }
      }
    }
  }
  return createFeedbackPrompt(originalResponse, errorMessage, "resource", resourcesDescription, userMessage);
}
function createFeedbackPrompt(originalResponse, errorMessage, itemType, itemsDescription, userMessage) {
  return `Error parsing JSON: ${errorMessage}

Your original response:
${originalResponse}

Please try again with valid JSON for ${itemType} selection.
Available ${itemType}s:
${itemsDescription}

User request: ${userMessage}`;
}

// src/utils/wrapper.ts
import {
  ModelType as ModelType3
} from "@elizaos/core";
async function withModelRetry({
  runtime,
  message,
  state,
  callback,
  input,
  validationFn,
  createFeedbackPromptFn,
  failureMsg,
  retryCount = 0
}) {
  const maxRetries = getMaxRetries(runtime);
  const parsedJson = typeof input === "string" ? parseJSON(input) : input;
  const validationResult = validationFn(parsedJson);
  if (validationResult.success) {
    return validationResult.data;
  }
  const errorMessage = validationResult.error;
  if (retryCount < maxRetries) {
    const feedbackPrompt = createFeedbackPromptFn(input, errorMessage, state, message.content.text ?? "");
    const retrySelection = await runtime.useModel(ModelType3.OBJECT_LARGE, {
      prompt: feedbackPrompt
    });
    return withModelRetry({
      runtime,
      input: retrySelection,
      validationFn,
      message,
      state,
      createFeedbackPromptFn,
      callback,
      failureMsg,
      retryCount: retryCount + 1
    });
  }
  if (callback && failureMsg) {
    await callback({
      text: failureMsg,
      actions: ["REPLY"]
    });
  }
  return null;
}
function getMaxRetries(runtime) {
  const rawSettings = runtime.getSetting("mcp");
  if (rawSettings && typeof rawSettings === "object") {
    const settings = rawSettings;
    if (typeof settings.maxRetries === "number" && settings.maxRetries >= 0) {
      return settings.maxRetries;
    }
  }
  return DEFAULT_MAX_RETRIES;
}

// src/utils/selection.ts
async function createToolSelectionName({
  runtime,
  state,
  message,
  callback,
  mcpProvider
}) {
  const toolSelectionPrompt = composePromptFromState3({
    state: { ...state, values: { ...state.values, mcpProvider } },
    template: toolSelectionNameTemplate
  });
  const toolSelectionName = await runtime.useModel(ModelType4.TEXT_LARGE, {
    prompt: toolSelectionPrompt
  });
  return await withModelRetry({
    runtime,
    message,
    state,
    callback,
    input: toolSelectionName,
    validationFn: (parsed) => validateToolSelectionName(parsed, state),
    createFeedbackPromptFn: (originalResponse, errorMessage, composedState, userMessage) => createToolSelectionFeedbackPrompt(typeof originalResponse === "string" ? originalResponse : JSON.stringify(originalResponse), errorMessage, composedState, userMessage),
    failureMsg: "I'm having trouble figuring out the best way to help with your request."
  });
}
async function createToolSelectionArgument({
  runtime,
  state,
  message,
  callback,
  mcpProvider,
  toolSelectionName
}) {
  if (!toolSelectionName) {
    throw new Error("Tool selection name is required to create tool selection argument");
  }
  const { serverName, toolName } = toolSelectionName;
  const serverData = mcpProvider.data.mcp[serverName];
  if (!serverData) {
    throw new Error(`Server "${serverName}" not found in MCP provider data`);
  }
  const toolData = serverData.tools[toolName];
  if (!toolData) {
    throw new Error(`Tool "${toolName}" not found on server "${serverName}"`);
  }
  const toolInputSchema = toolData.inputSchema ?? {};
  const toolSelectionArgumentPrompt = composePromptFromState3({
    state: {
      ...state,
      values: {
        ...state.values,
        toolSelectionName,
        toolInputSchema: JSON.stringify(toolInputSchema)
      }
    },
    template: toolSelectionArgumentTemplate
  });
  const toolSelectionArgument = await runtime.useModel(ModelType4.TEXT_LARGE, {
    prompt: toolSelectionArgumentPrompt
  });
  return await withModelRetry({
    runtime,
    message,
    state,
    callback,
    input: toolSelectionArgument,
    validationFn: (parsed) => validateToolSelectionArgument(parsed, toolInputSchema),
    createFeedbackPromptFn: (originalResponse, errorMessage, composedState, userMessage) => createToolSelectionFeedbackPrompt(typeof originalResponse === "string" ? originalResponse : JSON.stringify(originalResponse), errorMessage, composedState, userMessage),
    failureMsg: "I'm having trouble figuring out the best way to help with your request."
  });
}

// src/actions/callToolAction.ts
var callToolAction = {
  name: "CALL_MCP_TOOL",
  similes: [
    "CALL_TOOL",
    "CALL_MCP_TOOL",
    "USE_TOOL",
    "USE_MCP_TOOL",
    "EXECUTE_TOOL",
    "EXECUTE_MCP_TOOL",
    "RUN_TOOL",
    "RUN_MCP_TOOL",
    "INVOKE_TOOL",
    "INVOKE_MCP_TOOL"
  ],
  description: "Calls a tool from an MCP server to perform a specific task",
  validate: async (runtime, _message, _state) => {
    const mcpService = runtime.getService(MCP_SERVICE_NAME);
    if (!mcpService)
      return false;
    const servers = mcpService.getServers();
    return servers.length > 0 && servers.some((server) => server.status === "connected" && server.tools && server.tools.length > 0);
  },
  handler: async (runtime, message, _state, _options, callback) => {
    const composedState = await runtime.composeState(message, ["RECENT_MESSAGES", "MCP"]);
    const mcpService = runtime.getService(MCP_SERVICE_NAME);
    if (!mcpService) {
      throw new Error("MCP service not available");
    }
    const mcpProvider = mcpService.getProviderData();
    try {
      const toolSelectionName = await createToolSelectionName({
        runtime,
        state: composedState,
        message,
        callback,
        mcpProvider
      });
      if (!toolSelectionName || toolSelectionName.noToolAvailable) {
        return await handleNoToolAvailable(callback, toolSelectionName);
      }
      const { serverName, toolName } = toolSelectionName;
      const toolSelectionArgument = await createToolSelectionArgument({
        runtime,
        state: composedState,
        message,
        callback,
        mcpProvider,
        toolSelectionName
      });
      if (!toolSelectionArgument) {
        return await handleNoToolAvailable(callback, toolSelectionName);
      }
      const result = await mcpService.callTool(serverName, toolName, toolSelectionArgument.toolArguments);
      const { toolOutput, hasAttachments, attachments } = processToolResult(result, serverName, toolName, runtime, message.entityId);
      const replyMemory = await handleToolResponse(runtime, message, serverName, toolName, toolSelectionArgument.toolArguments, toolOutput, hasAttachments, attachments, composedState, mcpProvider, callback);
      return {
        text: `Successfully called tool: ${serverName}/${toolName}. Reasoned response: ${replyMemory.content.text}`,
        values: {
          success: true,
          toolExecuted: true,
          serverName,
          toolName,
          hasAttachments,
          output: toolOutput
        },
        data: {
          actionName: "CALL_MCP_TOOL",
          serverName,
          toolName,
          toolArgumentsJson: JSON.stringify(toolSelectionArgument.toolArguments),
          reasoning: toolSelectionName.reasoning,
          output: toolOutput,
          attachmentCount: attachments?.length ?? 0
        },
        success: true
      };
    } catch (error) {
      return await handleMcpError(composedState, mcpProvider, error, runtime, message, "tool", callback);
    }
  },
  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "Can you search for information about climate change?"
        }
      },
      {
        name: "{{assistant}}",
        content: {
          text: "I'll help you with that request. Let me access the right tool...",
          actions: ["CALL_MCP_TOOL"]
        }
      },
      {
        name: "{{assistant}}",
        content: {
          text: `I found the following information about climate change:

Climate change refers to long-term shifts in temperatures and weather patterns. These shifts may be natural, but since the 1800s, human activities have been the main driver of climate change, primarily due to the burning of fossil fuels like coal, oil, and gas, which produces heat-trapping gases.`,
          actions: ["CALL_MCP_TOOL"]
        }
      }
    ]
  ]
};

// src/actions/readResourceAction.ts
import {
  composePromptFromState as composePromptFromState4,
  ModelType as ModelType5
} from "@elizaos/core";
function createResourceSelectionPrompt(composedState, userMessage) {
  const mcpData = composedState.values.mcp ?? {};
  const serverNames = Object.keys(mcpData);
  let resourcesDescription = "";
  for (const serverName of serverNames) {
    const server = mcpData[serverName];
    if (server.status !== "connected")
      continue;
    const resourceUris = Object.keys(server.resources ?? {});
    for (const uri of resourceUris) {
      const resource = server.resources[uri];
      resourcesDescription += `Resource: ${uri} (Server: ${serverName})
`;
      resourcesDescription += `Name: ${resource.name ?? "No name available"}
`;
      resourcesDescription += `Description: ${resource.description ?? "No description available"}
`;
      resourcesDescription += `MIME Type: ${resource.mimeType ?? "Not specified"}

`;
    }
  }
  const enhancedState = {
    ...composedState,
    values: {
      ...composedState.values,
      resourcesDescription,
      userMessage
    }
  };
  return composePromptFromState4({
    state: enhancedState,
    template: resourceSelectionTemplate
  });
}
var readResourceAction = {
  name: "READ_MCP_RESOURCE",
  similes: [
    "READ_RESOURCE",
    "READ_MCP_RESOURCE",
    "GET_RESOURCE",
    "GET_MCP_RESOURCE",
    "FETCH_RESOURCE",
    "FETCH_MCP_RESOURCE",
    "ACCESS_RESOURCE",
    "ACCESS_MCP_RESOURCE"
  ],
  description: "Reads a resource from an MCP server",
  validate: async (runtime, _message, _state) => {
    const mcpService = runtime.getService(MCP_SERVICE_NAME);
    if (!mcpService)
      return false;
    const servers = mcpService.getServers();
    return servers.length > 0 && servers.some((server) => server.status === "connected" && server.resources && server.resources.length > 0);
  },
  handler: async (runtime, message, _state, _options, callback) => {
    const composedState = await runtime.composeState(message, ["RECENT_MESSAGES", "MCP"]);
    const mcpService = runtime.getService(MCP_SERVICE_NAME);
    if (!mcpService) {
      throw new Error("MCP service not available");
    }
    const mcpProvider = mcpService.getProviderData();
    try {
      await sendInitialResponse(callback);
      const resourceSelectionPrompt = createResourceSelectionPrompt(composedState, message.content.text ?? "");
      const resourceSelection = await runtime.useModel(ModelType5.TEXT_SMALL, {
        prompt: resourceSelectionPrompt
      });
      const parsedSelection = await withModelRetry({
        runtime,
        state: composedState,
        message,
        callback,
        input: resourceSelection,
        validationFn: (data) => validateResourceSelection(data),
        createFeedbackPromptFn: (originalResponse, errorMessage, state, userMessage) => createResourceSelectionFeedbackPrompt(typeof originalResponse === "string" ? originalResponse : JSON.stringify(originalResponse), errorMessage, state, userMessage),
        failureMsg: `I'm having trouble finding the resource you're looking for. Could you provide more details about what you need?`,
        retryCount: 0
      });
      if (!parsedSelection || parsedSelection.noResourceAvailable) {
        const responseText = "I don't have a specific resource that contains the information you're looking for. Let me try to assist you directly instead.";
        if (callback && parsedSelection?.noResourceAvailable) {
          await callback({
            text: responseText,
            actions: ["REPLY"]
          });
        }
        return {
          text: responseText,
          values: {
            success: true,
            noResourceAvailable: true,
            fallbackToDirectAssistance: true
          },
          data: {
            actionName: "READ_MCP_RESOURCE",
            noResourceAvailable: true,
            reason: parsedSelection?.reasoning ?? "No appropriate resource available"
          },
          success: true
        };
      }
      const { serverName, uri } = parsedSelection;
      const result = await mcpService.readResource(serverName, uri);
      const { resourceContent, resourceMeta } = processResourceResult(result, uri);
      await handleResourceAnalysis(runtime, message, uri, serverName, resourceContent, resourceMeta, callback);
      return {
        text: `Successfully read resource: ${uri}`,
        values: {
          success: true,
          resourceRead: true,
          serverName,
          uri
        },
        data: {
          actionName: "READ_MCP_RESOURCE",
          serverName,
          uri,
          reasoning: parsedSelection?.reasoning,
          resourceMeta,
          contentLength: resourceContent?.length ?? 0
        },
        success: true
      };
    } catch (error) {
      return await handleMcpError(composedState, mcpProvider, error, runtime, message, "resource", callback);
    }
  },
  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "Can you get the documentation about installing elizaOS?"
        }
      },
      {
        name: "{{assistant}}",
        content: {
          text: `I'll retrieve that information for you. Let me access the resource...`,
          actions: ["READ_MCP_RESOURCE"]
        }
      },
      {
        name: "{{assistant}}",
        content: {
          text: `elizaOS installation is straightforward. You'll need Node.js 23+ and Git installed. For Windows users, WSL 2 is required. The quickest way to get started is by cloning the elizaOS starter repository with \`git clone https://github.com/elizaos/eliza-starter.git\`, then run \`cd eliza-starter && cp .env.example .env && bun i && bun run build && bun start\`. This will set up a development environment with the core features enabled. After starting, you can access the web interface at http://localhost:3000 to interact with your agent.`,
          actions: ["READ_MCP_RESOURCE"]
        }
      }
    ]
  ]
};

// src/provider.ts
var provider = {
  name: "MCP",
  description: "Information about connected MCP servers, tools, and resources",
  get: async (runtime, _message, _state) => {
    const mcpService = runtime.getService(MCP_SERVICE_NAME);
    if (!mcpService) {
      return {
        values: {},
        data: {},
        text: "No MCP servers are available."
      };
    }
    const providerData = mcpService.getProviderData();
    return {
      values: { mcpServers: JSON.stringify(providerData.values.mcp) },
      data: { mcpServerCount: Object.keys(providerData.data.mcp).length },
      text: providerData.text
    };
  }
};

// src/service.ts
import { logger as logger2, Service } from "@elizaos/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// src/tool-compatibility/index.ts
function createMcpToolCompatibilitySync(runtime) {
  const modelInfo = detectModelProvider(runtime);
  switch (modelInfo.provider) {
    case "openai": {
      const { OpenAIMcpCompatibility: OpenAIMcpCompatibility2 } = (init_openai(), __toCommonJS(exports_openai));
      return new OpenAIMcpCompatibility2(modelInfo);
    }
    case "anthropic": {
      const { AnthropicMcpCompatibility: AnthropicMcpCompatibility2 } = (init_anthropic(), __toCommonJS(exports_anthropic));
      return new AnthropicMcpCompatibility2(modelInfo);
    }
    case "google": {
      const { GoogleMcpCompatibility: GoogleMcpCompatibility2 } = (init_google(), __toCommonJS(exports_google));
      return new GoogleMcpCompatibility2(modelInfo);
    }
    default:
      return null;
  }
}

// src/service.ts
class McpService extends Service {
  static serviceType = MCP_SERVICE_NAME;
  capabilityDescription = "Enables the agent to interact with MCP (Model Context Protocol) servers";
  connections = new Map;
  connectionStates = new Map;
  mcpProvider = {
    values: { mcp: {}, mcpText: "" },
    data: { mcp: {} },
    text: ""
  };
  pingConfig = DEFAULT_PING_CONFIG;
  toolCompatibility = null;
  compatibilityInitialized = false;
  initializationPromise = null;
  constructor(runtime) {
    super(runtime);
    this.initializationPromise = this.initializeMcpServers();
  }
  static async start(runtime) {
    const service = new McpService(runtime);
    if (service.initializationPromise) {
      await service.initializationPromise;
    }
    return service;
  }
  async waitForInitialization() {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }
  async stop() {
    for (const [name] of this.connections) {
      await this.deleteConnection(name);
    }
    this.connections.clear();
    for (const state of this.connectionStates.values()) {
      if (state.pingInterval)
        clearInterval(state.pingInterval);
      if (state.reconnectTimeout)
        clearTimeout(state.reconnectTimeout);
    }
    this.connectionStates.clear();
  }
  async initializeMcpServers() {
    const mcpSettings = this.getMcpSettings();
    if (!mcpSettings || !mcpSettings.servers || Object.keys(mcpSettings.servers).length === 0) {
      this.mcpProvider = buildMcpProviderData([]);
      return;
    }
    await this.updateServerConnections(mcpSettings.servers);
    const servers = this.getServers();
    this.mcpProvider = buildMcpProviderData(servers);
  }
  getMcpSettings() {
    const rawSettings = this.runtime.getSetting("mcp");
    let settings = null;
    if (rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)) {
      const parsed = rawSettings;
      if ("servers" in parsed && typeof parsed.servers === "object" && parsed.servers !== null) {
        settings = parsed;
      }
    }
    if (!settings || !settings.servers) {
      const characterSettings = this.runtime.character.settings;
      if (characterSettings && typeof characterSettings === "object" && "mcp" in characterSettings) {
        const characterMcpSettings = characterSettings.mcp;
        if (characterMcpSettings && typeof characterMcpSettings === "object" && "servers" in characterMcpSettings) {
          settings = characterMcpSettings;
        }
      }
    }
    if (settings && typeof settings === "object" && settings.servers) {
      return settings;
    }
    return;
  }
  async updateServerConnections(serverConfigs) {
    const currentNames = new Set(this.connections.keys());
    const newNames = new Set(Object.keys(serverConfigs));
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.deleteConnection(name);
      }
    }
    const connectionPromises = Object.entries(serverConfigs).map(async ([name, config]) => {
      const currentConnection = this.connections.get(name);
      if (!currentConnection) {
        await this.initializeConnection(name, config);
      } else if (JSON.stringify(config) !== currentConnection.server.config) {
        await this.deleteConnection(name);
        await this.initializeConnection(name, config);
      }
    });
    await Promise.allSettled(connectionPromises);
  }
  async initializeConnection(name, config) {
    await this.deleteConnection(name);
    const state = {
      status: "connecting",
      reconnectAttempts: 0,
      consecutivePingFailures: 0
    };
    this.connectionStates.set(name, state);
    const client = new Client({ name: "elizaOS", version: "1.0.0" }, { capabilities: {} });
    const transport = config.type === "stdio" ? await this.buildStdioClientTransport(name, config) : await this.buildHttpClientTransport(name, config);
    const connection = {
      server: {
        name,
        config: JSON.stringify(config),
        status: "connecting"
      },
      client,
      transport
    };
    this.connections.set(name, connection);
    this.setupTransportHandlers(name, connection, state);
    await client.connect(transport);
    const capabilities = client.getServerCapabilities();
    const tools = await this.fetchToolsList(name);
    const resources = capabilities?.resources ? await this.fetchResourcesList(name) : [];
    const resourceTemplates = capabilities?.resources ? await this.fetchResourceTemplatesList(name) : [];
    connection.server = {
      status: "connected",
      name,
      config: JSON.stringify(config),
      error: "",
      tools,
      resources,
      resourceTemplates
    };
    state.status = "connected";
    state.lastConnected = new Date;
    state.reconnectAttempts = 0;
    state.consecutivePingFailures = 0;
    this.startPingMonitoring(name);
  }
  setupTransportHandlers(name, connection, _state) {
    const config = JSON.parse(connection.server.config);
    const isHttpTransport = config.type !== "stdio";
    connection.transport.onerror = async (error) => {
      const errorMessage = error?.message ?? String(error);
      const isExpectedTimeout = isHttpTransport && (errorMessage === "undefined" || errorMessage === "" || errorMessage.includes("SSE error") || errorMessage.includes("timeout"));
      if (!isExpectedTimeout) {
        logger2.error({ error, serverName: name }, `Transport error for "${name}"`);
        connection.server.status = "disconnected";
        this.appendErrorMessage(connection, error.message);
      }
      if (!isHttpTransport) {
        this.handleDisconnection(name, error);
      }
    };
    connection.transport.onclose = async () => {
      if (!isHttpTransport) {
        connection.server.status = "disconnected";
        this.handleDisconnection(name, new Error("Transport closed"));
      }
    };
  }
  startPingMonitoring(name) {
    const connection = this.connections.get(name);
    if (!connection)
      return;
    const config = JSON.parse(connection.server.config);
    const isHttpTransport = config.type !== "stdio";
    if (isHttpTransport) {
      return;
    }
    const state = this.connectionStates.get(name);
    if (!state || !this.pingConfig.enabled)
      return;
    if (state.pingInterval)
      clearInterval(state.pingInterval);
    state.pingInterval = setInterval(() => {
      this.sendPing(name).catch((err) => {
        logger2.warn({ error: err.message, serverName: name }, `Ping failed for ${name}`);
        this.handlePingFailure(name, err);
      });
    }, this.pingConfig.intervalMs);
  }
  async sendPing(name) {
    const connection = this.connections.get(name);
    if (!connection)
      throw new Error(`No connection for ping: ${name}`);
    await Promise.race([
      connection.client.listTools(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Ping timeout")), this.pingConfig.timeoutMs))
    ]);
    const state = this.connectionStates.get(name);
    if (state)
      state.consecutivePingFailures = 0;
  }
  handlePingFailure(name, error) {
    const state = this.connectionStates.get(name);
    if (!state)
      return;
    state.consecutivePingFailures++;
    if (state.consecutivePingFailures >= this.pingConfig.failuresBeforeDisconnect) {
      this.handleDisconnection(name, error);
    }
  }
  handleDisconnection(name, error) {
    const state = this.connectionStates.get(name);
    if (!state)
      return;
    state.status = "disconnected";
    state.lastError = error instanceof Error ? error : new Error(String(error));
    if (state.pingInterval)
      clearInterval(state.pingInterval);
    if (state.reconnectTimeout)
      clearTimeout(state.reconnectTimeout);
    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }
    const delay = INITIAL_RETRY_DELAY * BACKOFF_MULTIPLIER ** state.reconnectAttempts;
    state.reconnectTimeout = setTimeout(async () => {
      state.reconnectAttempts++;
      const connection = this.connections.get(name);
      const config = connection?.server?.config;
      if (config) {
        try {
          await this.initializeConnection(name, JSON.parse(config));
        } catch (err) {
          this.handleDisconnection(name, err);
        }
      }
    }, delay);
  }
  async deleteConnection(name) {
    const connection = this.connections.get(name);
    if (connection) {
      await connection.transport.close();
      await connection.client.close();
      this.connections.delete(name);
    }
    const state = this.connectionStates.get(name);
    if (state) {
      if (state.pingInterval)
        clearInterval(state.pingInterval);
      if (state.reconnectTimeout)
        clearTimeout(state.reconnectTimeout);
      this.connectionStates.delete(name);
    }
  }
  getServerConnection(serverName) {
    return this.connections.get(serverName);
  }
  async buildStdioClientTransport(name, config) {
    if (!config.command) {
      throw new Error(`Missing command for stdio MCP server ${name}`);
    }
    return new StdioClientTransport({
      command: config.command,
      args: config.args ? [...config.args] : undefined,
      env: {
        ...config.env,
        ...process.env.PATH ? { PATH: process.env.PATH } : {}
      },
      stderr: "pipe",
      cwd: config.cwd
    });
  }
  async buildHttpClientTransport(name, config) {
    if (!config.url) {
      throw new Error(`Missing URL for HTTP MCP server ${name}`);
    }
    return new SSEClientTransport(new URL(config.url));
  }
  appendErrorMessage(connection, error) {
    const newError = connection.server.error ? `${connection.server.error}
${error}` : error;
    connection.server.error = newError;
  }
  async fetchToolsList(serverName) {
    const connection = this.getServerConnection(serverName);
    if (!connection) {
      return [];
    }
    const response = await connection.client.listTools();
    const tools = (response?.tools ?? []).map((tool) => {
      const processedTool = { ...tool };
      if (tool.inputSchema) {
        if (!this.compatibilityInitialized) {
          this.initializeToolCompatibility();
        }
        processedTool.inputSchema = this.applyToolCompatibility(tool.inputSchema);
      }
      return processedTool;
    });
    return tools;
  }
  async fetchResourcesList(serverName) {
    const connection = this.getServerConnection(serverName);
    if (!connection) {
      return [];
    }
    const response = await connection.client.listResources();
    return response?.resources ?? [];
  }
  async fetchResourceTemplatesList(serverName) {
    const connection = this.getServerConnection(serverName);
    if (!connection) {
      return [];
    }
    const response = await connection.client.listResourceTemplates();
    return response?.resourceTemplates ?? [];
  }
  getServers() {
    return Array.from(this.connections.values()).filter((conn) => !conn.server.disabled).map((conn) => conn.server);
  }
  getProviderData() {
    return this.mcpProvider;
  }
  async callTool(serverName, toolName, toolArguments) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverName}`);
    }
    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled`);
    }
    let timeout = DEFAULT_MCP_TIMEOUT_SECONDS;
    const config = JSON.parse(connection.server.config);
    if (config.type === "stdio" && config.timeoutInMillis) {
      timeout = config.timeoutInMillis;
    }
    const result = await connection.client.callTool({
      name: toolName,
      arguments: toolArguments ? { ...toolArguments } : undefined
    }, undefined, { timeout });
    if (!result.content) {
      throw new Error("Invalid tool result: missing content array");
    }
    return result;
  }
  async readResource(serverName, uri) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverName}`);
    }
    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled`);
    }
    return await connection.client.readResource({ uri });
  }
  async restartConnection(serverName) {
    const connection = this.connections.get(serverName);
    const config = connection?.server?.config;
    if (config) {
      connection.server.status = "connecting";
      connection.server.error = "";
      await this.deleteConnection(serverName);
      await this.initializeConnection(serverName, JSON.parse(config));
    }
  }
  initializeToolCompatibility() {
    if (this.compatibilityInitialized)
      return;
    this.toolCompatibility = createMcpToolCompatibilitySync(this.runtime);
    this.compatibilityInitialized = true;
  }
  applyToolCompatibility(toolSchema) {
    if (!this.compatibilityInitialized) {
      this.initializeToolCompatibility();
    }
    if (!this.toolCompatibility || !toolSchema) {
      return toolSchema;
    }
    return this.toolCompatibility.transformToolSchema(toolSchema);
  }
}

// src/index.ts
var mcpPlugin = {
  name: "mcp",
  description: "Plugin for connecting to MCP (Model Context Protocol) servers",
  init: async (_config, _runtime) => {
    logger3.info("Initializing MCP plugin...");
  },
  services: [McpService],
  actions: [callToolAction, readResourceAction],
  providers: [provider]
};
var src_default = mcpPlugin;
export {
  src_default as default
};

//# debugId=A44D04A3F130891B64756E2164756E21
