import {
  apply,
  applyTemplates,
  chain,
  externalSchematic,
  MergeStrategy,
  mergeWith,
  move,
  Rule,
  SchematicContext,
  Tree,
  url
} from "@angular-devkit/schematics";
import {
  addPackageWithInit,
  formatFiles,
  generateProjectLint,
  Linter,
  names,
  offsetFromRoot,
  projectRootDir,
  ProjectType,
  toClassName,
  toFileName,
  toPropertyName,
  updateJsonInTree,
  updateWorkspaceInTree
} from "@nrwl/workspace";
import {inspect} from "util";
import {Options, UserOptions} from "./schema";
import {join, normalize} from "@angular-devkit/core";

function getBuildConfig(project: any, options: Options) {
  return {
    builder: "@joelcode/gcp-function:build",
    options: {
      outputPath: join(normalize("dist"), options.appProjectRoot),
      main: join(project.sourceRoot, "index.ts"),
      yamlConfig: join(project.sourceRoot, "/environments/.production.yaml"),
      tsConfig: join(options.appProjectRoot, "tsconfig.app.json"),
      packageJson: join(options.appProjectRoot, "package.json"),
    },
    configurations: {
      production: {
        optimization: true,
        extractLicenses: true,
        inspect: false
      }
    }
  };
}

function getServeConfig(options: Options) {
  return {
    builder: "@nrwl/workspace:run-commands",
    options: {
      commands: [
        {command: `npx @google-cloud/functions-framework --target ${options.propertyName} --source ./dist/apps/${options.name}`}
      ]
    }
  };
}

function getDeployConfig(options: Options) {
  return {
    builder: "@nrwl/workspace:run-commands",
    options: {
      commands: [
        {
          command: `gcloud functions deploy ${options.propertyName} ${options.trigger} --runtime ${options.runtime} --region ${options.region} --env-vars-file ./dist/apps/${options.name}/.production.yaml --source ./dist/apps/${options.name} --max-instances ${options.maxInstances}`
        }
      ]
    }
  };
}

function getLogConfig(options: Options) {
  return {
    builder: "@nrwl/workspace:run-commands",
    options: {
      commands: [
        {
          command: `gcloud functions logs read ${options.propertyName}`
        }
      ]
    }
  };
}

function updateWorkspaceJson(options: Options): Rule {
  return updateWorkspaceInTree(workspaceJson => {
    const project = {
      root: options.appProjectRoot,
      sourceRoot: join(options.appProjectRoot, "src"),
      projectType: "application",
      prefix: options.name,
      schematics: {},
      architect: <any>{}
    };

    project.architect.serve = getServeConfig(options);
    project.architect.build = getBuildConfig(project, options);
    project.architect.logs = getLogConfig(options);
    project.architect.deploy = getDeployConfig(options);
    // fixme: test don't show in architecture

    project.architect.test = externalSchematic("@nrwl/jest", "jest-project", {
      project: options.name,
      setupFile: "none",
      skipSerializers: true
    });
    project.architect.lint = generateProjectLint(
      normalize(project.root),
      join(normalize(project.root), "tsconfig.app.json"),
      Linter.EsLint
    );

    workspaceJson.projects[options.name] = project;

    workspaceJson.defaultProject = workspaceJson.defaultProject || options.name;

    return workspaceJson;
  });
}

function updateNxJson(options: Options): Rule {
  return updateJsonInTree(`/nx.json`, json => {
    return {
      ...json,
      projects: {
        ...json.projects,
        [options.name]: {tags: options.parsedTags}
      }
    };
  });
}

function generateFiles(options: Options): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const templateSource = apply(
      url("./files"),
      [
        applyTemplates({
          ...options,
          ...names(options.name),
          offsetFromRoot: offsetFromRoot(options.projectRoot)
        }),
        move(options.projectRoot)
      ]);

    return chain([
      mergeWith(templateSource, MergeStrategy.Overwrite)
    ])(tree, context);
  };
}

/* Utilities */
// noinspection JSUnusedGlobalSymbols
export default function (UserOptions: UserOptions): Rule {
  const options = normalizeOptions(UserOptions);

  return (tree: Tree, context: SchematicContext) => {
    context.logger.info("Start");
    context.logger.info(inspect(options, false, null));

    return chain([
      addPackageWithInit("@nrwl/jest"),
      formatFiles(options),
      generateFiles(options),
      updateNxJson(options),
      updateWorkspaceJson(options)
    ])(tree, context);
  };
}

function normalizeOptions(options: UserOptions): Options {
  const linter = options.linter || Linter.EsLint;
  const projectType = ProjectType.Application;
  const name = toFileName(options.name);
  const projectDirectory = options.directory
    ? `${toFileName(options.directory)}/${name}`
    : name;
  const projectName = projectDirectory.replace(new RegExp("/", "g"), "-");
  const projectRoot = `${projectRootDir(projectType)}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(",").map(s => s.trim())
    : [];
  const className = toClassName(options.name);
  const propertyName = toPropertyName(options.name);

  const appDirectory = options.directory
    ? `${toFileName(options.directory)}/${toFileName(options.name)}`
    : toFileName(options.name);


  const appProjectRoot = join(normalize("apps"), appDirectory);
  const dot = ".";

  return {
    ...options,
    linter,
    projectName,
    appDirectory,
    appProjectRoot,
    projectRoot,
    projectDirectory,
    parsedTags,
    className,
    propertyName,
    projectType,
    dot,
    offsetFromRoot: offsetFromRoot(projectRoot)
  };
}
