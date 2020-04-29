import { BuilderContext, BuilderOutput } from "@angular-devkit/architect";
import { Options, FileInputOutput } from "../schema";
import { inspect } from "util";
import { readJsonFile } from "@nrwl/workspace";
import * as glob from "glob";
import { basename, dirname, join, relative, normalize } from "path";
import {
  DependentBuildableProjectNode,
  checkDependentProjectsHaveBeenBuilt,
  createTmpTsConfig,
  updateBuildableProjectPackageJsonDependencies
} from "@nrwl/workspace/src/utils/buildable-libs-utils";
import {
  createProjectGraph,
  ProjectGraph,
  ProjectGraphNode
} from "@nrwl/workspace/src/core/project-graph";
import { ChildProcess, fork, spawn, exec } from "child_process";
import * as treeKill from "tree-kill";
import { copy, removeSync } from "fs-extra";
import { Observable, Subscriber } from "rxjs";
import { writeJsonFile } from "@nrwl/workspace/src/utils/fileutils";
import { calculateProjectDependencies } from "./buildable-libs-utils";

// fixme: clean the signature & output
export class ProjectInfo {
  options: Options;
  projectGraph: ProjectGraph;
  target: ProjectGraphNode;
  dependencies: DependentBuildableProjectNode[];
  context: BuilderContext;
  dependenciesAreBuilt: boolean;

  constructor(options, context) {
    this.options = this.getOptions(options, context);
    this.context = context;
    return this;
  }

  getAll() {
    const options = this.options;
    const projectGraph = this.getProjectGraph();
    const target = this.getTarget();
    const dependencies = this.getDependencies();
    const context = this.context;
    const dependenciesAreBuilt = this.getDependenciesAreBuilt();
    return {
      options,
      dependencies,
      dependenciesAreBuilt,
      target,
      projectGraph
      // context,
    };
  }

  log(message: any) {
    this.context.logger.info(inspect(message, false, null));
  }

  getOptions(options, context): Options {
    if (this.options === undefined) {

      const outDir = options.outputPath;
      const files: FileInputOutput[] = [];

      const globbedFiles = (pattern: string, input: string = "", ignore: string[] = []) => {
        return glob.sync(pattern, {
          cwd: input,
          nodir: true,
          ignore
        });
      };

      options.assets.forEach(asset => {
        if (typeof asset === "string") {
          // @ts-ignore
          globbedFiles(asset, context.workspaceRoot)
            // @ts-ignore
            .forEach(globbedFile => {
              // @ts-ignore
              files.push({
                input: join(context.workspaceRoot, globbedFile),
                output: join(context.workspaceRoot, outDir, basename(globbedFile))
              });
            });
        } else {
          globbedFiles(asset.glob, join(context.workspaceRoot, asset.input), asset.ignore)
            // @ts-ignore
            .forEach(globbedFile => {
              // @ts-ignore
              files.push({
                input: join(context.workspaceRoot, asset.input, globbedFile),
                output: join(context.workspaceRoot, outDir, asset.output, globbedFile)
              });
            });
        }
      });

      // Relative path for the dist directory
      const tsconfig = readJsonFile(join(context.workspaceRoot, options.tsConfig));
      const rootDir = tsconfig.compilerOptions.rootDir || "";
      const mainFileDir = dirname(options.main);
      const tsconfigDir = dirname(options.tsConfig);
      const relativeMainFileOutput = relative(`${tsconfigDir}/${rootDir}`, mainFileDir);
      const watch = options.watch || false;
      const sourceMap = options.sourceMap || true;

      this.options = {
        ...options,
        files,
        watch,
        sourceMap,
        relativeMainFileOutput,
        normalizedOutputPath: join(context.workspaceRoot, options.outputPath)
      };
    }
    return this.options;
  }

  getProjectGraph() {
    if (this.projectGraph === undefined) {
      this.projectGraph = createProjectGraph();
    }
    return this.projectGraph;
  }

