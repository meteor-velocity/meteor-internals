/**
 * Copied from Meteor tools/files.js.
 *
 * Includes:
 * - Helper to find the app root path
 * - Helper to run JavaScript
 */

///
/// utility functions for files and directories. includes both generic
/// helper functions (such as rm_recursive), and meteor-specific ones
/// (such as testing whether an directory is a meteor app)
///

var fs = Npm.require("fs");
var path = Npm.require('path');
var Fiber = Npm.require('fibers');
var sourcemap = Npm.require('source-map');
var sourcemap_support = Npm.require('source-map-support');

var files = {};
VelocityMeteorInternals.files = files;

var parsedSourceMaps = {};
var nextStackFilenameCounter = 1;
var retrieveSourceMap = function (pathForSourceMap) {
  if (_.has(parsedSourceMaps, pathForSourceMap))
    return {map: parsedSourceMaps[pathForSourceMap]};
  return null;
};

sourcemap_support.install({
  // Use the source maps specified to runJavaScript instead of parsing source
  // code for them.
  retrieveSourceMap: retrieveSourceMap,
  // For now, don't fix the source line in uncaught exceptions, because we
  // haven't fixed handleUncaughtExceptions in source-map-support to properly
  // locate the source files.
  handleUncaughtExceptions: false
});

// given a predicate function and a starting path, traverse upwards
// from the path until we find a path that satisfies the predicate.
//
// returns either the path to the lowest level directory that passed
// the test or null for none found. if starting path isn't given, use
// cwd.
var findUpwards = function (predicate, startPath) {
  var testDir = startPath || files.cwd();
  while (testDir) {
    if (predicate(testDir)) {
      break;
    }
    var newDir = files.pathDirname(testDir);
    if (newDir === testDir) {
      testDir = null;
    } else {
      testDir = newDir;
    }
  }
  if (!testDir)
    return null;

  return testDir;
};

files.cwd = function () {
  return files.convertToStandardPath(process.cwd());
};

// Determine if 'filepath' (a path, or omit for cwd) is within an app
// directory. If so, return the top-level app directory.
files.findAppDir = function (filepath) {
  var isAppDir = function (filepath) {
    // XXX once we are done with the transition to engine, this should
    // change to: `return files.exists(path.join(filepath, '.meteor',
    // 'release'))`

    // .meteor/packages can be a directory, if .meteor is a warehouse
    // directory.  since installing meteor initializes a warehouse at
    // $HOME/.meteor, we want to make sure your home directory (and all
    // subdirectories therein) don't count as being within a meteor app.
    try { // use try/catch to avoid the additional syscall to files.exists
      return files.stat(
        files.pathJoin(filepath, '.meteor', 'packages')).isFile();
    } catch (e) {
      return false;
    }
  };

  return findUpwards(isAppDir, filepath);
};

files.findPackageDir = function (filepath) {
  var isPackageDir = function (filepath) {
    try {
      return files.stat(files.pathJoin(filepath, 'package.js')).isFile();
    } catch (e) {
      return false;
    }
  };

  return findUpwards(isPackageDir, filepath);
};

