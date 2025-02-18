export interface InputManifest {
  id: string;
  name: string;
  description: string;
  namespace: string;
  sctPath: string;
  esePath: string;
  loginProfilesPath: string;
  icaoAircraftPath: string;
  icaoAirlinesPath: string;
  recatDefinitionPath?: string;
  aliasPath: string;
  outputDir: string;
  asrPath: string;
  settingsDirectory: string;
  packageOverride: string;
  useSctLabels?: boolean;
}
