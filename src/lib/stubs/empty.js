// Stands in for Node built-ins (fs, path, module, crypto) that libraries
// reach for only when they run under Node. In the browser they are never
// used; this keeps the bundler from trying to pack them.
module.exports = {};
