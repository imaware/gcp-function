import {Options, UserOptions} from "../schema";
import {join, normalize} from "@angular-devkit/core";
import {inspect} from "util";
import {Rule} from "@angular-devkit/schematics";
import {
  generateProjectLint,
  Linter,
  offsetFromRoot,
  projectRootDir,
  ProjectType,
  toClassName,
  toFileName,
  toPropertyName,
  updateWorkspaceInTree
} from "@nrwl/workspace";

export default class ProjectTools {
  userOptions: UserOptions
  options: Options
  project: any
  context: any

  constructor(userOptions, context) {
    this.context = context;
    this.userOptions = userOptions;
    this.options = this.normalizeOptions(userOptions);
    this.project = {
      root: this.options.appProjectRoot,
      sourceRoot: join(this.options.appProjectRoot, "src"),
      projectType: "application",
      prefix: this.options.name,
      schematics: {},
      architect: <any>{}
    };
    return this;
  }

  normalizeOptions(userOptions: UserOptions): Options {
    const linter = userOptions.linter || Linter.EsLint;
    const projectType = ProjectType.Application;
    const name = toFileName(userOptions.name);
    const projectDirectory = userOptions.directory
      ? `${toFileName(userOptions.directory)}/${name}`
      : name;
    const projectName = projectDirectory.replace(new RegExp("/", "g"), "-");
    const projectRoot = `${projectRootDir(projectType)}/${projectDirectory}`;
    const parsedTags = userOptions.tags
      ? userOptions.tags.split(",").map(s => s.trim())
      : [];
    const className = toClassName(userOptions.name);
    const propertyName = toPropertyName(userOptions.name);

    const appDirectory = userOptions.directory
      ? `${toFileName(userOptions.directory)}/${toFileName(userOptions.name)}`
      : toFileName(userOptions.name);


    const appProjectRoot = join(normalize("apps"), appDirectory);
    const dot = ".";

    return {
      ...userOptions,
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

  createCommand(commands: { command: string }[]) {
    return {
      builder: "@nrwl/workspace:run-commands",
      options: {
        commands: commands
      }
    };
  }

  getServeConfig(options = this.options) {
    const commands = [
      {command: `npx @google-cloud/functions-framework --target ${options.propertyName} --source ./dist/apps/${options.name}`}
    ]
    return this.createCommand(commands)
  }

  getDeployConfig(options = this.options) {
    const expr = this.options.trigger;
    let commands = []
    switch (expr) {
      case '--trigger-http':
        commands.push({
          command: `gcloud functions deploy ${options.propertyName} ${options.trigger} --runtime ${options.runtime} --region ${options.region} --env-vars-file ./dist/apps/${options.name}/.production.yaml --source ./dist/apps/${options.name} --max-instances ${options.maxInstances} --allow-unauthenticated`
        })
        break;
      case '--trigger-topic':
        const topic = options.triggerTopic.length ? options.triggerTopic : options.propertyName;
        commands.push({
          command: `gcloud functions deploy ${options.propertyName} ${options.trigger} ${topic} --runtime ${options.runtime} --region ${options.region} --env-vars-file ./dist/apps/${options.name}/.production.yaml --source ./dist/apps/${options.name} --max-instances ${options.maxInstances} --allow-unauthenticated`
        })
        break;
    }


    return this.createCommand(commands)
  }

  getTestConfig(options = this.options) {
    return {
      builder: "@nrwl/jest:jest",
      options: {
        jestConfig: join(options.appProjectRoot, "jest.config.js"),
        tsConfig: join(options.appProjectRoot, "tsconfig.spec.json"),
        passWithNoTests: true
      }
    }
  }

  getBuildConfig(project = this.project, options = this.options) {
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

  getLintConfig(project = this.project) {
    return generateProjectLint(
      normalize(project.root),
      join(normalize(project.root), "tsconfig.app.json"),
      Linter.EsLint
    );

  }

  getProjectArchitect() {
    const expr = this.options.trigger;
    switch (expr) {
      case '--trigger-http':
        this.project.architect.serve = this.getServeConfig();
        break;
      case '--trigger-topic':
        break;
    }

    this.project.architect.build = this.getBuildConfig();
    this.project.architect.deploy = this.getDeployConfig();
    this.project.architect.test = this.getTestConfig();
    this.project.architect.lint = this.getLintConfig();
    return this.project;
  }

  updateWorkspaceJson(options): Rule {
    return updateWorkspaceInTree(workspaceJson => {
      workspaceJson.projects[options.name] = this.getProjectArchitect();
      workspaceJson.defaultProject = workspaceJson.defaultProject || options.name;
      return workspaceJson;
    });
  }

  log(message) {
    this.context.logger.info(inspect(message, false, null));
  }
}
