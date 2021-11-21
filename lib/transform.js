const fse = require('fs-extra');
const slugify = require('@sindresorhus/slugify');
const util = require('util');
const http = require('http');
const socketIO = require('socket.io');
const _ = require('lodash');
const { EventEmitter } = require('events');

const { DEFAULT_FILE_CACHE_PATH } = require('./consts');

const eventEmitter = new EventEmitter();
const isDev = process.env.NODE_ENV === 'development';
const LIVE_UPDATE_EVENT_NAME = 'props_changed';
const DEFAULT_LIVE_UPDATE_PORT = 8088;


module.exports.bootstrap = async ({ debug, getPluginContext, log, options, refresh, setPluginContext }) => {
    const cacheFilePath = _.get(options, 'cacheFilePath', DEFAULT_FILE_CACHE_PATH);
    const liveUpdatePort = _.get(options, 'liveUpdatePort', DEFAULT_LIVE_UPDATE_PORT);
    const liveUpdate = _.get(options, 'liveUpdate', isDev);

    await fse.remove(cacheFilePath);

    if (liveUpdate) {
        startStaticPropsWatcher({ port: liveUpdatePort });
    }
};

module.exports.transform = async ({ data, debug, getPluginContext, log, options }) => {
    const cacheFilePath = _.get(options, 'cacheFilePath', DEFAULT_FILE_CACHE_PATH);
    // allow configuring different socket.io port for client, useful if the socket can be
    // proxied through same webserver that serves nest.js app
    const liveUpdatePort = _.get(options, 'liveUpdateClientPort', _.get(options, 'liveUpdatePort', DEFAULT_LIVE_UPDATE_PORT));
    const liveUpdate = _.get(options, 'liveUpdate', isDev);

    const reduceOptions = _.pick(options, ['commonProps', 'pages', 'flattenAssetUrls']);
    const transformedData = reduceAndTransformData(data.objects, reduceOptions);

    if (liveUpdate) {
        _.set(transformedData, 'props.liveUpdate', liveUpdate);
        _.set(transformedData, 'props.liveUpdatePort', liveUpdatePort);
        _.set(transformedData, 'props.liveUpdateEventName', LIVE_UPDATE_EVENT_NAME);
    }

    await fse.ensureFile(cacheFilePath);
    await fse.writeJson(cacheFilePath, transformedData);

    if (liveUpdate) {
        eventEmitter.emit(LIVE_UPDATE_EVENT_NAME);
    }

    return data;
};

function startStaticPropsWatcher({ port }) {
    console.log(`[data-listener] create socket.io on port ${port} with namespace '/nextjs-live-updates'`);
    const server = http.createServer();
    const io = socketIO();
    io.attach(server, {
        allowEIO3: true,
        cors: {
            origin: true
        }
    });
    server.on('error', (err) => {
        console.error('[data-listener] server error', { err })
    });
    server.listen(port);
    const liveUpdatesIO = io.of('/nextjs-live-updates');
    liveUpdatesIO.on('connection', (socket) => {
        socket.on('disconnect', () => {
            console.log(`[data-listener] socket.io disconnected, socket.id: '${socket.id}'`);
        });

        socket.on('hello', () => {
            console.log(`[data-listener] socket.io received 'hello', send 'hello' back, socket.id: '${socket.id}'`);
            socket.emit('hello');
        });

        console.log(`[data-listener] socket.io connected, socket.id: '${socket.id}'`);
    });
    eventEmitter.on(LIVE_UPDATE_EVENT_NAME, () => {
        console.log(`[data-listener] got live update, socket.io send '${LIVE_UPDATE_EVENT_NAME}'`);
        liveUpdatesIO.emit(LIVE_UPDATE_EVENT_NAME);
    });
}

function reduceAndTransformData(objects, { commonProps, pages, flattenAssetUrls }) {
    if (flattenAssetUrls) {
        objects = mapDeep(objects, (value, keyPath) => {
            // first level objects can be asset objects themselves, don't override them
            if (keyPath.length > 1 && _.get(value, '__metadata.modelName') === '__asset' && _.has(value, 'url')) {
                return value.url;
            }
            return value;
        });
    }
    return {
        objects: objects,
        props: reducePropsMap(commonProps, objects),
        pages: reducePages(pages, objects)
    };
}

function mapDeep(value, iteratee, options, _keyPath, _objectStack) {
    let iterate;
    if (_.isPlainObject(value) || _.isArray(value)) {
        iterate = _.get(options, 'iterateCollections', true);
    } else {
        iterate = _.get(options, 'iterateScalars', true);
    }
    _keyPath = _keyPath || [];
    _objectStack = _objectStack || [];
    if (iterate) {
        value = iteratee(value, _keyPath, _objectStack);
    }
    if (_.isPlainObject(value)) {
        value = _.mapValues(value, (val, key) => {
            return mapDeep(val, iteratee, options, _.concat(_keyPath, key), _.concat(_objectStack, value));
        });
    } else if (_.isArray(value)) {
        value = _.map(value, (val, key) => {
            return mapDeep(val, iteratee, options, _.concat(_keyPath, key), _.concat(_objectStack, value));
        });
    }
    return value;
}

function reducePages(pages, objects) {
    if (typeof pages === 'function') {
        const pageObjects = pages(objects, { slugify });

        return _.reduce(
            pageObjects,
            (accum, item) => {
                if (!item.path) {
                    return _.concat(accum, item);
                }
                let urlPath;
                try {
                    urlPath = interpolatePagePath(item.path, item.page);
                } catch (e) {
                    return _.concat(accum, item);
                }
                return _.concat(accum, _.assign(item, { path: urlPath }));
            },
            []
        );
    }

    return _.reduce(
        pages,
        (accum, pageTypeDef) => {
            const pages = _.filter(objects, pageTypeDef.predicate);
            const pathTemplate = pageTypeDef.path || '/{slug}';
            return _.reduce(
                pages,
                (accum, page) => {
                    let urlPath;
                    try {
                        urlPath = interpolatePagePath(pathTemplate, page);
                    } catch (e) {
                        return accum;
                    }
                    return _.concat(accum, {
                        path: urlPath,
                        page: page,
                        ...reducePropsMap(pageTypeDef.props, objects)
                    });
                },
                accum
            );
        },
        []
    );
}

function reducePropsMap(propsMap, objects) {
    if (typeof propsMap === 'function') {
        return propsMap(objects, { slugify });
    }

    return _.reduce(
        propsMap,
        (accum, propDef, propName) => {
            if (_.get(propDef, 'single')) {
                return _.assign({}, accum, { [propName]: _.find(objects, propDef.predicate) });
            } else {
                return _.assign({}, accum, { [propName]: _.filter(objects, propDef.predicate) });
            }
        },
        {}
    );
}

function interpolatePagePath(pathTemplate, page) {
    let urlPath = pathTemplate.replace(/{([\s\S]+?)}/g, (match, p1) => {
        const fieldValue = _.get(page, p1);
        if (!fieldValue) {
            throw new Error(`page has no value in field '${p1}', page: ${util.inspect(page, { depth: 0 })}`);
        }
        return _.trim(fieldValue, '/');
    });

    urlPath = '/' + _.trim(urlPath, '/');
    return urlPath;
}
