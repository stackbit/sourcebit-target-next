const path = require('path');

module.exports.DEFAULT_FILE_CACHE_PATH = path.join(process.cwd(), '.sourcebit-nextjs-cache.json');
module.exports.DEFAULT_LIVE_UPDATE_PORT = 8088;
module.exports.LIVE_UPDATE_EVENT_NAME = 'props_changed';
module.exports.LIVE_UPDATE_NAMESPACE = '/nextjs-live-updates';
