import { Configuration, BannerPlugin } from "webpack";
import * as mergeWebpack from "webpack-merge";
import * as nodeExternals from "webpack-node-externals";

const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const GeneratePackageJsonPlugin = require("generate-package-json-webpack-plugin");

import { Options } from "../schema";
import { getBaseWebpackPartial } from "./config";

function getNodePartial(options: Options) {
  const webpackConfig: Configuration = {
    output: {
      libraryTarget: "commonjs"
    },
    target: "node",
    node: false
  };

  if (options.optimization) {
    webpackConfig.optimization = {
      minimize: false,
      concatenateModules: false
    };
  }

  if (options.externalDependencies === "all") {
    webpackConfig.externals = [nodeExternals()];
  } else if (Array.isArray(options.externalDependencies)) {
    webpackConfig.externals = [
      function(context, request, callback: Function) {
        if (options.externalDependencies.includes(request)) {
          // not bundled
          return callback(null, "commonjs " + request);
        }
        // bundled
        callback();
      }
    ];
  }

  const basePackageValues = {
    "name": "my-nodejs-module",
    "version": "1.0.0",
    "main": "./index.js",
    "scripts": {
      "start": "node ./index.js"
    },
    "engines": {
      "node": "<= 6.9.1"
    }
  };

  console.log({
    options,
    externals: webpackConfig.externals,
    externalDependencies: options.externalDependencies
  });
  // add plugins
  webpackConfig.plugins = [
    new CleanWebpackPlugin(),
    // new GeneratePackageJsonPlugin(basePackageValues, options.packageJson)
  ];

  return webpackConfig;
}

export function getNodeWebpackConfig(options: Options) {
  return mergeWebpack([
    getBaseWebpackPartial(options),
    getNodePartial(options)
  ]);
}
