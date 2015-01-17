# velocity:meteor-internals

## API

The following functions are exposed.

* VelocityMeteorInternals.files.findAppDir
* VelocityMeteorInternals.files.findPackageDir
* VelocityMeteorInternals.files.runJavaScript

# For contributors

## General guidelines

* The version of this package reflects the Meteor version that has been
  used as source.

## Guidelines for adding new functions of Meteor to this package

* Use the same file structure that Meteor use
* Include as few parts of Meteor as possible
* Modify as few code as possible to make it work
  * Don't fix code style issues that exist in the original Meteor code
  * Replace `require` with `Npm.require`
  * Catch exports and expose them under VelocityMeteorInternals
