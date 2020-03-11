const path = require('path');
const fse = require('fs-extra');
const util = require('util');
const WebSocket = require('ws');
const { EventEmitter } = require('events');
const _ = require('lodash');

const pkg = require('./package.json');


module.exports.name = pkg;

const eventEmitter = new EventEmitter();
const isDev = process.env.NODE_ENV === 'development';

const LIVE_UPDATE_EVENT_NAME = 'props_changed';
const DEFAULT_FILE_CACHE_PATH = path.join(process.cwd(), '.sourcebit-nextjs-cache.json');
const DEFAULT_LIVE_UPDATE_PORT = 8088;


function startStaticPropsWatcher({ wsPort }) {
    const wss = new WebSocket.Server({ port: wsPort });

    wss.on('connection', (ws) => {
        console.log('[data-listener] websocket connected');
        ws.on('message', (message) => {
            console.log('[data-listener] websocket received message:', message);
        });
        ws.on('close', () => {
            console.log('[data-listener] websocket disconnected');
        });
        eventEmitter.on(LIVE_UPDATE_EVENT_NAME, () => {
            console.log(`[data-listener] websocket send '${LIVE_UPDATE_EVENT_NAME}'`);
            ws.send(LIVE_UPDATE_EVENT_NAME);
        });
    });
}

function reduceAndTransformData(data, { pageTypes, propsMap }) {
    return {
        props: reducePropsMap(propsMap, data),
        pages: reducePageTypes(pageTypes, data)
    };
}

function reducePageTypes(pageTypes, data) {
    return _.reduce(pageTypes, (accum, pageTypeDef) => {
        const pages = _.filter(data, pageTypeDef.predicate);
        const pathTemplate = pageTypeDef.path || '/{slug}';
        return _.reduce(pages, (accum, page) => {
            let urlPath;
            try {
                urlPath = interpolatePagePath(pathTemplate, page);
            } catch (e) {
                return accum;
            }
            return _.concat(accum, {
                path: urlPath,
                data: page,
                props: reducePropsMap(pageTypeDef.propsMap, data)
            });
        }, accum)
    }, []);
}

function reducePropsMap(propsMap, data) {
    return _.reduce(propsMap, (accum, propDef, propName) => {
        if (_.get(propDef, 'single')) {
            return _.assign({}, accum,  {[propName]: _.find(data, propDef.predicate)});
        } else {
            return _.assign({}, accum,  {[propName]: _.filter(data, propDef.predicate)});
        }
    }, {});
}

function interpolatePagePath(pathTemplate, page) {
    let urlPath = pathTemplate.replace(/{([\s\S]+?)}/g, (match, p1) => {
        const fieldValue = _.get(page, p1);
        if (!fieldValue) {
            throw new Error(`page has no value in field '${p1}', page: ${util.inspect(page, {depth: 0})}`);
        }
        return _.trim(fieldValue, '/');
    });

    if (!_.startsWith(urlPath, '/')) {
        urlPath = '/' + urlPath;
    }

    return urlPath;
}

module.exports.bootstrap = async ({ debug, getPluginContext, log, options, refresh, setPluginContext }) => {

    const cacheFilePath = _.get(options, 'cacheFilePath', DEFAULT_FILE_CACHE_PATH);
    const wsPort = _.get(options, 'liveUpdateWsPort', DEFAULT_LIVE_UPDATE_PORT);
    const liveUpdate = isDev;

    await fse.remove(cacheFilePath);

    if (liveUpdate) {
        startStaticPropsWatcher({ wsPort: wsPort });
    }

};

module.exports.transform = async ({ data, debug, getPluginContext, log, options }) => {

    const cacheFilePath = _.get(options, 'cacheFilePath', DEFAULT_FILE_CACHE_PATH);
    const wsPort = _.get(options, 'liveUpdateWsPort', DEFAULT_LIVE_UPDATE_PORT);
    const liveUpdate = isDev;

    const reduceOptions = _.pick(options, ['pageTypes', 'propsMap']);
    const transformedData = reduceAndTransformData(data.objects, reduceOptions);
    if (liveUpdate) {
        _.set(transformedData, 'props.liveUpdate', liveUpdate);
        _.set(transformedData, 'props.liveUpdateWsPort', wsPort);
        _.set(transformedData, 'props.liveUpdateEventName', LIVE_UPDATE_EVENT_NAME);
    }

    await fse.ensureFile(cacheFilePath);
    await fse.writeJson(cacheFilePath, transformedData);

    if (liveUpdate) {
        eventEmitter.emit(LIVE_UPDATE_EVENT_NAME);
    }

    return data;
};

class SourcebitDataClient {

    constructor() {
        // Every time getStaticPaths is called, the page re-imports all required
        // modules causing this singleton to be reconstructed loosing any in
        // memory cache.
        // https://github.com/zeit/next.js/issues/10933
        console.log('SourcebitDataClient.constructor');
    }

    async getData() {
        console.log('SourcebitDataClient.getData');
        // For now, we are reading the changes from filesystem until re-import
        // of this module will be fixed: https://github.com/zeit/next.js/issues/10933
        // TODO: DEFAULT_FILE_CACHE_PATH won't work if default cache file path
        //   was changed, but also can't access the specified path because
        //   nextjs re-imports the whole module when this method is called
        const cacheFileExists = new Promise((resolve, reject) => {
            const retryDelay = 500;
            const maxNumOfRetries = 10;
            let numOfRetries = 0;
            const checkPathExists = async () => {
                const pathExists = await fse.pathExists(DEFAULT_FILE_CACHE_PATH);
                if (!pathExists && numOfRetries < maxNumOfRetries) {
                    numOfRetries += 1;
                    console.log(`SourcebitDataClient.getData, cache file '${DEFAULT_FILE_CACHE_PATH}' not found, waiting ${retryDelay}ms and retry #${numOfRetries}`);
                    setTimeout(checkPathExists, retryDelay);
                } else if (!pathExists) {
                    reject(new Error(`SourcebitDataClient.getData, cache file '${DEFAULT_FILE_CACHE_PATH}' was not found after ${numOfRetries} retries`));
                } else {
                    resolve();
                }
            };
            checkPathExists();
        });
        return cacheFileExists.then(() => {
            return fse.readJson(DEFAULT_FILE_CACHE_PATH);
        });
    }

    async getStaticPaths() {
        console.log('SourcebitDataClient.getStaticPaths');
        const data = await this.getData();
        return _.map(data.pages, (page) => page.path);
    }

    async getStaticPropsForPageAtPath(pagePath) {
        console.log('SourcebitDataClient.getStaticPropsForPath');
        const data = await this.getData();
        return this.getPropsFromCMSDataForPagePath(data, pagePath);
    }

    getPropsFromCMSDataForPagePath(data, pagePath) {
        const page = _.find(data.pages, {path: pagePath});
        return _.assign(
            {
                path: page.path,
                page: page.data
            },
            data.props,
            page.props
        );
    }
}

const sourcebitDataClient = new SourcebitDataClient();

module.exports.sourcebitDataClient = sourcebitDataClient;
