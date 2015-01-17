// Given a function f, return a "marked" version of f. The mark
// indicates that stack traces should stop just above f. So if you
// mark a user-supplied callback function before calling it, you'll be
// able to show the user just the "user portion" of the stack trace
// (the part inside their own code, and not all of the innards of the
// code that called it).
var markBoundary = function (f) {
  return VelocityMeteorInternals.parseStack.markBottom(f);
};


VelocityMeteorInternals.buildmessage = {
  markBoundary: markBoundary
};
