const React = require('react');
const { withRouter } = require('next/router');
const io = require('socket.io-client');

module.exports.withRemoteDataUpdates = function withRemoteDataUpdates(WrappedComponent) {
    class Component extends React.Component {
        componentDidMount() {
            if (!this.props.liveUpdate) {
                return;
            }
            // console.log('withSSGPage componentDidMount', this.props);
            const liveUpdatePort = this.props.liveUpdatePort || location.port;
            const port = liveUpdatePort ? ':' + liveUpdatePort : '';
            const eventName = this.props.liveUpdateEventName;

            this.socket = io(`${location.protocol}//${location.hostname + port}/nextjs-live-updates`);
            this.socket.on(eventName, () => {
                this.props.router.replace(this.props.router.pathname, this.props.router.asPath);
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
