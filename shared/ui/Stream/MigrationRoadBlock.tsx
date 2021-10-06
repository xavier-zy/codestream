import React from "react";
import { HostApi } from "../webview-api";
import { useDidMount } from "../utilities/hooks";
import { GetMeRequestType } from "@codestream/protocols/agent";

export interface Props {
	migration: { requiresRestart?: boolean; migrating?: boolean };
}

export const MigrationRoadBlock = (props: Props) => {
	useDidMount(() => {
		let interval;
		if (props.migration?.migrating) {
			interval = setInterval(async () => {
				try {
					// we want to hit the server here on purpose -- ignore the cache
					void (await HostApi.instance.send(GetMeRequestType, {
						ignoreCache: true
					}));
				} catch (ex) {
					console.error("migration: poll failed", { error: ex });
				}
			}, 1000);
		}

		return () => {
			if (interval) {
				clearInterval(interval);
			}
		};
	});

	return (
		<div className="onboarding-page">
			<form className="standard-form">
				<fieldset className="form-body">
					<div>
						<h3>Hold tight while we update your CodeStream experience!</h3>
						<br />
						<small>(This screen will automatically update when complete)</small>
					</div>
				</fieldset>
			</form>
		</div>
	);
};
