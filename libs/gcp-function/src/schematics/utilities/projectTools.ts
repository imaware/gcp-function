import { Options, UserOptions } from '../schema';
import { join, normalize } from '@angular-devkit/core';
import { inspect } from 'util';
import { Rule } from '@angular-devkit/schematics';
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
} from '@nrwl/workspace';

export default class ProjectTools {
  userOptions: UserOptions;
  options: Options;
  project: any;
  context: any;

  constructor(userOptions, context) {
    this.context = context;
    this.userOptions = userOptions;
    this.options = this.normalizeOptions(userOptions);
    this.project = {
      root: this.options.appProjectRoot,
      sourceRoot: join(this.options.appProjectRoot, 'src'),
      projectType: 'application',
      prefix: this.options.name,
      schematics: {},
      architect: {} as any
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
    const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
    const projectRoot = `${projectRootDir(projectType)}/${projectDirectory}`;
    const parsedTags = userOptions.tags
      ? userOptions.tags.split(',').map(s => s.trim())
      : [];
    const className = toClassName(userOptions.name);
    const propertyName = toPropertyName(userOptions.name);

    const appDirectory = userOptions.directory
      ? `${toFileName(userOptions.directory)}/${toFileName(userOptions.name)}`
      : toFileName(userOptions.name);

    const appProjectRoot = join(normalize('apps'), appDirectory);
    const dot = '.';

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
      builder: '@nrwl/workspace:run-commands',
      options: {
        commands: commands
      }
    };
  }

  getServeConfig(options = this.options) {
    const commands = [
      {
        command: `npx @google-cloud/functions-framework --target ${options.propertyName} --source ./dist/apps/${options.name}`
      }
    ];
    return this.createCommand(commands);
  }

  getDeployConfig(options = this.options) {
    const expr = this.options.trigger;
    const commands = [];
    let topic: string;
    const serviceAccount = options.serviceAccount
      ? `--service-account ${options.serviceAccount}`
      : '';
    const vpcConnector = options.vpcConnector
      ? `--egress-settings=all --vpc-connector=${options.vpcConnector}`
      : '';
    switch (expr) {
      case '--trigger-http':
        commands.push({
          command: `gcloud functions deploy ${options.projectName}-{args.environment} ${options.trigger} ${serviceAccount} --runtime ${options.runtime} --region ${options.region} ${vpcConnector} --env-vars-file ./dist/apps/${options.name}/.production.yaml --source ./dist/apps/${options.name} --max-instances ${options.maxInstances} --allow-unauthenticated`
        });
        break;
      case '--trigger-topic':
        topic = options.triggerTopic.length
          ? options.triggerTopic
          : options.projectName;
        commands.push({
          command: `gcloud functions deploy ${options.projectName}-{args.environment} ${options.trigger} ${topic} ${serviceAccount} --runtime ${options.runtime} --region ${options.region} ${vpcConnector} --env-vars-file ./dist/apps/${options.name}/.production.yaml --source ./dist/apps/${options.name} --max-instances ${options.maxInstances}`
        });
        break;
    }

    return this.createCommand(commands);
  }

  getTestConfig(options = this.options) {
    return {
      builder: '@nrwl/jest:jest',
      outputs: [`coverage/apps/${options.projectName}`],
      options: {
        jestConfig: join(options.appProjectRoot, 'jest.config.js'),
        passWithNoTests: false
      }
    };
  }

  getBuildConfig(project = this.project, options = this.options) {
    return {
      builder: '@nrwl/workspace:run-commands',
      outputs: ['{options.outputPath}'],
      options: {
        parallel: false,
        commands: [
          {
            command: `shx rm -rf dist/apps/${options.projectName}`
          },
          {
            command: `tsc --project apps/${options.projectName}/tsconfig.app.json`
          },
          {
            command: `shx mkdir -p dist/apps/${options.projectName}/src/environments/ && cp -r apps/${options.projectName}/src/environments/*.yaml dist/apps/${options.projectName}/src/environments/`
          },
          {
            command: `shx cat package.json | jq "del(.devDependencies)" | tee dist/apps/${options.projectName}/src/package.json`
          },
          {
            command: `shx cp yarn.lock dist/apps/${options.projectName}/src/yarn.lock`
          }
        ],
        outputPath: `dist/apps/${options.projectName}`
      },
      configurations: {
        production: {
          optimization: true,
          extractLicenses: true,
          inspect: false,
          fileReplacements: [
            {
              replace: `apps/${options.projectName}/src/environments/environment.ts`,
              with: `apps/${options.projectName}/src/environments/environment.prod.ts`
            }
          ]
        }
      }
    };
  }

  getPackageConfig(project = this.project, options = this.options) {
    return {
      executor: '@nrwl/workspace:run-commands',
      outputs: ['{options.outputPath}'],
      options: {
        parallel: false,
        commands: [
          { command: `rimraf dist/pkg/${options.projectName}.zip` },
          { command: 'shx mkdir -p dist/pkg/' },
          {
            command: `cd dist/apps/${options.projectName}/src && zip -r ../../../../dist/pkg/${options.projectName}.zip *`
          }
        ]
      }
    };
  }

  getLintConfig(project = this.project) {
    const conf = generateProjectLint(
      normalize(project.root),
      join(normalize(project.root), 'tsconfig.app.json'),
      Linter.EsLint
    );
    return {
      ...conf,
      options: {
        ...conf.options,
        lintFilePatterns: [`apps/${this.options.projectName}/**/*.ts`]
      }
    };
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
    this.project.architect.lint = this.getLintConfig();
    this.project.architect.test = this.getTestConfig();
    this.project.architect.build = this.getBuildConfig();
    this.project.architect.deploy = this.getDeployConfig();
    this.project.architect.package = this.getPackageConfig();
    return this.project;
  }

  updateWorkspaceJson(options): Rule {
    return updateWorkspaceInTree(workspaceJson => {
      workspaceJson.projects[options.name] = this.getProjectArchitect();
      workspaceJson.defaultProject =
        workspaceJson.defaultProject || options.name;
      return workspaceJson;
    });
  }

  log(message) {
    this.context.logger.info(inspect(message, false, null));
  }
}