// Return the result of evaluating `code` using
// `runInThisContext`. `code` will be wrapped in a closure. You can
// pass additional values to bind in the closure in `options.symbols`,
// the keys being the symbols to bind and the values being their
// values. `options.filename` is the filename to use in exceptions
// that come from inside this code. `options.sourceMap` is an optional
// source map that represents the file.
//
// The really special thing about this function is that if a parse
// error occurs, we will raise an exception of type
// files.FancySyntaxError, from which you may read 'message', 'file',
// 'line', and 'column' attributes ... v8 is normally reluctant to
// reveal this information but will write it to stderr if you pass it
// an undocumented flag. Unforunately though node doesn't have dup2 so
// we can't intercept the write. So instead we use a completely
// different parser with a better error handling API. Ah well.  The
// underlying V8 issue is:
//   https://code.google.com/p/v8/issues/detail?id=1281
files.runJavaScript = function (code, options) {
  if (typeof code !== 'string')
    throw new Error("code must be a string");

  options = options || {};
  var filename = options.filename || "<anonymous>";
  var keys = [], values = [];
  // don't assume that _.keys and _.values are guaranteed to
  // enumerate in the same order
  _.each(options.symbols, function (value, name) {
    keys.push(name);
    values.push(value);
  });

  var stackFilename = filename;
  if (options.sourceMap) {
    // We want to generate an arbitrary filename that we use to associate the
    // file with its source map.
    stackFilename = "<runJavaScript-" + nextStackFilenameCounter++ + ">";
  }

  var chunks = [];
  var header = "(function(" + keys.join(',') + "){";
  chunks.push(header);
  if (options.sourceMap) {
    var consumer = new sourcemap.SourceMapConsumer(options.sourceMap);
    chunks.push(sourcemap.SourceNode.fromStringWithSourceMap(
      code, consumer));
  } else {
    chunks.push(code);
  }
  // \n is necessary in case final line is a //-comment
  chunks.push("\n})");

  var wrapped;
  var parsedSourceMap = null;
  if (options.sourceMap) {
    var node = new sourcemap.SourceNode(null, null, null, chunks);
    var results = node.toStringWithSourceMap({
      file: stackFilename
    });
    wrapped = results.code;
    parsedSourceMap = results.map.toJSON();
    if (options.sourceMapRoot) {
      // Add the specified root to any root that may be in the file.
      parsedSourceMap.sourceRoot = files.pathJoin(
        options.sourceMapRoot, parsedSourceMap.sourceRoot || '');
    }
    // source-map-support doesn't ever look at the sourcesContent field, so
    // there's no point in keeping it in memory.
    delete parsedSourceMap.sourcesContent;
    parsedSourceMaps[stackFilename] = parsedSourceMap;
  } else {
    wrapped = chunks.join('');
  };

  try {
    // See #runInThisContext
    //
    // XXX it'd be nice to runInNewContext so that the code can't mess
    // with our globals, but objects that come out of runInNewContext
    // have bizarro antimatter prototype chains and break 'instanceof
    // Array'. for now, steer clear
    //
    // Pass 'true' as third argument if we want the parse error on
    // stderr (which we don't).
    var script = Npm.require('vm').createScript(wrapped, stackFilename);
  } catch (nodeParseError) {
    if (!(nodeParseError instanceof SyntaxError))
      throw nodeParseError;
    // Got a parse error. Unfortunately, we can't actually get the
    // location of the parse error from the SyntaxError; Node has some
    // hacky support for displaying it over stderr if you pass an
    // undocumented third argument to stackFilename, but that's not
    // what we want. See
    //    https://github.com/joyent/node/issues/3452
    // for more information. One thing to try (and in fact, what an
    // early version of this function did) is to actually fork a new
    // node to run the code and parse its output. We instead run an
    // entirely different JS parser, from the esprima project, but
    // which at least has a nice API for reporting errors.
    var esprima = Npm.require('esprima');
    try {
      esprima.parse(wrapped);
    } catch (esprimaParseError) {
      // Is this actually an Esprima syntax error?
      if (!('index' in esprimaParseError &&
        'lineNumber' in esprimaParseError &&
        'column' in esprimaParseError &&
        'description' in esprimaParseError)) {
        throw esprimaParseError;
      }
      var err = new files.FancySyntaxError;

      err.message = esprimaParseError.description;

      if (parsedSourceMap) {
        // XXX this duplicates code in computeGlobalReferences
        var consumer2 = new sourcemap.SourceMapConsumer(parsedSourceMap);
        var original = consumer2.originalPositionFor({
          line: esprimaParseError.lineNumber,
          column: esprimaParseError.column - 1
        });
        if (original.source) {
          err.file = original.source;
          err.line = original.line;
          err.column = original.column + 1;
          throw err;
        }
      }

      err.file = filename;  // *not* stackFilename
      err.line = esprimaParseError.lineNumber;
      err.column = esprimaParseError.column;
      // adjust errors on line 1 to account for our header
      if (err.line === 1) {
        err.column -= header.length;
      }
      throw err;
    }

    // What? Node thought that this was a parse error and esprima didn't? Eh,
    // just throw Node's error and don't care too much about the line numbers
    // being right.
    throw nodeParseError;
  }

  var func = script.runInThisContext();

  return (VelocityMeteorInternals.buildmessage.markBoundary(func)).apply(null, values);
};

// - message: an error message from the parser
// - file: filename
// - line: 1-based
// - column: 1-based
files.FancySyntaxError = function () {};

// Summary of cross platform file system handling strategy

// There are three main pain points for handling files on Windows: slashes in
// paths, line endings in text files, and colons/invalid characters in paths.

// 1. Slashes in file paths

//   We have decided to store all paths inside the tool as unix-style paths in
//   the style of CYGWIN. This means that all paths have forward slashes on all
//   platforms, and C:\ is converted to /c/ on Windows.

//   All of the methods in files.js know how to convert from these unixy paths
//   to whatever type of path the underlying system prefers.

//   The reason we chose this strategy because it was easier to make sure to use
//   files.js everywhere instead of node's fs than to make sure every part of
//   the tool correctly uses system-specific path separators. In addition, there
//   are some parts of the tool where it is very hard to tell which strings are
//   used as URLs and which are used as file paths. In some cases, a string can
//   be used as both, meaning it has to have forward slashes no matter what.

// 2. Line endings in text files

//   We have decided to convert all files read by the tool to Unix-style line
//   endings for the same reasons as slashes above. In many parts of the tool,
//   we assume that '\n' is the line separator, and it can be hard to find all
//   of the places and decide whether it is appropriate to use os.EOL. We do not
//   convert anything on write. We will wait and see if anyone complains.

// 3. Colons and other invalid characters in file paths

