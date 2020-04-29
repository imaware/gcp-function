const fs = require("fs");
import {writeToFile, fileExists, readJsonFile, writeJsonFile} from "@nrwl/workspace/src/utils/fileutils";
import {join, resolve} from "path";

import {Options} from "./schema";
import {BuilderContext, createBuilder} from "@angular-devkit/architect";
import {JsonObject, workspaces} from "@angular-devkit/core";
import {BuildResult, runWebpack} from "@angular-devkit/build-webpack";
import {from, Observable} from "rxjs";
import {concatMap, map} from "rxjs/operators";
import {getNodeWebpackConfig} from "./utilities/node.config";
import {OUT_FILENAME} from "./utilities/config";
import {normalizeBuildOptions} from "./utilities/normalize";
import {NodeJsSyncHost} from "@angular-devkit/core/node";
import {createProjectGraph} from "@nrwl/workspace/src/core/project-graph";
import {createTmpTsConfig} from "@nrwl/workspace/src/utils/buildable-libs-utils";
import {calculateProjectDependencies} from "./utilities/buildable-libs-utils";

try {
  require("dotenv").config();
} catch (e) {
}

export type NodeBuildEvent = BuildResult & {
  outfile: string;
};

export default createBuilder(run);

async function getSourceRoot(context: BuilderContext) {
  const workspaceHost = workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const {workspace} = await workspaces.readWorkspace(
    context.workspaceRoot,
    workspaceHost
  );
  if (workspace.projects.get(context.target.project).sourceRoot) {
    return workspace.projects.get(context.target.project).sourceRoot;
  } else {
    context.reportStatus("Error");
    const message = `${context.target.project} does not have a sourceRoot. Please define one.`;
    context.logger.error(message);
    throw new Error(message);
  }
}

function run(options: JsonObject & Options, context: BuilderContext): Observable<NodeBuildEvent> {
  if (!options.buildLibsFromSource) {
    const projGraph = createProjectGraph();
    const {target, dependencies} = calculateProjectDependencies(
      projGraph,
      context
    );
    options.tsConfig = createTmpTsConfig(
      options.tsConfig,
      context.workspaceRoot,
      target.data.root,
      dependencies
    );
  }

  return from(getSourceRoot(context))
    .pipe(
      map(sourceRoot => normalizeBuildOptions(options, context.workspaceRoot, sourceRoot)),
      map(options => {
        let config = getNodeWebpackConfig(options);
        if (options.webpackConfig) {
          config = require(options.webpackConfig)(config, {
            options,
            configuration: context.target.configuration
          });
        }
        return config;
      }),
      concatMap(config => runWebpack(config, context, {
        logging: stats => {
          context.logger.info(stats.toString(config.stats));
        },
        webpackFactory: require("webpack")
      })),
      map((buildEvent: BuildResult) => {
        const api = new WorkspaceConfiguration(options, context);
        api.createPackageJson();
        api.addPackageJsonToDist();
        api.updateTsConfig();
        api.updateJestConfig();
        api.createEsLint();

        return buildEvent;
      }),
      map((buildEvent: BuildResult) => {
        buildEvent.outfile = resolve(
          context.workspaceRoot,
          options.outputPath,
          OUT_FILENAME
        );
        return buildEvent as NodeBuildEvent;
      })
    );
}

