const React = require('react');
const { withRouter } = require('next/router');
const io = require('socket.io-client');
const { DEFAULT_LIVE_UPDATE_PORT, LIVE_UPDATE_EVENT_NAME, LIVE_UPDATE_NAMESPACE } = require('./lib/consts');

module.exports.withRemoteDataUpdates = function withRemoteDataUpdates(WrappedComponent) {
    class Component extends React.Component {
        componentDidMount() {
            if (!this.props.liveUpdate) {
                return;
            }
            // console.log('withSSGPage componentDidMount', this.props);
            const liveUpdatePort =
                typeof this.props.liveUpdatePort !== 'undefined' ? this.props.liveUpdatePort || location.port : DEFAULT_LIVE_UPDATE_PORT;
            const eventName = this.props.liveUpdateEventName || LIVE_UPDATE_EVENT_NAME;
            const namespace = this.props.liveUpdateNamespace || LIVE_UPDATE_NAMESPACE;

            this.socket = io(`${location.protocol}//${location.hostname}${prefixPort(liveUpdatePort)}${namespace}`);
            this.socket.on(eventName, () => {
                this.props.router.replace(this.props.router.pathname, this.props.router.asPath, {
                    scroll: false
                });
            });
            this.socket.on('connect', () => {
                this.socket.emit('hello');
            });
        }

        componentWillUnmount() {
            if (!this.props.liveUpdate) {
                return;
            }
            // console.log('withSSGPage componentWillUnmount');
            if (this.socket) {
                this.socket.close();
            }
        }

        render() {
            // console.log('withSSGPage render', this.props);
            return React.createElement(WrappedComponent, this.props, null);
            // return <WrappedComponent {...this.props} />;
        }
    }

    function getDisplayName(WrappedComponent) {
        return WrappedComponent.displayName || WrappedComponent.name || 'Component';
    }

    Component.displayName = `WithRemoteDataUpdates(${getDisplayName(WrappedComponent)})`;

    return withRouter(Component);
};

function prefixPort(port) {
    return port ? `:${port}` : '';
}
