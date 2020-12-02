import React from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { isConnected } from "../store/providers/reducer";
import { CodeStreamState } from "../store";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import Button from "../Stream/Button";
import { configureAndConnectProvider, disconnectProvider } from "../store/providers/actions";

const Root = styled.div`
	position: absolute;
	bottom: 0;
	padding: 0;
	width: 100%;
	z-index: 56;
	display: flex;
	flex-direction: column;
	justify-content: center;
	background-color: @text-color-warning;
	text-align: center;
	font-size: 12px;
	color: @app-background-color;
	color: white;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
`;

export const PRProviderErrorBanner = () => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers, connectivity, capabilities } = state;
		const codeHostProviders = Object.keys(providers)
			.filter(id =>
				[
					"github",
					"github_enterprise",
					"bitbucket",
					"bitbucket_server",
					"gitlab",
					"gitlab_enterprise"
				].includes(providers[id].name)
			);

		// look for any code host providers that are technically connected (we have an access token for them),
		// but the access token has been shown (by requests to the provider) to be invalid
		const tokenError: { accessTokenError?: any } = { };
		const failedProviderId = codeHostProviders.find(id => {
			return isConnected(state, { id }, undefined, tokenError) && tokenError.accessTokenError;
		});

		return {
			supportsReauth: capabilities.providerReauth,
			offline: connectivity.offline,
			failedProvider: failedProviderId ? providers[failedProviderId] : null,
			tokenError: tokenError.accessTokenError
		};
	});
	
	const onClickReauthorize = async event => {
		event.preventDefault();
		await dispatch(disconnectProvider(derivedState.failedProvider!.id, "Provider Error Banner"));
		dispatch(configureAndConnectProvider(derivedState.failedProvider!.id, "Provider Error Banner", true));
	};

	const onClickIgnore = event => {
		event.preventDefault();
		dispatch(disconnectProvider(derivedState.failedProvider!.id, "Provider Error Banner"));
	};

	if (derivedState.supportsReauth && !derivedState.offline && derivedState.failedProvider) {
		const { name } = derivedState.failedProvider; 
		const displayName = PROVIDER_MAPPINGS[name].displayName;
		return (
			<Root>
				<div className="banner provider-error-banner" >
					<div className="error-banner provider-error-banner">
						<div className="content">
							<p>
								Your access to {displayName} doesn't appear to be working.
							</p>
							<Button
								className="control-button"
								type="button"
								onClick={onClickReauthorize}
								style={{ "background-color": "#b55e08", width: "10em", margin: "5px 10px 5px 10px" }}
							>
								<b>Reauthorize</b>
							</Button>
							<Button
								className="control-button"
								type="button"
								onClick={onClickIgnore}
								style={{ "background-color": "#b55e08", width: "10em", margin: "5px 10px 5px 10px" }}
							>
								<b>Ignore</b>
							</Button>
							<p>
								If you continue to experience problems with your {displayName} integration, please contact <a href="mailto:support@codestream.com">customer support</a>.
							</p>
						</div>
					</div>
				</div>
			</Root>
		);
	} else {
		return "";
	}
};

