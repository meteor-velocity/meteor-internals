Package.describe({
  name: 'velocity:meteor-internals',
  summary: 'Exposes internals of Meteor that are useful for Velocity',
  version: '1.0.2_2',
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
    'tools/files.js'
  ], 'server');
});

Npm.depends({
  'source-map': '0.1.40',
  'source-map-support': '0.2.8',
  'esprima': '1.2.2'
});
