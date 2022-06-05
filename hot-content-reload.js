const React = require('react');
const { withRouter } = require('next/router');
const io = require('socket.io-client');
const { DEFAULT_LIVE_UPDATE_PORT, LIVE_UPDATE_EVENT_NAME, LIVE_UPDATE_NAMESPACE } = require('./lib/client-consts');

module.exports.hotContentReload = function hotContentReload({
    disable = false,
    port = DEFAULT_LIVE_UPDATE_PORT,
    namespace = LIVE_UPDATE_NAMESPACE,
    eventName = LIVE_UPDATE_EVENT_NAME
} = {}) {
    return function withHotContentReload(WrappedComponent) {
        if (disable) {
            return WrappedComponent;
        }

        class Component extends React.Component {
            componentDidMount() {
                const portStr = process.env.NEXT_PUBLIC_HOT_RELOAD_CLIENT_PORT ?? (port ? String(port) : location.port);
                namespace = process.env.NEXT_PUBLIC_HOT_RELOAD_PATH ?? namespace;
                eventName = process.env.NEXT_PUBLIC_HOT_RELOAD_EVENT_NAME ?? eventName;

                this.socket = io(`${location.protocol}//${location.hostname}${prefixPort(portStr)}${namespace}`);
                this.socket.on(eventName, () => {
                    this.props.router
                        .replace(this.props.router.pathname, this.props.router.asPath, {
                            scroll: false
                        })
                        .catch((error) => {
                            console.error(`withHotContentReload failed to replace path, error: ${error.message}`);
                        });
                });
                this.socket.on('connect', () => {
                    this.socket.emit('hello');
                });
            }

            componentWillUnmount() {
                if (this.socket) {
                    this.socket.close();
                }
            }

            render() {
                return React.createElement(WrappedComponent, this.props, null);
            }
        }

        function getDisplayName(WrappedComponent) {
            return WrappedComponent.displayName || WrappedComponent.name || 'Component';
        }

        Component.displayName = `WithHotContentReload(${getDisplayName(WrappedComponent)})`;

        return withRouter(Component);
    };
};

function prefixPort(port) {
    return port ? `:${port}` : '';
}
