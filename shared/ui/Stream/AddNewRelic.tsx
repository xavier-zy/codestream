import React, { useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import CancelButton from "./CancelButton";
import { CodeStreamState } from "../store";
import { HostApi } from "../webview-api";
import { Button } from "../src/components/Button";
import styled from "styled-components";
import { ButtonRow } from "./ChangeUsername";
import { UpdateUserRequestType } from "../protocols/agent/agent.protocol.users";
import { logError } from "../logger";
import { FormattedMessage } from "react-intl";
import { CSMe } from "@codestream/protocols/api";
import cx from "classnames";
import { Link } from "./Link";
import { TextInput } from "../Authentication/TextInput";
import { CSText } from "../src/components/CSText";
import { Dialog } from "../src/components/Dialog";
import { closeModal } from "./actions";
import { useEffect } from "react";

const isNotEmpty = s => s.length > 0;

export const AddNewRelic = props => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { repoId, path } = state.context.wantNewRelicOptions || {};
		console.warn("COLIN: repoId=" + repoId);
		const repo = repoId ? state.repos[repoId] : undefined;
		console.warn("COLIN: repo:", repo);
		return { repo, path };
	});

	const [appName, setAppName] = useState("");
	const [loading, setLoading] = useState(false);
	const [unexpectedError, setUnexpectedError] = useState(false);

	const { repo, path } = derivedState;

	useEffect(() => {
		if (!repo) {
			// FIXME: what should we really do here?
			dispatch(closeModal());
		}
	}, ["repo"]);

	const onSubmit = async (event: React.SyntheticEvent) => {
		setUnexpectedError(false);
		event.preventDefault();

		setLoading(true);
		try {
			/*
			await HostApi.instance.send(UpdateUserRequestType, { phoneNumber });
			HostApi.instance.track("fullName Changed", {});
			*/
			dispatch(closeModal());
		} catch (error) {
			logError(`Unexpected error during New Relic installation: ${error}`);
			setUnexpectedError(true);
		}
		// @ts-ignore
		setLoading(false);
	};

	const onInstallLibrary = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		console.warn("COLIN: INSTALL THE LIBRARY!!!");
	};

	const onDownloadConfigFile = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		console.warn("COLIN: DOWNLOAD THE CONFIG FILE!!!");
	};

	const onRequireNewRelic = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		console.warn("COLIN: ADD THE REQUIRE!!!");
	};

	return (
		<Dialog title="Add New Relic" onClose={() => dispatch(closeModal())}>
			<div>
				We've noticed you're a New Relic user and that your Node JS project <b>{repo!.name}</b> is
				not yet instrumented.
				<br />
				We can make that real easy for you! Just click through these steps to install the New Relic
				APM module:
			</div>
			<form className="standard-form">
				<fieldset className="form-body" style={{ width: "18em" }}>
					<div id="controls">
						<div className="small-spacer" />
						{unexpectedError && (
							<div className="error-message form-error">
								<FormattedMessage
									id="error.unexpected"
									defaultMessage="Something went wrong! Please try again, or "
								/>
								<FormattedMessage id="contactSupport" defaultMessage="contact support">
									{text => <Link href="https://help.codestream.com">{text}</Link>}
								</FormattedMessage>
								.
							</div>
						)}
						<div className="control-group">
							<label>Type a name for your application:</label>
							<br />
							<TextInput name="appName" value={appName} autoFocus onChange={setAppName} />
							<br />
							<label>
								Click below to install the New Relic node module in your repo (will run{" "}
								<b>npm install --save newrelic</b>):
							</label>
							<Button onClick={onInstallLibrary}>Install</Button>
							<br />
							<br />
							<label>
								Download a custom configuration file to <b>{path}</b>
							</label>
							<Button onClick={onDownloadConfigFile}>Download</Button>
							<br />
							<br />
							<label>Add a 'require("newrelic")' to {repo!.name}</label>
							<Button onClick={onRequireNewRelic}>Add to File</Button>
							<br />
						</div>
					</div>
				</fieldset>
			</form>
		</Dialog>
	);
};
