/* eslint-env node */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Keep hierarchical lookup ON (false is also Metro's default).
//
// Setting this to true restricts resolution to nodeModulesPaths above and
// stops Metro looking inside a package's own node_modules. That breaks any
// dependency relying on a nested copy to resolve a version conflict — here,
// react-native-reanimated needs semver@7 for "semver/functions/satisfies",
// while the hoisted root copy is semver@6, which has no functions/ directory
// at all. Watching the workspace and listing nodeModulesPaths (1 and 2) is
// what makes the monorepo resolve; this line is only a restriction, and an
// unnecessary one.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
