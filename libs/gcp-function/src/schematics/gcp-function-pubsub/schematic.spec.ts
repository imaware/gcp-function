import {
  chain,
  Rule,
  SchematicContext,
  Tree
} from '@angular-devkit/schematics';
import { addPackageWithInit, formatFiles } from '@nrwl/workspace';
import { UserOptions } from '../schema';
import ProjectTools from '../utilities/projectTools';
import generateFiles from '../utilities/generateFiles';
import updateNxJson from '../utilities/updateNxJson';
import { runSchematic } from '../../utils/testing/testing';

import { createEmptyWorkspace } from '@nrwl/workspace/testing';
import { updateWorkspace, readWorkspace, getWorkspace } from '@nrwl/workspace';

describe('NxPlugin gcp-function-pubsub', () => {
  let appTree: Tree;
  beforeEach(() => {
    appTree = createEmptyWorkspace(Tree.empty());
    // add a plugin project to the workspace for validations
    updateWorkspace(workspace => {
      workspace.projects.add({
        name: 'my-gcp-function',
        root: 'libs/gcp-function'
      });
    })(appTree, null);
  });

  it('should validate the plugin name', async () => {
    await expect(
      runSchematic(
        'pubsub',
        {
          name: 'my-gcp-function'
        },
        appTree
      )
    ).resolves.not.toThrow();
  });

  it('should update the nxJson', async () => {
    const tree = await runSchematic(
      'pubsub',
      {
        name: 'my-gcp-function'
      },
      appTree
    );
    expect(JSON.parse(tree.readContent('nx.json'))).toMatchObject({
      projects: {
        'my-gcp-function': {
          tags: []
        }
      }
    });
  });

  it('should update the workspace Json', async () => {
    const tree = await runSchematic(
      'pubsub',
      {
        name: 'my-gcp-function'
      },
      appTree
    );
    expect(JSON.parse(tree.readContent('workspace.json'))).toMatchObject({
      projects: {
        'my-gcp-function': {
          architect: {
            build: {
              builder: '@nrwl/workspace:run-commands',
              configurations: {
                production: {
                  extractLicenses: true,
                  fileReplacements: [
                    {
                      replace:
                        'apps/my-gcp-function/src/environments/environment.ts',
                      with:
                        'apps/my-gcp-function/src/environments/environment.prod.ts'
                    }
                  ],
                  inspect: false,
                  optimization: true
                }
              },
              options: {
                commands: [
                  {
                    command: 'shx rm -rf dist/apps/my-gcp-function'
                  },
                  {
                    command:
                      'tsc --project apps/my-gcp-function/tsconfig.app.json'
                  },
                  {
                    command:
                      'shx mkdir -p dist/apps/my-gcp-function/src/environments/ && cp -r apps/my-gcp-function/src/environments/*.yaml dist/apps/my-gcp-function/src/environments/'
                  },
                  {
                    command:
                      'shx cat package.json | jq "del(.devDependencies)" | tee dist/apps/my-gcp-function/src/package.json'
                  },
                  {
                    command:
                      'shx cp yarn.lock dist/apps/my-gcp-function/src/yarn.lock'
                  }
                ],
                outputPath: 'dist/apps/my-gcp-function',
                parallel: false
              },
              outputs: ['{options.outputPath}']
            },
            deploy: {
              builder: '@nrwl/workspace:run-commands',
              options: {
                commands: [
                  {
                    command:
                      'gcloud functions deploy my-gcp-function-{args.environment} --trigger-topic my-gcp-function  --runtime nodejs10 --region us-central1  --env-vars-file ./dist/apps/my-gcp-function/.production.yaml --source ./dist/apps/my-gcp-function --max-instances 10'
                  }
                ]
              }
            },
            package: {
              executor: '@nrwl/workspace:run-commands',
              options: {
                commands: [
                  {
                    command: 'rimraf dist/pkg/my-gcp-function.zip'
                  },
                  {
                    command: 'shx mkdir -p dist/pkg/'
                  },
                  {
                    command:
                      'cd dist/apps/my-gcp-function/src && zip -r ../../../../dist/pkg/my-gcp-function.zip *'
                  }
                ],
                parallel: false
              },
              outputs: ['{options.outputPath}']
            },
            lint: {
              builder: '@nrwl/linter:lint',
              options: {
                config: 'apps/my-gcp-function/.eslintrc',
                exclude: ['**/node_modules/**', '!apps/my-gcp-function/**'],
                lintFilePatterns: ['apps/my-gcp-function/**/*.ts'],
                linter: 'eslint',
                tsConfig: ['apps/my-gcp-function/tsconfig.app.json']
              }
            },
            test: {
              builder: '@nrwl/jest:jest',
              options: {
                jestConfig: 'apps/my-gcp-function/jest.config.js',
                passWithNoTests: false
              },
              outputs: ['coverage/apps/my-gcp-function']
            }
          },
          prefix: 'my-gcp-function',
          projectType: 'application',
          root: 'apps/my-gcp-function',
          schematics: {},
          sourceRoot: 'apps/my-gcp-function/src'
        }
      }
    });
  });
});
