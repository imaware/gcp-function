import {chain, Rule, SchematicContext, Tree} from "@angular-devkit/schematics";
import {addPackageWithInit, formatFiles} from "@nrwl/workspace";
import {UserOptions} from "../schema";
import ProjectTools from '../utilities/projectTools'
import generateFiles from '../utilities/generateFiles'
import updateNxJson from '../utilities/updateNxJson'

// noinspection JSUnusedGlobalSymbols
export default function (UserOptions: UserOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const tools = new ProjectTools(UserOptions, context);
    const options = tools.options;
    tools.log('Start template creation')

    return chain([
      addPackageWithInit("@nrwl/jest"),
      formatFiles(options),
      generateFiles(options),
      updateNxJson(options),
      tools.updateWorkspaceJson(options)
    ])(tree, context);
  };
}
