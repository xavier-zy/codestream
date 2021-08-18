import React, { useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../../store";
import { HostApi } from "../../webview-api";
import { Button } from "../../src/components/Button";
import {
	AddNewRelicIncludeRequestType,
	AddNewRelicIncludeResponse,
	CreateNewRelicConfigFileRequestType,
	CreateNewRelicConfigFileResponse,
	FindCandidateMainFilesRequestType,
	FindCandidateMainFilesResponse,
	InstallNewRelicRequestType,
	InstallNewRelicResponse
} from "../../protocols/agent/agent.protocol.nr";
import { logError } from "../../logger";
import { FormattedMessage } from "react-intl";
import { Link } from "../Link";
import { TextInput } from "../../Authentication/TextInput";
import { Dialog } from "../../src/components/Dialog";
import { closeModal } from "../actions";
import { useEffect } from "react";
import { InlineMenu } from "../../src/components/controls/InlineMenu";
import * as path from "path-browserify";
import { Position, Range } from "vscode-languageserver-types";
import { highlightRange } from "../api-functions";
import { RepoProjectType } from "../../protocols/agent/agent.protocol.scm";

const isNotEmpty = s => s.length > 0;

export const AddNewRelicNodeJS = props => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { repoId, path } = state.context.wantNewRelicOptions || {};
		const repo = repoId ? state.repos[repoId] : undefined;
		return { repo, repoPath: path };
	});

	const [licenseKey, setLicenseKey] = useState("");
	const [appName, setAppName] = useState("");
	const [files, setFiles] = useState<string[]>([]);
	const [selectedFile, setSelectedFile] = useState("");
	const [installingLibrary, setInstallingLibrary] = useState(false);
	const [creatingConfig, setCreatingConfig] = useState(false);
	const [insertingRequire, setInsertingRequire] = useState(false);
	const [loading, setLoading] = useState(false);
	const [unexpectedError, setUnexpectedError] = useState(false);
	const [step, setStep] = useState(1);

	const { repo, repoPath } = derivedState;

	useEffect(() => {
		(async () => {
			const response = (await HostApi.instance.send(FindCandidateMainFilesRequestType, {
				type: RepoProjectType.NodeJS,
				path: repoPath!
			})) as FindCandidateMainFilesResponse;
			if (!response.error) {
				setFiles(response.files);
			}
		})();
	}, ["repoPath"]);

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
			dispatch(closeModal());
		} catch (error) {
			logError(`Unexpected error during New Relic installation: ${error}`);
			setUnexpectedError(true);
		}
		// @ts-ignore
		setLoading(false);
	};

	const onSetLicenseKey = useCallback(
		key => {
			setLicenseKey(key);
			if (key) {
				setUnexpectedError(false);
				setStep(2);
			} else {
				setStep(1);
			}
		},
		["key"]
	);

	const onSetAppName = useCallback(
		name => {
			setAppName(name);
			if (name) {
				setUnexpectedError(false);
				setStep(3);
			} else {
				setStep(2);
			}
		},
		["appName"]
	);

	const onInstallLibrary = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		setInstallingLibrary(true);
		const response = (await HostApi.instance.send(InstallNewRelicRequestType, {
			type: RepoProjectType.NodeJS,
			cwd: repoPath!
		})) as InstallNewRelicResponse;
		if (response.error) {
			logError(`Unable to install New Relic module: ${response.error}`);
			setUnexpectedError(true);
		} else {
			setUnexpectedError(false);
			setStep(4);
		}
		setInstallingLibrary(false);
	};

	const onCreateConfigFile = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		setCreatingConfig(true);
		const response = (await HostApi.instance.send(CreateNewRelicConfigFileRequestType, {
			type: RepoProjectType.NodeJS,
			filePath: repoPath!,
			appName,
			licenseKey
		})) as CreateNewRelicConfigFileResponse;
		if (response.error) {
			logError(`Unable to create New Relic config file: ${response.error}`);
			setUnexpectedError(true);
		} else {
			setUnexpectedError(false);
			setStep(5);
		}
		setCreatingConfig(false);
	};

	const onRequireNewRelic = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		setInsertingRequire(true);
		const response = (await HostApi.instance.send(AddNewRelicIncludeRequestType, {
			type: RepoProjectType.NodeJS,
			file: selectedFile,
			dir: repoPath!
		})) as AddNewRelicIncludeResponse;
		if (response.error) {
			logError(`Unable to add New Relic include to ${selectedFile}: ${response.error}`);
			setUnexpectedError(true);
		} else {
			setUnexpectedError(false);
			setStep(6);
		}
		setInsertingRequire(false);

		const start = Position.create(0, 0);
		const end = Position.create(0, 10000);
		const range = Range.create(start, end);
		const includeFile = path.join(repoPath!, selectedFile);
		highlightRange({
			uri: `file://${includeFile}`,
			range,
			highlight: true
		});
	};

	const fileItems = files.map((file, i) => {
		return {
			key: file,
			label: file,
			checked: selectedFile === file,
			default: i === 0,
			action: () => setSelectedFile(file)
		};
	});

	return (
		<Dialog title="Add New Relic" onClose={() => dispatch(closeModal())}>
			<div>
				We've noticed you're a New Relic user and that your Node JS project <b>{repo!.name}</b> is
				not yet instrumented.
				<br />
				We can make that real easy for you! Just go through these steps to install the New Relic APM
				module:
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
							{step > 0 && (
								<div>
									<br />
									{step > 1 && <span className="checkmark">✔&nbsp;</span>}
									<label>
										Paste your{" "}
										<Link href="https://docs.newrelic.com/docs/accounts/accounts-billing/account-setup/new-relic-license-key/">
											New Relic license key
										</Link>
										:
									</label>
									<TextInput
										name="licenseKey"
										value={licenseKey}
										autoFocus
										onChange={onSetLicenseKey}
									/>
								</div>
							)}
							{step > 1 && (
								<div>
									<br />
									{step > 2 && <span className="checkmark">✔&nbsp;</span>}
									<label>Type a name for your application:</label>
									<TextInput name="appName" value={appName} onChange={onSetAppName} />
								</div>
							)}
							{step > 2 && (
								<div>
									<br />
									<label>
										{step > 3 && <span className="checkmark">✔&nbsp;</span>}
										Click below to install the New Relic node module in your repo (will run{" "}
										<b>npm install --save newrelic</b>):
									</label>
									<Button onClick={onInstallLibrary} isLoading={installingLibrary}>
										Install
									</Button>
								</div>
							)}
							{step > 3 && (
								<div>
									<br />
									<label>
										{step > 4 && <span className="checkmark">✔&nbsp;</span>}
										Create a custom configuration file in <b>{repoPath}</b>
									</label>
									<Button onClick={onCreateConfigFile} isLoading={creatingConfig}>
										Create
									</Button>
								</div>
							)}
							{step > 4 && (
								<div>
									<br />
									<label>
										{step > 5 && <span className="checkmark">✔&nbsp;</span>}
										Add a 'require("newrelic")' to{" "}
									</label>
									<InlineMenu
										key="team-display-options"
										className="subtle no-padding"
										items={fileItems}
									></InlineMenu>
									<Button onClick={onRequireNewRelic} isLoading={insertingRequire}>
										Add to File
									</Button>
								</div>
							)}
							{step > 5 && (
								<div>
									<br />
									<div>Congratulations! You've installed New Relic for Node JS!</div>
									<br />
									<Button onClick={onSubmit}>OK</Button>
								</div>
							)}
						</div>
					</div>
				</fieldset>
			</form>
		</Dialog>
	);
};
