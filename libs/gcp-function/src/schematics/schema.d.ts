import { Path } from "@angular-devkit/core";
import { Linter } from "@nrwl/workspace";

export interface UserOptions {
  name: string;
  prefix?: string;
  trigger?: string;
  maxInstances?: number;
  runtime?: string;
  region?: string;
  tags?: string;
  directory?: string;
  skipFormat: boolean;
  skipPackageJson?: boolean;
  unitTestRunner?: "jest" | "none";
  linter?: Linter.EsLint;
  nxVersion?: string;
}
interface Options extends UserOptions {
  triggerTopic? : string
  appProjectRoot: Path;
  dot: string;
  projectName: string;
  projectType: string;
  appDirectory: string;
  propertyName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
  className: string;
  offsetFromRoot: string;
}
