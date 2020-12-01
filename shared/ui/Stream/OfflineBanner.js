import React, { PureComponent } from "react";
import { connect } from "react-redux";
import { FormattedMessage } from "react-intl";

class OfflineBanner extends PureComponent {
	render() {
		if (this.props.isOffline)
			return (
				<div className="banner">
					<div className="error-banner">
						<div className="content">
							<FormattedMessage
								id="offlineBanner.offline.main"
								defaultMessage="We’re having problems connecting to CodeStream. Hold tight, we’ll keep trying..."
							/>
						</div>
					</div>
				</div>
			);
		else return null;
	}
}

const mapStateToProps = ({ connectivity }) => ({
	isOffline: connectivity.offline
});
export default connect(mapStateToProps)(OfflineBanner);