  getTarget(projectGraph = this.getProjectGraph(), context = this.context) {
    if (this.target === undefined) {
      const { target, dependencies } = calculateProjectDependencies(projectGraph, context);
      this.target = target;
      this.dependencies = dependencies;
    }
    return this.target;
  }

  getDependencies(projectGraph = this.getProjectGraph(), context = this.context) {
    if (this.dependencies === undefined) {
      const { target, dependencies } = calculateProjectDependencies(projectGraph, context);
      this.target = target;
      this.dependencies = dependencies;
    }
    return this.dependencies;
  }

  getDependenciesAreBuilt(context = this.context, dependencies = this.getDependencies()) {
    if (this.dependenciesAreBuilt === undefined) {
      this.dependenciesAreBuilt = checkDependentProjectsHaveBeenBuilt(context, dependencies);
    }
    return this.dependenciesAreBuilt;
  }

  reportAnError(message: string = "", error?: any) {
    if (message) {
      this.log(message);
    }
    if (error) {
      this.log(error);
    }
    return {
      success: false,
      info: { message },
      error
    };
  }

  async copyAssetFiles(options = this.options, context = this.context) {
    this.log("Start: Copy Assets Files");
    try {
      // @ts-ignore
      const promises = options.files.map(file => copy(file.input, file.output));
      await Promise.all(promises);
      this.log("Done: Copy Assets Files");
      return this.ok();
    } catch (error) {
      return this.reportAnError(error.message, error);
    }
  }

  compileTypeScriptFiles(
    options = this.options,
    context = this.context,
    projectGraph = this.getProjectGraph(),
    projectDependencies = this.getDependencies()
  ): Promise<BuilderOutput> {
    this.log("Start: Compile Typescript Files");

    const libRoot = projectGraph.nodes[context.target.project].data.root;
    let tsConfigPath = join(context.workspaceRoot, options.tsConfig);
    if (projectDependencies.length > 0) {
      tsConfigPath = createTmpTsConfig(
        tsConfigPath,
        context.workspaceRoot,
        libRoot,
        projectDependencies
      );
    }

    let command = ["tsc", "-p", tsConfigPath, "--outDir", options.normalizedOutputPath];
    if (options.sourceMap) {
      command.push("--sourceMap");
    }

    const tscPath = join(context.workspaceRoot, "/node_modules/typescript/bin/tsc");

    const child = exec(command.join(" "));
    child.stdout.on("data", data => this.log(data.toString()));
    child.stderr.on("data", data => this.log(data.toString()));

    return new Promise(resolve => {
      this.log("Done: Compile Typescript Files");
      child.on("close", code => resolve({ success: code === 0 }));
    });
  }

  updatePackageJson(options = this.options, context = this.context): Promise<BuilderOutput> {
    this.log("Start: Update Package Json");
    const mainFile = basename(options.main, ".ts");
    const typingsFile = `${mainFile}.d.ts`;
    const mainJsFile = `${mainFile}.js`;
    let packageJson = readJsonFile(join(context.workspaceRoot, options.packageJson));
    packageJson.main = normalize(`./${options.relativeMainFileOutput}/${mainJsFile}`);
    packageJson.typings = normalize(`./${options.relativeMainFileOutput}/${typingsFile}`);

    return new Promise(resolve => {
      writeJsonFile(`${options.outputPath}/package.json`, packageJson);
      this.log("Done: Update Package Json");
      return this.ok();
    });
  }

  ok(values?: { [key: string]: any }) {
    return {
      success: true,
      ...values
    };
  }

  updateBuildableProjectPackageJsonDependencies(
    context = this.context,
    target = this.getTarget(),
    dependencies = this.getDependencies()
  ): Promise<BuilderOutput> {
    updateBuildableProjectPackageJsonDependencies(context, target, dependencies);

    // fixme: redo everywhere
    return Promise.resolve(this.ok());
  }

}
