import {Configuration, BannerPlugin} from "webpack";
import * as mergeWebpack from "webpack-merge";
import * as nodeExternals from "webpack-node-externals";

const CopyPlugin = require('copy-webpack-plugin');

const {CleanWebpackPlugin} = require("clean-webpack-plugin");
import {Options} from "../schema";
import {getBaseWebpackPartial} from "./config";

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
      function (context, request, callback: Function) {
        if (options.externalDependencies.includes(request)) {
          // not bundled
          return callback(null, "commonjs " + request);
        }
        // bundled
        callback();
      }
    ];
  }

  webpackConfig.plugins = [
    new CleanWebpackPlugin(),
    new CopyPlugin([{from: options.yamlConfig, to: options.outputPath}]),
  ];

  return webpackConfig;
}

export function getNodeWebpackConfig(options: Options) {
  return mergeWebpack([
    getBaseWebpackPartial(options),
    getNodePartial(options)
  ]);
}
