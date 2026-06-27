import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  unityPackageDelete,
  unityPackageDeleteCandidate,
  unityPackageGet,
  unityPackageImportFile,
  unityPackageIndexRefresh,
  unityPackageSearch,
} from "./tools.ts";

const ConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdaccioRegistryUrl: { type: "string", description: "Verdaccio registry URL." },
    verdaccioTokenEnvVar: { type: "string", description: "Environment variable that contains the Verdaccio auth token." },
    nasPackageRoots: {
      type: "array",
      items: { type: "string" },
      description: "Container paths to scan for .unitypackage files.",
    },
    nasTrashRoot: { type: "string", description: "Container path where deleted .unitypackage files are archived." },
    indexPath: { type: "string", description: "Persistent JSON index path." },
    indexMaxAgeHours: { type: "number", description: "Search marks the index stale after this many hours." },
  },
};

const SourceSchema = { enum: ["verdaccio", "nas"] };
const DeleteScopeSchema = { enum: ["package", "version", "nasFile"] };

export default defineToolPlugin({
  id: "unity-package-catalog",
  name: "Unity Package Catalog",
  description: "Search and safely manage Unity packages from Verdaccio and NAS-hosted .unitypackage files.",
  configSchema: ConfigSchema,
  tools: (tool) => [
    tool({
      name: "unity_package_index_refresh",
      label: "Unity Package Index Refresh",
      description: "Scan Verdaccio and NAS .unitypackage roots, then rewrite the persistent Unity package index.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      execute: (params, config) => unityPackageIndexRefresh(params, config),
    }),
    tool({
      name: "unity_package_search",
      label: "Unity Package Search",
      description:
        "Search the Unity package index. This does not refresh the index; stale results include a warning.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "Natural-language package query, for example save game or inventory." },
          source: SourceSchema,
          limit: { type: "number", description: "Maximum number of matches to return." },
        },
      },
      execute: (params, config) => unityPackageSearch(params, config),
    }),
    tool({
      name: "unity_package_get",
      label: "Unity Package Get",
      description: "Return full indexed details for one package id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string", description: "Package id from unity_package_search." },
        },
      },
      execute: (params, config) => unityPackageGet(params, config),
    }),
    tool({
      name: "unity_package_import_file",
      label: "Unity Package Import File",
      description:
        "Import a confirmed .unitypackage file from a local attachment or download path into the configured NAS package root, then update the index.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["sourceFilePath", "confirmed", "userConfirmation"],
        properties: {
          sourceFilePath: {
            type: "string",
            description: "Local file path available inside the OpenClaw container, typically from a chat attachment or file-transfer tool.",
          },
          targetFolder: {
            type: "string",
            description: "Optional relative folder inside the NAS package root. Must not contain absolute or .. path segments.",
          },
          targetName: {
            type: "string",
            description: "Optional target file name. Must end with .unitypackage and must not include path separators.",
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite an existing target file only when the user explicitly confirms replacement.",
          },
          confirmed: { enum: [true], description: "Must be true only after the user confirms the exact import target." },
          userConfirmation: {
            type: "string",
            minLength: 1,
            description: "Exact user confirmation text copied from the separate reply.",
          },
        },
      },
      execute: (params, config) => unityPackageImportFile(params, config),
    }),
    tool({
      name: "unity_package_delete_candidate",
      label: "Unity Package Delete Candidate",
      description:
        "Resolve one exact package or file before deletion. Show the returned candidate to the user and wait for a separate confirmation before deleting.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "Exact package id from search/get." },
          query: { type: "string", description: "Search text used only when id is not known." },
          source: SourceSchema,
          deleteScope: DeleteScopeSchema,
          version: { type: "string", description: "Required for Verdaccio version delete." },
        },
      },
      execute: (params, config) => unityPackageDeleteCandidate(params, config),
    }),
    tool({
      name: "unity_package_delete",
      label: "Unity Package Delete",
      description:
        "Delete a confirmed package candidate. First call unity_package_delete_candidate, show the exact candidate to the user, and wait for a separate explicit confirmation.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["id", "deleteScope", "expectedFingerprint", "confirmed", "userConfirmation"],
        properties: {
          id: { type: "string", description: "Exact package id returned by the delete candidate tool." },
          deleteScope: DeleteScopeSchema,
          version: { type: "string", description: "Required for Verdaccio version delete." },
          expectedFingerprint: { type: "string", description: "Fingerprint returned by unity_package_delete_candidate." },
          confirmed: { enum: [true], description: "Must be true only after the user confirms in a separate reply." },
          userConfirmation: {
            type: "string",
            minLength: 1,
            description: "Exact user confirmation text copied from the separate reply.",
          },
        },
      },
      execute: (params, config) => unityPackageDelete(params, config),
    }),
  ],
});
