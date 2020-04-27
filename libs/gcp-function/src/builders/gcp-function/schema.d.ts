import { JsonObject } from "@angular-devkit/core";
import { Path } from "@angular-devkit/core";

export interface FileReplacement {
  replace: string;
  with: string;
}

export interface OptimizationOptions {
  scripts: boolean;
  styles: boolean;
}

export interface SourceMapOptions {
  scripts: boolean;
  styles: boolean;
  vendors: boolean;
  hidden: boolean;
}

export interface BuildBuilderOptions extends JsonObject {
  main: string;
  outputPath: string;
  yamlConfig: string;
  tsConfig: string;
  packageJson: string
  watch?: boolean;
  setRootTsConfig?: boolean;
  setRootJestConfig?: boolean;
  setRootEsLint?: boolean;
  sourceMap?: boolean | SourceMapOptions;
  optimization?: boolean | OptimizationOptions;
  showCircularDependencies?: boolean;
  maxWorkers?: number;
  memoryLimit?: number;
  poll?: number;

  fileReplacements: FileReplacement[];
  assets?: any[];

  progress?: boolean;
  statsJson?: boolean;
  extractLicenses?: boolean;
  verbose?: boolean;

  webpackConfig?: string;

  root?: string;
  sourceRoot?: Path;
}

export interface Options extends BuildBuilderOptions {
  optimization?: boolean;
  sourceMap?: boolean;
  externalDependencies: "all" | "none" | string[];
  buildLibsFromSource?: boolean;
}

export type FileInputOutput = {
  input: string;
  output: string;
};
