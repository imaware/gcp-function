import {Rule} from "@angular-devkit/schematics";
import {updateJsonInTree,} from "@nrwl/workspace";
import {Options} from "../schema";

export default function updateNxJson(options: Options): Rule {
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

