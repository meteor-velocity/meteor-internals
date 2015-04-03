Package.describe({
  name: 'velocity:meteor-internals',
  summary: 'Exposes internals of Meteor that are useful for Velocity',
  version: '1.1.0_1',
  git: 'https://github.com/meteor-velocity/meteor-internals.git'
});

Package.onUse(function(api) {
  api.export('VelocityMeteorInternals', 'server');
  api.versionsFrom('1.0.2.1');
  api.use('underscore', 'server');
  api.addFiles([
    'main.js',
    'tools/parse-stack.js',
    'tools/buildmessage.js',
    'tools/files.js',
    'tools/server/mini-files.js'
  ], 'server');
});

var fibersVersion;
if (process.platform === "win32") {
  // We have a fork of fibers off of version 1.0.5 that searches farther for
  // the isolate thread. This problem is a result of antivirus programs messing
  // with the thread counts on Windows.
  // Duplicated in dev-bundle-tool-package.js
  fibersVersion = "https://github.com/meteor/node-fibers/tarball/d519f0c5971c33d99c902dad346b817e84bab001";
} else {
  fibersVersion = "1.0.5";
}

Npm.depends({
  'source-map': '0.1.40',
  'source-map-support': '0.2.8',
  'esprima': '1.2.2',
  'fibers': fibersVersion
});
