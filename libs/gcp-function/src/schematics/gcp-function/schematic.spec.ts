import { Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { createEmptyWorkspace } from '@nrwl/workspace/testing';
import { join } from 'path';

import { GcpFunctionSchematicSchema } from './schema';

describe('gcp-function schematic', () => {
  let appTree: Tree;
  const options: GcpFunctionSchematicSchema = { name: 'test' };

  const testRunner = new SchematicTestRunner(
    '@joelcode/gcp-function',
    join(__dirname, '../../../collection.json')
  );

  beforeEach(() => {
    appTree = createEmptyWorkspace(Tree.empty());
  });

  it('should run successfully', async () => {
    await expect(
      testRunner.runSchematicAsync('gcpFunction', options, appTree).toPromise()
    ).resolves.not.toThrowError();
  });
});
