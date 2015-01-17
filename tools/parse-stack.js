var exports = {};
VelocityMeteorInternals.parseStack = exports;

// Decorator. Mark the point at which a stack trace returned by
// parse() should stop: no frames earlier than this point will be
// included in the parsed stack. Confusingly, in the argot of the
// times, you'd say that frames "higher up" than this or "above" this
// will not be returned, but you'd also say that those frames are "at
// the bottom of the stack". Frames below the bottom are the outer
// context of the framework running the user's code.
exports.markBottom = function (f) {
  return function __bottom_mark__ () {
    return f.apply(this, arguments);
  };
};
