const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const posthogCoreRoot = path.dirname(path.dirname(require.resolve("@posthog/core")));
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.assetExts.push("yaml", "yml");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@posthog/core/surveys") {
    return {
      type: "sourceFile",
      filePath: path.join(posthogCoreRoot, "dist/surveys/index.js"),
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