//   This is not handled automatically by files.js. You need to be careful to
//   escape any colons in package names, etc, before using a string as a file
//   path.

//   A helpful file to import for this purpose is colon-converter.js, which also
//   knows how to convert various configuration file formats.

/**
 * Wrap a function from node's fs module to use the right slashes for this OS
 * and run in a fiber, then assign it to the "files" namespace. Each call
 * creates a files.func that runs asynchronously with Fibers (yielding and
 * until the call is done), unless run outside a Fiber or in noYieldsAllowed, in
 * which case it uses fs.funcSync.
 *
 * @param  {String} fsFuncName         The name of the node fs function to wrap
 * @param  {Number[]} pathArgIndices Indices of arguments that have paths, these
 * arguments will be converted to the correct OS slashes
 * @param  {Object} options        Some options for lesser-used cases
 * @param {Boolean} options.noErr If true, the callback of the wrapped function
 * doesn't have a first "error" argument, for example in fs.exists.
 * @param {Function} options.modifyReturnValue Pass in a function to modify the
 * return value
 */
function wrapFsFunc(fsFuncName, pathArgIndices, options) {
  options = options || {};

  var fsFunc = fs[fsFuncName];
  var fsFuncSync = fs[fsFuncName + "Sync"];

  function wrapper() {
    var argc = arguments.length;
    var args = new Array(argc);
    for (var i = 0; i < argc; ++i) {
      args[i] = arguments[i];
    }

    for (var j = pathArgIndices.length - 1; j >= 0; --j) {
      i = pathArgIndices[j];
      args[i] = files.convertToOSPath(args[i]);
    }

    if (Fiber.current &&
      Fiber.yield && ! Fiber.yield.disallowed) {
      var fut = new Future;

      args.push(function callback(err, value) {
        if (options.noErr) {
          fut.return(err);
        } else if (err) {
          fut.throw(err);
        } else {
          fut.return(value);
        }
      });

      fsFunc.apply(fs, args);

      var result = fut.wait();
      return options.modifyReturnValue
        ? options.modifyReturnValue(result)
        : result;
    }

    // If we're not in a Fiber, run the sync version of the fs.* method.
    var result = fsFuncSync.apply(fs, args);
    return options.modifyReturnValue
      ? options.modifyReturnValue(result)
      : result;
  }

  wrapper.displayName = fsFuncName;
  return files[fsFuncName] = wrapper;
}

wrapFsFunc("writeFile", [0]);
wrapFsFunc("appendFile", [0]);
wrapFsFunc("readFile", [0], {
  modifyReturnValue: function (fileData) {
    if (_.isString(fileData)) {
      return files.convertToStandardLineEndings(fileData);
    }

    return fileData;
  }
});
wrapFsFunc("stat", [0]);
wrapFsFunc("lstat", [0]);
wrapFsFunc("exists", [0], {noErr: true});
wrapFsFunc("rename", [0, 1]);

if (process.platform === "win32") {
  var rename = files.rename;

  files.rename = function (from, to) {
    // retries are necessarily only on Windows, because the rename call can fail
    // with EBUSY, which means the file is "busy"
    var maxTries = 10;
    var success = false;
    while (! success && maxTries-- > 0) {
      try {
        rename(from, to);
        success = true;
      } catch (err) {
        if (err.code !== 'EPERM')
          throw err;
      }
    }
    if (! success) {
      files.cp_r(from, to);
      files.rm_recursive(from);
    }
  };
}

// Warning: doesn't convert slashes in the second 'cache' arg
wrapFsFunc("realpath", [0], {
  modifyReturnValue: files.convertToStandardPath
});

wrapFsFunc("readdir", [0], {
  modifyReturnValue: function (entries) {
    return _.map(entries, files.convertToStandardPath);
  }
});

wrapFsFunc("rmdir", [0]);
wrapFsFunc("mkdir", [0]);
wrapFsFunc("unlink", [0]);
wrapFsFunc("chmod", [0]);
wrapFsFunc("open", [0]);

// XXX this doesn't give you the second argument to the callback
wrapFsFunc("read", []);
wrapFsFunc("write", []);
wrapFsFunc("close", []);
wrapFsFunc("symlink", [0, 1]);
wrapFsFunc("readlink", [0]);

// These don't need to be Fiberized
files.createReadStream = function () {
  var args = _.toArray(arguments);
  args[0] = files.convertToOSPath(args[0]);
  return fs.createReadStream.apply(fs, args);
};

files.createWriteStream = function () {
  var args = _.toArray(arguments);
  args[0] = files.convertToOSPath(args[0]);
  return fs.createWriteStream.apply(fs, args);
};

files.watchFile = function () {
  var args = _.toArray(arguments);
  args[0] = files.convertToOSPath(args[0]);
  return fs.watchFile.apply(fs, args);
};

files.unwatchFile = function () {
  var args = _.toArray(arguments);
  args[0] = files.convertToOSPath(args[0]);
  return fs.unwatchFile.apply(fs, args);
};
