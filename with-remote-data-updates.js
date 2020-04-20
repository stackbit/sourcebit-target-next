const React = require('react');
const { withRouter } = require('next/router');


module.exports.withRemoteDataUpdates = function withRemoteDataUpdates(WrappedComponent) {

    class Component extends React.Component {

        componentDidMount() {
            if (!this.props.liveUpdate) {
                return;
            }
            // console.log('withSSGPage componentDidMount', this.props);
            const wsPort = this.props.liveUpdateWsPort;
            const eventName = this.props.liveUpdateEventName;
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.ws = new WebSocket(protocol + '//' + location.hostname + ':' + wsPort + '/nextjs-live-updates');
            this.ws.addEventListener('open', (event) => {
                // console.log('initial-props websocket opened');
            });
            this.ws.addEventListener('message', (event) => {
                // console.log('initial-props websocket received message:', event);
                if (event.data === eventName) {
                    this.props.router.replace(this.props.router.pathname, this.props.router.asPath);
                } else if (event.data === 'hello') {
                    this.ws.send('hello');
                }
            });
            this.ws.addEventListener('close', (event) => {
                // console.log('initial-props websocket closed', event);
            });
            this.ws.addEventListener('error', (event) => {
                // console.log('initial-props websocket received an error', event);
            });
        }

        componentWillUnmount() {
            if (!this.props.liveUpdate) {
                return;
            }
            // console.log('withSSGPage componentWillUnmount');
            if (this.ws) {
                this.ws.close();
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
