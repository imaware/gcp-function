import { Tree } from "@angular-devkit/schematics";
import { SchematicTestRunner } from "@angular-devkit/schematics/testing";
import { createEmptyWorkspace } from "@nrwl/workspace/testing";
import { join } from "path";

import { UserOptions } from "./schema";

describe("gcp-function schematic", () => {
  let appTree: Tree;
  const options: UserOptions = { name: "test", skipFormat: true };

  const testRunner = new SchematicTestRunner(
    "@coinsy/gcp-function",
    join(__dirname, "../../../collection.json")
  );

  beforeEach(() => {
    appTree = createEmptyWorkspace(Tree.empty());
  });

  it("should run successfully", async () => {
    await expect(
      testRunner.runSchematicAsync("http", options, appTree).toPromise()
    ).resolves.not.toThrowError();
  });
});
