const { getOptionsFromSetup, getSetup } = require('./lib/setup');
const { bootstrap, transform } = require('./lib/transform');
const { SourcebitDataClient } = require('./lib/data-client');
const pkg = require('./package.json');

module.exports.name = pkg.name;
module.exports.getOptionsFromSetup = getOptionsFromSetup;
module.exports.getSetup = getSetup;
module.exports.bootstrap = bootstrap;
module.exports.transform = transform;
module.exports.sourcebitDataClient = new SourcebitDataClient();