class WorkspaceConfiguration {
  options: Options;
  context: BuilderContext;
  packageJson: {
    main: string
    name?: string
    version?: string
    private: true
    dependencies?: { [key: string]: string }
  } = {
    main: "./main.js",
    private: true,
  };
  tsConfig: any = {
    "lib": ["es2017"],
    "module": "commonjs",
    "noImplicitReturns": true,
    "sourceMap": true,
    "target": "es2017",
    "esModuleInterop": true // help with jest test
  };
  jestConfig: string = `
module.exports = {
    testMatch: ['**/+(*.)+(spec|test).+(ts|js)?(x)'],
    transform: {
      '^.+\\\\.(ts|js|html)$': 'ts-jest'
    },
    resolver: '@nrwl/jest/plugins/resolver',
    moduleFileExtensions: ['ts', 'js', 'html'],
    coverageReporters: ['html']
  };
`;
  globalEsLint: any = {
    "root": true,
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
      "ecmaVersion": 2018,
      "sourceType": "module",
      "project": "./tsconfig.json"
    },
    "ignorePatterns": ["**/*"],
    "plugins": ["@typescript-eslint", "@nrwl/nx"],
    "extends": [
      "eslint:recommended",
      "plugin:@typescript-eslint/eslint-recommended",
      "plugin:@typescript-eslint/recommended",
      "prettier",
      "prettier/@typescript-eslint"
    ],
    "rules": {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/explicit-member-accessibility": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-parameter-properties": "off",
      "@nrwl/nx/enforce-module-boundaries": [
        "error",
        {
          "enforceBuildableLibDependency": true,
          "allow": [],
          "depConstraints": [
            {"sourceTag": "*", "onlyDependOnLibsWithTags": ["*"]}
          ]
        }
      ]
    },
    "overrides": [
      {
        "files": ["*.tsx"],
        "rules": {
          "@typescript-eslint/no-explicit-any": "off",
          "@typescript-eslint/no-unused-vars": "off"
        }
      }
    ]
  };

  constructor(options, context) {
    this.options = options;
    this.context = context;
  }

  getExternalDependencies(options = this.options, context = this.context) {
    let dependencies = {};
    const buildFile = fs.readFileSync(`${options.outputPath}/main.js`, "utf8");
    let re2 = /"(.*)"/gm;
    const externalDependencies = buildFile.match(/require\("(.*)"\)/gm);

    // Get the package version from the root
    if (externalDependencies) {
      const workspacePackages = readJsonFile(join(context.workspaceRoot, "package.json"));
      const dependenciesName = externalDependencies.map((x) => x.match(re2)[0].replace(/"/gm, ""));
      dependenciesName.forEach((dep) => {
        const packageIsDefined = dep in workspacePackages.dependencies;
        dependencies[dep] = packageIsDefined ? workspacePackages.dependencies[dep]
          : "*";
      });
    }

    return {
      dependencies,
      exist: Boolean(exports)
    };
  }

  getPackageJson(options = this.options, context = this.context) {
    const exists = fileExists(options.packageJson);
    return exists ? {data: readJsonFile(options.packageJson), exist: true} : {exist: false}
  }

  createPackageJson(): void {
    const externalDependencies = this.getExternalDependencies();
    const originalPackageJson = this.getPackageJson();

    if (externalDependencies.exist) {
      this.packageJson.dependencies = externalDependencies.dependencies;
    }

    if (originalPackageJson.exist) {
      const {name, version} = originalPackageJson.data;

      this.packageJson.name = name || '';
      this.packageJson.version = version || '';

    }
  }

  addPackageJsonToDist(options = this.options, packageJson = this.packageJson): void {
    writeJsonFile(`${options.outputPath}/package.json`, packageJson);
  }

  updateTsConfig(options = this.options, context = this.context) {
    if (options.setRootTsConfig) {
      const path = join(context.workspaceRoot, "tsconfig.json");
      const tsConfigExist = fileExists(path);

      if (tsConfigExist) {
        const original = readJsonFile(path);

        for (const prop in this.tsConfig) {
          if (this.tsConfig.hasOwnProperty(prop)) {
            original.compilerOptions[prop] = this.tsConfig[prop];
          }
        }

        writeJsonFile(path, original);
      } else {
        writeJsonFile(path, this.tsConfig);
      }
    }
  }

  updateJestConfig(options = this.options, context = this.context) {
    if (options.setRootJestConfig) {
      const path = join(context.workspaceRoot, "jest.config.json");
      const jestConfigExist = fileExists(path);
      if (jestConfigExist) {
        writeToFile(path, this.jestConfig);

      }
    }
  }

  createEsLint(options = this.options, context = this.context) {
    if (options.setRootEsLint) {
      const path = join(context.workspaceRoot, ".eslintrc");
      const requireNewFile = !fileExists(path);
      if (requireNewFile) {
        writeJsonFile(path, this.globalEsLint);
      }
    }
  }
}
