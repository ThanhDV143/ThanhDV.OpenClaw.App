export type UnityPackageCatalogConfig = {
  verdaccioRegistryUrl?: string;
  verdaccioTokenEnvVar?: string;
  nasPackageRoots?: string[];
  nasTrashRoot?: string;
  indexPath?: string;
  indexMaxAgeHours?: number;
};

export type ResolvedConfig = {
  verdaccioRegistryUrl: string;
  verdaccioTokenEnvVar: string;
  nasPackageRoots: string[];
  nasTrashRoot: string;
  indexPath: string;
  indexMaxAgeHours: number;
};

export type PackageSource = "verdaccio" | "nas";
export type VerdaccioDeleteScope = "package" | "version";
export type DeleteScope = VerdaccioDeleteScope | "nasFile";

export type PackageIndex = {
  schemaVersion: 1;
  generatedAt: string;
  sources: {
    verdaccio: {
      registryUrl: string;
      packageCount: number;
      errors: string[];
    };
    nas: {
      roots: string[];
      packageCount: number;
      errors: string[];
    };
  };
  packages: PackageRecord[];
};

export type BasePackageRecord = {
  id: string;
  source: PackageSource;
  name: string;
  description: string | null;
  keywords: string[];
  fingerprint: string;
};

export type VerdaccioPackageRecord = BasePackageRecord & {
  source: "verdaccio";
  registryUrl: string;
  latestVersion: string | null;
  versions: string[];
  distTags: Record<string, string>;
  revision: string | null;
  readmePreview: string | null;
};

export type NasPackageRecord = BasePackageRecord & {
  source: "nas";
  path: string;
  root: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type PackageRecord = VerdaccioPackageRecord | NasPackageRecord;

export type RefreshInput = Record<string, never>;

export type SearchInput = {
  query?: string;
  source?: PackageSource;
  limit?: number;
};

export type GetInput = {
  id: string;
};

export type ImportFileInput = {
  sourceFilePath: string;
  targetFolder?: string;
  targetName?: string;
  overwrite?: boolean;
  confirmed: true;
  userConfirmation: string;
};

export type DeleteCandidateInput = {
  id?: string;
  query?: string;
  source?: PackageSource;
  deleteScope?: DeleteScope;
  version?: string;
};

export type DeleteInput = {
  id: string;
  deleteScope: DeleteScope;
  expectedFingerprint: string;
  confirmed: true;
  userConfirmation: string;
  version?: string;
};

export type DeleteCandidate = {
  id: string;
  source: PackageSource;
  deleteScope: DeleteScope;
  name: string;
  version: string | null;
  expectedFingerprint: string;
  warnings: string[];
  record: PackageRecord;
};
